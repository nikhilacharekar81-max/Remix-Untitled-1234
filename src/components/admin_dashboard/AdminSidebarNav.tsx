import React from 'react';
import { 
  LayoutDashboard, Users, Briefcase, ShoppingBag, Grid, 
  FileText, Wallet, ShieldCheck, Scale, RefreshCw, MessageSquare, 
  HelpCircle, Settings, Shield, Activity, DollarSign 
} from 'lucide-react';

interface AdminSidebarNavProps {
  adminTab: string;
  onSelectTab: (tab: any) => void;
}

export const ADMIN_NAV_ITEMS = [
  { id: 'overview', label: '1. Dashboard Overview', icon: LayoutDashboard },
  { id: 'users', label: '2. User Management', icon: Users },
  { id: 'projects', label: '3. Projects & RFP', icon: Briefcase },
  { id: 'gigs', label: '4. Services & Gigs', icon: ShoppingBag },
  { id: 'orders', label: '5. All Orders', icon: Briefcase },
  { id: 'categories', label: '6. Categories & Slugs', icon: Grid },
  { id: 'proposals', label: '7. Proposals & Bids', icon: FileText },
  { id: 'contracts', label: '8. Contracts & Milestones', icon: FileText },
  { id: 'payments', label: '9. Payments & Gateways', icon: Wallet },
  { id: 'wallet', label: '10. User Wallets & Ledger', icon: Wallet },
  { id: 'escrow', label: '11. Escrow (14d Protection)', icon: ShieldCheck },
  { id: 'disputes', label: '12. Dispute Resolution', icon: Scale },
  { id: 'refunds', label: '13. Refund Requests', icon: RefreshCw },
  { id: 'payouts', label: '14. Freelancer Payouts', icon: DollarSign },
  { id: 'reviews', label: '15. Reviews & Ratings', icon: FileText },
  { id: 'messages', label: '16. Messages Audit', icon: MessageSquare },
  { id: 'reports', label: '17. Flagged Reports', icon: Shield },
  { id: 'support', label: '18. Support Help Desk', icon: HelpCircle },
  { id: 'cms', label: '19. CMS & Policies', icon: FileText },
  { id: 'settings', label: '20. Site & Fee Settings', icon: Settings },
  { id: 'activity', label: '21. Security Audit Trail', icon: Activity },
];

export const AdminSidebarNav: React.FC<AdminSidebarNavProps> = ({ adminTab, onSelectTab }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs space-y-1">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-3 pb-3 border-b border-slate-100 mb-2">
        Admin Portal Modules
      </h3>
      <div className="space-y-0.5 max-h-[600px] overflow-y-auto pr-1">
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = adminTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-3 transition-colors cursor-pointer ${
                isActive ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-slate-50 text-fiverr-dark'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
