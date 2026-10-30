import React from 'react';
import { UserAccount } from '../../types';

interface EditUserProfileModalProps {
  editingUser: UserAccount | null;
  onClose: () => void;
  editUserForm: {
    name: string;
    email: string;
    role: string;
    status: string;
    title: string;
    bio: string;
    skills: string;
    hourlyRate: number;
    walletBalance: number;
    verified?: boolean;
  };
  setEditUserForm: React.Dispatch<React.SetStateAction<any>>;
  handleSaveEditUser: (e: React.FormEvent) => void;
}

export const EditUserProfileModal: React.FC<EditUserProfileModalProps> = ({
  editingUser,
  onClose,
  editUserForm,
  setEditUserForm,
  handleSaveEditUser
}) => {
  if (!editingUser) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-xl w-full space-y-5 text-slate-800 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Edit User Profile — {editingUser.name}</h3>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 text-xs font-bold cursor-pointer"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSaveEditUser} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-900 font-bold uppercase mb-1">Full Name</label>
              <input 
                type="text" 
                value={editUserForm.name}
                onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, name: e.target.value }))}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-slate-900 font-bold uppercase mb-1">Email Address</label>
              <input 
                type="email" 
                value={editUserForm.email}
                onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, email: e.target.value }))}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-900 font-bold uppercase mb-1">System Role</label>
              <select 
                value={editUserForm.role}
                onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, role: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
              >
                <option value="user">Marketplace User</option>
                <option value="super_admin">Super Admin</option>
                <option value="moderator">Moderator</option>
                <option value="support">Support Staff</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-900 font-bold uppercase mb-1">Account Status</label>
              <select 
                value={editUserForm.status}
                onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-900 font-bold uppercase mb-1">Professional Title</label>
            <input 
              type="text" 
              value={editUserForm.title}
              onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-900 font-bold uppercase mb-1">Bio / Profile Summary</label>
            <textarea 
              rows={3}
              value={editUserForm.bio}
              onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, bio: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-900 font-bold uppercase mb-1">Skills (comma separated)</label>
            <input 
              type="text" 
              value={editUserForm.skills}
              onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, skills: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-900 font-bold uppercase mb-1">Hourly Rate ($/hr)</label>
              <input 
                type="number" 
                value={editUserForm.hourlyRate}
                onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, hourlyRate: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-900 font-bold uppercase mb-1">Wallet Balance ($)</label>
              <input 
                type="number" 
                value={editUserForm.walletBalance}
                readOnly
                title="Wallet balances are controlled by the ledger. Use Finance > Adjustments."
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
              <input 
                type="checkbox" 
                checked={editUserForm.verified}
                onChange={(e) => setEditUserForm((prev: any) => ({ ...prev, verified: e.target.checked }))}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
              />
              <span>Verified User Badge Active</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-colors"
            >
              Save User Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
