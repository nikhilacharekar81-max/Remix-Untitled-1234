import React, { useState, useMemo } from 'react';
import {
  ShieldCheck, Search, Filter, Clock, AlertTriangle, CheckCircle2,
  Lock, Unlock, ArrowRight, DollarSign, Eye, RefreshCw, X, AlertCircle,
  HelpCircle, ChevronLeft, ChevronRight, Pause, Play, FileText
} from 'lucide-react';
import { Order } from '../../types';

interface AdminEscrowModuleProps {
  escrowAccounts?: Order[];
  onReleaseEscrow?: (orderId: string) => void;
  onRefundEscrow?: (orderId: string) => void;
}

export const AdminEscrowModule: React.FC<AdminEscrowModuleProps> = ({
  escrowAccounts = [],
  onReleaseEscrow,
  onRefundEscrow
}) => {
  // Local state for orders (hydrated with props or robust mock data)
  const [orders, setOrders] = useState<Order[]>(() => escrowAccounts || []);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'funded_in_escrow' | 'in_progress' | 'delivered' | 'disputed' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'amount_desc' | 'amount_asc' | 'newest'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Selected order modal for details or manual override
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionModal, setActionModal] = useState<{ type: 'release' | 'refund' | 'pause'; order: Order } | null>(null);
  const [adminReasonText, setAdminReasonText] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics Calculations
  const metrics = useMemo(() => {
    const totalVault = orders
      .filter(o => ['funded_in_escrow', 'in_progress', 'delivered', 'disputed'].includes(o.status))
      .reduce((sum, o) => sum + o.amount, 0);
    const activeLocks = orders.filter(o => ['funded_in_escrow', 'in_progress'].includes(o.status)).length;
    const deliveredCount = orders.filter(o => o.status === 'delivered').length;
    const disputedCount = orders.filter(o => o.status === 'disputed').length;
    return { totalVault, activeLocks, deliveredCount, disputedCount };
  }, [orders]);

  // Filtered and Sorted Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        o.id.toLowerCase().includes(q) ||
        o.title.toLowerCase().includes(q) ||
        (o.buyerUsername || o.buyerId).toLowerCase().includes(q) ||
        (o.sellerUsername || o.sellerId).toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'amount_asc') return a.amount - b.amount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Execute Action Handlers
  const handleConfirmAction = () => {
    if (!actionModal) return;
    const { type, order } = actionModal;

    if (type === 'release') {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'completed' as const, adminNotes: `Admin Override: Escrow released. Reason: ${adminReasonText || 'Manual clearance'}` } : o));
      if (onReleaseEscrow) onReleaseEscrow(order.id);
      showToast(`Escrow of $${order.amount.toLocaleString()} successfully released to seller (${order.sellerUsername || order.sellerId}).`);
    } else if (type === 'refund') {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled' as const, adminNotes: `Admin Override: Escrow refunded to buyer. Reason: ${adminReasonText || 'Full refund granted'}` } : o));
      if (onRefundEscrow) onRefundEscrow(order.id);
      showToast(`Escrow of $${order.amount.toLocaleString()} fully refunded to buyer (${order.buyerUsername || order.buyerId}).`);
    } else if (type === 'pause') {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isTimerPaused: !o.isTimerPaused } : o));
      showToast(`Escrow timer for Order #${order.id} ${order.isTimerPaused ? 'resumed' : 'paused'}.`);
    }

    setActionModal(null);
    setAdminReasonText('');
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header & Description */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Escrow Vault Management</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enforce 100% Milestone Escrow Protection with mandatory 14-day clearance timers, dispute freezes, and admin release overrides.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 font-mono font-bold text-xs border border-emerald-200 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            14-Day Lock Protocol Active
          </span>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Locked in Vault</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${metrics.totalVault.toLocaleString()}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Secured across active milestones</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Active Lock Orders</span>
            <Lock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.activeLocks}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Pending freelancer completion</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Delivered / In Review</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{metrics.deliveredCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Under buyer inspection</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Disputed Holds</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{metrics.disputedCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Escrow timers paused for mediation</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Order ID, title, buyer, seller..."
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
              <option value="all">All Escrow Statuses</option>
              <option value="funded_in_escrow">Funded in Escrow</option>
              <option value="in_progress">In Progress</option>
              <option value="delivered">Delivered (In Review)</option>
              <option value="disputed">Disputed Hold</option>
              <option value="completed">Completed / Released</option>
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

      {/* Main Escrow Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3.5 px-4">Order / Contract</th>
                <th className="py-3.5 px-4">Buyer & Seller</th>
                <th className="py-3.5 px-4">Vault Amount</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">14-Day Protection Timeline</th>
                <th className="py-3.5 px-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No escrow orders found matching your criteria.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((ord) => {
                  const isLocked = ['funded_in_escrow', 'in_progress', 'delivered'].includes(ord.status);
                  const isDisputed = ord.status === 'disputed';
                  const isReleased = ord.status === 'completed';

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Order info */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 line-clamp-1">{ord.title}</div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">#{ord.id}</div>
                      </td>

                      {/* Buyer / Seller */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800">
                          <span className="text-slate-400 text-[10px] uppercase font-bold mr-1">Buyer:</span>
                          <span className="font-semibold">{ord.buyerUsername || ord.buyerId}</span>
                        </div>
                        <div className="text-slate-800 mt-0.5">
                          <span className="text-slate-400 text-[10px] uppercase font-bold mr-1">Seller:</span>
                          <span className="font-semibold">{ord.sellerUsername || ord.sellerId}</span>
                        </div>
                      </td>

                      {/* Vault Amount */}
                      <td className="py-3.5 px-4">
                        <span className="text-sm font-bold text-slate-900 font-mono">
                          ${ord.amount.toLocaleString()}
                        </span>
                        <div className="text-[10px] text-slate-400">100% Escrow Protected</div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {ord.status === 'funded_in_escrow' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Funded & Locked
                          </span>
                        )}
                        {ord.status === 'in_progress' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> In Progress
                          </span>
                        )}
                        {ord.status === 'delivered' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Delivered (Review)
                          </span>
                        )}
                        {ord.status === 'disputed' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Disputed Hold
                          </span>
                        )}
                        {ord.status === 'completed' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Released
                          </span>
                        )}
                        {ord.status === 'cancelled' && (
                          <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
                            <X className="w-3 h-3" /> Refunded / Void
                          </span>
                        )}
                      </td>

                      {/* Timeline */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isDisputed ? 'bg-rose-500' : isReleased ? 'bg-emerald-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: isReleased ? '100%' : isDisputed ? '60%' : '75%' }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {isDisputed ? 'Timer Frozen' : isReleased ? '14 Days Cleared' : '14 Days Locked'}
                          </span>
                        </div>
                        {ord.isTimerPaused && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5 flex items-center gap-1">
                            <Pause className="w-2.5 h-2.5" /> Paused by Super Admin
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                            title="Inspect Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {isLocked && (
                            <>
                              <button
                                type="button"
                                onClick={() => setActionModal({ type: 'release', order: ord })}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer"
                                title="Force Escrow Release to Seller"
                              >
                                Release
                              </button>
                              <button
                                type="button"
                                onClick={() => setActionModal({ type: 'refund', order: ord })}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer"
                                title="Force Full Refund to Buyer"
                              >
                                Refund
                              </button>
                            </>
                          )}

                          {isDisputed && (
                            <button
                              type="button"
                              onClick={() => setActionModal({ type: 'release', order: ord })}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer"
                            >
                              Resolve
                            </button>
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

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>
            Showing <strong className="text-slate-800">{paginatedOrders.length}</strong> of <strong className="text-slate-800">{filteredOrders.length}</strong> escrow accounts
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

      {/* Detail Inspection Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Escrow Account Audit Details</h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Order Title</span>
                <p className="font-semibold text-slate-900 text-sm">{selectedOrder.title}</p>
                <p className="font-mono text-slate-400 text-[11px]">Contract ID: #{selectedOrder.id}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Buyer</span>
                  <p className="font-bold text-slate-800">{selectedOrder.buyerUsername || selectedOrder.buyerId}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Seller</span>
                  <p className="font-bold text-slate-800">{selectedOrder.sellerUsername || selectedOrder.sellerId}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Funded Escrow Amount</span>
                  <p className="font-mono font-bold text-emerald-600 text-sm">${selectedOrder.amount.toLocaleString()} USD</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Vault Protection Window</span>
                  <p className="font-medium text-slate-700">14-Day Mandatory Escrow Lock</p>
                </div>
              </div>

              {selectedOrder.adminNotes && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <span className="text-amber-800 font-bold text-[10.5px] uppercase flex items-center gap-1 mb-1">
                    <FileText className="w-3.5 h-3.5" /> Audit Notes
                  </span>
                  <p className="text-amber-900 text-[11.5px]">{selectedOrder.adminNotes}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-slate-900 pb-2 border-b border-slate-100">
              <div className={`p-2 rounded-xl ${actionModal.type === 'release' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {actionModal.type === 'release' ? <Unlock className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {actionModal.type === 'release' ? 'Confirm Escrow Release' : 'Confirm Escrow Refund'}
                </h3>
                <p className="text-xs text-slate-500">Order #{actionModal.order.id}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to {actionModal.type === 'release' ? 'override and immediately disburse' : 'force refund'}{' '}
              <strong className="font-mono font-bold text-slate-900">${actionModal.order.amount.toLocaleString()} USD</strong>{' '}
              {actionModal.type === 'release' ? 'to the freelancer wallet' : 'back to the client account'}? This action is logged in the permanent audit trail.
            </p>

            <div>
              <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                Admin Rationale / Audit Log Note
              </label>
              <textarea
                rows={3}
                placeholder="Provide internal reason for this escrow override..."
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
                onClick={handleConfirmAction}
                className={`px-4 py-2 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer ${
                  actionModal.type === 'release' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {actionModal.type === 'release' ? 'Confirm & Release Funds' : 'Confirm & Process Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
