import React from 'react';

const SimpleLoader = () => {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="w-16 h-16 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      <p className="mt-4 text-gray-600 text-lg">Loading, please wait...</p>
    </div>
  );
};

export default SimpleLoader;
