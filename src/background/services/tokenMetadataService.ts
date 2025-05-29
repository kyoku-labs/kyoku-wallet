// src/background/services/tokenMetadataService.ts
import type { TokenInfo } from '../core/keyring/types';

// Endpoint for Jupiter's strict token list
const JUPITER_STRICT_TOKEN_LIST_ENDPOINT = 'https://token.jup.ag/strict';
const STRICT_LIST_CACHE_TTL_MS = 30 * 60 * 1000; // Cache duration for the entire list (30 minutes)

/**
 * Interface for token metadata from Jupiter's token list API.
 * Matches the structure from https://token.jup.ag/strict
 */
interface JupiterApiToken {
  address: string;        
  chainId: number;        
  decimals: number;
  name: string;
  symbol: string;
  logoURI: string | null; // URL of the token logo
  tags?: string[];
  extensions?: {
    coingeckoId?: string;
    // other potential extensions
  };
}

// Cache for the Jupiter strict token list, mapped by mint address.
let jupiterStrictListCache: Map<string, JupiterApiToken> | null = null;
let lastStrictListFetchTimestamp = 0;

/**
 * Fetches the full "strict" token list from Jupiter.
 * @returns A Promise resolving to an array of JupiterApiToken or null on error.
 */
async function fetchJupiterStrictTokenList(): Promise<JupiterApiToken[] | null> {
  try {
    const response = await fetch(JUPITER_STRICT_TOKEN_LIST_ENDPOINT);
    if (!response.ok) {
      return null;
    }
    const data: JupiterApiToken[] = await response.json();
    if (Array.isArray(data)) {
      return data;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Ensures the Jupiter strict token list cache is populated and up-to-date.
 * Fetches from API if the cache is empty or expired.
 */
async function ensureStrictListCache(): Promise<void> {
  const currentTime = Date.now();
  if (jupiterStrictListCache && (currentTime - lastStrictListFetchTimestamp < STRICT_LIST_CACHE_TTL_MS)) {
    return; // Cache is valid
  }

  const tokenList = await fetchJupiterStrictTokenList();

  if (tokenList) {
    const newCache = new Map<string, JupiterApiToken>();
    for (const token of tokenList) {
      newCache.set(token.address, token);
    }
    jupiterStrictListCache = newCache;
    lastStrictListFetchTimestamp = currentTime;
  } else {
    // If fetch fails, current behavior is to operate without fresh cache.
    // Stale cache might be used if still within TTL from a previous successful fetch.
    // To force clearing on failure: jupiterStrictListCache = null; lastStrictListFetchTimestamp = 0;
  }
}

/**
 * Retrieves token metadata for a specific mint address from the cached Jupiter strict list.
 * @param mintAddress - The mint address of the token.
 * @returns A Promise resolving to JupiterApiToken or null if not found or on error.
 */
export async function getJupiterTokenData(mintAddress: string): Promise<JupiterApiToken | null> {
  if (!mintAddress || mintAddress === 'SOL') { // Native SOL is not in these lists
    return null;
  }

  await ensureStrictListCache(); // Ensure cache is loaded/fresh

  if (!jupiterStrictListCache) {
    return null; // Cache unavailable
  }

  const metadata = jupiterStrictListCache.get(mintAddress);
  return metadata || null; // Token not found in the strict list
}

/**
 * Enriches a single TokenInfo object with metadata from Jupiter API (via cached strict list).
 * Updates logo, name, and symbol if Jupiter API provides them and they differ.
 * @param tokenInfo - The TokenInfo object to enrich.
 * @returns A Promise resolving to the enriched TokenInfo object.
 */
export async function enrichTokenWithJupiterData(tokenInfo: TokenInfo): Promise<TokenInfo> {
  if (tokenInfo.isNative) { // Skip SOL or other native equivalents
    return tokenInfo;
  }

  const jupiterData = await getJupiterTokenData(tokenInfo.address);

  if (jupiterData) {
    const updatedTokenInfo = { ...tokenInfo };
    // Prioritize Jupiter data if available and different
    if (jupiterData.name && jupiterData.name !== updatedTokenInfo.name) {
        updatedTokenInfo.name = jupiterData.name;
    }
    if (jupiterData.symbol && jupiterData.symbol !== updatedTokenInfo.symbol) {
        updatedTokenInfo.symbol = jupiterData.symbol;
    }
    if (jupiterData.logoURI && jupiterData.logoURI !== updatedTokenInfo.logo) {
        updatedTokenInfo.logo = jupiterData.logoURI;
    }
    // Decimals mismatch handling: registry/on-chain source is generally preferred for decimals.
    // Current implementation keeps original decimals from portfolioService if a mismatch occurs.
    if (jupiterData.decimals !== updatedTokenInfo.decimals) {
      // Mismatch detected, log or handle as per policy. For now, using registry decimals.
    }
    return updatedTokenInfo;
  }
  return tokenInfo; // Return original if no Jupiter data found
}

/**
 * Enriches an array of TokenInfo objects with metadata from Jupiter API (via cached strict list).
 * @param tokenInfos - An array of TokenInfo objects to enrich.
 * @returns A Promise resolving to an array of enriched TokenInfo objects.
 */
export async function enrichTokensWithJupiterData(tokenInfos: TokenInfo[]): Promise<TokenInfo[]> {
  if (tokenInfos.length === 0) return [];

  await ensureStrictListCache(); // Ensure the strict list is loaded
  if (!jupiterStrictListCache) {
    return tokenInfos; // Return original tokens if cache failed to load
  }

  // Process tokens by looking them up in the fetched jupiterStrictListCache
  const enrichedTokenInfos = tokenInfos.map(tokenInfo => {
    if (tokenInfo.isNative || !jupiterStrictListCache) {
      return tokenInfo;
    }
    const jupiterData = jupiterStrictListCache.get(tokenInfo.address);
    if (jupiterData) {
      const updatedTokenInfo = { ...tokenInfo };
      if (jupiterData.name && jupiterData.name !== updatedTokenInfo.name) {
        updatedTokenInfo.name = jupiterData.name;
      }
      if (jupiterData.symbol && jupiterData.symbol !== updatedTokenInfo.symbol) {
        updatedTokenInfo.symbol = jupiterData.symbol;
      }
      if (jupiterData.logoURI && jupiterData.logoURI !== updatedTokenInfo.logo) {
        updatedTokenInfo.logo = jupiterData.logoURI;
      }
      // Note: Decimal mismatches are logged by the single enrich function if necessary.
      return updatedTokenInfo;
    }
    return tokenInfo;
  });

  return enrichedTokenInfos;
}