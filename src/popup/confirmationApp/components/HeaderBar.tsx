// src/popup/confirmationApp/components/HeaderBar.tsx
import React from 'react';

interface HeaderBarProps {
  title: string; // This will be passed as a translated string from the parent
  accountSelectorTrigger?: React.ReactNode; // Slot for the account selector icon/button
}

const HeaderBar: React.FC<HeaderBarProps> = ({ title, accountSelectorTrigger }) => {
  return (
    <div className="flex items-center justify-between relative py-2 px-3 flex-shrink-0 border-b border-gray-700/50 pb-2.5 h-14"> {/* Fixed height */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
        {/* Account selector trigger will be placed here */}
        {accountSelectorTrigger}
      </div>
      <h2 className="text-lg font-semibold text-center text-gray-200 w-full truncate px-10"> 
        {/* Increased px to ensure title doesn't overlap with potential left icon */}
        {title} {/* This `title` prop is expected to be translated by the parent component */}
      </h2>
      {/* Invisible spacer to help center title if only left element exists */}
      <div className="w-8 h-8 opacity-0" /> 
    </div>
  );
};

export default HeaderBar;