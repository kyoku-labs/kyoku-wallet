// src/popup/views/SwapSuccessView.tsx
import React from 'react';
import { CheckCircle, ExternalLink } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { getExplorerById, buildClusterQueryParam, DEFAULT_EXPLORER_ID } from '../../utils/explorerUtils';
import { useTranslation } from 'react-i18next'; // Import useTranslation

const SwapSuccessView: React.FC = () => {
  const { t } = useTranslation(); // Initialize useTranslation
  const { swapSuccessDetails, setSwapSuccess, setView, preferredExplorerId, network, customRpcUrl } = useAppStore();

  if (!swapSuccessDetails) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-white bg-[#090f14]">
        <p>{t('swapSuccessView.noDetailsFound')}</p> {/* Translate */}
        <button onClick={() => setView('SWAP_VIEW')} className="mt-4 px-6 py-2 bg-blue-600 rounded-lg">
          {t('swapSuccessView.buttons.newSwap')} {/* Translate */}
        </button>
      </div>
    );
  }

  const explorer = getExplorerById(preferredExplorerId) || getExplorerById(DEFAULT_EXPLORER_ID);
  const explorerLink = explorer 
    ? explorer.urlPattern.replace('{signature}', swapSuccessDetails.signature).replace('{clusterQueryParam}', buildClusterQueryParam(network, customRpcUrl))
    : '#';


  const handleDone = () => {
    setSwapSuccess(null);
    setView('DASHBOARD');
  };

  const handleNewSwap = () => {
    setSwapSuccess(null);
    setView('SWAP_VIEW');
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-5 text-white bg-[#090f14]">
      <CheckCircle size={64} className="text-green-500" />
      <h2 className="text-2xl font-bold">{t('swapSuccessView.title')}</h2> {/* Translate */}
      <div className="text-sm text-gray-300 space-y-1">
        <p>
            {t('swapSuccessView.swappedMessage', { // Translate with interpolation
                amount: swapSuccessDetails.inputAmount,
                symbol: swapSuccessDetails.inputSymbol || t('common.tokensFallback')
            })}
        </p>
        <p>
            {t('swapSuccessView.forEstimatedMessage', { // Translate with interpolation
                amount: swapSuccessDetails.expectedOutputAmount,
                symbol: swapSuccessDetails.outputSymbol || t('common.tokensFallback')
            })}
        </p>
      </div>
      <div className="w-full max-w-xs p-3 bg-[#161E2D] rounded-md border border-gray-700 text-xs text-gray-400 font-mono break-all">
        {t('swapSuccessView.transactionIdLabel')}: {swapSuccessDetails.signature.substring(0,12)}...{swapSuccessDetails.signature.substring(swapSuccessDetails.signature.length - 12)} {/* Translate */}
      </div>
      {explorer && (
        <a
          href={explorerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center text-blue-400 hover:text-blue-300 hover:underline text-sm"
        >
          {t('activityDetails.viewOnExplorer', { explorerName: explorer.name || t('common.explorer') })} {/* Reusing existing key */}
          <ExternalLink size={14} className="ml-1.5" />
        </a>
      )}
      <div className="w-full max-w-xs space-y-2 pt-3">
        <button onClick={handleDone} className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">
          {t('buttons.done')} {/* Translate */}
        </button>
        <button onClick={handleNewSwap} className="w-full py-2.5 px-4 rounded-lg font-semibold text-gray-300 hover:bg-[#2A3447]">
          {t('swapSuccessView.buttons.newSwap')} {/* Translate */}
        </button>
      </div>
    </div>
  );
};

export default SwapSuccessView;