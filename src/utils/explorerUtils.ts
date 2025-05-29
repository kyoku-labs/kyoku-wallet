// src/utils/explorerUtils.ts (or add to an existing utils file)

export interface Explorer {
  id: string; // Unique identifier (e.g., 'solscan', 'solanafm')
  name: string; // User-friendly name (e.g., 'Solscan', 'SolanaFM')
  // {signature} and {clusterQueryParam} will be replaced
  // {clusterQueryParam} might be like "?cluster=devnet" or "" for mainnet
  urlPattern: string; 
}

export const SUPPORTED_EXPLORERS: Explorer[] = [
  { 
    id: 'solscan', 
    name: 'Solscan', 
    urlPattern: 'https://solscan.io/tx/{signature}{clusterQueryParam}' 
  },
  { 
    id: 'solanafm', 
    name: 'SolanaFM', 
    urlPattern: 'https://solana.fm/tx/{signature}{clusterQueryParam}' 
  },
  { 
    id: 'explorer.solana', 
    name: 'Solana Explorer', 
    urlPattern: 'https://explorer.solana.com/tx/{signature}{clusterQueryParam}' 
  },
  { 
    id: 'solanabeach', 
    name: 'Solana Beach', 
    urlPattern: 'https://solanabeach.io/transaction/{signature}{clusterQueryParam}' 
  },

];

export const DEFAULT_EXPLORER_ID = 'solscan'; // Solscan as default

export function getExplorerById(id: string): Explorer | undefined {
  return SUPPORTED_EXPLORERS.find(explorer => explorer.id === id);
}

// Helper to build the cluster query parameter string
export function buildClusterQueryParam(network: string, customRpcUrl: string | null): string {
    if (network === 'mainnet-beta') return ''; // Solscan, SolanaFM, Explorer.Solana typically default to mainnet

    let clusterSlug = network;
    if (network === 'custom') {
        if (customRpcUrl?.includes('devnet')) clusterSlug = 'devnet';
        else if (customRpcUrl?.includes('testnet')) clusterSlug = 'testnet';
        else clusterSlug = 'custom'; // Or map to mainnet if custom is likely mainnet-compatible
    }
    
  
    if (clusterSlug === 'devnet' || clusterSlug === 'testnet') {
        return `?cluster=${clusterSlug}`;
    }
    if (clusterSlug === 'custom') { // If it's custom and not identified as dev/test, no param
        return '';
    }
    return ''; // Default for mainnet-beta
}