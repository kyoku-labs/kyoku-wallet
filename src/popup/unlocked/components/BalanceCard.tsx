// src/popup/unlocked/components/BalanceCard.tsx
import React, { useState, useEffect, useMemo } from 'react';

import { RefreshCcw, TrendingUp as TrendingUpIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { convertAndFormatFiat } from '../../../utils/currencyUtils';
import { useTranslation } from 'react-i18next';
import { usePortfolio } from '../../../hooks/usePortfolio';


const formatSolEquivalentDisplay = (solAmount: number | null | undefined, decimals = 4): string => {
    if (solAmount === null || solAmount === undefined) return '... SOL';
    try {
        return new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: decimals,
        }).format(solAmount) + ' SOL';
    } catch (e) {
        return 'Error SOL';
    }
};

const BalanceTextSkeleton: React.FC<{ widthClass?: string }> = ({ widthClass = "w-48" }) => {
  return (
    <div className={`bg-gray-700 rounded-md h-10 ${widthClass} animate-pulse`}></div>
  );
};

const PercentageChangeSkeleton: React.FC = () => {
    return <div className="bg-gray-700 rounded h-4 w-20 animate-pulse"></div>;
};

interface BalanceCardProps {
    
    totalPortfolioUsdValue: number | null | undefined;
    isLoading: boolean;
    error: string | null;
    onRefresh: () => void;
}

