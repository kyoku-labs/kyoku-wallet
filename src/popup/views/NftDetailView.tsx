// src/popup/views/NftDetailView.tsx
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { CollectibleInfo } from '../../background/services/nftTypes';
import { TokenInfo } from '../../background/core/keyring/types';
import { ArrowLeft, Send, Trash2, ExternalLink, Copy, AlertTriangle, Check, MoreVertical, Globe, Info, RefreshCw, CheckCircle, Star, Image as ImageIcon } from 'lucide-react';
import { getExplorerById, buildClusterQueryParam, DEFAULT_EXPLORER_ID } from '../../utils/explorerUtils';
import BurnConfirmationModal from '../unlocked/components/BurnConfirmationModal';
import { useTranslation } from 'react-i18next';

const AttributeChip: React.FC<{ trait_type: string; value: string | number }> = ({ trait_type, value }) => (
  <div className="bg-[#2A3447] border border-gray-700 rounded-lg p-2.5 text-center">
    <p className="text-xs text-blue-300 uppercase tracking-wide">{trait_type}</p>
    <p className="text-sm font-medium text-white mt-0.5 truncate">{String(value)}</p>
  </div>
);

const FallbackNftImage: React.FC<{ name?: string, size?: string }> = ({ name, size = "w-full h-auto" }) => (
    <div className={`aspect-square bg-gray-700 flex items-center justify-center text-gray-400 ${size} rounded-md`}>
        <span className="text-4xl font-bold">{name?.charAt(0)?.toUpperCase() || '?'}</span>
    </div>
);

