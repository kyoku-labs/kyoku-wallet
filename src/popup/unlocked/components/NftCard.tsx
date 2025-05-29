// src/popup/unlocked/components/NftCard.tsx
import React, { useState, useEffect } from 'react';
import { CollectibleInfo } from '../../../background/services/nftTypes';
import NftCardSkeleton from './skeletons/NftCardSkeleton';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface NftCardProps {
    collectible: CollectibleInfo;
    onClick?: (collectible: CollectibleInfo) => void;
    hideCollectionNameOnCard?: boolean;
}

type ImageLoadState = 'loading' | 'loaded' | 'errored';

const NftCard: React.FC<NftCardProps> = ({ collectible, onClick, hideCollectionNameOnCard = false }) => {
    const { t } = useTranslation(); // Initialize useTranslation
    const [imageLoadState, setImageLoadState] = useState<ImageLoadState>('loading');

    useEffect(() => {
        setImageLoadState('loading');
        if (collectible.imageUrl) {
            const img = new Image();
            img.src = collectible.imageUrl;
            img.onload = handleImageLoad;
            img.onerror = handleImageError;
        } else {
            setImageLoadState('errored');
        }
    }, [collectible.imageUrl, collectible.mintAddress]);

    const handleImageLoad = () => {
        setImageLoadState('loaded');
    };

    const handleImageError = () => {
        setImageLoadState('errored');
    };

    const FallbackDisplay = () => (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400 text-xl font-bold">
            {collectible.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
    );

    if (imageLoadState === 'loading') {
        return <NftCardSkeleton />;
    }

    const nftName = collectible.name || t('nftCard.unnamedNft');
    const collectionName = collectible.collection?.name;
    // Generic alt text for the NFT image
    const nftImageAltText = t('nftCard.altNftImage', { nftName: nftName });
    // Translated aria-label
    const viewDetailsAriaLabel = t('nftCard.ariaViewDetails', { nftName: nftName });


    return (
        <div
            className="bg-[#161E2D] rounded-lg overflow-hidden shadow-md cursor-pointer group transition-transform hover:scale-105"
            onClick={() => onClick?.(collectible)}
            onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') onClick?.(collectible);}}
            tabIndex={0}
            aria-label={viewDetailsAriaLabel} // Use translated aria-label
        >
            <div className="aspect-square w-full bg-gray-800">
                {imageLoadState === 'errored' || !collectible.imageUrl ? (
                    <FallbackDisplay />
                ) : (
                    <img
                        src={collectible.imageUrl}
                        alt={nftImageAltText} // Use translated generic alt text
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                        onLoad={handleImageLoad}
                        loading="lazy"
                    />
                )}
            </div>
            <div className="p-2">
                {/* title attribute removed */}
                <p className="text-xs font-medium text-white truncate group-hover:text-blue-300">
                    {nftName}
                </p>
                {/* Conditionally render collection name. Check if collectionName is meaningful. */}
                {!hideCollectionNameOnCard && collectionName && collectionName !== t('nftCard.unknownCollectionPlaceholder') && ( // Compare with translated key or check if it's just a placeholder
                     // title attribute removed
                     <p className="text-xs text-gray-400 truncate">
                         {collectionName}
                     </p>
                )}
            </div>
        </div>
    );
};

export default NftCard;