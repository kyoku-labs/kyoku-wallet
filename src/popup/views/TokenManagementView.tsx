// src/popup/views/TokenManagementView.tsx
import React, { useMemo, useCallback } from 'react';
import { TokenInfo } from '../../background/core/keyring/types';
import { useTokenPreferences } from '../../hooks/useTokenPreferences';
import { useAppStore } from '../../store/appStore';
import { usePortfolio } from '../../hooks/usePortfolio';
import { AlertTriangle, ArrowLeft } from 'lucide-react'; // Added ArrowLeft
import { useTranslation } from 'react-i18next';

// Helper to render token logo (remains the same)
const renderTokenLogo = (token: TokenInfo, t: Function) => {
    const altText = t('itemList.tokenLogoAlt', { tokenSymbol: token.symbol || t('tokenManagement.fallbackTokenName') });
    if (token.logo) {
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mr-3 flex-shrink-0">
            <img
              src={token.logo}
              alt={altText}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                    parent.classList.add('bg-[#4A5568]');
                    const textElement = document.createElement('span');
                    textElement.className = 'text-lg text-white font-bold';
                    textElement.textContent = token.symbol ? token.symbol.slice(0, 1).toUpperCase() : '?';
                    parent.appendChild(textElement);
                }
              }}
            />
          </div>
        );
      }
    return (
      <div className="w-8 h-8 rounded-full bg-[#4A5568] flex items-center justify-center mr-3 text-lg text-white font-bold flex-shrink-0">
        {token.symbol?.slice(0, 1).toUpperCase() || '?'}
      </div>
    );
 };

interface TokenManagementViewProps {
  onClose: () => void;
}

