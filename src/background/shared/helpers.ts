// src/background/shared/helpers.ts
import { keyringManager, config } from './state';
import { KeyringManager } from '../../background/core/keyring/KeyringManager'; // Adjusted path if necessary
import { AccountMetadata } from '../core/keyring/types';
import { getFromStorage } from '../../utils/storage';

/**
 * Clears the auto-lock alarm.
 */
export async function clearLockAlarm(): Promise<void> {
    try {
        await chrome.alarms.clear(config.LOCK_ALARM_NAME);
    } catch (error) {
        // Error clearing alarm is usually not critical for the current operation.
    }
}

/**
 * Resets the auto-lock alarm based on current settings.
 * Clears any existing alarm and creates a new one if auto-lock is enabled.
 */
export async function resetLockAlarm(): Promise<void> {
    try {
        const result = await chrome.storage.local.get(config.AUTO_LOCK_SETTINGS_KEY);
        const settings = result[config.AUTO_LOCK_SETTINGS_KEY] as { isEnabled: boolean; minutes: number };

        await clearLockAlarm();

        if (settings?.isEnabled) {
            await chrome.alarms.create(config.LOCK_ALARM_NAME, {
                delayInMinutes: settings.minutes
            });
        }
    } catch (error) {
        // Error resetting auto-lock timer, self-contained.
    }
}

/**
 * Locks the KeyringManager instance, updates storage to reflect the locked state,
 * and clears the auto-lock alarm.
 * This function is typically called by the error handling wrapper or force lock actions.
 */
export async function lockWalletState(): Promise<void> {
    try {
        keyringManager.lock();
        await chrome.storage.local.set({ [config.STORAGE_LOCK_KEY]: true });
        await clearLockAlarm();
    } catch (error) {
        // Error in lockWalletState is logged if necessary, but often self-contained.
    }
}

/**
 * Sends a message to any open popups/UI to indicate that the wallet has been locked.
 * This function is typically called by the error handling wrapper.
 */
export async function notifyPopupToLock(): Promise<void> {
    try {
        await chrome.runtime.sendMessage({ action: "forceLockFromBackground" });
    } catch (error: any) {
        // Expected if popup isn't open or receiving end does not exist.
        if (!(error.message?.includes('Could not establish connection') || error.message?.includes('Receiving end does not exist'))) {
            // Log other unexpected errors if necessary
        }
    }
}

/**
 * Ensures that the KeyringManager has loaded its data from storage if it's currently
 * unpopulated but the keyring has been initialized (e.g., after a service worker restart).
 * @throws {Error} If loading fails critically.
 */
export async function ensureKeyringLoaded(): Promise<void> {
    // Check if keyring data is not loaded in the instance AND if it's marked as initialized in storage
    if (!keyringManager.isKeyringDataLoaded() && await KeyringManager.isInitialized()) {
        try {
            await keyringManager.load(); // load() is async and populates _keyringData
        } catch (loadError: any) {
            // console.error("[ensureKeyringLoaded] Critical error loading keyring data:", loadError); // Already commented out
            // This is a significant issue, might need to reflect a broken state or be handled by the caller.
            throw loadError;
        }
    }
}

/**
 * Retrieves all account metadata, ordered according to saved preferences.
 * Ensures keyring is loaded before fetching.
 * @returns {Promise<AccountMetadata[]>} A promise resolving to an array of ordered account metadata.
 * @throws {Error} If keyring loading or storage access fails critically.
 */
export async function getOrderedAccounts(): Promise<AccountMetadata[]> {
    await ensureKeyringLoaded(); // Ensures keyringManager._keyringData is loaded if initialized
    const allMeta = await keyringManager.getAllAccountMetadata(); // Now async

    // Ensure allMeta is an array before proceeding
    if (!allMeta || !Array.isArray(allMeta)) {
        // This case should ideally not happen if KeyringManager.getAllAccountMetadata always resolves to an array (even empty)
        // console.error("[getOrderedAccounts] getAllAccountMetadata did not return an array. Returning empty."); // Already commented out
        return [];
    }

    try {
        const orderResult = await chrome.storage.local.get(config.ACCOUNT_ORDER_KEY);
        const orderedUuids: string[] | undefined = orderResult[config.ACCOUNT_ORDER_KEY];

        if (orderedUuids && Array.isArray(orderedUuids)) {
            const accountMap = new Map(allMeta.map(acc => [acc.uuid, acc]));
            // Create ordered list based on stored UUIDs
            const orderedAccounts = orderedUuids
                .map(uuid => accountMap.get(uuid))
                .filter((acc): acc is AccountMetadata => !!acc); // Filter out any undefined (stale UUIDs)

            // Add any accounts not in the stored order to the end
            const currentUuids = new Set(orderedAccounts.map(acc => acc.uuid));
            allMeta.forEach(acc => {
                if (!currentUuids.has(acc.uuid)) {
                    orderedAccounts.push(acc);
                }
            });
            return orderedAccounts;
        }
    } catch (error) {
        // console.error("[getOrderedAccounts] Error fetching or processing account order from storage:", error); // Already commented out
        // Fallback to returning allMeta as is (which should be loaded and potentially unordered)
        // Or, re-throw if storage access errors are critical for the caller
        // throw error;
    }
    return allMeta; // Fallback to allMeta if ordering fails or no order is stored
}

/** Type definition for the sendResponse callback function used in message handlers. */
export type SendResponse = (response?: any) => void;

/**
 * Utility to safely send responses from background script message handlers.
 * Checks for `chrome.runtime.lastError` before attempting to send.
 * Used by `withErrorHandling` and directly by handlers for success responses.
 * @param sendResponse - The `sendResponse` callback from the message listener.
 * @param response - The data to send.
 * @param actionName - An optional name for the action for context (primarily for debugging if errors occur).
 */
export function safeSendResponse(sendResponse: SendResponse, response: any, _actionName: string = "Unnamed Action") {
    try {
        if (chrome.runtime.lastError) {
            // Error already occurred, cannot send response
            // console.warn(`[safeSendResponse:${_actionName}] Not sending response due to chrome.runtime.lastError:`, chrome.runtime.lastError.message); // Already commented out
            return;
        }
        sendResponse(response);
    } catch (error) {
        // This catch is for errors if sendResponse itself throws, e.g., if the port is closed.
        // console.warn(`[safeSendResponse:${_actionName}] Error calling sendResponse:`, error); // Already commented out
    }
}

/**
 * Updates the auto-lock timer settings and recreates the alarm if enabled and wallet is unlocked.
 * @param settings - An object containing `isEnabled` (boolean) and `minutes` (number).
 */
export async function updateAutoLockTimer(settings: { isEnabled: boolean; minutes: number }): Promise<void> {
    try {
        await clearLockAlarm();

        if (!settings || typeof settings.isEnabled !== 'boolean' || typeof settings.minutes !== 'number') {
            // Invalid settings provided.
            return;
        }

        if (settings.isEnabled) {
            const validMinutes = Math.max(1, settings.minutes);
            const isLockedResult = await getFromStorage<boolean>(config.STORAGE_LOCK_KEY);
            const isLocked = isLockedResult === true; // Check if explicitly true

            if (!isLocked) { // Only set alarm if wallet is not supposed to be locked
                await chrome.alarms.create(config.LOCK_ALARM_NAME, {
                    delayInMinutes: validMinutes
                });
            }
        }
    } catch (error) {
        // Error updating auto-lock timer
    }
}