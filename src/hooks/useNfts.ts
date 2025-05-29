// src/hooks/useNfts.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { useSolana } from '../context/SolanaContext';
import type { CollectibleInfo } from '../background/services/nftTypes';

// Types for grouped NFT display
export interface NftCollectionGroup {
  isGroup: true; // Discriminator for type identification
  collectionAddress: string;
  collectionName?: string;
  collectionImageUrl?: string; // Representative image for the collection group
  nfts: CollectibleInfo[];     // NFTs within this group
  count: number;
}

export type NftDisplayItem = NftCollectionGroup | (CollectibleInfo & { isGroup: false });

// Interface for cached NFT data
interface CachedNfts {
  publicKey: string;
  cluster: string;
  endpoint: string;
  displayItems: NftDisplayItem[]; // Cache now stores the grouped/individual display items
  lastFetchTimestamp: number;
}

const NFT_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const NFT_CACHE_KEY_PREFIX = 'nfts_cache_grouped_v1_'; // Prefix for cache keys

const nftCache = new Map<string, CachedNfts>(); // In-memory cache for NFT data

const getNftCacheKey = (publicKey: string, cluster: string, endpoint: string): string =>
  `${NFT_CACHE_KEY_PREFIX}${publicKey}_${cluster}_${endpoint}`;

// Helper function to group NFTs by their collection address
const groupNftsByCollection = (collectibles: CollectibleInfo[]): NftDisplayItem[] => {
  if (!collectibles || collectibles.length === 0) {
    return [];
  }

  const itemsByCollectionAddress: Record<string, CollectibleInfo[]> = {};
  const individualNfts: CollectibleInfo[] = []; // NFTs not part of a multi-item collection

  collectibles.forEach(nft => {
    if (nft.collection?.address) {
      if (!itemsByCollectionAddress[nft.collection.address]) {
        itemsByCollectionAddress[nft.collection.address] = [];
      }
      itemsByCollectionAddress[nft.collection.address].push(nft);
    } else {
      individualNfts.push(nft);
    }
  });

  const displayItems: NftDisplayItem[] = [];

  // Process collections
  for (const collectionAddress in itemsByCollectionAddress) {
    const nftsInGroup = itemsByCollectionAddress[collectionAddress];
    if (nftsInGroup.length > 1) { // Only group if more than one NFT in the same collection
      const firstNftOfGroup = nftsInGroup[0];
      displayItems.push({
        isGroup: true,
        collectionAddress: collectionAddress,
        collectionName: firstNftOfGroup.collection?.name || 'Unknown Collection',
        // Use collection image if available, else first NFT's image as representative
        collectionImageUrl: firstNftOfGroup.collection?.image || firstNftOfGroup.imageUrl,
        nfts: nftsInGroup,
        count: nftsInGroup.length,
      });
    } else {
      // If only one NFT is in a "collection", treat it as an individual item
      nftsInGroup.forEach(nft => displayItems.push({ ...nft, isGroup: false }));
    }
  }

  // Add NFTs that were not part of any collection or were in single-item collections
  individualNfts.forEach(nft => displayItems.push({ ...nft, isGroup: false }));

  // Sort display items: groups first by count (desc), then individual NFTs by name (asc)
  return displayItems.sort((a, b) => {
    if (a.isGroup && !b.isGroup) return -1; // Groups first
    if (!a.isGroup && b.isGroup) return 1;  // Groups first
    if (a.isGroup && b.isGroup) return (b as NftCollectionGroup).count - (a as NftCollectionGroup).count; // Sort groups by count

    // Sort individual NFTs by name
    const nameA = !a.isGroup ? (a as CollectibleInfo).name.toLowerCase() : "";
    const nameB = !b.isGroup ? (b as CollectibleInfo).name.toLowerCase() : "";
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
};


export function useNfts() {
  const { activeAccount } = useAppStore();
  const { cluster: solanaClusterName, endpoint: solanaEndpoint } = useSolana();

  const [displayItems, setDisplayItems] = useState<NftDisplayItem[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchingRef = useRef<boolean>(false); // Prevents concurrent fetch operations
  const lastFetchedKeyRef = useRef<string | null>(null); // Tracks the cache key of the last initiated fetch

  const fetchAndSetNfts = useCallback(async (publicKeyString: string, currentCluster: string, currentEndpoint: string) => {
    if (fetchingRef.current) return; // Avoid concurrent fetches
    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    const cacheKey = getNftCacheKey(publicKeyString, currentCluster, currentEndpoint);
    lastFetchedKeyRef.current = cacheKey; // Store current fetch key to handle stale responses

    const cached = nftCache.get(cacheKey);
    if (cached && (Date.now() - cached.lastFetchTimestamp < NFT_CACHE_DURATION_MS)) {
      setDisplayItems(cached.displayItems); // Load from valid cache
      setIsLoading(false);
      fetchingRef.current = false;
      return;
    }

    try {
      chrome.runtime.sendMessage(
        { action: 'fetchNFTs', payload: { ownerPublicKey: publicKeyString } },
        (response) => {
          // If cache key changed (e.g., user switched accounts/networks quickly), ignore stale response
          if (lastFetchedKeyRef.current !== cacheKey) {
            fetchingRef.current = false;
            return;
          }

          if (chrome.runtime.lastError) {
            setError(chrome.runtime.lastError.message || "Communication error fetching NFTs.");
            setDisplayItems(null);
          } else if (response && response.success) {
            const fetchedCollectibles: CollectibleInfo[] = response.nfts || [];
            const grouped = groupNftsByCollection(fetchedCollectibles); // Group NFTs
            setDisplayItems(grouped);
            nftCache.set(cacheKey, { // Update cache
              publicKey: publicKeyString,
              cluster: currentCluster,
              endpoint: currentEndpoint,
              displayItems: grouped,
              lastFetchTimestamp: Date.now(),
            });
          } else {
            setError(response?.error || "Unknown error fetching NFTs from background.");
            setDisplayItems(null);
          }
          setIsLoading(false);
          fetchingRef.current = false;
        }
      );
    } catch (err: any) {
      setError(err.message || "Failed to initiate NFT fetch request.");
      setDisplayItems(null);
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, []); // Empty dependency array as it defines the function, not reacting to changes itself

  // Effect to trigger NFT fetching when active account or network context changes
  useEffect(() => {
    const currentPk = activeAccount?.publicKey;
    if (currentPk && solanaClusterName && solanaEndpoint) {
      fetchAndSetNfts(currentPk, solanaClusterName, solanaEndpoint);
    } else {
      // Clear data if no active account or network
      setDisplayItems(null);
      setIsLoading(!currentPk); // Set loading if pk exists but context might be missing
      setError(null);
    }
  }, [activeAccount?.publicKey, solanaClusterName, solanaEndpoint, fetchAndSetNfts]);

  // Function to manually refresh NFT data
  const refreshNfts = useCallback(() => {
    const currentPk = activeAccount?.publicKey;
    if (currentPk && solanaClusterName && solanaEndpoint) {
      const cacheKey = getNftCacheKey(currentPk, solanaClusterName, solanaEndpoint);
      nftCache.delete(cacheKey); // Clear cache for this account/network
      fetchAndSetNfts(currentPk, solanaClusterName, solanaEndpoint); // Re-fetch
    }
  }, [activeAccount?.publicKey, solanaClusterName, solanaEndpoint, fetchAndSetNfts]);

  return { displayItems, isLoading, error, refreshNfts };
}