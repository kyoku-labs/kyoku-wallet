// src/popup/MainPopupApp.tsx
import React, { useEffect, useCallback, useState } from 'react';
import PasswordPage from './PasswordPage';
import WalletDashboard, { WalletDashboardProps } from './unlocked/WalletDashboard';
import ReceiveView from './views/ReceiveView';
import ConfirmationModal from './unlocked/components/confirm';
import SettingsView from './views/settings/SettingsView';
import GenerateMnemonicPrompt from './views/GenerateMnemonicPrompt';
import SendView from './views/send/SendView';
import SwapView from './views/SwapView';
import ConfirmSwapTransactionView from './views/ConfirmSwapTransactionView';
import SwapSuccessView from './views/SwapSuccessView';
import SwapErrorView from './views/SwapErrorView';
import { AccountMetadata } from '../background/core/keyring/types';
import { useAppStore } from '../store/appStore';
import { useCreateDerivedAccount } from '../hooks/useCreateDerivedAccount';
import { DEFAULT_EXPLORER_ID } from '../utils/explorerUtils';
import type { PriorityFeeLevel } from '../background/shared/state';
import { useTranslation } from 'react-i18next';

import ShowPrivateKeyModal from './unlocked/components/ShowPrivateKeyModal';
import ShowSeedPhraseModal from './unlocked/components/ShowSeedPhraseModal';
import AccountSettingsView from './views/AccountSettingsView';
import RenameModal from './unlocked/components/RenameModal';
import TokenManagementView from './views/TokenManagementView';
import NftManagementView from './views/NftManagementView';
import TokenDetailsView from './views/TokenDetailsView';
import NftDetailView from './views/NftDetailView';
import ActivityTransactionDetailsView from './views/ActivityTransactionDetailsView';

