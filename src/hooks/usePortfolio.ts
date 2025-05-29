// src/hooks/usePortfolio.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { useSolana } from '../context/SolanaContext';
import type { TokenInfo } from '../background/core/keyring/types';
import { getFromStorage, saveToStorage } from '../utils/storage';

interface PortfolioValueSnapshot {
    value: number; // USD value of the portfolio
    timestamp: number; // Timestamp of the snapshot
}
const PORTFOLIO_VALUE_HISTORY_KEY_PREFIX = 'portfolioValueHistory_v2_';
const MAX_PORTFOLIO_SNAPSHOTS = 48; 
const MIN_INTERVAL_BETWEEN_PORTFOLIO_SNAPSHOTS_MS = 1 * 60 * 60 * 1000; 
const PORTFOLIO_SNAPSHOT_MAX_AGE_MS = 25 * 60 * 60 * 1000; 

interface CachedPortfolio {
  publicKey: string;
  cluster: string;
  endpoint: string;
  portfolio: TokenInfo[];
  lastFetchTimestamp: number;
}
const PORTFOLIO_CACHE_DURATION_MS = 5 * 60 * 1000; 
const PORTFOLIO_CACHE_KEY_PREFIX = 'portfolio_cache_';

const portfolioCache = new Map<string, CachedPortfolio>();

const getPortfolioCacheKey = (publicKey: string, cluster: string, endpoint: string): string =>
  `${PORTFOLIO_CACHE_KEY_PREFIX}${publicKey}_${cluster}_${endpoint}`;

const getPortfolioHistoryCacheKey = (publicKey: string, cluster: string, endpoint: string): string =>
  `${PORTFOLIO_VALUE_HISTORY_KEY_PREFIX}${publicKey}_${cluster}_${endpoint}`;


