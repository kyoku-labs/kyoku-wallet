// src/popup/onboarding/ImportPrivateKey.tsx
import React, { useState } from 'react';
import { CryptoUtils, CryptoError } from '../../utils/cryptoutils';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface ImportPrivateKeyProps {
  onPrivateKeyConfirmed: (privateKeyInputString: string) => void;
  onCancel: () => void;
}

const ImportPrivateKey: React.FC<ImportPrivateKeyProps> = ({ onPrivateKeyConfirmed }) => { // Destructured onCancel
  const { t } = useTranslation(); // Initialize useTranslation
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrivateKeyInput(e.target.value.trim());
    setError(null);
  };

  const validateAndConfirm = () => {
    setError(null);
    if (!privateKeyInput) {
      setError(t('importPrivateKey.errors.pastePrivateKey')); // Translate
      return;
    }
    setIsLoading(true);
    try {
      CryptoUtils.validatePrivateKeyString(privateKeyInput);
      onPrivateKeyConfirmed(privateKeyInput);
    } catch (err: any) {
      setError(err instanceof CryptoError ? err.message : t('importPrivateKey.errors.validationFailedUnknown')); // Translate fallback
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center px-4 py-8">
      {/* Centered Card */}
      <div className="w-full max-w-xl bg-[#090f14] border border-[#243B55] rounded-2xl p-10 flex flex-col items-center space-y-8 shadow-lg">

        {/* Header */}
         <div className="w-full flex justify-center items-center relative">
          <h2 className="text-3xl font-bold text-white text-center">{t('importPrivateKey.title')}</h2> {/* Translate */}
        </div>


        {/* Description */}
        <p className="text-center text-gray-400 text-lg">
          {t('importPrivateKey.description')} {/* Translate */}
        </p>

        {/* Input Area */}
        <textarea
          value={privateKeyInput}
          onChange={handleInputChange}
          placeholder={t('importPrivateKey.placeholders.pastePrivateKey')} // Translate
          rows={5}
          className={`w-full p-4 bg-[#1B2B44] text-white rounded-lg border ${error ? 'border-red-500' : 'border-[#A8DADC]'} focus:border-[#E63946] focus:outline-none resize-none text-sm font-mono`}
          spellCheck="false"
          disabled={isLoading}
        />

        {/* Error Message */}
        {error && <p className="text-red-400 text-xs text-center w-full">{error}</p>}

        {/* Confirm Button */}
        <button
          onClick={validateAndConfirm}
          disabled={isLoading || !privateKeyInput}
          className={`w-full py-4 rounded-lg text-lg font-semibold transition ${
            !privateKeyInput || isLoading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-[#E63946] hover:bg-[#cc2f3d] text-white'
          }`}
        >
          {isLoading ? t('importPrivateKey.buttons.validating') : t('importPrivateKey.buttons.confirmAndImport')} {/* Translate */}
        </button>

      </div>
    </div>
  );
};

export default ImportPrivateKey;