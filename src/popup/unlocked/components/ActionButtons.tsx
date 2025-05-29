// src/popup/unlocked/components/ActionButtons.tsx
import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ActionButtonsProps {
  onReceiveClick: () => void;
  onSendClick: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  onReceiveClick,
  onSendClick,
}) => {
  const { t } = useTranslation();

  const actions = [
    { nameKey: 'actionButtons.receive', handler: onReceiveClick, Icon: ArrowDown },
    { nameKey: 'actionButtons.send', handler: onSendClick, Icon: ArrowUp },
  ];

  return (
    <div className="flex justify-center gap-x-8 mb-3">
      {actions.map((action) => (
        <div key={action.nameKey} className="flex flex-col items-center">
          <button
            onClick={action.handler}
            className="w-11 h-11 rounded-lg bg-[#161E2D] hover:bg-[#3A4456] flex items-center justify-center text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1A2433] focus:ring-white/40 transition-all duration-150 ease-in-out hover:scale-105 active:scale-95"
            aria-label={t(action.nameKey)}
          >
            <action.Icon className="w-5 h-5 text-white" />
          </button>
          <span className="mt-1.5 text-xs text-white opacity-75">{t(action.nameKey)}</span>
        </div>
      ))}
    </div>
  );
};

export default ActionButtons;