import { useState, useEffect, useCallback } from 'react';
import { TokenInfo } from '../background/core/keyring/types';

// Defines the structure for token display preferences.
export interface TokenPreferences {
  hiddenTokens: string[]; // Array of mint addresses for tokens hidden by the user.
  hideLowBalances: boolean; // Whether to hide tokens with a USD value below a certain threshold (e.g., $1).
  showSpamTokens: boolean; // Whether to show tokens identified as potential spam.
}

const STORAGE_KEY = 'wallet_token_preferences'; // Base key for storing preferences.

export const useTokenPreferences = (walletId: string) => {
  const [preferences, setPreferences] = useState<TokenPreferences>({
    hiddenTokens: [],
    hideLowBalances: false,
    showSpamTokens: false, // Default to not showing spam tokens.
  });

  // Load preferences from Chrome storage when the walletId changes.
  useEffect(() => {
    if (!walletId) return;
    try {
      const key = `${STORAGE_KEY}_${walletId}`; // Wallet-specific storage key.
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          // Failed to load token preferences.
          return;
        }
        if (result[key]) {
          const parsedPrefs = result[key] as Partial<TokenPreferences>;
          // Set preferences from storage, ensuring type safety and defaults.
          setPreferences(_prev => ({
            hiddenTokens: parsedPrefs.hiddenTokens || [],
            hideLowBalances: parsedPrefs.hideLowBalances === true,
            showSpamTokens: parsedPrefs.showSpamTokens === true,
          }));
        }
        // If no preferences are found, initial state defaults are used.
      });
    } catch (error) {
      // Failed to load token preferences (e.g., if chrome.storage is unavailable).
    }
  }, [walletId]);

  // Save preferences to Chrome storage.
  const savePreferences = useCallback((newPrefs: TokenPreferences) => {
    if (!walletId) return;
    try {
      const key = `${STORAGE_KEY}_${walletId}`;
      chrome.storage.local.set({ [key]: newPrefs }, () => {
        if (chrome.runtime.lastError) {
          // Failed to save token preferences.
          return;
        }
        setPreferences(newPrefs); // Update local state upon successful save.
      });
    } catch (error) {
      // Failed to save token preferences.
    }
  }, [walletId]);

  // Update multiple preferences at once.
  const updatePreferences = useCallback((updates: Partial<TokenPreferences>) => {
    const newPrefs = { ...preferences, ...updates };
    savePreferences(newPrefs);
  }, [preferences, savePreferences]);

  // Toggle the hidden state of a specific token.
  const toggleHideToken = useCallback((address: string, hidden: boolean) => {
    const currentHidden = preferences.hiddenTokens || [];
    const updatedHiddenTokens = hidden
      ? [...currentHidden, address] // Add to hidden list
      : currentHidden.filter(addr => addr !== address); // Remove from hidden list
    updatePreferences({ hiddenTokens: updatedHiddenTokens });
  }, [preferences.hiddenTokens, updatePreferences]);

  // Toggle the preference for hiding low-balance tokens.
  const toggleHideLowBalances = useCallback((enabled: boolean) => {
    updatePreferences({ hideLowBalances: enabled });
  }, [updatePreferences]);

  // Toggle the preference for showing spam tokens.
  const toggleShowSpamTokens = useCallback((enabled: boolean) => {
    updatePreferences({ showSpamTokens: enabled });
  }, [updatePreferences]);

  // Filters tokens for main dashboard display based on all current preferences.
  const filterTokens = useCallback((tokens: TokenInfo[] | null): TokenInfo[] | null => {
    if (!tokens) return null;

    return tokens.filter((token): token is TokenInfo => {
      if (token.isNative) { // Native token (e.g., SOL) is always shown.
        return true;
      }

      // Spam logic: token is spam if it has no logo AND (no USD price OR no symbol OR no name).
      let isSpam = false;
      if (!token.logo) {
        isSpam = !token.usdPrice || !token.symbol || !token.name;
      }

      if (!preferences.showSpamTokens && isSpam) {
        return false; // Hide if it's spam and user prefers to hide spam.
      }

      if ((preferences.hiddenTokens || []).includes(token.address)) {
        return false; // Hide if explicitly hidden by the user.
      }

      const usdValue = token.usdPrice && typeof token.balance === 'number' ? token.usdPrice * token.balance : 0;
      if (preferences.hideLowBalances && usdValue < 1) {
        return false; // Hide if it has a low balance and user prefers to hide low balances.
      }

      return true; // Show token otherwise.
    });
  }, [preferences]);

  // Filters tokens for the "Manage Token List" view.
  // This view might show spam tokens differently or allow managing them even if hidden on dashboard.
  const filterTokensForManagement = useCallback((allTokens: TokenInfo[] | null): TokenInfo[] | null => {
    if (!allTokens) return null;

    let displayable = allTokens.filter(token => !token.isNative); // Exclude native token from management list.

    if (!preferences.showSpamTokens) {
        // If user prefers not to see spam, filter them out from the management list as well,
        // unless the management view has its own toggle for spam visibility.
        displayable = displayable.filter(token => {
            let isSpamCandidate = false;
            if (!token.logo) {
                isSpamCandidate = !token.usdPrice || !token.symbol || !token.name;
            }
            return !isSpamCandidate;
        });
    }
    return displayable;
  }, [preferences.showSpamTokens]);

  return {
    preferences,
    updatePreferences,
    toggleHideToken,
    toggleHideLowBalances,
    toggleShowSpamTokens,
    filterTokens,
    filterTokensForManagement,
  };
};

export default useTokenPreferences;