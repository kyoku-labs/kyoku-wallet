// src/popup/unlocked/components/ItemList.tsx
import React, { useState, useEffect } from 'react';
import { TokenInfo } from '../../../background/core/keyring/types';
import { formatTokenBalance } from '../../../utils/formatters';
import { useAppStore } from '../../../store/appStore';

import { convertAndFormatFiat } from '../../../utils/currencyUtils';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';

interface ItemListProps {
    tokens: TokenInfo[] | null | undefined;
    isLoading: boolean;
    onTokenClick?: (token: TokenInfo) => void;
}

const FallbackLogo: React.FC<{ symbol?: string; address?: string; size?: string }> = ({ symbol, address, size = "w-10 h-10" }) => (
    <div className={`${size} rounded-full bg-gray-700 flex items-center justify-center text-lg font-bold text-white uppercase flex-shrink-0 object-cover`}>
        {symbol ? symbol.substring(0, 1) : address?.substring(0, 1) || '?'}
    </div>
);

const FiatValueDisplay: React.FC<{ usdValue: number | null | undefined; selectedCurrency: string }> = ({ usdValue, selectedCurrency }) => {
    const { t } = useTranslation();
    const [formattedFiat, setFormattedFiat] = useState<string>('...');
    const [isFormatting, setIsFormatting] = useState(false);

    useEffect(() => {
        let isMounted = true;
        if (usdValue !== undefined && usdValue !== null) {
            setIsFormatting(true);
            setFormattedFiat('...');
            convertAndFormatFiat(usdValue, selectedCurrency, 2)
                .then(formatted => {
                    if (isMounted) setFormattedFiat(formatted);
                })
                .catch(() => {
                    if (isMounted) setFormattedFiat(`$${usdValue?.toFixed(2)} (${t('common.usdCurrencyCode')})`);
                })
                .finally(() => {
                    if (isMounted) setIsFormatting(false);
                });
        } else if (usdValue === null) {
            setFormattedFiat(t('common.notAvailable'));
            setIsFormatting(false);
        } else {
             setFormattedFiat('...');
             setIsFormatting(false);
        }
        return () => { isMounted = false; };
    }, [usdValue, selectedCurrency, t]);

    if (isFormatting || formattedFiat === '...') {
        return <div className="bg-gray-700 rounded h-5 w-20 animate-pulse self-end"></div>;
    }
    return <span className="text-sm font-medium text-white">{formattedFiat}</span>;
};

// This component now displays PRICE PERCENTAGE CHANGE
const PricePercentageChangeDisplay: React.FC<{ priceChange24hPercentage: number | null | undefined; }> = ({ priceChange24hPercentage }) => {


    if (priceChange24hPercentage === null || priceChange24hPercentage === undefined) {
        // Optionally, show a small skeleton if you expect it but it's loading
        // For now, returning null if no data.
        return null;
    }

    const isPositive = priceChange24hPercentage > 0;
    const isNegative = priceChange24hPercentage < 0;
    const isNeutral = Math.abs(priceChange24hPercentage) < 0.01;

    let colorClass = 'text-gray-400';
    if (isPositive && !isNeutral) colorClass = 'text-green-400';
    if (isNegative && !isNeutral) colorClass = 'text-red-400';

    const Icon = isNeutral ? TrendingUp : (isPositive ? ArrowUpRight : ArrowDownRight);
    const prefix = (isPositive && !isNeutral) ? '+' : '';

    return (
        <span className={`text-xs font-medium ${colorClass} flex items-center justify-end mt-1`}>
            <Icon size={12} className="mr-0.5" />
            {prefix}{Math.abs(priceChange24hPercentage).toFixed(2)}%
        </span>
    );
};


