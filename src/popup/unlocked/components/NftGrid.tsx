// src/popup/unlocked/components/NftGrid.tsx
import React from 'react';
import { CollectibleInfo } from '../../../background/services/nftTypes';
import NftCard from './NftCard';
import { NftDisplayItem, NftCollectionGroup } from '../../../hooks/useNfts';
import { useAppStore } from '../../../store/appStore';
import { useTranslation } from 'react-i18next'; // Import useTranslation

// --- CollectionGroupCard ---
interface CollectionGroupCardProps {
  group: NftCollectionGroup;
  onClick?: (group: NftCollectionGroup) => void;
}

const CollectionGroupCard: React.FC<CollectionGroupCardProps> = ({ group, onClick }) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const representativeImage = group.collectionImageUrl || group.nfts[0]?.imageUrl;
  const collectionName = group.collectionName || t('nftGrid.unnamedCollection'); // Translate fallback

  const handleClick = () => {
    if (onClick) {
      onClick(group);
    }
  };
  
  // Translated aria-label
  const viewCollectionAriaLabel = t('nftGrid.ariaViewCollection', { collectionName: collectionName, count: group.count });
  // Translated alt text
  const collectionImageAltText = t('nftGrid.altCollectionImage', { collectionName: collectionName });


  return (
    <div
      className="bg-[#161E2D] rounded-lg overflow-hidden shadow-md cursor-pointer group transition-transform hover:scale-105 relative"
      onClick={handleClick}
      onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') handleClick();}}
      tabIndex={0}
      aria-label={viewCollectionAriaLabel} // Use translated aria-label
    >
      <div className="aspect-square w-full bg-gray-800">
        {representativeImage ? (
          <img
            src={representativeImage}
            alt={collectionImageAltText} // Use translated alt text
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/100x100/374151/FFFFFF/png?text=${collectionName.charAt(0)}&fontsize=30`; }}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400 text-xl font-bold">
            {collectionName.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
      </div>
      <div className="p-2">
        {/* title attribute removed */}
        <p className="text-xs font-medium text-white truncate group-hover:text-blue-300">
          {collectionName}
        </p>
        <div className="absolute top-1.5 right-1.5 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md min-w-[20px] text-center">
          {group.count}
        </div>
      </div>
    </div>
  );
};
// --- End CollectionGroupCard ---


interface NftGridProps {
  items: NftDisplayItem[] | undefined;
  isLoading: boolean;
  error: string | null;
  hideCollectionNameOnCard?: boolean;
}

const NftGrid: React.FC<NftGridProps> = ({ items, isLoading, error, hideCollectionNameOnCard = false }) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const setViewNftDetails = useAppStore(s => s.setViewNftDetails);
  const setViewCollectionAddress = useAppStore(s => s.setViewCollectionAddress);

  const handleNftCardClick = (collectible: CollectibleInfo) => {
    setViewNftDetails(collectible);
  };

  const handleCollectionGroupClick = (group: NftCollectionGroup) => {
    setViewCollectionAddress(group.collectionAddress);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3 p-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-[#161E2D] rounded-lg overflow-hidden shadow-md">
            <div className="aspect-square w-full bg-gray-700 animate-pulse"></div>
            <div className="p-2 space-y-1.5">
              <div className="h-3 w-5/6 bg-gray-700 rounded animate-pulse"></div>
              <div className="h-2 w-3/4 bg-gray-700 rounded animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-red-400 py-10">{t('nftGrid.errorLoading', { errorDetail: error })}</div>; // Translate
  }

  if (!items || items.length === 0) {
    return <div className="text-center text-gray-500 py-10">{t('nftGrid.noCollectiblesFound')}</div>; // Translate
  }

  return (
    <div className="grid grid-cols-3 gap-3 p-2">
      {items.map((item, index) => {
        if (item.isGroup) {
          return (
            <CollectionGroupCard
              key={item.collectionAddress || `group-${index}`}
              group={item}
              onClick={handleCollectionGroupClick}
            />
          );
        } else {
          const individualNft = item as (CollectibleInfo & { isGroup: false });
          return (
            <NftCard
              key={individualNft.mintAddress || `individual-${index}`}
              collectible={individualNft}
              onClick={() => handleNftCardClick(individualNft)}
              hideCollectionNameOnCard={hideCollectionNameOnCard}
            />
          );
        }
      })}
    </div>
  );
};

export default NftGrid;