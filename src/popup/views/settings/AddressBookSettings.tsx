// src/popup/views/settings/AddressBookSettings.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { config } from '../../../background/shared/state';
import { PublicKey } from '@solana/web3.js';
import { ArrowLeft, Plus, Edit, Trash2, Save, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface AddressBookSettingsProps {
  onBack: () => void;
}

interface AddressEntry {
  id: string;
  name: string;
  address: string;
}

const AddressBookSettings: React.FC<AddressBookSettingsProps> = ({ onBack }) => {
  const { t } = useTranslation(); // Initialize useTranslation

  const [addresses, setAddresses] = useState<AddressEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingOrEditing, setIsAddingOrEditing] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<{ id: string | null; name: string; address: string }>({ id: null, name: '', address: '' });

  const loadAddresses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await chrome.storage.local.get(config.ADDRESS_BOOK_KEY);
      const savedAddresses = result[config.ADDRESS_BOOK_KEY] as AddressEntry[] | undefined;
      if (Array.isArray(savedAddresses)) {
        setAddresses(savedAddresses);
      } else {
        setAddresses([]);
      }
    } catch (err) {
      console.error('Failed to load address book:', err);
      setError(t('addressBook.errors.loadFailed'));
      setAddresses([]);
    } finally {
      setIsLoading(false);
    }
  }, [t]); // Added t to dependency array

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const validateSolanaAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  };

  const saveAddresses = async (updatedAddresses: AddressEntry[]) => {
    try {
      updatedAddresses.sort((a, b) => a.name.localeCompare(b.name));
      await chrome.storage.local.set({ [config.ADDRESS_BOOK_KEY]: updatedAddresses });
      setAddresses(updatedAddresses);
      setError(null);
    } catch (err) {
      console.error('Failed to save address book:', err);
      setError(t('addressBook.errors.saveFailed'));
    }
  };

  const handleAddNew = () => {
    setError(null);
    setCurrentEntry({ id: null, name: '', address: '' });
    setIsAddingOrEditing(true);
  };

  const handleEdit = (entry: AddressEntry) => {
    setError(null);
    setCurrentEntry({ ...entry });
    setIsAddingOrEditing(true);
  };

  const handleDelete = (id: string) => {
    // Consider adding a translatable window.confirm here if you re-enable it
    // if (!window.confirm(t('addressBook.confirmDeleteMessage'))) return;
    const updatedAddresses = addresses.filter(addr => addr.id !== id);
    saveAddresses(updatedAddresses);
  };

  const handleCancel = () => {
    setIsAddingOrEditing(false);
    setCurrentEntry({ id: null, name: '', address: '' });
    setError(null);
  };

  const handleSave = () => {
    setError(null);
    const trimmedName = currentEntry.name.trim();
    const trimmedAddress = currentEntry.address.trim();

    if (!trimmedName || !trimmedAddress) {
      setError(t('addressBook.errors.nameAndAddressRequired'));
      return;
    }
    if (!validateSolanaAddress(trimmedAddress)) {
      setError(t('addressBook.errors.invalidSolanaAddress'));
      return;
    }
     if (!currentEntry.id && addresses.some(addr => addr.address === trimmedAddress)) {
         setError(t('addressBook.errors.addressExists'));
         return;
     }
     if (currentEntry.id && addresses.some(addr => addr.address === trimmedAddress && addr.id !== currentEntry.id)) {
         setError(t('addressBook.errors.addressExistsDifferentName'));
         return;
     }

    let updatedAddresses: AddressEntry[];

    if (currentEntry.id) {
      updatedAddresses = addresses.map(addr =>
        addr.id === currentEntry.id
          ? { ...addr, name: trimmedName, address: trimmedAddress }
          : addr
      );
    } else {
      const newAddressEntry: AddressEntry = {
        id: crypto.randomUUID(),
        name: trimmedName,
        address: trimmedAddress
      };
      updatedAddresses = [...addresses, newAddressEntry];
    }

    saveAddresses(updatedAddresses);
    handleCancel();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#090f14] p-4 text-white">
         <div className="flex items-center mb-6 relative flex-shrink-0">
            <button onClick={onBack} className="absolute left-0 p-1 text-gray-400 hover:text-white" aria-label={t('common.back')}>
                <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-semibold text-center flex-grow text-[#A8DADC]">{t('addressBook.title')}</h1>
            <div className="w-6"></div> {/* Spacer */}
        </div>
        <div className="flex-grow flex justify-center items-center text-gray-400">
            {t('addressBook.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#090f14] p-4 text-white">
      <div className="flex items-center mb-6 relative flex-shrink-0">
        {/* The parent SettingsView provides the main title for "Address Book", so this header could be simplified or removed if desired */}
         {!isAddingOrEditing && (
            <button
                onClick={handleAddNew}
                className="absolute right-0 p-1 text-gray-400 hover:text-white"
                aria-label={t('addressBook.buttons.addNewAddress')} // Use aria-label instead of title
            >
                <Plus size={22} />
            </button>
         )}
         {isAddingOrEditing && <div className="w-6 h-6"></div> /* Spacer for alignment when add button is hidden */}
      </div>

      {isAddingOrEditing && (
        <div className="p-4 mb-4 bg-[#162132] border border-[#334155] rounded-lg space-y-3 flex-shrink-0">
          <h3 className="text-lg font-medium text-[#A8DADC] mb-1">
            {currentEntry.id ? t('addressBook.editAddressTitle') : t('addressBook.addNewAddressTitle')}
          </h3>
          {error && (
            <div className="p-2 bg-red-900/50 border border-red-700 text-red-300 rounded text-xs">
                {error}
            </div>
          )}
          <div>
            <label htmlFor="entryName" className="block text-sm font-medium text-gray-300 mb-1">{t('addressBook.labels.name')}</label>
            <input
              id="entryName"
              type="text"
              value={currentEntry.name}
              onChange={(e) => setCurrentEntry(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('addressBook.placeholders.nameExample')}
              className="w-full p-2 bg-[#161E2D] border border-[#334155] rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label htmlFor="entryAddress" className="block text-sm font-medium text-gray-300 mb-1">{t('addressBook.labels.address')}</label>
            <input
              id="entryAddress"
              type="text"
              value={currentEntry.address}
              onChange={(e) => {
                  setCurrentEntry(prev => ({ ...prev, address: e.target.value }));
                  if (error && error.toLowerCase().includes(t('addressBook.addressIdentifierForErrorCheck'))) setError(null); // Use a non-translatable identifier or check key
              }}
              placeholder={t('addressBook.placeholders.pasteAddress')}
              className={`w-full p-2 bg-[#161E2D] border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm ${error && error.toLowerCase().includes(t('addressBook.addressIdentifierForErrorCheck')) ? 'border-red-500' : 'border-[#334155]'}`}
              spellCheck="false"
            />
          </div>
          <div className="flex space-x-3 pt-2">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center p-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm font-medium transition-colors disabled:opacity-50"
              disabled={!currentEntry.name.trim() || !currentEntry.address.trim()}
            >
              <Save size={16} className="mr-1" /> {t('buttons.save')}
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center p-2 bg-gray-600 hover:bg-gray-500 rounded text-white text-sm font-medium transition-colors"
            >
               <XCircle size={16} className="mr-1" /> {t('buttons.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="flex-grow overflow-y-auto custom-scrollbar pr-1 space-y-2">
        {!isAddingOrEditing && addresses.length === 0 && (
          <div className="p-6 text-center text-gray-500 rounded">
            {t('addressBook.emptyStateLine1')} <br/> {t('addressBook.emptyStateLine2')}
          </div>
        )}
        {!isAddingOrEditing && addresses.map((addr) => (
          <div key={addr.id} className="p-3 bg-[#161E2D] rounded-lg border border-[#334155] flex items-center justify-between space-x-2">
            <div className="flex-grow min-w-0">
              {/* title attribute removed */}
              <h4 className="text-white font-medium truncate">{addr.name}</h4>
              {/* title attribute removed */}
              <p className="text-gray-400 text-xs break-all font-mono">{addr.address}</p>
            </div>
            <div className="flex space-x-2 flex-shrink-0">
              <button
                onClick={() => handleEdit(addr)}
                className="p-1 text-gray-400 hover:text-blue-400 transition-colors"
                aria-label={t('addressBook.buttons.editAddress', { name: addr.name })} // Translate
              >
                <Edit size={16} />
              </button>
              <button
                onClick={() => handleDelete(addr.id)}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                aria-label={t('addressBook.buttons.deleteAddress', { name: addr.name })} // Translate
             >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AddressBookSettings;