const TokenListItem: React.FC<{ token: TokenInfo; onClick: () => void; selectedCurrency: string }> = ({ token, onClick, selectedCurrency }) => {
    const { t } = useTranslation();
    const tokenNameForDisplay = token.name || token.symbol || t('itemList.unknownToken');
    const tokenBalanceFormatted = formatTokenBalance(token.balance, token.isNative ? 4 : token.decimals);
    const tokenSymbolForDisplay = token.symbol || t('itemList.unknownSymbol');

    const itemDetailsAriaLabel = `${tokenNameForDisplay}: ${tokenBalanceFormatted} ${tokenSymbolForDisplay}. USD Value: ${token.usdValue !== null && token.usdValue !== undefined ? token.usdValue.toFixed(2) : t('common.notAvailable')}. 24h Price Change: ${token.priceChange24hPercentage !== null && token.priceChange24hPercentage !== undefined ? token.priceChange24hPercentage.toFixed(2) + '%' : t('common.notAvailable')}`;


    return (
        <li
            className="flex items-center justify-between hover:bg-[#2A3447] p-3 -mx-1 rounded-lg transition-colors duration-150 cursor-pointer border border-transparent hover:border-gray-700/50"
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick();}}
            aria-label={itemDetailsAriaLabel}
        >
            {/* Left Column: Logo, Name, Balance */}
            <div className="flex items-center space-x-3 overflow-hidden min-w-0">
                {token.logo ? (
                    <img src={token.logo} alt={t('itemList.tokenLogoAlt', { tokenSymbol: token.symbol || token.name })} className="w-10 h-10 rounded-full flex-shrink-0 object-cover bg-gray-800" />
                ) : (
                    <FallbackLogo symbol={token.symbol} address={token.address} size="w-10 h-10" />
                )}
                <div className="overflow-hidden">
                    <span className="font-semibold block truncate text-gray-100 text-base">
                        {tokenNameForDisplay}
                    </span>
                    <span className="text-sm text-gray-400 block truncate font-mono">
                        {tokenBalanceFormatted} {tokenSymbolForDisplay}
                    </span>
                </div>
            </div>

            {/* Right Column: USD Value, 24h Price % Change */}
            <div className="text-right flex-shrink-0 pl-2 flex flex-col items-end">
                <FiatValueDisplay usdValue={token.usdValue} selectedCurrency={selectedCurrency} />
                <PricePercentageChangeDisplay priceChange24hPercentage={token.priceChange24hPercentage} />
            </div>
        </li>
    );
};


const ItemList: React.FC<ItemListProps> = ({ tokens, isLoading, onTokenClick }) => {
    const { t } = useTranslation();
    const { setViewTokenDetails, selectedCurrency } = useAppStore();

    const handleItemClick = (token: TokenInfo) => {
        if (onTokenClick) {
            onTokenClick(token);
        } else {
            setViewTokenDetails(token);
        }
    };

    if (isLoading) {
        return (
            <ul className="space-y-2 text-sm px-1 py-2">
                {Array.from({ length: 5 }).map((_, index) => (
                    <li key={index} className="flex items-center justify-between p-3 -mx-1 rounded-lg bg-[#1A2433]/50">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gray-700 animate-pulse"></div>
                            <div className="space-y-1.5">
                                <div className="h-5 w-24 bg-gray-700 rounded animate-pulse"></div>
                                <div className="h-4 w-20 bg-gray-700 rounded animate-pulse"></div>
                            </div>
                        </div>
                        <div className="space-y-1.5 flex flex-col items-end">
                            <div className="h-5 w-20 bg-gray-700 rounded animate-pulse"></div>
                            <div className="h-4 w-12 bg-gray-700 rounded animate-pulse"></div>
                        </div>
                    </li>
                ))}
            </ul>
        );
    }

    const displayableTokens = tokens;

    if (!displayableTokens || displayableTokens.length === 0) {
        return (
            <div className="text-center text-gray-500 py-6 px-4">
                {t('itemList.noTokensToDisplay')}
            </div>
        );
    }

    return (
        <ul className="space-y-2 text-sm px-1 py-2">
            {displayableTokens.map((token) => (
                <TokenListItem
                    key={token.address}
                    token={token}
                    onClick={() => handleItemClick(token)}
                    selectedCurrency={selectedCurrency}
                />
            ))}
        </ul>
    );
};

export default ItemList;