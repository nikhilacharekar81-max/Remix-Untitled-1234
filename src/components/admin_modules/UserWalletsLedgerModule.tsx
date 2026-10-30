import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Wallet, Search, ArrowUpRight, ArrowDownLeft, ShieldCheck, 
  CreditCard, DollarSign, Filter, RefreshCw, User, CheckCircle2,
  Lock, AlertTriangle, ChevronLeft, ExternalLink, PlusCircle, MinusCircle, Snowflake, Sun, Eye, X, Edit3, Sliders
} from 'lucide-react';
import { UserAccount } from '../../types';
import { getAuthToken } from '../../utils/authToken';

interface UserWalletsLedgerModuleProps {
  currentUser?: UserAccount | null;
}

export const UserWalletsLedgerModule: React.FC<UserWalletsLedgerModuleProps> = ({
  currentUser
}) => {
  const [wallets, setWallets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'freelancer' | 'buyer' | 'admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'frozen'>('all');

  // Selected wallet for detail view
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [walletDetail, setWalletDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modals state
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addReason, setAddReason] = useState('Compensation');
  const [addReference, setAddReference] = useState('SUPPORT-1234');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  const [isRemoveFundsOpen, setIsRemoveFundsOpen] = useState(false);
  const [removeAmount, setRemoveAmount] = useState('');
  const [removeReason, setRemoveReason] = useState('Accounting Correction');
  const [removeReference, setRemoveReference] = useState('CORR-1234');
  const [isSubmittingRemove, setIsSubmittingRemove] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'freelancer', title: '' });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [isFreezeOpen, setIsFreezeOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState('Fraud investigation');
  const [freezeNote, setFreezeNote] = useState('');
  const [isSubmittingFreeze, setIsSubmittingFreeze] = useState(false);

  const headers = () => {
    const token = getAuthToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wRes, tRes, pRes] = await Promise.all([
        fetch('/api/admin/finance/wallets', { headers: headers() }),
        fetch('/api/admin/finance/transactions', { headers: headers() }),
        fetch('/api/admin/finance/payouts', { headers: headers() })
      ]);
      if (wRes.ok) setWallets(await wRes.json());
      if (tRes.ok) setTransactions(await tRes.json());
      if (pRes.ok) setPayouts(await pRes.json());
    } catch (err: any) {
      setError(err?.message || 'Failed to load financial ledger data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadWalletDetail = useCallback(async (userId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/finance/wallets/${userId}`, { headers: headers() });
      if (res.ok) {
        const detail = await res.json();
        setWalletDetail(detail);
        if (detail.wallet) {
          setEditForm({
            name: detail.wallet.userName || '',
            email: detail.wallet.userEmail || '',
            role: detail.wallet.userRole || 'freelancer',
            title: detail.wallet.title || ''
          });
        }
      }
    } catch (err) {
      console.error('Failed to load wallet detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedWalletId) {
      loadWalletDetail(selectedWalletId);
    } else {
      setWalletDetail(null);
    }
  }, [selectedWalletId, loadWalletDetail]);

  const filteredWallets = useMemo(() => {
    return wallets.filter(w => {
      const matchesSearch = 
        (w.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.userEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.userId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || w.userRole === roleFilter;
      const isFrozen = w.status === 'frozen';
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? !isFrozen : isFrozen);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [wallets, searchQuery, roleFilter, statusFilter]);

  const totalPlatformBalance = wallets.reduce((sum, w) => sum + Number(w.availableBalance || 0), 0);
  const totalEscrowHold = wallets.reduce((sum, w) => sum + Number(w.fundsOnHold || 0), 0);
  const pendingPayoutsSum = payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalTransactionsCount = transactions.length;

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWalletId || !addAmount) return;
    setIsSubmittingAdd(true);
    try {
      const res = await fetch('/api/admin/finance/adjustments', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          userId: selectedWalletId,
          amount: Number(addAmount),
          direction: 'credit_user',
          category: 'goodwill',
          reason: addReason,
          evidenceReference: addReference
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add funds');
      setIsAddFundsOpen(false);
      setAddAmount('');
      loadData();
      loadWalletDetail(selectedWalletId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleRemoveFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWalletId || !removeAmount) return;
    setIsSubmittingRemove(true);
    try {
      const res = await fetch('/api/admin/finance/adjustments', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          userId: selectedWalletId,
          amount: Number(removeAmount),
          direction: 'debit_user',
          category: 'accounting_correction',
          reason: removeReason,
          evidenceReference: removeReference
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove funds');
      setIsRemoveFundsOpen(false);
      setRemoveAmount('');
      loadData();
      loadWalletDetail(selectedWalletId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingRemove(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWalletId) return;
    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedWalletId}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user profile');
      setIsEditOpen(false);
      loadData();
      loadWalletDetail(selectedWalletId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleFreezeToggle = async () => {
    if (!selectedWalletId || !walletDetail) return;
    const isFrozen = walletDetail.wallet.status === 'frozen';
    setIsSubmittingFreeze(true);
    try {
      const endpoint = isFrozen 
        ? `/api/admin/finance/wallets/${selectedWalletId}/unfreeze`
        : `/api/admin/finance/wallets/${selectedWalletId}/freeze`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ reason: freezeReason, note: freezeNote })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update wallet status');
      setIsFreezeOpen(false);
      setFreezeNote('');
      loadData();
      loadWalletDetail(selectedWalletId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingFreeze(false);
    }
  };

  if (selectedWalletId && walletDetail) {
    const w = walletDetail.wallet;
    const isFrozen = w.status === 'frozen';
    const userTxns = walletDetail.transactions || [];
    return (
      <div className="space-y-6 font-sans">
        {/* Header & Back Button */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedWalletId(null)}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-xs transition"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Wallets
          </button>
          <div className="flex items-center gap-2">
            {isFrozen ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Frozen ({w.restrictionReason || 'Under Review'})
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active
              </span>
            )}
          </div>
        </div>

        {/* User Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-extrabold text-slate-950">{w.userName}</h2>
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold capitalize">
                {w.userRole}
              </span>
            </div>
            <p className="text-sm text-slate-500 font-mono">{w.userEmail} • ID: {w.userId}</p>
          </div>
          
          {/* Admin Actions Toolbar matching Wireframe */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsAddFundsOpen(true)}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition"
            >
              <PlusCircle className="w-3.5 h-3.5" /> + ADD FUNDS
            </button>
            <button
              onClick={() => setIsRemoveFundsOpen(true)}
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition"
            >
              <MinusCircle className="w-3.5 h-3.5" /> - REMOVE FUNDS
            </button>
            <button
              onClick={() => setIsEditOpen(true)}
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl text-xs transition border border-slate-200"
            >
              <Edit3 className="w-3.5 h-3.5" /> EDIT
            </button>
            <button
              onClick={() => setIsFreezeOpen(true)}
              className={`inline-flex items-center gap-1.5 font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition border ${isFrozen ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
            >
              {isFrozen ? <Sun className="w-3.5 h-3.5" /> : <Snowflake className="w-3.5 h-3.5" />}
              {isFrozen ? 'UNFREEZE WALLET' : 'FREEZE WALLET'}
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">AVAILABLE BALANCE</span>
            <div className="text-3xl font-extrabold text-slate-900 mt-2">
              ${Number(w.availableBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-400 mt-1">Ready for withdrawal or new contract funding</p>
          </div>
          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">MONEY IN ESCROW</span>
            <div className="text-3xl font-extrabold text-blue-700 mt-2">
              ${Number(w.fundsOnHold || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-blue-500 mt-1">Locked in active milestone or gig deliverables</p>
          </div>
          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">PENDING PAYOUT</span>
            <div className="text-3xl font-extrabold text-amber-700 mt-2">
              ${Number(w.pendingWithdrawals || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-amber-500 mt-1">Queued withdrawal requests in gateway transit</p>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">TRANSACTION HISTORY</h3>
            <span className="text-xs font-semibold text-slate-500">{userTxns.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">From / To</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {userTxns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                      No transaction records found for this wallet.
                    </td>
                  </tr>
                ) : (
                  userTxns.map((t: any) => (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-500">{new Date(t.timestamp).toLocaleDateString()}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800 capitalize">{t.type.replace(/_/g, ' ')}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{t.userId || 'Admin'}</td>
                      <td className="py-3.5 px-4 text-slate-600">{t.description}</td>
                      <td className={`py-3.5 px-4 text-right font-bold text-sm ${t.amount >= 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {t.amount >= 0 ? '+' : ''}${Math.abs(t.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Funds Modal */}
        {isAddFundsOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Add Funds</h3>
                <button onClick={() => setIsAddFundsOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddFunds} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">User: {w.userName}</label>
                  <input type="text" disabled value={`${w.userEmail}`} className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Amount</label>
                  <input type="number" step="0.01" required placeholder="$500.00" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Reason</label>
                  <input type="text" value={addReason} onChange={(e) => setAddReason(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Reference</label>
                  <input type="text" value={addReference} onChange={(e) => setAddReference(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-700" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsAddFundsOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition">Cancel</button>
                  <button type="submit" disabled={isSubmittingAdd} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-xs transition disabled:opacity-50">
                    {isSubmittingAdd ? 'Confirming...' : 'Confirm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Remove Funds Modal */}
        {isRemoveFundsOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Remove Funds / Balance Correction</h3>
                <button onClick={() => setIsRemoveFundsOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleRemoveFunds} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">User: {w.userName} (Available: ${w.availableBalance})</label>
                  <input type="text" disabled value={`${w.userEmail}`} className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Amount to Debit</label>
                  <input type="number" step="0.01" required placeholder="100.00" value={removeAmount} onChange={(e) => setRemoveAmount(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Reason</label>
                  <input type="text" value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Reference</label>
                  <input type="text" value={removeReference} onChange={(e) => setRemoveReference(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-700" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsRemoveFundsOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition">Cancel</button>
                  <button type="submit" disabled={isSubmittingRemove} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-xs transition disabled:opacity-50">
                    {isSubmittingRemove ? 'Processing...' : 'Debit Wallet'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {isEditOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Edit User Profile</h3>
                <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleEditUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                  <input type="text" required value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Email Address</label>
                  <input type="email" required value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Role</label>
                  <select value={editForm.role} onChange={(e) => setEditForm({...editForm, role: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700">
                    <option value="freelancer">Freelancer</option>
                    <option value="buyer">Buyer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Professional Title</label>
                  <input type="text" value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsEditOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition">Cancel</button>
                  <button type="submit" disabled={isSubmittingEdit} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-xs transition disabled:opacity-50">
                    {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Freeze / Unfreeze Modal */}
        {isFreezeOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">{isFrozen ? 'Unfreeze Wallet' : 'Freeze Wallet'}</h3>
                <button onClick={() => setIsFreezeOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <p className="text-xs text-slate-600">
                  {isFrozen ? 'This restores normal wallet activity and unlocks outbound withdrawals.' : 'Reason for freezing this wallet account:'}
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Reason</label>
                  <input type="text" value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Admin note</label>
                  <textarea rows={3} placeholder="Add notes..." value={freezeNote} onChange={(e) => setFreezeNote(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsFreezeOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition">Cancel</button>
                  <button type="button" disabled={isSubmittingFreeze} onClick={handleFreezeToggle} className={`px-5 py-2 text-white font-bold rounded-xl text-sm shadow-xs transition disabled:opacity-50 ${isFrozen ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                    {isSubmittingFreeze ? 'Processing...' : (isFrozen ? 'Unfreeze' : 'Freeze')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">User Wallets & Financial Ledger</h2>
            <p className="text-xs text-slate-500">Real-time audit log of user wallet balances, escrow liabilities, and liquidity reserves</p>
          </div>
        </div>
        <button onClick={loadData} className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Ledger
        </button>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">TOTAL BALANCE</span>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">
            ${totalPlatformBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-400 mt-1">User wallets</p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">MONEY IN ESCROW</span>
          <div className="text-3xl font-extrabold text-blue-700 mt-2">
            ${totalEscrowHold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-blue-500 mt-1">Active orders</p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">PENDING PAYOUTS</span>
          <div className="text-3xl font-extrabold text-amber-700 mt-2">
            ${pendingPayoutsSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-amber-500 mt-1">Freelancer withdrawals</p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs">
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">TOTAL TRANSACTIONS</span>
          <div className="text-3xl font-extrabold text-indigo-700 mt-2">
            {totalTransactionsCount.toLocaleString()}
          </div>
          <p className="text-xs text-indigo-500 mt-1">All records</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search user / email / ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
        >
          <option value="all">All Users</option>
          <option value="freelancer">Freelancer</option>
          <option value="buyer">Buyer</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
        >
          <option value="all">Status (All)</option>
          <option value="active">Active</option>
          <option value="frozen">Frozen</option>
        </select>
      </div>

      {/* Wallets Table */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">USER</th>
                <th className="py-3 px-4">ROLE</th>
                <th className="py-3 px-4">AVAILABLE</th>
                <th className="py-3 px-4">ESCROW</th>
                <th className="py-3 px-4">TOTAL</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 px-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWallets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    {loading ? 'Loading wallet ledger...' : 'No wallet accounts found.'}
                  </td>
                </tr>
              ) : (
                filteredWallets.map((w) => {
                  const available = Number(w.availableBalance || 0);
                  const escrow = Number(w.fundsOnHold || 0);
                  const total = available + escrow;
                  const isFrozen = w.status === 'frozen';
                  return (
                    <tr key={w.userId} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{w.userName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{w.userEmail}</div>
                      </td>
                      <td className="py-3.5 px-4 capitalize font-semibold text-slate-700">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                          {w.userRole}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">
                        ${available.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-blue-600">
                        ${escrow.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-slate-900">
                        ${total.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        {!isFrozen ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                            ● Active
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                            ● Frozen
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedWalletId(w.userId)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition inline-flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" /> VIEW WALLET
                        </button>
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
