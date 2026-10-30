import React from 'react';
import { Star, Trash2, Settings, ShieldCheck } from 'lucide-react';
import { Gig } from '../../types';
import { RelatedGigsSection } from './RelatedGigsSection';
import { Reviews } from '../gig_reviews';

interface ViewingGigModalProps {
  viewingGig: Gig | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (gig: Gig) => void;
  allGigs?: Gig[];
  onSelectGig?: (gig: Gig) => void;
}

export const ViewingGigModal: React.FC<ViewingGigModalProps> = ({
  viewingGig,
  onClose,
  onDelete,
  onEdit,
  allGigs,
  onSelectGig
}) => {
  if (!viewingGig) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-3xl w-full space-y-6 max-h-[90vh] overflow-y-auto text-slate-800 shadow-2xl">
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold leading-tight text-slate-900 text-fiverr-dark">{viewingGig.title}</h1>
              {viewingGig.featured && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-xs font-bold">★ Featured</span>
              )}
            </div>
            <p className="text-xs font-normal text-fiverr-muted mt-1">Gig ID: #{viewingGig.id} · Category: <span className="text-emerald-600 font-semibold">{viewingGig.category} ({viewingGig.subcategory || 'General'})</span></p>
          </div>
          <button 
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-fiverr-dark text-xs font-bold rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <img 
              src={viewingGig.image || 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&h=500&fit=crop'} 
              className="w-full h-48 rounded-2xl object-cover border border-slate-200 shadow-xs" 
              alt={viewingGig.title}
              referrerPolicy="no-referrer"
            />
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[11px] text-fiverr-muted uppercase font-normal block">Starting Price</span>
                <span className="text-xl font-bold text-fiverr-dark">${viewingGig.price}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[9px] text-fiverr-muted uppercase font-bold block">Delivery Time</span>
                <span className="text-sm font-bold text-fiverr-dark">{viewingGig.deliveryDays} Days</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[9px] text-fiverr-muted uppercase font-bold block">Rating</span>
                <span className="text-sm font-bold text-amber-500">★ {viewingGig.rating || 5.0}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <h2 className="text-xl font-bold text-slate-900 text-fiverr-dark uppercase mb-2">Gig Description</h2>
              <p className="text-base text-slate-800 text-fiverr-dark leading-body whitespace-pre-wrap">{viewingGig.description}</p>
            </div>

            {viewingGig.extras && viewingGig.extras.length > 0 && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h2 className="text-xl font-bold text-slate-900 text-fiverr-dark uppercase mb-2">Gig Upgrades & Extras</h2>
                <div className="space-y-2">
                  {viewingGig.extras.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs bg-white px-3 py-2 rounded-lg border border-slate-200">
                      <span className="text-slate-800">{e.title}</span>
                      <span className="font-bold text-emerald-600">+${e.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* GIG PROGRESS & PERFORMANCE METRICS */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-fiverr-dark">Live Gig Progress & Analytics</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
              viewingGig.status === 'active' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
              viewingGig.status === 'paused' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
              viewingGig.status === 'moderation' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
              'bg-slate-100 text-slate-700 border border-slate-200'
            }`}>
              {viewingGig.status === 'active' ? 'Active' :
               viewingGig.status === 'paused' ? 'Paused' :
               viewingGig.status === 'moderation' ? 'Under Moderation' :
               viewingGig.status === 'deleted' ? 'Deleted' : viewingGig.status}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Views</span>
              <span className="text-base font-bold text-fiverr-dark font-mono">1,482</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Client Inquiries</span>
              <span className="text-base font-bold text-fiverr-dark font-mono">46</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Orders Completed</span>
              <span className="text-base font-bold text-emerald-600 font-mono">18</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">On-Time Delivery</span>
              <span className="text-base font-bold text-indigo-600 font-mono">100%</span>
            </div>
          </div>
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[11px] font-bold text-fiverr-dark">
              <span>Gig Quality & Health Score</span>
              <span className="text-emerald-600 font-mono">98 / 100 (Optimal)</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '98%' }}></div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={viewingGig.freelancerAvatar} className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/20" alt={viewingGig.freelancerName} referrerPolicy="no-referrer" />
            <div>
              <span className="text-xs font-bold text-fiverr-dark block">{viewingGig.freelancerName}</span>
              <span className="text-[11px] text-fiverr-muted">Freelancer ID: {viewingGig.freelancerId} · Level: {viewingGig.freelancerLevel || 'Pro'}</span>
            </div>
          </div>
          <span className="text-xs text-fiverr-muted">Moderation: {viewingGig.moderationStatus || 'Pending review'}</span>
        </div>

        {viewingGig.moderationNotes && (
          <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl text-xs space-y-1">
            <span className="font-bold text-purple-700 block">Moderation Log Notes:</span>
            <p className="text-purple-900">{viewingGig.moderationNotes}</p>
          </div>
        )}

        {/* CLIENT REVIEWS SECTION */}
        <Reviews currentGig={viewingGig} />

        {/* RELATED & SIMILAR GIGS SECTION */}
        <RelatedGigsSection
          currentGig={viewingGig}
          allGigs={allGigs}
          onSelectGig={onSelectGig}
          maxItems={3}
        />

        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
          <button 
            onClick={() => onDelete(viewingGig.id)}
            className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-bold rounded-xl flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Service</span>
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onEdit(viewingGig)}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl flex items-center gap-1 text-xs transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Edit Details</span>
            </button>
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-fiverr-dark font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
