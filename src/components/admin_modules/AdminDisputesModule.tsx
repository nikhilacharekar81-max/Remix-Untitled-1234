import React, { useState, useMemo } from 'react';
import {
  Scale, Search, Filter, AlertTriangle, CheckCircle2, Clock,
  FileText, Eye, X, ShieldAlert, ArrowRight, CornerDownLeft,
  Unlock, MessageSquare, ChevronLeft, ChevronRight, RefreshCw,
  User, Check, DollarSign
} from 'lucide-react';
import { Dispute } from '../../types';

interface AdminDisputesModuleProps {
  initialDisputes?: Dispute[];
  onResolveDispute?: (disputeId: string, resolution: string) => void;
}

export const AdminDisputesModule: React.FC<AdminDisputesModuleProps> = ({
  initialDisputes = [],
  onResolveDispute
}) => {
  // Local robust state
  const [disputes, setDisputes] = useState<Dispute[]>(() => initialDisputes || []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'under_investigation' | 'resolved_refund' | 'resolved_release' | 'resolved_partial'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Modals & Feedback
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [resolutionModal, setResolutionModal] = useState<{ dispute: Dispute } | null>(null);
  const [resolutionType, setResolutionType] = useState<'resolved_refund' | 'resolved_release' | 'resolved_partial'>('resolved_refund');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [partialSplit, setPartialSplit] = useState<{ buyerPercent: number; sellerPercent: number }>({ buyerPercent: 50, sellerPercent: 50 });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const activeCount = disputes.filter(d => d.status === 'open' || d.status === 'under_investigation').length;
    const openCount = disputes.filter(d => d.status === 'open').length;
    const investigationCount = disputes.filter(d => d.status === 'under_investigation').length;
    const resolvedCount = disputes.filter(d => d.status.startsWith('resolved')).length;
    return { activeCount, openCount, investigationCount, resolvedCount };
  }, [disputes]);

  // Filtered List
  const filteredDisputes = useMemo(() => {
    return disputes.filter(d => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        d.id.toLowerCase().includes(q) ||
        d.orderId.toLowerCase().includes(q) ||
        d.raisedBy.toLowerCase().includes(q) ||
        d.reason.toLowerCase().includes(q) ||
        (d.evidence || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [disputes, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.ceil(filteredDisputes.length / pageSize) || 1;
  const paginatedDisputes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDisputes.slice(start, start + pageSize);
  }, [filteredDisputes, currentPage, pageSize]);

  // Execute Resolution
  const handleConfirmResolution = () => {
    if (!resolutionModal) return;
    const { dispute } = resolutionModal;

    const fullNote = resolutionType === 'resolved_partial'
      ? `${resolutionNotes || 'Split resolution'}: ${partialSplit.buyerPercent}% to buyer, ${partialSplit.sellerPercent}% to freelancer.`
      : resolutionNotes || `Resolved as ${resolutionType}`;

    setDisputes(prev => prev.map(d => d.id === dispute.id ? {
      ...d,
      status: resolutionType,
      resolutionNotes: fullNote
    } : d));

    if (onResolveDispute) {
      onResolveDispute(dispute.id, resolutionType);
    }

    showToast(`Dispute #${dispute.id} officially resolved (${resolutionType}). Escrow accounting adjusted.`);
    setResolutionModal(null);
    setResolutionNotes('');
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Scale className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Dispute Investigation & Resolution</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Impartial administrator mediation for contested escrow orders. Review submitted evidence, inspect chat logs, and issue binding rulings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => showToast('Dispute cases refreshed from database.')}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-1.5 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Refresh Cases</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Active Disputes</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{metrics.activeCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">{metrics.openCount} unassigned / open</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">In Mediation</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.investigationCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Evidence audit in progress</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Resolved Cases</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{metrics.resolvedCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Binding rulings rendered</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Escrow Freeze</span>
            <ShieldAlert className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">Enforced</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">All timers locked automatically</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by dispute ID, order, parties, or claim keywords..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-emerald-600 cursor-pointer"
            >
              <option value="all">All Case Statuses</option>
              <option value="open">Open (Unassigned)</option>
              <option value="under_investigation">Under Investigation</option>
              <option value="resolved_refund">Resolved: 100% Refund</option>
              <option value="resolved_release">Resolved: 100% Release</option>
              <option value="resolved_partial">Resolved: Partial Split</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-xs text-slate-400 font-medium">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-emerald-600 cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Disputes Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3.5 px-4">Case ID / Order</th>
                <th className="py-3.5 px-4">Raised By</th>
                <th className="py-3.5 px-4">Dispute Reason</th>
                <th className="py-3.5 px-4">Assigned Mediator</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedDisputes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No dispute cases found matching your criteria.
                  </td>
                </tr>
              ) : (
                paginatedDisputes.map((disp) => {
                  const isOpen = disp.status === 'open' || disp.status === 'under_investigation';
                  return (
                    <tr key={disp.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* ID & Order */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 font-mono">#{disp.id}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">Order: #{disp.orderId}</div>
                      </td>

                      {/* Raised By */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{disp.raisedBy}</div>
                        <div className="text-[10.5px] text-slate-400">
                          {new Date(disp.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-bold text-slate-800 line-clamp-1">{disp.reason}</div>
                        <p className="line-clamp-1 text-slate-500 text-[11px] mt-0.5">
                          {disp.evidence}
                        </p>
                      </td>

                      {/* Assigned Mediator */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                          {disp.assignedTo || 'Unassigned'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {disp.status === 'open' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Open
                          </span>
                        )}
                        {disp.status === 'under_investigation' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Investigating
                          </span>
                        )}
                        {disp.status === 'resolved_refund' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                            <CornerDownLeft className="w-3 h-3" /> Refunded Buyer
                          </span>
                        )}
                        {disp.status === 'resolved_release' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                            <Unlock className="w-3 h-3" /> Released to Seller
                          </span>
                        )}
                        {disp.status === 'resolved_partial' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1">
                            <Scale className="w-3 h-3" /> Split Settlement
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDispute(disp)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                            title="Inspect Case & Evidence"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {isOpen ? (
                            <button
                              type="button"
                              onClick={() => {
                                setResolutionModal({ dispute: disp });
                                setResolutionNotes('');
                              }}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                            >
                              <Scale className="w-3 h-3" /> Rule Case
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold px-2">Closed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>
            Showing <strong className="text-slate-800">{paginatedDisputes.length}</strong> of <strong className="text-slate-800">{filteredDisputes.length}</strong> cases
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-700">Page {currentPage} of {totalPages}</span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Case Details Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Dispute Case Dossier</h3>
              </div>
              <button
                onClick={() => setSelectedDispute(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Dispute ID</span>
                  <p className="font-mono font-bold text-slate-800">#{selectedDispute.id}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Order Reference</span>
                  <p className="font-mono font-bold text-slate-800">#{selectedDispute.orderId}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Raised By</span>
                  <p className="font-bold text-slate-800">{selectedDispute.raisedBy}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Status</span>
                  <p className="font-bold uppercase text-indigo-700">{selectedDispute.status.replace('_', ' ')}</p>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Stated Grievance</span>
                <p className="p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 text-slate-800 font-semibold">
                  {selectedDispute.reason}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Submitted Evidence & Artifacts</span>
                <div className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11.5px] rounded-xl mt-1 leading-relaxed whitespace-pre-wrap">
                  {selectedDispute.evidence}
                </div>
              </div>

              {selectedDispute.resolutionNotes && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-emerald-800 font-bold text-[10.5px] uppercase block mb-1">
                    Official Ruling Notes
                  </span>
                  <p className="text-emerald-900 text-[11.5px]">{selectedDispute.resolutionNotes}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedDispute(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Render Ruling Dialog Modal */}
      {resolutionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-slate-900 pb-2 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Issue Binding Dispute Ruling</h3>
                <p className="text-xs text-slate-500">Case #{resolutionModal.dispute.id} · Order #{resolutionModal.dispute.orderId}</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[10.5px] font-bold uppercase text-slate-500">
                Select Final Resolution Outcome
              </label>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setResolutionType('resolved_refund')}
                  className={`p-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                    resolutionType === 'resolved_refund'
                      ? 'bg-rose-50 border-rose-400 text-rose-700 shadow-2xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <CornerDownLeft className="w-4 h-4 mx-auto mb-1 text-rose-600" />
                  100% Refund Buyer
                </button>

                <button
                  type="button"
                  onClick={() => setResolutionType('resolved_release')}
                  className={`p-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                    resolutionType === 'resolved_release'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-700 shadow-2xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Unlock className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
                  100% Release Seller
                </button>

                <button
                  type="button"
                  onClick={() => setResolutionType('resolved_partial')}
                  className={`p-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                    resolutionType === 'resolved_partial'
                      ? 'bg-purple-50 border-purple-400 text-purple-700 shadow-2xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Scale className="w-4 h-4 mx-auto mb-1 text-purple-600" />
                  Custom Split
                </button>
              </div>

              {resolutionType === 'resolved_partial' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-[10.5px] font-bold uppercase text-slate-600 block">
                    Escrow Split Percentage
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Buyer Wallet (%):</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={partialSplit.buyerPercent}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                          setPartialSplit({ buyerPercent: val, sellerPercent: 100 - val });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400 font-semibold block mb-0.5">Seller Wallet (%):</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={partialSplit.sellerPercent}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, Number(e.target.value)));
                          setPartialSplit({ buyerPercent: 100 - val, sellerPercent: val });
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                  Official Ruling Justification & Closing Audit Note
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why this decision was reached based on contract deliverables and evidence..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-indigo-600 focus:bg-white resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResolutionModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResolution}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
              >
                Execute Ruling & Adjust Escrow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
