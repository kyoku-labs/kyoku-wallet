// src/popup/views/ConfirmSwapTransactionView.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { useAppStore, SwapSuccessDetails } from '../../store/appStore';
import { DetailedTransactionPreview } from '../../background/shared/simulationParser';
import TransactionSummaryDisplay from '../confirmationApp/components/TransactionSummaryDisplay';
import { useTranslation } from 'react-i18next';

// Skeleton Loader Component for Transaction Summary
const TransactionSummarySkeleton: React.FC = () => (
    <div className="bg-[#161E2D] p-3 rounded-lg border border-gray-700/60 shadow-sm animate-pulse">
        {/* Mimicking Asset Changes */}
        <div className="space-y-3">
            <div className="flex justify-between items-center">
                <div className="h-5 bg-gray-700 rounded w-1/3"></div>
                <div className="h-5 bg-gray-700 rounded w-1/4"></div>
            </div>
            <div className="flex justify-between items-center">
                <div className="h-5 bg-gray-700 rounded w-1/3"></div>
                <div className="h-5 bg-gray-700 rounded w-1/4"></div>
            </div>
        </div>
        <div className="border-t border-gray-700/60 my-3"></div>
        {/* Mimicking Fee Display */}
        <div className="flex justify-between items-center">
            <div className="h-4 bg-gray-700 rounded w-1/4"></div>
            <div className="h-4 bg-gray-700 rounded w-1/5"></div>
        </div>
    </div>
);


