import React, { useState } from 'react';
import { Search, Star, ShieldCheck, Clock, CheckCircle2, AlertCircle, ArrowUpRight, MessageSquare, PlusCircle } from 'lucide-react';
import { WorkstreamItem, isInquiryWorkstream } from './types';
import { getStatusBadge } from '../../utils/formatters';
import { DEFAULT_AVATAR } from '../../constants';

interface WorkstreamListProps {
  workstreams: WorkstreamItem[];
  currentUser?: { id: string; role?: string } | null;
  selectedOrderId?: string;
  onSelectOrder: (orderId: string) => void;
  starredIds: string[];
  onToggleStar: (orderId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onStartNewWorkstream: () => void;
  activeTab?: string;
  selectedPersonName?: string | null;
  selectedProjectTitle?: string | null;
  onClearTab?: () => void;
  onClearPersonFilter?: () => void;
  onClearProjectFilter?: () => void;
  onClearAllFilters?: () => void;
}

export const WorkstreamList: React.FC<WorkstreamListProps> = ({
  workstreams,
  currentUser,
  selectedOrderId,
  onSelectOrder,
  starredIds,
  onToggleStar,
  searchQuery,
  onSearchChange,
  onStartNewWorkstream,
  activeTab,
  selectedPersonName,
  selectedProjectTitle,
  onClearTab,
  onClearPersonFilter,
  onClearProjectFilter,
  onClearAllFilters
}) => {
  const [selectedCheckboxes, setSelectedCheckboxes] = useState<string[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedCheckboxes(workstreams.map(w => w.id));
    } else {
      setSelectedCheckboxes([]);
    }
  };

