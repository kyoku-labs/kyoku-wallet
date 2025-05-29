// src/popup/views/settings/AutoLockSettings.tsx
import React, { useState, useEffect } from 'react';
import { config } from '../../../background/shared/state';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface AutoLockSettingsProps {
  onBack: () => void; // This prop is declared but not used in the provided snippet. Header is handled by parent.
}

interface AutoLockSettings {
  isEnabled: boolean;
  minutes: number;
}

const AutoLockSettings: React.FC<AutoLockSettingsProps> = () => {
  const { t } = useTranslation(); // Initialize useTranslation

  const [isEnabled, setIsEnabled] = useState(true);
  const [minutes, setMinutes] = useState(5);
  const [displayMinutes, setDisplayMinutes] = useState('5');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await chrome.storage.local.get(config.AUTO_LOCK_SETTINGS_KEY);
        const settings = result[config.AUTO_LOCK_SETTINGS_KEY] as AutoLockSettings;
        if (settings) {
          setIsEnabled(settings.isEnabled);
          const validMinutes = Math.max(1, settings.minutes);
          setMinutes(validMinutes);
          setDisplayMinutes(`${validMinutes}`);
        }
      } catch (error) {
        console.error('Failed to load auto-lock settings:', error);
        setError(t('autoLockSettings.errors.loadFailed'));
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [t]);

  const saveSettings = async (newIsEnabled: boolean, newMinutes: number) => {
    try {
      if (newIsEnabled && newMinutes < 1) {
        setError(t('autoLockSettings.errors.durationTooShort'));
        return;
      }

      const validMinutes = Math.max(1, newMinutes);
      const settings: AutoLockSettings = {
        isEnabled: newIsEnabled,
        minutes: validMinutes
      };
      await chrome.storage.local.set({ [config.AUTO_LOCK_SETTINGS_KEY]: settings });
      
      chrome.runtime.sendMessage({ 
        action: 'updateAutoLockSettings', 
        payload: settings 
      });
      
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 1500);
      
      setError(null);
    } catch (error) {
      console.error('Failed to save auto-lock settings:', error);
      setError(t('autoLockSettings.errors.saveFailed'));
    }
  };

  const handleToggleEnabled = () => {
    const newIsEnabled = !isEnabled;
    setIsEnabled(newIsEnabled);
    if (newIsEnabled && minutes < 1) {
      setMinutes(5); // Default to 5 if enabling and current minutes is invalid
      setDisplayMinutes('5');
       saveSettings(newIsEnabled, 5); // Save with default 5
    } else {
        saveSettings(newIsEnabled, newIsEnabled ? Math.max(1, minutes) : minutes);
    }
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const cleanedInput = input.replace(/[^\d]/g, '');
    const newMinutes = cleanedInput === '' ? 0 : parseInt(cleanedInput, 10);
    
    setMinutes(newMinutes);
    
    if (cleanedInput === '' || newMinutes === 0) {
      setDisplayMinutes('0');
    } else {
      setDisplayMinutes(`${newMinutes}`);
    }
    
    if (newMinutes >= 1) {
      setError(null);
      saveSettings(isEnabled, newMinutes);
    }
    // No immediate error display here, onBlur will handle it if still invalid
  };

  const handleMinutesBlur = () => {
    if (isEnabled && minutes < 1) {
        setError(t('autoLockSettings.errors.durationTooShort'));
    } else if (isEnabled && minutes >=1) {
        // If valid and enabled, ensure settings are saved (might be redundant if already saved in onChange)
        // This check is more for ensuring error is cleared or set correctly on blur
        setError(null);
        saveSettings(isEnabled, minutes);
    } else if (!isEnabled) {
        setError(null); // Clear error if auto-lock is disabled
    }
  };


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full text-gray-400">
        {t('common.loadingSettings')} {/* Translate */}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* The Header "Auto-Lock Timer" is expected to be rendered by the parent SettingsView */}
      {/* <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white">{t('autoLockSettings.title')}</h3>
      </div> */}
      
      <p className="text-gray-400">{t('autoLockSettings.description')}</p>
      
      <div className="flex items-center justify-between p-4 bg-gray-800 rounded">
        <span className="text-white">{t('autoLockSettings.enableLabel')}</span>
        <button 
          onClick={handleToggleEnabled} 
          className={`w-12 h-6 rounded-full relative ${isEnabled ? 'bg-blue-500' : 'bg-gray-600'}`}
          aria-pressed={isEnabled} // For accessibility
          aria-label={isEnabled ? t('autoLockSettings.disableAutoLockAria') : t('autoLockSettings.enableAutoLockAria')}
        >
          <span 
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
              isEnabled ? 'left-7' : 'left-1'
            }`} 
          />
        </button>
      </div>
      
      {isEnabled && (
        <div className="p-4 bg-gray-800 rounded">
          <label className="block mb-2 text-white">{t('autoLockSettings.durationLabel')}</label>
          <input
            type="text" // Using text to allow "0" to be displayed, validation handles numeric
            inputMode="numeric" // Hint for mobile keyboards
            value={displayMinutes}
            onChange={handleMinutesChange}
            onBlur={handleMinutesBlur} // Validate on blur
            className={`w-full p-2 bg-gray-700 rounded text-white border ${
              error ? 'border-red-500' : 'border-gray-600'
            }`}
            style={{ appearance: 'textfield' }} // For browser consistency, though not standard
          />
          {error && (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          )}
        </div>
      )}
      
      {saveSuccess && (
        <div className="mt-8 mb-4 flex justify-center">
          <span className="text-blue-400 text-center">
            {t('autoLockSettings.saveSuccessMessage')}
          </span>
        </div>
      )}
      
    </div>
  );
};

export default AutoLockSettings;