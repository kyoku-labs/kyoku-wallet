// src/popup/unlocked/components/ShowSeedPhraseModal.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Eye, EyeOff, AlertTriangle, Loader2, Copy as CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ShowSeedPhraseModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountUuid: string | null;
  accountName: string | null;
}

const ShowSeedPhraseModal: React.FC<ShowSeedPhraseModalProps> = ({
  isOpen,
  onClose,
  accountUuid,
  accountName,
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const resetState = useCallback(() => {
    setPassword('');
    setIsPasswordVisible(false);
    setSeedPhrase(null);
    setError(null);
    setIsLoading(false);
    setCopied(false);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleRevealSeedPhrase = useCallback(async () => {
    if (!accountUuid || !password) {
      setError(t('showSeedPhraseModal.errors.passwordRequired'));
      return;
    }
    setIsLoading(true);
    setError(null);
    setSeedPhrase(null);

    chrome.runtime.sendMessage(
      {
        action: 'requestSeedPhrase',
        payload: { uuid: accountUuid, password },
      },
      (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError || !response?.success) {
          const errMsg = chrome.runtime.lastError?.message || response?.error || t('showSeedPhraseModal.errors.failedToRetrieve');
          setError(errMsg);
          console.error('Error revealing seed phrase:', errMsg);
        } else {
          setSeedPhrase(response.seedPhrase);
        }
      }
    );
  }, [accountUuid, password, t]);

  const copyToClipboard = useCallback(() => {
    if (seedPhrase) {
      navigator.clipboard.writeText(seedPhrase)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => {
          console.error('Failed to copy seed phrase:', err);
          setError(t('showSeedPhraseModal.errors.copyFailed'));
        });
    }
  }, [seedPhrase, t]);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  if (!isOpen || !accountUuid) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
      <div className="bg-[#161E2D] rounded-lg shadow-xl p-6 w-full max-w-md border border-gray-700 text-white">
        <h2 className="text-xl font-semibold mb-3 text-center">
          {t('showSeedPhraseModal.title')}
        </h2>
         <p className="text-sm text-gray-400 mb-1 text-center">
          {t('showSeedPhraseModal.forAccount')} <span className="font-medium text-gray-300">{accountName || accountUuid}</span>
        </p>

        {!seedPhrase ? (
          <>
            <p className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-700 p-3 rounded-md mb-4 text-center">
              <AlertTriangle size={16} className="inline mr-1 mb-0.5" />
              {t('showSeedPhraseModal.warning')}
            </p>
            <div className="mb-4"> {/* Removed relative from here */}
              <label htmlFor="seed-password" className="block text-sm font-medium text-gray-300 mb-1">
                {t('showSeedPhraseModal.enterPasswordToReveal')}
              </label>
              {/* ADDED: new relative container for input and button */}
              <div className="relative">
                <input
                  id="seed-password"
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('showSeedPhraseModal.placeholders.walletPassword')}
                  // MODIFIED: Added pr-10 for icon space
                  className="w-full p-3 bg-[#2A3447] border border-[#4A5568] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                  disabled={isLoading}
                  onKeyPress={(e) => e.key === 'Enter' && !isLoading && password && handleRevealSeedPhrase()}
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  // MODIFIED: Standard vertical centering for absolute positioned icon
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white p-1"
                  aria-label={isPasswordVisible ? t('passwordSetup.ariaLabels.hidePassword') : t('passwordSetup.ariaLabels.showPassword')}
                >
                  {isPasswordVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
             {error && (
              <p className="text-red-400 text-sm mb-3 text-center p-2 bg-red-900/20 rounded-md border border-red-700/50">
                {error}
              </p>
            )}
            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
              <button
                onClick={handleClose}
                className="px-4 py-2.5 rounded-md text-sm font-medium bg-gray-600 hover:bg-gray-500 transition-colors w-full sm:w-auto"
                disabled={isLoading}
              >
                {t('buttons.cancel')}
              </button>
              <button
                onClick={handleRevealSeedPhrase}
                disabled={isLoading || !password}
                className="px-4 py-2.5 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors w-full sm:w-auto flex items-center justify-center disabled:opacity-60"
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin mr-2" />
                ) : null}
                {t('showSeedPhraseModal.buttons.revealPhrase')}
              </button>
            </div>
          </>
        ) : (
          // ... (rest of the component for displaying the seed phrase remains the same)
          <>
            <p className="text-sm text-gray-300 mb-2">
              {t('showSeedPhraseModal.yourRecoveryPhraseFor', { accountName: accountName })}
            </p>
            <div className="bg-[#162132] p-4 rounded-md border border-gray-600 text-base font-medium break-words mb-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {seedPhrase.split(' ').map((word, index) => (
                <div key={index} className="flex items-baseline">
                  <span className="text-xs text-gray-500 mr-1.5 w-5 text-right">{index + 1}.</span>
                  <span>{word}</span>
                </div>
              ))}
            </div>
             <p className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-700 p-2 rounded-md mb-4 text-center">
              {t('showSeedPhraseModal.storePhraseSecurely')}
            </p>
            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
              <button
                onClick={copyToClipboard}
                className="px-4 py-2.5 rounded-md text-sm font-medium bg-green-600 hover:bg-green-500 transition-colors w-full sm:w-auto flex items-center justify-center"
              >
                <CopyIcon size={16} className="mr-2"/>
                {copied ? t('showSeedPhraseModal.buttons.copied') : t('showSeedPhraseModal.buttons.copyPhrase')}
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2.5 rounded-md text-sm font-medium bg-gray-600 hover:bg-gray-500 transition-colors w-full sm:w-auto"
              >
                {t('buttons.close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ShowSeedPhraseModal;