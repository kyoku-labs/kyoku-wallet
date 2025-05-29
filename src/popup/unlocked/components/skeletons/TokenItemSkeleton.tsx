// src/popup/unlocked/components/skeletons/TokenItemSkeleton.tsx
import React from 'react';

const TokenItemSkeleton: React.FC = () => {
  return (
    <li className="flex items-center justify-between p-2.5 -mx-1 rounded-lg">
      <div className="flex items-center space-x-3 overflow-hidden min-w-0">
        <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse flex-shrink-0"></div>
        <div className="overflow-hidden space-y-1.5 flex-grow">
          <div className="h-4 w-3/4 bg-gray-700 rounded animate-pulse"></div>
          <div className="h-3 w-1/2 bg-gray-700 rounded animate-pulse"></div>
        </div>
      </div>
      <div className="text-right flex-shrink-0 pl-2 space-y-1.5">
        <div className="h-4 w-12 bg-gray-700 rounded animate-pulse"></div>
        <div className="h-3 w-10 bg-gray-700 rounded animate-pulse"></div>
      </div>
    </li>
  );
};
export default TokenItemSkeleton;


