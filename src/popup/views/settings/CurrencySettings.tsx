// src/popup/views/settings/CurrencySettings.tsx
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../../store/appStore';
import { CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface CurrencySettingsProps {
  onBack: () => void;
}

type Currency = {
  code: string;
  nameKey: string; // Key for the translated name
  symbol: string;
};

const CurrencySettings: React.FC<CurrencySettingsProps> = ({ onBack }) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const { selectedCurrency: globalSelectedCurrency, setSelectedCurrency } = useAppStore();

  const [localSelectedCurrencyCode, setLocalSelectedCurrencyCode] = useState(globalSelectedCurrency);

  useEffect(() => {
    setLocalSelectedCurrencyCode(globalSelectedCurrency);
  }, [globalSelectedCurrency]);

  // Define currencies with translation keys for their names
  const currencies: Currency[] = [
    { code: 'USD', nameKey: 'currency.usd', symbol: '$' },
    { code: 'EUR', nameKey: 'currency.eur', symbol: '€' },
    { code: 'GBP', nameKey: 'currency.gbp', symbol: '£' },
    { code: 'JPY', nameKey: 'currency.jpy', symbol: '¥' },
    // Add more currencies with their respective translation keys
  ];

  const handleCurrencyChange = (currencyCode: string) => {
    setLocalSelectedCurrencyCode(currencyCode);
  };

  const handleSaveAndGoBack = () => {
    setSelectedCurrency(localSelectedCurrencyCode);
    onBack();
  };

  return (
    <div className="space-y-4 text-gray-300">
      <p className="text-gray-400 text-sm">{t('currencySettings.description')}</p> {/* Translate description */}
      
      <div className="space-y-3 mt-3">
        {currencies.map(currency => (
          <div 
            key={currency.code}
            className={`p-4 rounded-lg cursor-pointer flex items-center justify-between transition-all duration-150 ease-in-out
              ${localSelectedCurrencyCode === currency.code 
                ? 'bg-blue-600/20 border-2 border-blue-500 shadow-md ring-1 ring-blue-400' 
                : 'bg-[#161E2D] border border-[#334155] hover:border-gray-500'
              }`}
            onClick={() => handleCurrencyChange(currency.code)}
            role="radio"
            aria-checked={localSelectedCurrencyCode === currency.code}
            tabIndex={0}
            onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCurrencyChange(currency.code);}}
          >
            <div className="flex items-center">
              <span className="text-xl mr-3 font-medium text-gray-100">{currency.symbol}</span>
              <div>
                <span className="text-base font-semibold text-white">{t(currency.nameKey)}</span> {/* Translate currency name */}
                <span className="text-xs text-gray-400 ml-2">({currency.code})</span>
              </div>
            </div>
            
            {localSelectedCurrencyCode === currency.code && (
              <CheckCircle size={20} className="text-blue-400 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
      
      <div className="pt-4">
        <button 
          onClick={handleSaveAndGoBack}
          disabled={localSelectedCurrencyCode === globalSelectedCurrency}
          className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors
                     disabled:bg-gray-500 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {t('common.savePreference')} {/* Translate button text */}
        </button>
      </div>
    </div>
  );
};

export default CurrencySettings;