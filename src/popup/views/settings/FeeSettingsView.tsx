// src/popup/views/settings/FeeSettingsView.tsx
import React from 'react';
import { useAppStore } from '../../../store/appStore';
import type { PriorityFeeLevel } from '../../../background/shared/state'; 
import { CheckCircle, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface FeeSettingsViewProps {
  onBack: () => void; 
}

interface FeeOption {
  id: PriorityFeeLevel;
  labelKey: string; // Key for the translated label
  descriptionKey: string; // Key for the translated description
  icon?: React.ReactNode; 
}

const FeeSettingsView: React.FC<FeeSettingsViewProps> = ({ }) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const priorityFeeLevel = useAppStore((state) => state.priorityFeeLevel);
  const setPriorityFeeLevel = useAppStore((state) => state.setPriorityFeeLevel);

  // Define feeOptions with translation keys
  const feeOptions: FeeOption[] = [
    {
      id: 'auto',
      labelKey: 'feeSettings.options.auto.label',
      descriptionKey: 'feeSettings.options.auto.description',
      icon: <Zap size={18} className="text-yellow-400" />,
    },
    {
      id: 'low',
      labelKey: 'feeSettings.options.low.label',
      descriptionKey: 'feeSettings.options.low.description',
    },
    {
      id: 'medium',
      labelKey: 'feeSettings.options.medium.label',
      descriptionKey: 'feeSettings.options.medium.description',
    },
    {
      id: 'high',
      labelKey: 'feeSettings.options.high.label',
      descriptionKey: 'feeSettings.options.high.description',
    },
  ];

  const handleSelectFeeLevel = (level: PriorityFeeLevel) => {
    setPriorityFeeLevel(level);
  };

  return (
    <div className="space-y-4 text-gray-300">
      <p className="text-gray-400 text-sm mb-4">
        {t('feeSettings.description')} {/* Translate description */}
      </p>
      
      <div className="space-y-3">
        {feeOptions.map((option) => (
          <div 
            key={option.id}
            className={`p-4 rounded-lg cursor-pointer transition-all duration-150 ease-in-out flex items-center justify-between
              ${priorityFeeLevel === option.id 
                ? 'bg-blue-600/20 border-2 border-blue-500 shadow-md ring-1 ring-blue-400' 
                : 'bg-[#161E2D] border border-[#334155] hover:bg-[#2A3447]'
              }`}
            onClick={() => handleSelectFeeLevel(option.id)}
            role="radio"
            aria-checked={priorityFeeLevel === option.id}
            tabIndex={0}
            onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectFeeLevel(option.id); }}
            aria-label={t(option.labelKey)} // Add aria-label for accessibility
          >
            <div className="flex items-center flex-grow min-w-0">
              {option.icon && <span className="mr-3 flex-shrink-0">{option.icon}</span>}
              <div className="flex-grow min-w-0">
                <span className="font-semibold text-base text-white block">{t(option.labelKey)}</span> {/* Translate label */}
                <p className="text-xs text-gray-400 mt-0.5 break-words">{t(option.descriptionKey)}</p> {/* Translate description */}
              </div>
            </div>
            {priorityFeeLevel === option.id && (
              <CheckCircle size={20} className="text-blue-400 flex-shrink-0 ml-3" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeeSettingsView;