// Service worker setup
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Create window and document polyfills for the service worker environment
// This allows the background scripts that expect a window object to run
if (typeof window === 'undefined') {
  self.window = self;

  // Create basic document polyfill
  self.document = {
    createElement: function() {
      return {
        style: {},
        setAttribute: function() {},
        getElementsByTagName: function() { return []; },
        querySelectorAll: function() { return []; }
      };
    },
    addEventListener: function() {},
    elementForOPID: function() { return null; },
    querySelectorAll: function() { return []; }
  };

  // Add navigator polyfill
  if (typeof navigator === 'undefined') {
    self.navigator = {
      userAgent: self.navigator ? self.navigator.userAgent : 'Chrome',
      platform: 'Unknown'
    };
  }

  // Add API polyfills for Manifest V3 compatibility
  if (typeof chrome !== 'undefined') {
    // Create a contextMenus polyfill to handle Manifest V3 requirements
    if (chrome.contextMenus) {
      // Store the original create method
      const originalCreate = chrome.contextMenus.create;

      // Store click handlers by menu item ID
      const clickHandlers = {};

      // Set up the onClicked listener if it doesn't exist
      if (!chrome.contextMenus._hasSetupOnClickedListener) {
        chrome.contextMenus.onClicked.addListener((info, tab) => {
          const handler = clickHandlers[info.menuItemId];
          if (handler && typeof handler === 'function') {
            handler(info, tab);
          }
        });
        chrome.contextMenus._hasSetupOnClickedListener = true;
      }

      // Replace with one that handles both ID and onclick requirements
      chrome.contextMenus.create = function(createProperties, callback) {
        // Add an ID if one isn't provided
        if (!createProperties.id) {
          createProperties.id = 'onepassword_' + Date.now();
        }

        // If there's an onclick handler, store it and remove from properties
        if (createProperties.onclick && typeof createProperties.onclick === 'function') {
          // Store the handler with the ID
          clickHandlers[createProperties.id] = createProperties.onclick;

          // Remove the onclick property to avoid the error
          const onclickHandler = createProperties.onclick;
          delete createProperties.onclick;
        }

        // Call the original method with the modified properties
        return originalCreate.call(chrome.contextMenus, createProperties, callback);
      };
    }

    // Create a browserAction polyfill that redirects to action in MV3
    if (!chrome.browserAction) {
      chrome.browserAction = {
        // Map browserAction.onClicked to action.onClicked
        onClicked: chrome.action ? chrome.action.onClicked : {
          addListener: function(callback) {
            // Use action API instead
            if (chrome.action && chrome.action.onClicked) {
              chrome.action.onClicked.addListener(callback);
            }
          }
        },

        // Add enable/disable methods that map to the new action API
        enable: function(tabId) {
          if (chrome.action && chrome.action.enable) {
            if (tabId !== undefined) {
              chrome.action.enable(tabId);
            } else {
              chrome.action.enable();
            }
          }
        },

        disable: function(tabId) {
          if (chrome.action && chrome.action.disable) {
            if (tabId !== undefined) {
              chrome.action.disable(tabId);
            } else {
              chrome.action.disable();
            }
          }
        },

        // Add other commonly used browserAction methods
        setIcon: function(details) {
          if (chrome.action && chrome.action.setIcon) {
            chrome.action.setIcon(details);
          }
        },

        setTitle: function(details) {
          if (chrome.action && chrome.action.setTitle) {
            chrome.action.setTitle(details);
          }
        },

        setBadgeText: function(details) {
          if (chrome.action && chrome.action.setBadgeText) {
            chrome.action.setBadgeText(details);
          }
        },

        setBadgeBackgroundColor: function(details) {
          if (chrome.action && chrome.action.setBadgeBackgroundColor) {
            chrome.action.setBadgeBackgroundColor(details);
          }
        }
      };
    }

    // Create a webRequest polyfill using declarativeNetRequest
    if (!chrome.webRequest) {
      chrome.webRequest = {
        onBeforeRequest: {
          addListener: function(callback, filter, opt) {
            console.log('webRequest.onBeforeRequest is not supported in Manifest V3');
            console.log('Using declarativeNetRequest instead for URL filters:', filter.urls);

            // Register rules to handle onepasswdfill parameter
            if (filter.urls.includes('*://*/*onepasswdfill=*')) {
              // Set up redirect detection via declarativeNetRequest
              chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [1], // Remove existing rule if any
                addRules: [{
                  id: 1,
                  priority: 1,
                  action: {
                    type: "redirect",
                    redirect: { transform: { queryTransform: { addOrReplaceParams: [] } } }
                  },
                  condition: {
                    urlFilter: "onepasswdfill=",
                    resourceTypes: ["main_frame"]
                  }
                }]
              });

              // Listen for tab updates to handle the parameter
              chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
                if (changeInfo.url && changeInfo.url.includes('onepasswdfill=')) {
                  const url = new URL(changeInfo.url);
                  const redirectResult = { redirectUrl: url.toString() };
                  // Try to call the original callback with simulated parameters
                  try {
                    callback({
                      tabId: tabId,
                      url: changeInfo.url,
                      type: 'main_frame'
                    });
                  } catch (e) {
                    console.error("Error calling webRequest callback:", e);
                  }
                }
              });
            }
          }
        },
        onCompleted: {
          addListener: function(callback, filter) {
            console.log('webRequest.onCompleted is not supported in Manifest V3');
            // We can't fully replicate this in MV3, but can do basic tab monitoring
            chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
              if (changeInfo.status === 'complete') {
                try {
                  callback({
                    tabId: tabId,
                    url: tab.url,
                    type: 'main_frame'
                  });
                } catch (e) {
                  console.error("Error calling webRequest.onCompleted callback:", e);
                }
              }
            });
          }
        }
      };
    }
  }
}

