import React from 'react';
import { Clock } from 'lucide-react';

export interface WorkstreamHeaderProps {
  title?: string;
  subtitle?: string;
  reviewWindowRemaining?: string;
  isBuyer?: boolean;
  isCancellationPending?: boolean;
  children?: React.ReactNode;
}

export const WorkstreamHeader: React.FC<WorkstreamHeaderProps> = ({
  title,
  subtitle,
  reviewWindowRemaining,
  isBuyer,
  isCancellationPending,
  children
}) => {
  return (
    <header className="workstream-header border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          {title && <h2 className="text-xl font-bold text-gray-900">{title}</h2>}
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        {reviewWindowRemaining && !isCancellationPending && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl text-amber-800 text-xs font-medium shrink-0">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>{isBuyer ? 'Buyer Review Window: ' : 'Review Window: '}</span>
            <strong className="font-mono font-bold text-amber-900">{reviewWindowRemaining}</strong>
          </div>
        )}
      </div>
      {children}
    </header>
  );
};