export function usePortfolio() {
  const {
    activeAccount,
    setPortfolioChange24h,
    setPortfolioUsdChange24h,
    network: currentNetworkFromStore,
    customRpcUrl: currentCustomRpcUrlFromStore,
  } = useAppStore();
  const { cluster: solanaClusterName, endpoint: solanaEndpoint } = useSolana();

  const [portfolio, setPortfolio] = useState<TokenInfo[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPortfolioSolEquivalent, setTotalPortfolioSolEquivalent] = useState<number | null>(null);

  const fetchingRef = useRef<boolean>(false); 
  const lastFetchedKeyRef = useRef<string | null>(null); 

  const updatePortfolioHistoryAndChanges = useCallback(async (
    currentTotalUsdValue: number | null,
    historyCacheKey: string
  ) => {
    if (currentTotalUsdValue === null || currentTotalUsdValue === undefined) {
      setPortfolioChange24h(null);
      setPortfolioUsdChange24h(null);
      return;
    }

    try {
      const now = Date.now();
      const existingHistoryData = await getFromStorage<PortfolioValueSnapshot[]>(historyCacheKey);
      const existingHistory = Array.isArray(existingHistoryData) ? existingHistoryData : [];

      let updatedHistory = [...existingHistory];
      const lastSnapshot = updatedHistory.length > 0 ? updatedHistory[0] : null;

      if (!lastSnapshot || (now - lastSnapshot.timestamp > MIN_INTERVAL_BETWEEN_PORTFOLIO_SNAPSHOTS_MS)) {
        updatedHistory.unshift({ value: currentTotalUsdValue, timestamp: now });
      }

      updatedHistory = updatedHistory
        .filter(s => now - s.timestamp < PORTFOLIO_SNAPSHOT_MAX_AGE_MS)
        .slice(0, MAX_PORTFOLIO_SNAPSHOTS);

      await saveToStorage(historyCacheKey, updatedHistory);

      const targetTimestamp24hAgo = now - 24 * 60 * 60 * 1000;
      let closestPastSnapshot: PortfolioValueSnapshot | null = null;
      let smallestDiff = Infinity;

      for (const snapshot of updatedHistory) {
        const diff = Math.abs(snapshot.timestamp - targetTimestamp24hAgo);
        if (diff < smallestDiff) {
          smallestDiff = diff;
          closestPastSnapshot = snapshot;
        }
        if (snapshot.timestamp < targetTimestamp24hAgo && closestPastSnapshot && closestPastSnapshot.timestamp > targetTimestamp24hAgo) {
            break;
        }
      }

      if (closestPastSnapshot) {
        const absoluteUsdChange = currentTotalUsdValue - closestPastSnapshot.value;
        setPortfolioUsdChange24h(absoluteUsdChange);

        if (closestPastSnapshot.value !== 0) {
            const percentageChange = (absoluteUsdChange / closestPastSnapshot.value) * 100;
            setPortfolioChange24h(percentageChange);
        } else if (currentTotalUsdValue > 0) { 
            setPortfolioChange24h('new_portfolio_increase' as any); // Use a special string
        } else { 
             setPortfolioChange24h(0);
        }
      } else { 
        setPortfolioChange24h(null);
        setPortfolioUsdChange24h(null);
      }
    } catch (e) {
      
      setPortfolioChange24h(null);
      setPortfolioUsdChange24h(null);
    }
  }, [setPortfolioChange24h, setPortfolioUsdChange24h]);


  const fetchAndSetPortfolio = useCallback(async (
    publicKeyString: string,
    clusterForCacheKey: string,
    endpointForCacheKey: string
  ) => {
    if (fetchingRef.current) return; 
    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    setTotalPortfolioSolEquivalent(null); 

    const mainCacheKey = getPortfolioCacheKey(publicKeyString, clusterForCacheKey, endpointForCacheKey);
    lastFetchedKeyRef.current = mainCacheKey; 

    const cachedPortfolioData = portfolioCache.get(mainCacheKey);
    if (cachedPortfolioData && (Date.now() - cachedPortfolioData.lastFetchTimestamp < PORTFOLIO_CACHE_DURATION_MS)) {
      const fetchedPortfolio = cachedPortfolioData.portfolio;
      setPortfolio(fetchedPortfolio);

      const currentTotalFromCache = fetchedPortfolio.reduce((sum, token) => {
        return sum + (typeof token.usdValue === 'number' ? token.usdValue : 0);
      }, 0);

      const solToken = fetchedPortfolio.find(t => t.isNative);
      if (solToken && solToken.usdPrice && solToken.usdPrice > 0 && currentTotalFromCache !== null) {
          setTotalPortfolioSolEquivalent(currentTotalFromCache / solToken.usdPrice);
      } else {
          setTotalPortfolioSolEquivalent(null);
      }

      const historyCacheKey = getPortfolioHistoryCacheKey(publicKeyString, clusterForCacheKey, endpointForCacheKey);
      await updatePortfolioHistoryAndChanges(currentTotalFromCache, historyCacheKey);

      setIsLoading(false);
      fetchingRef.current = false;
      return;
    }

    try {
      chrome.runtime.sendMessage(
        { action: 'fetchPortfolioData', payload: { publicKeyString } },
        async (response) => {
          
          if (lastFetchedKeyRef.current !== mainCacheKey) {
            fetchingRef.current = false;
            return;
          }

          if (chrome.runtime.lastError) {
            setError(chrome.runtime.lastError.message || "Communication error fetching portfolio.");
            setPortfolio(null);
            setPortfolioChange24h(null);
            setPortfolioUsdChange24h(null);
          } else if (response && response.success) {
            const fetchedPortfolio: TokenInfo[] = response.portfolio || [];
            setPortfolio(fetchedPortfolio);
            portfolioCache.set(mainCacheKey, {
              publicKey: publicKeyString,
              cluster: clusterForCacheKey,
              endpoint: endpointForCacheKey,
              portfolio: fetchedPortfolio,
              lastFetchTimestamp: Date.now(),
            });

            const currentTotalPortfolioUsd = fetchedPortfolio.reduce((sum, token) => {
              return sum + (typeof token.usdValue === 'number' ? token.usdValue : 0);
            }, 0);

            const solToken = fetchedPortfolio.find(t => t.isNative);
            if (solToken && solToken.usdPrice && solToken.usdPrice > 0 && currentTotalPortfolioUsd !== null) {
                setTotalPortfolioSolEquivalent(currentTotalPortfolioUsd / solToken.usdPrice);
            } else {
                setTotalPortfolioSolEquivalent(null);
            }

            const historyCacheKey = getPortfolioHistoryCacheKey(publicKeyString, clusterForCacheKey, endpointForCacheKey);
            await updatePortfolioHistoryAndChanges(currentTotalPortfolioUsd, historyCacheKey);

          } else {
            setError(response?.error || "Unknown error fetching portfolio.");
            setPortfolio(null);
            setPortfolioChange24h(null);
            setPortfolioUsdChange24h(null);
          }
          setIsLoading(false);
          fetchingRef.current = false;
        }
      );
    } catch (err: any) {
      setError(err.message || "Failed to initiate portfolio fetch.");
      setPortfolio(null);
      setPortfolioChange24h(null);
      setPortfolioUsdChange24h(null);
      setTotalPortfolioSolEquivalent(null);
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [currentNetworkFromStore, currentCustomRpcUrlFromStore, updatePortfolioHistoryAndChanges, setPortfolioChange24h, setPortfolioUsdChange24h]);

  useEffect(() => {
    const currentPk = activeAccount?.publicKey;
    if (currentPk && solanaClusterName && solanaEndpoint) {
      fetchAndSetPortfolio(currentPk, solanaClusterName, solanaEndpoint);
    } else {
      
      setPortfolio(null);
      setIsLoading(!currentPk); 
      setError(null);
      setPortfolioChange24h(null);
      setPortfolioUsdChange24h(null);
      setTotalPortfolioSolEquivalent(null);
    }
  }, [activeAccount?.publicKey, solanaClusterName, solanaEndpoint, fetchAndSetPortfolio, setPortfolioChange24h, setPortfolioUsdChange24h]);

  
  const refreshPortfolio = useCallback(() => {
    const currentPk = activeAccount?.publicKey;
    if (currentPk && solanaClusterName && solanaEndpoint) {
      const mainCacheKey = getPortfolioCacheKey(currentPk, solanaClusterName, solanaEndpoint);
      portfolioCache.delete(mainCacheKey); 
      
      fetchAndSetPortfolio(currentPk, solanaClusterName, solanaEndpoint);
    }
  }, [activeAccount?.publicKey, solanaClusterName, solanaEndpoint, fetchAndSetPortfolio]);

  return { portfolio, isLoading, error, refreshPortfolio, totalPortfolioSolEquivalent };
}