  const handleCheckboxToggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCheckboxes(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const hasActiveFilters = Boolean(
    (activeTab && activeTab !== 'all') || 
    Boolean(searchQuery) || 
    Boolean(selectedPersonName) || 
    Boolean(selectedProjectTitle)
  );

  const activeCount = workstreams.filter(w => w.status === 'work_in_progress' || w.status === 'funded_in_escrow' || w.status === 'delivered' || w.status === 'revision').length;
  const escrowTotal = workstreams.reduce((acc, w) => acc + (w.status !== 'completed' && w.status !== 'cancelled' ? (w.amount || 0) : 0), 0);
  const pendingDeliveryCount = workstreams.filter(w => w.status === 'delivered').length;
  const completedCount = workstreams.filter(w => w.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* SAAS DASHBOARD HEADER & KPI METRICS STRIP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <span>Workstreams & Messages</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-bold">
              {workstreams.length} Total
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage active client collaborations, escrow funding milestones, and real-time deliverables.
          </p>
        </div>
        <button
          onClick={onStartNewWorkstream}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer shrink-0 active:scale-98"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Workstream</span>
        </button>
      </div>

      {/* KPI METRICS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Collaborations</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {activeCount}
          </div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">In Progress or Inquiry</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Escrow Balance Held</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            ${escrowTotal.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Protected in USD Escrow</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Pending Deliveries</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {pendingDeliveryCount}
          </div>
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">Awaiting Client Review</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Completed Jobs</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {completedCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Escrow Funds Released</div>
        </div>
      </div>

      {/* SEARCH BAR & ACTIVE FILTER CHIPS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
          <input
            type="text"
            placeholder="Search workstreams by title, client, or order ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="text-xs text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 px-2 font-medium cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filtered by:</span>
            {activeTab && activeTab !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-medium">
                Tab: {activeTab.replace('_', ' ')}
                {onClearTab && (
                  <button onClick={onClearTab} className="hover:text-slate-300 cursor-pointer ml-0.5">×</button>
                )}
              </span>
            )}
            {selectedPersonName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                Contact: {selectedPersonName}
                {onClearPersonFilter && (
                  <button onClick={onClearPersonFilter} className="hover:text-emerald-950 cursor-pointer ml-0.5">×</button>
                )}
              </span>
            )}
            {selectedProjectTitle && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-xs font-medium max-w-xs truncate">
                Project: {selectedProjectTitle}
                {onClearProjectFilter && (
                  <button onClick={onClearProjectFilter} className="hover:text-blue-950 cursor-pointer ml-0.5">×</button>
                )}
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-medium">
                Query: &quot;{searchQuery}&quot;
                <button onClick={() => onSearchChange('')} className="hover:text-amber-950 cursor-pointer ml-0.5">×</button>
              </span>
            )}
            {onClearAllFilters && (
              <button
                onClick={onClearAllFilters}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-bold ml-auto cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {/* MOBILE OPTIMIZED CARD LIST (VISIBLE ONLY ON MOBILE) */}
      <div className="block md:hidden space-y-3">
        {workstreams.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <div className="flex flex-col items-center justify-center gap-3 max-w-sm mx-auto">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
                <MessageSquare className="w-8 h-8 opacity-40" />
              </div>
              <p className="font-medium text-xs text-slate-500 dark:text-slate-400">
                {hasActiveFilters 
                  ? 'No workstreams matching the active filters.' 
                  : 'You have no active workstreams right now.'}
              </p>
              {hasActiveFilters && onClearAllFilters ? (
                <button
                  onClick={onClearAllFilters}
                  className="mt-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  Clear All Filters
                </button>
              ) : (
                <button
                  onClick={onStartNewWorkstream}
                  className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Start New Workstream</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          workstreams.map((w) => {
            const isStarred = starredIds.includes(w.id);
            const isCurrent = selectedOrderId === w.id;
            const partner = currentUser?.id && w.sellerId === currentUser.id ? (w.buyer || w.seller) : (w.seller || w.buyer);

            return (
              <div
                key={`mob_${w.id}`}
                onClick={() => onSelectOrder(w.id)}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-2xs space-y-3 cursor-pointer active:scale-98 transition-all ${
                  isCurrent ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={partner?.avatar || DEFAULT_AVATAR}
                      className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                      alt={partner?.name || 'Partner'}
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                    />
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">
                        {partner?.name || 'Collaborator'}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        #{w.id}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(w.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Star className={`w-4 h-4 ${isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300 dark:text-slate-600'}`} />
                  </button>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs line-clamp-2">
                    {w.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {w.lastMessage || w.gig?.title || 'Initial collaboration'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="scale-90 origin-left">
                    {getStatusBadge(w.status)}
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 font-mono text-xs">
                      ${w.amount.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">
                      {isInquiryWorkstream(w as any) 
                        ? (w.status === 'completed' ? 'Custom Order Completed' : w.amount > 0 ? 'Custom Order · In Escrow' : 'Custom Order Proposal')
                        : (w.amount > 0 ? 'Escrow Protected' : 'Inquiry')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* TABLE (DESKTOP VIEW) */}
      <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={workstreams.length > 0 && selectedCheckboxes.length === workstreams.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-2 w-10 text-center">★</th>
                <th className="py-3.5 px-4">Contact / Partner</th>
                <th className="py-3.5 px-4">Workstream Scope & Preview</th>
                <th className="py-3.5 px-4">Status & Escrow</th>
                <th className="py-3.5 px-4 text-right">Escrow Amount</th>
                <th className="py-3.5 px-4 text-right">Delivery Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-800 dark:text-slate-200">
              {workstreams.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-sm mx-auto">
                      <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
                        <MessageSquare className="w-8 h-8 opacity-40" />
                      </div>
                      <p className="font-medium text-xs text-slate-500 dark:text-slate-400">
                        {hasActiveFilters 
                          ? 'No workstreams matching the active filters.' 
                          : 'You have no active workstreams right now.'}
                      </p>
                      {hasActiveFilters && onClearAllFilters ? (
                        <button
                          onClick={onClearAllFilters}
                          className="mt-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                          Clear All Filters
                        </button>
                      ) : (
                        <button
                          onClick={onStartNewWorkstream}
                          className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                          <PlusCircle className="w-4 h-4" />
                          <span>Start New Workstream</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                workstreams.map((w) => {
                  const isStarred = starredIds.includes(w.id);
                  const isChecked = selectedCheckboxes.includes(w.id);
                  const isCurrent = selectedOrderId === w.id;
                  const partner = currentUser?.id && w.sellerId === currentUser.id ? (w.buyer || w.seller) : (w.seller || w.buyer);

                  return (
                    <tr
                      key={w.id}
                      onClick={() => onSelectOrder(w.id)}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group ${
                        isCurrent ? 'bg-emerald-50/60 dark:bg-emerald-950/30 font-medium' : ''
                      }`}
                    >
                      <td className="py-4 px-4" onClick={(e) => handleCheckboxToggle(w.id, e)}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-2 text-center" onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(w.id);
                      }}>
                        <button className="focus:outline-none transition-transform hover:scale-110">
                          <Star className={`w-4 h-4 ${
                            isStarred 
                              ? 'text-yellow-400 fill-yellow-400' 
                              : 'text-slate-300 dark:text-slate-600 hover:text-yellow-300'
                          }`} />
                        </button>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={partner?.avatar || DEFAULT_AVATAR}
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                            alt={partner?.name || 'Partner'}
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 dark:text-slate-100 truncate block text-xs">
                              {partner?.name || 'Collaborator'}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              {isInquiryWorkstream(w as any) ? (w.amount > 0 ? `Custom Order #${w.id}` : `Proposal #${w.id}`) : `Order #${w.id}`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 max-w-xs">
                        <div className="truncate">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors block truncate text-xs">
                            {w.title}
                          </span>
                          <span className="text-xs text-slate-400 truncate block mt-0.5">
                            {w.lastMessage || w.gig?.title || w.requirements || 'Initial workstream collaboration established.'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(w.status)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                          ${w.amount.toLocaleString()}
                        </span>
                        <span className={`text-xs block font-medium ${
                          w.status === 'completed' ? 'text-slate-500' : w.status === 'cancelled' ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {isInquiryWorkstream(w as any) ? (
                            w.status === 'completed' ? 'Custom Order Completed ($0 Held)' :
                            w.status === 'cancelled' ? 'Refunded ($0 Held)' :
                            w.amount > 0 ? 'Custom Order · 100% in Escrow' : 'Custom Order Proposal'
                          ) : (
                            w.status === 'completed' ? 'Escrow Released ($0 Held)' :
                            w.status === 'cancelled' ? 'Refunded ($0 Held)' :
                            w.amount > 0 ? '100% in Escrow' : 'Unfunded'
                          )}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="font-mono text-slate-600 dark:text-slate-300 text-xs tabular-nums block">
                          {w.dueDate || '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
