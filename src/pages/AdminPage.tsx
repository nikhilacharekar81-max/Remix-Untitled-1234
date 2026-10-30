import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Users, Briefcase, Layers, Shield, Sliders,
  FileText, CheckCircle2, DollarSign, Wallet, ShieldCheck, Scale,
  CornerDownLeft, TrendingUp, Star, MessageCircle, Flag, HelpCircle,
  FileCode, Settings, Activity, ShieldAlert, LogOut, Award, CreditCard
} from 'lucide-react';
import { UserAccount, Gig, Project, Proposal, Order } from '../types';
import { getDeviceId as defaultGetDeviceId } from '../utils/deviceId';
import { AdminOrdersManager } from '../components/AdminOrdersManager';
import { PaymentsModule } from '../components/PaymentsModule';
import { SiteFeeSettingsModule } from '../components/SiteFeeSettingsModule';
import { UserWalletsLedgerModule } from '../components/UserWalletsLedgerModule';
import {
  AdminOverviewModule,
  AdminUsersModule,
  AdminProjectsModule,
  AdminGigsModule,
  AdminCategoriesModule,
  AdminProposalsModule,
  AdminContractsModule,
  AdminEscrowModule,
  AdminDisputesModule,
  AdminRefundsModule,
  AdminPayoutsModule,
  AdminReviewsModule,
  AdminMessagesModule,
  AdminReportsModule,
  AdminSupportModule,
  AdminCmsModule,
  AdminActivityModule,
  AdminMembershipsQuotasModule,
  AdminPaymentGatewaysModule
} from '../components/admin_modules';
import { setAuthToken } from '../utils/authToken';

export interface AdminPageProps {
  currentUser: UserAccount | null;
  impersonatedUser: UserAccount | null;
  updateCurrentUser: (u: UserAccount | null | ((prev: UserAccount | null) => UserAccount | null)) => void;
  setImpersonatedUser: (u: UserAccount | null) => void;
  usersList: UserAccount[];
  setUsersList: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  projects: Project[];
  gigs: Gig[];
  orders: Order[];
  proposals: Proposal[];
  platformFee?: number;
  clientServiceFee?: number;
  smallOrderFeeThreshold?: number;
  smallOrderFeeAmount?: number;
  escrowProtectionDays?: number;
  navigate: (to: string, e?: React.MouseEvent) => void;
  refresh: () => Promise<void> | void;
  getDeviceId?: () => string;
}

