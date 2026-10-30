import React from 'react';

interface UserActivitySummarySidebarProps {
  activeSection?: 'projects' | 'gigs';
  // Gigs metrics
  totalOffers: number;
  activeOffersCount: number;
  completedOrdersCount: number;
  totalEarnings: number;
  // Projects metrics
  pendingProposalsCount?: number;
  awardedProjectsCount?: number;
  inProgressProjectsCount?: number;
  projectEarnings?: number;
}

export const UserActivitySummarySidebar: React.FC<UserActivitySummarySidebarProps> = ({
  activeSection = 'gigs',
  totalOffers,
  activeOffersCount,
  completedOrdersCount,
  totalEarnings,
  pendingProposalsCount = 0,
  awardedProjectsCount = 0,
  inProgressProjectsCount = 0,
  projectEarnings = 0
}) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5 font-sans">
      <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-emerald-50 inline-block shrink-0" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
          MY ACTIVITY SUMMARY
        </h3>
      </div>

      {activeSection === 'projects' ? (
        <div className="space-y-3.5 text-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span>Projects with pending Proposals</span>
            <span className="font-bold text-slate-900">{pendingProposalsCount}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Projects I got awarded</span>
            <span className="font-bold text-slate-900">{awardedProjectsCount}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Projects in progress</span>
            <span className="font-bold text-slate-900">{inProgressProjectsCount}</span>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-slate-700">Earnings</span>
            <span className="font-bold text-emerald-600 text-base">${projectEarnings.toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5 text-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span>Gigs I posted</span>
            <span className="font-bold text-slate-900">{totalOffers}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Active Gigs</span>
            <span className="font-bold text-slate-900">{activeOffersCount}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Gigs sold</span>
            <span className="font-bold text-slate-900">{completedOrdersCount}</span>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-slate-700">Earnings</span>
            <span className="font-bold text-emerald-600 text-base">${totalEarnings.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};
