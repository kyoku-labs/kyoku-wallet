// src/hooks/useMnemonicImport.ts
import { useState, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { DerivedAccountInfo } from '../background/core/keyring/types';

// Type for the function that refreshes UI state after import.
type LoadAccountDataFunc = (showLoadingSpinner?: boolean) => Promise<void>;

type ScanStatus = 'idle' | 'scanning' | 'selecting' | 'importing' | 'error';

interface UseMnemonicImportReturn {
  scanStatus: ScanStatus;
  derivedAccounts: DerivedAccountInfo[];
  scanError: string | null;
  startMnemonicScan: (mnemonic: string) => Promise<void>;
  confirmAccountSelection: (selectedPaths: string[]) => Promise<void>;
  resetImportFlow: () => void;
}

export function useMnemonicImport(
  loadAccountData: LoadAccountDataFunc,
): UseMnemonicImportReturn {
  const { setView, setError, setIsLoading } = useAppStore();

  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [derivedAccounts, setDerivedAccounts] = useState<DerivedAccountInfo[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  // Initiates a scan for accounts derived from the provided mnemonic.
  const startMnemonicScan = useCallback(async (mnemonic: string) => {
    // Basic client-side validation of the mnemonic phrase.
    if (!mnemonic || mnemonic.trim().split(/\s+/).length < 12) {
        setError("Invalid mnemonic phrase.");
        setView('IMPORT_MNEMONIC'); setScanStatus('error'); setScanError("Invalid mnemonic phrase."); return;
    }

    setDerivedAccounts([]); setScanError(null); setScanStatus('scanning');
    setError(null); setIsLoading(true); setView('IMPORT_MNEMONIC_SCANNING');

    try {
      chrome.runtime.sendMessage(
        { action: 'startMnemonicScan', payload: { mnemonic } }, // Background stages mnemonic if needed later.
        (response) => {
          setIsLoading(false);
          if (chrome.runtime.lastError) {
            const err = `Scan failed: ${chrome.runtime.lastError.message || 'Comm error'}`;
            setError(err); setScanError(err); setScanStatus('error'); setView('IMPORT_MNEMONIC');
            return;
          }
          if (response && response.success && response.accountsToShow) {
             setDerivedAccounts(response.accountsToShow); setScanStatus('selecting');
             setView('IMPORT_MNEMONIC_SELECT_ACCOUNTS'); setError(null);
          } else {
             const err = `Scan failed: ${response?.error || 'Unknown BG error'}`;
             setError(err); setScanError(err); setScanStatus('error'); setView('IMPORT_MNEMONIC');
          }
        }
      );
    } catch (error: any) {
        // Handle synchronous errors during chrome.runtime.sendMessage, though less common.
        setIsLoading(false);
        const err = `Scan initiation failed: ${error.message || 'Unknown error'}`;
        setError(err); setScanError(err); setScanStatus('error'); setView('IMPORT_MNEMONIC');
     }
  }, [setView, setError, setIsLoading]);


  // Confirms the selection of derived accounts and requests their import.
  const confirmAccountSelection = useCallback(async (selectedPaths: string[]) => {
    if (selectedPaths.length === 0) {
        setError("No accounts were selected for import.");
        setScanError("No accounts were selected for import.");
        // Keep scanStatus as 'selecting' to allow user to correct.
        return;
    }

    setScanStatus('importing');
    setIsLoading(true); setError(null);

    try {
        // Send one message to the background with all selected paths for import.
        chrome.runtime.sendMessage(
            { action: 'importFromStagedMnemonic', payload: { paths: selectedPaths } },
            async (response) => {
                setIsLoading(false);

                if (chrome.runtime.lastError) {
                    const err = `Import failed: ${chrome.runtime.lastError.message || 'Comm error'}`;
                    setError(err); setScanError(err); setScanStatus('error');
                    setView('DASHBOARD'); // Navigate to dashboard on communication failure.
                    return;
                }

                if (response && response.success) {
                    // Background reported overall success (at least one account imported).
                    const addedCount = response.addedAccounts?.length || 0;
                    const failedCount = selectedPaths.length - addedCount;
                    // TODO: Replace alert with a better notification system.
                    const message = `${addedCount} account(s) imported successfully! ${failedCount > 0 ? `(${failedCount} failed: ${response.error || 'Check logs'})` : ''}`;
                    alert(message);
                    await loadAccountData(false); // Refresh UI state.
                    setView('DASHBOARD');
                    setScanStatus('idle'); // Reset hook state.
                    setError(null);
                } else {
                    // Background reported failure.
                    const err = `Import failed: ${response?.error || 'Unknown BG error'}`;
                    setError(err); setScanError(err);
                    setScanStatus('selecting'); // Allow user to re-select or cancel.
                    setView('IMPORT_MNEMONIC_SELECT_ACCOUNTS');
                    // TODO: Replace alert with a better notification system.
                    alert(`Failed to import accounts. Error: ${err}`);
                }
            }
        );
    } catch (error: any) {
        // Catch synchronous errors during message sending.
        const err = `Import process failed unexpectedly: ${error.message}`;
        setError(err); setScanError(err); setScanStatus('error');
        setIsLoading(false);
        setView('DASHBOARD'); // Navigate to dashboard on unexpected error.
    }
  }, [loadAccountData, setView, setError, setIsLoading]);


  // Resets the state of the import flow.
   const resetImportFlow = useCallback(() => {
      setScanStatus('idle');
      setDerivedAccounts([]);
      setScanError(null);
      setError(null);
      setIsLoading(false);
   }, [setError, setIsLoading]);


  return {
    scanStatus,
    derivedAccounts,
    scanError,
    startMnemonicScan,
    confirmAccountSelection,
    resetImportFlow,
  };
}