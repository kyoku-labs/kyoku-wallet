// src/background/services/priceFeedService.ts

const JUPITER_PRICE_API_ENDPOINT = "https://lite-api.jup.ag/price/v2";
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const PRICE_CACHE_STORAGE_KEY = 'kyokuWalletTokenPriceCache';

// --- For Historical Price Points ---
interface PricePoint {
    price: number | null;
    fetchedAt: number; // Timestamp of when the price was fetched
}
interface CachedPriceHistory {
    [mintAddress: string]: PricePoint[]; // Array of price points, sorted by time (newest first)
}
const PRICE_HISTORY_STORAGE_KEY = 'kyokuTokenPriceHistoryCache_v2';
const MAX_PRICE_POINTS_PER_TOKEN = 48; // Store up to 48 points
const MIN_INTERVAL_BETWEEN_HISTORY_POINTS_MS = 30 * 60 * 1000; // Save a history point at most every 30 minutes
const HISTORY_POINT_MAX_AGE_MS = 25 * 60 * 60 * 1000; // Prune history points older than 25 hours
// --- END Historical Price Points ---

interface JupiterLitePriceData {
    id: string;
    mintSymbol?: string;
    price: string;
}

interface JupiterLiteApiResponse {
    data: {
        [queriedMintAddress: string]: JupiterLitePriceData;
    };
    timeTaken?: number;
}

interface CurrentPriceCacheEntry {
    price: number | null;
    fetchedAt: number;
}
interface CurrentTokenPriceCache {
    [mintAddress: string]: CurrentPriceCacheEntry;
}

async function getCurrentPriceCache(): Promise<CurrentTokenPriceCache> {
    try {
        const result = await chrome.storage.local.get(PRICE_CACHE_STORAGE_KEY);
        return (result[PRICE_CACHE_STORAGE_KEY] as CurrentTokenPriceCache) || {};
    } catch (error) {
        // Error getting current price cache
        return {};
    }
}

async function setCurrentPriceCache(cache: CurrentTokenPriceCache): Promise<void> {
    try {
        await chrome.storage.local.set({ [PRICE_CACHE_STORAGE_KEY]: cache });
    } catch (error) {
        // Error setting current price cache
    }
}

// --- Helpers for Price History Cache ---
async function getPriceHistoryCache(): Promise<CachedPriceHistory> {
    try {
        const result = await chrome.storage.local.get(PRICE_HISTORY_STORAGE_KEY);
        return (result[PRICE_HISTORY_STORAGE_KEY] as CachedPriceHistory) || {};
    } catch (error) {
        // Error getting price history cache
        return {};
    }
}

async function setPriceHistoryCache(cache: CachedPriceHistory): Promise<void> {
    try {
        await chrome.storage.local.set({ [PRICE_HISTORY_STORAGE_KEY]: cache });
    } catch (error) {
        // Error setting price history cache
    }
}
// --- END Helpers for Price History Cache ---

