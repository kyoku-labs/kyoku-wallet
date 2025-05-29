// src/popup/onboarding/AddViewOnlyAccount.tsx
import React, { useState } from 'react';
import { CryptoUtils, CryptoError } from '../../utils/cryptoutils';
import { useTranslation } from 'react-i18next';

interface AddViewOnlyAccountProps {
  onPublicKeyConfirmed: (publicKey: string) => void;
  onCancel: () => void;
}

const AddViewOnlyAccount: React.FC<AddViewOnlyAccountProps> = ({ onPublicKeyConfirmed }) => {
  const { t } = useTranslation();
  const [publicKeyInput, setPublicKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPublicKeyInput(e.target.value.trim());
    setError(null);
  };

  const validateAndConfirm = () => {
    setError(null);
    if (!publicKeyInput) {
      setError(t('addViewOnlyAccount.errors.publicKeyRequired'));
      return;
    }
    setIsLoading(true);
    try {
      CryptoUtils.validatePublicKeyString(publicKeyInput);
      onPublicKeyConfirmed(publicKeyInput);
    } catch (err: any) {
      setError(err instanceof CryptoError ? err.message : t('addViewOnlyAccount.errors.invalidPublicKey'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl bg-[#090f14] border border-[#243B55] rounded-2xl p-10 flex flex-col items-center space-y-8 shadow-lg">
        <div className="w-full flex justify-center items-center relative">
          <h2 className="text-3xl font-bold text-white text-center">{t('addViewOnlyAccount.title')}</h2>
        </div>
        <p className="text-center text-gray-400 text-lg">
          {t('addViewOnlyAccount.description')}
        </p>
        <input
          type="text"
          value={publicKeyInput}
          onChange={handleInputChange}
          placeholder={t('addViewOnlyAccount.placeholders.pasteAddress')}
          className={`w-full p-4 bg-[#1B2B44] text-white rounded-lg border ${error ? 'border-red-500' : 'border-[#A8DADC]'} focus:border-[#E63946] focus:outline-none text-sm font-mono`}
          spellCheck="false"
          disabled={isLoading}
        />
        {error && <p className="text-red-400 text-xs text-center w-full">{error}</p>}
        <button
          onClick={validateAndConfirm}
          disabled={isLoading || !publicKeyInput}
          // MODIFIED: Changed button colors from purple/reddish to green
          className={`w-full py-4 rounded-lg text-lg font-semibold transition ${
            !publicKeyInput || isLoading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' // Disabled state
              : 'bg-green-600 hover:bg-green-700 text-white'    // Active state changed to green
          }`}
        >
          {isLoading ? t('addViewOnlyAccount.buttons.validating') : t('addViewOnlyAccount.buttons.confirmAddress')}
        </button>
      </div>
    </div>
  );
};

export default AddViewOnlyAccount;