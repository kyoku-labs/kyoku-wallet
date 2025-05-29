// src/popup/views/SwapErrorView.tsx
import React from 'react';
import { XCircle, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useTranslation } from 'react-i18next'; // Import useTranslation

const SwapErrorView: React.FC = () => {
  const { t } = useTranslation(); // Initialize useTranslation
  const { swapErrorDetails, setSwapError, setView, transactionForConfirmation } = useAppStore();

  const handleRetry = () => {
    setSwapError(null);
    if (transactionForConfirmation && transactionForConfirmation.sourceView === 'SWAP_VIEW') {
      setView('CONFIRM_TRANSACTION');
    } else {
      setView('SWAP_VIEW');
    }
  };

  const handleClose = () => {
    setSwapError(null);
    setView('DASHBOARD');
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-5 text-white bg-[#090f14]">
      <XCircle size={64} className="text-red-500" />
      <h2 className="text-2xl font-bold">{t('swapErrorView.title')}</h2> {/* Translate */}
      {swapErrorDetails && (
        <div className="w-full max-w-xs p-3 bg-red-800/30 border border-red-700 text-red-300 rounded-md text-xs break-words max-h-32 overflow-y-auto custom-scrollbar">
            <div className="flex items-center font-medium mb-1">
                <AlertTriangle size={14} className="mr-1.5"/> {t('swapErrorView.errorDetailsLabel')} {/* Translate */}
            </div>
            {swapErrorDetails} {/* This message comes from the backend/service, may or may not be a translation key itself */}
        </div>
      )}
      <div className="w-full max-w-xs space-y-2 pt-3">
        <button onClick={handleRetry} className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">
          {t('buttons.tryAgain')} {/* Translate */}
        </button>
        <button onClick={handleClose} className="w-full py-2.5 px-4 rounded-lg font-semibold text-gray-300 hover:bg-[#2A3447]">
          {t('buttons.close')} {/* Translate */}
        </button>
      </div>
    </div>
  );
};

export default SwapErrorView;