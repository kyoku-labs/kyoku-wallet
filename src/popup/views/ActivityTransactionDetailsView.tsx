// src/popup/views/ActivityTransactionDetailsView.tsx
import React, { useMemo, useState, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { ArrowLeft, Copy, CheckCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getExplorerById, buildClusterQueryParam, DEFAULT_EXPLORER_ID } from '../../utils/explorerUtils';
import { useTranslation } from 'react-i18next'; // Import useTranslation

// DetailRow now takes labelKey for translation
const DetailRow: React.FC<{ labelKey: string; value?: string | number | null; isMono?: boolean; isDanger?: boolean; unit?: string }> = ({ labelKey, value, isMono = false, isDanger = false, unit }) => {
    const { t } = useTranslation();
    if (value === null || value === undefined || value === '') return null;
    return (
        <div className="flex justify-between items-start py-2">
            <span className="text-sm text-gray-400 mr-2 shrink-0">{t(labelKey)}:</span>
            <span
                className={`text-sm text-right break-all ${isMono ? 'font-mono' : ''} ${isDanger ? 'text-red-400' : 'text-gray-100'}`}
                // title attribute removed
            >
                {value} {unit || ''}
            </span>
        </div>
    );
};

// TokenDisplay now takes prefixKey for translation
const TokenDisplay: React.FC<{ amount?: string; symbol?: string; iconUrl?: string; mintAddress?: string; prefixKey?: string; isOutgoing?: boolean }> = ({ amount, symbol, iconUrl, mintAddress, prefixKey, isOutgoing }) => {
    const { t } = useTranslation();
    if (!amount && !symbol) return null;

    const displaySymbol = symbol || (mintAddress ? `${mintAddress.substring(0, 4)}...` : t('activityDetails.tokenFallback')); // Translate fallback
    const displayAmount = amount ? (isOutgoing ? amount : `+${amount.replace(/[+-]/g, '')}`) : '';
    const altText = t('itemList.tokenLogoAlt', { tokenSymbol: displaySymbol }); // Using existing key

    return (
        <div className="flex items-center">
            {iconUrl ? (
                <img src={iconUrl} alt={altText} className="w-5 h-5 rounded-full mr-1.5 object-cover bg-gray-700" />
            ) : (
                <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center text-xs text-white mr-1.5">
                    {displaySymbol.charAt(0)}
                </div>
            )}
            <span className={`font-medium ${isOutgoing ? 'text-red-400' : 'text-green-400'}`}>
                {prefixKey ? t(prefixKey) : ''}{displayAmount} {displaySymbol}
            </span>
        </div>
    );
};

const ActivityTransactionDetailsView: React.FC = () => {
    const { t } = useTranslation(); // Initialize useTranslation
    const {
        viewingActivityTransactionDetails: transaction,
        setViewActivityTransactionDetails,
        setView,
        preferredExplorerId,
        network: currentNetwork,
        customRpcUrl: currentCustomRpcUrl,
    } = useAppStore();

    const [copiedId, setCopiedId] = useState(false);

    const handleGoBack = () => {
        setViewActivityTransactionDetails(null); 
        setView('DASHBOARD'); 
    };

    const handleCopyToClipboard = useCallback((text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            if (text === transaction?.id) {
                setCopiedId(true);
                setTimeout(() => setCopiedId(false), 2000);
            }
        });
    }, [transaction?.id]);

    const explorer = useMemo(() => getExplorerById(preferredExplorerId) || getExplorerById(DEFAULT_EXPLORER_ID), [preferredExplorerId]);

    const explorerLink = useMemo(() => {
        if (!transaction?.id || !explorer) return '#';
        const clusterQuery = buildClusterQueryParam(currentNetwork, currentCustomRpcUrl);
        return explorer.urlPattern.replace('{signature}', transaction.id).replace('{clusterQueryParam}', clusterQuery);
    }, [transaction?.id, explorer, currentNetwork, currentCustomRpcUrl]);


    if (!transaction) {
        return (
            <div className="flex flex-col h-full bg-[#090f14] p-4 text-white items-center justify-center">
                <AlertTriangle size={32} className="text-yellow-400 mb-3" />
                <p className="text-center">{t('activityDetails.detailsUnavailable')}</p> {/* Translate */}
                <button onClick={handleGoBack} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm">
                    {t('activityDetails.backToActivities')} {/* Translate */}
                </button>
            </div>
        );
    }

    const {
        id,  timestamp, type, action, name, amount, symbol,
        fromAddress, toAddress, secondaryAmount, secondarySymbol,
        iconUrl, secondaryIconUrl, source, feeLamports, mintAddress,
        secondaryMintAddress, dappName, 
    } = transaction;

    let titleKey = 'activityDetails.headers.default';
    let titleParams: Record<string, string | undefined> = { name: name || "" };

    if (type === 'sol' || type === 'token' || type === 'nft') {
        const assetName = symbol || name || t('activityDetails.assetFallback');
        if (action === 'sent') titleKey = 'activityDetails.headers.sentAsset';
        else if (action === 'received') titleKey = 'activityDetails.headers.receivedAsset';
        titleParams = { assetName };
    } else if (type === 'swap') {
        titleKey = 'activityDetails.headers.swap';
        titleParams = { tokenA: symbol || t('activityDetails.tokenFallback'), tokenB: secondarySymbol || t('activityDetails.tokenFallback') };
    } else if (type === 'dapp_interaction') {
        titleKey = dappName ? 'activityDetails.headers.dappInteractionNamed' : 'activityDetails.headers.dappInteraction';
        titleParams = { dappName };
    } else if (type === 'interaction') { // Generic interaction
        titleKey = 'activityDetails.headers.interaction';
    }


    const formattedDate = new Date(timestamp * 1000).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const headerTitle = t(titleKey, titleParams);

    return (
        <div className="flex flex-col h-full bg-[#090f14] text-gray-200">
            <div className="flex items-center justify-center p-4 border-b border-[#243B55] flex-shrink-0 relative h-14">
                <button
                  onClick={handleGoBack}
                  className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
                  aria-label={t('common.back')} // Translate
                >
                  <ArrowLeft size={20} />
                </button>
                {/* title attribute removed */}
                <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
                  {headerTitle}
                </h2>
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <div className="bg-[#161E2D] p-4 rounded-lg border border-gray-700/30 shadow-lg space-y-1">
                    <DetailRow labelKey="activityDetails.labels.date" value={formattedDate} />
                    <DetailRow labelKey="activityDetails.labels.status" value={t('activityDetails.statusConfirmed')} />

                    {type === 'swap' && (
                        <>
                            <div className="pt-2 mt-2 border-t border-gray-600/50">
                                <TokenDisplay
                                    amount={amount}
                                    symbol={symbol}
                                    iconUrl={iconUrl}
                                    mintAddress={mintAddress}
                                    isOutgoing={true}
                                    prefixKey="activityDetails.prefixes.youPaid" // Translate
                                />
                            </div>
                            <div className="pb-1">
                                <TokenDisplay
                                    amount={secondaryAmount}
                                    symbol={secondarySymbol}
                                    iconUrl={secondaryIconUrl}
                                    mintAddress={secondaryMintAddress}
                                    prefixKey="activityDetails.prefixes.youReceived" // Translate
                                />
                            </div>
                        </>
                    )}

                    {(type === 'sol' || type === 'token' || type === 'nft') && amount && (
                        <div className="pt-2 mt-2 border-t border-gray-600/50">
                             <TokenDisplay
                                amount={amount.replace(/[+-]/g, '')}
                                symbol={symbol}
                                iconUrl={iconUrl}
                                mintAddress={mintAddress}
                                prefixKey={action === 'sent' ? "activityDetails.prefixes.amountSent" : "activityDetails.prefixes.amountReceived"} // Translate
                                isOutgoing={action === 'sent'}
                            />
                        </div>
                    )}
                    
                    {name && (type !== 'sol' && type !== 'token' && type !== 'nft' && type !== 'swap') && (
                         <DetailRow labelKey="activityDetails.labels.interaction" value={name} />
                    )}

                    {fromAddress && <DetailRow labelKey="activityDetails.labels.from" value={fromAddress} isMono /* title removed */ />}
                    {toAddress && <DetailRow labelKey="activityDetails.labels.to" value={toAddress} isMono /* title removed */ />}
                    {(dappName || source) && <DetailRow labelKey="activityDetails.labels.source" value={dappName || source} /* title removed */ />}

                    {feeLamports !== undefined && (
                        <DetailRow labelKey="activityDetails.labels.networkFee" value={(feeLamports / LAMPORTS_PER_SOL).toFixed(9)} unit="SOL" />
                    )}
                </div>

                <div className="bg-[#161E2D] p-4 rounded-lg border border-gray-700/30 shadow-lg space-y-3">
                     <h3 className="text-md font-semibold text-gray-300 mb-1">{t('activityDetails.transactionIdLabel')}</h3> {/* Translate */}
                    <div className="flex items-center justify-between">
                        {/* title attribute removed */}
                        <span className="text-xs text-gray-400 font-mono break-all mr-2"> 
                            {id}
                        </span>
                        <button
                            onClick={() => handleCopyToClipboard(id)}
                            className="p-1.5 text-gray-400 hover:text-blue-400 rounded-md hover:bg-gray-700/50 shrink-0"
                            aria-label={copiedId ? t('common.copied') : t('common.copy')} // Translate
                            // title attribute removed
                        >
                            {copiedId ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
                        </button>
                    </div>
                    <a
                        href={explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-full mt-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors"
                    >
                        {t('activityDetails.viewOnExplorer', { explorerName: explorer?.name || t('common.explorer') })} {/* Translate */}
                        <ExternalLink size={14} className="ml-2" />
                    </a>
                </div>
            </div>
        </div>
    );
};

export default ActivityTransactionDetailsView;