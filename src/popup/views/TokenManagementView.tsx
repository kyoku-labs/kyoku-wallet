// src/popup/views/TokenManagementView.tsx
import React, { useMemo, useCallback } from 'react';
import { TokenInfo } from '../../background/core/keyring/types';
import { useTokenPreferences } from '../../hooks/useTokenPreferences';
import { useAppStore } from '../../store/appStore';
import { usePortfolio } from '../../hooks/usePortfolio';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

// renderTokenLogo now takes t function for alt text
const renderTokenLogo = (token: TokenInfo, t: Function) => {
    const altText = t('itemList.tokenLogoAlt', { tokenSymbol: token.symbol || t('tokenManagement.fallbackTokenName') }); // Reusing key
    if (token.logo) {
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mr-3 flex-shrink-0">
            <img
              src={token.logo}
              alt={altText} // Translated alt
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
  const { t } = useTranslation(); // Initialize useTranslation
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
    <div className="flex flex-col h-full bg-[#1A2433] text-[#F5F5F5]">
      <div className="p-4 border-b border-[#4A5568] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center">
          <button onClick={onClose} className="text-[#F5F5F5] hover:text-[#FF6B35] text-xl font-light mr-4" aria-label={t('common.back')}>
            ←
          </button>
          <h2 className="text-lg font-medium">{t('tokenManagement.headerTitle')}</h2> {/* Translate */}
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
        <div className="mb-3 p-3 bg-[#090f14] rounded-lg border border-[#4A5568]">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-sm">{t('tokenManagement.spamToggle.label')}</span> {/* Translate */}
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
          <p className="text-xs text-[#9BA3AF]">
            {t('tokenManagement.spamToggle.description')} {/* Translate */}
          </p>
        </div>

        <div className="mb-6 p-3 bg-[#090f14] rounded-lg border border-[#4A5568]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{t('tokenManagement.lowBalanceToggle.label')}</span> {/* Translate */}
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

        <div className="mb-4 border-t border-b border-[#4A5568] py-3">
          <p className="text-xs text-[#9BA3AF] mb-2 px-1">
            {preferences.showSpamTokens 
              ? t('tokenManagement.individualManagementInfo.withSpam') 
              : t('tokenManagement.individualManagementInfo.withoutSpam')} {/* Translate */}
          </p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleHideAllDisplayable}
              disabled={!tokensAvailableForToggling || tokensAvailableForToggling.length === 0}
              className="text-[#5DADEC] text-xs hover:text-[#4A9BD7] disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              {t('tokenManagement.buttons.hideAllBelow')} {/* Translate */}
            </button>
            <button
              onClick={handleShowAllDisplayable}
              disabled={
                !tokensAvailableForToggling || 
                tokensAvailableForToggling.every(token => !preferences.hiddenTokens.includes(token.address))
              }
              className="text-[#5DADEC] text-xs hover:text-[#4A9BD7] disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              {t('tokenManagement.buttons.showAllBelow')} {/* Translate */}
            </button>
          </div>
        </div>
        
        {isLoadingPortfolio && <p className="text-center text-gray-500 py-2">{t('tokenManagement.loadingTokens')}</p>} {/* Translate */}
        {portfolioError && (
          <div className="p-3 my-2 bg-red-900/30 border border-red-700 text-red-300 rounded-lg text-center text-sm">
            <AlertTriangle size={16} className="inline mr-2" />
            {t('tokenManagement.errors.loadFailed', { error: portfolioError })} {/* Translate */}
          </div>
        )}

        {!isLoadingPortfolio && !portfolioError && (
          <div className="space-y-2">
            {allNonNativeTokens && tokensAvailableForToggling.length === 0 && (
              <p className="text-center text-gray-500 py-2 px-1">
                {preferences.showSpamTokens ? t('tokenManagement.emptyState.noNonNativeTokens') : t('tokenManagement.emptyState.noNonSpamToManage')} {/* Translate */}
              </p>
            )}
            {displayedTokensInList.map((token) => (
              <div
                key={token.address}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[#2A3447] bg-[#090f14] border border-[#4A5568]"
              >
                <div className="flex items-center min-w-0">
                  {renderTokenLogo(token, t)} {/* Pass t to renderTokenLogo */}
                  <div className="ml-2 min-w-0">
                    {/* title attribute removed */}
                    <div className="font-medium text-sm truncate">{token.name || t('tokenManagement.fallbackTokenName')}</div>
                    {/* title attribute removed */}
                    <div className="text-xs text-[#9BA3AF] truncate">
                      {token.symbol || token.address.slice(0, 6) + '...' + token.address.slice(-4)}
                    </div>
                  </div>
                </div>
                <div
                  className={`w-10 h-5 rounded-full p-0.5 cursor-pointer flex items-center ${
                    preferences.hiddenTokens.includes(token.address) ? 'bg-gray-600 justify-start' : 'bg-green-500 justify-end'
                  }`}
                  onClick={() => handleToggleTokenVisibility(token.address)}
                  role="switch" // For accessibility
                  aria-checked={!preferences.hiddenTokens.includes(token.address)} // For accessibility
                  aria-label={preferences.hiddenTokens.includes(token.address) ? t('tokenManagement.buttons.showTokenAria', { tokenName: token.name || t('tokenManagement.fallbackTokenName') }) : t('tokenManagement.buttons.hideTokenAria', { tokenName: token.name || t('tokenManagement.fallbackTokenName') })} // For accessibility
                  // title attribute removed
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