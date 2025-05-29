// src/hooks/useNftPreferences.ts
import { useState, useEffect, useCallback } from 'react';
import { CollectibleInfo } from '../background/services/nftTypes';

// Defines the structure for NFT display preferences.
export interface NftPreferences {
  hiddenNfts: string[]; // Array of mint addresses for NFTs to be hidden by the user.
  showPotentialSpamNfts: boolean; // Global toggle to show or hide NFTs flagged as potential spam.
}

const NFT_PREFERENCES_STORAGE_KEY_PREFIX = 'wallet_nft_preferences_';

// Heuristic to identify potential spam based on available CollectibleInfo
// This is no longer used for filtering directly in this hook (relying on isSpam flag from service),
// but kept for reference or other potential uses.
// export const isCollectiblePotentiallySpam = (collectible: CollectibleInfo): boolean => {
//   if (!collectible) return false;
//   // Example heuristics:
//   const hasGenericName = !collectible.name || collectible.name.toLowerCase().startsWith("nft ") || collectible.name.toLowerCase() === "unnamed nft";
//   const hasNoCollectionInfo = !collectible.collection || !collectible.collection.name || collectible.collection.name === "Unknown Collection";
//   const hasNoAttributes = !collectible.attributes || collectible.attributes.length === 0;
//   const hasNoDescription = !collectible.description || collectible.description.trim() === "";

//   // If it's missing a specific collection name AND has a generic NFT name, flag it.
//   if (hasNoCollectionInfo && hasGenericName) {
//     return true;
//   }
//   // If it's missing a description AND attributes, and has a generic name, flag it.
//   if (hasNoDescription && hasNoAttributes && hasGenericName) {
//     return true;
//   }
//   // Add more sophisticated checks if needed, e.g., based on image URL patterns if available,
//   // or specific creator addresses if we maintain such a list.
//   return false;
// };


export const useNftPreferences = (walletId: string | null) => {
  const [preferences, setPreferences] = useState<NftPreferences>({
    hiddenNfts: [],
    showPotentialSpamNfts: false, // Default to hiding potential spam.
  });
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  const storageKey = walletId ? `${NFT_PREFERENCES_STORAGE_KEY_PREFIX}${walletId}` : null;

  // Load preferences from Chrome storage when walletId changes.
  useEffect(() => {
    if (!storageKey) {
      setIsLoadingPreferences(false);
      // Reset to default if no walletId (e.g., user logged out).
      setPreferences({ hiddenNfts: [], showPotentialSpamNfts: false });
      return;
    }

    setIsLoadingPreferences(true);
    chrome.storage.local.get([storageKey], (result) => {
      if (chrome.runtime.lastError) {
        // Failed to load NFT preferences.
      } else if (result[storageKey]) {
        const loadedPrefs = result[storageKey] as Partial<NftPreferences>;
        setPreferences({ // Ensure type safety when loading from storage
          hiddenNfts: Array.isArray(loadedPrefs.hiddenNfts) ? loadedPrefs.hiddenNfts : [],
          showPotentialSpamNfts: typeof loadedPrefs.showPotentialSpamNfts === 'boolean' ? loadedPrefs.showPotentialSpamNfts : false,
        });
      } else {
        // No preferences saved yet for this walletId, use defaults.
        setPreferences({ hiddenNfts: [], showPotentialSpamNfts: false });
      }
      setIsLoadingPreferences(false);
    });
  }, [storageKey]);

  // Save preferences to Chrome storage.
  const savePreferences = useCallback((newPrefs: NftPreferences) => {
    if (!storageKey) return;
    setPreferences(newPrefs); // Optimistically update UI.
    chrome.storage.local.set({ [storageKey]: newPrefs }, () => {
      if (chrome.runtime.lastError) {
        // Failed to save NFT preferences.
        // Optionally revert UI or show error to the user.
      }
    });
  }, [storageKey]);

  // Toggle visibility of a single NFT by its mint address.
  const toggleNftVisibility = useCallback((mintAddress: string) => {
    setPreferences(prev => {
      const newHiddenNfts = prev.hiddenNfts.includes(mintAddress)
        ? prev.hiddenNfts.filter(mint => mint !== mintAddress) // Unhide
        : [...prev.hiddenNfts, mintAddress]; // Hide
      const newPrefs = { ...prev, hiddenNfts: newHiddenNfts };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  // Toggle the global setting for showing or hiding potential spam NFTs.
  const toggleShowPotentialSpamNfts = useCallback(() => {
    setPreferences(prev => {
      const newPrefs = { ...prev, showPotentialSpamNfts: !prev.showPotentialSpamNfts };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  // Filter a list of CollectibleInfo items based on current preferences.
  const filterNftDisplayItems = useCallback((items: CollectibleInfo[] | null | undefined): CollectibleInfo[] => {
    if (!items) return [];
    if (isLoadingPreferences) return []; // Return empty or unfiltered during preference load.

    return items.filter(nft => {
      // Check if explicitly hidden by the user.
      if (preferences.hiddenNfts.includes(nft.mintAddress)) {
        return false;
      }
      // Check if it's potential spam (based on the 'isSpam' flag from the service) and should be hidden.
      if (!preferences.showPotentialSpamNfts && nft.isSpam) {
        return false;
      }
      return true;
    });
  }, [preferences, isLoadingPreferences]);

  return {
    nftPreferences: preferences,
    isLoadingNftPreferences: isLoadingPreferences,
    toggleNftVisibility,
    toggleShowPotentialSpamNfts,
    filterNftDisplayItems,
  };
};