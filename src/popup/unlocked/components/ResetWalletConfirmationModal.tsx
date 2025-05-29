// src/popup/components/ResetWalletConfirmationModal.tsx
import React from 'react';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ResetWalletConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void; // For cancel/closing the modal
  onConfirmReset: () => void; // The actual reset action
  isProcessing: boolean; // To show a loader on the confirm button
}

const ResetWalletConfirmationModal: React.FC<ResetWalletConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirmReset,
  isProcessing,
}) => {
  const { t } = useTranslation();

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4 transition-opacity duration-300 ease-out">
      <div className="bg-[#1A2433] rounded-xl shadow-2xl p-6 w-full max-w-md border border-red-700/50 text-white transform transition-all duration-300 ease-out scale-100">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-red-500 mb-3" />
          <h2 className="text-xl font-bold text-red-400 mb-4">
            {t('resetWalletModal.title')}
          </h2>
        </div>

        <div className="space-y-3 text-sm mb-6">
          <p className="text-yellow-300/90 bg-yellow-900/30 border border-yellow-700/40 p-3 rounded-md">
            <strong className="font-semibold">{t('common.warning')}:</strong> {t('resetWalletModal.warning.irreversible')}
          </p>
          <p className="text-red-300/90 bg-red-900/30 border border-red-700/40 p-3 rounded-md">
            {t('resetWalletModal.warning.cannotBeUndone')}
          </p>
          <p className="text-gray-300 text-xs">
            {t('resetWalletModal.warning.ensureBackup')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-gray-600 hover:bg-gray-500 transition-colors disabled:opacity-50 w-full sm:w-auto"
          >
            {t('buttons.cancel')}
          </button>
          <button
            onClick={onConfirmReset}
            disabled={isProcessing}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 focus:ring-red-500/50 focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1A2433] transition-colors flex items-center justify-center disabled:opacity-60 w-full sm:w-auto"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin mr-2" />
                {t('resetWalletModal.processingReset')}
              </>
            ) : (
              <>
                <Trash2 size={16} className="mr-1.5" />
                {t('resetWalletModal.confirmButtonText')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetWalletConfirmationModal;