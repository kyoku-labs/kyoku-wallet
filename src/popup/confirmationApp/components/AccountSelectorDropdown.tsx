// src/popup/confirmationApp/components/AccountSelectorDropdown.tsx
import React from 'react';
import { Check } from 'lucide-react';
import type { PopupAccountMetadata } from '../confirmationApp'; // Assuming type is in parent or types file

interface AccountSelectorDropdownProps {
  accounts: PopupAccountMetadata[];
  selectedPublicKey: string | null;
  onSelectAccount: (publicKey: string) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>; // Allow null for the ref object
}

const AccountSelectorDropdown: React.FC<AccountSelectorDropdownProps> = ({
  accounts,
  selectedPublicKey,
  onSelectAccount,
  dropdownRef,
}) => {
  if (accounts.length <= 1) return null; 

  return (
    <div 
      ref={dropdownRef} // This ref is now correctly typed
      className="absolute top-full left-0 mt-1 w-64 bg-[#090f14] border border-gray-700 rounded-md shadow-xl z-20 max-h-48 overflow-y-auto custom-scrollbar py-1"
    >
      {accounts.map(acc => (
        <button 
          key={acc.uuid} 
          onClick={() => onSelectAccount(acc.publicKey)}
          className="w-full text-left px-3 py-2.5 hover:bg-[#313c50] text-gray-200 text-sm flex items-center justify-between"
        >
           <div className="min-w-0">
                {/* title attribute removed */}
                <span className="truncate block font-medium">{acc.name}</span>
                {/* title attribute removed */}
                <span className="text-xs font-mono text-gray-500 truncate block">
                  {`${acc.publicKey.substring(0,8)}...${acc.publicKey.substring(acc.publicKey.length - 8)}`}
                </span>
           </div>
           {selectedPublicKey === acc.publicKey && <Check size={18} className="text-blue-400 flex-shrink-0 ml-2"/>}
        </button>
      ))}
    </div>
  );
};

export default AccountSelectorDropdown;