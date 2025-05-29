// src/popup/confirmationApp/components/WarningDisplay.tsx
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WarningDisplayProps {
  messages: string[];
  severity: 'critical' | 'warning' | 'info';
  title?: string;
}

const WarningDisplay: React.FC<WarningDisplayProps> = ({ messages, severity, title }) => {
  const { t } = useTranslation();
  if (!messages || messages.length === 0) return null;

  let bgColor, borderColor, textColor, Icon, effectiveTitle;
  switch (severity) {
    case 'critical':
      bgColor = 'bg-red-800/50'; // Slightly less opaque
      borderColor = 'border-red-600/70';
      textColor = 'text-red-200';
      Icon = AlertTriangle;
      effectiveTitle = title || t('warningDisplay.defaultTitles.critical');
      break;
    case 'warning':
      bgColor = 'bg-yellow-800/40'; // Slightly less opaque
      borderColor = 'border-yellow-600/60';
      textColor = 'text-yellow-200';
      Icon = AlertTriangle;
      effectiveTitle = title || t('warningDisplay.defaultTitles.warning');
      break;
    default: // info
      bgColor = 'bg-blue-800/40'; // Slightly less opaque
      borderColor = 'border-blue-600/60';
      textColor = 'text-blue-200';
      Icon = Info;
      effectiveTitle = title || t('warningDisplay.defaultTitles.info');
      break;
  }

  return (
    // MODIFIED: Reduced margin-bottom, padding (p-2), title font size (text-xs), icon size (size={14})
    <div className={`mb-2 p-2 ${bgColor} border ${borderColor} rounded-md ${textColor} text-xs space-y-0.5`}>
      <div className="flex items-center font-semibold text-xs"> {/* Title text-xs */}
        <Icon size={14} className="mr-1.5 shrink-0" /> {/* Icon size 14 */}
        {effectiveTitle}
      </div>
      {messages.map((msg, index) => (
        <p key={index} className="pl-1">- {msg}</p> // Keep messages text-xs
      ))}
    </div>
  );
};

export default WarningDisplay;