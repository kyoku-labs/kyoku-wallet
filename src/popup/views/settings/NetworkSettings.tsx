// src/popup/views/settings/NetworkSettings.tsx
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../../store/appStore';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface NetworkSettingsProps {
  onBack: () => void;
}

interface NetworkOptionProps {
  label: string; // This label will now be a translated string
  isSelected: boolean;
  onClick: () => void;
}

const NetworkOption: React.FC<NetworkOptionProps> = ({ label, isSelected, onClick }) => {
  return (
    <div 
      className={`flex items-center p-2 rounded-md cursor-pointer ${isSelected ? 'bg-[#161E2D] border border-[#3B82F6]' : 'hover:bg-[#161E2D]'}`}
      onClick={onClick}
      role="radio" // Added for accessibility
      aria-checked={isSelected} // For accessibility
      tabIndex={0} // Make focusable
      onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick();}} // Keyboard navigable
    >
      <div className={`w-4 h-4 rounded-full mr-2 ${isSelected ? 'bg-[#3B82F6]' : 'border border-gray-400'}`} />
      <span>{label}</span>
    </div>
  );
};

const NetworkSettings: React.FC<NetworkSettingsProps> = ({ onBack: _onBack }) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const { network, customRpcUrl, setNetworkConfiguration } = useAppStore();
  const [tempCustomUrl, setTempCustomUrl] = useState(customRpcUrl || '');
  const queryClient = useQueryClient();

  useEffect(() => {
    setTempCustomUrl(customRpcUrl || '');
  }, [customRpcUrl]);

  const handleNetworkChange = async (newNetwork: string) => {
    const networkValue = newNetwork as 'mainnet-beta' | 'devnet' | 'testnet' | 'custom';
    const urlToUse = networkValue === 'custom' ? tempCustomUrl : null;

    setNetworkConfiguration(networkValue, urlToUse);

    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['nfts'] });

    chrome.runtime.sendMessage({
      action: 'setNetworkConfiguration',
      payload: { network: networkValue, customRpcUrl: urlToUse }
    }, (response) => {
      if (!response?.success) {
        console.error('Failed to update network configuration:', response?.error);
        // Optionally set a translated error message to a state variable to show in UI
        // Example: setError(t('networkSettings.errors.updateFailed', { details: response?.error }));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <NetworkOption 
          label={t('networkSettings.options.mainnet')} 
          isSelected={network === 'mainnet-beta'}
          onClick={() => handleNetworkChange('mainnet-beta')}
        />
        <NetworkOption 
          label={t('networkSettings.options.devnet')}
          isSelected={network === 'devnet'}
          onClick={() => handleNetworkChange('devnet')}
        />
        <NetworkOption 
          label={t('networkSettings.options.testnet')}
          isSelected={network === 'testnet'}
          onClick={() => handleNetworkChange('testnet')}
        />
        <NetworkOption 
          label={t('networkSettings.options.customRpc')}
          isSelected={network === 'custom'}
          onClick={() => handleNetworkChange('custom')}
        />

        {network === 'custom' && (
          <div className="mt-4 border-t border-gray-700 pt-3">
            <h3 className="text-sm font-medium mb-2 text-gray-300">{t('networkSettings.customRpcConfigurationTitle')}</h3>
            <p className="text-xs text-gray-400 mb-2">{t('networkSettings.customRpcDescription')}</p>
            <input
              type="text"
              value={tempCustomUrl}
              onChange={(e) => setTempCustomUrl(e.target.value)}
              onBlur={() => {
                if (network === 'custom') {
                  setNetworkConfiguration('custom', tempCustomUrl);
                  chrome.runtime.sendMessage({
                    action: 'setNetworkConfiguration',
                    payload: { network: 'custom', customRpcUrl: tempCustomUrl }
                  });
                  queryClient.invalidateQueries({ queryKey: ['portfolio'] });
                  queryClient.invalidateQueries({ queryKey: ['nfts'] });
                }
              }}
              placeholder={t('networkSettings.placeholders.rpcEndpoint')}
              className="w-full bg-[#161E2D] border border-[#334155] rounded-md px-3 py-2 text-sm"
              aria-label={t('networkSettings.customRpcInputAriaLabel')} // For accessibility
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkSettings;