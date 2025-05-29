// src/popup/views/TokenDetailsView.tsx
import React, { useMemo, useState, useCallback } from 'react';
import { TokenInfo } from '../../background/core/keyring/types';
import { useAppStore } from '../../store/appStore';
import { ArrowLeft, Send, ArrowDownCircle, ExternalLink, Copy, AlertTriangle, Check, MoreVertical, Trash2, Globe, CheckCircle } from 'lucide-react';
import { formatTokenBalance } from '../../utils/formatters';
import { getExplorerById, buildClusterQueryParam, DEFAULT_EXPLORER_ID } from '../../utils/explorerUtils';
import BurnConfirmationModal from '../unlocked/components/BurnConfirmationModal';
import { useTranslation } from 'react-i18next'; // Import useTranslation

// Render token logo or fallback
const TokenLogoDisplay: React.FC<{ token: TokenInfo, size?: string }> = ({ token, size = "w-16 h-16" }) => {
    const { t } = useTranslation();
    const altText = t('itemList.tokenLogoAlt', { tokenSymbol: token.symbol || t('tokenDetails.tokenFallback') });
    if (token.logo) {
        return (
          <div className={`${size} rounded-full flex items-center justify-center overflow-hidden mr-3 flex-shrink-0 shadow-md`}>
            <img
              src={token.logo}
              alt={altText}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                    parent.innerHTML = '';
                    parent.classList.add('bg-gray-700');
                    const textElement = document.createElement('span');
                    textElement.className = size.includes("16") || size.includes("20") ? 'text-2xl text-white font-bold' : 'text-lg text-white font-bold';
                    textElement.textContent = token.symbol ? token.symbol.slice(0, 1).toUpperCase() : '?';
                    parent.appendChild(textElement);
                }
              }}
            />
          </div>
        );
      }
    const textSizeClass = size.includes("16") || size.includes("20") ? 'text-2xl' : 'text-lg';
    return (
      <div className={`${size} rounded-full bg-gray-700 flex items-center justify-center mr-3 ${textSizeClass} text-white font-bold flex-shrink-0 shadow-md`}>
        {token.symbol?.slice(0, 1).toUpperCase() || '?'}
      </div>
    );
 };


