// src/hooks/useCreateDerivedAccount.ts
import { useState, useCallback } from 'react';
import { useAppStore } from '../store/appStore';

// For refreshing UI state after account creation.
type LoadAccountDataFunc = (showLoadingSpinner?: boolean) => Promise<void>;

type CreationStatus = 'idle' | 'creating' | 'error' | 'needs_mnemonic'; 

interface UseCreateDerivedAccountReturn {
  creationStatus: CreationStatus;
  creationError: string | null;
  createNewAccount: () => Promise<void>;
  showGeneratePrompt: boolean; // Indicates if the prompt to generate a mnemonic should be shown.
  dismissGeneratePrompt: () => void; // Function to hide the prompt.
}

export function useCreateDerivedAccount(
  loadAccountData: LoadAccountDataFunc,
): UseCreateDerivedAccountReturn {
  const { setIsLoading, setError, lockWallet, isLocked } = useAppStore();

  const [creationStatus, setCreationStatus] = useState<CreationStatus>('idle');
  const [creationError, setCreationError] = useState<string | null>(null);
  const [showGeneratePrompt, setShowGeneratePrompt] = useState<boolean>(false);

  // Dismisses the prompt to generate a new mnemonic.
  const dismissGeneratePrompt = useCallback(() => {
    setShowGeneratePrompt(false);
    setCreationStatus('idle'); // Reset status when prompt is dismissed.
  }, []);

  // Creates a new derived account by sending a message to the background script.
  const createNewAccount = useCallback(async () => {
    setCreationError(null);
    setCreationStatus('creating');
    setError(null); // Clear any global errors.
    setIsLoading(true); // Use global loading state.
    setShowGeneratePrompt(false); // Ensure prompt is hidden.

    if (isLocked) { // Check wallet lock state directly from Zustand.
      const err = "Error: Wallet must be unlocked to create account.";
      setError(err); setCreationError(err);
      setCreationStatus('error');
      setIsLoading(false);
      return;
    }

    try {
      chrome.runtime.sendMessage(
        { action: 'createNewDerivedAccount' },
        async (response) => {
          setIsLoading(false);

          if (chrome.runtime.lastError) {
            const err = `Creation failed: ${chrome.runtime.lastError.message || 'Communication error'}`;
            setError(err); setCreationError(err);
            setCreationStatus('error');
            lockWallet(); // Lock wallet on communication error.
            return;
          }

          // Check for specific NO_MNEMONIC_FOUND error from background.
          if (response && !response.success && response.error === 'NO_MNEMONIC_FOUND') {
              setShowGeneratePrompt(true);
              setCreationStatus('needs_mnemonic');
              setError(null);
              setCreationError(null);
          } else if (response && response.success && response.newAccountMetadata) {
              await loadAccountData(false); // Refresh account data in UI.
              setCreationStatus('idle');
              setError(null);
              setCreationError(null);
          } else {
              const err = `Error creating account: ${response?.error || 'Unknown background error'}`;
              setError(err); setCreationError(err);
              setCreationStatus('error');
              // Lock wallet if the error message indicates a locked state.
              if (response?.error?.toLowerCase().includes('locked')) {
                  lockWallet();
              }
          }
        }
      );
    } catch (error: any) {
      const err = `Failed to initiate account creation: ${error.message || 'Unknown error'}`;
      setError(err); setCreationError(err);
      setCreationStatus('error');
      setIsLoading(false);
      lockWallet(); // Lock wallet on unexpected error.
    }
  }, [isLocked, setIsLoading, setError, loadAccountData, lockWallet]);


  return {
    creationStatus,
    creationError,
    createNewAccount,
    showGeneratePrompt,
    dismissGeneratePrompt,
  };
}