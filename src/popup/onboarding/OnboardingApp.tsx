// src/popup/onboarding/OnboardingApp.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

// Components
import CombinedWalletSetup from './WalletSetup';
import PasswordSetup from './PasswordSetup';
import MnemonicSetup from './MnemonicSetup';
import ImportOptions from './ImportOptions';
import ImportPrivateKey from './importPrivateKey';
import AddViewOnlyAccount from './AddViewOnlyAccount';
import FundedAccountSelector from './FundedAccountSelector';

// Styles and Types
import '@/styles/onboarding.css';
import { SecretType, DerivedAccountInfo } from '../../background/core/keyring/types';

// Constants for session storage keys
const SESSION_STORAGE_KEY = 'onboardingStep_v1';
const SESSION_STORAGE_MODE_KEY = 'onboardingMode_v1';
const SESSION_STORAGE_GENERATE_MODE_KEY = 'onboardingGenerateMode_v1';

// Define the possible steps in the onboarding process
const ONBOARDING_STEPS = [
  'setup',
  'mnemonic_create',
  'password_create',
  'import_options',
  'import_mnemonic',
  'import_private_key',
  'import_public_key',
  'select_import_accounts',
  'complete',
  'import_complete',
  'error_state'
] as const;

type OnboardingStep = typeof ONBOARDING_STEPS[number];

// Helper: Validate OnboardingStep
function isValidOnboardingStep(step: string): step is OnboardingStep {
  return ONBOARDING_STEPS.includes(step as OnboardingStep);
}

// Helper functions for session storage
const STAGED_SECRET_KEY = 'temp_staged_secret_v1';

async function getStagedSecretData(): Promise<{ secret: string; type: SecretType; selectedPaths?: string[] } | null> {
    try {
      const result = await chrome.storage.session.get(STAGED_SECRET_KEY);
      if (result && result[STAGED_SECRET_KEY]) {
        const data = result[STAGED_SECRET_KEY];
        if (typeof data.secret === 'string' && typeof data.type === 'string') {
          return data;
        }
      }
      return null;
    } catch (error) {
    //  console.error("OnboardingApp: Error getting staged data:", error);
      return null;
    }
}

async function setStagedSecretData(data: { secret: string; type: SecretType; selectedPaths?: string[] } | null): Promise<void> {
    try {
      if (data) {
        await chrome.storage.session.set({ [STAGED_SECRET_KEY]: data });
      } else {
        await chrome.storage.session.remove(STAGED_SECRET_KEY);
      }
    } catch (error) {
     // console.error("OnboardingApp: Error setting/removing staged data:", error);
    }
}


