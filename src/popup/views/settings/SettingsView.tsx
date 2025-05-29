// src/popup/views/settings/SettingsView.tsx
import React, { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import NetworkSettings from './NetworkSettings';
import AutoLockSettings from './AutoLockSettings';
import ChangePasswordSettings from './ChangePasswordSettings';
import ExplorerSettings from './ExplorerSettings';
import LanguageSettings from './LanguageSettings';
import CurrencySettings from './CurrencySettings';
import ConnectedDappsSettings from './ConnectedDappsSettings';
import AddressBookSettings from './AddressBookSettings';
import AboutSettings from './AboutSettings';
import FeeSettingsView from './FeeSettingsView';

type SettingsCategory = 'main' | 'general' | 'securityPrivacy' | 'addressBook' | 'about' | null;
type SettingsSubView =
  | 'network' | 'explorer' | 'currency' | 'language'
  | 'autoLock' | 'changePassword' | 'connectedDapps'
  | 'addressBookView' | 'aboutView' 
  | 'feeSettings'
  | null;

interface SettingsViewProps {
  onClose: () => void;
}

interface SettingItemProps {
  label: string; // Expected to be pre-translated
  description?: string; // Expected to be pre-translated
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({ label, description, onClick, variant = 'default', disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-between w-full p-4 rounded-xl transition-colors duration-150
      ${disabled
        ? 'bg-[#162132] opacity-50 cursor-not-allowed'
        : variant === 'danger'
        ? 'bg-red-900/30 border border-red-700 hover:bg-red-800/50 text-red-400 hover:text-red-300'
        : 'bg-[#161E2D] border border-[#334155] hover:bg-[#283347] text-white'
      }
    `}
  >
    <div className="flex flex-col items-start text-left flex-grow mr-2">
      <span className={`text-base font-medium ${disabled ? 'text-gray-500' : (variant === 'danger' ? 'text-red-300' : 'text-white')}`}>
        {label}
      </span>
      {description && (
        <span className={`text-xs mt-1 ${disabled ? 'text-gray-600' : (variant === 'danger' ? 'text-red-500/80' : 'text-gray-400')}`}>
          {description}
        </span>
      )}
    </div>
    {!disabled && variant !== 'danger' && <ChevronRight size={20} className="text-gray-500 flex-shrink-0" />}
  </button>
);

const SettingsView: React.FC<SettingsViewProps> = ({ onClose = () => {} }) => {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('main');
  const [activeSubView, setActiveSubView] = useState<SettingsSubView>(null);
 

  const handleCategorySelect = (category: SettingsCategory) => {
    setActiveCategory(category);
    setActiveSubView(null);
  };

  const handleSubViewSelect = (subView: SettingsSubView) => {
    setActiveSubView(subView);
  };

  const handleGoBack = () => {
    if (activeSubView !== null) {
      setActiveSubView(null); 
    } else if (activeCategory !== 'main') {
      setActiveCategory('main'); 
    } else {
      onClose(); 
    }
  };

  const handleImmediateLock = () => {
    chrome.runtime.sendMessage({ action: 'forceLockWallet' });
  };

  const getHeaderTitle = () => {
    if (activeSubView !== null) {
      if (activeSubView === 'feeSettings') return t('settings.transactionPriority');
      // Attempt to create a generic key, then fallback
      const subViewKey = activeSubView.replace('View', ''); // e.g., 'addressBook' from 'addressBookView'
      const genericKey = `settings.subViewTitles.${subViewKey}`;
      const defaultTitle = activeSubView.charAt(0).toUpperCase() + activeSubView.slice(1).replace(/([A-Z])/g, ' $1').replace('View', '').trim();
      return t(genericKey, defaultTitle); // Use t() with a fallback
    }
    
    // Category titles
    const categoryKey = `settings.categoryTitles.${activeCategory}`;
    const defaultCategoryTitle = activeCategory ? activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1) : t('settings.title');
    return t(categoryKey, defaultCategoryTitle);
  };

  const renderMainMenu = () => (
    <div className="space-y-3">
      <SettingItem
        label={t('settings.general')}
        description={t('settings.generalDescription')}
        onClick={() => handleCategorySelect('general')}
      />
      <SettingItem
        label={t('settings.securityPrivacy')}
        description={t('settings.securityPrivacyDescription')}
        onClick={() => handleCategorySelect('securityPrivacy')}
      />
      <SettingItem
        label={t('settings.addressBook')}
        description={t('settings.addressBookDescription')}
        onClick={() => handleSubViewSelect('addressBookView')}
      />
      <SettingItem
        label={t('settings.aboutKyoku')}
        description={t('settings.aboutKyokuDescription')}
        onClick={() => handleSubViewSelect('aboutView')}
      />
      <div className="pt-4">
        <SettingItem
          label={t('settings.lockWallet')}
          description={t('settings.lockWalletDescription')}
          onClick={handleImmediateLock}
          variant="danger"
        />
      </div>
    </div>
  );

  const renderGeneralMenu = () => (
    <div className="space-y-3">
      <SettingItem
        label={t('settings.network')}
        description={t('settings.networkDescription')}
        onClick={() => handleSubViewSelect('network')}
      />
      <SettingItem
        label={t('settings.transactionPriority')}
        description={t('settings.transactionPriorityDescription')}
        onClick={() => handleSubViewSelect('feeSettings')}
      />
      <SettingItem
        label={t('settings.preferredExplorer')}
        description={t('settings.preferredExplorerDescription')}
        onClick={() => handleSubViewSelect('explorer')}
      />
      <SettingItem
        label={t('settings.displayCurrency')}
        description={t('settings.displayCurrencyDescription')}
        onClick={() => handleSubViewSelect('currency')}
      />
      <SettingItem
        label={t('settings.displayLanguage')}
        description={t('settings.displayLanguageDescription')}
        onClick={() => handleSubViewSelect('language')}
      />
    </div>
  );

  const renderSecurityPrivacyMenu = () => (
    <div className="space-y-3">
      <SettingItem
        label={t('settings.autoLockTimer')}
        description={t('settings.autoLockTimerDescription')}
        onClick={() => handleSubViewSelect('autoLock')}
      />
      <SettingItem
        label={t('settings.changePassword')}
        description={t('settings.changePasswordDescription')}
        onClick={() => handleSubViewSelect('changePassword')}
      />
      <SettingItem
        label={t('settings.connectedApps')}
        description={t('settings.connectedAppsDescription')}
        onClick={() => handleSubViewSelect('connectedDapps')}
      />
    </div>
  );
  
  const renderContent = () => {
    if (activeSubView !== null) {
      switch (activeSubView) {
        case 'network': return <NetworkSettings onBack={() => setActiveSubView(null)} />;
        case 'explorer': return <ExplorerSettings onBack={() => setActiveSubView(null)} />;
        case 'currency': return <CurrencySettings onBack={() => setActiveSubView(null)} />;
        case 'language': return <LanguageSettings onBack={() => setActiveSubView(null)} />;
        case 'autoLock': return <AutoLockSettings onBack={() => setActiveSubView(null)} />;
        case 'changePassword': return <ChangePasswordSettings onBack={() => setActiveSubView(null)} />;
        case 'connectedDapps': return <ConnectedDappsSettings onBack={() => setActiveSubView(null)} />;
        case 'addressBookView': return <AddressBookSettings onBack={() => setActiveSubView(null)} />;
        case 'aboutView': return <AboutSettings onBack={() => setActiveSubView(null)} />;
        case 'feeSettings': return <FeeSettingsView onBack={() => setActiveSubView(null)} />;
        default:
          setActiveSubView(null);
          return null;
      }
    }

    switch (activeCategory) {
      case 'main': return renderMainMenu();
      case 'general': return renderGeneralMenu();
      case 'securityPrivacy': return renderSecurityPrivacyMenu();
      default:
        setActiveCategory('main');
        return renderMainMenu();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#090f14] text-white">
      <div className="flex items-center justify-between p-4 border-b border-[#243B55] flex-shrink-0 relative">
        <button
            onClick={handleGoBack}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label={t('common.back')}
        >
            <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
          {getHeaderTitle()}
        </h2>
        <div className="w-6 h-6"></div> {/* Spacer */}
      </div>
      <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
        {renderContent()}
      </div>
    </div>
  );
};

export default SettingsView;