const NftDetailView: React.FC = () => {
  const { t } = useTranslation();
  const {
    viewingNftDetails: nft,
    setViewNftDetails,
    setView,
    activeAccount,
    preferredExplorerId,
    network: currentNetwork,
    customRpcUrl: currentCustomRpcUrl,
    setSendViewInitialToken,
    lockWallet,
    activeAccountPfpMint, 
    setActiveAccountPfpMint,
  } = useAppStore();

  const [copiedMintAddress, setCopiedMintAddress] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showBurnModal, setShowBurnModal] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burnSuccessMessage, setBurnSuccessMessage] = useState<string | null>(null);
  const [lastBurnSignature, setLastBurnSignature] = useState<string | null>(null);
  const [copiedBurnSignature, setCopiedBurnSignature] = useState(false);

  const optionsMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setShowOptionsMenu(false);
      }
    }
    if (showOptionsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showOptionsMenu]);

  const currentNftData = useMemo(() => nft, [nft]);
  const isCurrentPfp = useMemo(() => activeAccountPfpMint === currentNftData?.mintAddress, [activeAccountPfpMint, currentNftData]);


  const handleGoBack = () => {
    setBurnSuccessMessage(null);
    setLastBurnSignature(null);
    setViewNftDetails(null);
  };

  const handleSend = useCallback(() => {
    if (!currentNftData || !activeAccount || activeAccount.isViewOnly) return;
    const nftAsTokenInfo = {
        address: currentNftData.mintAddress,
        name: currentNftData.name,
        symbol: currentNftData.collection?.name || currentNftData.name.substring(0,5),
        logo: currentNftData.imageUrl,
        decimals: 0,
        balance: 1,
        balanceLamports: BigInt(1),
        isNative: false,
        usdPrice: undefined,
        usdValue: undefined,
    };
    setSendViewInitialToken(nftAsTokenInfo as TokenInfo);
    setView('SEND_FLOW');
  }, [currentNftData, activeAccount, setSendViewInitialToken, setView]);

  const handleCopyMintAddress = useCallback(() => {
    if (!currentNftData?.mintAddress) return;
    navigator.clipboard.writeText(currentNftData.mintAddress).then(() => {
      setCopiedMintAddress(true);
      setTimeout(() => setCopiedMintAddress(false), 2000);
    });
  }, [currentNftData?.mintAddress]);

  const explorer = useMemo(() => getExplorerById(preferredExplorerId) || getExplorerById(DEFAULT_EXPLORER_ID), [preferredExplorerId]);
  
  const explorerLink = useMemo(() => {
    if (!currentNftData?.mintAddress || !explorer) return '#';
    const clusterQuery = buildClusterQueryParam(currentNetwork, currentCustomRpcUrl);
    let pattern = explorer.urlPattern.replace('/tx/{signature}', `/address/${currentNftData.mintAddress}`);
    pattern = pattern.replace('/transaction/{signature}', `/address/${currentNftData.mintAddress}`);

    if (explorer.id === 'solscan') {
        pattern = `https://solscan.io/token/${currentNftData.mintAddress}${clusterQuery}`;
    } else if (explorer.id === 'solanafm') {
        pattern = `https://solana.fm/address/${currentNftData.mintAddress}${clusterQuery}`;
    } else if (explorer.id === 'explorer.solana') {
        pattern = `https://explorer.solana.com/address/${currentNftData.mintAddress}${clusterQuery}`;
    } else if (explorer.id === 'solanabeach') {
        pattern = `https://solanabeach.io/address/${currentNftData.mintAddress}${clusterQuery}`;
    }
    return pattern.replace('{clusterQueryParam}', clusterQuery);
  }, [currentNftData?.mintAddress, explorer, currentNetwork, currentCustomRpcUrl]);

  const burnExplorerLink = useMemo(() => {
    if (!lastBurnSignature || !explorer) return '#';
    const clusterQuery = buildClusterQueryParam(currentNetwork, currentCustomRpcUrl);
    return explorer.urlPattern.replace('{signature}', lastBurnSignature).replace('{clusterQueryParam}', clusterQuery);
  }, [lastBurnSignature, explorer, currentNetwork, currentCustomRpcUrl]);


  const fetchMoreDetailsIfNeeded = useCallback(async () => {
    if (!nft || !nft.mintAddress) return;
    const needsFetch = nft && (!nft.attributes || nft.attributes.length === 0) && !nft.description && !nft.external_url;

    if (needsFetch) {
      setIsLoadingDetails(true);
      setFetchError(null);
      try {
        chrome.runtime.sendMessage(
          { action: 'fetchNFTAssetDetailsByMint', payload: { mintAddress: nft.mintAddress } },
          (response) => {
            setIsLoadingDetails(false);
            if (chrome.runtime.lastError || !response?.success) {
              const errMsg = chrome.runtime.lastError?.message || response?.error || t('nftDetails.errors.fetchFailed');
             // console.error("Error fetching full NFT details:", errMsg);
              setFetchError(errMsg);
            } else if (response.collectibleInfo) {
              setViewNftDetails(response.collectibleInfo as CollectibleInfo);
            } else {
              setFetchError(t('nftDetails.errors.detailsNotFound'));
            }
          }
        );
      } catch (error: any) {
        setIsLoadingDetails(false);
        setFetchError(t('nftDetails.errors.fetchInitiationFailed', { error: error.message }));
      }
    }
  }, [nft, setViewNftDetails, t]);

  useEffect(() => {
    fetchMoreDetailsIfNeeded();
  }, [fetchMoreDetailsIfNeeded]);

  const handleOpenBurnModal = () => {
    setBurnError(null);
    setShowOptionsMenu(false);
    setShowBurnModal(true);
  };

  const handleConfirmBurn = () => {
    if (!currentNftData || !activeAccount) {
      setBurnError(t('nftDetails.errors.burnMissingInfo'));
      return;
    }
    setIsBurning(true);
    setBurnError(null); 
    setBurnSuccessMessage(null);
    setLastBurnSignature(null);
  //  console.log(`Initiating burn for NFT: ${currentNftData.name} (Mint: ${currentNftData.mintAddress}) by ${activeAccount.publicKey}`);

    chrome.runtime.sendMessage(
      {
        action: 'burnNftRequest',
        payload: {
          mintAddress: currentNftData.mintAddress,
          ownerAddress: activeAccount.publicKey
        }
      },
      (response) => {
        setIsBurning(false);
        if (chrome.runtime.lastError || !response?.success) {
          const errMsg = chrome.runtime.lastError?.message || response?.error || t('nftDetails.errors.burnUnknownError');
        //  console.error("NFT burn failed:", errMsg);
          setBurnError(errMsg);
          if (errMsg.toLowerCase().includes('locked')) {
            lockWallet();
            setShowBurnModal(false); 
          }
        } else {
       //   console.log(`NFT ${currentNftData.name} burn transaction initiated successfully! Signature: ${response.signature}`);
          setShowBurnModal(false); 
          setBurnSuccessMessage(t('nftDetails.burnSuccessMessage', { nftName: currentNftData.name || t('nftCard.unnamedNft') }));
          setLastBurnSignature(response.signature);
        }
      }
    );
  };

  const handleCopyBurnSignature = () => {
    if (!lastBurnSignature) return;
    navigator.clipboard.writeText(lastBurnSignature).then(() => {
      setCopiedBurnSignature(true);
      setTimeout(() => setCopiedBurnSignature(false), 2000);
    });
  };

  const handleDoneOrCloseSuccess = () => {
    setBurnSuccessMessage(null);
    setLastBurnSignature(null);
    setView('DASHBOARD'); 
  };

  const handleSetPfp = () => {
    if (currentNftData && !isCurrentPfp) {
      setActiveAccountPfpMint(currentNftData.mintAddress); // Use store action
      setShowOptionsMenu(false);
    }
  };

  const handleRemovePfp = () => {
    setActiveAccountPfpMint(null); // Use store action
    setShowOptionsMenu(false);
  }

  if (!currentNftData && !burnSuccessMessage) {
    return (
      <div className="flex flex-col h-full bg-[#090f14] p-4 text-white items-center justify-center">
        <AlertTriangle size={32} className="text-yellow-400 mb-3" />
        <p className="text-center">{t('nftDetails.detailsUnavailable')}</p>
        <button onClick={handleGoBack} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm">
          {t('common.back')}
        </button>
      </div>
    );
  }
  
  if (burnSuccessMessage && lastBurnSignature && currentNftData) {
    return (
      <div className="flex flex-col h-full bg-[#090f14] p-4 text-gray-200 items-center justify-center text-center space-y-5">
        <CheckCircle size={56} className="text-green-500" />
        <h2 className="text-xl font-semibold text-white">{t('nftDetails.burnInitiatedTitle')}</h2>
        <p className="text-sm text-gray-300">{burnSuccessMessage}</p>
        <div className="w-full max-w-xs p-3 bg-[#161E2D] rounded-md border border-gray-700 text-xs text-gray-400 font-mono break-all">
          {t('nftDetails.transactionIdLabel')}: {lastBurnSignature.substring(0,12)}...{lastBurnSignature.substring(lastBurnSignature.length - 12)}
          <button 
            onClick={handleCopyBurnSignature} 
            className="ml-2 p-0.5 text-gray-500 hover:text-blue-400 relative -top-0.5"
            aria-label={copiedBurnSignature ? t('common.copied') : t('common.copy')}
          >
            {copiedBurnSignature ? <Check size={14} className="text-green-400"/> : <Copy size={14} />}
          </button>
        </div>
        <a 
          href={burnExplorerLink} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="flex items-center justify-center text-blue-400 hover:text-blue-300 hover:underline text-sm"
        >
          {t('activityDetails.viewOnExplorer', { explorerName: explorer?.name || t('common.explorer') })} 
          <ExternalLink size={14} className="ml-1.5" />
        </a>
        <button 
          onClick={handleDoneOrCloseSuccess}
          className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium w-full max-w-xs"
        >
          {t('buttons.done')}
        </button>
      </div>
    );
  }

  if (!currentNftData) { 
    return <div className="flex flex-col h-full bg-[#090f14] p-4 text-white items-center justify-center">{t('nftDetails.loadingData')}</div>;
  }

  const { name, imageUrl, collection, description, attributes, external_url, mintAddress, isCompressed } = currentNftData;
  const canPerformSendOrBurn = activeAccount && !activeAccount.isViewOnly; // Separate check for send/burn
  const nftNameDisplay = name || t('nftCard.unnamedNft');
  const nftImageAlt = t('nftCard.altNftImage', { nftName: nftNameDisplay });

  return (
    <div className="flex flex-col h-full bg-[#090f14] text-gray-200">
      <div className="flex items-center justify-between p-4 border-b border-[#243B55] flex-shrink-0 relative h-14">
        <button
          onClick={handleGoBack}
          className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[calc(100%-8rem)]">
          {nftNameDisplay}
        </h2>
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
          <button
            onClick={() => setShowOptionsMenu(prev => !prev)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-md"
            aria-label={t('nftDetails.moreOptionsAriaLabel')}
          >
            <MoreVertical size={20} />
          </button>
          {showOptionsMenu && (
            <div ref={optionsMenuRef} className="absolute right-0 mt-2 w-56 bg-[#1A2433] border border-gray-700 rounded-md shadow-xl z-20 py-1">
              <a
                href={explorerLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowOptionsMenu(false)}
                className="flex items-center w-full px-4 py-2.5 text-sm text-gray-200 hover:bg-[#2A3447] hover:text-white"
              >
                <Globe size={16} className="mr-2.5 text-gray-400" />
                {t('nftDetails.menu.viewOnExplorer')}
              </a>
              {/* PFP Options - available for all accounts (view-only or not) */}
              {isCurrentPfp ? (
                <button
                  onClick={handleRemovePfp}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-yellow-400 hover:bg-yellow-700/30 hover:text-yellow-300"
                >
                  <Star size={16} className="mr-2.5 fill-current" /> 
                  {t('nftDetails.menu.removeProfilePicture')} 
                </button>
              ) : (
                <button
                  onClick={handleSetPfp}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-gray-200 hover:bg-[#2A3447] hover:text-white"
                >
                  <ImageIcon size={16} className="mr-2.5 text-gray-400" />
                  {t('nftDetails.menu.setAsProfilePicture')}
                </button>
              )}
              {/* Burn Option - only if canPerformActions (not view-only) */}
              {canPerformSendOrBurn && (
                <button
                  onClick={handleOpenBurnModal}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-700/30 hover:text-red-300"
                >
                  <Trash2 size={16} className="mr-2.5" />
                  {t('nftDetails.menu.burnNft')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div className="rounded-lg overflow-hidden shadow-lg border border-gray-700/50 max-w-xs mx-auto w-full relative">
          {imageUrl ? (
            <img src={imageUrl} alt={nftImageAlt} className="w-full h-auto object-contain aspect-square bg-black" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; const fallback = e.currentTarget.nextElementSibling; if (fallback) (fallback as HTMLElement).style.display = 'flex'; }} />
          ) : null}
          {!imageUrl && <FallbackNftImage name={name} />}
          {isCurrentPfp && (
            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-md flex items-center">
              <Star size={12} className="mr-1 fill-current"/> {t('nftDetails.profilePictureBadge')}
            </div>
          )}
        </div>

        {isLoadingDetails && (
            <div className="flex items-center justify-center text-sm text-blue-300 py-2">
                <RefreshCw size={16} className="animate-spin mr-2" /> {t('nftDetails.fetchingLatestDetails')}
            </div>
        )}
        {fetchError && !isLoadingDetails && (
            <div className="text-xs text-yellow-400 bg-yellow-800/30 border border-yellow-700 p-2 rounded-md text-center">
                <Info size={14} className="inline mr-1" /> {t('nftDetails.errors.couldNotFetchFullDetails', { error: fetchError.substring(0,100) })}
            </div>
        )}

        {canPerformSendOrBurn && ( // Send button also relies on this
            <div className="grid grid-cols-1 gap-3 pt-2">
                <button
                    onClick={handleSend}
                    className="flex items-center justify-center w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors shadow-md"
                >
                    <Send size={18} className="mr-2" /> {t('nftDetails.buttons.sendNft')}
                </button>
            </div>
        )}
         {!canPerformSendOrBurn && (
            <div className="p-3 bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-xs rounded-md text-center">
                {t('nftDetails.viewOnlyWarning')}
            </div>
        )}

        <div className="bg-[#161E2D] p-3.5 rounded-lg border border-gray-700/30 shadow-sm">
            <h1 className="text-xl font-bold text-white mb-0.5 truncate">{nftNameDisplay}</h1>
            {collection?.name && collection.name !== t('nftCard.unknownCollectionPlaceholder') && (
                <p className="text-sm text-blue-400 truncate">{collection.name}</p>
            )}
            {isCompressed && <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full mt-1 inline-block">{t('nftDetails.compressedBadge')}</span>}
        </div>

        {description && (
          <div className="bg-[#161E2D] p-3.5 rounded-lg border border-gray-700/30 shadow-sm">
            <h3 className="text-md font-semibold text-gray-300 mb-1.5">{t('nftDetails.sectionTitles.description')}</h3>
            <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed max-h-28 overflow-y-auto custom-scrollbar">{description}</p>
          </div>
        )}

        {collection?.address && (collection.description || collection.external_url) && (
            <div className="bg-[#161E2D] p-3.5 rounded-lg border border-gray-700/30 shadow-sm">
                <h3 className="text-md font-semibold text-gray-300 mb-1.5">{t('nftDetails.sectionTitles.aboutCollection', { collectionName: collection.name !== t('nftCard.unknownCollectionPlaceholder') ? collection.name : '' })}</h3>
                {collection.description && <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed max-h-20 overflow-y-auto custom-scrollbar mb-2">{collection.description}</p>}
                {collection.external_url && (
                    <a href={collection.external_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center">
                        {t('nftDetails.links.viewCollection')} <ExternalLink size={12} className="ml-1" />
                    </a>
                )}
            </div>
        )}

        {attributes && attributes.length > 0 && (
          <div className="bg-[#161E2D] p-3.5 rounded-lg border border-gray-700/30 shadow-sm">
            <h3 className="text-md font-semibold text-gray-300 mb-2">{t('nftDetails.sectionTitles.attributes')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {attributes.map((attr, index) => (
                <AttributeChip key={index} trait_type={attr.trait_type} value={attr.value} />
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#161E2D] p-3.5 rounded-lg border border-gray-700/30 shadow-sm space-y-2.5 text-sm">
             <h3 className="text-md font-semibold text-gray-300 mb-1">{t('nftDetails.sectionTitles.details')}</h3>
            <div className="flex justify-between items-center">
                <span className="text-gray-400">{t('nftDetails.labels.mintAddress')}:</span>
                <div className="flex items-center text-gray-100 font-mono">
                    <span className="truncate max-w-[120px] sm:max-w-[150px]">{mintAddress}</span>
                    <button 
                        onClick={handleCopyMintAddress} 
                        className="ml-1.5 p-0.5 text-gray-400 hover:text-blue-400"
                        aria-label={copiedMintAddress ? t('common.copied') : t('common.copy')}
                    >
                        {copiedMintAddress ? <Check size={16} className="text-green-400"/> : <Copy size={16} />}
                    </button>
                </div>
            </div>
           {external_url && (
             <div className="flex justify-between items-center">
                <span className="text-gray-400">{t('nftDetails.labels.externalLink')}:</span>
                <a href={external_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate max-w-[150px] sm:max-w-[180px]">
                    {t('nftDetails.links.viewAsset')} <ExternalLink size={12} className="inline ml-1" />
                </a>
             </div>
           )}
           <div className="flex justify-between items-center">
                <span className="text-gray-400">{t('nftDetails.labels.explorer')}:</span>
                <a href={explorerLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  {t('activityDetails.viewOnExplorer', { explorerName: explorer?.name || t('common.explorer') })}
                  <ExternalLink size={12} className="inline ml-1 relative -top-px"/>
                </a>
            </div>
        </div>
      </div>
      {showBurnModal && currentNftData && (
        <BurnConfirmationModal
          isOpen={showBurnModal}
          onClose={() => {
            setShowBurnModal(false);
            setBurnError(null);
          }}
          onConfirmBurn={handleConfirmBurn}
          itemName={currentNftData.name || currentNftData.mintAddress}
          itemType="NFT"
          isLoading={isBurning}
          error={burnError}
        />
      )}
    </div>
  );
};

export default NftDetailView;