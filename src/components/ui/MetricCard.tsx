import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  badgeText?: string;
  badgeColor?: string;
  isMono?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor = 'text-emerald-600',
  badgeText,
  badgeColor = 'text-emerald-600 font-medium',
  isMono = true
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</span>
        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center">
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <div className={`text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight ${isMono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </div>
      {badgeText && (
        <span className={`text-xs ${badgeColor} mt-1.5 inline-block`}>{badgeText}</span>
      )}
    </div>
  );
};

