// src/popup/unlocked/components/skeletons/ActivityItemSkeleton.tsx
import React from 'react';

const ActivityItemSkeleton: React.FC = () => {
  return (
    <div className="flex items-center p-3">
      <div className="w-10 h-10 rounded-full mr-3 flex-shrink-0 bg-gray-700 animate-pulse"></div>
      <div className="flex-grow min-w-0 space-y-1.5">
        <div className="flex justify-between items-center">
          <div className="h-4 w-2/5 bg-gray-700 rounded animate-pulse"></div>
          <div className="h-4 w-1/5 bg-gray-700 rounded animate-pulse"></div>
        </div>
        <div className="flex justify-between items-center">
          <div className="h-3 w-1/3 bg-gray-700 rounded animate-pulse"></div>
          <div className="h-3 w-1/4 bg-gray-700 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};
export default ActivityItemSkeleton;