// src/popup/views/settings/ConnectedDappsSettings.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Globe, Trash2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { ConnectedDappInfo } from '../../../background/shared/state';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface ConnectedDappsSettingsProps {
  onBack: () => void; // Prop is declared but not used as parent SettingsView handles header/back
}

const ConnectedDappsSettings: React.FC<ConnectedDappsSettingsProps> = ({}) => {
  const { t } = useTranslation(); // Initialize useTranslation

  const [connectedApps, setConnectedApps] = useState<ConnectedDappInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectedDapps = useCallback(() => {
    setIsLoading(true);
    setError(null);
    chrome.runtime.sendMessage({ action: 'getConnectedDapps' }, (response) => {
      setIsLoading(false);
      if (chrome.runtime.lastError) {
        console.error("Error fetching connected dapps:", chrome.runtime.lastError.message);
        setError(t('connectedDapps.errors.loadFailed'));
        setConnectedApps([]);
        return;
      }
      if (response && response.success) {
        setConnectedApps(response.dapps || []);
      } else {
        setError(response?.error || t('connectedDapps.errors.couldNotRetrieve'));
        setConnectedApps([]);
      }
    });
  }, [t]); // Added t to dependency array

  useEffect(() => {
    fetchConnectedDapps();
  }, [fetchConnectedDapps]);

  const handleDisconnectApp = (origin: string) => {
    // Optional: Add a translatable confirmation dialog here
    // if (!window.confirm(t('connectedDapps.confirmDisconnect', { appName: appName }))) return;

    setIsLoading(true);
    chrome.runtime.sendMessage(
      { action: 'disconnectDapp', payload: { originToDisconnect: origin } },
      (response) => {
        setIsLoading(false);
        if (chrome.runtime.lastError || !response?.success) {
          const errorMsg = chrome.runtime.lastError?.message || response?.error || t('connectedDapps.errors.disconnectFailed');
          console.error(`Error disconnecting ${origin}:`, errorMsg);
          setError(errorMsg);
        } else {
          fetchConnectedDapps();
        }
      }
    );
  };

  const renderContent = () => {
    if (isLoading && connectedApps.length === 0) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center text-gray-400">
          <Loader2 className="animate-spin h-8 w-8 text-blue-400 mb-3" />
          {t('connectedDapps.loading')} {/* Translate */}
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center p-4 text-center text-red-400">
          <AlertTriangle size={32} className="mb-2" />
          <p>{error}</p> {/* Error message is already translated when set */}
          <button 
            onClick={fetchConnectedDapps}
            className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md flex items-center"
          >
            <RefreshCw size={14} className="mr-1.5" />
            {t('buttons.retry')} {/* Translate */}
          </button>
        </div>
      );
    }

    if (connectedApps.length === 0) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center text-gray-500 p-6 text-center">
          <Globe size={40} className="mb-3 opacity-50" />
          <p className="text-base">{t('connectedDapps.emptyState.noAppsConnected')}</p> {/* Translate */}
          <p className="text-xs mt-1">{t('connectedDapps.emptyState.appsWillAppearHere')}</p> {/* Translate */}
        </div>
      );
    }

    return (
      <div className="space-y-3 flex-grow overflow-y-auto custom-scrollbar pr-1">
        {connectedApps.map(app => (
          <div key={app.origin} className="p-3.5 bg-[#161E2D] rounded-lg border border-[#334155] shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0 mr-2">
                {app.iconUrl ? (
                  <img 
                    src={app.iconUrl} 
                    alt={t('connectedDapps.dAppIconAlt', { appName: app.name })} // Translate alt
                    className="w-8 h-8 rounded-md mr-2.5 flex-shrink-0 object-cover bg-gray-700" 
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/icons/kyoku-logo.png'; }}/>
                ) : (
                  <div className="w-8 h-8 rounded-md mr-2.5 flex-shrink-0 bg-gray-700 flex items-center justify-center">
                    <Globe size={18} className="text-gray-400" />
                  </div>
                )}
                <div className="min-w-0">
                  {/* title attribute removed */}
                  <h4 className="font-medium text-white truncate">{app.name}</h4>
                  {/* title attribute removed */}
                  <p className="text-xs text-gray-400 truncate">{app.origin}</p>
                </div>
              </div>
              <button 
                onClick={() => handleDisconnectApp(app.origin)}
                className="px-2.5 py-1.5 bg-red-700/80 hover:bg-red-600 text-white text-xs rounded-md flex items-center transition-colors disabled:opacity-50"
                aria-label={t('connectedDapps.buttons.disconnectAriaLabel', { appName: app.name })} // Translate aria-label
                // title attribute removed
                disabled={isLoading}
              >
                <Trash2 size={12} className="mr-1" />
                {t('connectedDapps.buttons.disconnect')} {/* Translate */}
              </button>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-700/50">
              <p className="text-xs text-gray-500">
                {t('connectedDapps.connectedDateLabel')}: {new Date(app.connectedAt).toLocaleDateString()} {/* Translate "Connected:" */}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#090f14] p-4 text-white">
      {/* The parent SettingsView handles the overall title "Connected Apps", so no need for a specific title here */}
      <p className="text-gray-400 text-sm mb-4 flex-shrink-0">
        {t('connectedDapps.description')} {/* Translate */}
      </p>
      
      {renderContent()}
    </div>
  );
};

export default ConnectedDappsSettings;