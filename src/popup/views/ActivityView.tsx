// src/popup/views/ActivityView.tsx
import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { Zap, HelpCircle, ArrowUpRight, ArrowDownLeft, Repeat, Check, Loader2, AppWindow } from 'lucide-react';
import ActivityItemSkeleton from '../unlocked/components/skeletons/ActivityItemSkeleton';
import { useActivityFeed, ActivityTransaction as HookActivityTransaction } from '../../hooks/useActivityFeed';
import type { TokenInfo } from '../../background/core/keyring/types';
import { useAppStore } from '../../store/appStore';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface ActivityTransactionUI extends HookActivityTransaction {}

interface ActivityGroup {
  dateLabel: string;
  transactions: ActivityTransactionUI[];
}

interface ActivityViewProps {
  knownTokens?: TokenInfo[] | null;
}

const formatDateLabel = (dateString: string, locale: string | undefined): string => { // Added locale
  const date = new Date(dateString);
  // Note: getTimezoneOffset might not be ideal for historical dates if they were stored in UTC
  // and user expects to see them in their local time AT THAT PAST DATE.
  // For simplicity, this adjusts to current user's local timezone display.
  const userTimezoneOffset = date.getTimezoneOffset() * 60000;
  const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
  return adjustedDate.toLocaleDateString(locale, { // Use locale
    year: 'numeric', month: 'long', day: 'numeric',
  });
};

