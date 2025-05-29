// src/popup/views/settings/ExplorerSettings.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../../store/appStore';
import { getFromStorage, saveToStorage } from '../../../utils/storage';
import { config } from '../../../background/shared/state';
import { SUPPORTED_EXPLORERS, DEFAULT_EXPLORER_ID, Explorer } from '../../../utils/explorerUtils';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface ExplorerSettingsProps {
  onBack: () => void; 
}

const ExplorerSettings: React.FC<ExplorerSettingsProps> = () => {
  const { t } = useTranslation(); // Initialize useTranslation
  const { preferredExplorerId: currentGlobalExplorerId, setPreferredExplorerId } = useAppStore();
  
  const [selectedExplorerId, setSelectedExplorerId] = useState<string>(DEFAULT_EXPLORER_ID);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [initialLoadAttempted, setInitialLoadAttempted] = useState(false);

  useEffect(() => {
    const loadPreference = async () => {
      setIsLoading(true);
      try {
        const savedId = await getFromStorage<string>(config.EXPLORER_PREFERENCE_KEY);
        if (savedId && SUPPORTED_EXPLORERS.some(e => e.id === savedId)) {
          setSelectedExplorerId(savedId);
          if (savedId !== currentGlobalExplorerId) {
            setPreferredExplorerId(savedId);
          }
        } else {
          setSelectedExplorerId(currentGlobalExplorerId || DEFAULT_EXPLORER_ID);
        }
      } catch (error) {
        console.error("ExplorerSettings: Failed to load explorer preference:", error);
        setSelectedExplorerId(currentGlobalExplorerId || DEFAULT_EXPLORER_ID);
      } finally {
        setIsLoading(false);
        setInitialLoadAttempted(true);
      }
    };
    loadPreference();
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, []);

  useEffect(() => {
    if (initialLoadAttempted && !isLoading) {
      if (currentGlobalExplorerId !== selectedExplorerId) {
        setSelectedExplorerId(currentGlobalExplorerId || DEFAULT_EXPLORER_ID);
      }
    }
  }, [currentGlobalExplorerId, initialLoadAttempted, isLoading]);


  const handleSelectExplorer = (explorerId: string) => {
    setSelectedExplorerId(explorerId);
    setSaveMessage(null); 
  };

  const handleSaveChanges = useCallback(async () => {
    setSaveMessage(null);
    try {
      await saveToStorage(config.EXPLORER_PREFERENCE_KEY, selectedExplorerId);
      setPreferredExplorerId(selectedExplorerId);
      setSaveMessage(t('explorerSettings.saveSuccessMessage')); // Translate
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (error) {
      console.error("ExplorerSettings: Failed to save explorer preference:", error);
      setSaveMessage(t('explorerSettings.saveFailedMessage')); // Translate
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }, [selectedExplorerId, setPreferredExplorerId, t]); // Added t to dependency array

  if (isLoading && !initialLoadAttempted) {
    return (
      <div className="flex flex-col h-full p-4 text-white items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-blue-400" />
        <p className="mt-2 text-gray-400">{t('common.loadingSettings')}</p> {/* Translate */}
      </div>
    );
  }
  
  return (
    <div className="space-y-4 text-gray-300">
      <p className="text-gray-400 text-sm mb-4">
        {t('explorerSettings.description')} {/* Translate */}
      </p>
      
      <div className="space-y-3">
        {SUPPORTED_EXPLORERS.map((explorer: Explorer) => (
          <div 
            key={explorer.id}
            className={`p-4 rounded-lg cursor-pointer transition-all duration-150 ease-in-out flex items-center justify-between
              ${selectedExplorerId === explorer.id 
                ? 'bg-blue-600/20 border-2 border-blue-500 shadow-md ring-1 ring-blue-400' 
                : 'bg-[#161E2D] border border-[#334155] hover:border-gray-500'
              }`}
            onClick={() => handleSelectExplorer(explorer.id)}
            role="radio"
            aria-checked={selectedExplorerId === explorer.id}
            tabIndex={0}
            onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectExplorer(explorer.id);}}
            aria-label={explorer.name} // Explorer name itself is the label
          >
            <div>
              {/* Explorer names are from a data structure, consider translating them if needed */}
              <span className="font-semibold text-base text-white">{explorer.name}</span>
              <p className="text-xs text-gray-400 mt-0.5">{explorer.urlPattern.split('/tx/')[0].split('/transaction/')[0]}</p>
            </div>
            {selectedExplorerId === explorer.id && (
              <CheckCircle size={20} className="text-blue-400 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
      
      {saveMessage && (
        <p className={`text-sm text-center py-2 transition-opacity duration-300 ${saveMessage === t('explorerSettings.saveFailedMessage') ? 'text-red-400' : 'text-green-400'}`}>
          {saveMessage} {/* Already translated when set */}
        </p>
      )}

      <div className="pt-4">
        <button 
          onClick={handleSaveChanges}
          disabled={selectedExplorerId === currentGlobalExplorerId && !saveMessage?.includes(t('explorerSettings.saveFailedMessageNoParam'))} // Compare with translated error part if needed
          className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors
                     disabled:bg-gray-500 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {t('common.savePreference')} {/* Translate */}
        </button>
      </div>
    </div>
  );
};

export default ExplorerSettings;