import React, { useState, useMemo } from 'react';
import { 
  Users, Search, Shield, Ban, CheckCircle2, Eye, UserCheck, 
  UserX, Filter, ChevronLeft, ChevronRight, Mail, DollarSign, 
  Edit3, Trash2, X, AlertTriangle, ShieldCheck, UserPlus, Download,
  Settings
} from 'lucide-react';
import { UserAccount } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';

interface AdminUsersModuleProps {
  allUsers?: UserAccount[];
  onImpersonateUser?: (userId: string) => void;
  onToggleUserStatus?: (userId: string) => void;
  onUpdateUser?: (user: UserAccount) => void;
  onDeleteUser?: (userId: string) => void;
}

import { useLocalStorageFilter } from '../../hooks/admin/useLocalStorageFilter';
import { usePagination } from '../../hooks/admin/usePagination';

export const AdminUsersModule: React.FC<AdminUsersModuleProps> = ({
  allUsers = [],
  onImpersonateUser,
  onToggleUserStatus,
  onUpdateUser,
  onDeleteUser
}) => {
  const [users, setUsers] = useLocalStorageFilter(allUsers, 'workperhour_deleted_users');

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [verificationFilter, setVerificationFilter] = useState<string>('all');
  
  const [inspectingUser, setInspectingUser] = useState<UserAccount | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({ 
    name: '', email: '', role: 'freelancer', title: '', walletBalance: 0, hourlyRate: 50, verified: false, status: 'active' as 'active' | 'frozen' | 'suspended' | 'restricted' | 'deactivated'
  });

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.title && u.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.skills && u.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesRole = roleFilter === 'all' || u.role.toLowerCase() === roleFilter.toLowerCase();
      const matchesStatus = statusFilter === 'all' || (u.status || 'active') === statusFilter;
      const matchesVerification = 
        verificationFilter === 'all' || 
        (verificationFilter === 'verified' && u.verified) ||
        (verificationFilter === 'unverified' && !u.verified);

      return matchesSearch && matchesRole && matchesStatus && matchesVerification;
    });
  }, [users, searchQuery, roleFilter, statusFilter, verificationFilter]);

  const { currentPage, setCurrentPage, totalPages, paginatedData: paginatedUsers } = usePagination(filteredUsers, 8);

  const handleOpenEdit = (user: UserAccount) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role || 'freelancer',
      title: user.title || '',
      walletBalance: user.walletBalance || 0,
      hourlyRate: user.hourlyRate || 50,
      verified: !!user.verified,
      status: user.status || 'active'
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const updated: UserAccount = {
      ...editingUser,
      name: editForm.name,
      email: editForm.email,
      role: editForm.role,
      title: editForm.title,
      walletBalance: Number(editForm.walletBalance),
      hourlyRate: Number(editForm.hourlyRate),
      verified: editForm.verified,
      status: editForm.status
    };
    setUsers((prev: UserAccount[]) => prev.map(u => u.id === updated.id ? updated : u));
    if (onUpdateUser) {
      onUpdateUser(updated);
    }
    setEditingUser(null);
  };

  const handleRestrictUser = (userId: string) => {
    setUsers((prev: UserAccount[]) => prev.map(u => u.id === userId ? { ...u, status: u.status === 'restricted' ? 'active' : 'restricted' } : u));
    if (onUpdateUser) {
      const u = users.find(x => x.id === userId);
      if (u) {
        onUpdateUser({ ...u, status: u.status === 'restricted' ? 'active' : 'restricted' });
      }
    }
  };

  const handleConfirmDeleteUser = () => {
    if (!deletingUserId) return;
    const idToDelete = String(deletingUserId);
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_users') || '[]').map((d: any) => String(d));
      if (!deletedIds.includes(idToDelete)) {
        deletedIds.push(idToDelete);
        localStorage.setItem('workperhour_deleted_users', JSON.stringify(deletedIds));
      }
    } catch (e) {
      console.error("Error persisting deleted user ID to localStorage", e);
    }

    setUsers((prev: UserAccount[]) => prev.filter(u => String(u.id) !== idToDelete));
    if (onDeleteUser) {
      onDeleteUser(idToDelete);
    }
    setDeletingUserId(null);
  };

  const exportUsersCSV = () => {
    const headers = ['ID,Name,Username,Email,Role,Title,WalletBalance,HourlyRate,Verified,Status'];
    const rows = users.map(u => 
      `"${u.id}","${u.name}","${u.username || ''}","${u.email}","${u.role}","${u.title || ''}",${u.walletBalance || 0},${u.hourlyRate || 0},${u.verified},"${u.status || 'active'}"`
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `workperhour_users_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">User Account Management & Verification</h2>
          <p className="text-xs text-slate-500 mt-0.5">Search, filter, view complete activity history, edit profiles, toggle verification, and restrict user accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportUsersCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <div className="text-xs font-semibold text-slate-700 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl shadow-xs">
            {allUsers.length} Total Users Registered
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, email, skills, title..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
        >
          <option value="all">All Account Statuses</option>
          <option value="active">Active Only</option>
          <option value="suspended">Suspended Only</option>
          <option value="restricted">Restricted Only</option>
        </select>
        <select
          value={verificationFilter}
          onChange={(e) => { setVerificationFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
        >
          <option value="all">All Verification Statuses</option>
          <option value="verified">Verified Only</option>
          <option value="unverified">Unverified Only</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
        >
          <option value="all">All Roles</option>
          <option value="freelancer">Freelancer</option>
          <option value="buyer">Buyer</option>
          <option value="admin">Administrator</option>
        </select>
      </div>

      {/* Users Table matching Exact Screenshot Layout */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">User Details</th>
                <th className="py-3.5 px-4">Role & Title</th>
                <th className="py-3.5 px-4">Wallet / Hourly</th>
                <th className="py-3.5 px-4">Verification</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                    No registered user accounts found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3.5 px-4 flex items-center gap-3">
                    <img
                      src={user.avatar || DEFAULT_AVATAR}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-xs"
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                    />
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        {user.name}
                        {user.verified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-50" />}
                      </div>
                      <div className="text-[11px] text-slate-400">{user.email}</div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col gap-0.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold w-max uppercase tracking-wider ${
                        user.role === 'admin' || user.role === 'SUPER ADMIN' 
                          ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {user.role === 'admin' ? 'SUPER ADMIN' : user.role}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium truncate max-w-[180px]">
                        {user.title || 'Marketplace Member'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">
                      ${(user.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      ${user.hourlyRate || 50}/hr
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    {user.verified ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-[11px]">
                        ✓ VERIFIED
                      </span>
                    ) : (
                      <span className="text-slate-400 font-semibold text-[11px]">UNVERIFIED</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {user.status === 'active' || !user.status ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500 text-white tracking-wider shadow-xs">
                        ACTIVE
                      </span>
                    ) : user.status === 'restricted' ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 text-white tracking-wider shadow-xs">
                        RESTRICTED
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500 text-white tracking-wider shadow-xs">
                        SUSPENDED
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setInspectingUser(user)}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 border border-emerald-200"
                        title="View Activity History"
                      >
                        <Eye className="w-3 h-3" /> Activity
                      </button>
                      <button
                        onClick={() => handleOpenEdit(user)}
                        className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 border border-sky-200"
                        title="Edit user details"
                      >
                        <Settings className="w-3 h-3" /> Edit
                      </button>
                      {onToggleUserStatus && (
                        <button
                          onClick={() => onToggleUserStatus(user.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                            user.status === 'suspended'
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                          }`}
                        >
                          {user.status === 'suspended' ? 'Activate' : 'Suspend'}
                        </button>
                      )}
                      <button
                        onClick={() => handleRestrictUser(user.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                          user.status === 'restricted'
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                        }`}
                      >
                        {user.status === 'restricted' ? 'Unrestrict' : 'Restrict'}
                      </button>
                      {onImpersonateUser && (
                        <button
                          onClick={() => onImpersonateUser(user.id)}
                          className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 border border-indigo-200"
                        >
                          <Eye className="w-3 h-3" /> Impersonate
                        </button>
                      )}
                      <button
                        onClick={() => setDeletingUserId(user.id)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition border border-rose-200"
                        title="Delete user account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Showing page <span className="font-bold text-slate-700">{currentPage}</span> of <span className="font-bold text-slate-700">{totalPages}</span> ({filteredUsers.length} total users)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition text-slate-600"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition text-slate-600"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inspect User Modal */}
      {inspectingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setInspectingUser(null)}
              className="absolute top-6 right-6 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-4">
              <img
                src={inspectingUser.avatar || DEFAULT_AVATAR}
                alt={inspectingUser.name}
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-xs"
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
              />
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  {inspectingUser.name}
                  {inspectingUser.verified && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </h3>
                <p className="text-xs text-slate-500">@{inspectingUser.username || inspectingUser.email.split('@')[0]} • {inspectingUser.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {inspectingUser.role}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                    inspectingUser.status === 'suspended' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {inspectingUser.status || 'active'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Wallet Balance</div>
                <div className="text-xl font-bold text-slate-900 mt-1">
                  ${(inspectingUser.walletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Hourly Rate</div>
                <div className="text-xl font-bold text-slate-900 mt-1">
                  ${inspectingUser.hourlyRate || 50}/hr
                </div>
              </div>
            </div>

            {inspectingUser.bio && (
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Biography</h4>
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  {inspectingUser.bio}
                </p>
              </div>
            )}

            {inspectingUser.skills && inspectingUser.skills.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Skills & Expertise</h4>
                <div className="flex flex-wrap gap-1.5">
                  {inspectingUser.skills.map((skill, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setInspectingUser(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
              {onImpersonateUser && (
                <button
                  onClick={() => {
                    const uid = inspectingUser.id;
                    setInspectingUser(null);
                    onImpersonateUser(uid);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" /> Impersonate User
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setEditingUser(null)}
              className="absolute top-6 right-6 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Edit User Details</h3>
              <p className="text-xs text-slate-500">Update user profile, role permissions, hourly rate, and wallet balance</p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Professional Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
                  >
                    <option value="freelancer">Freelancer</option>
                    <option value="buyer">Buyer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hourly Rate ($)</label>
                  <input
                    type="number"
                    value={editForm.hourlyRate}
                    onChange={(e) => setEditForm({ ...editForm, hourlyRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Wallet Balance ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.walletBalance}
                  onChange={(e) => setEditForm({ ...editForm, walletBalance: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <div className="text-xs font-bold text-slate-900">ID Verification</div>
                  <div className="text-[11px] text-slate-500">Mark user identity as verified</div>
                </div>
                <input
                  type="checkbox"
                  checked={editForm.verified}
                  onChange={(e) => setEditForm({ ...editForm, verified: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <div className="text-xs font-bold text-slate-900">Account Status</div>
                  <div className="text-[11px] text-slate-500">Active, Suspended or Restricted</div>
                </div>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 capitalize"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="restricted">Restricted</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deletingUserId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Confirm Account Deletion</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete this user account? This action cannot be undone and will remove user profile data and access.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingUserId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
