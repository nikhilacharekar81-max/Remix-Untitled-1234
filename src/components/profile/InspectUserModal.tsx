import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { UserAccount, Gig, Project, Proposal, Order, Review, SupportTicket } from '../../types';

interface InspectUserModalProps {
  inspectingUser: UserAccount | null;
  onClose: () => void;
  userActivityTab: 'overview' | 'gigs' | 'projects' | 'proposals' | 'orders' | 'reviews' | 'tickets';
  setUserActivityTab: (tab: 'overview' | 'gigs' | 'projects' | 'proposals' | 'orders' | 'reviews' | 'tickets') => void;
  gigs: Gig[];
  projects: Project[];
  proposals: Proposal[];
  orders: Order[];
  reviews: Review[];
  supportTickets: SupportTicket[];
}

export const InspectUserModal: React.FC<InspectUserModalProps> = ({
  inspectingUser,
  onClose,
  userActivityTab,
  setUserActivityTab,
  gigs,
  projects,
  proposals,
  orders,
  reviews,
  supportTickets
}) => {
  if (!inspectingUser) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-4xl w-full space-y-6 max-h-[90vh] overflow-y-auto text-slate-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <img 
              src={inspectingUser.avatar} 
              className="w-14 h-14 rounded-full object-cover ring-2 ring-emerald-500/30" 
              alt={inspectingUser.name} 
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150'; }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900">{inspectingUser.name}</h3>
                {inspectingUser.verified && (
                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-bold flex items-center gap-1 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{inspectingUser.email} · Role: <span className="text-emerald-700 uppercase font-bold">{inspectingUser.role}</span></p>
              <p className="text-xs text-slate-800 font-medium mt-1">{inspectingUser.title}</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Stats summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">Wallet Balance</span>
            <span className="text-lg font-bold text-slate-900">${(inspectingUser.walletBalance || 0).toLocaleString()}</span>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Earned</span>
            <span className="text-lg font-bold text-emerald-700">${(inspectingUser.earned || 0).toLocaleString()}</span>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">Hourly Rate</span>
            <span className="text-lg font-bold text-slate-900">${inspectingUser.hourlyRate || 0}/hr</span>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold block">Completed Jobs</span>
            <span className="text-lg font-bold text-indigo-700">{inspectingUser.completedJobs || 0}</span>
          </div>
        </div>

        {/* Tabs for complete user activity */}
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2 overflow-x-auto">
          {(['overview', 'gigs', 'projects', 'proposals', 'orders', 'reviews', 'tickets'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setUserActivityTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer ${
                userActivityTab === tab ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {tab === 'overview' && 'Overview'}
              {tab === 'gigs' && `Gigs (${gigs.filter(g => g.freelancerId === inspectingUser.id || g.freelancerName === inspectingUser.name).length})`}
              {tab === 'projects' && `Projects (${projects.filter(p => p.buyerId === inspectingUser.id || p.buyerName === inspectingUser.name).length})`}
              {tab === 'proposals' && `Proposals (${proposals.filter(p => p.freelancerId === inspectingUser.id).length})`}
              {tab === 'orders' && `Orders & Escrow (${orders.filter(o => o.buyerId === inspectingUser.id || o.sellerId === inspectingUser.id).length})`}
              {tab === 'reviews' && `Reviews (${reviews.filter(r => r.targetUserId === inspectingUser.id).length})`}
              {tab === 'tickets' && `Support (${supportTickets.filter(t => t.userId === inspectingUser.id).length})`}
            </button>
          ))}
        </div>

        {/* Tab 1: Overview */}
        {userActivityTab === 'overview' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <span className="text-slate-500 font-bold uppercase block mb-1">Biography</span>
              <p className="text-slate-800">{inspectingUser.bio || 'No biography provided.'}</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <span className="text-slate-500 font-bold uppercase block mb-2">Skills & Expertise</span>
              <div className="flex flex-wrap gap-2">
                {inspectingUser.skills && inspectingUser.skills.length > 0 ? (
                  inspectingUser.skills.map((sk, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-white border border-slate-200 text-emerald-700 rounded-lg font-semibold shadow-2xs">
                      {sk}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">No skills listed</span>
                )}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex justify-between items-center">
              <span className="text-slate-500">Account Joined Date</span>
              <span className="font-mono text-slate-900 font-semibold">{inspectingUser.createdAt || '2025-01-15'}</span>
            </div>
          </div>
        )}

        {/* Tab 2: Gigs */}
        {userActivityTab === 'gigs' && (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {gigs.filter(g => g.freelancerId === inspectingUser.id || g.freelancerName === inspectingUser.name).map(g => (
              <div key={g.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900 block mb-0.5">{g.title}</span>
                  <span className="text-slate-500">{g.category} · Status: <strong className="text-emerald-700">{g.status}</strong></span>
                </div>
                <span className="font-bold text-slate-900 text-sm">${(g.price).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Projects */}
        {userActivityTab === 'projects' && (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {projects.filter(p => p.buyerId === inspectingUser.id || p.buyerName === inspectingUser.name).map(p => (
              <div key={p.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900 block mb-0.5">{p.title}</span>
                  <span className="text-slate-500">Budget: ${p.budgetMin} - ${p.budgetMax} · Status: <strong className="text-emerald-700">{p.status}</strong></span>
                </div>
                <span className="text-slate-500 font-mono">{p.createdAt}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Proposals */}
        {userActivityTab === 'proposals' && (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {proposals.filter(p => p.freelancerId === inspectingUser.id).map(p => (
              <div key={p.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900">Bid Amount: ${p.bidAmount} ({p.deliveryDays} Days)</span>
                  <span className="text-emerald-700 font-bold uppercase">{p.status}</span>
                </div>
                <p className="text-slate-800 italic bg-white p-2.5 rounded-xl border border-slate-200">{p.coverLetter}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: Orders & Escrow */}
        {userActivityTab === 'orders' && (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {orders.filter(o => o.buyerId === inspectingUser.id || o.sellerId === inspectingUser.id).map(o => (
              <div key={o.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900 block mb-0.5">{o.title}</span>
                  <span className="text-slate-500">Order #{o.id} · Status: <strong className="text-emerald-700">{o.status}</strong></span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-slate-900 text-sm block">${o.amount}</span>
                  <span className="text-[10px] text-emerald-700 font-semibold">14-Day Escrow Vault</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 6: Reviews */}
        {userActivityTab === 'reviews' && (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {reviews.filter(r => r.targetUserId === inspectingUser.id).map(r => (
              <div key={r.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900">{r.reviewerName} (Rating: {r.rating} ★)</span>
                  <span className="text-slate-500">{r.createdAt}</span>
                </div>
                <p className="text-slate-800">{r.comment || r.review}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 7: Support Tickets */}
        {userActivityTab === 'tickets' && (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {supportTickets.filter(t => t.userId === inspectingUser.id).map(t => (
              <div key={t.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900 block mb-0.5">{t.subject}</span>
                  <span className="text-slate-500">Priority: {t.priority} · Status: {t.status}</span>
                </div>
                <span className="text-slate-500">{t.createdAt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
