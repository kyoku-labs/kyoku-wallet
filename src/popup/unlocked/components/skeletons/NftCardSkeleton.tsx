// src/popup/unlocked/components/skeletons/NftCardSkeleton.tsx
import React from 'react';

const NftCardSkeleton: React.FC = () => {
  return (
    <div className="bg-[#161E2D] rounded-lg overflow-hidden shadow-md">
      <div className="aspect-square w-full bg-gray-700 animate-pulse"></div>
      <div className="p-2 space-y-1.5">
        <div className="h-3 w-5/6 bg-gray-700 rounded animate-pulse"></div>
        <div className="h-2 w-3/4 bg-gray-700 rounded animate-pulse"></div>
      </div>
    </div>
  );
};
export default NftCardSkeleton;