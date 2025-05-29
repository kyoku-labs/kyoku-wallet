// src/popup/onboarding/WalletSetup.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface CombinedWalletSetupProps {
  onAction: (action: 'create' | 'import') => void;
  termsUrl: string; // This prop is kept for structure, but we'll override its usage for the link
}

const CombinedWalletSetup: React.FC<CombinedWalletSetupProps> = ({ onAction }) => {
  const { t } = useTranslation();

  const [isChecked, setIsChecked] = useState(false);
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [loadingCheck, setLoadingCheck] = useState<boolean>(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isImportMode, setIsImportMode] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (hash.startsWith('import=')) {
      setIsImportMode(true);
    }

    const checkInitialization = () => {
      setLoadingCheck(true);
      setCheckError(null);

      try {
        chrome.runtime.sendMessage({ action: 'checkKeyringStatus' }, (response) => {
          setLoadingCheck(false);

          if (chrome.runtime.lastError) {
            setCheckError(t('walletSetup.errors.contactBackgroundFailed', { error: chrome.runtime.lastError.message }));
            setIsInitialized(false);
            return;
          }

          if (response && response.success !== undefined) {
            setIsInitialized(response.isInitialized);
          } else {
            setCheckError(response?.error || t('walletSetup.errors.invalidStatusResponse'));
            setIsInitialized(false);
          }
        });
      } catch (error) {
        setLoadingCheck(false);
        setCheckError(t('walletSetup.errors.sendStatusCheckFailed'));
        setIsInitialized(false);
      }
    };

    checkInitialization();
  }, [t]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsChecked(e.target.checked);
  };

  const handleCreateWallet = () => {
    if (!isChecked) return;
    onAction('create');
  };

  const handleImportWallet = () => {
    if (!isChecked) return;
    onAction('import');
  };

  if (loadingCheck) {
    return (
      <div className="p-6 text-center text-[#DCE4EE]">
        {t('walletSetup.checkingStatus')}
      </div>
    );
  }

   if (checkError) {
       return (
         
         <div className="p-10 text-center bg-[#090f14] border border-[#243B55] rounded-3xl shadow-2xl text-red-400">
            <h2 className="text-3xl font-bold mb-4 text-red-500">{t('common.error')}</h2>
            <p className="text-lg mb-4">{checkError}</p>
            <p className="text-sm">{t('walletSetup.errors.ensureExtensionEnabled')}</p>
         </div>
       );
   }

  if (isInitialized === true && !isImportMode) {
    return (
      
      <div className="p-10 text-center bg-[#090f14] border border-[#243B55] rounded-3xl shadow-2xl text-yellow-400">
        <h2 className="text-3xl font-bold mb-4 text-[#A8DADC]">{t('walletSetup.alreadySetupTitle')}</h2>
        <p className="text-lg">
          {t('walletSetup.alreadySetupMessage')}
        </p>
      </div>
    );
  }

  return (
    
    <div className="bg-[#090f14] border border-[#243B55] p-16 rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col items-center space-y-12">
        <h1 className="text-4xl font-bold text-[#A8DADC] text-center">{t('walletSetup.welcomeTitle')}</h1>

        <div className="flex items-center w-full justify-center space-x-4">
            <input
                type="checkbox"
                id="accept-terms"
                checked={isChecked}
                onChange={handleCheckboxChange}
                className="w-6 h-6 text-[#E63946] border-gray-600 focus:ring-[#E63946] rounded"
            />
            <label htmlFor="accept-terms" className="text-lg text-[#DCE4EE] leading-none flex items-center">
                {t('walletSetup.termsAgreementPrefix')}
                <a
                    href="https://www.kyokuwallet.com/legal-documents"  // MODIFIED: Directly updated the URL
                    target="_blank"                                      // Ensure it opens in a new tab
                    rel="noopener noreferrer"
                    className="underline text-[#A8DADC] hover:text-white ml-1"
                >
                    {t('walletSetup.termsAndConditionsLink')}
                </a>
            </label>
        </div>

        <div className="flex flex-col md:flex-row w-full gap-12">
            <div className="flex-1 bg-[#243B55] p-10 rounded-3xl flex flex-col items-center text-center space-y-6">
                <h3 className="text-2xl font-bold text-[#A8DADC]">{t('walletSetup.createWalletTitle')}</h3>
                <p className="text-base text-[#DCE4EE]">{t('walletSetup.createWalletDescription')}</p>
                <button
                    onClick={handleCreateWallet}
                    disabled={!isChecked}
                    className={`w-full py-5 rounded-xl text-xl font-bold text-white transition ${
                        isChecked ? 'bg-[#E63946] hover:bg-[#cc2f3d]' : 'bg-gray-600 cursor-not-allowed'
                    }`}
                >
                    {t('walletSetup.buttons.createWallet')}
                </button>
            </div>

            <div className="flex-1 bg-[#243B55] p-10 rounded-3xl flex flex-col items-center text-center space-y-6">
                <h3 className="text-2xl font-bold text-[#A8DADC]">{t('walletSetup.importWalletTitle')}</h3>
                <p className="text-base text-[#DCE4EE]">{t('walletSetup.importWalletDescription')}</p>
                <button
                    onClick={handleImportWallet}
                    disabled={!isChecked}
                    className={`w-full py-5 rounded-xl text-xl font-bold text-white transition ${
                        isChecked ? 'bg-[#E63946] hover:bg-[#cc2f3d]' : 'bg-gray-600 cursor-not-allowed'
                    }`}
                >
                    {t('walletSetup.buttons.importWallet')}
                </button>
            </div>
        </div>
    </div>
  );
};

export default CombinedWalletSetup;