export const AdminPage: React.FC<AdminPageProps> = ({
  currentUser,
  impersonatedUser,
  updateCurrentUser,
  setImpersonatedUser,
  usersList,
  setUsersList,
  projects,
  gigs,
  orders,
  proposals,
  platformFee = 20,
  clientServiceFee = 1,
  smallOrderFeeThreshold = 200,
  smallOrderFeeAmount = 1,
  escrowProtectionDays = 14,
  navigate,
  refresh,
  getDeviceId = defaultGetDeviceId
}) => {
  // Navigation: 21 Admin Modules
  const [adminTab, setAdminTab] = useState<
    'overview' | 'users' | 'projects' | 'gigs' | 'categories' | 
    'proposals' | 'contracts' | 'payments' | 'wallet' | 'escrow' | 
    'disputes' | 'refunds' | 'payouts' | 'reviews' | 'messages' | 
    'reports' | 'support' | 'cms' | 'settings' | 'security' | 'activity' | 'orders' | 'memberships' | 'paymentGateways'
  >('overview');

  // Admin Auth & 2FA State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [adminLoginRequiresCode, setAdminLoginRequiresCode] = useState(false);
  const [adminLoginCode, setAdminLoginCode] = useState('');
  const [adminMockCodeDisplay, setAdminMockCodeDisplay] = useState('');

  const isUserAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin' || impersonatedUser?.role === 'super_admin' || impersonatedUser?.role === 'admin';

  // Admin Domain Relational State
  const [adminDisputes, setAdminDisputes] = useState<any[]>([]);
  const [adminRefunds, setAdminRefunds] = useState<any[]>([]);
  const [adminPayouts, setAdminPayouts] = useState<any[]>([]);
  const [adminReviews, setAdminReviews] = useState<any[]>([]);
  const [adminTickets, setAdminTickets] = useState<any[]>([]);
  const [adminReports, setAdminReports] = useState<any[]>([]);
  const [adminThreads, setAdminThreads] = useState<any[]>([]);

  useEffect(() => {
    if (!isUserAdmin) return;
    const fetchAdminData = async () => {
      try {
        if (adminTab === 'disputes') {
          const res = await fetch('/api/admin/disputes');
          if (res.ok) setAdminDisputes(await res.json());
        } else if (adminTab === 'refunds') {
          const res = await fetch('/api/admin/refunds');
          if (res.ok) setAdminRefunds(await res.json());
        } else if (adminTab === 'payouts') {
          const res = await fetch('/api/admin/payouts');
          if (res.ok) setAdminPayouts(await res.json());
        } else if (adminTab === 'reviews') {
          const res = await fetch('/api/admin/reviews');
          if (res.ok) setAdminReviews(await res.json());
        } else if (adminTab === 'support') {
          const res = await fetch('/api/admin/support/tickets');
          if (res.ok) setAdminTickets(await res.json());
        } else if (adminTab === 'reports') {
          const res = await fetch('/api/admin/reports');
          if (res.ok) setAdminReports(await res.json());
        } else if (adminTab === 'messages') {
          const res = await fetch('/api/admin/messages/threads');
          if (res.ok) setAdminThreads(await res.json());
        }
      } catch (err) {
        console.warn('Failed to fetch admin tab data:', err);
      }
    };
    fetchAdminData();
  }, [adminTab, isUserAdmin]);

  const contractsData = useMemo(() => (orders || []).map(o => ({
    id: o.id,
    title: o.title,
    clientName: o.buyerUsername || 'Client',
    clientEmail: 'client@example.com',
    clientAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
    freelancerName: o.sellerUsername || 'Freelancer',
    freelancerEmail: 'freelancer@example.com',
    freelancerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    totalAmount: o.amount || 0,
    fundedInEscrow: o.amount || 0,
    releasedAmount: o.status === 'completed' ? o.amount : 0,
    startDate: o.createdAt,
    endDate: o.dueDate,
    status: (o.status === 'completed' ? 'completed' : (o.status === 'cancelled' ? 'terminated' : (o.status === 'disputed' ? 'disputed' : 'active'))) as any,
    milestones: [{ id: 'ms_' + o.id, title: 'Contract Deliverable', amount: o.amount || 0, dueDate: o.dueDate || o.createdAt, status: (o.status === 'completed' ? 'released' : 'funded') as any }],
    termsAgreedAt: o.createdAt
  })), [orders]);

  // 1. Unauthenticated or Non-Admin Gate
  if (!isUserAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 text-slate-800">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xl mx-auto shadow-md">
              W
            </div>
            <h2 className="text-2xl font-bold text-fiverr-dark tracking-tight">Admin Portal Login</h2>
            <p className="text-xs text-fiverr-muted">Enter your Administrator credentials to access the WorkPerHour Super Admin Suite.</p>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const emailToUse = loginEmail.trim();
            const passToUse = loginPassword;
            const deviceId = getDeviceId();
            try {
              const payload: any = {
                email: emailToUse,
                password: passToUse,
                deviceId
              };
              if (adminLoginRequiresCode && adminLoginCode.trim()) {
                payload.code = adminLoginCode.trim();
              }

              const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Authentication failed');

              if (data.requiresVerification) {
                setAdminLoginRequiresCode(true);
                if (data.mockEmailCode) {
                  setAdminMockCodeDisplay(data.mockEmailCode);
                }
                alert('Admin 2FA: Verification code sent to admin registered email.');
                return;
              }

              if (data.token) {
                setAuthToken(data.token);
              }
              if (data.user) {
                updateCurrentUser(data.user);
                setImpersonatedUser(null);
              }
              setAdminLoginRequiresCode(false);
              setAdminLoginCode('');
              alert('Admin session verified successfully! Welcome to Admin Dashboard.');
              refresh();
            } catch (err: any) {
              alert(err.message);
            }
          }} className="space-y-4 text-xs">
            {adminLoginRequiresCode ? (
              <div className="space-y-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <ShieldAlert className="w-4 h-4 text-emerald-600" />
                    <span>Admin Verification Code Sent</span>
                  </div>
                  <p>Enter the 6-digit email verification code sent to {loginEmail || 'admin@workperhour.com'}.</p>
                </div>

                {adminMockCodeDisplay && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                    <span>Admin Security OTP:</span>
                    <span className="font-mono font-bold text-sm bg-white px-2 py-0.5 rounded border border-emerald-200">{adminMockCodeDisplay}</span>
                  </div>
                )}

                <div>
                  <label className="block text-fiverr-dark font-bold uppercase mb-1">Enter 6-Digit Email Code</label>
                  <input 
                    type="text" 
                    maxLength={6} 
                    placeholder="123456" 
                    value={adminLoginCode} 
                    onChange={(e) => setAdminLoginCode(e.target.value)} 
                    required 
                    autoFocus
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg font-mono font-bold tracking-widest text-fiverr-dark focus:outline-none focus:border-emerald-500" 
                  />
                </div>

                <button 
                  type="submit" 
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-colors text-sm cursor-pointer"
                >
                  Verify Email Code & Unlock Admin Suite
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button 
                    type="button" 
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/auth/resend-email-code', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: loginEmail || 'admin@workperhour.com' })
                        });
                        const data = await res.json();
                        if (res.ok && data.mockEmailCode) {
                          setAdminMockCodeDisplay(data.mockEmailCode);
                          alert('New verification code sent to admin email.');
                        }
                      } catch (e) {
                        console.warn(e);
                      }
                    }} 
                    className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                  >
                    Resend Code
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setAdminLoginRequiresCode(false); setAdminLoginCode(''); }} 
                    className="text-fiverr-muted hover:text-slate-800 cursor-pointer"
                  >
                    Back to Password
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-fiverr-dark font-bold uppercase mb-1">Admin Email ID</label>
                  <input 
                    type="email" 
                    placeholder="Enter Admin Email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-fiverr-dark focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-fiverr-dark font-bold uppercase mb-1">Admin Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-fiverr-dark focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button 
                  type="submit" 
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-colors text-sm cursor-pointer"
                >
                  Authenticate & Request Email Code
                </button>
              </>
            )}

            <div className="pt-4 border-t border-slate-100 text-center">
              <a 
                href="/gigs" 
                onClick={(e) => navigate('/gigs', e)}
                className="text-xs text-fiverr-muted hover:text-slate-800 font-medium"
              >
                ← Return to Marketplace Home
              </a>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const effectiveAdminUser = impersonatedUser || currentUser || usersList.find(u => u.role === 'admin' || u.role === 'super_admin') || usersList[0];

  return (
    <div className="min-h-screen bg-slate-50 text-fiverr-dark flex font-sans selection:bg-emerald-500 selection:text-white">
      {/* ADMIN SIDEBAR */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col justify-between p-5 shrink-0 sticky top-0 h-screen overflow-y-auto shadow-xs">
        <div>
          {/* Admin Brand */}
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-200">
            <a href="/gigs" onClick={(e) => navigate('/gigs', e)} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                W
              </div>
              <div>
                <span className="text-sm font-bold text-fiverr-dark block leading-none">WorkPerHour</span>
                <span className="text-[10px] text-emerald-600 font-semibold tracking-wider uppercase">Super Admin Suite</span>
              </div>
            </a>
            <span className="text-[9px] bg-emerald-50 text-emerald-700 font-mono px-2 py-0.5 rounded border border-emerald-200">v3.0 RBAC</span>
          </div>

          {/* Sidebar Navigation: 21 Modules */}
          <nav className="space-y-1">
            {[
              { id: 'overview', label: '1. Dashboard Overview', icon: LayoutDashboard },
              { id: 'users', label: '2. User Management', icon: Users },
              { id: 'projects', label: '3. Projects & RFPs', icon: Briefcase },
              { id: 'gigs', label: '4. Services & Gigs', icon: Layers },
              { id: 'orders', label: '5. All Orders', icon: Shield },
              { id: 'categories', label: '6. Categories & Slugs', icon: Sliders },
              { id: 'proposals', label: '7. Proposals & Bids', icon: FileText },
              { id: 'contracts', label: '8. Contracts & Milestones', icon: CheckCircle2 },
              { id: 'payments', label: '9. Payment Gateways', icon: DollarSign },
              { id: 'wallet', label: '10. Wallet & Double Ledger', icon: Wallet },
              { id: 'escrow', label: '11. Escrow Vault (14-Day)', icon: ShieldCheck },
              { id: 'disputes', label: '12. Dispute Resolution', icon: Scale },
              { id: 'refunds', label: '13. Refund Requests', icon: CornerDownLeft },
              { id: 'payouts', label: '14. Freelancer Payouts', icon: TrendingUp },
              { id: 'reviews', label: '15. Reviews & Moderation', icon: Star },
              { id: 'messages', label: '16. Messages & Chat Audit', icon: MessageCircle },
              { id: 'reports', label: '17. Flagged Reports', icon: Flag },
              { id: 'support', label: '18. Support Ticket Desk', icon: HelpCircle },
              { id: 'cms', label: '19. CMS & Legal Policies', icon: FileCode },
              { id: 'settings', label: '20. Site & Fee Settings', icon: Settings },
              { id: 'memberships', label: '21. Memberships & Quotas', icon: Award },
              { id: 'paymentGateways', label: 'Payment Gateways', icon: CreditCard },
              { id: 'activity', label: '22. Activity & Audit Trail', icon: Activity }
            ].map(item => {
              const IconComp = item.icon;
              const isActive = adminTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setAdminTab(item.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-fiverr-dark hover:text-fiverr-dark hover:bg-slate-100'
                  }`}
                >
                  <IconComp className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Status & Exit */}
        <div className="space-y-4 pt-6 border-t border-slate-200 mt-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase font-bold text-fiverr-muted tracking-wider">Gateway Telemetry</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <p className="text-[11px] text-fiverr-dark font-medium">RBAC Active · 14-Day Escrow Locked</p>
          </div>

          <a 
            href="/gigs" 
            onClick={(e) => navigate('/gigs', e)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-fiverr-dark bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-emerald-600" />
            <span>Exit Admin Portal</span>
          </a>
        </div>
      </aside>

      {/* MAIN ADMIN CONTENT AREA */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-200">
          <div>
            <span className="text-xs font-semibold text-emerald-600 block mb-1">Super Administrator Console</span>
            <h1 className="text-2xl font-bold text-fiverr-dark">
              {adminTab === 'overview' && '1. Admin Dashboard & Metrics'}
              {adminTab === 'users' && '2. User Management & Impersonation'}
              {adminTab === 'projects' && '3. Projects & RFP Moderation'}
              {adminTab === 'gigs' && '4. Services & Gigs Management'}
              {adminTab === 'orders' && '5. All Orders Management'}
              {adminTab === 'categories' && '6. Categories, Subcategories & Slugs'}
              {adminTab === 'proposals' && '7. Proposals & Bid Audit'}
              {adminTab === 'contracts' && '8. Contracts & Milestone Timelines'}
              {adminTab === 'payments' && '9. Payments & Razorpay/Stripe Logs'}
              {adminTab === 'wallet' && '10. User Wallets & Double-Entry Ledger'}
              {adminTab === 'escrow' && '11. Escrow Management (Mandatory 14-Day Protection)'}
              {adminTab === 'disputes' && '12. Dispute Investigation & Resolution'}
              {adminTab === 'refunds' && '13. Refund Requests & Approvals'}
              {adminTab === 'payouts' && '14. Freelancer Payouts & Disbursements'}
              {adminTab === 'reviews' && '15. Reviews & Ratings Moderation'}
              {adminTab === 'messages' && '16. Messages & Conversation Audit'}
              {adminTab === 'reports' && '17. Flagged Reports & Cases'}
              {adminTab === 'support' && '18. Support Ticket Help Desk'}
              {adminTab === 'cms' && '19. CMS Pages & Legal Policies'}
              {adminTab === 'settings' && '20. Site & Fee Settings'}
              {(adminTab === 'security' || adminTab === 'activity') && '21. Admin Activity Logs & Security Audit Trail'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-fiverr-dark bg-white px-3 py-1.5 rounded-lg border border-slate-200 font-mono shadow-xs">
              RBAC Level: Super Admin
            </span>
          </div>
        </div>

        {/* MODULE 1: DASHBOARD OVERVIEW */}
        {adminTab === 'overview' && (
          <AdminOverviewModule 
            allUsers={usersList} 
            allProjects={projects} 
            allGigs={gigs} 
            allOrders={orders} 
            escrowAccounts={orders} 
            platformBalance={orders.reduce((sum, o) => sum + o.amount, 0) * (platformFee / 100)} 
          />
        )}

        {/* MODULE 2: USER MANAGEMENT */}
        {adminTab === 'users' && (
          <AdminUsersModule 
            allUsers={usersList} 
            onImpersonateUser={(userId) => { 
              const u = usersList.find(x => x.id === userId); 
              if (u) setImpersonatedUser(u); 
            }} 
            onToggleUserStatus={(userId) => { 
              setUsersList(prev => prev.map(u => u.id === userId ? { ...u, status: u.status === 'suspended' ? 'active' : 'suspended' } : u)); 
            }} 
          />
        )}

        {/* MODULE 3: PROJECTS MANAGEMENT */}
        {adminTab === 'projects' && (
          <AdminProjectsModule allProjects={projects} />
        )}

        {/* MODULE 4: FREELANCER GIGS & SERVICES MANAGEMENT */}
        {adminTab === 'gigs' && (
          <AdminGigsModule allGigs={gigs} />
        )}

        {/* MODULE 5: CATEGORIES & SUBCATEGORIES MANAGEMENT */}
        {adminTab === 'categories' && (
          <AdminCategoriesModule />
        )}

        {/* MODULE 6: ALL ORDERS MANAGEMENT (Real AdminOrdersManager) */}
        {adminTab === 'orders' && (
          <AdminOrdersManager
            orders={orders}
            users={usersList}
            gigs={gigs}
            currentUser={effectiveAdminUser}
            onRefreshOrders={refresh}
            getGigUrl={(gig: any) => `/${gig.freelancerUsername || 'user'}/${gig.slug || gig.id}`}
          />
        )}

        {/* MODULE 7: PROPOSALS & BIDS MANAGEMENT */}
        {adminTab === 'proposals' && (
          <AdminProposalsModule
            initialProposals={proposals as any}
            onUpdateProposalStatus={async (id, status) => {
              await fetch(`/api/admin/proposals/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
              });
              if (refresh) refresh();
            }}
            onDeleteProposal={async (id) => {
              await fetch(`/api/admin/proposals/${id}`, { method: 'DELETE' });
              if (refresh) refresh();
            }}
          />
        )}

        {/* MODULE 8: CONTRACTS & MILESTONES */}
        {adminTab === 'contracts' && (
          <AdminContractsModule initialContracts={contractsData} />
        )}

        {/* MODULE 9: PAYMENTS (Real PaymentsModule) */}
        {adminTab === 'payments' && (
          <PaymentsModule
            gigs={gigs}
            orders={orders}
            projects={projects}
            proposals={proposals}
            currentUser={effectiveAdminUser}
            onBalanceUpdate={refresh}
          />
        )}

        {/* MODULE 10: USER WALLETS (Real UserWalletsLedgerModule) */}
        {adminTab === 'wallet' && (
          <UserWalletsLedgerModule
            currentUser={effectiveAdminUser}
          />
        )}

        {/* MODULE 11: ESCROW MANAGEMENT */}
        {adminTab === 'escrow' && (
          <AdminEscrowModule
            escrowAccounts={orders}
            onReleaseEscrow={async (orderId) => {
              await fetch(`/api/admin/finance/escrow/${orderId}/release`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Admin manual release from Admin Console' })
              });
              await refresh();
            }}
            onRefundEscrow={async (orderId) => {
              await fetch(`/api/admin/finance/escrow/${orderId}/refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Admin manual refund from Admin Console' })
              });
              await refresh();
            }}
          />
        )}

        {/* MODULE 12: DISPUTES */}
        {adminTab === 'disputes' && (
          <AdminDisputesModule
            initialDisputes={adminDisputes}
            onResolveDispute={async (disputeId, resolution) => {
              await fetch(`/api/admin/disputes/${disputeId}/resolve`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: resolution })
              });
              if (refresh) refresh();
            }}
          />
        )}

        {/* MODULE 13: REFUNDS */}
        {adminTab === 'refunds' && (
          <AdminRefundsModule
            initialRefunds={adminRefunds}
            onApproveRefund={async (refundId) => {
              await fetch(`/api/admin/refunds/${refundId}/approve`, { method: 'POST' });
              if (refresh) refresh();
            }}
            onRejectRefund={async (refundId) => {
              await fetch(`/api/admin/refunds/${refundId}/reject`, { method: 'POST' });
              if (refresh) refresh();
            }}
          />
        )}

        {/* MODULE 14: PAYOUTS */}
        {adminTab === 'payouts' && (
          <AdminPayoutsModule
            initialPayouts={adminPayouts}
            onApprovePayout={async (payoutId) => {
              await fetch(`/api/admin/finance/payouts/${payoutId}/approve`, { method: 'POST' });
              if (refresh) refresh();
            }}
            onRejectPayout={async (payoutId) => {
              await fetch(`/api/admin/finance/payouts/${payoutId}/reject`, { method: 'POST' });
              if (refresh) refresh();
            }}
          />
        )}

        {/* MODULE 15: REVIEWS */}
        {adminTab === 'reviews' && (
          <AdminReviewsModule
            initialReviews={adminReviews}
            onUpdateReviewStatus={async (id, status, reason) => {
              await fetch(`/api/admin/reviews/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, moderationStatus: status, reason })
              });
              if (refresh) refresh();
            }}
            onDeleteReview={async (id) => {
              await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE' });
              if (refresh) refresh();
            }}
          />
        )}

        {/* MODULE 16: MESSAGES */}
        {adminTab === 'messages' && (
          <AdminMessagesModule
            initialThreads={adminThreads}
            onModerateThread={async (threadId, action, note) => {
              await fetch(`/api/admin/messages/moderate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threadId, action, note })
              });
              if (refresh) refresh();
            }}
          />
        )}

        {/* MODULE 17: REPORTS */}
        {adminTab === 'reports' && (
          <AdminReportsModule
            initialReports={adminReports}
            onTakeAction={async (reportId, action) => {
              await fetch(`/api/admin/reports/${reportId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, status: 'resolved' })
              });
              if (refresh) refresh();
            }}
            onDismissReport={async (reportId) => {
              await fetch(`/api/admin/reports/${reportId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'dismissed' })
              });
              if (refresh) refresh();
            }}
          />
        )}

        {/* MODULE 18: SUPPORT TICKETS */}
        {adminTab === 'support' && (
          <AdminSupportModule
            initialTickets={adminTickets}
            onReplyTicket={async (ticketId, replyText) => {
              await fetch(`/api/admin/tickets/${ticketId}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: replyText })
              });
              if (refresh) refresh();
            }}
            onUpdateTicketStatus={async (ticketId, status) => {
              await fetch(`/api/admin/tickets/${ticketId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
              });
              if (refresh) refresh();
            }}
          />
        )}

        {/* MODULE 19: CMS */}
        {adminTab === 'cms' && (
          <AdminCmsModule />
        )}

        {/* MODULE 20: SETTINGS (Real SiteFeeSettingsModule) */}
        {adminTab === 'settings' && (
          <SiteFeeSettingsModule
            currentUser={effectiveAdminUser}
            initialTakeRate={platformFee}
            initialClientServiceFee={clientServiceFee}
            initialSmallOrderFeeThreshold={smallOrderFeeThreshold}
            initialSmallOrderFeeAmount={smallOrderFeeAmount}
            initialEscrowHoldDays={escrowProtectionDays}
            onSettingsSaved={() => refresh()}
          />
        )}

        {/* MODULE 21: MEMBERSHIPS & QUOTAS */}
        {adminTab === 'memberships' && (
          <AdminMembershipsQuotasModule />
        )}

        {/* MODULE 22: PAYMENT GATEWAYS */}
        {adminTab === 'paymentGateways' && (
          <AdminPaymentGatewaysModule />
        )}

        {/* MODULE 23: ACTIVITY & AUDIT */}
        {(adminTab === 'security' || adminTab === 'activity') && (
          <AdminActivityModule />
        )}

        {/* FALLBACK FOR OTHER MODULES */}
        {!['overview', 'users', 'projects', 'gigs', 'categories', 'orders', 'proposals', 'contracts', 'payments', 'wallet', 'escrow', 'payouts', 'disputes', 'refunds', 'reviews', 'messages', 'reports', 'support', 'cms', 'settings', 'memberships', 'paymentGateways', 'security', 'activity'].includes(adminTab) && (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-3 shadow-xs">
            <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
            <h3 className="text-base font-bold text-fiverr-dark uppercase">{adminTab} Module Active</h3>
            <p className="text-xs text-fiverr-muted">All data records and audit logs for this module are synchronized with PostgreSQL storage.</p>
          </div>
        )}
      </main>
    </div>
  );
};