const MainPopupApp: React.FC = () => {
  const { t, i18n } = useTranslation(); // Initialize useTranslation
  const {
    isInitialLoading,
    isLoading,
    isLocked,
    currentView,
    activeAccount,
    allAccounts,
    loadingError,
    viewingAccountSettingsFor,
    viewingTokenDetails,
    viewingNftDetails,
    viewingActivityTransactionDetails,
    transactionForConfirmation,
    selectedLanguage,

    setIsInitialLoading,
    setIsLoading,
    setView,
    setActiveAccount,
    setAllAccounts,
    setError,
    unlockWallet,
    lockWallet,
    updateAccountName,
    setLockedState,
    setNetworkConfiguration,
    setPreferredExplorerId,
    setPriorityFeeLevel,
    setSelectedCurrency,
    setSelectedLanguage,
    setViewAccountSettings,
    setSendViewInitialToken,
  } = useAppStore();

  const [accountToDelete, setAccountToDelete] = useState<AccountMetadata | null>(null);
  const [showPrivateKeyModalFor, setShowPrivateKeyModalFor] = useState<{uuid: string, name: string} | null>(null);
  const [showSeedPhraseModalFor, setShowSeedPhraseModalFor] = useState<{uuid: string, name: string} | null>(null);
  const [renameModalTarget, setRenameModalTarget] = useState<{uuid: string, currentName: string} | null>(null);

  useEffect(() => {
    if (selectedLanguage && selectedLanguage !== i18n.language) {
      i18n.changeLanguage(selectedLanguage);
     // console.log(`[MainPopupApp] i18next language changed to: ${selectedLanguage}`);
    }
  }, [selectedLanguage, i18n]);

  const reportActivity = useCallback(() => {
      if (!useAppStore.getState().isLocked) {
          chrome.runtime.sendMessage({ action: 'resetAutoLockTimer' });
      }
  }, []);

  const handleLockWallet = useCallback(() => {
      chrome.runtime.sendMessage({ action: 'forceLockWallet' });
  }, []);

  const fetchInitialState = useCallback(async () => {
    setIsInitialLoading(true); setError(null);
    try {
        chrome.runtime.sendMessage({ action: 'getInitialState' }, (response) => {
            if (chrome.runtime.lastError) {
                setError(t('mainPopupApp.errors.connectFailed', { error: chrome.runtime.lastError.message || t('common.unknownError') }));
                setLockedState(true);
                setNetworkConfiguration('mainnet-beta', null);
                setPreferredExplorerId(DEFAULT_EXPLORER_ID);
                setSelectedCurrency('USD');
                const initialLang = 'en';
                setSelectedLanguage(initialLang);
                if (i18n.language !== initialLang) i18n.changeLanguage(initialLang);
                setIsInitialLoading(false);
                return;
            }
            if (response) {
              if (response.success) {
                  if (response.network !== undefined) setNetworkConfiguration(response.network, response.customRpcUrl);
                  else setNetworkConfiguration('mainnet-beta', null);
                  if (response.preferredExplorerId) setPreferredExplorerId(response.preferredExplorerId);
                  else setPreferredExplorerId(DEFAULT_EXPLORER_ID);
                  
                  if (response.selectedCurrency) setSelectedCurrency(response.selectedCurrency);
                  else setSelectedCurrency('USD');
                  
                  const loadedLang = response.selectedLanguage || 'en';
                  setSelectedLanguage(loadedLang);
                  if (i18n.language !== loadedLang) i18n.changeLanguage(loadedLang);

                  if (response.isLocked) {
                      setLockedState(true);
                  } else {
                      const validActiveAccount = response.activeAccount && typeof response.activeAccount === 'object' ? response.activeAccount : null;
                      const validAllAccounts = Array.isArray(response.allAccounts) ? response.allAccounts : [];
                      unlockWallet(validActiveAccount, validAllAccounts);
                      if (validActiveAccount || validAllAccounts.length > 0) reportActivity();
                  }
              } else {
                  setError(response.error || t('mainPopupApp.errors.getInitialStateFailed')); setLockedState(true);
                  setNetworkConfiguration('mainnet-beta', null); setPreferredExplorerId(DEFAULT_EXPLORER_ID);
                  setSelectedCurrency('USD');
                  const initialLang = 'en';
                  setSelectedLanguage(initialLang);
                  if (i18n.language !== initialLang) i18n.changeLanguage(initialLang);
              }
            } else {
              setError(t('mainPopupApp.errors.noBackgroundResponse')); setLockedState(true);
              setNetworkConfiguration('mainnet-beta', null); setPreferredExplorerId(DEFAULT_EXPLORER_ID);
              setSelectedCurrency('USD');
              const initialLang = 'en';
              setSelectedLanguage(initialLang);
              if (i18n.language !== initialLang) i18n.changeLanguage(initialLang);
            }

            chrome.runtime.sendMessage({ action: 'getUserPriorityFeeSetting' }, (feeResponse) => {
              setIsInitialLoading(false);
              if (chrome.runtime.lastError) {
               //   console.error("[MainPopupApp] Error fetching priority fee setting:", chrome.runtime.lastError.message);
              } else if (feeResponse && feeResponse.success && feeResponse.level) {
                  setPriorityFeeLevel(feeResponse.level as PriorityFeeLevel);
              } else {
                 // console.warn("[MainPopupApp] Failed to get priority fee setting from background or invalid response:", feeResponse?.error);
              }
            });
        });
    } catch (e: any) {
        setError(t('mainPopupApp.errors.commError', { error: e.message })); setLockedState(true); setIsInitialLoading(false);
        setNetworkConfiguration('mainnet-beta', null); setPreferredExplorerId(DEFAULT_EXPLORER_ID);
        setSelectedCurrency('USD');
        const initialLang = 'en';
        setSelectedLanguage(initialLang);
        if (i18n.language !== initialLang) i18n.changeLanguage(initialLang);
    }
  }, [setIsInitialLoading, setError, setLockedState, unlockWallet, reportActivity, setNetworkConfiguration, setPreferredExplorerId, setPriorityFeeLevel, setSelectedCurrency, setSelectedLanguage, i18n, t]);

  const handleUnlockSuccess = useCallback((unlockedActiveAcct: AccountMetadata | null) => {
    chrome.runtime.sendMessage({ action: 'getAccountsMetadata' }, (response) => {
        const validUnlockedActiveAcct = unlockedActiveAcct && typeof unlockedActiveAcct === 'object' ? unlockedActiveAcct : null;
        if (chrome.runtime.lastError || !response?.success) {
            setError(chrome.runtime.lastError?.message || response?.error || t('mainPopupApp.errors.loadAccountsFailedAfterUnlock'));
            unlockWallet(validUnlockedActiveAcct, validUnlockedActiveAcct ? [validUnlockedActiveAcct] : []);
        } else {
            const validResponseActiveAccount = response.activeAccount && typeof response.activeAccount === 'object' ? response.activeAccount : null;
            const validResponseAllAccounts = Array.isArray(response.accounts) ? response.accounts : [];
            unlockWallet(validResponseActiveAccount || validUnlockedActiveAcct, validResponseAllAccounts);
        }
        if (useAppStore.getState().activeAccount || useAppStore.getState().allAccounts.length > 0) {
            reportActivity();
        }
    });
  }, [unlockWallet, reportActivity, setError, t]);

  const handleSwitchAccount = useCallback(async (uuid: string) => {
    reportActivity(); setIsLoading(true); setError(null);
    chrome.runtime.sendMessage({ action: 'setActiveAccount', payload: { uuid } }, (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError) { setError(t('mainPopupApp.errors.accountSwitchFailed', { error: chrome.runtime.lastError.message })); return; }
        if (response?.success && response.activeAccount) { setActiveAccount(response.activeAccount); }
        else { setError(response?.error || t('mainPopupApp.errors.accountSwitchFailedUnknown')); }
    });
  }, [reportActivity, setActiveAccount, setError, setIsLoading, t]);

  const { createNewAccount, showGeneratePrompt, dismissGeneratePrompt } = useCreateDerivedAccount(fetchInitialState);

  const openOnboardingTab = useCallback((hashFragment: string = '') => {
    reportActivity(); setError(null);
    try {
        const url = chrome.runtime.getURL(`onboarding.html${hashFragment ? '#' + hashFragment : ''}`);
        chrome.tabs.create({ url });
        window.close();
    } catch (e: any) { setError(t('mainPopupApp.errors.openOnboardingFailed', { error: e.message })); }
  }, [reportActivity, setError, t]);

  const handleInitiateMnemonicImport = useCallback(() => openOnboardingTab('import=mnemonic'), [openOnboardingTab]);
  const handleInitiatePrivateKeyImport = useCallback(() => openOnboardingTab('import=privateKey'), [openOnboardingTab]);
  const handleInitiateViewOnlyAdd = useCallback(() => openOnboardingTab('import=publicKey'), [openOnboardingTab]);
  const handleInitiateMnemonicGeneration = useCallback(() => { dismissGeneratePrompt(); openOnboardingTab('generateMnemonic'); }, [openOnboardingTab, dismissGeneratePrompt]);

  const handleShowReceiveView = useCallback(() => { reportActivity(); setView('RECEIVE'); }, [reportActivity, setView]);
  const handleCreateNewWalletAccount = useCallback(async () => { reportActivity(); await createNewAccount(); }, [reportActivity, createNewAccount]);
  const handleShowSettings = useCallback(() => { reportActivity(); setView('SETTINGS'); }, [reportActivity, setView]);

  const handleShowSendFlow = useCallback(() => {
    reportActivity();
    setSendViewInitialToken(null);
    setView('SEND_FLOW');
  }, [reportActivity, setView, setSendViewInitialToken]);

  const handleShowSwapView = useCallback(() => {
    reportActivity();
    setView('SWAP_VIEW');
  }, [reportActivity, setView]);


  const handleRenameAccountCallback = useCallback(async (uuid: string, newName: string) => {
    reportActivity();
    const oldName = allAccounts.find(a => a.uuid === uuid)?.name;
    updateAccountName(uuid, newName);
    setError(null);
    chrome.runtime.sendMessage({ action: 'renameAccount', payload: { uuid, newName } }, (response) => {
         if (chrome.runtime.lastError || !response?.success) {
            if (oldName) updateAccountName(uuid, oldName);
            setError(response?.error || t('mainPopupApp.errors.renameFailed', { error: chrome.runtime.lastError?.message }));
        }
    });
  }, [reportActivity, updateAccountName, setError, allAccounts, t]);

  const handleReorderAccount = useCallback((uuid: string, toIndex: number) => {
    reportActivity();
    const currentIndex = allAccounts.findIndex(a => a.uuid === uuid);
    if (currentIndex === -1 || toIndex < 0 || toIndex >= allAccounts.length || currentIndex === toIndex) return;

    const originalOrder = [...allAccounts];
    const reordered = [...allAccounts];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setAllAccounts(reordered);
    setError(null);

    chrome.runtime.sendMessage({ action: 'saveAccountOrder', payload: { orderedUuids: reordered.map(acc => acc.uuid) } }, (response) => {
         if (chrome.runtime.lastError || !response?.success) {
            setError(t('mainPopupApp.errors.saveOrderFailed'));
            setAllAccounts(originalOrder);
        }
    });
  }, [allAccounts, reportActivity, setAllAccounts, setError, t]);

  const handleDeleteAccount = useCallback((uuid: string) => {
    reportActivity();
    const target = allAccounts.find(acc => acc.uuid === uuid);
    if (!target) { setError(t('mainPopupApp.errors.accountNotFoundForDelete')); return; }
    const nonViewOnlyAccounts = allAccounts.filter(acc => !acc.isViewOnly);
    if (nonViewOnlyAccounts.length <= 1 && !target.isViewOnly) {
        setError(t('mainPopupApp.errors.cannotDeleteLastNonViewOnly'));
        return;
    }
    setAccountToDelete(target);
  }, [reportActivity, allAccounts, setError, t]);

  const nonViewOnlyAccountsExist = (accs: AccountMetadata[]): boolean => {
    return accs.some(acc => !acc.isViewOnly);
  };

  const confirmAndDeleteAccount = useCallback(() => {
    if (!accountToDelete) return;
    const {uuid, name} = accountToDelete;
    setAccountToDelete(null); setIsLoading(true); setError(null);

    chrome.runtime.sendMessage({ action: 'deleteAccount', payload: { uuid } }, (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError) { setError(t('mainPopupApp.errors.deleteFailed', { error: chrome.runtime.lastError.message })); return; }

        if (response?.success) {
            const validActiveAccount = response.activeAccount && typeof response.activeAccount === 'object' ? response.activeAccount : null;
            const validAllAccounts = Array.isArray(response.allAccounts) ? response.allAccounts : [];
            setActiveAccount(validActiveAccount);
            setAllAccounts(validAllAccounts);

            if (!nonViewOnlyAccountsExist(validAllAccounts)) {
                openOnboardingTab();
            }
            if (viewingAccountSettingsFor?.uuid === uuid) {
                setViewAccountSettings(null);
            }

        } else {
            setError(response?.error || t('mainPopupApp.errors.deleteFailedNamed', { name: name }));
        }
    });
  }, [accountToDelete, setIsLoading, setError, setActiveAccount, setAllAccounts, openOnboardingTab, viewingAccountSettingsFor, setViewAccountSettings, t]);

  const handleShowPrivateKey = useCallback((uuid: string, accountName: string) => {
    reportActivity();
    setShowPrivateKeyModalFor({ uuid, name: accountName });
  }, [reportActivity]);

  const handleShowSeedPhrase = useCallback((uuid: string, accountName: string) => {
    reportActivity();
    setShowSeedPhraseModalFor({ uuid, name: accountName });
  }, [reportActivity]);

  const handleShowAccountSettings = useCallback((account: AccountMetadata) => {
    reportActivity();
    setViewAccountSettings(account);
  }, [reportActivity, setViewAccountSettings]);

  const handleRenameFromAccountSettings = useCallback((uuid: string, currentName: string) => {
    setRenameModalTarget({ uuid, currentName });
  }, []);

  useEffect(() => { fetchInitialState(); }, [fetchInitialState]);

  useEffect(() => {
    const listener = (message: any, sender: chrome.runtime.MessageSender) => {
        if (sender.id !== chrome.runtime.id || (sender.url && !sender.url.startsWith('chrome-extension://'))) return;

        if (message.action === 'forceLockFromBackground') {
            if (!useAppStore.getState().isLocked) {
                lockWallet();
            } else {
                if (useAppStore.getState().currentView !== 'LOCKED') {
                    setView('LOCKED');
                }
            }
        }
        if (message.action === 'networkConfigurationChanged') {
            if (message.payload && typeof message.payload.network === 'string') {
                 setNetworkConfiguration(message.payload.network, message.payload.customRpcUrl);
            } else {
              //  console.warn("[MainPopupApp] networkConfigurationChanged message received with invalid payload.", message.payload);
            }
        }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [lockWallet, setNetworkConfiguration, setView]);

  const renderCurrentView = () => {
      if (isInitialLoading) { return <div className="flex justify-center items-center h-full text-lg text-gray-400">{t('mainPopupApp.loadingWallet')}</div>; } {/* Translate */}

      if (isLocked) { return <PasswordPage onUnlockSuccess={handleUnlockSuccess} />; }

      if (currentView === 'CONFIRM_TRANSACTION' && transactionForConfirmation) {
        if (transactionForConfirmation.sourceView === 'SWAP_VIEW') {
            return <ConfirmSwapTransactionView />;
        }
       // console.warn("MainPopupApp: CONFIRM_TRANSACTION view with unhandled source:", transactionForConfirmation.sourceView);
        setView('DASHBOARD'); 
        return null;
      }
      if (currentView === 'SWAP_SUCCESS') {
        return <SwapSuccessView />;
      }
      if (currentView === 'SWAP_ERROR') {
        return <SwapErrorView />;
      }


      if (currentView === 'SEND_FLOW' && activeAccount) {
        return ( <SendView onClose={() => { setSendViewInitialToken(null); setView('DASHBOARD'); }} /> );
      }
      if (currentView === 'SWAP_VIEW' && activeAccount) {
        return ( <SwapView onClose={() => setView('DASHBOARD')} /> );
      }
      if (currentView === 'ACCOUNT_SETTINGS' && viewingAccountSettingsFor) {
        return ( <AccountSettingsView account={viewingAccountSettingsFor} onBack={() => setViewAccountSettings(null)} onRename={handleRenameFromAccountSettings} onShowPrivateKey={handleShowPrivateKey} onShowSeedPhrase={handleShowSeedPhrase} onRemove={() => { setAccountToDelete(viewingAccountSettingsFor); }} /> );
      }
      if (currentView === 'TOKEN_MANAGEMENT') {
        return ( <TokenManagementView onClose={() => setView('DASHBOARD')} /> );
      }
      if (currentView === 'NFT_MANAGEMENT') {
        return ( <NftManagementView /> );
      }
      if (currentView === 'TOKEN_DETAILS' && viewingTokenDetails) {
          return <TokenDetailsView />;
      }
      if (currentView === 'NFT_DETAILS' && viewingNftDetails) {
        return <NftDetailView />;
      }
      if (currentView === 'ACTIVITY_TRANSACTION_DETAILS' && viewingActivityTransactionDetails) {
        return <ActivityTransactionDetailsView />;
      }
      if (!nonViewOnlyAccountsExist(allAccounts) && currentView !== 'GENERATE_MNEMONIC_PROMPT' && !showGeneratePrompt) {
          if (allAccounts.length > 0 && allAccounts.every(acc => acc.isViewOnly)) {
             setView('GENERATE_MNEMONIC_PROMPT');
          } else {
             openOnboardingTab();
             return <div className="flex justify-center items-center h-full">{t('mainPopupApp.redirectingToSetup')}</div>; {/* Translate */}
          }
      }
      if (currentView === 'RECEIVE' && activeAccount) { return <ReceiveView activeAccount={activeAccount} onClose={() => setView('DASHBOARD')} />; }
      if (currentView === 'SETTINGS') { return <SettingsView onClose={() => setView('DASHBOARD')} />; }
      if (currentView === 'GENERATE_MNEMONIC_PROMPT' || showGeneratePrompt) {
          return <GenerateMnemonicPrompt onContinue={handleInitiateMnemonicGeneration} onCancel={() => { dismissGeneratePrompt(); if (!nonViewOnlyAccountsExist(useAppStore.getState().allAccounts)) openOnboardingTab(); else setView('DASHBOARD'); }}  />;
      }

      const currentActiveForDashboard = activeAccount || (allAccounts.length > 0 ? allAccounts[0] : null);
      if (!currentActiveForDashboard && allAccounts.length === 0 && !isLoading && !isInitialLoading) {
           openOnboardingTab();
           return <div className="flex justify-center items-center h-full">{t('mainPopupApp.redirectingToSetup')}</div>; {/* Translate */}
      }

      const dashboardProps: WalletDashboardProps = {
          accounts: allAccounts, activeAccount: currentActiveForDashboard, onSwitchAccount: handleSwitchAccount,
          onInitiateMnemonicImport: handleInitiateMnemonicImport, onInitiatePrivateKeyImport: handleInitiatePrivateKeyImport,
          onInitiateViewOnlyAdd: handleInitiateViewOnlyAdd, onCreateNewAccount: handleCreateNewWalletAccount,
          onLockWallet: handleLockWallet,
          onShowReceiveView: handleShowReceiveView,
          onReorderAccount: handleReorderAccount,
          onShowSettings: handleShowSettings,
          onShowSendView: handleShowSendFlow,
          onShowSwapView: handleShowSwapView,
          onShowAccountSettings: handleShowAccountSettings,
          onRenameAccount: handleRenameAccountCallback,
          onDeleteAccount: handleDeleteAccount,
          onShowPrivateKey: handleShowPrivateKey,
          onShowSeedPhrase: handleShowSeedPhrase,
      };
      return <WalletDashboard {...dashboardProps} />;
  };

  // Prepare translated text for ConfirmationModal
  const deleteAccountModalTitle = t('mainPopupApp.deleteModal.title');
  const deleteAccountModalConfirmText = t('buttons.delete');
  const deleteAccountModalCancelText = t('buttons.cancel');
  
  // Prepare translated message parts for ConfirmationModal
  const deleteAccountMessagePart1 = t('mainPopupApp.deleteModal.messagePart1');
  const deleteAccountMessagePart2 = t('mainPopupApp.deleteModal.messagePart2');
  const deleteAccountMessageWarning = t('mainPopupApp.deleteModal.warning');


  return (
    <div
      className="bg-[#090f14] text-white w-full h-full flex flex-col overflow-hidden"
      onMouseMove={reportActivity}
      onClick={reportActivity}
      onKeyDown={reportActivity}
      tabIndex={-1}
    >
      {loadingError && currentView !== 'SEND_FLOW' && currentView !== 'SWAP_VIEW' && currentView !== 'CONFIRM_TRANSACTION' && currentView !== 'SWAP_SUCCESS' && currentView !== 'SWAP_ERROR' && (
        <div className="p-2 bg-red-800 text-red-100 text-xs text-center z-10 flex justify-between items-center flex-shrink-0">
          <span className="flex-1 mr-2 break-words">{loadingError}</span> {/* Error messages are already translated when set */}
          <button onClick={() => setError(null)} className="p-1 leading-none text-lg font-bold hover:text-red-300 flex-shrink-0" aria-label={t('mainPopupApp.dismissErrorAriaLabel')}>&times;</button> {/* Translate aria-label */}
        </div>
      )}
      <div className="flex-grow overflow-hidden relative min-h-0">
          {renderCurrentView()}
          {isLoading && !isInitialLoading && currentView !== 'SEND_FLOW' && currentView !== 'SWAP_VIEW' && currentView !== 'CONFIRM_TRANSACTION' && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 backdrop-blur-sm">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
            </div>
          )}
      </div>
      <ConfirmationModal
        isOpen={!!accountToDelete}
        title={deleteAccountModalTitle}
        message={ accountToDelete ? (
          <span>
            {deleteAccountMessagePart1} <strong className="font-medium text-white">{accountToDelete.name}</strong>
            <br/>({truncatePublicKey(accountToDelete.publicKey, 8)}){deleteAccountMessagePart2}
            <br/><br/>
            <strong className="text-red-400">{deleteAccountMessageWarning}</strong>
          </span>
        ) : '' }
        confirmText={deleteAccountModalConfirmText}
        cancelText={deleteAccountModalCancelText}
        isDanger={true}
        onConfirm={confirmAndDeleteAccount}
        onCancel={() => setAccountToDelete(null)}
      />
      {showPrivateKeyModalFor && (
        <ShowPrivateKeyModal
          isOpen={!!showPrivateKeyModalFor}
          onClose={() => setShowPrivateKeyModalFor(null)}
          accountUuid={showPrivateKeyModalFor.uuid}
          accountName={showPrivateKeyModalFor.name}
        />
      )}
      {showSeedPhraseModalFor && (
        <ShowSeedPhraseModal
          isOpen={!!showSeedPhraseModalFor}
          onClose={() => setShowSeedPhraseModalFor(null)}
          accountUuid={showSeedPhraseModalFor.uuid}
          accountName={showSeedPhraseModalFor.name}
        />
      )}
      {renameModalTarget && (
        <RenameModal
          initialName={renameModalTarget.currentName}
          isOpen={!!renameModalTarget}
          onCancel={() => setRenameModalTarget(null)}
          onSave={(newName: string) => {
            handleRenameAccountCallback(renameModalTarget.uuid, newName);
            setRenameModalTarget(null);
          }}
        />
      )}
    </div>
  );
};

const truncatePublicKey = (pk: string, chars = 6): string => {
  if (!pk) return '';
  if (pk.length <= chars * 2 + 3) return pk;
  return `${pk.substring(0, chars)}...${pk.substring(pk.length - chars)}`;
};

export default MainPopupApp;