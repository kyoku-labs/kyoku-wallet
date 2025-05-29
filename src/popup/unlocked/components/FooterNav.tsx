// src/popup/unlocked/components/FooterNav.tsx
import { Home, Repeat, Settings } from "lucide-react";
import { useTranslation } from 'react-i18next'; // Import useTranslation
import React from 'react'; // Import React for FC type

interface FooterNavProps {
  onHomeClick?: () => void;
  onSwapClick?: () => void;
  onSettingsClick?: () => void;
}

const FooterNav: React.FC<FooterNavProps> = ({
  onHomeClick,
  onSwapClick,
  onSettingsClick,
}) => {
  const { t } = useTranslation(); // Initialize useTranslation

  const handleHome = onHomeClick;
  const handleSwap = onSwapClick; // Translate alert

  return (
    <nav className="flex justify-around items-center h-14 bg-[#161E2D] rounded-2xl">
      <button
        onClick={handleHome}
        aria-label={t('footerNav.home')} // Translate aria-label
        // title attribute removed
        className={`flex items-center justify-center p-3 rounded-lg ${onHomeClick ? 'hover:bg-[#3A4456]' : 'cursor-not-allowed opacity-50'}`}
        disabled={!onHomeClick}
      >
        <Home className="w-6 h-6 text-gray-300 hover:text-white" />
      </button>

      <button
        onClick={handleSwap}
        aria-label={t('footerNav.swap')} // Translate aria-label
        // title attribute removed
        className={`flex items-center justify-center p-3 rounded-lg ${onSwapClick ? 'hover:bg-[#3A4456]' : 'cursor-not-allowed opacity-50'}`}
        disabled={!onSwapClick}
      >
        <Repeat className="w-6 h-6 text-gray-300 hover:text-white" />
      </button>

      <button
        onClick={onSettingsClick}
        aria-label={t('footerNav.settings')} // Translate aria-label
        // title attribute removed
        className={`flex items-center justify-center p-3 rounded-lg ${onSettingsClick ? 'hover:bg-[#3A4456]' : 'cursor-not-allowed opacity-50'}`}
        disabled={!onSettingsClick}
      >
        <Settings className="w-6 h-6 text-gray-300 hover:text-white" />
      </button>
    </nav>
  );
};

export default FooterNav;