// src/popup/views/GenerateMnemonicPrompt.tsx
import React from 'react';
import { FilePlus2, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GenerateMnemonicPromptProps {
  onContinue: () => void;
  onCancel: () => void;
}

const GenerateMnemonicPrompt: React.FC<GenerateMnemonicPromptProps> = ({
  onContinue,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    // Main container for the view
    <div className="flex flex-col h-full bg-[#090f14] text-white">

      {/* Header */}
      <div className="flex items-center p-4 border-b border-[#243B55] relative">
        <button
          onClick={onCancel}
          className="absolute left-4 p-1 text-[#A8DADC] hover:text-white transition"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-center flex-grow text-[#A8DADC]">
          {t('generateMnemonicPrompt.headerTitle')}
        </h2>
        <div className="w-8"></div> {/* Spacer */}
      </div>

      {/* Content Area */}
      <div className="flex-grow flex flex-col items-center justify-center text-center px-6 space-y-6">
        <div className="w-20 h-20 rounded-full bg-[#161E2D] flex items-center justify-center border-2 border-[#243B55]">
          <FilePlus2 size={40} className="text-[#A8DADC]" />
        </div>
        <h3 className="text-2xl font-bold text-white">
          {t('generateMnemonicPrompt.mainHeading')}
        </h3>
        <p className="text-base text-gray-400 max-w-sm">
          {t('generateMnemonicPrompt.descriptionLine1')}
          <br />
          {t('generateMnemonicPrompt.descriptionLine2')}
        </p>
      </div>

      {/* Footer Button */}
      <div className="p-4 border-t border-[#243B55]">
        <button
          onClick={onContinue}
          // MODIFIED: Changed button color from purple to blue
          // Kept existing padding and text size, adopted more detailed transition/active state from other blue buttons
          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-lg font-semibold transition-colors shadow-sm active:bg-blue-500"
        >
          {t('buttons.continue')}
        </button>
      </div>
    </div>
  );
};

export default GenerateMnemonicPrompt;