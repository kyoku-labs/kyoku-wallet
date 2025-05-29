// src/popup/views/settings/AboutSettings.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Twitter, Globe } from 'lucide-react'; // Added Globe for generic website

interface AboutSettingsProps {
  onBack: () => void; // Kept for prop consistency, though not used for a button here
}

const AboutSettings: React.FC<AboutSettingsProps> = ({}) => {
  const { t } = useTranslation();
  const manifest = chrome.runtime.getManifest();

  // URLs for your project - replace # with actual links
  const websiteUrl = "https://kyokuwallet.com"; // Example: Replace with your actual website URL
  const termsUrl = "https://www.kyokuwallet.com/legal-documents";                 // Example: Replace with your actual terms URL
  const privacyUrl = "https://www.kyokuwallet.com/legal-documents";               // Example: Replace with your actual privacy policy URL
  const twitterUrl = "https://x.com/kyokuwallet"; // Example: Replace with your actual Twitter URL

  const links = [
    { labelKey: 'aboutSettings.links.website', href: websiteUrl, Icon: Globe },
    { labelKey: 'aboutSettings.links.terms', href: termsUrl, Icon: ExternalLink }, // Using ExternalLink as a generic document icon
    { labelKey: 'aboutSettings.links.privacy', href: privacyUrl, Icon: ExternalLink },
    { labelKey: 'Twitter', href: twitterUrl, Icon: Twitter, customText: "Twitter" } // Custom text for Twitter
  ];

  return (
    <div className="flex flex-col items-center text-center pt-2 pb-6 px-2 space-y-6 text-gray-300 h-full">
      {/* Logo and Branding */}
      <div className="flex flex-col items-center space-y-2 mt-4 mb-2">
        <img
          src="/icons/kyoku-logo.png" // Or your preferred logo like ternkyoku.png
          alt={t('aboutSettings.brandName')}
          className="w-20 h-20 mb-2 rounded-2xl shadow-lg" // Adjusted size and added shadow
        />
        <h1 className="text-3xl font-bold text-white">
          {t('aboutSettings.brandName')}
        </h1>
        <p className="text-sm text-gray-400">
          {t('aboutSettings.versionLabel')} {manifest.version}
        </p>
      </div>

      {/* Links Section */}
      <div className="w-full max-w-sm space-y-3">
        {links.map(({ labelKey, href, Icon, customText }) => (
          <a
            key={customText || labelKey}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full p-3.5 bg-[#161E2D] hover:bg-[#2A3447] rounded-xl text-white text-sm transition-colors duration-150 shadow-sm border border-transparent hover:border-gray-700"
          >
            <div className="flex items-center">
              <Icon size={18} className="mr-3 text-gray-400" />
              <span>{customText || t(labelKey)}</span>
            </div>
            <ExternalLink size={16} className="text-gray-500" />
          </a>
        ))}
      </div>

      {/* Copyright - Placed at the bottom */}
      <div className="mt-auto pt-6 text-xs text-gray-500">
        <p>&copy; {new Date().getFullYear()} {t('aboutSettings.brandName')}</p>
      </div>
    </div>
  );
};

export default AboutSettings;