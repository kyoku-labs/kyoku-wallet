// src/popup/unlocked/components/TabSelector.tsx
import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // Import useTranslation

interface TabSelectorProps {
  activeTabName: string;
  tabs: string[]; // These are expected to be translated by the parent if they are static keys
  onTabChange: (tab: string) => void;
  onToggleExpandView: () => void;
}

const TabSelector: React.FC<TabSelectorProps> = ({
  tabs,
  activeTabName,
  onTabChange,
  onToggleExpandView
}) => {
  const { t } = useTranslation(); // Initialize useTranslation
  const activeIndex = tabs.indexOf(activeTabName);

  const handlePrevClick = () => {
    const newIndex = activeIndex === 0 ? tabs.length - 1 : activeIndex - 1;
    onTabChange(tabs[newIndex]);
  };

  const handleNextClick = () => {
    const newIndex = activeIndex === tabs.length - 1 ? 0 : activeIndex + 1;
    onTabChange(tabs[newIndex]);
  };

  const handleDotClick = (index: number) => {
    onTabChange(tabs[index]);
  };

  return (
    // MODIFIED HERE: Changed mb-2 mt-2 to just mb-1
    <div className="flex items-center justify-center space-x-3 mb-1 relative h-auto">
      <button
        onClick={handlePrevClick}
        className="text-gray-400 hover:text-white focus:outline-none p-2 rounded-full hover:bg-gray-700/50 text-xl"
        aria-label={t('tabSelector.previousTab')} // Translate
      >
        <ChevronLeft size={20} />
      </button>

      <div className="flex items-center space-x-2">
        {tabs.map((tabName, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={`focus:outline-none w-2 h-2 rounded-full 
              ${index === activeIndex ? 'bg-blue-500' : 'bg-gray-600 hover:bg-gray-500'}
            `}
            // The `tabName` prop is assumed to be already translated if it's from a static list.
            // If `tabName` itself is a translation key, you'd do t(tabName).
            // For this example, we assume tabName is the final display string.
            aria-label={t('tabSelector.switchToTab', { tabName: tabName })} // Translate
          />
        ))}
      </div>

      <button
        onClick={handleNextClick}
        className="text-gray-400 hover:text-white focus:outline-none p-2 rounded-full hover:bg-gray-700/50 text-xl"
        aria-label={t('tabSelector.nextTab')} // Translate
      >
        <ChevronRight size={20} />
      </button>

      <button
        onClick={onToggleExpandView}
        className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700/50 focus:outline-none text-lg"
        aria-label={t('tabSelector.expandContentView')} // Translate
        // title attribute removed
      >
        <ChevronsUpDown size={18} />
      </button>
    </div>
  );
};

export default TabSelector;