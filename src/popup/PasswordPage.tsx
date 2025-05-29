// src/popup/PasswordPage.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { AccountMetadata } from '../background/core/keyring/types';
import { Eye, EyeOff, Loader2 } from 'lucide-react'; // Added Loader2
import { useTranslation } from 'react-i18next';
import ResetWalletConfirmationModal from './unlocked/components/ResetWalletConfirmationModal'; // Ensure this path is correct

interface PasswordPageProps {
  onUnlockSuccess: (activeAccount: AccountMetadata | null) => void;
}

const PasswordPage: React.FC<PasswordPageProps> = ({ onUnlockSuccess }) => {
  const { t } = useTranslation();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // For unlock operation
  const [keyringExists, setKeyringExists] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // New state for reset confirmation modal
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResettingWallet, setIsResettingWallet] = useState(false); // Specific for reset operation

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 50);
    const checkInitialization = () => {
      try {
        chrome.runtime.sendMessage({ action: 'checkKeyringStatus' }, (response) => {
          if (chrome.runtime.lastError) {
            setKeyringExists(false);
            setError(t('passwordPage.errors.verifyStatusFailed'));
            return;
          }
          if (response && response.isInitialized !== undefined) {
            setKeyringExists(response.isInitialized);
            if (!response.isInitialized) {
              const onboardingUrl = chrome.runtime.getURL('onboarding.html');
              try {
                if (chrome.tabs && chrome.tabs.create) {
                  chrome.tabs.create({ url: onboardingUrl });
                  window.close();
                } else {
                  setError(t('passwordPage.errors.walletNotFoundGoToOnboarding'));
                }
              } catch (e) {
                setError(t('passwordPage.errors.walletNotFoundOpenManually'));
              }
            }
          } else {
            setKeyringExists(false);
            setError(t('passwordPage.errors.invalidStatusResponse'));
          }
        });
      } catch (e) {
        setError(t('passwordPage.errors.contactBackgroundFailed'));
        setKeyringExists(false);
      }
    };
    checkInitialization();
    setPassword('');
    setError('');
    return () => clearTimeout(timer);
  }, [t]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setError('');
  };

  const handleUnlock = useCallback(async () => {
    if (!password) {
      setError(t('passwordPage.errors.passwordEmpty'));
      return;
    }
    setError('');
    setIsLoading(true); // For unlock operation

    try {
      chrome.runtime.sendMessage(
        { action: 'unlockWallet', payload: { password } },
        (response) => {
          setIsLoading(false);
          if (chrome.runtime.lastError) {
            setError(t('passwordPage.errors.communicationError', { error: chrome.runtime.lastError.message || t('common.unknownError') }));
            return;
          }

          if (response && response.success && response.activeAccount) {
            setPassword('');
            onUnlockSuccess(response.activeAccount);
          } else {
            const specificErrorKey = response?.error === 'Incorrect password.' ? 'passwordPage.errors.incorrectPassword' : null;
            setError(specificErrorKey ? t(specificErrorKey) : response?.error || t('passwordPage.errors.unlockFailedTryAgain'));
            if (response?.error === t('passwordPage.errors.walletNotSetUp')) {
              setKeyringExists(false);
            }
          }
        }
      );
    } catch (err) {
      setError(t('passwordPage.errors.sendUnlockRequestFailed')); // Assuming this key exists or creating it
      setIsLoading(false);
    }
  }, [password, onUnlockSuccess, t]);

  const togglePasswordVisibility = () => setIsPasswordVisible(!isPasswordVisible);

  // Updated reset handler to show the modal
  const handleInitiateReset = () => {
    setShowResetConfirmModal(true);
  };

  // Actual reset logic, called when modal is confirmed
  const confirmAndProceedWithReset = async () => {
    setShowResetConfirmModal(false);
    setIsResettingWallet(true);
    setError(t('passwordPage.resetting'));

    try {
      chrome.runtime.sendMessage({ action: 'resetWallet' }, (response) => {
        setIsResettingWallet(false);
        if (chrome.runtime.lastError) {
          const errorMsg = t('passwordPage.errors.resetFailed', { error: chrome.runtime.lastError.message });
          setError(errorMsg);
          return;
        }
        if (response && response.success) {
          setError('');
          setKeyringExists(false);
          const onboardingUrl = chrome.runtime.getURL('onboarding.html');
          try {
            if (chrome.tabs && chrome.tabs.create) {
              chrome.tabs.create({ url: onboardingUrl });
              window.close();
            } else {
              setError(t('passwordPage.errors.resetCompleteGoToSetup'));
            }
          } catch (e) {
            setError(t('passwordPage.resetWallet.manualSetupAlert'));
          }
        } else {
          const errorMsg = response?.error || t('passwordPage.errors.resetFailedUnknown');
          setError(errorMsg);
        }
      });
    } catch (err) {
      const errorMsg = t('passwordPage.errors.sendResetRequestFailed'); // Assuming this key exists or creating it
      setError(errorMsg);
      setIsResettingWallet(false);
    }
  };


  useEffect(() => {
    const listener = (message: any, sender: chrome.runtime.MessageSender) => {
      if (sender.id !== chrome.runtime.id) {
        return;
      }
      if (message.action === 'forceLockFromBackground') {
        setPassword('');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  if (keyringExists === null) {
    return (
      <div className="flex justify-center items-center h-full bg-[#090f14] text-white">
        {t('passwordPage.loadingStatus')}
      </div>
    );
  }

  if (keyringExists === false && !isLoading && !isResettingWallet) { // Added !isResettingWallet check
    return (
      <div className="flex flex-col justify-center items-center p-6 w-full h-full bg-[#090f14] text-white">
        <img
            src="icons/ternkyoku.png"
            alt={t('onboardingApp.altKyokuLogo')}
            className="w-auto h-40 mb-8"
        />
        <p className="text-lg mb-2 text-red-400">{t('passwordPage.walletNotFoundTitle')}</p>
        <p className="text-sm text-gray-400 mb-6 text-center">
          {error || t('passwordPage.errors.walletNotFoundGoToOnboarding')}
        </p>
        <a
            href={chrome.runtime.getURL('onboarding.html')}
            onClick={(e) => {
                e.preventDefault();
                chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
                window.close();
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t('passwordPage.buttons.goToSetup')}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center items-center p-6 w-full h-full bg-[#090f14]">
      <img
        src="icons/ternkyoku.png"
        alt={t('onboardingApp.altKyokuLogo')}
        className={`w-auto h-60 mb-8 transition-all duration-500 ease-out ${
          isMounted ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`relative w-full max-w-xs mb-4 transition-all duration-500 ease-out ${
          isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionDelay: '150ms' }}
      >
        <input
          type={isPasswordVisible ? 'text' : 'password'}
          value={password}
          onChange={handlePasswordChange}
          placeholder={t('passwordPage.placeholders.password')}
          className={`w-full p-4 rounded-lg bg-[#243B55] text-[#DCE4EE] border placeholder-[#A8DADC] focus:outline-none focus:ring-2 focus:ring-[#E61946] ${
            error ? 'border-red-500 ring-red-500/50' : 'border-[#A8DADC]'
          }`}
          disabled={isLoading || isResettingWallet}
          onKeyDown={(e) => e.key === 'Enter' && !isLoading && !isResettingWallet && password && handleUnlock()}
          aria-invalid={!!error}
          aria-describedby={error ? "password-error" : undefined}
        />
        <button
          type="button"
          onClick={togglePasswordVisibility}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#A8DADC] hover:text-white p-1 focus:outline-none focus:ring-1 focus:ring-white rounded"
          aria-label={isPasswordVisible ? t('passwordSetup.ariaLabels.hidePassword') : t('passwordSetup.ariaLabels.showPassword')}
        >
          {isPasswordVisible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      {error && (
        <p id="password-error" className="text-red-500 text-sm mb-3 text-center w-full max-w-xs">
          {error}
        </p>
      )}

      <button
        onClick={handleUnlock}
        className={`w-full max-w-xs p-4 rounded-lg text-lg font-semibold text-white bg-[#E63946] hover:bg-[#cc2f3d] transition-all duration-500 ease-out disabled:opacity-60 disabled:cursor-not-allowed ${
          isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionDelay: '250ms' }}
        disabled={isLoading || isResettingWallet || !password}
      >
        {isLoading ? (
          <div className="flex justify-center items-center">
            <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
            {t('passwordPage.buttons.unlocking')}
          </div>
        ) : (
          t('buttons.unlock')
        )}
      </button>

      <button
        onClick={handleInitiateReset} // Changed to initiate modal
        className={`mt-6 text-sm text-[#A8DADC] hover:text-white hover:underline focus:outline-none focus:underline transition-all duration-500 ease-out disabled:opacity-60 ${
          isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionDelay: '350ms' }}
        disabled={isLoading || isResettingWallet}
      >
        {isResettingWallet ? t('passwordPage.resetting') : t('passwordPage.buttons.forgotPasswordReset')}
      </button>

      <ResetWalletConfirmationModal
        isOpen={showResetConfirmModal}
        onClose={() => setShowResetConfirmModal(false)}
        onConfirmReset={confirmAndProceedWithReset}
        isProcessing={isResettingWallet}
      />
    </div>
  );
};

export default PasswordPage;