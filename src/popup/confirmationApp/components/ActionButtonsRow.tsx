// src/popup/confirmationApp/components/ActionButtonsRow.tsx
import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface ActionButtonsRowProps {
  onReject: () => void;
  onApprove: () => void;
  isSubmitting: boolean;
  approveButtonText: string; // This will be passed already translated by the parent
  isApproveDisabled: boolean;
}

const ActionButtonsRow: React.FC<ActionButtonsRowProps> = ({
  onReject,
  onApprove,
  isSubmitting,
  approveButtonText,
  isApproveDisabled,
}) => {
  const { t } = useTranslation(); // Initialize useTranslation hook

  return (
    <div className="flex w-full space-x-3 pt-1 pb-1"> {/* Consistent spacing */}
      <button 
        onClick={onReject} 
        disabled={isSubmitting} 
        className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-semibold transition-colors shadow-sm active:bg-gray-500 text-base" // Consistent styling
      >
        {t('buttons.reject')} {/* Translate "Reject" */}
      </button>
      <button 
        onClick={onApprove} 
        disabled={isSubmitting || isApproveDisabled} 
        className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors shadow-sm active:bg-blue-500 disabled:opacity-60 text-base" // Consistent styling
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center">
            <Loader2 className="animate-spin h-5 w-5 mr-2" /> 
            {t('common.processing')} {/* Translate "Processing..." */}
          </span>
        ) : (
          approveButtonText // Assume this is already translated by the parent component
        )}
      </button>
    </div>
  );
};

export default ActionButtonsRow;