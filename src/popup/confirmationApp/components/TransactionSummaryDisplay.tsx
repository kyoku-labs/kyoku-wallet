import React, { useState } from 'react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ArrowUpRight, ArrowDownLeft, AlertCircle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type {
  DetailedTransactionPreview,
  SimulatedAssetChange,
} from '../../../background/shared/simulationParser';

interface SimulatedAssetChangeItemProps {
  change: SimulatedAssetChange;
  isFeePayer: boolean;
}

interface TokenIconProps {
  logoUri?: string;
  symbol?: string;
  size?: number;
}

const TokenIcon: React.FC<TokenIconProps> = ({ logoUri, symbol, size = 28 }) => {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);

  const fallbackChar = symbol ? symbol.charAt(0).toUpperCase() : '?';
  const altText = t('itemList.tokenLogoAlt', { tokenSymbol: symbol || 'token' });

  if (!logoUri || imageError) {
    return (
      <div
        className="token-icon-placeholder rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0"
        style={{
          width: size,
          height: size,
          lineHeight: `${size}px`,
        }}
        title={symbol || t('transactionSummary.unknownTokenPlaceholder')}
      >
        <span className="text-[10px] text-gray-300 font-medium">
          {fallbackChar}
        </span>
      </div>
    );
  }

  return (
    <img
      src={logoUri}
      alt={altText}
      className="rounded-full bg-gray-700 object-contain flex-shrink-0"
      onError={() => setImageError(true)}
      style={{ width: size, height: size }}
      title={symbol || t('transactionSummary.unknownTokenPlaceholder')}
    />
  );
};

const SimulatedAssetChangeItem: React.FC<SimulatedAssetChangeItemProps> = ({ change, isFeePayer }) => {
  const { t } = useTranslation();
  const amount = parseFloat(change.uiAmountChange);
  const isNegative = amount < 0;
  const isPositive = amount > 0;
  let amountColor = 'text-gray-100';
  let IconComponent = Info;

  if (isNegative) {
    amountColor = isFeePayer ? 'text-red-400' : 'text-orange-400';
    IconComponent = ArrowUpRight;
  } else if (isPositive) {
    amountColor = isFeePayer ? 'text-green-400' : 'text-teal-400';
    IconComponent = ArrowDownLeft;
  }

  const displayAmount = `${isPositive ? '+' : ''}${change.uiAmountChange}`;
  const displayName = change.isNFT
    ? (change.name || t('transactionSummary.nftPlaceholder'))
    : (change.name || change.symbol || t('transactionSummary.unknownTokenPlaceholder'));
  const displaySymbol = change.isNFT
    ? (change.symbol || `#${change.mintAddress.substring(0,4)}`)
    : change.symbol;

  return (
    <div className="flex items-center justify-between p-2.5 bg-[#1A2433] rounded-md border border-gray-700/60 shadow-inner mb-1.5 last:mb-0">
      <div className="flex items-center space-x-2.5 min-w-0">
        <TokenIcon
          logoUri={
            change.mintAddress === 'SOL'
              ? '/icons/Solana_logo.png'
              : change.logoUri
          }
          symbol={displaySymbol}
          size={28}
        />
        <div className="min-w-0">
          <p className="font-medium text-gray-100 truncate text-sm" title={displayName}>
            {displayName}
          </p>
          <p className="text-xs text-gray-400 truncate" title={displaySymbol}>
            {displaySymbol}
          </p>
        </div>
      </div>
      <div
        className={`flex items-center font-semibold ${amountColor} flex-shrink-0 pl-2 text-xs`}
        title={`Raw change: ${change.rawAmountChange}`}
      >
        <IconComponent size={14} className="mr-1" />
        {displayAmount} {displaySymbol}
      </div>
    </div>
  );
};

const formatLamportsToSol = (lamportsStr: string | undefined | null, maxDecimals = 9): string => {
  if (lamportsStr === undefined || lamportsStr === null) return "N/A";
  try {
    const lamports = BigInt(lamportsStr);
    const sol = Number(lamports) / LAMPORTS_PER_SOL;
    const effectiveDecimals = Math.min(
      maxDecimals,
      sol !== 0 && Math.abs(sol) < 0.000001 ? 9 : (sol !== 0 && Math.abs(sol) < 0.01 ? 6 : 4)
    );
    return sol.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: effectiveDecimals,
    });
  } catch (e) {
    return "Error";
  }
};

interface TransactionSummaryDisplayProps {
  simulationPreview?: DetailedTransactionPreview | null;
  suppressOwnErrorDisplay?: boolean;
}

const TransactionSummaryDisplay: React.FC<TransactionSummaryDisplayProps> = ({
  simulationPreview,
  suppressOwnErrorDisplay = false
}) => {
  const { t } = useTranslation();

  if (!simulationPreview) {
    return (
      <div className="p-3 rounded-lg bg-[#161E2D] border border-gray-700 text-sm">
        <p className="text-gray-400 text-xs text-center">
          {t('transactionSummary.loadingPreview')}
        </p>
      </div>
    );
  }

  if (suppressOwnErrorDisplay && !simulationPreview.simulationSuccess) {
    return (
      <div className="p-3 rounded-lg bg-[#161E2D] border border-red-700 text-center">
        <p className="text-xs text-red-300">
          {t('transactionSummary.simulationFailedSeeDetails')}
        </p>
      </div>
    );
  }

  if (!simulationPreview.simulationSuccess) {
    return (
      <div className="p-3 rounded-lg bg-[#161E2D] border border-red-700 space-y-1 text-sm">
        <div className="flex items-center text-red-400">
          <AlertCircle size={16} className="mr-1.5 shrink-0" />
          <h4 className="font-semibold text-sm">{t('transactionSummary.simulationErrorTitle')}</h4>
        </div>
        <p className="text-red-300 text-xs break-words bg-red-900/20 p-1.5 rounded">
          {simulationPreview.simulationError || t('transactionSummary.simulationErrorDefault')}
        </p>
      </div>
    );
  }

  const nonZeroChanges = simulationPreview.feePayerAssetChanges.filter(
    c => parseFloat(c.uiAmountChange) !== 0
  );
  const feePayerChangesToShow =
    nonZeroChanges.length > 0
      ? nonZeroChanges
      : simulationPreview.feePayerAssetChanges;

  const solChanges = feePayerChangesToShow.filter(c => c.mintAddress === 'SOL');
  const splChanges = feePayerChangesToShow.filter(c => c.mintAddress !== 'SOL');
  const totalEstimatedFeeDisplay = formatLamportsToSol(simulationPreview.totalEstimatedFeeLamports);

  return (
    <div className="space-y-2">
      {/* Balance Changes Rows */}
      {(solChanges.length > 0 || splChanges.length > 0) ? (
        <>
          {solChanges.map((change, idx) => (
            <SimulatedAssetChangeItem key={`sol-${idx}`} change={change} isFeePayer={true} />
          ))}
          {splChanges.map((change, idx) => (
            <SimulatedAssetChangeItem key={`spl-${change.mintAddress}-${idx}`} change={change} isFeePayer={true} />
          ))}
        </>
      ) : (
        <p className="text-xs text-gray-400 p-2 text-center bg-[#1A2433] rounded-md border border-gray-700">
          {t('transactionSummary.noDirectChanges')}
        </p>
      )}

      {/* Network Fee Row */}
      <div className="flex justify-between items-center p-2 bg-[#1A2433] rounded-md border border-gray-700">
        <p className="text-sm text-gray-300 font-medium">{t('transactionSummary.totalEstimatedFeeLabel')}</p>
        <p className="text-sm font-bold text-orange-300">
          {totalEstimatedFeeDisplay} SOL
        </p>
      </div>
    </div>
  );
};

export default TransactionSummaryDisplay;