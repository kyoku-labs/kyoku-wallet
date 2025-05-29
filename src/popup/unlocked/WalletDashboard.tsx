// src/popup/unlocked/WalletDashboard.tsx
import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react'; // Added useState
import { AccountMetadata } from '../../background/core/keyring/types';
import { CollectibleInfo } from '../../background/services/nftTypes';
import { useAppStore } from '../../store/appStore';
import { useTranslation } from 'react-i18next';

import Header from './components/Header';
import TabSelector from './components/TabSelector';
import BalanceCard from './components/BalanceCard';
import ActionButtons from './components/ActionButtons';
import ItemList from './components/ItemList';
import NftGrid from './components/NftGrid';
import FooterNav from './components/FooterNav';
import ActivityView from '../views/ActivityView';

import { usePortfolio } from '../../hooks/usePortfolio';
import { useNfts, NftCollectionGroup, NftDisplayItem } from '../../hooks/useNfts';

import { useTokenPreferences } from '../../hooks/useTokenPreferences';
import { useNftPreferences } from '../../hooks/useNftPreferences';
import { PlusCircle, FilePlus, KeyRound, Eye as EyeIconLucide, Settings as SettingsIcon, ArrowLeft, ChevronsUpDown } from 'lucide-react';

export interface WalletDashboardProps {
  accounts: AccountMetadata[];
  activeAccount: AccountMetadata | null;
  onSwitchAccount: (uuid: string) => void;
  onInitiateMnemonicImport: () => void;
  onInitiatePrivateKeyImport: () => void;
  onInitiateViewOnlyAdd: () => void;
  onCreateNewAccount: () => void;
  onLockWallet: () => void;
  onShowReceiveView: () => void;
  onReorderAccount: (uuid: string, toIndex: number) => void;
  onShowSettings?: () => void;
  onShowSendView: () => void;
  onShowSwapView: () => void;
  onShowAccountSettings: (account: AccountMetadata) => void;
  // These were missing from the provided snippet but are used in the dropdown logic
  onRenameAccount: (uuid: string, newName: string) => void;
  onDeleteAccount: (uuid: string) => void;
  onShowPrivateKey: (uuid: string, accountName: string) => void;
  onShowSeedPhrase: (uuid: string, accountName: string) => void;
}

