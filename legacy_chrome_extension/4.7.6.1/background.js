// Manifest V3 compatibility entry point for the classic extension.
// Keep listener registration synchronous: Chrome may recreate this worker at any time.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// The legacy bundle was compiled for a background page. It only needs a small
// subset of window/document while running in the extension background context.
self.window = self;
self.document = {
  createElement() {
    return {
      style: {},
      setAttribute() {},
      getElementsByTagName() { return []; },
      querySelectorAll() { return []; }
    };
  },
  addEventListener() {},
  elementForOPID() { return null; },
  querySelectorAll() { return []; }
};

// Pairing material must not be readable from content-script contexts.
if (chrome.storage.local.setAccessLevel) {
  chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}).catch((error) => {
    console.error('[1Password] Failed to restrict local storage access:', error);
  });
}

// MV2 browserAction compatibility. New code should use chrome.action directly.
if (!chrome.browserAction) {
  chrome.browserAction = {
    onClicked: chrome.action.onClicked,
    enable: (tabId) => tabId === undefined ? chrome.action.enable() : chrome.action.enable(tabId),
    disable: (tabId) => tabId === undefined ? chrome.action.disable() : chrome.action.disable(tabId),
    setIcon: (details) => chrome.action.setIcon(details),
    setTitle: (details) => chrome.action.setTitle(details),
    setBadgeText: (details) => chrome.action.setBadgeText(details),
    setBadgeBackgroundColor: (details) => chrome.action.setBadgeBackgroundColor(details)
  };
}

// Service workers do not support an onclick property in contextMenus.create().
// Use one stable ID and a top-level event listener so it survives worker restarts.
const contextMenuHandlers = new Map();
const originalContextMenuCreate = chrome.contextMenus.create.bind(chrome.contextMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const handler = contextMenuHandlers.get(String(info.menuItemId));
  if (handler) handler(info, tab);
});

chrome.contextMenus.create = (properties, callback) => {
  const normalized = {...properties};
  normalized.id = String(normalized.id || 'onepassword-classic-context-menu');
  if (typeof normalized.onclick === 'function') {
    contextMenuHandlers.set(normalized.id, normalized.onclick);
    delete normalized.onclick;
  }

  return originalContextMenuCreate(normalized, () => {
    const error = chrome.runtime.lastError;
    if (error && !error.message.includes('duplicate id')) {
      console.error('[1Password] Failed to create context menu:', error.message);
    }
    if (callback) callback();
  });
};

// MV3 cannot perform a blocking webRequest redirect. The legacy Go & Fill URL
// is handled from tabs.onUpdated instead: parse/track it with the original
// callback, then navigate to the sanitized URL returned by that callback.
const beforeRequestListeners = [];
const completedRequestListeners = [];

chrome.webRequest = {
  onBeforeRequest: {
    addListener(callback, filter) {
      beforeRequestListeners.push({callback, filter});
    }
  },
  onCompleted: {
    addListener(callback, filter) {
      completedRequestListeners.push({callback, filter});
    }
  }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes('onepasswdfill=')) {
    for (const {callback} of beforeRequestListeners) {
      try {
        const result = callback({tabId, url: changeInfo.url, type: 'main_frame'});
        if (result && result.redirectUrl && result.redirectUrl !== changeInfo.url) {
          chrome.tabs.update(tabId, {url: result.redirectUrl});
          break;
        }
      } catch (error) {
        console.error('[1Password] Go & Fill navigation failed:', error);
      }
    }
  }

  if (changeInfo.status === 'complete') {
    for (const {callback} of completedRequestListeners) {
      try {
        callback({tabId, url: tab.url, type: 'main_frame'});
      } catch (error) {
        console.error('[1Password] Navigation completion handler failed:', error);
      }
    }
  }
});

// The legacy bundle supplies empty callbacks to tabs.sendMessage(). Chrome logs
// an "Unchecked runtime.lastError" warning unless the callback reads lastError
// when a tab has no content script (for example chrome:// or a pre-reload tab).
const originalTabsSendMessage = chrome.tabs.sendMessage.bind(chrome.tabs);
chrome.tabs.sendMessage = (...args) => {
  const callbackIndex = args.length - 1;
  if (typeof args[callbackIndex] === 'function') {
    const callback = args[callbackIndex];
    args[callbackIndex] = (...callbackArgs) => {
      void chrome.runtime.lastError;
      return callback(...callbackArgs);
    };
  }
  return originalTabsSendMessage(...args);
};

self.F = (callback) => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    callback(tabs && tabs[0] && tabs[0].url ? tabs[0].url : '');
  });
};

// Fail closed. A toolbar that appears usable while the core failed to load is
// more dangerous than an explicit worker initialization error.
importScripts('ext/sjcl.js');
importScripts('global.min.js');

console.info('[1Password] Classic MV3 service worker initialized.');
