// src/contentScript/index.ts

/**
 * Injects a script from the extension's context into the web page's context.
 * This allows the injected script to interact with the window object of the page.
 * @param filePath - The path to the script file within the extension.
 * @param scriptId - A unique ID to assign to the injected script element.
 */
function injectScriptToPage(filePath: string, scriptId: string) {
  if (document.getElementById(scriptId)) {
    // Script already injected.
    return;
  }
  try {
    const script = document.createElement('script');
    script.id = scriptId;
    script.setAttribute('type', 'module');
    script.src = chrome.runtime.getURL(filePath); 
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
  }
}

injectScriptToPage('injected.js', 'kyoku-injected-script');

// Listen for the injected script's request for wallet details (name, version, icon).
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source === window && event.data && event.data.type === 'KYOKU_REQUEST_WALLET_DETAILS' && event.data.target === 'KYOKU_CONTENT_SCRIPT_INIT') {
    try {
        const manifest = chrome.runtime.getManifest();
        const iconURL = chrome.runtime.getURL('icons/icon128.png');

        window.postMessage({
          type: 'KYOKU_WALLET_DETAILS',        // Action for the injected script to listen for.
          target: 'KYOKU_INJECTED_SCRIPT',    // Target the injected script specifically.
          payload: {
            name: manifest.name || "Kyoku Wallet", // Fallback name.
            version: manifest.version,
            iconURL: iconURL,
          }
        }, window.location.origin);
    } catch (e) {
        // Send an error or default values if fetching manifest details fails.
        window.postMessage({
            type: 'KYOKU_WALLET_DETAILS',
            target: 'KYOKU_INJECTED_SCRIPT',
            payload: {
                name: "Kyoku Wallet",
                version: "0.0.0",
                iconURL: "", // Empty or a placeholder icon.
                error: "Could not load wallet details from manifest."
            }
        }, window.location.origin);
    }
  }
});


// Relay messages from the Injected Script (dApp requests) to the Background Script.
window.addEventListener('message', (event: MessageEvent) => {
  // Filter messages: must come from the window, have data, and target this content script.
  if (event.source !== window || !event.data || event.data.target !== 'KYOKU_CONTENT_SCRIPT') {
    return;
  }

  const { id, type, data } = event.data.payload; // Payload from injected script.

  chrome.runtime.sendMessage(
    { type, data, id, origin: event.origin }, // Message for background script.
    (response) => { // Callback with response from background script.
      if (chrome.runtime.lastError) {
        // Relay error back to injected script if communication with background fails.
        window.postMessage({
          target: 'KYOKU_INJECTED_SCRIPT',
          payload: { id, error: { message: chrome.runtime.lastError.message || 'Background communication error' } }
        }, event.origin);
        return;
      }
      // Relay successful response from background back to injected script.
      window.postMessage({
        target: 'KYOKU_INJECTED_SCRIPT',
        payload: { id, ...response } // Spread background's response (should include 'data' or 'error').
      }, event.origin);
    }
  );
});

// Relay messages from Background Script (broadcasts like 'connect' or 'disconnect') to Injected Script.
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  // Filter messages: ensure it's a broadcast targeted for the content script to relay.
  if (message.target === 'KYOKU_CONTENT_SCRIPT_BROADCAST') {
    window.postMessage({
      target: 'KYOKU_INJECTED_SCRIPT', // Target the injected script.
      payload: { eventName: message.eventName, eventData: message.eventData } // Structure for events.
    }, window.location.origin); // Or use '*' if origin isn't critical for broadcasts and might vary.
  }
  // `return true` is not needed if sendResponse is not called asynchronously in *this specific listener*.
  return false;
});