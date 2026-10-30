import React, { useState, useMemo } from 'react';
import {
  CornerDownLeft, Search, Filter, CheckCircle2, Clock, XCircle,
  AlertTriangle, DollarSign, Eye, X, ChevronLeft, ChevronRight,
  RefreshCw, FileText, Check, ShieldAlert
} from 'lucide-react';
import { Refund } from '../../types';

interface AdminRefundsModuleProps {
  initialRefunds?: Refund[];
  onApproveRefund?: (refundId: string) => void;
  onRejectRefund?: (refundId: string) => void;
}

export const AdminRefundsModule: React.FC<AdminRefundsModuleProps> = ({
  initialRefunds = [],
  onApproveRefund,
  onRejectRefund
}) => {
  // Local robust state for client refund requests
  const [refunds, setRefunds] = useState<Refund[]>(() => initialRefunds || []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'amount_desc' | 'amount_asc'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Modals & Feedback
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject'; refund: Refund } | null>(null);
  const [adminReasonText, setAdminReasonText] = useState('');
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [partialAmount, setPartialAmount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const pendingTotal = refunds
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + r.amount, 0);
    const pendingCount = refunds.filter(r => r.status === 'pending').length;
    const approvedTotal = refunds
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + r.amount, 0);
    const rejectedCount = refunds.filter(r => r.status === 'rejected').length;
    return { pendingTotal, pendingCount, approvedTotal, rejectedCount };
  }, [refunds]);

  // Filtered List
  const filteredRefunds = useMemo(() => {
    return refunds.filter(r => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        r.id.toLowerCase().includes(q) ||
        r.orderId.toLowerCase().includes(q) ||
        r.buyerId.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'amount_asc') return a.amount - b.amount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [refunds, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.ceil(filteredRefunds.length / pageSize) || 1;
  const paginatedRefunds = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRefunds.slice(start, start + pageSize);
  }, [filteredRefunds, currentPage, pageSize]);

  // Action execution
  const handleExecuteAction = () => {
    if (!actionModal) return;
    const { type, refund } = actionModal;
    const amountToRefund = isFullRefund ? refund.amount : Math.min(partialAmount, refund.amount);

    if (type === 'approve') {
      setRefunds(prev => prev.map(r => r.id === refund.id ? { ...r, status: 'approved' as const } : r));
      if (onApproveRefund) onApproveRefund(refund.id);
      showToast(`Refund #${refund.id} approved. $${amountToRefund.toLocaleString()} credited to buyer wallet.`);
    } else if (type === 'reject') {
      setRefunds(prev => prev.map(r => r.id === refund.id ? { ...r, status: 'rejected' as const } : r));
      if (onRejectRefund) onRejectRefund(refund.id);
      showToast(`Refund request #${refund.id} rejected. Order funds remain with freelancer.`);
    }

    setActionModal(null);
    setAdminReasonText('');
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
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CornerDownLeft className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Refund Requests & Approvals</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review buyer refund claims, inspect cancellation reasons, and disburse full or partial wallet refunds from escrow.
          </p>
        </div>

        <button
          type="button"
          onClick={() => showToast('Refund requests synchronized.')}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-1.5 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Refresh Claims</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Pending Claims</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${metrics.pendingTotal.toLocaleString()}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">{metrics.pendingCount} claims requiring review</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Refunded</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">${metrics.approvedTotal.toLocaleString()}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Reimbursed to buyer wallets</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Resolution SLA</span>
            <ShieldAlert className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">&lt; 24 Hours</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Buyer protection target</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Rejected Claims</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{metrics.rejectedCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Declined post-investigation</p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by claim ID, order ID, buyer, or keywords..."
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
              <option value="all">All Claim Statuses</option>
              <option value="pending">Pending Admin Action</option>
              <option value="approved">Approved & Refunded</option>
              <option value="rejected">Rejected</option>
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
            <option value="amount_desc">Amount: High to Low</option>
            <option value="amount_asc">Amount: Low to High</option>
          </select>
        </div>
      </div>

      {/* Refunds Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3.5 px-4">Claim ID / Order</th>
                <th className="py-3.5 px-4">Claimant (Buyer)</th>
                <th className="py-3.5 px-4">Refund Amount</th>
                <th className="py-3.5 px-4">Stated Reason</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedRefunds.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No refund requests matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedRefunds.map((ref) => (
                  <tr key={ref.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* ID & Order */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 font-mono">#{ref.id}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">Order: #{ref.orderId}</div>
                    </td>

                    {/* Buyer */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{ref.buyerId}</div>
                      <div className="text-[10.5px] text-slate-400">
                        {new Date(ref.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4">
                      <div className="text-sm font-bold text-slate-900 font-mono">
                        ${ref.amount.toLocaleString()} USD
                      </div>
                    </td>

                    {/* Reason */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="line-clamp-2 text-slate-600 text-[11.5px] leading-relaxed">
                        {ref.reason}
                      </p>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {ref.status === 'pending' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Under Review
                        </span>
                      )}
                      {ref.status === 'approved' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Refunded
                        </span>
                      )}
                      {ref.status === 'rejected' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Rejected
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedRefund(ref)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                          title="Inspect Claim"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {ref.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setActionModal({ type: 'approve', refund: ref });
                                setIsFullRefund(true);
                                setPartialAmount(ref.amount);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setActionModal({ type: 'reject', refund: ref })}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>
            Showing <strong className="text-slate-800">{paginatedRefunds.length}</strong> of <strong className="text-slate-800">{filteredRefunds.length}</strong> claims
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

      {/* Inspect Claim Modal */}
      {selectedRefund && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CornerDownLeft className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Refund Claim Investigation</h3>
              </div>
              <button
                onClick={() => setSelectedRefund(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Claim ID</span>
                  <p className="font-mono font-bold text-slate-800">#{selectedRefund.id}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Order Reference</span>
                  <p className="font-mono font-bold text-slate-800">#{selectedRefund.orderId}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Claimant Buyer</span>
                  <p className="font-bold text-slate-800">{selectedRefund.buyerId}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Claim Amount</span>
                  <p className="font-mono font-bold text-emerald-600 text-sm">${selectedRefund.amount.toLocaleString()} USD</p>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Buyer's Stated Justification</span>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 text-slate-800 leading-relaxed">
                  {selectedRefund.reason}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedRefund(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Approval / Rejection Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-slate-900 pb-2 border-b border-slate-100">
              <div className={`p-2 rounded-xl ${actionModal.type === 'approve' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {actionModal.type === 'approve' ? <Check className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {actionModal.type === 'approve' ? 'Approve & Issue Refund' : 'Reject Refund Claim'}
                </h3>
                <p className="text-xs text-slate-500">Order #{actionModal.refund.orderId}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              {actionModal.type === 'approve'
                ? 'Approving will release the escrow funds directly back into the buyer’s wallet and cancel the active project order.'
                : 'Rejecting will decline the buyer claim and uphold the order milestone escrow for the freelancer.'}
            </p>

            {actionModal.type === 'approve' && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={isFullRefund}
                      onChange={() => setIsFullRefund(true)}
                      className="text-emerald-600"
                    />
                    <span className="font-semibold text-slate-800">Full 100% Refund (${actionModal.refund.amount})</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={!isFullRefund}
                      onChange={() => setIsFullRefund(false)}
                      className="text-emerald-600"
                    />
                    <span className="font-semibold text-slate-800">Partial Settlement</span>
                  </label>
                </div>

                {!isFullRefund && (
                  <div>
                    <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                      Partial Amount to Credit Buyer ($)
                    </label>
                    <input
                      type="number"
                      max={actionModal.refund.amount}
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono font-bold focus:outline-emerald-600"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                Admin Audit Notes / Resolution Log
              </label>
              <textarea
                rows={2}
                placeholder="Internal rationale..."
                value={adminReasonText}
                onChange={(e) => setAdminReasonText(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                className={`px-4 py-2 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer ${
                  actionModal.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {actionModal.type === 'approve' ? 'Confirm Refund' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
