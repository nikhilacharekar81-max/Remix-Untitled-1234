import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface AdminHeaderProps {
  adminTab: string;
  onRefreshData: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ adminTab, onRefreshData }) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center border border-emerald-200">
          <ShieldAlert className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-fiverr-dark tracking-tight">Super Admin Control Center</h1>
          <p className="text-xs text-fiverr-muted">Manage 21 core platform modules, escrow protection, users, and disputes.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onRefreshData}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-fiverr-dark font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
          <span>Sync Database</span>
        </button>
      </div>
    </div>
  );
};
