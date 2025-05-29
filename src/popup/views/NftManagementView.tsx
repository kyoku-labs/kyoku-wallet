// src/popup/views/NftManagementView.tsx
import React, { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { useNfts, NftCollectionGroup } from '../../hooks/useNfts';
import { useNftPreferences } from '../../hooks/useNftPreferences';
import { CollectibleInfo } from '../../background/services/nftTypes';
import { ArrowLeft, Eye, EyeOff, AlertTriangle, Loader2, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

// Helper to render an NFT item
const ManagementNftItem: React.FC<{
  nft: CollectibleInfo;
  isPotentiallySpam: boolean;
  isHidden: boolean;
  onToggleVisibility: (mintAddress: string) => void;
}> = ({ nft, isPotentiallySpam, isHidden, onToggleVisibility }) => {
  const { t } = useTranslation(); // For ActivityItem
  const displayName = nft.name || t('nftManagement.unnamedNft');
  const representativeImage = nft.imageUrl;
  const altText = t('nftCard.altNftImage', { nftName: displayName }); // Reusing key

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${isHidden ? 'bg-gray-700/30 border-gray-600/50 opacity-70' : 'bg-[#161E2D] border-[#334155]'} transition-opacity`}>
      <div className="flex items-center min-w-0 mr-2">
        {representativeImage ? (
          <img
            src={representativeImage}
            alt={altText} // Translated alt
            className="w-10 h-10 rounded-md mr-3 flex-shrink-0 object-cover bg-gray-700"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/40x40/374151/FFFFFF/png?text=${displayName.charAt(0)}&fontsize=20`; }}
          />
        ) : (
          <div className="w-10 h-10 rounded-md mr-3 flex-shrink-0 bg-gray-700 flex items-center justify-center text-gray-400 font-bold">
            {displayName.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0">
          {/* title attribute removed */}
          <p className={`text-sm font-medium truncate ${isHidden ? 'text-gray-400' : 'text-white'}`}>
            {displayName}
          </p>
          {/* title attribute removed */}
          <p className="text-xs text-gray-500 truncate">
            {nft.mintAddress.substring(0, 6)}...{nft.mintAddress.substring(nft.mintAddress.length - 4)}
            {isPotentiallySpam && !isHidden && (
              <span className="ml-2 text-yellow-500 text-[10px]">({t('nftManagement.potentialSpam')})</span> 
            )}
            {isPotentiallySpam && isHidden && (
              <span className="ml-2 text-yellow-600 text-[10px]">({t('nftManagement.spamHidden')})</span> 
            )}
          </p>
        </div>
      </div>
      <button
        onClick={() => onToggleVisibility(nft.mintAddress)}
        className={`p-2 rounded-md hover:bg-gray-600/50 transition-colors ${isHidden ? 'text-gray-500' : 'text-blue-400'}`}
        aria-label={isHidden ? t('nftManagement.buttons.showNftAria', { nftName: displayName }) : t('nftManagement.buttons.hideNftAria', { nftName: displayName })} // Translate aria-label
        // title attribute removed
      >
        {isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

const NftManagementView: React.FC = () => {
  const { t } = useTranslation(); // Initialize useTranslation
  const { activeAccount, setView } = useAppStore();
  const walletId = activeAccount?.uuid || null;

  const {
    displayItems: rawNftDisplayItems,
    isLoading: isLoadingNfts,
    error: nftsError,
  } = useNfts();

  const {
    nftPreferences,
    isLoadingNftPreferences,
    toggleNftVisibility,
    toggleShowPotentialSpamNfts,
  } = useNftPreferences(walletId);

  const allManageableNfts = useMemo((): CollectibleInfo[] => {
    if (!rawNftDisplayItems) return [];
    const flattened: CollectibleInfo[] = [];
    rawNftDisplayItems.forEach(item => {
      if (item.isGroup) {
        flattened.push(...(item as NftCollectionGroup).nfts);
      } else {
        flattened.push(item as CollectibleInfo);
      }
    });
    const uniqueNfts = Array.from(new Map(flattened.map(nft => [nft.mintAddress, nft])).values());
    return uniqueNfts.sort((a,b) => (a.name || "").localeCompare(b.name || ""));
  }, [rawNftDisplayItems]);

  const nftsToDisplayInManager = useMemo(() => {
    let itemsToDisplay = allManageableNfts;
    if (!nftPreferences.showPotentialSpamNfts) {
      itemsToDisplay = allManageableNfts.filter(nft => !nft.isSpam);
    }
    const sortedItems = itemsToDisplay.slice().sort((a, b) => {
        const isASpam = a.isSpam ?? false;
        const isBSpam = b.isSpam ?? false;
        return (isASpam ? 1 : 0) - (isBSpam ? 1 : 0);
    });
    return sortedItems;
  }, [allManageableNfts, nftPreferences.showPotentialSpamNfts]);

  const handleGoBack = () => {
    setView('DASHBOARD');
  };

  const renderContent = () => {
    if (isLoadingNfts || isLoadingNftPreferences) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center text-gray-400">
          <Loader2 className="animate-spin h-8 w-8 text-blue-400 mb-3" />
          {t('nftManagement.loadingDataAndPreferences')} {/* Translate */}
        </div>
      );
    }

    if (nftsError) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center p-4 text-center text-red-400">
          <AlertTriangle size={32} className="mb-2" />
          <p>{t('nftManagement.errors.loadFailed', { error: nftsError })}</p> {/* Translate */}
        </div>
      );
    }

    if (allManageableNfts.length === 0) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center text-gray-500 p-6 text-center">
                <Settings size={40} className="mb-3 opacity-50" />
                <p className="text-base">{t('nftManagement.emptyState.title')}</p> {/* Translate */}
                <p className="text-xs mt-1">{t('nftManagement.emptyState.description')}</p> {/* Translate */}
            </div>
        );
    }
    
    return (
      <div className="space-y-3 flex-grow overflow-y-auto custom-scrollbar pr-1">
        {nftsToDisplayInManager.map(nft => (
          <ManagementNftItem
            key={nft.mintAddress}
            nft={nft}
            isPotentiallySpam={nft.isSpam}
            isHidden={nftPreferences.hiddenNfts.includes(nft.mintAddress)}
            onToggleVisibility={toggleNftVisibility}
          />
        ))}
        {!nftPreferences.showPotentialSpamNfts && allManageableNfts.some(nft => nft.isSpam) && (
            <p className="text-xs text-gray-500 text-center py-2">
                {t('nftManagement.hiddenSpamInfo', { count: allManageableNfts.filter(nft => nft.isSpam).length })} {/* Translate */}
            </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#090f14] text-white">
      <div className="flex items-center p-4 border-b border-[#243B55] flex-shrink-0 relative h-14">
        <button
          onClick={handleGoBack}
          className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
          aria-label={t('common.back')} // Translate
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
          {t('nftManagement.headerTitle')} {/* Translate */}
        </h2>
      </div>

      <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col">
        <div className="p-3 bg-[#161E2D] rounded-lg border border-[#334155] flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-white">{t('nftManagement.spamToggle.label')}</span> {/* Translate */}
            <div
              className={`w-10 h-5 rounded-full p-0.5 cursor-pointer flex items-center ${nftPreferences.showPotentialSpamNfts ? 'bg-green-500 justify-end' : 'bg-gray-600 justify-start'}`}
              onClick={toggleShowPotentialSpamNfts}
              role="switch"
              aria-checked={nftPreferences.showPotentialSpamNfts}
              tabIndex={0}
              onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleShowPotentialSpamNfts();}}
              aria-label={t('nftManagement.spamToggle.label')}
            >
              <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {t('nftManagement.spamToggle.description')} {/* Translate */}
          </p>
        </div>
        
        {renderContent()}
      </div>
    </div>
  );
};

export default NftManagementView;