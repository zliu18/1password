// This file provides adapter functions and global variables needed
// by the extension when running in a service worker context

// Handle any specific initialization needed for global.min.js
// Detect any missing globals that might be referenced

// Common browser environment globals that scripts might use
self.chrome = chrome; // Ensure chrome is in global scope
self.browser = chrome; // For compatibility with browser APIs
self.addEventListener = self.addEventListener || function() {};
self.removeEventListener = self.removeEventListener || function() {};
self.setTimeout = self.setTimeout || function() {};
self.clearTimeout = self.clearTimeout || function() {};
self.setInterval = self.setInterval || function() {};
self.clearInterval = self.clearInterval || function() {};

// XMLHttpRequest shim for service worker environment
// Service workers use fetch() instead, so we need to adapt
self.XMLHttpRequest = class XMLHttpRequest {
  constructor() {
    this.headers = new Map();
    this.responseHeaders = new Map();
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.readyState = 0;
    this.onreadystatechange = null;
  }

  open(method, url, async = true) {
    this.method = method;
    this.url = url;
    this.async = async;
    this.readyState = 1;
    if (this.onreadystatechange) {
      this.onreadystatechange();
    }
  }

  setRequestHeader(name, value) {
    this.headers.set(name, value);
  }

  send(data) {
    const fetchOptions = {
      method: this.method,
      headers: Object.fromEntries(this.headers),
      body: data
    };

    fetch(this.url, fetchOptions)
      .then(response => {
        this.status = response.status;
        this.statusText = response.statusText;
        this.readyState = 2;
        if (this.onreadystatechange) {
          this.onreadystatechange();
        }
        return response.text();
      })
      .then(text => {
        this.responseText = text;
        this.readyState = 4;
        if (this.onreadystatechange) {
          this.onreadystatechange();
        }
      })
      .catch(error => {
        console.error('XHR error:', error);
        this.status = 0;
        this.statusText = error.message;
        this.readyState = 4;
        if (this.onreadystatechange) {
          this.onreadystatechange();
        }
      });
  }

  getResponseHeader(name) {
    return this.responseHeaders.get(name);
  }

  getAllResponseHeaders() {
    return Array.from(this.responseHeaders.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
  }
};

console.log('Globals adapter loaded successfully');
