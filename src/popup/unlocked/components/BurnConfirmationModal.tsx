// src/popup/unlocked/components/BurnConfirmationModal.tsx
import React from 'react';
import { AlertTriangle, Trash2, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface BurnConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmBurn: () => void;
  itemName: string;
  itemType: 'Token' | 'NFT';
  isLoading?: boolean;
  error?: string | null;
}

const BurnConfirmationModal: React.FC<BurnConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirmBurn,
  itemName,
  itemType,
  isLoading = false,
  error = null,
}) => {
  const { t } = useTranslation(); // Initialize useTranslation

  if (!isOpen) {
    return null;
  }

  const rentRecoveryMessage = itemType === 'Token'
    ? t('burnConfirmationModal.rentRecoveryToken')
    : t('burnConfirmationModal.permanentActionNft');

  const hasError = !!error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
      <div className="bg-[#1A2433] rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-700 text-white transform transition-all duration-300 ease-out scale-100">
        
        {!isLoading && !hasError && (
          <>
            <div className="flex items-center justify-center mb-4">
              <AlertTriangle size={28} className="text-red-500 mr-3" />
              <h2 className="text-xl font-bold text-red-400 text-center">
                {t('burnConfirmationModal.title', { itemType })} {/* Translate title */}
              </h2>
            </div>
            <p className="text-sm text-gray-300 mb-3 text-center">
              {t('burnConfirmationModal.aboutToBurn')} {/* Translate */}
            </p>
            {/* title attribute removed */}
            <p className="text-lg font-semibold text-center text-yellow-400 mb-4 break-words">
              {itemName}
            </p>
            <div className="text-xs text-yellow-500 bg-yellow-900/40 border border-yellow-700/50 p-3 rounded-md mb-6 space-y-1">
              <p><strong>{t('burnConfirmationModal.warningTitle')}:</strong> {t('burnConfirmationModal.irreversibleAction', { itemType: itemType.toLowerCase() })}</p> {/* Translate */}
              <p>{rentRecoveryMessage}</p>
            </div>
          </>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 size={40} className="text-blue-400 animate-spin" />
            <p className="mt-4 text-lg text-gray-300">{t('burnConfirmationModal.loading', { itemType: itemType.toLowerCase() })}</p> {/* Translate */}
          </div>
        )}

        {hasError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <XCircle size={40} className="text-red-500 mb-3" />
            <h3 className="text-lg font-semibold text-red-400 mb-2">{t('burnConfirmationModal.burnFailedTitle')}</h3> {/* Translate */}
            <p className="text-sm text-red-300 bg-red-700/20 p-3 rounded-md border border-red-600/50 w-full break-words max-h-24 overflow-y-auto custom-scrollbar">
              {error} {/* Error message from parent, assumed to be already translated or not needing translation here */}
            </p>
          </div>
        )}

        <div className="flex justify-end space-x-3 mt-6">
          {!isLoading && (
            <>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-gray-600 hover:bg-gray-500 transition-colors"
              >
                {hasError ? t('buttons.close') : t('buttons.cancel')} {/* Translate */}
              </button>
              {!hasError && (
                <button
                  onClick={onConfirmBurn}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 focus:ring-red-500/50 focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1A2433] transition-colors flex items-center justify-center"
                >
                  <Trash2 size={16} className="mr-1.5" />
                  {t('burnConfirmationModal.buttons.confirmBurn')} {/* Translate */}
                </button>
              )}
              {hasError && (
                 <button
                    onClick={onConfirmBurn} 
                    className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 focus:ring-blue-500/50 focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1A2433] transition-colors flex items-center justify-center"
                  >
                    {t('burnConfirmationModal.buttons.retryBurn')} {/* Translate */}
                  </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BurnConfirmationModal;