// src/popup/views/send/SendView.tsx
import React, { useState, useCallback, useEffect } from 'react';
import TokenSelectView from './TokenSelectView';
import SendFormView from './SendFormView';
import TransactionConfirmView from './TransactionConfirmView';
import { TokenInfo } from '../../../background/core/keyring/types';
import { useAppStore } from '../../../store/appStore';
import { ArrowLeft, CheckCircle, ExternalLink, Copy, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getExplorerById, buildClusterQueryParam, DEFAULT_EXPLORER_ID } from '../../../utils/explorerUtils';
import { usePortfolio } from '../../../hooks/usePortfolio';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface TransactionDetailsForConfirmation {
  recipientAddress: string;
  amount: string;
  token: TokenInfo;
  senderAddress: string;
  estimatedFeeLamports?: number;
}

interface SendViewProps {
  onClose: () => void;
}

const SendView: React.FC<SendViewProps> = ({ onClose }) => {
  const { t } = useTranslation(); // Initialize useTranslation
  type SendStep = 'select' | 'form' | 'confirm' | 'success' | 'error_sending';
  
  const { 
    sendViewInitialToken, 
    setSendViewInitialToken, 
    activeAccount, 
    allAccounts, 
    network: currentNetwork, 
    customRpcUrl: currentCustomRpcUrl, 
    preferredExplorerId,
    setError: setAppError,
    currentView
  } = useAppStore();

  const { 
    portfolio: tokens,
    isLoading: initialTokensLoading,
    error: portfolioError,
  } = usePortfolio();

  const [step, setStep] = useState<SendStep>(sendViewInitialToken ? 'form' : 'select');
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(sendViewInitialToken);
  
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetailsForConfirmation | null>(null);
  const [finalTransactionSignature, setFinalTransactionSignature] = useState<string | null>(null);
  const [sendErrorDetails, setSendErrorDetails] = useState<string | null>(null);
  const [copiedSignature, setCopiedSignature] = useState(false);
  const [isSendingTransaction, setIsSendingTransaction] = useState(false);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    if (currentView === 'SEND_FLOW' && sendViewInitialToken) {
      setSelectedToken(sendViewInitialToken);
      setStep('form');
      setSendViewInitialToken(null); 
    } else if (currentView === 'SEND_FLOW' && !sendViewInitialToken && step !== 'select') {
      if (step === 'form' && !selectedToken) {
          setStep('select');
      }
    }
  }, [currentView, sendViewInitialToken, setSendViewInitialToken, step, selectedToken]);

  useEffect(() => {
    const validSteps: SendStep[] = ['select', 'form', 'confirm', 'success', 'error_sending'];
    if (!validSteps.includes(step)) {
    //  console.warn("[SendView] Invalid step detected, resetting to 'select'. Current step:", step);
      setStep('select');
      setSelectedToken(null);
      setTransactionDetails(null);
      setFinalTransactionSignature(null);
      setSendErrorDetails(t('sendView.errors.unexpectedError')); // Translate
      setIsSendingTransaction(false);
    }
  }, [step, t]);

  const handleTokenSelect = (token: TokenInfo) => {
    setSelectedToken(token);
    setStep('form');
    setSendErrorDetails(null);
    setAppError(null);
  };

  const resetSendFlowState = useCallback(() => {
    setSelectedToken(null);
    setTransactionDetails(null);
    setFinalTransactionSignature(null);
    setSendErrorDetails(null);
    setCopiedSignature(false);
    setIsSendingTransaction(false);
    setAppError(null);
    setSendViewInitialToken(null);
  }, [setAppError, setSendViewInitialToken]);

  const handleBack = useCallback(() => {
    setSendErrorDetails(null);
    if (isSendingTransaction) { 
      setIsSendingTransaction(false); 
      setStep('confirm'); 
      return; 
    }
    switch (step) {
      case 'success': 
      case 'error_sending': 
        resetSendFlowState(); 
        setStep('select'); 
        onClose(); 
        break;
      case 'confirm':
        setStep('form');
        setTransactionDetails(prev => prev ? { ...prev, estimatedFeeLamports: undefined } : null);
        break;
      case 'form': 
        setStep('select'); 
        setSelectedToken(null); 
        setTransactionDetails(null); 
        break;
      default: 
        resetSendFlowState();
        onClose(); 
        break;
    }
  }, [step, onClose, resetSendFlowState, isSendingTransaction]);

  const stepRef = React.useRef(step);
  const transactionDetailsRef = React.useRef(transactionDetails);
  useEffect(() => {
    stepRef.current = step;
    transactionDetailsRef.current = transactionDetails;
  }, [step, transactionDetails]);

  const handleReviewTransaction = useCallback((detailsFromForm: {
    recipientAddress: string;
    amount: string;
    token: TokenInfo;
  }) => {
    if (!activeAccount || activeAccount.isViewOnly) {
      setSendErrorDetails(activeAccount ? t('sendView.errors.sendFromViewOnly') : t('sendView.errors.activeAccountNotFound')); // Translate
      setStep('error_sending'); return;
    }
    setSendErrorDetails(null);

    const initialDetails: TransactionDetailsForConfirmation = {
      ...detailsFromForm,
      senderAddress: activeAccount.publicKey,
      estimatedFeeLamports: undefined 
    };
    setTransactionDetails(initialDetails);
    setStep('confirm'); 

    const feePayload = {
      recipientAddress: detailsFromForm.recipientAddress,
      amountLamports: BigInt(Math.round(parseFloat(detailsFromForm.amount) * (10 ** detailsFromForm.token.decimals))).toString(),
      tokenMintAddress: detailsFromForm.token.isNative ? null : detailsFromForm.token.address,
      tokenDecimals: detailsFromForm.token.decimals,
      senderAddress: activeAccount.publicKey
    };

    chrome.runtime.sendMessage({ action: 'getEstimatedTransactionFee', payload: feePayload }, (response) => {
      if (stepRef.current === 'confirm' &&
          transactionDetailsRef.current?.recipientAddress === detailsFromForm.recipientAddress &&
          transactionDetailsRef.current?.amount === detailsFromForm.amount) {
        if (chrome.runtime.lastError || !response?.success || typeof response.feeLamports !== 'number') {
          const errMsg = t('sendView.errors.feeEstimationFailed', { error: chrome.runtime.lastError?.message || response?.error || t('common.unknownError')}); // Translate
          setTransactionDetails(prev => prev ? { ...prev, estimatedFeeLamports: -1 } : null);
          setSendErrorDetails(errMsg);
        } else {
          setTransactionDetails(prev => prev ? { ...prev, estimatedFeeLamports: response.feeLamports } : null);
          setSendErrorDetails(null);
        }
      } else {
      //  console.log("[SendView] Fee estimation callback received, but view/details changed or not on confirm step. Ignoring.");
      }
    });
  }, [activeAccount, t]);

  const handleActualConfirmAndSend = useCallback(() => {
    if (!transactionDetails || transactionDetails.estimatedFeeLamports === undefined || transactionDetails.estimatedFeeLamports === -1) {
      setSendErrorDetails(t('sendView.errors.feeNotReady')); // Translate
      setStep('error_sending'); return;
    }
    setIsSendingTransaction(true); setSendErrorDetails(null);
    const payload = {
      recipientAddress: transactionDetails.recipientAddress,
      amountLamports: BigInt(Math.round(parseFloat(transactionDetails.amount) * (10 ** transactionDetails.token.decimals))).toString(),
      tokenMintAddress: transactionDetails.token.isNative ? null : transactionDetails.token.address,
      tokenDecimals: transactionDetails.token.decimals
    };
    chrome.runtime.sendMessage({ action: 'prepareAndSendTransaction', payload }, (response) => {
      setIsSendingTransaction(false);
      if (chrome.runtime.lastError || !response?.success || !response.signature) {
        const errMsg = t('sendView.errors.transactionFailed', {error: chrome.runtime.lastError?.message || response?.error || t('common.unknownError')}); // Translate
        setSendErrorDetails(errMsg); setStep('error_sending'); return;
      }
      setFinalTransactionSignature(response.signature); setStep('success');
      if (activeAccount) { 
        queryClient.invalidateQueries({ queryKey: ['portfolio', activeAccount.publicKey, currentNetwork, currentCustomRpcUrl] }); 
      }
    });
  }, [transactionDetails, activeAccount, queryClient, currentNetwork, currentCustomRpcUrl, t]);

  const getExplorerUrl = (signature: string): string => {
    const explorer = getExplorerById(preferredExplorerId) || getExplorerById(DEFAULT_EXPLORER_ID);
    if (!explorer) return `https://solscan.io/tx/${signature}`; // Fallback
    const clusterQuery = buildClusterQueryParam(currentNetwork, currentCustomRpcUrl);
    let finalClusterQueryParam = clusterQuery;
    if (explorer.id === 'solanabeach' && finalClusterQueryParam.startsWith('?')) {
      finalClusterQueryParam = `&${finalClusterQueryParam.substring(1)}`;
    }
    return explorer.urlPattern.replace('{signature}', signature).replace('{clusterQueryParam}', finalClusterQueryParam);
  };

  const copySignatureToClipboard = () => {
    if (finalTransactionSignature) { navigator.clipboard.writeText(finalTransactionSignature).then(() => { setCopiedSignature(true); setTimeout(() => setCopiedSignature(false), 2000); }); }
  };

  const getHeaderTitle = () => {
    if (isSendingTransaction) return t('sendView.headers.processingTransaction');
    switch (step) {
      case 'select': return t('sendView.headers.selectToken');
      case 'form': return t('sendView.headers.sendToken', { tokenSymbol: selectedToken?.symbol || t('sendView.tokenFallback') });
      case 'confirm': return t('sendView.headers.confirmTransaction');
      case 'success': return t('sendView.headers.transactionSent');
      case 'error_sending': return t('sendView.headers.transactionFailed');
      default: return t('sendView.headers.send');
    }
  };

  let currentStepComponent;
  switch (step) {
    case 'select':
      currentStepComponent = (
        portfolioError ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-red-400">
            <AlertTriangle size={32} className="mb-3" />
            <p>{t('sendView.errors.errorLoadingTokens')}</p>
            <p className="text-xs mt-1">{portfolioError}</p>
          </div>
        ) : (
          <TokenSelectView 
            tokens={tokens}
            isLoading={initialTokensLoading}
            onTokenSelect={handleTokenSelect} 
          />
        )
      );
      break;
    case 'form':
      currentStepComponent = (selectedToken && activeAccount) ? (<SendFormView token={selectedToken} onBack={handleBack} onReviewTransaction={handleReviewTransaction} currentUserAccounts={allAccounts.filter(acc => acc.publicKey !== activeAccount.publicKey)} senderAddress={activeAccount.publicKey} />) : (<p className="p-4 text-center text-gray-400">{t('sendView.loadingForm')}</p>);
      if (!selectedToken && !initialTokensLoading && step === 'form') {
        if (!portfolioError) {
          //  console.warn("[SendView] In 'form' step without a selected token and not loading. Resetting to select.");
            setStep('select');
        }
      }
      break;
    case 'confirm':
      currentStepComponent = transactionDetails ? (<TransactionConfirmView details={transactionDetails} onConfirm={handleActualConfirmAndSend} onReject={handleBack} isSendingTransaction={isSendingTransaction} />) : (<p className="p-4 text-center text-gray-400">{t('sendView.loadingTransactionDetails')}</p>);
      if (step === 'confirm' && !isSendingTransaction && !transactionDetails) {
       //   console.warn("[SendView] transactionDetails is null on confirm step (and not sending). Resetting to form.");
          setStep('form');
      }
      break;
    case 'success':
      currentStepComponent = (
        <div className="flex flex-col items-center justify-center p-6 text-center h-full space-y-6">
          <CheckCircle size={64} className="text-green-500" />
          <h3 className="text-2xl font-semibold text-white">{t('sendView.success.title')}</h3>
          <p className="text-sm text-gray-400">{t('sendView.success.message')}</p>
          {finalTransactionSignature && (<div className="w-full p-3 bg-[#2A3447] rounded-md border border-[#4A5568] text-xs text-gray-300 break-all"> <span className="font-mono">{finalTransactionSignature}</span> <button onClick={copySignatureToClipboard} className="ml-2 p-1 text-gray-400 hover:text-white" aria-label={copiedSignature ? t('common.copied') : t('common.copy')}> {copiedSignature ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />} </button> </div>)}
          {finalTransactionSignature && (<a href={getExplorerUrl(finalTransactionSignature)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center text-blue-400 hover:text-blue-300 hover:underline text-sm"> {t('sendView.success.viewOnExplorer', { explorerName: (getExplorerById(preferredExplorerId) || getExplorerById(DEFAULT_EXPLORER_ID))?.name || 'Explorer' })} <ExternalLink size={14} className="ml-1" /> </a>)}
          <button onClick={handleBack} className="w-full max-w-xs mt-4 py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">{t('buttons.done')}</button>
        </div>
      );
      break;
    case 'error_sending':
      currentStepComponent = (
        <div className="flex flex-col items-center justify-center p-6 text-center h-full space-y-5">
          <XCircle size={60} className="text-red-500 mb-3" />
          <h3 className="text-2xl font-semibold text-white">{t('sendView.errorSending.title')}</h3>
          <p className="text-sm text-red-300 bg-red-700/20 p-3 rounded-md border border-red-600/50 w-full break-words max-h-40 overflow-y-auto custom-scrollbar">{sendErrorDetails || t('sendView.errors.unknownErrorOccurred')}</p>
          <div className="w-full max-w-xs space-y-2 mt-4">
            <button onClick={() => { setSendErrorDetails(null); setStep(transactionDetails && transactionDetails.recipientAddress ? 'confirm' : 'form'); }} className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">{t('buttons.tryAgain')}</button>
            <button onClick={handleBack} className="w-full py-2 px-4 rounded-lg font-semibold text-gray-300 hover:bg-[#2A3447]">{t('buttons.close')}</button>
          </div>
        </div>
      );
      break;
    default:
      currentStepComponent = <p className="p-4 text-center text-gray-400">{t('sendView.loadingState')}</p>;
  }

  return (
    <div className="flex flex-col h-full bg-[#090f14] text-[#F5F5F5] relative">
      <div className="p-4 border-b border-[#4A5568] flex items-center justify-between relative flex-shrink-0">
        <button
          onClick={handleBack}
          disabled={isSendingTransaction && step === 'confirm'}
          className="p-1 text-gray-300 hover:text-white absolute left-4 top-1/2 -translate-y-1/2 disabled:opacity-50"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        {/* title attribute removed */}
        <h2 className="text-lg font-medium text-center flex-grow px-10 truncate">
          {getHeaderTitle()}
        </h2>
        <div className="w-5 h-5"></div> {/* Spacer */}
      </div>

      <div className="flex-grow overflow-y-auto p-1">
        {currentStepComponent}
      </div>

      {isSendingTransaction && step !== 'confirm' && (
        <div className="absolute inset-0 bg-[#090f14]/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
          <Loader2 size={48} className="text-blue-400 animate-spin" />
          <p className="mt-4 text-lg text-white text-center">
            {t('sendView.headers.processingTransaction')}
          </p>
        </div>
      )}
    </div>
  );
};

export default SendView;