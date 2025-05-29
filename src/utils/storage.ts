// src/utils/storage.ts

// Helper to check if the required Chrome storage API is available
const checkStorageAPI = (): void => {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    // This error will be thrown if the code attempts to run outside a compatible extension environment
    throw new Error('Chrome Storage API (chrome.storage.local) is not available in this environment.');
  }
};

/** Saves data securely to chrome.storage.local. */
export async function saveToStorage<T>(key: string, data: T): Promise<void> {
  checkStorageAPI(); // Ensure API exists before using it

  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [key]: data }, () => {
      // Check for errors reported by the Chrome API
      if (chrome.runtime.lastError) {
      //  console.error("Storage Save Error:", chrome.runtime.lastError);
        reject(new Error(`Failed to save data for key "${key}": ${chrome.runtime.lastError.message}`));
      } else {
        // Optional: log success for debugging if needed
        // console.log(`Storage: Data saved for key "${key}"`);
        resolve();
      }
    });
  });
}

/** Gets data securely from chrome.storage.local. Returns null if key not found. */
export async function getFromStorage<T>(key: string): Promise<T | null> {
  checkStorageAPI(); // Ensure API exists

  return new Promise<T | null>((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      // Check for errors reported by the Chrome API
      if (chrome.runtime.lastError) {
     //   console.error("Storage Read Error:", chrome.runtime.lastError);
        reject(new Error(`Storage read error for key "${key}": ${chrome.runtime.lastError.message}`));
      } else if (result && result[key] !== undefined) {
        // Key found, resolve with the value
        resolve(result[key] as T);
      } else {
        // Key not found or value is undefined
        resolve(null);
      }
    });
  });
}

/** Removes data securely from chrome.storage.local. */
export async function removeFromStorage(key: string): Promise<void> {
  checkStorageAPI(); // Ensure API exists

  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      // Check for errors reported by the Chrome API
      if (chrome.runtime.lastError) {
      //  console.error("Storage Remove Error:", chrome.runtime.lastError);
        reject(new Error(`Failed to remove data for key "${key}": ${chrome.runtime.lastError.message}`));
      } else {
         // Optional: log success for debugging if needed
         // console.log(`Storage: Data removed for key "${key}"`);
        resolve();
      }
    });
  });
}