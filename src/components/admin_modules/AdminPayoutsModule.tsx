import React, { useState, useMemo } from 'react';
import {
  TrendingUp, Search, Filter, CheckCircle2, Clock, XCircle,
  Building2, CreditCard, DollarSign, Download, Eye, X, AlertCircle,
  ChevronLeft, ChevronRight, Check, RefreshCw, Send, ArrowUpRight
} from 'lucide-react';
import { Payout } from '../../types';

interface AdminPayoutsModuleProps {
  initialPayouts?: Payout[];
  onApprovePayout?: (payoutId: string) => void;
  onRejectPayout?: (payoutId: string) => void;
}

export const AdminPayoutsModule: React.FC<AdminPayoutsModuleProps> = ({
  initialPayouts = [],
  onApprovePayout,
  onRejectPayout
}) => {
  // Local robust state for freelancer withdrawal requests
  const [payouts, setPayouts] = useState<Payout[]>(() => initialPayouts || []);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'processed' | 'failed' | 'cancelled'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'bank' | 'paypal' | 'stripe' | 'upi'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'amount_desc' | 'amount_asc'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Modals & Feedback
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'process' | 'reject'; payout: Payout } | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const pendingTotal = payouts
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingCount = payouts.filter(p => p.status === 'pending').length;
    const processedTotal = payouts
      .filter(p => p.status === 'processed')
      .reduce((sum, p) => sum + p.amount, 0);
    const failedCount = payouts.filter(p => p.status === 'failed' || p.status === 'cancelled').length;
    return { pendingTotal, pendingCount, processedTotal, failedCount };
  }, [payouts]);

  // Filtered list
  const filteredPayouts = useMemo(() => {
    return payouts.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        p.id.toLowerCase().includes(q) ||
        p.freelancerId.toLowerCase().includes(q) ||
        p.accountDetails.toLowerCase().includes(q) ||
        p.method.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesMethod = methodFilter === 'all' || p.method === methodFilter;
      return matchesSearch && matchesStatus && matchesMethod;
    }).sort((a, b) => {
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'amount_asc') return a.amount - b.amount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [payouts, searchQuery, statusFilter, methodFilter, sortBy]);

  const totalPages = Math.ceil(filteredPayouts.length / pageSize) || 1;
  const paginatedPayouts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPayouts.slice(start, start + pageSize);
  }, [filteredPayouts, currentPage, pageSize]);

  // Action execution
  const handleExecuteAction = () => {
    if (!actionModal) return;
    const { type, payout } = actionModal;

    if (type === 'approve') {
      setPayouts(prev => prev.map(p => p.id === payout.id ? { ...p, status: 'approved' as const } : p));
      if (onApprovePayout) onApprovePayout(payout.id);
      showToast(`Payout #${payout.id} approved for disbursement.`);
    } else if (type === 'process') {
      setPayouts(prev => prev.map(p => p.id === payout.id ? { ...p, status: 'processed' as const } : p));
      showToast(`Payout #${payout.id} ($${payout.amount}) marked as completed & funds disbursed.`);
    } else if (type === 'reject') {
      setPayouts(prev => prev.map(p => p.id === payout.id ? { ...p, status: 'cancelled' as const } : p));
      if (onRejectPayout) onRejectPayout(payout.id);
      showToast(`Payout #${payout.id} rejected and funds returned to freelancer available balance.`);
    }

    setActionModal(null);
    setTransactionRef('');
    setAdminNote('');
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
              <TrendingUp className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Freelancer Payouts & Disbursements</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authorize, review, and disburse withdrawal requests to freelancer bank accounts, PayPal, Stripe, and UPI.
          </p>
        </div>

        <button
          type="button"
          onClick={() => showToast('Payout queue refreshed with gateway ledger.')}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-1.5 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Pending Approvals</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${metrics.pendingTotal.toLocaleString()}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">{metrics.pendingCount} withdrawals awaiting review</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Disbursed Volume</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">${metrics.processedTotal.toLocaleString()}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Successfully processed to date</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Active Gateways</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">4 Gateways</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Bank Wire, PayPal, Stripe, UPI</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Failed / Rejected</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{metrics.failedCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Returned to available balance</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by payout ID, freelancer, bank, email..."
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
              <option value="all">All Statuses</option>
              <option value="pending">Pending Approval</option>
              <option value="approved">Approved (Queued)</option>
              <option value="processed">Processed (Paid)</option>
              <option value="failed">Failed / Cancelled</option>
            </select>

            <select
              value={methodFilter}
              onChange={(e) => { setMethodFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-emerald-600 cursor-pointer"
            >
              <option value="all">All Methods</option>
              <option value="bank">Bank Transfer</option>
              <option value="paypal">PayPal</option>
              <option value="stripe">Stripe</option>
              <option value="upi">UPI</option>
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
            <option value="newest">Newest Request</option>
            <option value="amount_desc">Amount: High to Low</option>
            <option value="amount_asc">Amount: Low to High</option>
          </select>
        </div>
      </div>

      {/* Payouts Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3.5 px-4">Payout ID / Date</th>
                <th className="py-3.5 px-4">Freelancer</th>
                <th className="py-3.5 px-4">Amount</th>
                <th className="py-3.5 px-4">Disbursement Method</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedPayouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No withdrawal requests matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedPayouts.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* ID & Date */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 font-mono">#{pay.id}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(pay.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </td>

                    {/* Freelancer */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{pay.freelancerId}</div>
                      <div className="text-[10.5px] text-slate-400 font-mono truncate max-w-xs">{pay.accountDetails}</div>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4">
                      <div className="text-sm font-bold text-slate-900 font-mono">
                        ${pay.amount.toLocaleString()} USD
                      </div>
                    </td>

                    {/* Method */}
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase inline-flex items-center gap-1">
                        {pay.method === 'bank' && <Building2 className="w-3 h-3 text-slate-600" />}
                        {pay.method === 'paypal' && <CreditCard className="w-3 h-3 text-indigo-600" />}
                        {pay.method === 'stripe' && <CreditCard className="w-3 h-3 text-emerald-600" />}
                        {pay.method === 'upi' && <DollarSign className="w-3 h-3 text-amber-600" />}
                        {pay.method}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {pay.status === 'pending' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pending Review
                        </span>
                      )}
                      {pay.status === 'approved' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> Approved (Queued)
                        </span>
                      )}
                      {pay.status === 'processed' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Disbursed
                        </span>
                      )}
                      {pay.status === 'failed' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Gateway Failed
                        </span>
                      )}
                      {pay.status === 'cancelled' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
                          <X className="w-3 h-3" /> Cancelled
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedPayout(pay)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                          title="View Account Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {pay.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setActionModal({ type: 'approve', payout: pay })}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setActionModal({ type: 'reject', payout: pay })}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {pay.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => setActionModal({ type: 'process', payout: pay })}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" /> Mark Sent
                          </button>
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
            Showing <strong className="text-slate-800">{paginatedPayouts.length}</strong> of <strong className="text-slate-800">{filteredPayouts.length}</strong> withdrawal requests
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

      {/* Detail Modal */}
      {selectedPayout && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Withdrawal Account Verification</h3>
              </div>
              <button
                onClick={() => setSelectedPayout(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Payout Request ID</span>
                  <p className="font-mono font-bold text-slate-800">#{selectedPayout.id}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Requested Amount</span>
                  <p className="font-mono font-bold text-emerald-600 text-sm">${selectedPayout.amount.toLocaleString()} USD</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Freelancer ID</span>
                  <p className="font-bold text-slate-800">{selectedPayout.freelancerId}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Method</span>
                  <p className="font-bold uppercase text-slate-800">{selectedPayout.method}</p>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Beneficiary Account Coordinates</span>
                <p className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl mt-1 break-all">
                  {selectedPayout.accountDetails}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedPayout(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Dialog Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-slate-900 pb-2 border-b border-slate-100">
              <div className={`p-2 rounded-xl ${
                actionModal.type === 'approve' ? 'bg-emerald-50 text-emerald-600' :
                actionModal.type === 'process' ? 'bg-blue-50 text-blue-600' :
                'bg-rose-50 text-rose-600'
              }`}>
                {actionModal.type === 'approve' && <Check className="w-5 h-5" />}
                {actionModal.type === 'process' && <Send className="w-5 h-5" />}
                {actionModal.type === 'reject' && <XCircle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {actionModal.type === 'approve' && 'Approve Payout Request'}
                  {actionModal.type === 'process' && 'Confirm Bank Disbursement'}
                  {actionModal.type === 'reject' && 'Reject Payout Request'}
                </h3>
                <p className="text-xs text-slate-500">#{actionModal.payout.id} · ${actionModal.payout.amount} USD</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              {actionModal.type === 'approve' && 'This marks the withdrawal as vetted by admin. It will move to the queue for bank/gateway execution.'}
              {actionModal.type === 'process' && 'Confirm that the external transfer has completed. This records a final ledger payout debit.'}
              {actionModal.type === 'reject' && 'Rejecting this request will immediately credit the funds back into the freelancer wallet balance.'}
            </p>

            {actionModal.type === 'process' && (
              <div>
                <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                  Bank / Gateway Transaction Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. TR_9182390842"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                Admin Note / Audit Record
              </label>
              <textarea
                rows={2}
                placeholder="Internal audit notes..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
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
                  actionModal.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' :
                  actionModal.type === 'process' ? 'bg-blue-600 hover:bg-blue-500' :
                  'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {actionModal.type === 'approve' && 'Confirm Approval'}
                {actionModal.type === 'process' && 'Confirm Disbursed'}
                {actionModal.type === 'reject' && 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