const OnboardingApp: React.FC = () => {
  const { t } = useTranslation();

  // --- State ---
  const [step, setStep] = useState<OnboardingStep>(() => {
    const savedStep = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return (savedStep as OnboardingStep) || 'setup';
  });
  const [isGeneratingForExistingWallet, setIsGeneratingForExistingWallet] = useState<boolean>(() => {
    const savedMode = sessionStorage.getItem(SESSION_STORAGE_GENERATE_MODE_KEY);
    return savedMode === 'true';
  });
  const [isAddToExistingWallet, setIsAddToExistingWallet] = useState<boolean>(() => {
    const savedMode = sessionStorage.getItem(SESSION_STORAGE_MODE_KEY);
    return savedMode === 'true';
  });
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitialChecking, setIsInitialChecking] = useState(true);
  const [derivedAccountsForSelection, setDerivedAccountsForSelection] = useState<DerivedAccountInfo[]>([]);

  // --- Effects ---

  useEffect(() => {
    //  console.log("OnboardingApp: Initializing...");
      const savedStep = sessionStorage.getItem(SESSION_STORAGE_KEY);
      const savedMode = sessionStorage.getItem(SESSION_STORAGE_MODE_KEY);
      const savedGenerateMode = sessionStorage.getItem(SESSION_STORAGE_GENERATE_MODE_KEY);
      const hash = window.location.hash.substring(1);

      let initialStep: OnboardingStep = 'setup';
      let isAddingMode = false;
      let isGeneratingMode = false;

      if (hash === 'generateMnemonic') {
        //  console.log("OnboardingApp: Detected #generateMnemonic hash.");
          isGeneratingMode = true;
          initialStep = 'mnemonic_create';
          isAddingMode = false;
      } else if (hash.startsWith('import=')) {
         // console.log("OnboardingApp: Detected #import hash.");
          const importType = hash.split('=')[1];
          isAddingMode = true;
          isGeneratingMode = false;
          if (importType === 'mnemonic') initialStep = 'import_mnemonic';
          else if (importType === 'privateKey') initialStep = 'import_private_key';
          else if (importType === 'publicKey') initialStep = 'import_public_key';
          else initialStep = 'setup';
      } else if (savedStep && isValidOnboardingStep(savedStep)) {
        //  console.log("OnboardingApp: Resuming from session storage.");
          initialStep = savedStep as OnboardingStep;
          isAddingMode = savedMode === 'true';
          isGeneratingMode = savedGenerateMode === 'true';
      } else {
        //   console.log("OnboardingApp: Starting fresh setup.");
           initialStep = 'setup';
           isAddingMode = false;
           isGeneratingMode = false;
      }

      if (window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      setIsAddToExistingWallet(isAddingMode);
      setIsGeneratingForExistingWallet(isGeneratingMode);
      setStep(initialStep);

      if (initialStep === 'setup' && !isGeneratingMode) {
        //  console.log("OnboardingApp: Checking if wallet already initialized...");
          chrome.runtime.sendMessage({ action: 'checkKeyringStatus' }, (response) => {
              if (chrome.runtime.lastError || !response) {
                  console.error("Error checking wallet status:", chrome.runtime.lastError);
                  setSetupError(t('onboardingApp.errors.verifyStatusFailed'));
                  setStep('error_state');
              } else if (response.isInitialized) {
              //    console.log("OnboardingApp: Wallet already initialized, showing setup screen.");
              } else {
               //   console.log("OnboardingApp: Wallet not initialized, proceeding with setup.");
              }
              setIsInitialChecking(false);
          });
      } else {
          setIsInitialChecking(false);
      }

       if (initialStep === 'password_create' || initialStep === 'select_import_accounts') {
        //   console.log(`OnboardingApp: Resuming on step ${initialStep}, checking staged secret...`);
           setIsLoading(true);
           chrome.runtime.sendMessage({ action: 'isSecretStaged' }, (response) => {
               setIsLoading(false);
               if (chrome.runtime.lastError || !response?.success || !response.isStaged) {
                   console.error("OnboardingApp: Staged secret check failed or secret not found.");
                   setSetupError(t('onboardingApp.errors.stateLost'));
                   setStep('error_state');
               } else {
               //    console.log("OnboardingApp: Staged secret found.");
               }
           });
       }
  }, [t]);

  useEffect(() => {
    if (step !== 'complete' && step !== 'import_complete' && step !== 'error_state') {
        sessionStorage.setItem(SESSION_STORAGE_KEY, step);
        sessionStorage.setItem(SESSION_STORAGE_MODE_KEY, isAddToExistingWallet.toString());
        sessionStorage.setItem(SESSION_STORAGE_GENERATE_MODE_KEY, isGeneratingForExistingWallet.toString());
    } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_MODE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_GENERATE_MODE_KEY);
        setStagedSecretData(null);
    }

    if (step === 'complete' || step === 'import_complete') {
        const timer = setTimeout(() => {
            chrome.tabs?.getCurrent((tab) => {
                if (tab?.id && !tab.pinned) {
                  try { window.close(); } catch(e) { console.warn("Failed to close window automatically.")}
                }
            });
        }, 3000);
        return () => clearTimeout(timer);
    }
  }, [step, isAddToExistingWallet, isGeneratingForExistingWallet]);


  const handleWalletAction = useCallback((action: 'create' | 'import') => {
    setSetupError(null);
    if (action === 'create') {
      setStep('mnemonic_create');
    } else {
      setStep('import_options');
    }
  }, [setStep]);

  const handleImportOptionSelect = useCallback((type: 'seed' | 'privateKey' | 'publicKey') => {
    setSetupError(null);
    setIsGeneratingForExistingWallet(false);
    if (type === 'seed') setStep('import_mnemonic');
    else if (type === 'privateKey') setStep('import_private_key');
    else if (type === 'publicKey') setStep('import_public_key');
  }, []);

  const handleMnemonicConfirmed = useCallback((mnemonic: string, isImportFlowCb: boolean) => {
    setSetupError(null);
    if (!mnemonic) { setSetupError(t('onboardingApp.errors.mnemonicEmpty')); return; }

    if (isGeneratingForExistingWallet && !isImportFlowCb) {
       // console.log("OnboardingApp: Mnemonic confirmed for existing wallet generation.");
        setIsLoading(true);
        chrome.runtime.sendMessage(
          { action: 'addRootMnemonic', payload: { mnemonic } },
          (response) => {
            setIsLoading(false);
            if (chrome.runtime.lastError || !response?.success) {
                const errMsg = t('onboardingApp.errors.addRootMnemonicFailed', { error: chrome.runtime.lastError?.message || response?.error || t('common.unknownError')});
             //   console.error(errMsg);
                setSetupError(errMsg);
            } else {
             //   console.log("OnboardingApp: Background confirmed adding root mnemonic.");
                setStep('import_complete');
            }
          }
        );
        return;
    }

    if (!isImportFlowCb && !isAddToExistingWallet) {
       // console.log("OnboardingApp: Mnemonic confirmed for create wallet flow. Proceeding to password setup.");
        (async () => {
            try {
                await setStagedSecretData({ secret: mnemonic, type: 'mnemonic' });
                setIsLoading(false);
                setStep('password_create');
            } catch (error: any) {
                setSetupError(t('onboardingApp.errors.prepareCreateFailed', { error: error.message }));
                setIsLoading(false);
                setStep('error_state');
            }
        })();
        return;
    }

  //  console.log("OnboardingApp: Mnemonic confirmed for import flow. Scanning accounts...");
    setIsLoading(true);
    chrome.runtime.sendMessage(
      { action: 'startMnemonicScan', payload: { mnemonic } },
      (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError || !response?.success) {
          setSetupError(t('onboardingApp.errors.accountScanFailed', { error: chrome.runtime.lastError?.message || response?.error || t('common.unknownError')}));
          setStep('error_state');
        } else {
          setDerivedAccountsForSelection(response.accountsToShow || []);
          setStep('select_import_accounts');
        }
      }
    );
  }, [isGeneratingForExistingWallet, isAddToExistingWallet, t]);

  const handleAccountSelectionConfirmed = useCallback((selectedPaths: string[]) => {
    setSetupError(null);
    if (selectedPaths.length === 0) { setSetupError(t('onboardingApp.errors.selectOneAccount')); return; }
    setIsLoading(true);

    if (isAddToExistingWallet) {
       // console.log("OnboardingApp: Adding selected accounts to existing wallet.");
        chrome.runtime.sendMessage(
          { action: 'importFromStagedMnemonic', payload: { paths: selectedPaths } },
          (response) => {
            setIsLoading(false);
            if (chrome.runtime.lastError || !response?.success) {
              setSetupError(t('onboardingApp.errors.importFailed', { error: chrome.runtime.lastError?.message || response?.error || t('common.unknownError')}));
              setStep('select_import_accounts');
            } else {
              setStep('import_complete');
            }
          }
        );
    } else {
     //   console.log("OnboardingApp: Staging selected accounts for initial setup.");
        (async () => {
          try {
            const stagedData = await getStagedSecretData();
            if (!stagedData || stagedData.type !== 'mnemonic') throw new Error(t('onboardingApp.errors.mnemonicNotStaged'));
            await setStagedSecretData({ ...stagedData, selectedPaths });
            setIsLoading(false);
            setStep('password_create');
          } catch (error: any) {
            setSetupError(t('onboardingApp.errors.prepareImportFailed', { error: error.message }));
            setIsLoading(false);
            setStep('error_state');
          }
        })();
    }
  }, [isAddToExistingWallet, t]);

  const handlePrivateKeyConfirmed = useCallback((privateKey: string) => {
    setSetupError(null);
    setIsLoading(true);
    if (isAddToExistingWallet) {
      //  console.log("OnboardingApp: Adding private key account to existing wallet.");
        chrome.runtime.sendMessage(
          { action: 'addAccount', payload: { secret: privateKey, type: 'privateKey', options: { makeActive: true } } },
          (response) => {
            setIsLoading(false);
            if (chrome.runtime.lastError || !response?.success) {
              setSetupError(t('onboardingApp.errors.addAccountFailed', { error: chrome.runtime.lastError?.message || response?.error || t('common.unknownError')}));
              setStep('import_private_key');
            } else {
              setStep('import_complete');
            }
          }
        );
    } else {
       // console.log("OnboardingApp: Staging private key for initial setup.");
        chrome.runtime.sendMessage(
          { action: 'stageSecretForSetup', payload: { secret: privateKey, type: 'privateKey' as SecretType } },
          (response) => {
            setIsLoading(false);
            if (chrome.runtime.lastError || !response?.success) {
              setSetupError(t('onboardingApp.errors.setupFailed', { error: chrome.runtime.lastError?.message || response?.error || t('common.unknownError')}));
              setStep('error_state');
            } else {
              setStep('password_create');
            }
          }
        );
    }
  }, [isAddToExistingWallet, t]);

  const handlePublicKeyConfirmed = useCallback((publicKey: string) => {
    setSetupError(null);
    if (!isAddToExistingWallet) {
        setSetupError(t('onboardingApp.errors.cannotInitWithViewOnly'));
        setStep('import_public_key');
        return;
    }
    setIsLoading(true);
   // console.log("OnboardingApp: Adding view-only account to existing wallet.");
    chrome.runtime.sendMessage(
      { action: 'addAccount', payload: { secret: publicKey, type: 'publicKey', options: { makeActive: true } } },
      (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError || !response?.success) {
          setSetupError(t('onboardingApp.errors.addAccountFailed', { error: chrome.runtime.lastError?.message || response?.error || t('common.unknownError')}));
          setStep('import_public_key');
        } else {
          setStep('import_complete');
        }
      }
    );
  }, [isAddToExistingWallet, t]);

  const handlePasswordConfirmed = useCallback(() => {
    setSetupError(null);
    setStep('complete');
  }, []);

  const backSteps: OnboardingStep[] = [ // Define backSteps before backMap
    'mnemonic_create', 'password_create', 'import_options', 'import_mnemonic',
    'import_private_key', 'import_public_key', 'select_import_accounts'
  ];

  // MOVED backMap definition before its first use
  const backMap: Partial<Record<OnboardingStep, OnboardingStep>> = {
    mnemonic_create: 'setup',
    password_create: isAddToExistingWallet ? undefined : (isGeneratingForExistingWallet ? 'mnemonic_create' : 'select_import_accounts'),
    import_options: 'setup',
    import_mnemonic: 'import_options',
    import_private_key: 'import_options',
    import_public_key: 'import_options',
    select_import_accounts: 'import_mnemonic',
  };

  const handleGoBack = useCallback(() => {
    setSetupError(null);
    if (isGeneratingForExistingWallet && step === 'mnemonic_create') {
        window.close(); return;
    }
    // backMap is now defined in the outer scope of this callback
    const prevStep = backMap[step];

    if (prevStep === undefined && isAddToExistingWallet) {
      window.close(); 
      return;
    }
    
    if (prevStep === 'setup') {
        setIsGeneratingForExistingWallet(false);
        setIsAddToExistingWallet(false);
    }
    setStep(prevStep || 'setup');
  }, [step, isAddToExistingWallet, isGeneratingForExistingWallet, backMap]); // Include backMap if it were to change, though it's constant here per render cycle. For safety, or define it outside.

  // The variable 'showBackButtonLogic' was marked as unused.
  // The actual logic for showing the back button is directly in the JSX using 'canGoBack'.
  // We can remove 'showBackButtonLogic' if it's truly not used.
  // For now, I'll keep the 'canGoBack' logic as it was, assuming it correctly uses the now-defined 'backMap'.

  const canGoBack =
    backSteps.includes(step) &&
    !(isGeneratingForExistingWallet && step === 'mnemonic_create') &&
    !(isAddToExistingWallet && !backMap[step]);


  if (isInitialChecking) {
      return (
          <div className="flex justify-center items-center h-screen bg-[#090f14] text-white">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              <span className="ml-4 text-lg">{t('onboardingApp.checkingStatus')}</span>
          </div>
      );
  }
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#090f14] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-4 text-lg">{t('common.processing')}</span>
      </div>
    );
  }
  if (step === 'error_state') {
    return (
         <div className="flex flex-col items-center justify-center h-screen text-center p-8 bg-[#090f14] text-white">
            <div className="flex items-center justify-center p-4 border-b border-[#243B55] absolute top-0 left-0 right-0 z-10">
              <div className="flex items-center space-x-3">
                <img src="/icons/kyoku-logo.png" alt={t('onboardingApp.altKyokuLogo')} className="w-8 h-8" />
                <span className="text-lg font-semibold text-[#A8DADC]">{t('onboardingApp.kyokuWalletSetup')}</span>
              </div>
            </div>
           <div className="flex flex-col items-center justify-center flex-grow pt-16">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
               </svg>
              <h2 className="text-2xl font-bold text-red-400 mb-4">{t('onboardingApp.errorOccurredTitle')}</h2>
              <p className="text-base text-gray-300 mb-6 max-w-md">{setupError || t('onboardingApp.errors.unexpectedError')}</p>
              <button onClick={() => { setStep('setup'); setIsGeneratingForExistingWallet(false); setIsAddToExistingWallet(false); setSetupError(null); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors">
                {t('onboardingApp.buttons.restartSetup')}
              </button>
            </div>
         </div>
       );
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#090f14] text-[#DCE4EE] overflow-hidden">
      <div className={`flex items-center justify-between p-4 border-b border-[#243B55] relative z-10 ${canGoBack ? '' : 'justify-center'}`}>
         {canGoBack && (
           <button 
             onClick={handleGoBack} 
             className="absolute left-4 top-1/2 transform -translate-y-1/2 p-1 text-[#A8DADC] hover:text-white transition"
             aria-label={t('common.back')}
           >
             <ArrowLeft size={20} />
           </button>
         )}
         <div className={`flex items-center space-x-3 ${canGoBack ? 'flex-grow justify-center' : ''}`}>
           <img src="/icons/kyoku-logo.png" alt={t('onboardingApp.altKyokuLogo')} className="w-8 h-8" />
           <span className="text-lg font-semibold text-[#A8DADC]">{t('onboardingApp.kyokuWalletSetup')}</span>
         </div>
         {canGoBack && <div className="w-8" /> } {/* Spacer to balance the back button */}
      </div>

      <div className="flex-grow flex flex-col items-center justify-center p-6 md:p-8 space-y-6 relative z-10">
        {setupError && (
           <div className="w-full max-w-xl p-3 mb-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg text-center text-sm">
             {setupError}
           </div>
        )}

        {step === 'setup' && <CombinedWalletSetup onAction={handleWalletAction} termsUrl="#" />}
        {(step === 'mnemonic_create' || step === 'import_mnemonic') &&
            <MnemonicSetup
                importMode={step === 'import_mnemonic'}
                onMnemonicVerified={handleMnemonicConfirmed}
            />
        }
        {step === 'password_create' && <PasswordSetup onPasswordConfirmed={handlePasswordConfirmed} />}
        {step === 'import_options' && (
            <ImportOptions 
                onSelect={handleImportOptionSelect} 
                isInitialSetup={!isAddToExistingWallet}
            />
        )}
        {step === 'import_private_key' && <ImportPrivateKey onPrivateKeyConfirmed={handlePrivateKeyConfirmed} onCancel={handleGoBack} />}
        {step === 'import_public_key' && <AddViewOnlyAccount onPublicKeyConfirmed={handlePublicKeyConfirmed} onCancel={handleGoBack} />}
        {step === 'select_import_accounts' && (
          <FundedAccountSelector
            accounts={derivedAccountsForSelection}
            onConfirmSelection={handleAccountSelectionConfirmed}
            onCancel={handleGoBack}
          />
        )}
        {step === 'complete' && (
          <div className="flex flex-col items-center space-y-8 p-10 bg-[#090f14] rounded-2xl max-w-xl w-full text-center">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-green-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             <h2 className="text-4xl text-[#A8DADC] font-bold">{t('onboardingApp.setupCompleteTitle')}</h2>
             <p className="text-lg text-[#DCE4EE]">{t('onboardingApp.setupCompleteMessage')}<br />{t('onboardingApp.windowCloseMessage')}</p>
          </div>
         )}
         {step === 'import_complete' && (
           <div className="flex flex-col items-center space-y-8 p-10 bg-[#090f14] rounded-2xl max-w-xl w-full text-center">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-green-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             <h2 className="text-4xl text-[#A8DADC] font-bold">{t('onboardingApp.importSuccessfulTitle')}</h2>
             <p className="text-lg text-[#DCE4EE]">{t('onboardingApp.importSuccessfulMessage')}<br />{t('onboardingApp.windowCloseMessage')}</p>
           </div>
         )}
      </div>
    </div>
  );
};

export default OnboardingApp;