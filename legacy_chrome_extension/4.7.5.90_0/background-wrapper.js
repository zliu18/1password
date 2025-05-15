// This file loads the original background scripts and sets up communication with the service worker
console.log('Background wrapper initializing...');

// Function to load scripts in sequence
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      console.log(`Loaded script: ${url}`);
      resolve();
    };
    script.onerror = (error) => {
      console.error(`Error loading script ${url}:`, error);
      reject(error);
    };
    document.head.appendChild(script);
  });
}

// Load the original background scripts
async function loadBackgroundScripts() {
  try {
    // Load SJCL first
    await loadScript('ext/sjcl.js');

    // Then load global.min.js
    await loadScript('global.min.js');

    console.log('All background scripts loaded');

    // Initialize any functionality from the original background scripts if needed
    if (typeof initializeBackgroundFunctionality === 'function') {
      initializeBackgroundFunctionality();
    }

    // Setup communication with service worker if needed
    setupServiceWorkerCommunication();
  } catch (error) {
    console.error('Failed to load background scripts:', error);
  }
}

// Setup communication with the service worker
function setupServiceWorkerCommunication() {
  // Listen for messages from content scripts and forward to the service worker if needed
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received in background wrapper:', message);

    // Process message and respond as needed
    // This will depend on your extension's specific requirements

    return true; // Keeps the message channel open for async responses
  });
}

// Start loading scripts
loadBackgroundScripts();
