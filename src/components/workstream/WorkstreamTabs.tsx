import React from 'react';

export interface WorkstreamTabsProps {
  children?: React.ReactNode;
}

export const WorkstreamTabs: React.FC<WorkstreamTabsProps> = ({ children }) => {
  return (
    <div className="workstream-tabs flex border-b border-gray-200 bg-white">
      {children}
    </div>
  );
};