const ConfirmSwapTransactionView: React.FC = () => {
  const { t } = useTranslation();
  const {
    transactionForConfirmation,
    activeAccount,
    setTransactionForConfirmation,
    setSwapSuccess,
    setSwapError,
    setView,
  } = useAppStore();

  const [simulationPreview, setSimulationPreview] = useState<DetailedTransactionPreview | null>(null);
  const [isLoadingSimulation, setIsLoadingSimulation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const swapContext = transactionForConfirmation?.actionContext?.type === 'swap'
    ? transactionForConfirmation.actionContext
    : null;

  useEffect(() => {
    if (transactionForConfirmation?.serializedTransaction && activeAccount?.publicKey) {
      setIsLoadingSimulation(true);
      setSimulationPreview(null);
      // console.log("[ConfirmSwapTxView] Optional: Simulating Jupiter transaction. Base64 (first 100 chars):", transactionForConfirmation.serializedTransaction.substring(0, 100));

      try {
        const transactionBytes = Uint8Array.from(atob(transactionForConfirmation.serializedTransaction), c => c.charCodeAt(0));
        chrome.runtime.sendMessage(
          {
            action: 'simulateTransactionForConfirmation',
            payload: {
              transactionBytes: Array.from(transactionBytes),
              feePayerPublicKeyString: activeAccount.publicKey,
            },
          },
          (response) => {
            setIsLoadingSimulation(false);
            if (response?.success && response.simulationPreview) {
              setSimulationPreview(response.simulationPreview as DetailedTransactionPreview);
              if (!response.simulationPreview.simulationSuccess) {
              //   console.warn("[ConfirmSwapTxView] Optional simulation indicates failure:", response.simulationPreview.simulationError, "Logs:", response.simulationPreview.rawSimulationResponse?.value.logs);
              } else {
                // console.log("[ConfirmSwapTxView] Optional simulation successful. Preview:", response.simulationPreview);
              }
            } else {
            //  console.error('[ConfirmSwapTxView] Failed to simulate transaction for fee estimation:', response?.error);
              setSimulationPreview({
                simulationSuccess: false,
                simulationError: response?.error || t('confirmSwap.errors.feeEstimationFailed'),
                feePayerAddress: activeAccount.publicKey,
                baseFeeLamports: "5000",
                priorityFeeLamports: "0",
                totalEstimatedFeeLamports: "5000",
                feePayerAssetChanges: [],
                otherAccountAssetChanges: [],
                alerts: [],
              });
            }
          }
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
      //  console.error("[ConfirmSwapTxView] Error decoding base64 transaction for simulation:", errorMsg);
        setIsLoadingSimulation(false);
        setSimulationPreview({
            simulationSuccess: false,
            simulationError: t('confirmSwap.errors.decodeFailed', { error: errorMsg.substring(0,100) }),
            feePayerAddress: activeAccount?.publicKey || t('common.notAvailable'),
            baseFeeLamports: "5000",
            priorityFeeLamports: "0",
            totalEstimatedFeeLamports: "5000",
            feePayerAssetChanges: [],
            otherAccountAssetChanges: [],
            alerts: [{ severity: 'warning', message: t('confirmSwap.errors.couldNotSimulateFee') }],
          });
      }
    }
  }, [transactionForConfirmation, activeAccount?.publicKey, t]);

  const handleReject = useCallback(() => {
    const sourceView = transactionForConfirmation?.sourceView || 'SWAP_VIEW';
    setTransactionForConfirmation(null);
    setView(sourceView);
  }, [transactionForConfirmation, setTransactionForConfirmation, setView]);

  const handleApprove = useCallback(async () => {
    if (!transactionForConfirmation?.serializedTransaction || !activeAccount) {
      setSwapError(t('confirmSwap.errors.missingDetailsOrAccount'));
      return;
    }

    setIsSubmitting(true);
    console.log("[ConfirmSwapTxView] User approved swap. Sending Jupiter's transaction to background.");

    const transactionToSignAndSend = transactionForConfirmation.serializedTransaction;

    chrome.runtime.sendMessage(
      {
        action: 'signAndSendSwapTransaction',
        payload: { base64EncodedTransaction: transactionToSignAndSend },
      },
      (response) => {
        setIsSubmitting(false);
        if (response?.success && response.signature) {
          console.log("[ConfirmSwapTxView] Swap transaction successful. Signature:", response.signature);
          const successDetails: SwapSuccessDetails = {
            signature: response.signature,
            inputAmount: swapContext?.inputTokenAmount || t('common.notAvailable'),
            inputSymbol: swapContext?.inputTokenSymbol,
            expectedOutputAmount: swapContext?.outputTokenAmount,
            outputSymbol: swapContext?.outputTokenSymbol,
          };
          setSwapSuccess(successDetails);
        } else {
          const errorMsg = response?.error || t('confirmSwap.errors.swapFailedToSend');
          console.error("[ConfirmSwapTxView] Swap transaction failed:", errorMsg);
          setSwapError(errorMsg);
        }
      }
    );
  }, [transactionForConfirmation, activeAccount, swapContext, setSwapSuccess, setSwapError, t]);

  if (!transactionForConfirmation || !swapContext) {
    return (
      <div className="flex flex-col h-full bg-[#090f14] p-4 text-white items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-blue-400 mb-3" />
        <p>{t('confirmSwap.loadingDetails')}</p>
        <button onClick={handleReject} className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm">
          {t('buttons.cancel')}
        </button>
      </div>
    );
  }

  const isApproveDisabled = isSubmitting || (isLoadingSimulation && !simulationPreview);
  const simulationFailedOurSide = simulationPreview && !simulationPreview.simulationSuccess;

  return (
    <div className="flex flex-col h-full bg-[#090f14] text-gray-200">
      <div className="flex items-center justify-between p-4 border-b border-[#243B55] flex-shrink-0 relative h-14">
        <button
          onClick={handleReject}
          className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2 z-10"
          aria-label={t('confirmSwap.ariaLabels.rejectTransaction')}
          disabled={isSubmitting}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
          {t('confirmSwap.title')}
        </h2>
      </div>

      <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {isLoadingSimulation && !simulationPreview ? (
            <TransactionSummarySkeleton />
        ) : null}

        {!isLoadingSimulation && simulationPreview && (
          <TransactionSummaryDisplay
            simulationPreview={simulationPreview}
            suppressOwnErrorDisplay={true}
          />
        )}
        
        {simulationFailedOurSide && (
             <div className="bg-red-800/30 border border-red-600/70 p-3 rounded-md text-red-300 text-xs space-y-1">
                 <div className="flex items-center font-medium">
                     <AlertTriangle size={16} className="mr-2"/> {t('confirmSwap.ourSimulationFailedTitle')}
                 </div>
                 <p>{simulationPreview?.simulationError || t('confirmSwap.errors.couldNotVerifyLocally')}</p>
                  {simulationPreview?.rawSimulationResponse?.value.logs && (
                      <details className="mt-1 text-gray-400">
                          <summary className="cursor-pointer hover:underline text-xs">{t('confirmSwap.showLogs')}</summary>
                          <pre className="mt-1 p-1.5 bg-black/30 rounded text-[10px] max-h-24 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                              {simulationPreview.rawSimulationResponse.value.logs.join('\n')}
                          </pre>
                      </details>
                  )}
             </div>
        )}
      </div>

      <div className="p-3 border-t border-[#243B55] space-y-2 flex-shrink-0">
        <button
          onClick={handleApprove}
          disabled={isApproveDisabled && !simulationFailedOurSide}
          className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isSubmitting ? <Loader2 size={20} className="animate-spin mr-2" /> : null}
          {isSubmitting ? t('common.processing') : (simulationFailedOurSide ? t('buttons.approveAnywayRisky') : t('buttons.approve'))}
        </button>
        {!isSubmitting && (
            <button
                onClick={handleReject}
                className="w-full py-2.5 px-4 rounded-lg font-medium text-gray-300 bg-transparent hover:bg-[#2A3447] transition-colors"
            >
                {t('buttons.reject')}
            </button>
        )}
      </div>
    </div>
  );
};

export default ConfirmSwapTransactionView;