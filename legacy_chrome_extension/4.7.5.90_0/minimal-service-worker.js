// This is a minimal service worker for the 1Password extension
// It provides basic functionality without depending on legacy scripts

// Basic service worker lifecycle events
self.addEventListener('install', (event) => {
  console.log('1Password Minimal Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('1Password Minimal Service Worker activating...');
  event.waitUntil(clients.claim());
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in minimal service worker:', message);

  // Just pass the message through or respond with an acknowledgment
  if (message.action && typeof message.action === 'string') {
    console.log(`Processing action: ${message.action}`);

    // Basic responses to common actions
    switch (message.action.toLowerCase()) {
      case 'getversion':
        sendResponse({ version: '4.7.5.90', migrated: true });
        break;

      case 'ping':
        sendResponse({ status: 'ok', timestamp: Date.now() });
        break;

      default:
        // Forward to appropriate handler or respond with not implemented
        sendResponse({ status: 'not_implemented', action: message.action });
    }
  }

  return true; // Keep messaging channel open for async responses
});

// Additional essential functionality can be added here
console.log('1Password Minimal Service Worker initialized');
