// src/popup/views/send/SendFormView.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TokenInfo, AccountMetadata } from '../../../background/core/keyring/types';
import { CryptoUtils } from '../../../utils/cryptoutils';
import { formatTokenBalance } from '../../../utils/formatters';
import { getFromStorage } from '../../../utils/storage';
import { config } from '../../../background/shared/state';
import { ChevronDown, Users, BookUser, X, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface AddressBookEntry {
  id: string;
  name: string;
  address: string;
}

interface SelectableRecipient {
  name: string;
  address: string;
  type: 'my_account' | 'address_book';
}

interface SendFormViewProps {
  token: TokenInfo | null;
  onBack: () => void;
  onReviewTransaction: (details: {
    recipientAddress: string;
    amount: string;
    token: TokenInfo;
  }) => void;
  currentUserAccounts: AccountMetadata[];
  senderAddress: string;
}

const SendFormView: React.FC<SendFormViewProps> = ({
  token,
  onBack,
  onReviewTransaction,
  currentUserAccounts,
  senderAddress,
}) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const isNFT = token?.decimals === 0;

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState(isNFT ? "1" : '');
  const [recipientAddressError, setRecipientAddressError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [isFormPotentiallyValid, setIsFormPotentiallyValid] = useState(false);
  const [isTouchedAddress, setIsTouchedAddress] = useState(false);
  const [isTouchedAmount, setIsTouchedAmount] = useState(false);

  const [addressBookEntries, setAddressBookEntries] = useState<AddressBookEntry[]>([]);
  const [isLoadingAddressBook, setIsLoadingAddressBook] = useState(true);
  const [showRecipientSelector, setShowRecipientSelector] = useState(false);
  const [selectedRecipientName, setSelectedRecipientName] = useState<string | null>(null);

  const [isRecipientLikelyNew, setIsRecipientLikelyNew] = useState(false);
  const [recipientStatusMsg, setRecipientStatusMsg] = useState<string | null>(null);

  const recipientInputContainerRef = useRef<HTMLDivElement>(null);
  const transactionDetailsForSelectedNameRef = useRef<{name: string, address: string} | null>(null);
  const recipientCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchAddressBook = async () => {
      setIsLoadingAddressBook(true);
      try {
        const storedEntries = await getFromStorage<AddressBookEntry[]>(config.ADDRESS_BOOK_KEY);
        setAddressBookEntries(Array.isArray(storedEntries) ? storedEntries.sort((a, b) => a.name.localeCompare(b.name)) : []);
      } catch (error) {
        setAddressBookEntries([]);
      } finally {
        setIsLoadingAddressBook(false);
      }
    };
    fetchAddressBook();
  }, []);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (recipientInputContainerRef.current && !recipientInputContainerRef.current.contains(event.target as Node)) {
        setShowRecipientSelector(false);
      }
    }
    if (showRecipientSelector) { document.addEventListener("mousedown", handleClickOutside); }
    else { document.removeEventListener("mousedown", handleClickOutside); }
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [showRecipientSelector]);

  const selectableRecipients = React.useMemo(() => {
    const myAccounts: SelectableRecipient[] = currentUserAccounts
      .filter(acc => acc.publicKey !== senderAddress)
      .map(acc => ({ name: acc.name, address: acc.publicKey, type: 'my_account' as const }));
    const bookAddresses: SelectableRecipient[] = addressBookEntries.map(entry => ({
      name: entry.name,
      address: entry.address,
      type: 'address_book' as const,
    }));
    
    const combined = [...myAccounts, ...bookAddresses];
    const uniqueRecipientsMap = new Map<string, SelectableRecipient>();
    for (const recipient of combined) {
      if (!uniqueRecipientsMap.has(recipient.address) || 
          (uniqueRecipientsMap.get(recipient.address)?.type === 'address_book' && recipient.type === 'my_account')) {
        uniqueRecipientsMap.set(recipient.address, recipient);
      }
    }
    const uniqueRecipients = Array.from(uniqueRecipientsMap.values());
    const searchLower = recipientAddress.toLowerCase();

    if (recipientAddress && (!selectedRecipientName || recipientAddress !== transactionDetailsForSelectedNameRef.current?.address)) {
        return uniqueRecipients.filter(r => 
            r.name.toLowerCase().includes(searchLower) || 
            r.address.toLowerCase().includes(searchLower)
        ).sort((a,b) => a.name.localeCompare(b.name));
    }
    return uniqueRecipients.sort((a,b) => a.name.localeCompare(b.name));
  }, [currentUserAccounts, addressBookEntries, senderAddress, recipientAddress, selectedRecipientName]);

  const performValidation = useCallback((currentAddr: string, currentAmount: string): boolean => {
    let newAddressErrorOut: string | null = null;
    let newAmountErrorOut: string | null = null;
    let isAddressValid = true;
    let isAmountValid = true;

    if (!currentAddr) {
      newAddressErrorOut = t('sendForm.errors.recipientRequired');
      isAddressValid = false;
    } else if (!CryptoUtils.isValidPublicKey(currentAddr)) {
      newAddressErrorOut = t('sendForm.errors.invalidSolanaAddress');
      isAddressValid = false;
    }
    setRecipientAddressError(newAddressErrorOut);

    const numericAmount = parseFloat(currentAmount);
    if (isNFT) {
        if (currentAmount !== "1") {
            newAmountErrorOut = t('sendForm.errors.nftAmountMustBeOne');
            isAmountValid = false;
        }
    } else {
        if (!currentAmount) {
          newAmountErrorOut = t('sendForm.errors.amountRequired');
          isAmountValid = false;
        } else if (isNaN(numericAmount) || numericAmount <= 0) {
          newAmountErrorOut = t('sendForm.errors.validPositiveAmount');
          isAmountValid = false;
        } else if (token && numericAmount > token.balance) {
          newAmountErrorOut = t('sendForm.errors.amountExceedsBalance', { 
            balance: formatTokenBalance(token.balance, token.decimals), 
            symbol: token.symbol 
          });
          isAmountValid = false;
        }
    }
    setAmountError(newAmountErrorOut);

    const overallValidity = isAddressValid && isAmountValid && !!token;
    setIsFormPotentiallyValid(overallValidity);
    return overallValidity;
  }, [token, isNFT, t, setRecipientAddressError, setAmountError, setIsFormPotentiallyValid]);

  const triggerRecipientStatusCheck = useCallback((addressToCheck: string) => {
    if (!token) return;

   // console.log("[SendFormView] Triggering recipient status check for:", addressToCheck, "Token:", token.isNative ? "SOL" : token.symbol);
    setIsRecipientLikelyNew(false);
    setRecipientStatusMsg(null);

    chrome.runtime.sendMessage(
      { 
        action: 'checkRecipientAddressStatus', 
        payload: { 
          recipientAddress: addressToCheck, 
          tokenMintAddress: token.isNative ? null : token.address 
        } 
      },
      (response) => {
        if (chrome.runtime.lastError) {
        //  console.error("Error checking recipient status:", chrome.runtime.lastError.message);
          if (recipientInputContainerRef.current && addressToCheck === recipientAddress) {
            setRecipientStatusMsg(t('sendForm.errors.couldNotVerifyRecipient'));
          }
          return;
        }
        if (recipientInputContainerRef.current && addressToCheck === recipientAddress) {
            if (response && response.success) {
                setIsRecipientLikelyNew(response.isLikelyNew);
                setRecipientStatusMsg(response.isLikelyNew ? response.statusMessage : null); // Assuming statusMessage from backend is okay or needs mapping
              //  console.log("[SendFormView] Recipient status response:", response);
            } else {
                console.warn("Failed to check recipient status from background:", response?.error);
                setRecipientStatusMsg(response?.error || t('sendForm.errors.failedToVerifyRecipient'));
            }
        } else {
         //  console.log("[SendFormView] Stale recipient status response ignored or component unmounted for:", addressToCheck);
        }
      }
    );
  }, [token, recipientAddress, t]);

  useEffect(() => {
    if (recipientAddress && CryptoUtils.isValidPublicKey(recipientAddress) && token) {
      if (recipientCheckTimeoutRef.current) {
        clearTimeout(recipientCheckTimeoutRef.current);
      }
      setIsRecipientLikelyNew(false);
      setRecipientStatusMsg(null);

      recipientCheckTimeoutRef.current = setTimeout(() => {
        triggerRecipientStatusCheck(recipientAddress);
      }, 750);
    } else {
      setIsRecipientLikelyNew(false);
      setRecipientStatusMsg(null);
      if (recipientCheckTimeoutRef.current) {
        clearTimeout(recipientCheckTimeoutRef.current);
      }
    }
    return () => {
      if (recipientCheckTimeoutRef.current) {
        clearTimeout(recipientCheckTimeoutRef.current);
      }
    };
  }, [recipientAddress, token, triggerRecipientStatusCheck]);

  useEffect(() => {
    if (isNFT) {
        if (amount !== "1") setAmount("1");
    }
    performValidation(recipientAddress, isNFT ? "1" : amount);
  }, [recipientAddress, amount, token, isNFT, performValidation]);

  if (!token) { 
    return ( 
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <p className="text-red-400 text-lg mb-4">{t('sendForm.noTokenSelected')}</p>
        <button onClick={onBack} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          {t('sendForm.buttons.selectToken')}
        </button>
      </div> 
    ); 
  }

  const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value;
    setRecipientAddress(newAddress);
    if (selectedRecipientName && newAddress !== transactionDetailsForSelectedNameRef.current?.address) {
        setSelectedRecipientName(null); 
        transactionDetailsForSelectedNameRef.current = null;
    }
    setShowRecipientSelector(true); 
    if (isTouchedAddress) {
        performValidation(newAddress, amount);
    }
  };
  
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => { 
    const newAmount = e.target.value; 
    if (isNFT) return;
    if (/^\d*\.?\d*$/.test(newAmount) || newAmount === '') {
      setAmount(newAmount);
      if (isTouchedAmount) performValidation(recipientAddress, newAmount);
    }
  };
  
  const handleRecipientBlur = () => { 
    setIsTouchedAddress(true); 
    performValidation(recipientAddress, amount);
    if (recipientAddress && CryptoUtils.isValidPublicKey(recipientAddress)) {
        if (recipientCheckTimeoutRef.current) clearTimeout(recipientCheckTimeoutRef.current);
        triggerRecipientStatusCheck(recipientAddress);
    }
    setTimeout(() => { 
      if (recipientInputContainerRef.current && !recipientInputContainerRef.current.contains(document.activeElement as Node | null)) {
        setShowRecipientSelector(false); 
      }
    }, 150);
  };

  const handleAmountBlur = () => { 
    if (isNFT) return;
    setIsTouchedAmount(true); 
    performValidation(recipientAddress, amount); 
  };
  
  const handleSetMax = () => { 
    const maxAmount = isNFT ? "1" : (token.balance?.toString() ?? "0"); 
    setAmount(maxAmount);
    performValidation(recipientAddress, maxAmount); 
    setIsTouchedAmount(true); 
  };

  const handleClearRecipient = () => {
    setRecipientAddress('');
    setSelectedRecipientName(null);
    transactionDetailsForSelectedNameRef.current = null;
    setIsRecipientLikelyNew(false);
    setRecipientStatusMsg(null);
    setRecipientAddressError(null); 
    if (recipientCheckTimeoutRef.current) clearTimeout(recipientCheckTimeoutRef.current);
    performValidation('', amount);
  };

  const handleSubmit = () => { 
    setIsTouchedAddress(true); 
    setIsTouchedAmount(true);  
    const currentAmount = isNFT ? "1" : amount;
    if (performValidation(recipientAddress, currentAmount) && token) { 
      onReviewTransaction({ recipientAddress, amount: currentAmount, token }); 
    }
  };

  const handleSelectRecipient = (recipient: SelectableRecipient) => {
    setRecipientAddress(recipient.address); 
    setSelectedRecipientName(recipient.name); 
    transactionDetailsForSelectedNameRef.current = {name: recipient.name, address: recipient.address};
    setShowRecipientSelector(false); 
    setRecipientAddressError(null);
    setIsTouchedAddress(true);
    performValidation(recipient.address, amount);
    triggerRecipientStatusCheck(recipient.address);
  };

  const renderTokenLogo = () => { 
    if (token.logo) { return <img src={token.logo} alt={t('itemList.tokenLogoAlt', {tokenSymbol: token.symbol || token.name})} className="w-10 h-10 rounded-full mr-3 object-cover flex-shrink-0" />; } // Reusing key from ItemList
    return ( <div className="w-10 h-10 rounded-full bg-[#4A5568] flex items-center justify-center mr-3 text-xl shrink-0"> <span className="text-white">{token.symbol ? token.symbol.charAt(0).toUpperCase() : '?'}</span> </div> );
  };

  return (
    <div className="flex flex-col p-4 h-full bg-[#090f14] text-[#F5F5F5] relative">
      <div className="flex items-center mb-5 flex-shrink-0"> 
        {renderTokenLogo()} 
        <div className="min-w-0">
          {/* title attribute removed */}
          <h3 className="text-lg font-medium truncate">{token.name || token.symbol}</h3> 
          <p className="text-sm text-gray-400"> {t('sendForm.balanceLabel')}: {formatTokenBalance(token.balance, token.decimals)} {token.symbol} </p> 
        </div> 
      </div>

      <div className="mb-1 relative flex-shrink-0" ref={recipientInputContainerRef}>
        <label htmlFor="recipientAddress" className="block text-sm font-medium text-gray-300 mb-1">{t('sendForm.toLabel')}</label>
        <div className="relative flex items-center w-full">
          <input 
            id="recipientAddress" type="text" value={recipientAddress} 
            onChange={handleRecipientChange} 
            onFocus={() => { setShowRecipientSelector(true); }} 
            onBlur={handleRecipientBlur} 
            placeholder={t('sendForm.placeholders.recipientAddress')}
            className={`w-full px-3 py-2 h-11 bg-[#2A3447] border rounded-md focus:outline-none focus:ring-1 ${isTouchedAddress && !!recipientAddressError ? 'border-red-500 ring-red-500' : 'border-[#4A5568] focus:border-blue-500 focus:ring-blue-500'} pr-16 text-sm placeholder-gray-500`}
            autoComplete="off" 
          />
          {recipientAddress && (
            <button onClick={handleClearRecipient} className="absolute right-11 top-0 bottom-0 flex items-center text-gray-400 hover:text-gray-300 px-2" type="button" aria-label={t('sendForm.ariaLabels.clearRecipient')}>
              <X size={16} />
            </button>
          )}
          <button type="button" onClick={() => setShowRecipientSelector(s => !s)} className="absolute right-0 top-0 bottom-0 h-11 px-3 border-l border-[#4A5568] flex items-center justify-center hover:bg-[#3B4A60] rounded-r-md" aria-label={t('sendForm.ariaLabels.showSuggestions')}>
            <ChevronDown size={18} className={`text-gray-300 transition-transform ${showRecipientSelector ? 'rotate-180' : ''}`} />
          </button>
        </div>
        
        <div className="h-5 mt-1 ml-1 flex items-center text-xs">
            {isRecipientLikelyNew && !!recipientStatusMsg && !recipientAddressError ? (
                // title attribute removed
                <div className="flex items-center text-yellow-500"> 
                    <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" /> 
                    <span className="truncate">{recipientStatusMsg.length > 45 ? recipientStatusMsg.substring(0,42) + "..." : recipientStatusMsg}</span>
                </div>
            ) : isTouchedAddress && !!recipientAddressError ? (
                <p className="text-red-400">{recipientAddressError}</p>
            ) : selectedRecipientName && recipientAddress === transactionDetailsForSelectedNameRef.current?.address && !recipientAddressError ? (
                <p className="text-green-400">{t('sendForm.sendingToSaved', { name: selectedRecipientName })}</p>
            ) : (
              <div className="h-full w-full"></div> 
            )}
        </div>
        
        {showRecipientSelector && (
          <div className="absolute top-full mt-0.5 left-0 right-0 z-20 bg-[#161E2D] border border-[#4A5568] rounded-lg shadow-xl max-h-[calc(40vh)] flex flex-col p-1.5">
            <div className="overflow-y-auto custom-scrollbar flex-grow space-y-1">
              {isLoadingAddressBook && <p className="text-xs text-gray-400 text-center py-2">{t('sendForm.loadingContacts')}</p>}
              {!isLoadingAddressBook && selectableRecipients.length === 0 && ( 
                <p className="text-xs text-gray-400 text-center py-2 px-1"> 
                  {recipientAddress.trim() ? t('sendForm.noMatchingContacts') : (addressBookEntries.length === 0 && currentUserAccounts.filter(acc => acc.publicKey !== senderAddress).length === 0 ? t('sendForm.noContactsOrAccounts') : t('sendForm.startTypingToSearch'))} 
                </p> 
              )}
              {selectableRecipients.map(recipient => (
                <div 
                    key={`${recipient.type}-${recipient.address}`} 
                    onClick={() => handleSelectRecipient(recipient)} 
                    onMouseDown={(e) => e.preventDefault()} 
                    className="p-2.5 hover:bg-[#2A3447] rounded cursor-pointer flex items-center space-x-2.5" 
                >
                  {recipient.type === 'my_account' ? <Users size={16} className="text-blue-400 shrink-0" /> : <BookUser size={16} className="text-green-400 shrink-0" />}
                  <div className='min-w-0'> 
                    {/* title attributes removed */}
                    <p className="text-sm font-medium truncate">{recipient.name}</p> 
                    <p className="text-xs text-gray-400 font-mono truncate">{recipient.address}</p> 
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={`mb-4 flex-shrink-0 ${showRecipientSelector ? 'mt-1' : 'mt-0'}`}>
        <div className="flex justify-between items-baseline mb-1"> 
          <label htmlFor="amount" className="block text-sm font-medium text-gray-300">{t('sendForm.amountLabel')}</label> 
          {!isNFT && <button type="button" onClick={handleSetMax} className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50" disabled={!token || token.balance <= 0}>{t('sendForm.buttons.sendMax')}</button> }
        </div>
        <input 
          id="amount" type="text" inputMode="decimal" value={amount} 
          onChange={handleAmountChange} onBlur={handleAmountBlur} placeholder={isNFT ? t('sendForm.placeholders.nftAmount') : t('sendForm.placeholders.tokenAmount')}
          readOnly={isNFT}
          className={`w-full px-3 py-2 h-11 bg-[#2A3447] border rounded-md focus:outline-none focus:ring-1 ${isTouchedAmount && !!amountError ? 'border-red-500 ring-red-500' : 'border-[#4A5568] focus:border-blue-500 focus:ring-blue-500'} text-sm placeholder-gray-500 ${isNFT ? 'text-gray-400 cursor-not-allowed' : ''}`} 
        />
        <div className="h-4 mt-1 ml-1 text-xs">
            {isTouchedAmount && !!amountError && <p className="text-red-400">{amountError}</p>}
        </div>
      </div>
      
      <div className="mt-auto space-y-2 pt-2 flex-shrink-0">
        <button 
          onClick={handleSubmit} 
          disabled={!isFormPotentiallyValid || showRecipientSelector} 
          className="w-full py-3 px-4 h-12 rounded-lg font-semibold text-base text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors" 
        > 
          {t('sendForm.buttons.reviewTransaction')}
        </button>
        <button 
          onClick={onBack} 
          className="w-full py-3 px-4 h-12 rounded-lg font-semibold text-gray-300 bg-transparent hover:bg-[#2A3447] transition-colors" 
        > 
          {t('buttons.cancel')}
        </button>
      </div>
    </div>
  );
};

export default SendFormView;