const TokenDetailsView: React.FC = () => {
  const { t } = useTranslation(); // Initialize useTranslation
  const {
    viewingTokenDetails: token,
    setView,
    activeAccount,
    preferredExplorerId,
    network: currentNetwork,
    customRpcUrl: currentCustomRpcUrl,
    setSendViewInitialToken,
    lockWallet,
  } = useAppStore();

  const [copiedAddress, setCopiedAddress] = useState(false);
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


  const handleSend = useCallback(() => {
    if (!token) return;
    setSendViewInitialToken(token);
    setView('SEND_FLOW');
  }, [token, setView, setSendViewInitialToken]);

  const handleReceive = useCallback(() => {
    setView('RECEIVE');
  }, [setView]);

  const handleCopyAddress = useCallback(() => {
    if (!token?.address) return;
    navigator.clipboard.writeText(token.address).then(() => {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    });
  }, [token?.address]);

  const explorer = useMemo(() => getExplorerById(preferredExplorerId) || getExplorerById(DEFAULT_EXPLORER_ID), [preferredExplorerId]);
  
  const explorerLink = useMemo(() => {
    if (!token?.address || !explorer) return '#';
    const clusterQuery = buildClusterQueryParam(currentNetwork, currentCustomRpcUrl);
    let pattern = explorer.urlPattern;
    // Adjust pattern for token viewing if explorer has specific token URL structure
    if (explorer.id === 'solscan' || explorer.id === 'solanafm' ) {
        pattern = pattern.replace('/tx/{signature}', `/token/${token.address}`);
    } else if (explorer.id === 'explorer.solana' || explorer.id === 'solanabeach') {
        pattern = pattern.replace('/tx/{signature}', `/address/${token.address}`);
        pattern = pattern.replace('/transaction/{signature}', `/address/${token.address}`);
    } else { 
        // For explorers where {signature} is the only placeholder, might need specific logic
        // This might just link to the address page if token-specific view isn't standard
        pattern = pattern.replace('{signature}', token.address); 
    }
    return pattern.replace('{clusterQueryParam}', clusterQuery);
  }, [token?.address, explorer, currentNetwork, currentCustomRpcUrl]);

  const burnExplorerLink = useMemo(() => {
    if (!lastBurnSignature || !explorer) return '#';
    const clusterQuery = buildClusterQueryParam(currentNetwork, currentCustomRpcUrl);
    return explorer.urlPattern.replace('{signature}', lastBurnSignature).replace('{clusterQueryParam}', clusterQuery);
  }, [lastBurnSignature, explorer, currentNetwork, currentCustomRpcUrl]);

  const handleOpenBurnModal = () => {
    setBurnError(null); 
    setShowOptionsMenu(false);
    setShowBurnModal(true);
  };

  const handleConfirmBurn = () => {
    if (!token || !activeAccount) {
      setBurnError(t('tokenDetails.errors.burnMissingInfo'));
      return;
    }
    setIsBurning(true);
    setBurnError(null); 
    setBurnSuccessMessage(null);
    setLastBurnSignature(null);
   // console.log(`Initiating burn for token: ${token.name} (Mint: ${token.address}) by ${activeAccount.publicKey}`);
    
    chrome.runtime.sendMessage(
      { 
        action: 'burnTokenRequest',
        payload: { 
          mintAddress: token.address, 
          ownerAddress: activeAccount.publicKey,
          amountLamports: BigInt(Math.round(Number(token.balance || 0) * (10 ** Number(token.decimals || 0)))).toString(),
          tokenDecimals: Number(token.decimals || 0)
        } 
      }, 
      (response) => {
        setIsBurning(false);
        if (chrome.runtime.lastError || !response?.success) {
          const errMsg = chrome.runtime.lastError?.message || response?.error || t('tokenDetails.errors.burnUnknownError');
         // console.error("Token burn failed:", errMsg);
          setBurnError(errMsg); 
          if (errMsg.toLowerCase().includes('locked')) {
            lockWallet(); 
            setShowBurnModal(false); 
          }
        } else {
       //   console.log(`${token.name} burn transaction initiated successfully! Signature: ${response.signature}`);
          setShowBurnModal(false); 
          setBurnSuccessMessage(t('tokenDetails.burnSuccessMessage', { tokenName: token.name || t('tokenDetails.tokenFallback') }));
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

  if (!token && !burnSuccessMessage) {
    return (
      <div className="flex flex-col h-full bg-[#090f14] p-4 text-white items-center justify-center">
        <AlertTriangle size={32} className="text-yellow-400 mb-3" />
        <p className="text-center">{t('tokenDetails.detailsUnavailable')}</p>
        <button onClick={() => setView('DASHBOARD')} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm">
          {t('tokenDetails.backToDashboard')}
        </button>
      </div>
    );
  }

  const totalTokenUsdValue = token?.usdValue;
  const headerTitle = token?.symbol || token?.name || t('tokenDetails.titleFallback');
  const canBurn = !token?.isNative && activeAccount && !activeAccount.isViewOnly && token?.balance && token.balance > 0;

  if (burnSuccessMessage && lastBurnSignature && token) { // token check added for safety
    return (
      <div className="flex flex-col h-full bg-[#090f14] p-4 text-gray-200 items-center justify-center text-center space-y-5">
        <CheckCircle size={56} className="text-green-500" />
        <h2 className="text-xl font-semibold text-white">{t('tokenDetails.burnInitiatedTitle')}</h2>
        <p className="text-sm text-gray-300">{burnSuccessMessage}</p>
        <div className="w-full max-w-xs p-3 bg-[#161E2D] rounded-md border border-gray-700 text-xs text-gray-400 font-mono break-all">
          {t('tokenDetails.transactionIdLabel')}: {lastBurnSignature.substring(0,12)}...{lastBurnSignature.substring(lastBurnSignature.length - 12)}
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

  if (!token) { // Fallback if token becomes null after success message was cleared (shouldn't happen ideally)
    return <div className="flex flex-col h-full bg-[#090f14] p-4 text-white items-center justify-center">{t('tokenDetails.loadingData')}</div>;
  }
  
  return (
    <div className="flex flex-col h-full bg-[#090f14] text-gray-200">
      <div className="flex items-center justify-between p-4 border-b border-[#243B55] flex-shrink-0 relative h-14">
        <button
          onClick={() => setView('DASHBOARD')}
          className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        {/* title attribute removed */}
        <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[calc(100%-8rem)]">
          {headerTitle}
        </h2>
        {token && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
            <button
                onClick={() => setShowOptionsMenu(prev => !prev)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-md"
                aria-label={t('tokenDetails.moreOptionsAriaLabel')}
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
                    {t('tokenDetails.menu.viewOnExplorer')}
                </a>
                {canBurn && ( // Burn Token option
                    <button
                    onClick={handleOpenBurnModal}
                    className="flex items-center w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-700/30 hover:text-red-300"
                    >
                    <Trash2 size={16} className="mr-2.5" />
                    {t('tokenDetails.menu.burnToken')}
                    </button>
                )}
                </div>
            )}
            </div>
        )}
      </div>

      {token && (
        <div className="flex-grow overflow-y-auto p-4 space-y-5 custom-scrollbar">
            <div className="flex flex-col items-center text-center py-4 rounded-lg bg-[#161E2D] border border-gray-700/30 shadow-lg">
            <TokenLogoDisplay token={token} size="w-20 h-20" />
            <p className="text-3xl font-bold text-white mt-3">
                {formatTokenBalance(token.balance, token.decimals)} {token.symbol || ''}
            </p>
            {(totalTokenUsdValue !== null && totalTokenUsdValue !== undefined) && (
                <p className="text-md text-gray-400">
                ≈ ${totalTokenUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </p>
            )}
            </div>

            {!activeAccount?.isViewOnly && (
                <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={handleSend}
                    className="flex items-center justify-center w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors shadow-md"
                >
                    <Send size={18} className="mr-2" /> {t('tokenDetails.buttons.send')}
                </button>
                <button
                    onClick={handleReceive}
                    className="flex items-center justify-center w-full p-3 bg-gray-600 hover:bg-gray-500 rounded-lg text-white font-semibold transition-colors shadow-md"
                >
                    <ArrowDownCircle size={18} className="mr-2" /> {t('tokenDetails.buttons.receive')}
                </button>
                </div>
            )}
            {activeAccount?.isViewOnly && (
                <div className="p-3 bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-xs rounded-md text-center">
                    {t('tokenDetails.viewOnlyWarning')}
                </div>
            )}

            <div className="bg-[#161E2D] p-4 rounded-lg border border-gray-700/30 shadow-lg space-y-3 text-sm">
            <h3 className="text-lg font-semibold text-white mb-2 border-b border-gray-700 pb-2">{t('tokenDetails.sectionTitle')}</h3>
            <div className="flex justify-between">
                <span className="text-gray-400">{t('tokenDetails.labels.name')}:</span>
                 {/* title attribute removed */}
                <span className="text-gray-100 truncate text-right">{token.name || t('common.notAvailable')}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-gray-400">{t('tokenDetails.labels.symbol')}:</span>
                <span className="text-gray-100">{token.symbol || t('common.notAvailable')}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-gray-400">{t('tokenDetails.labels.pricePerToken')}:</span>
                <span className="text-gray-100">
                {(token.usdPrice !== null && token.usdPrice !== undefined)
                    ? `$${token.usdPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: token.usdPrice < 0.01 && token.usdPrice !== 0 ? 6 : 2 })}`
                    : t('common.notAvailable')}
                </span>
            </div>
            <div className="flex justify-between items-start">
                <span className="text-gray-400 shrink-0 mr-2">{t('tokenDetails.labels.addressMint')}:</span>
                <div className="flex items-center text-right min-w-0">
                    {/* title attribute removed */}
                    <span className="text-gray-100 font-mono break-all mr-2">{token.address}</span>
                    <button 
                        onClick={handleCopyAddress} 
                        className="text-gray-400 hover:text-blue-400 shrink-0 p-0.5"
                        aria-label={copiedAddress ? t('common.copied') : t('common.copy')}
                    >
                        {copiedAddress ? <Check size={16} className="text-green-400"/> : <Copy size={16} />}
                    </button>
                </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-700/50 mt-2">
                <span className="text-gray-400">{t('tokenDetails.labels.explorer')}:</span>
                <a href={explorerLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  {t('activityDetails.viewOnExplorer', { explorerName: explorer?.name || t('common.explorer') })} {/* Reusing key */}
                  <ExternalLink size={12} className="inline ml-1 relative -top-px"/>
                </a>
            </div>
            </div>
        </div>
      )}
      {showBurnModal && token && ( // Ensure token exists for BurnConfirmationModal
        <BurnConfirmationModal
          isOpen={showBurnModal}
          onClose={() => { 
            setShowBurnModal(false); 
            setBurnError(null); 
          }}
          onConfirmBurn={handleConfirmBurn}
          itemName={token.name || token.symbol || token.address} // Pass a displayable name
          itemType="Token" // Corrected itemType
          isLoading={isBurning}
          error={burnError}
        />
      )}
    </div>
  );
};

export default TokenDetailsView;