export async function fetchTokenPricesInUSD(
    mintAddresses: string[]
): Promise<Record<string, number | null>> {
    if (!mintAddresses || mintAddresses.length === 0) {
        return {};
    }

    const uniqueMintAddresses = Array.from(new Set(mintAddresses));
    const pricesToReturn: Record<string, number | null> = {};
    const mintsToFetchFromApi: string[] = [];
    const currentTime = Date.now();
    let currentPriceCache = await getCurrentPriceCache();
    let priceHistoryCache = await getPriceHistoryCache();
    let currentPriceCacheNeedsUpdate = false;
    let priceHistoryCacheNeedsUpdate = false;

    for (const mint of uniqueMintAddresses) {
        const cachedEntry = currentPriceCache[mint];
        if (cachedEntry && (currentTime - cachedEntry.fetchedAt < CACHE_DURATION_MS)) {
            pricesToReturn[mint] = cachedEntry.price;
        } else {
            if (cachedEntry) { // Cache exists but is stale
                delete currentPriceCache[mint];
                currentPriceCacheNeedsUpdate = true;
            }
            mintsToFetchFromApi.push(mint);
        }
    }

    if (mintsToFetchFromApi.length === 0) {
        if (currentPriceCacheNeedsUpdate) await setCurrentPriceCache(currentPriceCache);
        // No API fetch, but still update history if needed from currently cached fresh prices
        for (const mint of uniqueMintAddresses) {
            const currentPrice = pricesToReturn[mint];
            if (currentPrice !== null && currentPrice !== undefined) {
                priceHistoryCache[mint] = priceHistoryCache[mint] || [];
                const lastHistoryPoint = priceHistoryCache[mint][0]; // Newest is at index 0
                if (!lastHistoryPoint || (currentTime - lastHistoryPoint.fetchedAt > MIN_INTERVAL_BETWEEN_HISTORY_POINTS_MS)) {
                    priceHistoryCache[mint].unshift({ price: currentPrice, fetchedAt: currentTime });
                    priceHistoryCache[mint] = priceHistoryCache[mint]
                        .filter(p => currentTime - p.fetchedAt < HISTORY_POINT_MAX_AGE_MS) // Prune old points
                        .slice(0, MAX_PRICE_POINTS_PER_TOKEN); // Keep max number of points
                    priceHistoryCacheNeedsUpdate = true;
                }
            }
        }
        if (priceHistoryCacheNeedsUpdate) await setPriceHistoryCache(priceHistoryCache);
        return pricesToReturn;
    }

    const ids = mintsToFetchFromApi.join(',');
    const url = `${JUPITER_PRICE_API_ENDPOINT}?ids=${ids}`;

    try {
        const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!response.ok) {
            // Jupiter API request failed
            mintsToFetchFromApi.forEach(mint => pricesToReturn[mint] = null);
            return pricesToReturn; // Return what was from cache + nulls for failed fetches
        }
        const result: JupiterLiteApiResponse = await response.json();

        if (result.data) {
            for (const mint of mintsToFetchFromApi) {
                const priceData = result.data[mint];
                if (priceData && priceData.price !== undefined) {
                    const priceAsNumber = parseFloat(priceData.price);
                    if (!isNaN(priceAsNumber)) {
                        pricesToReturn[mint] = priceAsNumber;
                        currentPriceCache[mint] = { price: priceAsNumber, fetchedAt: currentTime };
                        currentPriceCacheNeedsUpdate = true;

                        // Update history cache
                        priceHistoryCache[mint] = priceHistoryCache[mint] || [];
                        const lastHistoryPoint = priceHistoryCache[mint][0];
                        if (!lastHistoryPoint || (currentTime - lastHistoryPoint.fetchedAt > MIN_INTERVAL_BETWEEN_HISTORY_POINTS_MS)) {
                            priceHistoryCache[mint].unshift({ price: priceAsNumber, fetchedAt: currentTime });
                            priceHistoryCache[mint] = priceHistoryCache[mint]
                                .filter(p => currentTime - p.fetchedAt < HISTORY_POINT_MAX_AGE_MS)
                                .slice(0, MAX_PRICE_POINTS_PER_TOKEN);
                            priceHistoryCacheNeedsUpdate = true;
                        }
                    } else {
                        pricesToReturn[mint] = null;
                        currentPriceCache[mint] = { price: null, fetchedAt: currentTime }; // Cache parse failure
                        currentPriceCacheNeedsUpdate = true;
                    }
                } else {
                    pricesToReturn[mint] = null; // Not found in API response
                    currentPriceCache[mint] = { price: null, fetchedAt: currentTime }; // Cache not found
                    currentPriceCacheNeedsUpdate = true;
                }
            }
        } else { // No data in API response
            mintsToFetchFromApi.forEach(mint => {
                pricesToReturn[mint] = null;
                currentPriceCache[mint] = { price: null, fetchedAt: currentTime };
                currentPriceCacheNeedsUpdate = true;
            });
        }

        if (currentPriceCacheNeedsUpdate) await setCurrentPriceCache(currentPriceCache);
        if (priceHistoryCacheNeedsUpdate) await setPriceHistoryCache(priceHistoryCache);
        return pricesToReturn;

    } catch (error) {
        // Network/parsing error fetching prices
        mintsToFetchFromApi.forEach(mint => pricesToReturn[mint] = null);
        if (currentPriceCacheNeedsUpdate) await setCurrentPriceCache(currentPriceCache); // Save nulls for fetched items
        // Don't save history on complete failure to avoid polluting with all nulls
        return pricesToReturn;
    }
}

/**
 * Retrieves the closest cached historical price for given mints around a specified number of hours ago.
 * @param mintAddresses - Array of token mint addresses.
 * @param hoursAgo - How many hours ago to look for a price point (default is 24).
 * @returns A record mapping mint addresses to their closest historical price or null.
 */
export async function getPreviousTokenPrices(
    mintAddresses: string[],
    hoursAgo: number = 24
): Promise<Record<string, number | null>> {
    if (!mintAddresses || mintAddresses.length === 0) {
        return {};
    }
    const targetTimestamp = Date.now() - (hoursAgo * 60 * 60 * 1000);
    const historicalPrices: Record<string, number | null> = {};
    const priceHistoryCache = await getPriceHistoryCache();

    for (const mint of mintAddresses) {
        const history = priceHistoryCache[mint];
        if (history && history.length > 0) {
            let closestPoint: PricePoint | null = null;
            let smallestDiff = Infinity;

            // Find the price point closest to the targetTimestamp
            for (const point of history) {
                const diff = Math.abs(point.fetchedAt - targetTimestamp);
                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    closestPoint = point;
                }
            }
            // Any closest point within the MAX_AGE_MS is considered valid for now.
            historicalPrices[mint] = closestPoint ? closestPoint.price : null;
        } else {
            historicalPrices[mint] = null; // No history for this mint
        }
    }
    return historicalPrices;
}