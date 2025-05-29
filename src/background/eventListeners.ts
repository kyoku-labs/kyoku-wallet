// src/background/eventListeners.ts

import {
    keyringManager,
    config,
    // getStagedSecretData, // Not directly used by listeners here
    // setStagedSecretData, // Not directly used by listeners here
    // getCurrentNetworkConfig, // Not directly used by listeners here
} from './shared/state';
import { getFromStorage, saveToStorage } from '../utils/storage';
// import type { AccountMetadata } from '../lib/keyring/types'; // Not directly used by listeners here

import {
    clearLockAlarm,
    // resetLockAlarm, // Not directly called by listeners, but by handlers
    lockWalletState,
    notifyPopupToLock,
    // updateAutoLockTimer, // Not directly called by listeners
} from './shared/helpers';

// Import dApp Handlers for Popup Management, as onRemoved listener interacts with popup states.
import {  openPopupWindows, closePopupWindow } from './handlers/dappHandlers';
import { DEFAULT_EXPLORER_ID } from '../utils/explorerUtils';
import type { PriorityFeeLevel } from './shared/state'; // For type safety

// --- Alarm Listener ---
// Handles the auto-lock functionality when the alarm triggers.
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === config.LOCK_ALARM_NAME) {
        if (keyringManager.isUnlocked()) {
            await lockWalletState(); // This helper locks keyring and updates storage.
            await notifyPopupToLock(); // Notify open popups to update UI.

            // Broadcast disconnect to dApps due to auto-lock.
            try {
                const allTabs = await chrome.tabs.query({ status: 'complete' });
                for (const tab of allTabs) {
                    if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith(`chrome-extension://${chrome.runtime.id}`)) {
                         chrome.tabs.sendMessage(tab.id, {
                            target: 'KYOKU_CONTENT_SCRIPT_BROADCAST',
                            eventName: 'disconnect',
                            eventData: { message: "Wallet locked due to inactivity." }
                        }).catch(() => {/* ignore errors sending to tabs that might not have the content script */});
                    }
                }
            } catch(broadcastError: any) {
                // Error broadcasting disconnect on auto-lock.
            }
        } else {
            // Auto-lock alarm triggered, but wallet already locked. Clear the alarm.
            await clearLockAlarm();
        }
    }
});

// --- Installation/Update Listener ---
// Handles actions to be taken when the extension is installed or updated.
chrome.runtime.onInstalled.addListener(async (details) => {
     // Always lock the wallet on install/update for security.
     await lockWalletState();

     if (details.reason === 'install') {
         // First install detected. Set defaults and open onboarding.
         try {
             // Set default auto-lock settings if not already set.
             const existingAutoLock = await getFromStorage(config.AUTO_LOCK_SETTINGS_KEY);
             if (!existingAutoLock) {
                 await saveToStorage(config.AUTO_LOCK_SETTINGS_KEY, { isEnabled: true, minutes: 15 });
             }

             // Set default network configuration if not already set.
             const existingNetwork = await getFromStorage(config.NETWORK_CONFIG_KEY);
             if(!existingNetwork) {
                 await saveToStorage(config.NETWORK_CONFIG_KEY, { network: 'mainnet-beta', customRpcUrl: null });
             }

             // Set default explorer preference if not already set.
             const existingExplorer = await getFromStorage(config.EXPLORER_PREFERENCE_KEY);
             if(!existingExplorer) {
                 await saveToStorage(config.EXPLORER_PREFERENCE_KEY, DEFAULT_EXPLORER_ID);
             }

             // Set default priority fee level if not already set.
             const existingPriorityFee = await getFromStorage(config.PRIORITY_FEE_SETTING_KEY);
             if (!existingPriorityFee) {
                 await saveToStorage(config.PRIORITY_FEE_SETTING_KEY, 'auto' as PriorityFeeLevel);
             }

             // Open onboarding page.
             const onboardingUrl = chrome.runtime.getURL('onboarding.html');
             const tabs = await chrome.tabs.query({ url: onboardingUrl });
             if (tabs.length === 0) {
                 chrome.tabs.create({ url: onboardingUrl });
             } else {
                 // If onboarding tab already exists, focus it.
                 if (tabs[0].id) chrome.tabs.update(tabs[0].id, { active: true });
             }
         }
         catch(installError: any) {
             // Failed to set defaults or open onboarding on install.
         }
     } else if (details.reason === 'update') {
         // Extension updated. Potential migration logic for future updates can go here.
     }
});

// --- Startup Listener ---
// Ensures the wallet is locked when the browser starts.
chrome.runtime.onStartup.addListener(async () => {
     await lockWalletState(); // Lock the wallet on browser startup.
});

// --- Window Removed Listener (for Popup Cleanup) ---
// Handles cleanup when a popup window associated with a dApp interaction is closed.
chrome.windows.onRemoved.addListener((windowId) => {
    // Check if the closed window was one of our dApp confirmation popups.
    for (const [requestId, popupWindowId] of openPopupWindows.entries()) {
        if (popupWindowId === windowId) {
            // Popup window was closed by user or an external event.
            // Use closePopupWindow to handle promise rejection and map cleanup.
            closePopupWindow(requestId);
            break; // Found the window, no need to check further.
        }
    }
});