const WalletDashboard: React.FC<WalletDashboardProps> = ({
  accounts,
  activeAccount,
  onSwitchAccount,
  onInitiateMnemonicImport,
  onInitiatePrivateKeyImport,
  onInitiateViewOnlyAdd,
  onCreateNewAccount,
  onLockWallet,
  onShowReceiveView,
  onReorderAccount,
  onShowSettings,
  onShowSendView,
  onShowSwapView,
  onShowAccountSettings,
  // Add missing props used by execAndCloseDropdown via Header's toggleAddOptions
  // These are technically called by execAndCloseDropdown which is defined here.
}) => {
  const { t } = useTranslation();

  const TABS_CONFIG = useMemo(() => [
    t('dashboard.tabs.tokens'),
    t('dashboard.tabs.collectibles'),
    t('dashboard.tabs.activity')
  ], [t]);

  const {
    dashboardActiveTab,
    setDashboardActiveTab,
    setView,
    currentView,
    viewingCollectionAddress,
    setViewCollectionAddress,
    viewingNftDetails,
  } = useAppStore();

  const [showAddOptionsDropdown, setShowAddOptionsDropdown] = useState(false); // Changed from React.useState
  const addOptionsDropdownRef = useRef<HTMLDivElement>(null);
  const [isContentViewExpanded, setIsContentViewExpanded] = useState(false); // Changed from React.useState

  const walletId = activeAccount?.uuid || 'default_dashboard_wallet_id';
  const { filterTokens } = useTokenPreferences(walletId);
  const { nftPreferences, filterNftDisplayItems: filterRawNftItems } = useNftPreferences(walletId);

  const {
    portfolio,
    isLoading: isLoadingPortfolio,
    error: portfolioError,
    refreshPortfolio,
  } = usePortfolio();

  const {
    displayItems: rawNftDisplayItemsFromHook,
    isLoading: isLoadingNfts,
    error: nftsError,
    refreshNfts,
  } = useNfts();

  const userFilteredNftItems = useMemo(() => {
    if (!rawNftDisplayItemsFromHook) return null;
    return rawNftDisplayItemsFromHook.map(item => {
      if (item.isGroup) {
        const group = item as NftCollectionGroup;
        const filteredNftsInGroup = filterRawNftItems(group.nfts);
        if (filteredNftsInGroup.length === 0) return null;
        return { ...group, nfts: filteredNftsInGroup, count: filteredNftsInGroup.length };
      } else {
        const individualNft = item as (CollectibleInfo & { isGroup: false });
        return filterRawNftItems([individualNft])[0] || null;
      }
    }).filter(item => item !== null) as NftDisplayItem[] | null;
  }, [rawNftDisplayItemsFromHook, filterRawNftItems, nftPreferences]);


  useEffect(() => {
    if (!TABS_CONFIG.includes(dashboardActiveTab) && TABS_CONFIG.length > 0) {
        setDashboardActiveTab(TABS_CONFIG[0]);
    }

    if (currentView === 'DASHBOARD' && dashboardActiveTab === TABS_CONFIG[1] &&
        viewingNftDetails === null &&
        viewingCollectionAddress === null
        ) {
      refreshNfts();
    }
  }, [currentView, dashboardActiveTab, viewingNftDetails, viewingCollectionAddress, refreshNfts, TABS_CONFIG, setDashboardActiveTab]);


  const nftItemsForGrid = useMemo(() => {
    if (!userFilteredNftItems) return undefined;

    let itemsToDisplay = userFilteredNftItems;

    if (viewingCollectionAddress && dashboardActiveTab === TABS_CONFIG[1]) {
      const activeCollectionGroup = userFilteredNftItems.find(
        item => item.isGroup && (item as NftCollectionGroup).collectionAddress === viewingCollectionAddress
      ) as NftCollectionGroup | undefined;

      if (activeCollectionGroup) {
        itemsToDisplay = activeCollectionGroup.nfts.map(nft => ({ ...nft, isGroup: false as const }));
      } else {
        setTimeout(() => setViewCollectionAddress(null), 0);
        itemsToDisplay = userFilteredNftItems;
      }
    }

    const sortedItems = itemsToDisplay.slice().sort((a, b) => {
        const isASpam = a.isGroup
            ? (a as NftCollectionGroup).nfts.every(nft => nft.isSpam)
            : (a as CollectibleInfo).isSpam ?? false;

        const isBSpam = b.isGroup
            ? (b as NftCollectionGroup).nfts.every(nft => nft.isSpam)
            : (b as CollectibleInfo).isSpam ?? false;

        if (isASpam && !isBSpam) return 1;
        if (!isASpam && isBSpam) return -1;

        const nameA = a.isGroup ? (a as NftCollectionGroup).collectionName || '' : (a as CollectibleInfo).name || '';
        const nameB = b.isGroup ? (b as NftCollectionGroup).collectionName || '' : (b as CollectibleInfo).name || '';
        return nameA.localeCompare(nameB);
    });

    return sortedItems;

  }, [userFilteredNftItems, viewingCollectionAddress, dashboardActiveTab, setViewCollectionAddress, TABS_CONFIG]);

  const currentViewingCollection = useMemo(() => {
    if (viewingCollectionAddress && userFilteredNftItems) {
      return userFilteredNftItems.find(
        item => item.isGroup && (item as NftCollectionGroup).collectionAddress === viewingCollectionAddress
      ) as NftCollectionGroup | undefined;
    }
    return undefined;
  }, [viewingCollectionAddress, userFilteredNftItems]);

  const displayedTokens = useMemo(() => {
    return filterTokens(portfolio || null);
  }, [portfolio, filterTokens]);

  const totalPortfolioUsdValue = useMemo(() => {
    if (portfolio && portfolio.length > 0) {
      return portfolio.reduce((sum, token) => {
        return sum + (typeof token.usdValue === 'number' ? token.usdValue : 0);
      }, 0);
    }
    return null;
  }, [portfolio]);


  const handleRefreshAllData = useCallback(() => {
    refreshPortfolio();
    if (dashboardActiveTab === TABS_CONFIG[1]) {
      refreshNfts();
    }
  }, [refreshPortfolio, refreshNfts, dashboardActiveTab, TABS_CONFIG]);

  const toggleHeaderAddOptions = useCallback(() => {
    setShowAddOptionsDropdown(prev => !prev);
  }, []);

  const handleToggleExpandView = useCallback(() => {
    if (isContentViewExpanded && viewingCollectionAddress) {
        setViewCollectionAddress(null);
    }
    setIsContentViewExpanded(prev => !prev);
  }, [isContentViewExpanded, viewingCollectionAddress, setViewCollectionAddress]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (addOptionsDropdownRef.current && !addOptionsDropdownRef.current.contains(event.target as Node)) {
        const headerAddButton = document.getElementById('header-add-button');
        if (headerAddButton && !headerAddButton.contains(event.target as Node)) {
            setShowAddOptionsDropdown(false);
        }
      }
    }
    if (showAddOptionsDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showAddOptionsDropdown]);

  const execAndCloseDropdown = (actionFn: () => void) => {
    actionFn();
    setShowAddOptionsDropdown(false);
  };

  const handleManageTokenPreferences = () => {
    setView('TOKEN_MANAGEMENT');
  };

  const handleManageNftPreferences = () => {
    setView('NFT_MANAGEMENT');
  };

  const renderActiveTabContent = (isExpandedViewMode: boolean) => {
    const contentWrapperClass = isExpandedViewMode
      ? "p-1 bg-[#090f14] rounded-lg h-full"
      : "";

    let content;
    if (dashboardActiveTab === TABS_CONFIG[0]) { // 'Tokens'
      content = (
        <>
          <ItemList
            tokens={displayedTokens}
            isLoading={isLoadingPortfolio && !portfolio}
          />
          {(!isLoadingPortfolio || portfolio) && !isExpandedViewMode && (
              <div className="text-center py-2 mt-1">
                  <button
                      onClick={handleManageTokenPreferences}
                      className="text-sm text-blue-400 hover:text-blue-300 hover:underline focus:outline-none flex items-center justify-center mx-auto"
                  >
                      <SettingsIcon size={14} className="mr-1.5" />
                      {t('dashboard.manageTokenList')}
                  </button>
              </div>
          )}
        </>
      );
    } else if (dashboardActiveTab === TABS_CONFIG[1]) { // 'Collectibles'
      content = (
        <>
          <NftGrid
            items={nftItemsForGrid || undefined}
            isLoading={isLoadingNfts}
            error={nftsError}
            hideCollectionNameOnCard={!!viewingCollectionAddress}
          />
          {(!isLoadingNfts || nftItemsForGrid) && !viewingCollectionAddress && (
              <div className="text-center py-2 mt-1">
                  <button
                      onClick={handleManageNftPreferences}
                      className="text-sm text-blue-400 hover:text-blue-300 hover:underline focus:outline-none flex items-center justify-center mx-auto"
                  >
                      <SettingsIcon size={14} className="mr-1.5" />
                      {t('dashboard.manageNftList')}
                  </button>
              </div>
          )}
        </>
      );
    } else if (dashboardActiveTab === TABS_CONFIG[2]) { // 'Activity'
      content = <ActivityView knownTokens={portfolio} />;
    } else {
      content = null;
    }
    return <div className={contentWrapperClass}>{content}</div>;
  };

  useEffect(() => {
    if (isContentViewExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isContentViewExpanded]);

  const getExpandedViewTitle = () => {
    if (viewingCollectionAddress && dashboardActiveTab === TABS_CONFIG[1] && currentViewingCollection) {
        return currentViewingCollection.collectionName || t('dashboard.collectionTitleFallback');
    }
    return dashboardActiveTab;
  };

  const expandedViewHeader = (
    <div className="flex items-center p-4 border-b border-[#243B55] flex-shrink-0 relative h-14">
        <button
          onClick={() => {
            if (viewingCollectionAddress && dashboardActiveTab === TABS_CONFIG[1]) {
              setViewCollectionAddress(null);
            } else {
              handleToggleExpandView();
            }
          }}
          className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
          aria-label={viewingCollectionAddress && dashboardActiveTab === TABS_CONFIG[1] ? t('dashboard.backToAllCollectibles') : t('dashboard.closeExpandedView')}
        >
          <ArrowLeft size={20} />
        </button>
      <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[calc(100%-5rem)]">
        {getExpandedViewTitle()}
      </h2>
    </div>
  );

  if (isContentViewExpanded) {
    return (
      <div className="fixed inset-0 z-50 bg-[#090f14]/95 backdrop-blur-sm flex flex-col p-4 text-[#F5F5F5]">
        {expandedViewHeader}
        <div className="flex-grow overflow-y-auto custom-scrollbar min-h-0">
          {renderActiveTabContent(true)}
        </div>
      </div>
    );
  }

  const isViewingSpecificCollectionMinimized = viewingCollectionAddress && dashboardActiveTab === TABS_CONFIG[1];

  return (
    <div className="flex flex-col h-full bg-[#090f14] px-4 pt-2 pb-2 text-[#F5F5F5] overflow-hidden relative">
      <Header
        accounts={accounts}
        activeAccount={activeAccount}
        onSwitchAccount={onSwitchAccount}
        toggleAddOptions={toggleHeaderAddOptions} // This toggles showAddOptionsDropdown
        onLockWallet={onLockWallet}
        onReorderAccount={onReorderAccount}
        onShowAccountSettings={onShowAccountSettings}
      />

      {showAddOptionsDropdown && (
        <div
          ref={addOptionsDropdownRef}
          className="absolute top-12 right-4 z-30 mt-1 w-64 bg-[#161E2D] border border-[#334155] rounded-md shadow-xl py-1 transition-all duration-100 ease-out origin-top-right"
          style={{ transform: 'scale(1)', opacity: 1 }} // You can manage this with CSSTransition or similar for animations
        >
          <button onClick={() => execAndCloseDropdown(onCreateNewAccount)} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-200 hover:bg-[#2A3447] hover:text-white rounded-t-md" >
            <PlusCircle size={18} className="mr-3 text-gray-300" /> {/* MONOCHROME ICON */}
            {t('dashboard.buttons.createNewAccount')}
          </button>
          <button onClick={() => execAndCloseDropdown(onInitiateMnemonicImport)} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-200 hover:bg-[#2A3447] hover:text-white" >
            <FilePlus size={18} className="mr-3 text-gray-300" /> {/* MONOCHROME ICON */}
            {t('dashboard.buttons.importRecoveryPhrase')}
          </button>
          <button onClick={() => execAndCloseDropdown(onInitiatePrivateKeyImport)} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-200 hover:bg-[#2A3447] hover:text-white" >
            <KeyRound size={18} className="mr-3 text-gray-300" /> {/* MONOCHROME ICON */}
            {t('dashboard.buttons.importPrivateKey')}
          </button>
          <button onClick={() => execAndCloseDropdown(onInitiateViewOnlyAdd)} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-200 hover:bg-[#2A3447] hover:text-white rounded-b-md" >
            <EyeIconLucide size={18} className="mr-3 text-gray-300" /> {/* MONOCHROME ICON */}
            {t('dashboard.buttons.addViewOnlyAccount')}
          </button>
        </div>
      )}

      <div className="mb-1">
         <BalanceCard
          totalPortfolioUsdValue={isLoadingPortfolio && totalPortfolioUsdValue === null ? undefined : totalPortfolioUsdValue}
          isLoading={isLoadingPortfolio || (!portfolio && isLoadingPortfolio)}
          error={portfolioError}
          onRefresh={handleRefreshAllData}
        />
      </div>

      {activeAccount?.isViewOnly ? (
        <div className="flex justify-center text-yellow-400 text-sm mb-2 font-medium">{t('common.viewOnlyAccount')}</div>
      ) : (
        <ActionButtons
            onReceiveClick={onShowReceiveView}
            onSendClick={onShowSendView}
        />
      )}

      {isViewingSpecificCollectionMinimized && currentViewingCollection ? (
        <div className="flex items-center justify-between px-1 py-2 mb-1 relative h-[48px] mt-0">
          <button
            onClick={() => setViewCollectionAddress(null)}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700/60 rounded-full flex-shrink-0"
            style={{width: '36px'}}
            aria-label={t('dashboard.backToAllCollectibles')}
          >
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-md font-semibold text-white truncate text-center flex-grow mx-2">
            {currentViewingCollection.collectionName || t('dashboard.collectionTitleFallback')}
          </h3>
          <button
            onClick={handleToggleExpandView}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700/60 rounded-full flex-shrink-0"
            style={{width: '36px'}}
            aria-label={t('tabSelector.expandContentView')}
          >
            <ChevronsUpDown size={18} />
          </button>
        </div>
      ) : (
        <div className="mt-1">
          <TabSelector
            tabs={TABS_CONFIG}
            activeTabName={dashboardActiveTab}
            onTabChange={setDashboardActiveTab}
            onToggleExpandView={handleToggleExpandView}
          />
        </div>
      )}

      <div className={`flex-grow overflow-y-auto custom-scrollbar pb-1 min-h-0 ${isViewingSpecificCollectionMinimized ? 'pt-1' : ''}`}>
        {renderActiveTabContent(false)}
      </div>

      <div className="mt-auto pt-1 flex-shrink-0">
         <FooterNav
            onHomeClick={() => {
              setViewCollectionAddress(null);
              setDashboardActiveTab(TABS_CONFIG[0]);
            }}
            onSwapClick={onShowSwapView}
            onSettingsClick={onShowSettings}
         />
      </div>
    </div>
  );
};

export default WalletDashboard;