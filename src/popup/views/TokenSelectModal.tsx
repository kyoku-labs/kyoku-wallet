// src/popup/views/TokenSelectModal.tsx
import React, { useState, useMemo } from 'react';
import { X, Search, AlertTriangle, CheckCircle } from 'lucide-react';
import { TokenInfo } from '../../background/core/keyring/types';
import { CryptoUtils } from '../../utils/cryptoutils';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectToken: (token: TokenInfo) => void;
  userTokens: TokenInfo[];
  allTokens: TokenInfo[];
  isLoadingTokens?: boolean;
  currentSelectionLabel?: 'input' | 'output';
}

const TokenListItem: React.FC<{ token: TokenInfo; onSelect: () => void; isSelected?: boolean; isCustomEntry?: boolean }> = ({ token, onSelect, isSelected, isCustomEntry }) => {
  const { t } = useTranslation(); // For TokenListItem

  // For custom entries, name and symbol are derived from the address.
  // For known tokens, use their actual name and symbol.
  const displayName = isCustomEntry ? t('tokenSelect.customTokenName', { addressPart: token.address.substring(0, 4) }) : token.name || token.symbol || t('tokenSelect.unknownToken');
  const displaySymbol = isCustomEntry ? token.address.substring(0, 6).toUpperCase() + '...' : token.symbol || token.address.substring(0, 6) + '...';
  const altText = t('itemList.tokenLogoAlt', { tokenSymbol: displayName }); // Reusing existing key

  return (
    <button
      onClick={onSelect}
      className={`flex items-center w-full p-3 hover:bg-[#2A3447] rounded-lg transition-colors duration-150 ${isSelected ? 'bg-blue-600/20 ring-1 ring-blue-500' : ''}`}
      aria-label={t('tokenSelect.ariaLabels.selectToken', { tokenName: displayName })} // Translate
      role="option"
      aria-selected={isSelected}
    >
      {token.logo && !isCustomEntry ? (
        <img src={token.logo} alt={altText} className="w-8 h-8 rounded-full mr-3 flex-shrink-0 object-cover bg-gray-700" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm font-semibold text-white mr-3 flex-shrink-0">
          {isCustomEntry ? token.address.charAt(0).toUpperCase() : displaySymbol.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-grow text-left min-w-0">
        {/* title attribute removed */}
        <p className="text-sm font-medium text-white truncate">
          {displayName}
          {isCustomEntry && <span className="text-xs text-blue-400 ml-1">({t('tokenSelect.customAddressLabel')})</span>} {/* Translate */}
        </p>
        {/* title attribute removed */}
        <p className="text-xs text-gray-400 truncate">
            {isCustomEntry ? token.address : displaySymbol}
        </p>
      </div>
      <div className="text-right ml-2 flex-shrink-0">
        {token.balance !== undefined && token.balance !== null && token.balance > 0 && !isCustomEntry && (
            <p className="text-sm text-white font-mono">
            {token.balance.toLocaleString(undefined, { maximumFractionDigits: token.decimals > 0 ? Math.min(token.decimals, 4) : 0 })}
            </p>
        )}
        {isSelected && <CheckCircle size={18} className="text-blue-400 ml-2" />}
      </div>
    </button>
  );
};

const TokenSelectModal: React.FC<TokenSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectToken,
  userTokens,
  allTokens,
  isLoadingTokens = false,
  currentSelectionLabel = 'token',
}) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const [searchTerm, setSearchTerm] = useState('');

  const potentialCustomTokenAddress = useMemo(() => {
    const trimmedSearch = searchTerm.trim();
    if (CryptoUtils.isValidPublicKey(trimmedSearch)) {
      return trimmedSearch;
    }
    return null;
  }, [searchTerm]);

  const itemsToDisplay = useMemo(() => {
    const tokenMap = new Map<string, TokenInfo>();
    userTokens.forEach(token => tokenMap.set(token.address, token));
    allTokens.forEach(token => {
      if (!tokenMap.has(token.address)) {
        tokenMap.set(token.address, token);
      } else {
        const userToken = tokenMap.get(token.address)!;
        if (!userToken.logo && token.logo) {
          tokenMap.set(token.address, { ...userToken, logo: token.logo });
        }
         if (userToken.balance !== undefined && userToken.balance !== null) {
            tokenMap.set(token.address, { ...tokenMap.get(token.address)!, balance: userToken.balance, balanceLamports: userToken.balanceLamports });
        }
      }
    });

    let filteredKnownTokens = Array.from(tokenMap.values());

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredKnownTokens = filteredKnownTokens.filter(
        (token) =>
          token.name?.toLowerCase().includes(lowerSearchTerm) ||
          token.symbol?.toLowerCase().includes(lowerSearchTerm) ||
          token.address.toLowerCase().includes(lowerSearchTerm)
      );
    }
    
    filteredKnownTokens.sort((a, b) => {
        const aIsUserToken = userTokens.some(ut => ut.address === a.address);
        const bIsUserToken = userTokens.some(ut => ut.address === b.address);
        const aHasBalance = a.balance && a.balance > 0;
        const bHasBalance = b.balance && b.balance > 0;

        if (aIsUserToken && aHasBalance && !(bIsUserToken && bHasBalance)) return -1;
        if (!(aIsUserToken && aHasBalance) && bIsUserToken && bHasBalance) return 1;
        if (aIsUserToken && !bIsUserToken) return -1;
        if (!aIsUserToken && bIsUserToken) return 1;
        
        return (a.symbol || a.name || a.address).localeCompare(b.symbol || b.name || b.address);
    });

    if (potentialCustomTokenAddress && !filteredKnownTokens.some(t => t.address === potentialCustomTokenAddress)) {
      const customTokenEntry: TokenInfo = {
        address: potentialCustomTokenAddress,
        name: t('tokenSelect.customTokenName', { addressPart: potentialCustomTokenAddress.substring(0, 4) }),
        symbol: potentialCustomTokenAddress.substring(0, 4).toUpperCase(),
        decimals: 0,
        logo: undefined,
        balance: 0,
        balanceLamports: BigInt(0),
        isNative: false,
        usdPrice: null,
        usdValue: null,
      };
      return [customTokenEntry, ...filteredKnownTokens];
    }
    
    return filteredKnownTokens;
  }, [userTokens, allTokens, searchTerm, potentialCustomTokenAddress, t]);

  if (!isOpen) {
    return null;
  }
  
  const getModalTitle = () => {
    switch(currentSelectionLabel) {
        case 'input': return t('tokenSelect.modalTitleInput');
        case 'output': return t('tokenSelect.modalTitleOutput');
        default: return t('tokenSelect.modalTitleGeneric');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#090f14] border border-[#243B55] rounded-xl shadow-2xl w-full max-w-md h-[85vh] max-h-[600px] flex flex-col text-white">
        <div className="flex items-center justify-between p-4 border-b border-[#243B55] flex-shrink-0">
          <h2 className="text-lg font-semibold text-[#A8DADC]">{getModalTitle()}</h2> {/* Translate */}
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white" aria-label={t('common.close')}> {/* Translate */}
            <X size={20} />
          </button>
        </div>

        <div className="p-3 flex-shrink-0 border-b border-[#243B55]">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              placeholder={t('tokenSelect.searchPlaceholder')} // Translate
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-[#161E2D] border border-[#334155] rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
              aria-label={t('tokenSelect.searchPlaceholder')} // For accessibility
            />
          </div>
        </div>
        
        <div className="flex-grow overflow-y-auto custom-scrollbar px-3 pb-3 space-y-1 pt-2">
          {isLoadingTokens ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              {t('tokenSelect.loadingTokens')} {/* Translate */}
            </div>
          ) : (
            <>
              {itemsToDisplay.length === 0 && ( 
                <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center p-4">
                  <AlertTriangle size={32} className="mb-2 opacity-50" />
                  <p className="text-sm">{searchTerm ? t('tokenSelect.noTokensMatchSearch') : t('tokenSelect.noTokensFoundShort')}</p> {/* Translate */}
                </div>
              )}
              {itemsToDisplay.map((token) => {
                const isThisTheCustomEntry = potentialCustomTokenAddress === token.address && 
                                            !userTokens.some(ut => ut.address === token.address) &&
                                            !allTokens.some(at => at.address === token.address && at.name !== token.name);

                return (
                    <TokenListItem
                    key={token.address}
                    token={token}
                    onSelect={() => {
                        onSelectToken(token);
                        onClose();
                    }}
                    isCustomEntry={isThisTheCustomEntry}
                    />
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenSelectModal;