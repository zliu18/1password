// This is a loader script for the service worker
// It avoids using import/export syntax which may not work with older scripts

// Load the window shim first to provide DOM-like objects required by the scripts
self.importScripts('window-shim.js');

// Load globals adapter
self.importScripts('globals-adapter.js');

// Now load the background scripts with error handling
console.log('Loading background scripts in service worker environment...');
try {
  self.importScripts('ext/sjcl.js');
  console.log('Successfully loaded sjcl.js');
} catch (e) {
  console.error('Failed to load sjcl.js:', e);
}

try {
  // We'll try to load global.min.js, but it might need DOM APIs
  self.importScripts('global.min.js');
  console.log('Successfully loaded global.min.js');
} catch (e) {
  console.error('Failed to load global.min.js:', e.toString());
  console.error('Error stack:', e.stack);
}

// Setup basic lifecycle events
self.addEventListener('install', (event) => {
  console.log('1Password Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('1Password Service Worker activating...');
  event.waitUntil(clients.claim());
});

// Listen for messages
self.addEventListener('message', (event) => {
  console.log('Message received in service worker:', event.data);
  // Handle message
});

// Setup message handling for content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Runtime message in service worker:', message);
  // Process message and respond
  return true; // Keep channel open for async response
});
