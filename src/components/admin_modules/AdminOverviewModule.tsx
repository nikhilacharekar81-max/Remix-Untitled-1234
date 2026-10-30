import React from 'react';
import { 
  Users, Briefcase, Layers, Package, Wallet, ShieldCheck, 
  ArrowUpRight, TrendingUp, Clock, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { UserAccount, Project, Gig, Order } from '../../types';

interface AdminOverviewModuleProps {
  allUsers?: UserAccount[];
  allProjects?: Project[];
  allGigs?: Gig[];
  allOrders?: Order[];
  escrowAccounts?: Order[];
  platformBalance?: number;
}

export const AdminOverviewModule: React.FC<AdminOverviewModuleProps> = ({
  allUsers = [],
  allProjects = [],
  allGigs = [],
  allOrders = [],
  escrowAccounts = [],
  platformBalance = 0
}) => {
  const activeOrdersCount = allOrders.filter(o => o.status === 'funded_in_escrow' || o.status === 'in_progress').length;
  const escrowTotal = escrowAccounts.reduce((sum, o) => sum + (o.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase">Users</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{allUsers.length}</div>
          <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-0.5 mt-1">
            <TrendingUp className="w-3 h-3" /> Active accounts
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase">Services</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{allGigs.length}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Live gig offers</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase">Projects</span>
            <Briefcase className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{allProjects.length}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Buyer RFP posts</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase">Orders</span>
            <Package className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{allOrders.length}</div>
          <span className="text-[11px] text-blue-600 font-semibold mt-1 block">{activeOrdersCount} in progress</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase">Escrow Held</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-blue-600">${escrowTotal.toLocaleString()}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Safeguarded funds</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase">Commission</span>
            <Wallet className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">${platformBalance.toLocaleString()}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Platform fee yield</span>
        </div>
      </div>

      {/* Main Operational Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">Recent Marketplace Milestones</h3>
          <div className="space-y-3">
            {allOrders.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs font-medium">
                No orders or milestone activity yet.
              </div>
            ) : (
              allOrders.slice(0, 4).map((order) => (
                <div key={order.id} className="p-3.5 bg-slate-50 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{order.title}</span>
                    <span className="text-[11px] text-slate-400">Order #{order.id} • ${order.amount}</span>
                  </div>
                  <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold capitalize text-slate-700">
                    {order.status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">System Health & Compliance</h3>
          <div className="space-y-3 text-xs text-slate-600">
            <div className="flex items-center justify-between p-3.5 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 font-semibold">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> PostgreSQL & Firebase Ledger
              </span>
              <span>Online & In Sync</span>
            </div>
            <div className="flex items-center justify-between p-3.5 bg-slate-50 text-slate-700 rounded-2xl border border-slate-200">
              <span>Automatic Escrow Release Buffer</span>
              <span className="font-bold">14 Days Standard</span>
            </div>
            <div className="flex items-center justify-between p-3.5 bg-slate-50 text-slate-700 rounded-2xl border border-slate-200">
              <span>Security Threat Level</span>
              <span className="text-emerald-600 font-bold">Normal (Zero Breaches)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
