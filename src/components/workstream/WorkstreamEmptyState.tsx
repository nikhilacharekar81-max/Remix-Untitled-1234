import React from 'react';

export interface WorkstreamEmptyStateProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

export const WorkstreamEmptyState: React.FC<WorkstreamEmptyStateProps> = ({
  title = 'No workstreams found',
  description,
  children
}) => {
  return (
    <div className="workstream-empty-state flex flex-col items-center justify-center p-8 text-center">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {children}
    </div>
  );
};