const TokenManagementView: React.FC<TokenManagementViewProps> = ({
  onClose,
}) => {
  const { t } = useTranslation();
  const activeAccount = useAppStore(s => s.activeAccount);
  const walletId = activeAccount?.uuid || 'default_tmv_wallet_id';

  const { 
    portfolio, 
    isLoading: isLoadingPortfolio, 
    error: portfolioError 
  } = usePortfolio();

  const { preferences, updatePreferences } = useTokenPreferences(walletId);

  const allNonNativeTokens = useMemo(() => {
    if (!portfolio) return null;
    return portfolio.filter(token => !token.isNative);
  }, [portfolio]);

  const tokensAvailableForToggling = useMemo(() => {
    if (!allNonNativeTokens) return [];
    if (preferences.showSpamTokens) {
      return allNonNativeTokens;
    }
    return allNonNativeTokens.filter(token => {
      let isSpam = false;
      if (!token.logo) {
        isSpam = !token.usdPrice || !token.symbol || !token.name;
      }
      return !isSpam;
    });
  }, [allNonNativeTokens, preferences.showSpamTokens]);

  const displayedTokensInList = useMemo(() => {
    return tokensAvailableForToggling.filter(token => {
        const usdValue = token.usdPrice && typeof token.balance === 'number' ? token.usdPrice * token.balance : 0;
        if (preferences.hideLowBalances && usdValue < 1) {
            return !preferences.hiddenTokens.includes(token.address);
        }
        return true;
    });
  }, [tokensAvailableForToggling, preferences.hideLowBalances, preferences.hiddenTokens]);

  const handleToggleShowSpam = useCallback(() => {
    updatePreferences({ showSpamTokens: !preferences.showSpamTokens });
  }, [preferences.showSpamTokens, updatePreferences]);

  const handleToggleHideLowBalances = useCallback(() => {
    updatePreferences({ hideLowBalances: !preferences.hideLowBalances });
  }, [preferences.hideLowBalances, updatePreferences]);

  const handleToggleTokenVisibility = useCallback((address: string) => {
    const newHiddenTokens = preferences.hiddenTokens.includes(address)
      ? preferences.hiddenTokens.filter(a => a !== address)
      : [...preferences.hiddenTokens, address];
    updatePreferences({ hiddenTokens: newHiddenTokens });
  }, [preferences.hiddenTokens, updatePreferences]);

  const handleHideAllDisplayable = useCallback(() => {
    if (tokensAvailableForToggling) {
      const allDisplayableAddresses = tokensAvailableForToggling.map(token => token.address);
      const newHiddenTokens = Array.from(new Set([...preferences.hiddenTokens, ...allDisplayableAddresses]));
      updatePreferences({ hiddenTokens: newHiddenTokens });
    }
  }, [tokensAvailableForToggling, preferences.hiddenTokens, updatePreferences]);

  const handleShowAllDisplayable = useCallback(() => {
    if (tokensAvailableForToggling) {
        const displayableAddressesSet = new Set(tokensAvailableForToggling.map(token => token.address));
        const newHiddenTokens = preferences.hiddenTokens.filter(address => !displayableAddressesSet.has(address));
        updatePreferences({ hiddenTokens: newHiddenTokens });
    }
  }, [tokensAvailableForToggling, preferences.hiddenTokens, updatePreferences]);

  return (
    // MODIFIED: Main container background and text color
    <div className="flex flex-col h-full bg-[#090f14] text-white">
      {/* MODIFIED: Header styling and structure */}
      <div className="flex items-center p-4 border-b border-[#243B55] relative flex-shrink-0 h-14">
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white absolute left-4 top-1/2 transform -translate-y-1/2"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-center text-[#A8DADC] absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
          {t('tokenManagement.headerTitle')}
        </h2>
        {/* Optional: Add a spacer if right-side elements are ever added to this specific header */}
      </div>

      {/* MODIFIED: Content area padding */}
      <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
        {/* MODIFIED: Toggle containers background and border */}
        <div className="mb-3 p-3 bg-[#161E2D] rounded-lg border border-[#334155]">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-sm text-white">{t('tokenManagement.spamToggle.label')}</span>
            <div
              className={`w-10 h-5 rounded-full p-0.5 cursor-pointer flex items-center ${preferences.showSpamTokens ? 'bg-green-500 justify-end' : 'bg-gray-600 justify-start'}`}
              onClick={handleToggleShowSpam}
              role="switch"
              aria-checked={preferences.showSpamTokens}
              tabIndex={0}
              onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleShowSpam();}}
              aria-label={t('tokenManagement.spamToggle.label')}
            >
              <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {t('tokenManagement.spamToggle.description')}
          </p>
        </div>

        {/* MODIFIED: Toggle containers background and border */}
        <div className="mb-6 p-3 bg-[#161E2D] rounded-lg border border-[#334155]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-white">{t('tokenManagement.lowBalanceToggle.label')}</span>
            <div
              className={`w-10 h-5 rounded-full p-0.5 cursor-pointer flex items-center ${preferences.hideLowBalances ? 'bg-green-500 justify-end' : 'bg-gray-600 justify-start'}`}
              onClick={handleToggleHideLowBalances}
              role="switch"
              aria-checked={preferences.hideLowBalances}
              tabIndex={0}
              onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleHideLowBalances();}}
              aria-label={t('tokenManagement.lowBalanceToggle.label')}
            >
              <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
            </div>
          </div>
        </div>

        <div className="mb-4 border-t border-b border-[#334155] py-3">
          <p className="text-xs text-gray-400 mb-2 px-1">
            {preferences.showSpamTokens 
              ? t('tokenManagement.individualManagementInfo.withSpam') 
              : t('tokenManagement.individualManagementInfo.withoutSpam')}
          </p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleHideAllDisplayable}
              disabled={!tokensAvailableForToggling || tokensAvailableForToggling.length === 0}
              className="text-blue-400 text-xs hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              {t('tokenManagement.buttons.hideAllBelow')}
            </button>
            <button
              onClick={handleShowAllDisplayable}
              disabled={
                !tokensAvailableForToggling || 
                tokensAvailableForToggling.every(token => !preferences.hiddenTokens.includes(token.address))
              }
              className="text-blue-400 text-xs hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              {t('tokenManagement.buttons.showAllBelow')}
            </button>
          </div>
        </div>
        
        {isLoadingPortfolio && <p className="text-center text-gray-500 py-2">{t('tokenManagement.loadingTokens')}</p>}
        {portfolioError && (
          <div className="p-3 my-2 bg-red-900/30 border border-red-700 text-red-300 rounded-lg text-center text-sm">
            <AlertTriangle size={16} className="inline mr-2" />
            {t('tokenManagement.errors.loadFailed', { error: portfolioError })}
          </div>
        )}

        {!isLoadingPortfolio && !portfolioError && (
          <div className="space-y-2">
            {allNonNativeTokens && tokensAvailableForToggling.length === 0 && (
              <p className="text-center text-gray-500 py-2 px-1">
                {preferences.showSpamTokens ? t('tokenManagement.emptyState.noNonNativeTokens') : t('tokenManagement.emptyState.noNonSpamToManage')}
              </p>
            )}
            {/* MODIFIED: List items background and border */}
            {displayedTokensInList.map((token) => (
              <div
                key={token.address}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[#2A3447] bg-[#161E2D] border border-[#334155]"
              >
                <div className="flex items-center min-w-0">
                  {renderTokenLogo(token, t)}
                  <div className="ml-2 min-w-0">
                    <div className="font-medium text-sm truncate text-white">{token.name || t('tokenManagement.fallbackTokenName')}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {token.symbol || token.address.slice(0, 6) + '...' + token.address.slice(-4)}
                    </div>
                  </div>
                </div>
                <div
                  className={`w-10 h-5 rounded-full p-0.5 cursor-pointer flex items-center ${
                    preferences.hiddenTokens.includes(token.address) ? 'bg-gray-600 justify-start' : 'bg-green-500 justify-end'
                  }`}
                  onClick={() => handleToggleTokenVisibility(token.address)}
                  role="switch"
                  aria-checked={!preferences.hiddenTokens.includes(token.address)}
                  aria-label={preferences.hiddenTokens.includes(token.address) ? t('tokenManagement.buttons.showTokenAria', { tokenName: token.name || t('tokenManagement.fallbackTokenName') }) : t('tokenManagement.buttons.hideTokenAria', { tokenName: token.name || t('tokenManagement.fallbackTokenName') })}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenManagementView;
