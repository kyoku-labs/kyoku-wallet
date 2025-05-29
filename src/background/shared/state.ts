// src/background/shared/state.ts
import { KeyringManager } from '../../background/core/keyring/KeyringManager';
import { Connection, Cluster } from '@solana/web3.js';
import { SecretType } from '../core/keyring/types';
import { getFromStorage, saveToStorage } from '../../utils/storage';
import { getRpcEndpoint, NetworkOption } from '../../utils/networkUtils';
import { clusterApiUrl } from '@solana/web3.js';

// --- Configuration Constants ---
const LOCK_ALARM_NAME = 'walletAutoLockAlarm';
const STORAGE_LOCK_KEY = 'isLocked';
const ACCOUNT_ORDER_KEY = 'accountOrder';
const NETWORK_CONFIG_KEY = 'networkConfig_v1';
const AUTO_LOCK_SETTINGS_KEY = 'autoLockSettings_v1';
const ADDRESS_BOOK_KEY = 'addressBook_v1';
const EXPLORER_PREFERENCE_KEY = 'explorerPreference_v1';
const PRIORITY_FEE_SETTING_KEY = 'priorityFeeSetting_v1';
const CONNECTED_DAPPS_KEY = 'connectedDappsList_v1';
const CURRENCY_SETTING_KEY = 'selectedCurrency_v1';
const LANGUAGE_SETTING_KEY = 'selectedLanguage_v1';
// Example for a potential future key:
// const PFP_PREFERENCES_KEY = 'pfpPreferences_v1';

export const config = {
  LOCK_ALARM_NAME,
  STORAGE_LOCK_KEY,
  ACCOUNT_ORDER_KEY,
  NETWORK_CONFIG_KEY,
  AUTO_LOCK_SETTINGS_KEY,
  ADDRESS_BOOK_KEY,
  EXPLORER_PREFERENCE_KEY,
  PRIORITY_FEE_SETTING_KEY,
  CONNECTED_DAPPS_KEY,
  CURRENCY_SETTING_KEY,
  LANGUAGE_SETTING_KEY,
  // PFP_PREFERENCES_KEY, // Add if implemented
};

export type PriorityFeeLevel = 'auto' | 'low' | 'medium' | 'high';
export const DEFAULT_PRIORITY_FEE_LEVEL: PriorityFeeLevel = 'auto';

export interface ConnectedDappInfo {
  origin: string;
  name: string;
  iconUrl?: string;
  connectedAt: number;
}

/** Retrieves the user's preferred priority fee level setting from storage. */
export async function getUserPriorityFeeLevelSetting(): Promise<PriorityFeeLevel> {
  try {
    const storedSetting = await getFromStorage<PriorityFeeLevel>(config.PRIORITY_FEE_SETTING_KEY);
    if (storedSetting && ['auto', 'low', 'medium', 'high'].includes(storedSetting)) {
      return storedSetting;
    }
  } catch (error) {
    // Error fetching setting, use default.
  }
  return DEFAULT_PRIORITY_FEE_LEVEL;
}

interface NetworkConfig {
  network: NetworkOption;
  customRpcUrl: string | null;
}

// Singleton connection instance.
let connectionInstance: Connection | null = null;
// In-memory cache of the current network configuration.
let currentActiveNetworkConfig: NetworkConfig = {
  network: 'mainnet-beta',
  customRpcUrl: null,
};
// Promise to manage concurrent initialization attempts.
let connectionInitPromise: Promise<Connection | null> | null = null;
// Tracks the RPC endpoint string currently used by connectionInstance.
let currentEndpointInUse: string | null = null;

/**
 * Updates the network configuration in storage and in-memory state.
 * Invalidates the current connection instance if the endpoint changes.
 */
export async function updateNetworkConfiguration(newConfig: NetworkConfig): Promise<void> {
  try {
    await saveToStorage(config.NETWORK_CONFIG_KEY, newConfig);
    currentActiveNetworkConfig = { ...newConfig };

    const preferredEndpoint = getRpcEndpoint(newConfig.network, newConfig.customRpcUrl);

    // If endpoint changes, invalidate current connection to force re-initialization on next getConnection call.
    if (connectionInstance && currentEndpointInUse !== preferredEndpoint) {
        connectionInstance = null;
        currentEndpointInUse = null;
    }
  } catch (error) {
    throw error; // Re-throw to be handled by the caller
  }
}

/** Attempts to establish a connection to a given RPC endpoint. */
async function tryConnection(endpoint: string, _networkNameForLogging: string): Promise<Connection> {
  const newConnection = new Connection(endpoint, { commitment: 'confirmed' });
  await newConnection.getVersion(); // Verify connection
  return newConnection;
}

/**
 * Initializes or re-initializes the global Solana connection instance based on stored/updated settings.
 * Implements a simple locking mechanism (connectionInitPromise) to prevent race conditions.
 * Tries a preferred endpoint first, then a public fallback if applicable.
 */
