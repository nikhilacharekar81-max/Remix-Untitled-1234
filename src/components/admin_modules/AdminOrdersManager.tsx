import React, { useState, useMemo } from 'react';
import { 
  Package, Search, Filter, Eye, CheckCircle2, AlertTriangle, 
  Clock, X, Check, RefreshCw, ChevronLeft, ChevronRight, 
  DollarSign, ShieldCheck, User, MessageSquare, Ban, Award
} from 'lucide-react';
import { Order, UserAccount, Gig } from '../../types';

interface AdminOrdersManagerProps {
  orders?: Order[];
  users?: UserAccount[];
  gigs?: Gig[];
  currentUser?: UserAccount | null;
  onRefreshOrders?: () => void;
  getGigUrl?: (gig: any) => string;
}

export const AdminOrdersManager: React.FC<AdminOrdersManagerProps> = ({
  orders = [],
  users = [],
  gigs = [],
  currentUser,
  onRefreshOrders,
  getGigUrl
}) => {
  const [localOrders, setLocalOrders] = useState<Order[]>(() => orders || []);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editStatusModalOrder, setEditStatusModalOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<Order['status']>('funded_in_escrow');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const filteredOrders = useMemo(() => {
    return localOrders.filter(order => {
      const matchesSearch = 
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.serviceTitle && order.serviceTitle.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [localOrders, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const handleUpdateStatus = () => {
    if (!editStatusModalOrder) return;
    setLocalOrders(prev => prev.map(o => o.id === editStatusModalOrder.id ? { ...o, status: newStatus } : o));
    setEditStatusModalOrder(null);
    if (onRefreshOrders) onRefreshOrders();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">All Client Orders & Escrow Contracts</h2>
            <p className="text-xs text-slate-500">Monitor all transactions, milestone deliverables, disputes, and completion handoffs</p>
          </div>
        </div>
        <button
          onClick={() => { if (onRefreshOrders) onRefreshOrders(); }}
          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync Realtime</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search orders by ID, gig title, or milestone scope..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
        >
          <option value="all">All Order Stages</option>
          <option value="funded_in_escrow">Funded in Escrow</option>
          <option value="in_progress">In Progress</option>
          <option value="delivered">Delivered</option>
          <option value="completed">Completed</option>
          <option value="disputed">Disputed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Order ID & Service</th>
                <th className="py-3 px-4">Parties</th>
                <th className="py-3 px-4">Escrow Value</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                    No customer orders found.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3.5 px-4 max-w-xs">
                    <div className="font-mono font-bold text-emerald-600">{order.id}</div>
                    <div className="font-semibold text-slate-900 line-clamp-1">{order.title}</div>
                    {order.serviceTitle && (
                      <div className="text-[11px] text-slate-400 line-clamp-1">{order.serviceTitle}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="text-[11px]">
                      <span className="text-slate-400">Buyer: </span>
                      <span className="font-semibold text-slate-800">{order.buyerUsername || order.buyerId}</span>
                    </div>
                    <div className="text-[11px]">
                      <span className="text-slate-400">Seller: </span>
                      <span className="font-semibold text-slate-800">{order.sellerUsername || order.sellerId}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">
                    ${order.amount.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">
                    {new Date(order.dueDate).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4">
                    {order.status === 'funded_in_escrow' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        In Escrow
                      </span>
                    )}
                    {order.status === 'in_progress' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        In Progress
                      </span>
                    )}
                    {order.status === 'delivered' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        Delivered
                      </span>
                    )}
                    {order.status === 'completed' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Completed
                      </span>
                    )}
                    {order.status === 'disputed' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        Disputed
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setEditStatusModalOrder(order); setNewStatus(order.status); }}
                        className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
                        title="Change status"
                      >
                        <Filter className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{selectedOrder.id}</span>
                <h3 className="text-lg font-bold text-slate-900">{selectedOrder.title}</h3>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl space-y-2 text-xs">
              <div><span className="font-bold text-slate-700">Contract Amount:</span> ${selectedOrder.amount.toFixed(2)}</div>
              <div><span className="font-bold text-slate-700">Current Status:</span> {selectedOrder.status}</div>
              <div><span className="font-bold text-slate-700">Due Date:</span> {new Date(selectedOrder.dueDate).toLocaleDateString()}</div>
              {selectedOrder.requirements && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <span className="font-bold text-slate-700 block">Client Scope:</span>
                  <p className="text-slate-600 mt-1">{selectedOrder.requirements}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Modal */}
      {editStatusModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Change Status for {editStatusModalOrder.id}</h3>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
            >
              <option value="funded_in_escrow">Funded in Escrow</option>
              <option value="in_progress">In Progress</option>
              <option value="delivered">Delivered</option>
              <option value="completed">Completed</option>
              <option value="disputed">Disputed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditStatusModalOrder(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700"
              >
                Save Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
