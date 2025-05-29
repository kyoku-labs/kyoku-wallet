// src/i18n/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import your translation files
import enTranslation from './locales/en/translation.json';
import esTranslation from './locales/es/translation.json';
import zhCnTranslation from './locales/zh-CN/translation.json'; // For Chinese (Simplified)
import hiTranslation from './locales/hi/translation.json';     // For Hindi
import viTranslation from './locales/vi/translation.json';     // For Vietnamese
import idTranslation from './locales/id/translation.json';     // For Indonesian
import jaTranslation from './locales/ja/translation.json';     // For Japanese
import koTranslation from './locales/ko/translation.json';     // For Korean

const resources = {
  en: {
    translation: enTranslation,
  },
  es: {
    translation: esTranslation,
  },
  'zh-CN': { // Using 'zh-CN' for Simplified Chinese
    translation: zhCnTranslation,
  },
  hi: {
    translation: hiTranslation,
  },
  vi: {
    translation: viTranslation,
  },
  id: {
    translation: idTranslation,
  },
  ja: {
    translation: jaTranslation,
  },
  ko: {
    translation: koTranslation,
  },
};

i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    resources,
    fallbackLng: 'en', // Use English if detected language is not available
    debug: import.meta.env.MODE === 'development', // Enable debug logs in development mode
    interpolation: {
      escapeValue: false, // React already protects from XSS
    },
    detection: {
      // Order and from where user language should be detected
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Key to store the user's selected language
      lookupLocalStorage: 'kyokuWalletLanguage', // This is i18next's localStorage key
      caches: ['localStorage'], // Cache the language choice in localStorage
    },
    // react-i18next specific options (optional)
    // react: {
    //   useSuspense: false, // Set to true if you want to use Suspense for translation loading
    // }
  });

export default i18n;