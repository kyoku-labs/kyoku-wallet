import { clusterApiUrl, Cluster } from '@solana/web3.js';

// Define NetworkOption type (can be imported from appStore if preferred)
// Ensure this type is consistent with its usage in appStore.ts and SettingsView.tsx
export type NetworkOption = Cluster | 'custom';

// Environment variable for Helius API Key (Ensure VITE_ prefix is correct for Vite)
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY;

/**
 * Determines the appropriate Solana RPC endpoint URL based on network selection.
 * Handles custom RPC URLs and uses Helius endpoints if API key is available.
 * Provides console logs for endpoint selection reasoning.
 *
 * @param network The selected network ('mainnet-beta', 'devnet', 'testnet', 'custom').
 * @param customRpcUrl The custom RPC URL string (only used if network is 'custom').
 * @returns The RPC endpoint URL string.
 */
export function getRpcEndpoint(network: NetworkOption, customRpcUrl: string | null): string {
    // 1. Handle Custom RPC
    if (network === 'custom') {
        const trimmedUrl = customRpcUrl?.trim();
        if (trimmedUrl) {
            try {
                // Basic validation for protocol
                const url = new URL(trimmedUrl);
                if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
                    throw new Error('Invalid RPC URL protocol. Must be http(s) or ws(s).');
                }
             //   console.log(`[getRpcEndpoint] Using Custom RPC: ${trimmedUrl}`);
                return trimmedUrl;
            } catch (e) {
             //   console.warn(`[getRpcEndpoint] Invalid Custom RPC URL format "${trimmedUrl}". Falling back to default (mainnet-beta). Error: ${e instanceof Error ? e.message : String(e)}`);
                // Fallback to default if custom URL is invalid
                network = 'mainnet-beta'; // Explicitly set network to fallback type
            }
        } else {
         //   console.warn(`[getRpcEndpoint] Network set to 'custom' but no Custom RPC URL provided. Falling back to default (mainnet-beta).`);
            // Fallback to default if URL is missing
            network = 'mainnet-beta'; // Explicitly set network to fallback type
        }
    }

    // 2. Determine Cluster Slug for standard networks or fallback
    let cluster: Cluster;
    if (network === 'mainnet-beta' || network === 'devnet' || network === 'testnet') {
        cluster = network;
    } else {
        // Default to mainnet-beta for unknown network selections or fallback from invalid custom
        // This case should ideally not be reached if network type is validated before calling,
        // but serves as a safeguard.
        if (network !== 'custom') { // Avoid double warning if falling back from invalid custom
         //   console.warn(`[getRpcEndpoint] Invalid network selection '${network}'. Defaulting to mainnet-beta.`);
        }
        cluster = 'mainnet-beta';
    }

    // 3. Select Endpoint (Helius or Public)
    let finalEndpoint: string;

    // Use Helius for Mainnet or Devnet if API key is available
    if ((cluster === 'mainnet-beta' || cluster === 'devnet') && HELIUS_API_KEY) {
        const subdomain = cluster === 'mainnet-beta' ? 'mainnet' : 'devnet';
        finalEndpoint = `https://${subdomain}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
       // console.log(`[getRpcEndpoint] Using Helius RPC for ${cluster}.`);
    } else {
        // Use public RPC for Testnet or if Helius key is missing/not applicable
        finalEndpoint = clusterApiUrl(cluster);
        if (cluster === 'testnet') {
            console.log(`[getRpcEndpoint] Using Public Solana RPC for ${cluster}: ${finalEndpoint}`);
        } else { // Mainnet or Devnet without Helius key
             if (!HELIUS_API_KEY) {
            //     console.warn(`[getRpcEndpoint] Helius API key missing. Using Public Solana RPC for ${cluster}: ${finalEndpoint}`);
             } else {
                 // Helius key exists but network is not mainnet/devnet (shouldn't happen with current logic, but safe log)
              //   console.log(`[getRpcEndpoint] Using Public Solana RPC for ${cluster}: ${finalEndpoint}`);
             }
        }
    }

    return finalEndpoint;
}