const truncateAddressLocal = (address: string | undefined, chars = 4): string => {
  if (!address) return '...';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

const isGenericSymbolInView = (symbol?: string): boolean => {
  if (!symbol) return true;
  const lowerSymbol = symbol.toLowerCase().trim();
  return ['unk', 'unknown', 'token', 'unknown token', 'token !', '$unk'].includes(lowerSymbol);
};

// Updated to use `t` for defaultText
const getTokenDisplayIdentifierInView = (
  t: Function, // Pass t function
  symbol?: string,
  address?: string,
  options: {
    forIconChar?: boolean;
    length?: number;
    defaultTextKey?: string; // Key for default text
    unknownTokenSymbol?: string;
    hasAmountDisplay?: boolean;
    isSwap?: boolean;
  } = {}
): string => {
  const {
    forIconChar = false,
    length = 6,
    defaultTextKey = 'activityItem.unknownToken', // Default translation key
    unknownTokenSymbol = '?',
    hasAmountDisplay = false,
    isSwap = false
  } = options;

  if (symbol && !isGenericSymbolInView(symbol)) {
    return forIconChar ? symbol.charAt(0).toUpperCase() : symbol;
  }

  if (address) {
    let truncateLength = length;
    if (hasAmountDisplay) {
      truncateLength = isSwap ? 2 : 3;
    }
    const charsToTruncate = forIconChar ? Math.max(1, Math.floor(truncateLength / 1.5)) : truncateLength;
    const truncated = truncateAddressLocal(address, charsToTruncate);
    if (forIconChar) {
      return truncated.length > 0 ? truncated.charAt(0).toUpperCase() : unknownTokenSymbol;
    }
    return truncated;
  }

  return forIconChar ? unknownTokenSymbol : t(defaultTextKey);
};

const ActivityItem: React.FC<{ transaction: ActivityTransactionUI }> = ({ transaction }) => {
  const { t } = useTranslation(); // Initialize useTranslation for ActivityItem
  const setViewActivityTransactionDetails = useAppStore(s => s.setViewActivityTransactionDetails);

  const isSent = transaction.action === 'sent';
  const isReceived = transaction.action === 'received';
  const isSwap = transaction.type === 'swap';
  const isDappInteraction = transaction.type === 'dapp_interaction';
  const isGenericInteraction = transaction.type === 'interaction' && !isDappInteraction;
  const isApproval = transaction.action === 'approved';

  const willShowAmounts = (isSent || isReceived) && transaction.amount && !isDappInteraction;
  const willShowSwapAmounts = isSwap;

  const primaryTokenSymbolText = getTokenDisplayIdentifierInView(
    t, transaction.symbol, transaction.mintAddress,
    { hasAmountDisplay: willShowAmounts || willShowSwapAmounts, isSwap: willShowSwapAmounts }
  );
  const primaryTokenCharIcon = getTokenDisplayIdentifierInView(
    t, transaction.symbol, transaction.mintAddress, { forIconChar: true }
  );

  const secondaryTokenSymbolText = getTokenDisplayIdentifierInView(
    t, transaction.secondarySymbol, transaction.secondaryMintAddress,
    { hasAmountDisplay: willShowSwapAmounts, isSwap: willShowSwapAmounts }
  );
  const secondaryTokenCharIcon = getTokenDisplayIdentifierInView(
    t, transaction.secondarySymbol, transaction.secondaryMintAddress, { forIconChar: true }
  );
    
  const hasPrimaryIcon = Boolean(transaction.iconUrl);
  const tokenAltText = (tokenSymbol: string) => t('itemList.tokenLogoAlt', { tokenSymbol });


  let ActionIconToDisplayBesideText: React.ElementType | null = HelpCircle;
  let actionColor: string = 'text-gray-200';
  let primaryActionText: string = transaction.name || t('activityItem.unknownActivity');
  let subtitleText: string | undefined = undefined;
  let itemCircleIcon: React.ReactNode;

  if (isSent) {
    ActionIconToDisplayBesideText = ArrowUpRight; actionColor = 'text-red-400';
    primaryActionText = hasPrimaryIcon
      ? t('activityItem.actions.sentToken', { tokenSymbol: primaryTokenSymbolText })
      : t('activityItem.actions.sent');
    subtitleText = transaction.toAddress ? `${t('activityItem.labels.to')}: ${truncateAddressLocal(transaction.toAddress)}` : undefined;
    itemCircleIcon = transaction.iconUrl
      ? <img src={transaction.iconUrl} alt={tokenAltText(primaryTokenSymbolText)} className="w-10 h-10 rounded-full bg-gray-700 object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/40x40/374151/FFFFFF/png?text=${primaryTokenCharIcon}&fontsize=20`; }}/>
      : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-semibold text-lg">{primaryTokenCharIcon}</div>;

  } else if (isReceived) {
    ActionIconToDisplayBesideText = ArrowDownLeft; actionColor = 'text-green-400';
    primaryActionText = hasPrimaryIcon
      ? t('activityItem.actions.receivedToken', { tokenSymbol: primaryTokenSymbolText })
      : t('activityItem.actions.received');
    subtitleText = transaction.fromAddress ? `${t('activityItem.labels.from')}: ${truncateAddressLocal(transaction.fromAddress)}` : undefined;
    itemCircleIcon = transaction.iconUrl
      ? <img src={transaction.iconUrl} alt={tokenAltText(primaryTokenSymbolText)} className="w-10 h-10 rounded-full bg-gray-700 object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/40x40/374151/FFFFFF/png?text=${primaryTokenCharIcon}&fontsize=20`; }}/>
      : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-semibold text-lg">{primaryTokenCharIcon}</div>;

  } else if (isSwap) {
    ActionIconToDisplayBesideText = Repeat; actionColor = 'text-blue-400';
    primaryActionText = t('activityItem.actions.swap');
    subtitleText = (!isGenericSymbolInView(transaction.symbol) && !isGenericSymbolInView(transaction.secondarySymbol))
      ? `${primaryTokenSymbolText} → ${secondaryTokenSymbolText}`
      : undefined;
    itemCircleIcon = (
      <div className="relative w-10 h-10">
        <img
          src={transaction.iconUrl || `https://placehold.co/28x28/374151/FFFFFF/png?text=${primaryTokenCharIcon}&fontsize=16`}
          alt={tokenAltText(primaryTokenSymbolText)}
          className="w-7 h-7 rounded-full absolute top-0 left-0 bg-gray-700 object-cover z-10 border-2 border-[#1A2433]"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/28x28/374151/FFFFFF/png?text=${primaryTokenCharIcon}&fontsize=16`; }}
        />
        <img
          src={transaction.secondaryIconUrl || `https://placehold.co/28x28/374151/FFFFFF/png?text=${secondaryTokenCharIcon}&fontsize=16`}
          alt={tokenAltText(secondaryTokenSymbolText)}
          className={`w-7 h-7 rounded-full absolute bottom-0 right-0 bg-gray-700 object-cover border-2 border-[#1A2433] ${transaction.iconUrl ? 'z-0' : 'z-10'}`}
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://placehold.co/28x28/374151/FFFFFF/png?text=${secondaryTokenCharIcon}&fontsize=16`; }}
        />
        {(!transaction.iconUrl || transaction.iconUrl.includes('placehold.co')) &&
         (!transaction.secondaryIconUrl || transaction.secondaryIconUrl.includes('placehold.co')) && (
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center absolute inset-0">
            <Repeat size={20} className="text-gray-400"/>
          </div>
        )}
      </div>
    );

  } else if (isDappInteraction) {
    ActionIconToDisplayBesideText = null;
    actionColor = 'text-indigo-400';
    primaryActionText = transaction.dappName || t('activityItem.actions.appInteraction');
    itemCircleIcon = transaction.dappIconUrl
      ? <img src={transaction.dappIconUrl} alt={primaryActionText} className="w-10 h-10 rounded-full bg-gray-700 object-contain p-0.5"/>
      : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-indigo-400"><AppWindow size={20}/></div>;

  } else if (isGenericInteraction) {
    ActionIconToDisplayBesideText = null;
    actionColor = 'text-purple-400';
    primaryActionText = t('activityItem.actions.programInteraction');
    subtitleText = transaction.source ? `${t('activityItem.labels.program')}: ${truncateAddressLocal(transaction.source, 6)}` : undefined;
    itemCircleIcon = <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-purple-400"><Zap size={20}/></div>;

  } else if (isApproval) {
    ActionIconToDisplayBesideText = Check; actionColor = 'text-sky-400';
    primaryActionText = transaction.name || t('activityItem.actions.approval');
    subtitleText = transaction.source ? `${t('activityItem.labels.for')}: ${truncateAddressLocal(transaction.source, 6)}` : undefined;
    const approvalFallbackChar = (transaction.name || t('activityItem.actions.approval').charAt(0)).charAt(0).toUpperCase();
    itemCircleIcon = transaction.iconUrl
      ? <img src={transaction.iconUrl} alt={primaryActionText} className="w-10 h-10 rounded-full bg-gray-700 object-cover"/>
      : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-semibold text-lg">{approvalFallbackChar}</div>;

  } else { // Unknown
    ActionIconToDisplayBesideText = HelpCircle; actionColor = 'text-gray-400';
    primaryActionText = transaction.name || t('activityItem.unknownTransaction');
    subtitleText = transaction.source ? `${t('activityItem.labels.source')}: ${truncateAddressLocal(transaction.source, 6)}` : undefined;
    itemCircleIcon = <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-400"><HelpCircle size={20}/></div>;
  }

  const cleanAmount = transaction.amount?.replace(/[+-]/g, '');
  const cleanSecondaryAmount = transaction.secondaryAmount?.replace(/[+-]/g, '');

  const handleClick = () => {
    setViewActivityTransactionDetails(transaction);
  };

  return (
    <div
      className="flex items-center p-3 hover:bg-[#2A3447]/60 rounded-lg transition-colors duration-150 cursor-pointer"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
      aria-label={`${primaryActionText}${subtitleText ? ' - ' + subtitleText : ''}`}
    >
      <div className="flex-shrink-0 mr-3">{itemCircleIcon}</div>

      <div className="flex-grow min-w-0 flex justify-between items-center gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-medium text-gray-100 text-sm flex items-center min-w-0"
            // title attribute removed
          >
            {ActionIconToDisplayBesideText &&
              <ActionIconToDisplayBesideText size={14} className={`${actionColor} mr-1.5 flex-shrink-0`} />
            }
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {primaryActionText}
            </span>
          </div>
          {subtitleText && (
            // title attribute removed
            <div className="text-xs text-gray-400 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
              {subtitleText}
            </div>
          )}
        </div>

        <div className="text-right flex-shrink-0 min-w-0 max-w-[40%]">
          {isSwap ? (
            <div className="min-w-0">
              {/* title attributes removed */}
              <div className="font-semibold text-sm text-green-400 whitespace-nowrap overflow-hidden text-ellipsis">
                +{cleanSecondaryAmount || '?'}
              </div>
              <div className="font-semibold text-sm text-red-400 whitespace-nowrap mt-0.5 overflow-hidden text-ellipsis">
                -{cleanAmount || '?'}
              </div>
            </div>
          ) : (isSent || isReceived) && transaction.amount && transaction.symbol && !isDappInteraction ? (
            <div className="min-w-0">
              {/* title attribute removed */}
              <span className={`font-semibold text-sm ${actionColor} whitespace-nowrap overflow-hidden text-ellipsis block`}>
                {isReceived ? '+' : '-'}{cleanAmount} {primaryTokenSymbolText}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const ActivityView: React.FC<ActivityViewProps> = ({ knownTokens }) => {
  const { t, i18n } = useTranslation(); // Initialize useTranslation
  const {
    activities, isLoadingInitial, isFetchingMore, isLoadingFromCache,
    error, hasMoreActivities, loadMoreActivities, refreshActivities,
  } = useActivityFeed(knownTokens);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => activities.filter(tx =>
      !(tx.type === 'sol' && tx.action === 'received' && parseFloat(tx.amount || '0') === 0)
    ),
    [activities]
  );

  const groupedActivities = useMemo((): ActivityGroup[] => {
    const groups: Record<string, ActivityTransactionUI[]> = {};
    filtered.forEach(activity => {
      const dateKey = activity.date;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(activity);
    });
    return Object.keys(groups)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .map(dateKey => ({
        dateLabel: formatDateLabel(dateKey, i18n.language), // Pass current language for formatting
        transactions: groups[dateKey].sort((txA, txB) => {
          if (txB.timestamp !== txA.timestamp) {
            return txB.timestamp - txA.timestamp;
          }
          const keyA = `${txA.id}-${txA.type}-${txA.action}-${txA.mintAddress || 'sol'}-${txA.amount || 'no_amount'}`;
          const keyB = `${txB.id}-${txB.type}-${txB.action}-${txB.mintAddress || 'sol'}-${txB.amount || 'no_amount'}`;
          return keyB.localeCompare(keyA);
        })
      }));
  }, [filtered, i18n.language]); // Add i18n.language as dependency

  const handleScroll = useCallback(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 150;
    if (atBottom && hasMoreActivities && !isFetchingMore && !isLoadingInitial && !isLoadingFromCache) {
      loadMoreActivities();
    }
  }, [hasMoreActivities, isFetchingMore, isLoadingInitial, isLoadingFromCache, loadMoreActivities]);

  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    c.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check
    return () => c.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  if (isLoadingInitial && filtered.length === 0) {
    return (
      <div className="flex-grow flex flex-col p-2 space-y-0.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <ActivityItemSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (isLoadingFromCache && filtered.length === 0) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center text-blue-400">
        <Loader2 size={32} className="animate-spin mb-4" />
        <p className="text-sm">{t('activityView.loadingFromCache')}</p> {/* Translate */}
      </div>
    );
  }
  if (error && filtered.length === 0) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center text-red-400">
        <Zap size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-medium">{t('activityView.errorLoadingTitle')}</p> {/* Translate */}
        <p className="text-sm">{error.toString()}</p> {/* Error might be already translated or technical */}
        <button
          onClick={() => (refreshActivities ? refreshActivities() : loadMoreActivities())}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          {t('buttons.tryAgain')} {/* Translate */}
        </button>
      </div>
    );
  }
  if (!isLoadingInitial && !isLoadingFromCache && filtered.length === 0) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center text-gray-500">
        <Zap size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-medium">{t('activityView.noRecentActivityTitle')}</p> {/* Translate */}
        <p className="text-sm">{t('activityView.transactionsAppearHere')}</p> {/* Translate */}
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex-grow overflow-y-auto custom-scrollbar px-2 pb-4 space-y-4"
      style={{ maxHeight: '100%' }}
    >
      {groupedActivities.map(group => (
        <div key={group.dateLabel}>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider px-2 py-2 sticky top-0 bg-[#090f14]/80 backdrop-blur-sm z-20">
            {group.dateLabel} {/* Date label is already formatted using toLocaleDateString */}
          </p>
          <div className="space-y-0.5 bg-[#161E2D]/70 rounded-xl shadow">
            {group.transactions.map(tx => (
              <ActivityItem
                key={`${tx.id}-${tx.type}-${tx.action}-${tx.mintAddress || 'sol'}-${tx.amount || 'no_amount'}-${tx.timestamp}`}
                transaction={tx}
              />
            ))}
          </div>
        </div>
      ))}

      {isFetchingMore && (
        <div className="flex flex-col items-center justify-center py-6 text-gray-400">
          <Loader2 size={28} className="animate-spin text-blue-400" />
          <p className="mt-2 text-sm">{t('activityView.loadingMore')}</p> {/* Translate */}
        </div>
      )}

      {!hasMoreActivities && filtered.length > 0 && (
        <div className="text-center py-4 text-sm text-gray-500">
          {t('activityView.noMoreActivities')} {/* Translate */}
        </div>
      )}
    </div>
  );
};

export default ActivityView;