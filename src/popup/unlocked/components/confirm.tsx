// src/popup/unlocked/components/confirm.tsx
import React from 'react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string; // Expected to be translated by parent
  message: React.ReactNode; // Expected to be translated or be dynamic JSX from parent
  confirmText?: string; // Expected to be translated by parent if provided
  cancelText?: string;  // Expected to be translated by parent if provided
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText, // Keep optional
  cancelText,  // Keep optional
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation(); // Initialize useTranslation

  if (!isOpen) {
    return null;
  }

  // Use translated defaults if specific texts aren't provided
  const effectiveConfirmText = confirmText || t('buttons.confirm', 'Confirm');
  const effectiveCancelText = cancelText || t('buttons.cancel', 'Cancel');

  return (
    // Overlay
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      {/* Modal Box */}
      <div className="bg-[#161E2D] rounded-lg shadow-xl p-6 w-full max-w-sm mx-4 border border-gray-700">
        {/* Title */}
        <h2 className={`text-xl font-semibold mb-4 ${isDanger ? 'text-red-400' : 'text-white'}`}>
          {title} {/* `title` is passed from parent, assumed to be translated */}
        </h2>

        {/* Message */}
        <div className="text-sm text-gray-300 mb-6 whitespace-pre-wrap">
          {message} {/* `message` is passed from parent, assumed to be translated or dynamic */}
        </div>

        {/* Buttons */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white transition-colors"
          >
            {effectiveCancelText} {/* Use translated default or passed prop */}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${
              isDanger
                ? 'bg-red-600 hover:bg-red-500 focus:ring-red-500'
                : 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-500'
            } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#161E2D]`}
          >
            {effectiveConfirmText} {/* Use translated default or passed prop */}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;