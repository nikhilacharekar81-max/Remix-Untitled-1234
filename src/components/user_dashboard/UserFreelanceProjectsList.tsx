import React from 'react';
import { MapPin } from 'lucide-react';
import { Order } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';
import { formatCompactAmount } from '../../utils/formatters';

export interface FreelancerProjectActivityItem {
  id: string;
  title: string;
  buyerName: string;
  buyerAvatar: string;
  awardedDate: string;
  proposalAmount: number;
  earningsAmount: number;
  location: string;
  refNumber: string;
  statusCategory: 'pending_proposals' | 'in_progress' | 'completed';
  order?: Order;
  workstreamOrderId?: string;
  projectId?: string;
}

interface UserFreelanceProjectsListProps {
  items?: FreelancerProjectActivityItem[];
  orders?: Order[];
  freelanceSubFilter: string;
  onOpenWorkstream: (orderId: string, order?: Order, projectId?: string) => void;
}

export const UserFreelanceProjectsList: React.FC<UserFreelanceProjectsListProps> = ({
  items,
  orders = [],
  freelanceSubFilter,
  onOpenWorkstream
}) => {
  const resolvedItems: FreelancerProjectActivityItem[] = items ?? orders.map(ord => ({
    id: ord.id,
    title: ord.title,
    buyerName: (ord as any).buyerName || ord.buyerUsername || 'Client',
    buyerAvatar: (ord as any).buyerAvatar || DEFAULT_AVATAR,
    awardedDate: ord.createdAt,
    proposalAmount: Number(ord.amount || 0),
    earningsAmount: Number(ord.amount || 0),
    location: 'Remote',
    refNumber: ord.id.replace(/\D/g, '').slice(0, 7) || ord.id.replace(/^ord_/, '').slice(0, 7).toUpperCase(),
    statusCategory: ord.status === 'completed' ? 'completed' : 'in_progress',
    order: ord,
    workstreamOrderId: ord.id,
    projectId: ord.projectId
  }));

  if (resolvedItems.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500 text-sm space-y-1.5 bg-white font-sans">
        <p className="font-bold text-slate-900 text-base">No projects found under &ldquo;{freelanceSubFilter}&rdquo;.</p>
        <p className="text-slate-500 text-sm">Projects you are working on, completed projects, and proposals will appear here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white divide-y divide-slate-200/80 font-sans">
      {resolvedItems.map(item => {
        const isPendingProposal = item.statusCategory === 'pending_proposals';
        const isCompleted = item.statusCategory === 'completed';
        const targetOrderId = item.workstreamOrderId || item.order?.id || '';

        return (
          <div
            key={item.id}
            className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors"
          >
            {/* Left Side: Project Title + Metadata Row */}
            <div className="space-y-3 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => onOpenWorkstream(targetOrderId, item.order, item.projectId)}
                className="text-left text-base font-bold text-slate-900 hover:text-emerald-600 transition-colors leading-snug cursor-pointer block"
              >
                {item.title}
              </button>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-500">
                <div className="inline-flex items-center gap-2 text-slate-800 font-semibold">
                  <img
                    src={item.buyerAvatar || DEFAULT_AVATAR}
                    alt={item.buyerName}
                    className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                    }}
                  />
                  <span>{item.buyerName}</span>
                </div>

                <span>
                  {isPendingProposal ? 'Proposed:' : 'Awarded:'}{' '}
                  <strong className="font-semibold text-slate-700">{item.awardedDate}</strong>
                </span>

                <span>
                  My Proposal:{' '}
                  <strong className="font-bold text-slate-900">
                    ${item.proposalAmount.toLocaleString()}
                  </strong>
                </span>

                <span className="inline-flex items-center gap-1 text-slate-500">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{item.location}</span>
                </span>

                <span className="text-slate-400 font-medium">#{item.refNumber}</span>

                {isCompleted && (
                  <span className="text-emerald-600 font-semibold">· Completed</span>
                )}
              </div>
            </div>

            {/* Right Side: Project Earnings + VIEW PROGRESS Button */}
            <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 sm:min-w-[155px] gap-2.5">
              <div className="text-left sm:text-right leading-none">
                <span className="block text-xl font-bold text-slate-900 tracking-tight">
                  ${formatCompactAmount(item.earningsAmount)}
                </span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                  EARNINGS
                </span>
              </div>

              <button
                type="button"
                onClick={() => onOpenWorkstream(targetOrderId, item.order, item.projectId)}
                className="px-4 py-2 bg-white hover:bg-emerald-50/50 text-slate-700 hover:text-emerald-600 border border-slate-200 hover:border-emerald-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-2xs cursor-pointer whitespace-nowrap"
              >
                VIEW PROGRESS
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
