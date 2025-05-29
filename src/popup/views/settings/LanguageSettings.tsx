// src/popup/views/settings/LanguageSettings.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../../store/appStore';
import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';

interface LanguageSettingsProps {
  onBack: () => void;
}

type Language = {
  code: string;
  name: string;
  nativeName: string;
};

const LanguageSettings: React.FC<LanguageSettingsProps> = ({ onBack }) => {
  const { setSelectedLanguage: persistLanguagePreference } = useAppStore();
  const { t, i18n } = useTranslation();

  // Initialize localSelectedLanguageCode directly from i18n.language on first render.
  // This avoids an immediate useEffect cycle just to set this.
  const [localSelectedLanguageCode, setLocalSelectedLanguageCode] = useState(() =>
    i18n.language ? i18n.language.split('-')[0] : 'en'
  );

  useEffect(() => {
    // This function handles when i18next's language changes due to external factors
    // (e.g., after i18n.changeLanguage completes, or LanguageDetector initializes)
    const handleExternalLanguageChange = (lng: string) => {
      const newBaseLang = lng.split('-')[0];
      // Update our local state only if it's different from what i18next now reports.
      // This syncs our component's UI if the language was changed by another part of the app
      // or by i18next itself.
      setLocalSelectedLanguageCode(currentLocalCode => {
        if (currentLocalCode !== newBaseLang) {
          return newBaseLang;
        }
        return currentLocalCode; // No change needed if already aligned
      });
    };

    // Subscribe to language changes from i18next
    i18n.on('languageChanged', handleExternalLanguageChange);

    // On initial mount, ensure localSelectedLanguageCode is definitely synced
    // with i18n.language. This covers cases where i18n.language might have
    // been updated by the detector very quickly after initial state was set.
    const currentI18nBaseLang = i18n.language ? i18n.language.split('-')[0] : 'en';
    if (localSelectedLanguageCode !== currentI18nBaseLang) {
        setLocalSelectedLanguageCode(currentI18nBaseLang);
    }

    // Cleanup: Unsubscribe when the component unmounts
    return () => {
      i18n.off('languageChanged', handleExternalLanguageChange);
    };
  }, [i18n]); // Only depend on the i18n instance.
               // localSelectedLanguageCode is NOT included here to prevent loops.
               // The functional update within handleExternalLanguageChange handles preventing
               // unnecessary sets if the new language is the same as the current local state.

const languages: Language[] = [
  { code: 'en', name: t('languages.english.name', 'English'), nativeName: t('languages.english.nativeName', 'English') },
  { code: 'es', name: t('languages.spanish.name', 'Spanish'), nativeName: t('languages.spanish.nativeName', 'Español') },
  { code: 'zh-CN', name: t('languages.chinese_simplified.name', 'Chinese (Simplified)'), nativeName: t('languages.chinese_simplified.nativeName', '简体中文') }, // Example
  { code: 'hi', name: t('languages.hindi.name', 'Hindi'), nativeName: t('languages.hindi.nativeName', 'हिन्दी') },
  { code: 'vi', name: t('languages.vietnamese.name', 'Vietnamese'), nativeName: t('languages.vietnamese.nativeName', 'Tiếng Việt') },
  { code: 'id', name: t('languages.indonesian.name', 'Indonesian'), nativeName: t('languages.indonesian.nativeName', 'Bahasa Indonesia') },
  { code: 'ja', name: t('languages.japanese.name', 'Japanese'), nativeName: t('languages.japanese.nativeName', '日本語') },
  { code: 'ko', name: t('languages.korean.name', 'Korean'), nativeName: t('languages.korean.nativeName', '한국어') },
];

  const handleLanguageChange = (languageCode: string) => {
    // This function is called when the user clicks a language button.
    // It directly updates the local UI state.
    setLocalSelectedLanguageCode(languageCode);
  };

  const handleSaveAndGoBack = useCallback(async () => {
    try {
      const currentI18nBaseLang = i18n.language.split('-')[0];
      // Only proceed if the user's selection is different from the current i18n language
      if (currentI18nBaseLang !== localSelectedLanguageCode) {
        await i18n.changeLanguage(localSelectedLanguageCode); // This will trigger the 'languageChanged' event
        persistLanguagePreference(localSelectedLanguageCode); // Persist in app store and chrome.storage
      }
      onBack();
    } catch (error) {
      console.error("[LanguageSettings] Error changing/saving language:", error);
      // Consider setting a user-facing error message here
    }
  }, [i18n, localSelectedLanguageCode, persistLanguagePreference, onBack]);

  // The "Save" button is disabled if the locally selected language
  // already matches the current active i18n language.
  const isSaveDisabled = localSelectedLanguageCode === (i18n.language ? i18n.language.split('-')[0] : 'en');

  return (
    <div className="space-y-4 text-gray-300">
      <p className="text-gray-400 text-sm">{t('languageSettings.description')}</p>

      <div className="space-y-3 mt-3">
        {languages.map(language => (
          <div
            key={language.code}
            className={`p-4 rounded-lg cursor-pointer flex items-center justify-between transition-all duration-150 ease-in-out
              ${localSelectedLanguageCode === language.code
                ? 'bg-blue-600/20 border-2 border-blue-500 shadow-md ring-1 ring-blue-400'
                : 'bg-[#161E2D] border border-[#334155] hover:border-gray-500'
              }`}
            onClick={() => handleLanguageChange(language.code)}
            role="radio"
            aria-checked={localSelectedLanguageCode === language.code}
            tabIndex={0}
            onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleLanguageChange(language.code); }}
            aria-label={language.name}
          >
            <div>
              <span className="text-base font-semibold text-white">{language.name}</span>
              {language.nativeName && language.name !== language.nativeName && (
                <span className="text-sm text-gray-400 ml-2">({language.nativeName})</span>
              )}
            </div>

            {localSelectedLanguageCode === language.code && (
              <CheckCircle size={20} className="text-blue-400 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="pt-4">
        <button
          onClick={handleSaveAndGoBack}
          disabled={isSaveDisabled}
          className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors
                     disabled:bg-gray-500 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {t('common.savePreference')}
        </button>
      </div>
    </div>
  );
};

export default LanguageSettings;