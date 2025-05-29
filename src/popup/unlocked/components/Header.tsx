// src/popup/unlocked/components/Header.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AccountMetadata } from '../../../background/core/keyring/types';
import { CollectibleInfo } from '../../../background/services/nftTypes';
import { ChevronDown, Copy, X, GripVertical, Check, MoreVertical } from 'lucide-react';
import '@/styles/drag.css'; 
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../../store/appStore';
import { useNfts, NftCollectionGroup } from '../../../hooks/useNfts'; 

// Helper function to truncate public key
const truncatePublicKey = (pk: string, chars = 6): string => {
  if (!pk) return '';
  if (pk.length <= chars * 2 + 3) return pk;
  return `${pk.substring(0, chars)}...${pk.substring(pk.length - chars)}`;
};

// Helper function to get avatar display text
const getAvatarDisplay = (account: AccountMetadata | null, allAccountsForIndex: AccountMetadata[]): string => {
  if (!account) return "?";
  if (account.name) {
    const nameMatch = account.name.match(/^Account (\d+)$/i);
    if (nameMatch && nameMatch[1]) return nameMatch[1];
    const firstChar = Array.from(account.name)[0]; 
    if (firstChar) return firstChar.toUpperCase();
  }
  // Fallback to index if name doesn't provide a clear initial or number
  const accountIndex = allAccountsForIndex.findIndex(acc => acc.uuid === account.uuid);
  if (accountIndex !== -1) return `#${accountIndex + 1}`;
  return "?";
};

export interface HeaderProps {
  accounts: AccountMetadata[];
  activeAccount: AccountMetadata | null;
  onSwitchAccount: (uuid: string) => void;
  toggleAddOptions: () => void; 
  onLockWallet?: () => void; 
  onReorderAccount: (uuid: string, toIndex: number) => void;
  onShowAccountSettings: (account: AccountMetadata) => void;
}

