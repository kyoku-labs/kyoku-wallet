// src/popup/views/settings/AccountSettingsView.tsx
import React, { useState, useCallback } from 'react';
import { AccountMetadata } from '../../background/core/keyring/types';
import { ArrowLeft, Edit, KeyRound, FileText, Trash2, Copy, Check, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface AccountSettingsViewProps {
  account: AccountMetadata | null;
  onBack: () => void;
  onRename: (uuid: string, currentName: string) => void;
  onShowPrivateKey: (uuid: string, accountName: string) => void;
  onShowSeedPhrase: (uuid: string, accountName: string) => void;
  onRemove: (uuid: string) => void;
}

const truncateAddress = (address: string, startChars = 8, endChars = 8): string => {
  if (!address) return '...';
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
};

const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({
  account,
  onBack,
  onRename,
  onShowPrivateKey,
  onShowSeedPhrase,
  onRemove,
}) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const [addressCopied, setAddressCopied] = useState(false);

  if (!account) {
    return (
      <div className="flex flex-col h-full bg-[#090f14] p-4 text-white items-center justify-center">
        <p>{t('accountSettings.noAccountSelected')}</p> {/* Translate */}
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">
          {t('common.goBack')} {/* Translate */}
        </button>
      </div>
    );
  }

  const { uuid, name, publicKey, isViewOnly, derivationPath } = account;

  const handleCopyAddress = useCallback(() => {
    navigator.clipboard.writeText(publicKey).then(() => {
      setAddressCopied(true);
      setTimeout(() => {
        setAddressCopied(false);
      }, 2000);
    }).catch(_err => {
     // console.error('Failed to copy address: ', err);
      alert(t('accountSettings.errors.copyFailed')); // Translate alert
    });
  }, [publicKey, t]); // Added t to dependency array

  const menuItems = [
    {
      label: t('accountSettings.menu.walletAddress'), // Translate
      value: truncateAddress(publicKey),
      action: handleCopyAddress,
      icon: addressCopied ? <Check size={20} className="text-green-400" /> : <Copy size={20} className="text-gray-400" />,
      showArrow: false,
      isCopy: true,
    },
    {
      label: t('accountSettings.menu.renameWallet'), // Translate
      action: () => onRename(uuid, name),
      icon: <Edit size={20} className="text-gray-400" />,
      showArrow: true,
    },
    ...(isViewOnly ? [] : [{
      label: t('accountSettings.menu.showPrivateKey'), // Translate
      action: () => onShowPrivateKey(uuid, name),
      icon: <KeyRound size={20} className="text-gray-400" />,
      showArrow: true,
    }]),
    ...(isViewOnly || !derivationPath ? [] : [{
      label: t('accountSettings.menu.showRecoveryPhrase'), // Translate
      action: () => onShowSeedPhrase(uuid, name),
      icon: <FileText size={20} className="text-gray-400" />,
      showArrow: true,
    }]),
    {
      label: t('accountSettings.menu.removeWallet'), // Translate
      action: () => onRemove(uuid),
      icon: <Trash2 size={20} className="text-red-500" />,
      showArrow: true,
      isDanger: true,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#090f14] text-white">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-800 flex-shrink-0 relative">
        <button
          onClick={onBack}
          className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2"
          aria-label={t('common.goBack')} // Translate aria-label
        >
          <ArrowLeft size={22} />
        </button>
        {/* title attribute removed */}
        <h2 className="text-xl font-semibold text-center flex-grow truncate px-12"> 
          {name}
        </h2>
         <div className="w-6 h-6"></div> 
      </div>

      {/* Menu Items */}
      <div className="flex-grow overflow-y-auto p-3 space-y-2">
        {menuItems.map((item, index) => (
          <button
            key={index}
            onClick={item.action}
            className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors duration-150
              ${item.isDanger
               ? 'bg-red-900/30 border border-red-700 hover:bg-red-800/50 text-red-400 hover:text-red-300'
               : 'bg-[#161E2D] hover:bg-[#283347]'
             }
          `}
            // Add aria-label for menu items if item.label is consistently a string
            aria-label={item.label}
          >
            <div className="flex items-center">
              <span className="mr-3 flex-shrink-0 w-5">{item.icon}</span>
              <div className="flex flex-col items-start">
                <span className={`text-base ${item.isDanger ? 'text-red-400' : 'text-white'}`}>
                  {item.label}
                </span>
                {item.value && (
                  // title attribute removed
                  <span className="text-xs text-gray-500 font-mono mt-0.5"> 
                    {item.value}
                  </span>
                )}
              </div>
            </div>
            {item.showArrow && !item.isCopy && (
               <ChevronRight size={20} className={item.isDanger ? "text-red-300" : "text-gray-500"} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AccountSettingsView;