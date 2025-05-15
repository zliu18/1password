// Window shim for service worker environment
// This creates mock objects for window, document, and other browser APIs
// that don't exist in service workers but may be needed by legacy scripts

console.log('Loading window shim for service worker...');

// Create a minimal window object
self.window = self;

// Add common window properties and methods that scripts might use
self.window.location = new URL(self.location.href);

// Document shim
self.document = {
  createElement: (tagName) => {
    return {
      tagName: tagName,
      style: {},
      setAttribute: () => {},
      appendChild: () => {},
      getElementsByTagName: () => { return []; }
    };
  },
  getElementById: () => null,
  getElementsByTagName: () => [],
  getElementsByClassName: () => [],
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: { style: {} },
  head: { appendChild: () => {} },
  body: { appendChild: () => {} }
};

// localStorage shim using chrome storage
self.localStorage = {
  getItem: (key) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] || null);
      });
    });
  },
  setItem: (key, value) => {
    const data = {};
    data[key] = value;
    return chrome.storage.local.set(data);
  },
  removeItem: (key) => {
    return chrome.storage.local.remove(key);
  },
  clear: () => {
    return chrome.storage.local.clear();
  }
};

// Add navigator object
self.navigator = {
  ...self.navigator,
  userAgent: 'ChromeExtensionServiceWorker'
};

console.log('Window shim loaded successfully');
