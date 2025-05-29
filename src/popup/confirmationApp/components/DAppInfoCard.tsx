// src/popup/confirmationApp/components/DAppInfoCard.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

interface DAppInfoCardProps {
  iconUrl?: string | null;
  dappTitle?: string | null;
  dappOrigin?: string | null;
}

const DAppInfoCard: React.FC<DAppInfoCardProps> = ({ iconUrl, dappTitle, dappOrigin }) => {
  const { t } = useTranslation();
  const effectiveIconUrl = iconUrl || "/icons/kyoku-logo.png"; // Default icon

  return (
    // MODIFIED: Reduced padding from p-3 to p-2
    <div className="bg-[#161E2D] p-2 rounded-lg border border-gray-700/80 space-y-1 text-sm shadow-md flex-shrink-0">
      <div className="flex items-center">
        <img
          src={effectiveIconUrl}
          alt={t('dAppInfoCard.altIconText')}
          // MODIFIED: Reduced icon size from w-10 h-10 to w-7 h-7
          className="w-7 h-7 rounded-md mr-2 border border-gray-600 object-cover bg-gray-800"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/icons/kyoku-logo.png"; }}
        />
        <div className="min-w-0"> {/* Added min-w-0 for better truncation */}
          <p className="text-xs text-gray-400">{t('dAppInfoCard.requestFrom')}</p>
          <p
            className="font-medium text-gray-100 truncate text-sm" // MODIFIED: Reduced title font from text-base to text-sm
          >
            {dappTitle || dappOrigin || t('dAppInfoCard.unknownDApp')}
          </p>
          {/* MODIFIED: Conditionally render origin only if different and dappTitle exists, keep text-xs */}
          {dappTitle && dappOrigin && dappTitle !== dappOrigin && (
            <p className="text-xs text-gray-500 truncate">
              {dappOrigin}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DAppInfoCard;