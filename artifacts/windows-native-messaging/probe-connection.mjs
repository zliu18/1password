// Read only connection flags from the isolated extension worker.
// Never enable Runtime/Network logging or query storage, keys, tabs, or payloads.
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const profile = process.argv[2];
const output = process.argv[3];
if (!profile) throw new Error('An isolated test profile path is required.');
const extensionId = 'phicbbndgmmpogmijjkbmdhpioaieaha';
const port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CDP port.');
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const worker = targets.find(t => t.type === 'service_worker' &&
  t.url === `chrome-extension://${extensionId}/background.js`);
let result = {timestampUTC: new Date().toISOString(), extensionId, workerPresent: Boolean(worker)};
if (worker) {
  const expression = `(() => {
    const agent = globalThis.Agent;
    const auth = globalThis.Authenticator;
    const connection = agent && agent.connection;
    const native = !!(connection && typeof globalThis.NativeMessagingConnection === 'function' &&
      connection instanceof globalThis.NativeMessagingConnection);
    return {
      connected: !!(agent && agent.isConnected()),
      authenticated: !!(auth && auth.isVerified()),
      nativeMessaging: native,
      readyToSend: !!(native && connection.s && connection.s.readyToSend)
    };
  })()`;
  const value = await new Promise((resolve, reject) => {
    const socket = new WebSocket(worker.webSocketDebuggerUrl);
    const timer = setTimeout(() => { socket.close(); reject(new Error('Status probe timed out.')); }, 10000);
    const finish = (error, value) => {
      clearTimeout(timer);
      socket.close();
      error ? reject(error) : resolve(value);
    };
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true}
    })));
    socket.addEventListener('error', () => finish(new Error('Status probe socket failed.')));
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      if (message.error || message.result?.exceptionDetails || !message.result?.result?.value) {
        finish(new Error('Status evaluation failed.'));
        return;
      }
      finish(null, message.result.result.value);
    });
  });
  // Select only the four expected booleans, even if the expression is changed.
  result = {...result,
    connected: value.connected === true,
    authenticated: value.authenticated === true,
    nativeMessaging: value.nativeMessaging === true,
    readyToSend: value.readyToSend === true
  };
}
const rendered = JSON.stringify(result, null, 2) + '\n';
if (output) await writeFile(output, rendered, 'utf8');
process.stdout.write(rendered);