// Now load the scripts
try {
  // Add some extra error prevention
  const originalConsole = console;

  // Load the scripts one by one to ensure each one gets a separate try/catch
  try {
    self.importScripts('ext/sjcl.js');
    originalConsole.log('Successfully loaded sjcl.js');
  } catch (sjclError) {
    originalConsole.error('Error loading sjcl.js:', sjclError);
  }

  try {
    self.importScripts('global.min.js');
    originalConsole.log('Successfully loaded global.min.js');
  } catch (globalError) {
    originalConsole.error('Error loading global.min.js:', globalError);

    // If there's an error, add a shim for key functions to prevent extension crashes
    if (typeof z === 'undefined') {
      self.z = {
        setToolbarButtonEnabled: function() {
          originalConsole.log('Called setToolbarButtonEnabled (shim)');
        },
        da: function() {
          originalConsole.log('Called da function (shim)');
        },
        pb: function() {
          return null;
        },
        ab: function() {
          originalConsole.log('Called ab function (shim)');
        }
      };
    }
  }
} catch (error) {
  console.error('General error during script loading:', error);
}

// Helper function to get current tab URL (the F function in global.min.js)
function getCurrentTabUrl(callback) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].url) {
      callback(tabs[0].url);
    } else {
      callback('');
    }
  });
}

// Make this helper available for the global.min.js script
self.F = getCurrentTabUrl;

// Set up message listeners for communication between content scripts and service worker
self.addEventListener('message', (event) => {
  // Handle messages from content scripts
});

// In Manifest V3, webRequest blocking API is replaced with declarativeNetRequest
// If the extension was using webRequestBlocking for request modification,
// the logic would need to be reimplemented using declarativeNetRequest rules here

// Initialize chrome API listeners that were previously in the background script
// Make sure the extension properly initializes when the service worker starts
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started up");
});

// Also initialize on install
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed or updated", details);

  // Clean up context menus and recreate them to ensure they work properly in MV3
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll();
  }
});
