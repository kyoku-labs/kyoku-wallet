// src/popup/unlocked/components/RenameModal.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface RenameModalProps {
  initialName: string;
  isOpen: boolean;
  onSave: (newName: string) => void;
  onCancel: () => void;
}

const RenameModal: React.FC<RenameModalProps> = ({
  initialName,
  isOpen,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const [name, setName] = useState(initialName);

  // Reset local state when reopened
  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-[#161E2D] rounded-lg p-6 w-80">
        <h2 className="text-white text-lg mb-4">{t('renameModal.title')}</h2> {/* Translate */}
        <input
          type="text"
          className="w-full px-3 py-2 mb-4 bg-[#334155] text-white rounded focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t('renameModal.inputAriaLabel')} // For accessibility
        />
        <div className="flex justify-end space-x-2">
          <button
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
            onClick={onCancel}
          >
            {t('buttons.cancel')} {/* Translate */}
          </button>
          <button
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
            onClick={() => onSave(name.trim())}
            disabled={!name.trim()}
          >
            {t('buttons.save')} {/* Translate */}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RenameModal;