export async function initializeConnection(): Promise<Connection | null> {
  if (connectionInitPromise) {
    return connectionInitPromise; // Return existing promise if initialization is already in progress
  }

  connectionInitPromise = (async () => {
    try {
      const storedConfig = await getFromStorage<NetworkConfig>(config.NETWORK_CONFIG_KEY);
      const configToUse = storedConfig || { network: 'mainnet-beta' as NetworkOption, customRpcUrl: null };

      // Update in-memory active config if it differs from storage (e.g., on startup)
      if (currentActiveNetworkConfig.network !== configToUse.network || currentActiveNetworkConfig.customRpcUrl !== configToUse.customRpcUrl) {
          currentActiveNetworkConfig = { ...configToUse };
      }

      const preferredEndpoint = getRpcEndpoint(configToUse.network, configToUse.customRpcUrl);
      let connectionAttempt: Connection | null = null;

      try {
        connectionAttempt = await tryConnection(preferredEndpoint, `Preferred (${configToUse.network})`);
        currentEndpointInUse = preferredEndpoint;
      } catch (preferredError: any) {
        // Preferred endpoint failed, try public fallback if applicable (non-custom, standard networks)
        if (configToUse.network !== 'custom' && (configToUse.network === 'mainnet-beta' || configToUse.network === 'devnet' || configToUse.network === 'testnet')) {
          const publicCluster = configToUse.network as Cluster;
          const fallbackEndpoint = clusterApiUrl(publicCluster);

          if (fallbackEndpoint !== preferredEndpoint) { // Only try fallback if it's different
            try {
              connectionAttempt = await tryConnection(fallbackEndpoint, `Fallback Public (${publicCluster})`);
              currentEndpointInUse = fallbackEndpoint;
            } catch (fallbackError: any) {
              throw preferredError; // If fallback also fails, throw the original preferred error
            }
          } else {
            throw preferredError; // Preferred was already the public URL, no other fallback
          }
        } else {
          throw preferredError; // No fallback for custom RPCs or if preferred was the only option
        }
      }

      connectionInstance = connectionAttempt;
      return connectionInstance;

    } catch (error) {
      connectionInstance = null;
      currentEndpointInUse = null;
      throw new Error(`Failed to initialize Solana connection: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      connectionInitPromise = null; // Release lock
    }
  })();
  return connectionInitPromise;
}

/**
 * Gets the current Solana connection instance.
 * If the instance doesn't exist or if network settings have changed, it attempts to initialize/re-initialize.
 */
export async function getConnection(): Promise<Connection | null> {
  if (connectionInitPromise) {
    return connectionInitPromise; // Wait for ongoing initialization
  }

  const storedConfig = await getFromStorage<NetworkConfig>(config.NETWORK_CONFIG_KEY);
  const desiredConfig = storedConfig || { network: 'mainnet-beta' as NetworkOption, customRpcUrl: null };
  const desiredPreferredEndpoint = getRpcEndpoint(desiredConfig.network, desiredConfig.customRpcUrl);

  // If a valid connection exists and its endpoint matches the desired one, return it.
  if (connectionInstance && currentEndpointInUse && currentEndpointInUse === desiredPreferredEndpoint) {
       return connectionInstance;
  }
  // Otherwise, (re-)initialize.
  return initializeConnection();
}

/** Returns a copy of the current in-memory active network configuration. */
export function getCurrentNetworkConfig(): NetworkConfig {
  return { ...currentActiveNetworkConfig };
}

// Global KeyringManager instance
export const keyringManager = new KeyringManager();

// For staging secrets during onboarding flows (e.g., mnemonic before password creation)
export interface StagedSecretData {
  secret: string;
  type: SecretType;
  selectedPaths?: string[]; // Optional: For importing multiple accounts from a mnemonic
}

/** Saves data to session storage, used for temporary data like onboarding secrets. */
export async function setStagedSecretData(data: StagedSecretData | null): Promise<void> {
  const key = 'temp_staged_secret_v1'; // Key for session storage
  try {
    if (data) {
      await chrome.storage.session.set({ [key]: data });
    } else {
      await chrome.storage.session.remove(key);
    }
    if (chrome.runtime.lastError) {
      throw new Error(`Session storage failed for setStagedSecretData: ${chrome.runtime.lastError.message}`);
    }
  } catch (e) {
    throw new Error(`Failed to update staged secret data: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Gets data from session storage. */
export async function getStagedSecretData(): Promise<StagedSecretData | null> {
  const key = 'temp_staged_secret_v1';
  try {
    const result = await chrome.storage.session.get(key);
    if (chrome.runtime.lastError) {
      throw new Error(`Session storage failed for getStagedSecretData: ${chrome.runtime.lastError.message}`);
    }

    const stagedData = result?.[key];

    // Basic validation of the retrieved data structure
    if (stagedData && typeof stagedData.secret === 'string' && typeof stagedData.type === 'string') {
      return stagedData as StagedSecretData;
    }

    if (stagedData) { // Data exists but is malformed
      // Attempt to clear invalid data to prevent issues
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.remove(key, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    }
    return null;
  } catch (error) {
    throw new Error(`Failed to retrieve staged secret data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Attempt to pre-load connection on service worker startup. Errors are caught and logged.
initializeConnection().catch(_err => {
    // Pre-load of connection failed, this might be normal if network is unavailable at startup.
});