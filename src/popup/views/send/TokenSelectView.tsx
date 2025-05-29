// src/popup/views/send/TokenSelectView.tsx
import React, { useState } from 'react';
import { TokenInfo } from '../../../background/core/keyring/types';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface TokenSelectViewProps {
  tokens: TokenInfo[] | null;
  isLoading: boolean;
  onTokenSelect: (token: TokenInfo) => void;
}

const TokenSelectView: React.FC<TokenSelectViewProps> = ({
  tokens,
  isLoading,
  onTokenSelect
}) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTokens = tokens?.filter((token) => {
    if (!searchTerm) return true;

    const symbol = token.symbol?.toLowerCase() || '';
    const name = token.name?.toLowerCase() || '';
    const searchLower = searchTerm.toLowerCase();

    return symbol.includes(searchLower) || name.includes(searchLower);
  });

  const renderTokenLogo = (token: TokenInfo) => {
    const tokenAltText = t('tokenSelect.tokenLogoAlt', { tokenSymbol: token.symbol || t('tokenSelect.fallbackTokenName') });
    if (token.logo) {
      return (
        <div className="w-10 h-10 rounded-full flex items-center justify-center mr-3 overflow-hidden">
          <img 
            src={token.logo} 
            alt={tokenAltText} // Translate
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              e.currentTarget.parentElement?.classList.add('bg-[#4A5568]');
              const textElement = document.createElement('span');
              textElement.className = 'text-xl';
              textElement.textContent = token.symbol ? token.symbol.slice(0, 1) : '?';
              e.currentTarget.parentElement?.appendChild(textElement);
            }}
          />
        </div>
      );
    }
    
    return (
      <div className="w-10 h-10 rounded-full bg-[#4A5568] flex items-center justify-center mr-3">
        <span className="text-xl">{token.symbol?.slice(0, 1) || '?'}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FF6B35]"></div>
      </div>
    );
  }

  if (!tokens || tokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-4">
        <p className="text-center text-[#4A5568]">{t('tokenSelect.noTokensFound')}</p> {/* Translate */}
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4">
      <div className="mb-4 relative">
        <input
          type="text"
          placeholder={t('tokenSelect.searchPlaceholder')} // Translate
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 bg-[#2A3447] border border-[#4A5568] rounded-lg text-[#F5F5F5] focus:outline-none focus:border-[#5DADEC]"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-2.5 text-[#4A5568]"
            aria-label={t('common.clearSearch')} // Translate aria-label
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-grow overflow-y-auto">
        {filteredTokens?.map((token) => (
          <div
            key={token.address}
            onClick={() => onTokenSelect(token)}
            className="flex items-center p-3 border-b border-[#4A5568] hover:bg-[#2A3447] cursor-pointer"
          >
            {renderTokenLogo(token)}
            <div className="flex-grow">
              <div className="font-medium">{token.symbol || t('tokenSelect.unknownSymbol')}</div> {/* Translate fallback */}
              <div className="text-sm text-[#4A5568]">
                {token.name || token.address.slice(0, 8) + '...'}
              </div>
            </div>
            <div className="text-right">
              <div>{token.balance.toFixed(4) || '0'}</div>
              {/* Assuming $0.00 is a placeholder that will be updated by real currency formatting if implemented here later */}
              <div className="text-sm text-[#4A5568]">$0.00</div> 
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TokenSelectView;