// src/popup/views/send/TransactionConfirmView.tsx
import React from 'react';
import { TokenInfo } from '../../../background/core/keyring/types';
import { formatTokenBalance } from '../../../utils/formatters';
import { useAppStore } from '../../../store/appStore';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

const truncateAddress = (address: string, chars = 8): string => {
  if (!address) return '...';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.substring(0, chars)}...${address.substring(address.length - chars)}`;
};

interface TransactionDetailsForConfirmation {
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  token: TokenInfo;
  estimatedFeeLamports?: number;
}

interface TransactionConfirmViewProps {
  details: TransactionDetailsForConfirmation;
  onConfirm: () => void;
  onReject: () => void;
  isSendingTransaction: boolean;
}

const TransactionConfirmView: React.FC<TransactionConfirmViewProps> = ({
  details,
  onConfirm,
  onReject,
  isSendingTransaction,
}) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const { token, recipientAddress, amount, senderAddress, estimatedFeeLamports } = details;
  const numericAmount = parseFloat(amount);
  const network = useAppStore((s) => s.network);
  const customRpcUrl = useAppStore((s) => s.customRpcUrl);

  const displayNetwork = network === 'custom'
    ? (customRpcUrl ? truncateAddress(customRpcUrl, 20) : t('transactionConfirm.customRpcLabel')) // Translate
    : network.charAt(0).toUpperCase() + network.slice(1);

  const renderTokenLogo = () => {
    const altText = t('itemList.tokenLogoAlt', { tokenSymbol: token.symbol || token.name || t('sendView.tokenFallback') }); // Using existing keys
    if (token.logo) {
      return <img src={token.logo} alt={altText} className="w-8 h-8 rounded-full mr-2 object-cover" />;
    }
    return (
      <div className="w-8 h-8 rounded-full bg-[#4A5568] flex items-center justify-center mr-2 text-sm shrink-0">
        {token.symbol ? token.symbol.charAt(0) : '?'}
      </div>
    );
  };

  const isFeeReadyForConfirmation = estimatedFeeLamports !== undefined && estimatedFeeLamports !== -1;

  const getFeeDisplay = () => {
    if (typeof estimatedFeeLamports === 'undefined') {
      return (
        <span className="text-sm text-gray-500 italic">{t('transactionConfirm.calculatingFee')}</span> // Translate
      );
    }
    if (estimatedFeeLamports === -1) {
      return (
        <div className="flex items-center text-red-400 text-sm">
          <AlertTriangle size={14} className="mr-1 shrink-0" />
          <span>{t('transactionConfirm.feeUnavailable')}</span> {/* Translate */}
        </div>
      );
    }
    const feeInSol = (estimatedFeeLamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
      minimumFractionDigits: 9,
      maximumFractionDigits: 9
    });
    return <span className="text-sm text-white">~{feeInSol} SOL</span>;
  };

  return (
    <div className="flex flex-col p-4 h-full bg-[#090f14] text-[#F5F5F5] space-y-5">
      <div className="bg-[#2A3447] p-4 rounded-lg space-y-3 border border-[#4A5568]">
        <div className="text-center">
          <p className="text-gray-400 text-sm">{t('transactionConfirm.youAreSending')}</p> {/* Translate */}
          <div className="flex items-center justify-center my-1">
            {renderTokenLogo()}
            <span className="text-3xl font-bold text-white">
              {formatTokenBalance(numericAmount, token.decimals)} {token.symbol}
            </span>
          </div>
          {token.name && <p className="text-xs text-gray-500">({token.name})</p>}
        </div>

        <hr className="border-t border-gray-600 my-3" />

        <div className="flex justify-between items-start">
          <span className="text-sm text-gray-400">{t('transactionConfirm.fromLabel')}:</span> {/* Translate */}
          <div className="text-right">
            {/* title attribute removed */}
            <span className="text-sm text-white font-mono block"> 
              {truncateAddress(senderAddress)}
            </span>
            <span className="text-xs text-gray-500">({t('transactionConfirm.yourWalletLabel')})</span> {/* Translate */}
          </div>
        </div>

        <div className="flex justify-between items-start">
          <span className="text-sm text-gray-400">{t('transactionConfirm.toLabel')}:</span> {/* Translate */}
          {/* title attribute removed */}
          <span className="text-sm text-white font-mono block text-right">
            {truncateAddress(recipientAddress)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">{t('transactionConfirm.networkLabel')}:</span> {/* Translate */}
          {/* title attribute removed */}
          <span className="text-sm text-white capitalize"> 
            {displayNetwork}
          </span>
        </div>

        <div className="flex justify-between items-center min-h-[1.5rem]">
          <span className="text-sm text-gray-400">{t('transactionConfirm.networkFeeLabel')}:</span> {/* Translate */}
          {getFeeDisplay()}
        </div>
      </div>

      <p className="text-xs text-yellow-400 text-center p-2 bg-yellow-900/30 rounded-md border border-yellow-700">
        {t('transactionConfirm.warningIrreversible')} {/* Translate */}
      </p>

      <div className="mt-auto space-y-3 pt-3">
        <button
          onClick={onConfirm}
          disabled={!isFeeReadyForConfirmation || isSendingTransaction}
          className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isSendingTransaction ? (
            <>
              <Loader2 size={20} className="animate-spin mr-2" />
              {t('transactionConfirm.buttons.sending')} {/* Translate */}
            </>
          ) : (
            t('transactionConfirm.buttons.confirmAndSend') // Translate
          )}
        </button>
        <button
          onClick={onReject}
          disabled={isSendingTransaction}
          className="w-full py-3 px-4 rounded-lg font-semibold text-gray-300 bg-transparent hover:bg-[#2A3447] disabled:opacity-50"
        >
          {t('buttons.reject')} {/* Translate, using existing key from ActionButtonsRow */}
        </button>
      </div>
    </div>
  );
};

export default TransactionConfirmView;