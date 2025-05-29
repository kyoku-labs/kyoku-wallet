// src/popup/unlocked/components/ShowPrivateKeyModal.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Eye, EyeOff, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ShowPrivateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountUuid: string | null;
  accountName: string | null;
}

const ShowPrivateKeyModal: React.FC<ShowPrivateKeyModalProps> = ({
  isOpen,
  onClose,
  accountUuid,
  accountName,
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetState = useCallback(() => {
    setPassword('');
    setIsPasswordVisible(false);
    setPrivateKey(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleRevealPrivateKey = useCallback(async () => {
    if (!accountUuid || !password) {
      setError(t('showPrivateKeyModal.errors.passwordRequired'));
      return;
    }
    setIsLoading(true);
    setError(null);
    setPrivateKey(null);

    chrome.runtime.sendMessage(
      {
        action: 'requestPrivateKey',
        payload: { uuid: accountUuid, password },
      },
      (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError || !response?.success) {
          const errMsg = chrome.runtime.lastError?.message || response?.error || t('showPrivateKeyModal.errors.failedToRetrieve');
          setError(errMsg);
          console.error('Error revealing private key:', errMsg);
        } else {
          setPrivateKey(response.privateKey);
        }
      }
    );
  }, [accountUuid, password, t]);

  const copyToClipboard = useCallback(() => {
    if (privateKey) {
      navigator.clipboard.writeText(privateKey)
        .then(() => {
          alert(t('showPrivateKeyModal.copiedToClipboard'));
        })
        .catch(err => {
          console.error('Failed to copy private key:', err);
          setError(t('showPrivateKeyModal.errors.copyFailed'));
        });
    }
  }, [privateKey, t]);

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
          {t('showPrivateKeyModal.title')}
        </h2>
        <p className="text-sm text-gray-400 mb-1 text-center">
          {t('showPrivateKeyModal.forAccount')} <span className="font-medium text-gray-300">{accountName || accountUuid}</span>
        </p>
        
        {!privateKey ? (
          <>
            <p className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-700 p-3 rounded-md mb-4 text-center">
              <AlertTriangle size={16} className="inline mr-1 mb-0.5" />
              {t('showPrivateKeyModal.warning')}
            </p>
            <div className="mb-4"> {/* Removed relative from here */}
              <label htmlFor="pk-password" className="block text-sm font-medium text-gray-300 mb-1">
                {t('showPrivateKeyModal.enterPasswordToReveal')}
              </label>
              {/* ADDED: new relative container for input and button */}
              <div className="relative">
                <input
                  id="pk-password"
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('showPrivateKeyModal.placeholders.walletPassword')}
                  // MODIFIED: Added pr-10 for icon space
                  className="w-full p-3 bg-[#2A3447] border border-[#4A5568] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                  disabled={isLoading}
                  onKeyPress={(e) => e.key === 'Enter' && !isLoading && password && handleRevealPrivateKey()}
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
                onClick={handleRevealPrivateKey}
                disabled={isLoading || !password}
                className="px-4 py-2.5 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors w-full sm:w-auto flex items-center justify-center disabled:opacity-60"
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin mr-2" />
                ) : null}
                {t('showPrivateKeyModal.buttons.reveal')}
              </button>
            </div>
          </>
        ) : (
          // ... (rest of the component for displaying the private key remains the same)
          <>
            <p className="text-sm text-gray-300 mb-2">
              {t('showPrivateKeyModal.yourPrivateKeyFor', { accountName: accountName })}
            </p>
            <div className="bg-[#162132] p-3 rounded-md border border-gray-600 text-xs font-mono break-all mb-4 max-h-32 overflow-y-auto custom-scrollbar">
              {privateKey}
            </div>
            <p className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-700 p-2 rounded-md mb-4 text-center">
              {t('showPrivateKeyModal.storeKeySecurely')}
            </p>
            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
              <button
                onClick={copyToClipboard}
                className="px-4 py-2.5 rounded-md text-sm font-medium bg-green-600 hover:bg-green-500 transition-colors w-full sm:w-auto"
              >
                {t('showPrivateKeyModal.buttons.copyKey')}
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

export default ShowPrivateKeyModal;