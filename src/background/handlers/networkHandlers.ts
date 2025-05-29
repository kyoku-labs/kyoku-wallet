// src/background/networkHandlers.ts
import { config, initializeConnection } from '../shared/state';
import { SendResponse, safeSendResponse } from '../shared/helpers';
import { NetworkOption } from '../../store/appStore';
import { getFromStorage, saveToStorage } from '../../utils/storage';
import { Cluster } from '@solana/web3.js';
import { KeyringError } from '../../background/core/keyring/KeyringManager';

// Type for stored network configuration
interface NetworkConfig {
    network: Cluster | 'custom';
    customRpcUrl: string | null;
}

/**
 * Updates network settings in storage and re-initializes the connection.
 * @param payload - The new network configuration.
 * @param respond - Callback function to send the response.
 */
export async function handleSetNetworkConfiguration(
    payload: { network?: NetworkOption; customRpcUrl?: string | null },
    respond: SendResponse
): Promise<void> {
    const { network, customRpcUrl } = payload;

    // Validate network type
    if (!network || !['mainnet-beta', 'devnet', 'testnet', 'custom'].includes(network)) {
        throw new KeyringError('Invalid network type provided.');
    }

    let urlToSave: string | null = null;
    // Validate custom URL if network is 'custom'
    if (network === 'custom') {
        const trimmedUrl = customRpcUrl?.trim();
        if (!trimmedUrl) {
            throw new KeyringError('Custom RPC URL is required when network is "custom".');
        }
        try {
            const url = new URL(trimmedUrl);
            if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
                throw new Error('Invalid RPC URL protocol. Must be http(s) or ws(s).');
            }
            urlToSave = trimmedUrl;
        } catch (e) {
            // Catch specific URL format error
            throw new KeyringError(`Invalid Custom RPC URL: ${e instanceof Error ? e.message : 'Format error'}`);
        }
    }

    const networkConfigToSave: NetworkConfig = { network, customRpcUrl: urlToSave };

    // 1. Save to storage
    await saveToStorage(config.NETWORK_CONFIG_KEY, networkConfigToSave);

    // 2. Re-initialize connection
    await initializeConnection();

    // 3. Notify UI (non-critical if this fails)
    try {
        chrome.runtime.sendMessage({
            action: 'networkConfigurationChanged',
            payload: networkConfigToSave
        });
    } catch (e) {
        // Error notifying popups
    }

    // 4. Respond success
    safeSendResponse(respond, { success: true, network: networkConfigToSave.network, customRpcUrl: networkConfigToSave.customRpcUrl }, 'setNetworkConfiguration');
}

/**
 * Gets the current network configuration from storage.
 * @param _payload - Unused payload.
 * @param respond - Callback function to send the response.
 */
export async function handleGetNetworkConfiguration(
    _payload: unknown,
    respond: SendResponse
): Promise<void> {
    const storedConfig = await getFromStorage<NetworkConfig>(config.NETWORK_CONFIG_KEY);
    const networkConfig: NetworkConfig = storedConfig || { network: 'mainnet-beta', customRpcUrl: null };

    safeSendResponse(respond, { success: true, network: networkConfig.network, customRpcUrl: networkConfig.customRpcUrl }, 'getNetworkConfiguration');
}