const BalanceCard: React.FC<BalanceCardProps> = ({
    totalPortfolioUsdValue,
    isLoading: isLoadingPortfolioHook,
    error: portfolioError,
    onRefresh
}) => {
    const { t } = useTranslation();
    const {
        selectedCurrency,
        portfolioUsdChange24h,
        portfolioChange24h
    } = useAppStore();

    const { totalPortfolioSolEquivalent, isLoading: isLoadingPortfolioForSolEquivalent } = usePortfolio();

    const [formattedFiatValue, setFormattedFiatValue] = useState<string>('...');
    const [isFormattingFiat, setIsFormattingFiat] = useState(false);
    const [displayMode, setDisplayMode] = useState<'fiat' | 'sol'>('fiat');

    useEffect(() => {
        let isMounted = true;
        if (totalPortfolioUsdValue !== undefined && totalPortfolioUsdValue !== null) {
            setIsFormattingFiat(true);
            setFormattedFiatValue(totalPortfolioUsdValue === 0 ? '$0.00' : '...');
            convertAndFormatFiat(totalPortfolioUsdValue, selectedCurrency, 2)
                .then(formatted => {
                    if (isMounted) setFormattedFiatValue(formatted);
                })
                .catch(_err => {
                    if (isMounted) {
                        setFormattedFiatValue(`$${totalPortfolioUsdValue.toFixed(2)} (${t('common.usdCurrencyCode')})`);
                    }
                })
                .finally(() => {
                    if (isMounted) setIsFormattingFiat(false);
                });
        } else if (totalPortfolioUsdValue === null) {
            setFormattedFiatValue(t('common.notAvailable'));
            setIsFormattingFiat(false);
        } else {
             setFormattedFiatValue('...');
             setIsFormattingFiat(false);
        }
        return () => { isMounted = false; };
    }, [totalPortfolioUsdValue, selectedCurrency, t]);

    const isLoadingPrimaryBalance = (isLoadingPortfolioHook && totalPortfolioUsdValue === undefined) || isFormattingFiat || (displayMode === 'sol' && isLoadingPortfolioForSolEquivalent);

    const formattedAbsoluteUsdChangePromise = useMemo(() => {
        if (portfolioUsdChange24h === null || portfolioUsdChange24h === undefined) return Promise.resolve(null);
        const prefix = portfolioUsdChange24h > 0 ? '+' : portfolioUsdChange24h < 0 ? '-' : '';
        return convertAndFormatFiat(Math.abs(portfolioUsdChange24h), selectedCurrency, 2)
                 .then(formattedVal => `${prefix}${formattedVal}`)
                 .catch(() => {
                    const fallbackPrefix = portfolioUsdChange24h > 0 ? '+' : portfolioUsdChange24h < 0 ? '-' : '';
                    return `${fallbackPrefix}$${Math.abs(portfolioUsdChange24h as number).toFixed(2)}`;
                 });
    }, [portfolioUsdChange24h, selectedCurrency]);

    const [resolvedFormattedAbsoluteChange, setResolvedFormattedAbsoluteChange] = useState<string | null>(null);
    const [isFormattingAbsoluteChange, setIsFormattingAbsoluteChange] = useState(false);

    useEffect(() => {
        if (portfolioUsdChange24h === null || portfolioUsdChange24h === undefined) {
            setResolvedFormattedAbsoluteChange(null);
            return;
        }
        setIsFormattingAbsoluteChange(true);
        formattedAbsoluteUsdChangePromise.then(val => {
            setResolvedFormattedAbsoluteChange(val);
            setIsFormattingAbsoluteChange(false);
        });
    }, [formattedAbsoluteUsdChangePromise, portfolioUsdChange24h]);


    const changeDisplay = useMemo(() => {
        if (isLoadingPortfolioHook || isFormattingAbsoluteChange) {
            return <PercentageChangeSkeleton />;
        }

        const absChangeText = resolvedFormattedAbsoluteChange;
        const pctChange = portfolioChange24h;

        if ((absChangeText === null || absChangeText === undefined) && (pctChange === null || pctChange === undefined)) {
            return null;
        }

        const changeBase = portfolioUsdChange24h ?? 0;
        const isPositive = changeBase > 0;
        const isNegative = changeBase < 0;
        
        // Check for 'new_portfolio_increase' first
        if (pctChange === 'new_portfolio_increase') {
            return (
                <div className={`text-sm font-medium text-green-400 flex items-center justify-center`}>
                    <ArrowUpRight size={14} className="mr-0.5" /> New
                </div>
            );
        }
        
        // Determine neutral state based on numeric pctChange
        const isNumericPctChange = typeof pctChange === 'number';
        const isNeutral = Math.abs(changeBase) < 0.01 && (!isNumericPctChange || (isNumericPctChange && pctChange !== null && Math.abs(pctChange) < 0.01));

        let colorClass = 'text-gray-400'; 
        if (isPositive && !isNeutral) colorClass = 'text-green-400';
        if (isNegative && !isNeutral) colorClass = 'text-red-400';
        
        const PctIcon = isNeutral ? TrendingUpIcon : (isPositive ? ArrowUpRight : ArrowDownRight);

        
        if ((!absChangeText || portfolioUsdChange24h === 0) && isNumericPctChange && pctChange !== null && pctChange !== undefined) {
            const numericPctChange = pctChange as number;
            const pctColorClass = numericPctChange > 0 ? 'text-green-400' : numericPctChange < 0 ? 'text-red-400' : 'text-gray-400';
            const IconForPctOnly = Math.abs(numericPctChange) < 0.01 ? TrendingUpIcon : (numericPctChange > 0 ? ArrowUpRight : ArrowDownRight);
             return (
                <div className={`text-sm font-medium ${pctColorClass} flex items-center justify-center`}>
                    <IconForPctOnly size={14} className="mr-0.5" />
                    {numericPctChange > 0 ? '+' : ''}{numericPctChange.toFixed(2)}%
                </div>
            );
        }
        
        
        if (absChangeText && (!isNumericPctChange || pctChange === null || pctChange === undefined || pctChange === 0) && portfolioUsdChange24h !== 0) {
             return (
                <div className={`text-sm font-medium ${colorClass} flex items-center justify-center`}>
                   <PctIcon size={14} className="mr-0.5" />
                   {absChangeText}
                </div>
            );
        }

        
        return (
            <div className={`text-sm font-medium ${colorClass} flex items-center justify-center space-x-2`}>
                {absChangeText && <span>{absChangeText}</span>}
                {isNumericPctChange && pctChange !== null && pctChange !== undefined && (
                    <span className="flex items-center">
                        <PctIcon size={14} className="mr-0.5" />
                        {isPositive && !isNeutral && (pctChange as number) !== 0 ? '+' : ''}{(pctChange as number).toFixed(2)}%
                    </span>
                )}
            </div>
        );
    }, [portfolioUsdChange24h, portfolioChange24h, isLoadingPortfolioHook, resolvedFormattedAbsoluteChange, isFormattingAbsoluteChange, t]);

    const toggleDisplayMode = () => {
        setDisplayMode(prev => prev === 'fiat' ? 'sol' : 'fiat');
    };
    
    const mainBalanceDisplay = useMemo(() => {
        if (displayMode === 'fiat') {
            return formattedFiatValue;
        } else {
            return formatSolEquivalentDisplay(totalPortfolioSolEquivalent);
        }
    }, [displayMode, formattedFiatValue, totalPortfolioSolEquivalent]);

    return (
        <div className="relative bg-[#161E2D] rounded-2xl px-4 sm:px-6 pt-5 pb-4 flex flex-col items-center justify-center shadow-lg mb-4 border border-gray-700/50 min-h-[100px]"> 
            <button
                onClick={onRefresh}
                disabled={isLoadingPortfolioHook || isFormattingFiat || isLoadingPortfolioForSolEquivalent}
                className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-white rounded-full transition disabled:opacity-50 hover:bg-gray-700/50"
                aria-label={t('balanceCard.refreshBalance')}
            >
                <RefreshCcw className={`w-3.5 h-3.5 ${(isLoadingPortfolioHook || isFormattingFiat) ? 'animate-spin' : ''}`} />
            </button>

            {portfolioError ? (
                <div className="text-center">
                    <p className="text-xl font-bold text-red-400 truncate">{t('balanceCard.loadErrorTitle')}</p>
                    <p className="text-xs text-red-500 mt-1">{t('balanceCard.loadErrorMessage')} {portfolioError.length > 40 ? portfolioError.substring(0,37) + "..." : portfolioError}</p>
                </div>
            ) : (
                <>
                    <div 
                        className="text-4xl font-bold text-white mb-1 h-10 flex items-center justify-center min-w-[150px] cursor-pointer" 
                        onClick={toggleDisplayMode}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleDisplayMode()}
                        aria-label={`Total portfolio value, click to toggle display currency`}
                    >
                        {isLoadingPrimaryBalance ? (
                            <BalanceTextSkeleton widthClass={displayMode === 'sol' ? "w-36" : "w-48"} />
                        ) : (
                            mainBalanceDisplay
                        )}
                    </div>
                    
                    <div className="h-5 mt-0.5"> 
                        {changeDisplay}
                    </div>
                    
                </>
            )}
        </div>
    );
};

export default BalanceCard;