const Header: React.FC<HeaderProps> = ({
  accounts,
  activeAccount,
  onSwitchAccount,
  toggleAddOptions,
  onReorderAccount,
  onShowAccountSettings,
}) => {
  const { t } = useTranslation();
  const [showWalletsPage, setShowWalletsPage] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);
  const [copiedUuid, setCopiedUuid] = useState<string | null>(null);

  // PFP related state and hooks
  const activeAccountPfpMintFromStore = useAppStore(state => 
    state.activeAccount?.uuid === activeAccount?.uuid ? state.activeAccountPfpMint : activeAccount?.pfpMint || null
  );
  const { displayItems: allNftDisplayItemsForPfp } = useNfts(); 

  const pfpImageCache = useMemo(() => {
    const cache = new Map<string, string | undefined>();
    if (allNftDisplayItemsForPfp) {
      allNftDisplayItemsForPfp.forEach(item => {
        if (item.isGroup) {
          (item as NftCollectionGroup).nfts.forEach(nft => {
            if (nft.mintAddress && nft.imageUrl) cache.set(nft.mintAddress, nft.imageUrl);
          });
        } else {
          const individualNft = item as (CollectibleInfo & { isGroup: false });
          if (individualNft.mintAddress && individualNft.imageUrl) cache.set(individualNft.mintAddress, individualNft.imageUrl);
        }
      });
    }
    return cache;
  }, [allNftDisplayItemsForPfp]);

  const [additionalPfpUrls, setAdditionalPfpUrls] = useState<Map<string, string | undefined>>(new Map());
  const [fetchingPfpUrls, setFetchingPfpUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    const mintsToPotentiallyFetch = new Set<string>();
    if (activeAccountPfpMintFromStore) mintsToPotentiallyFetch.add(activeAccountPfpMintFromStore);
    if (showWalletsPage) accounts.forEach(acc => { if (acc.pfpMint) mintsToPotentiallyFetch.add(acc.pfpMint); });

    const actuallyFetchThese = new Set<string>();
    mintsToPotentiallyFetch.forEach(mint => {
      if (pfpImageCache.get(mint) === undefined && additionalPfpUrls.get(mint) === undefined && !fetchingPfpUrls.has(mint)) {
        actuallyFetchThese.add(mint);
      }
    });

    if (actuallyFetchThese.size > 0) {
      const newFetching = new Set(fetchingPfpUrls);
      actuallyFetchThese.forEach(mint => newFetching.add(mint));
      setFetchingPfpUrls(newFetching);

      actuallyFetchThese.forEach(mintToFetch => {
        chrome.runtime.sendMessage(
          { action: 'fetchNFTAssetDetailsByMint', payload: { mintAddress: mintToFetch } },
          (response) => {
            if (response?.success && response.collectibleInfo?.imageUrl) {
              setAdditionalPfpUrls(prev => new Map(prev).set(mintToFetch, response.collectibleInfo.imageUrl));
            } else {
              setAdditionalPfpUrls(prev => new Map(prev).set(mintToFetch, undefined)); 
            }
            setFetchingPfpUrls(prev => { const updated = new Set(prev); updated.delete(mintToFetch); return updated; });
          }
        );
      });
    }
  }, [accounts, showWalletsPage, activeAccountPfpMintFromStore, pfpImageCache, additionalPfpUrls, fetchingPfpUrls]);

  const activeAccountPfpImageUrl = useMemo(() => {
    if (activeAccountPfpMintFromStore) {
      return pfpImageCache.get(activeAccountPfpMintFromStore) || additionalPfpUrls.get(activeAccountPfpMintFromStore);
    }
    return null;
  }, [activeAccountPfpMintFromStore, pfpImageCache, additionalPfpUrls]);


  const selectAndCloseWalletsPage = (uuid: string) => {
    onSwitchAccount(uuid);
    setShowWalletsPage(false);
  };

  const toggleWalletsPage = () => setShowWalletsPage(v => !v);

  const copyToClipboard = (text: string, uuid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopiedUuid(uuid);
      setTimeout(() => setCopiedUuid(cur => (cur === uuid ? null : cur)), 1500);
    });
  };

  const handleDragStart = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    setDraggingIndex(index);
    if (e.currentTarget) { 
        dragNode.current = e.currentTarget;
        dragNode.current.style.opacity = '0.5';
    }
  };
  
  const handleDragEnter = (index: number, _e: React.DragEvent<HTMLDivElement>) => { 
    if (index !== dragOverIndex) setDragOverIndex(index);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleDragLeave = (_e: React.DragEvent<HTMLDivElement>) => {  };


  const handleDragEnd = () => {
    if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      onReorderAccount(accounts[draggingIndex].uuid, dragOverIndex);
    }
    if (dragNode.current) dragNode.current.style.opacity = '1';
    setDraggingIndex(null);
    setDragOverIndex(null);
    dragNode.current = null;
  };

  const handleAccountOptionsClick = (accountToList: AccountMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    onShowAccountSettings(accountToList);
    setShowWalletsPage(false);
  };

  const renderCompactHeader = () => {
    let displayTitle = t('header.selectAccount');
    if (activeAccount) {
      // Display only the account name, or a truncated public key if name is generic/missing.
      // View-only status will be shown in the dropdown.
      const isGenericName = activeAccount.name?.match(/^Account \d+$/i);
      displayTitle = activeAccount.name && !isGenericName ? activeAccount.name : truncatePublicKey(activeAccount.publicKey, 6);
      if (activeAccount.isViewOnly && activeAccount.name && !isGenericName) {
         displayTitle = `${activeAccount.name}`; // Keep name if specific, dropdown shows view-only
      } else if (activeAccount.isViewOnly) {
         displayTitle = `${truncatePublicKey(activeAccount.publicKey, 6)}`;
      }
    }

    const avatarText = getAvatarDisplay(activeAccount, accounts);
    const avatarTextSizeClass = avatarText.length > 1 && /^\d+$/.test(avatarText) ? 'text-sm' : 'text-lg';
    const isPfpLoadingForHeader = activeAccountPfpMintFromStore && fetchingPfpUrls.has(activeAccountPfpMintFromStore) && !activeAccountPfpImageUrl;

    return (
      <div className="flex items-center justify-between px-4 py-3 mb-2 rounded-xl bg-[#161E2D]">
        {isPfpLoadingForHeader ? (
            <div className="w-10 h-10 rounded-full bg-gray-700 animate-pulse flex-shrink-0 shadow-md"></div>
        ) : activeAccountPfpImageUrl ? (
          <img
            src={activeAccountPfpImageUrl}
            alt={activeAccount?.name || 'PFP'}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0 shadow-md border-2 border-purple-500"
          />
        ) : (
          <div
            className={`w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white ${avatarTextSizeClass} font-semibold flex-shrink-0 shadow-md`}
          >
            {avatarText}
          </div>
        )}
        <div className="flex-1 mx-3 min-w-0">
          <button
            onClick={toggleWalletsPage}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-white bg-[#202A3A] border border-gray-700 rounded-lg hover:bg-[#283C5A] shadow-sm"
            aria-label={t('header.selectAccount')}
          >
            <span className="truncate font-medium">{displayTitle}</span>
            <ChevronDown size={18} className="ml-1 flex-shrink-0 opacity-80" />
          </button>
        </div>
        <button
          id="header-add-button" 
          onClick={toggleAddOptions} 
          aria-label={t('header.addAccountImport')}
          className="w-9 h-9 flex items-center justify-center text-white bg-[#202A3A] border border-gray-700 rounded-full hover:bg-[#283C5A] flex-shrink-0 shadow-sm text-xl font-light"
        >
          +
        </button>
      </div>
    );
  };

  const renderWalletsPage = () => (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#090f14]">
      <div className="flex items-center justify-between px-4 py-3 mb-2 border-b border-gray-800 flex-shrink-0">
        <button onClick={toggleWalletsPage} className="p-2" aria-label={t('common.close')}>
          <X size={20} className="text-gray-400" />
        </button>
        <h2 className="text-lg font-medium text-white">{t('header.walletsPageTitle')}</h2>
        <div className="w-8" /> {/* Spacer */}
      </div>
      <div className="flex-1 px-4 overflow-y-auto custom-scrollbar">
        {accounts.map((acct, index) => {
          const accountDisplayName = acct.name;
          const pkDisplay = truncatePublicKey(acct.publicKey, 6);
          const viewOnlyText = acct.isViewOnly ? <span className="ml-2 text-yellow-500 text-[10px]">({t('common.viewOnly')})</span> : null;

          const pfpMintForListItem = acct.pfpMint;
          const listItemPfpUrlFromCache = pfpMintForListItem ? pfpImageCache.get(pfpMintForListItem) : null;
          const listItemPfpUrlFromAdditional = pfpMintForListItem ? additionalPfpUrls.get(pfpMintForListItem) : null;
          const finalListItemPfpUrl = listItemPfpUrlFromCache || listItemPfpUrlFromAdditional;
          const isPfpLoadingForListItem = pfpMintForListItem && fetchingPfpUrls.has(pfpMintForListItem) && !finalListItemPfpUrl;
          const avatarTextList = getAvatarDisplay(acct, accounts);
          const avatarTextSizeClassList = avatarTextList.length > 1 && /^\d+$/.test(avatarTextList) ? 'text-xs' : 'text-sm';

          return (
            <div
              key={acct.uuid}
              className={`mb-2 p-3 rounded-lg flex items-center justify-between cursor-pointer
                ${acct.uuid === activeAccount?.uuid ? 'bg-[#0D4863] border border-[#3294F8]' : 'bg-[#161E2D] hover:bg-[#283C5A]'}
                ${dragOverIndex === index && draggingIndex !== null ? 'border-t-2 border-blue-500' : ''}
                transition-all duration-150 ease-in-out`}
              onClick={() => selectAndCloseWalletsPage(acct.uuid)}
              draggable
              onDragStart={e => handleDragStart(index, e)}
              onDragEnter={e => handleDragEnter(index, e)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
            >
              <div className="flex items-center flex-grow min-w-0">
                <div className="mr-2 cursor-grab text-gray-400 hover:text-white flex-shrink-0" onMouseDown={e => e.stopPropagation()}>
                  <GripVertical size={16} />
                </div>
                {isPfpLoadingForListItem ? (
                    <div className="w-8 h-8 mr-3 rounded-full bg-gray-700 animate-pulse flex-shrink-0"></div>
                ) : finalListItemPfpUrl ? (
                   <img src={finalListItemPfpUrl} alt={acct.name || 'PFP'} className="w-8 h-8 mr-3 rounded-full object-cover flex-shrink-0 border-2 border-purple-400" />
                ) : (
                  <div
                      className={`w-8 h-8 mr-3 rounded-full bg-purple-600 flex items-center justify-center text-white ${avatarTextSizeClassList} font-semibold flex-shrink-0`}
                  >
                    {avatarTextList}
                  </div>
                )}
                <div className="flex-grow min-w-0">
                  <div className="text-white truncate">{accountDisplayName}</div>
                  <div className="flex items-center text-xs text-gray-400">
                    <span className="truncate">{pkDisplay}</span>
                    <button
                      onClick={e => copyToClipboard(acct.publicKey, acct.uuid, e)}
                      className="ml-1 flex items-center flex-shrink-0"
                      aria-label={t('common.copyAddress')}
                    >
                      {copiedUuid === acct.uuid
                        ? <Check size={12} className="animate-fade-out text-green-400" />
                        : <Copy size={12} />
                      }
                    </button>
                    {viewOnlyText}
                  </div>
                </div>
              </div>
              <div className="flex items-center flex-shrink-0 ml-2">
                <button
                  onClick={e => handleAccountOptionsClick(acct, e)}
                  className="p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700/50"
                  aria-label={t('header.accountOptions')}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>
          );
        })}
        <button
          onClick={toggleAddOptions} 
          className="w-full flex items-center justify-center py-3 mt-4 text-[#3294F8] hover:text-[#5DADEC]"
        >
          <span className="mr-2">+</span>
          <span>{t('header.addAccountImport')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {showWalletsPage ? renderWalletsPage() : renderCompactHeader()}
    </>
  );
};

export default Header;