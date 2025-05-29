// src/popup/onboarding/ImportOptions.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

interface ImportOptionsProps {
  onSelect: (type: 'seed' | 'privateKey' | 'publicKey') => void;
  isInitialSetup: boolean; // <-- New prop
}

const ImportOptions: React.FC<ImportOptionsProps> = ({ onSelect, isInitialSetup }) => {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col items-center px-6">
      <div className="w-full max-w-xl bg-[#090f14] border border-[#243B55] rounded-3xl p-12 flex flex-col items-center space-y-10 shadow-lg">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-white">{t('importOptions.title')}</h2>
          <p className="text-lg text-gray-400">
            {t('importOptions.tagline')}
          </p>
        </div>

        <div className="w-full flex flex-col space-y-6">
          {/* Import with Seed Phrase Button */}
          <div className="flex flex-col w-full">
            <button
              onClick={() => onSelect('seed')}
              className="w-full py-5 px-6 rounded-lg text-lg font-semibold text-white bg-[#E63946] hover:bg-[#cc2f3d]"
            >
              {t('importOptions.buttons.seedPhrase.label')}
            </button>
            <p className="text-sm text-gray-400 text-center mt-3">
              {t('importOptions.buttons.seedPhrase.description')}
            </p>
          </div>

          {/* Import with Private Key Button */}
          <div className="flex flex-col w-full">
            <button
              onClick={() => onSelect('privateKey')}
              className="w-full py-5 px-6 rounded-lg text-lg font-semibold text-white bg-[#E63946] hover:bg-[#cc2f3d]"
            >
              {t('importOptions.buttons.privateKey.label')}
            </button>
            <p className="text-sm text-gray-400 text-center mt-3">
              {t('importOptions.buttons.privateKey.description')}
            </p>
          </div>

          {/* Import as View-Only Wallet Button - Conditionally Rendered/Disabled */}
          {!isInitialSetup && ( // <-- Only show if NOT initial setup
            <div className="flex flex-col w-full">
              <button
                onClick={() => onSelect('publicKey')}
                className="w-full py-5 px-6 rounded-lg text-lg font-semibold text-white bg-[#E63946] hover:bg-[#cc2f3d]"
                // Alternatively, disable it with explanation if isInitialSetup is true:
                // disabled={isInitialSetup}
                // title={isInitialSetup ? "Cannot initialize a new wallet with only a view-only account. Create or import a full wallet first." : ""}
              >
                {t('importOptions.buttons.viewOnly.label')}
              </button>
              <p className="text-sm text-gray-400 text-center mt-3">
                {t('importOptions.buttons.viewOnly.description')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportOptions;