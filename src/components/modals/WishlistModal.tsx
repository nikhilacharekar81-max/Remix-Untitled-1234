import React from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { Gig } from '../../types';
import { DEFAULT_GIG_IMAGE } from '../../constants';

interface WishlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  likedGigIds: string[];
  gigs: Gig[];
  onToggleLike: (gigId: string) => void;
  getGigUrl: (gig: Gig) => string;
  navigate: (url: string, e: React.MouseEvent) => void;
}

export const WishlistModal: React.FC<WishlistModalProps> = ({
  isOpen,
  onClose,
  likedGigIds,
  gigs,
  onToggleLike,
  getGigUrl,
  navigate
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-fiverr-dark flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500 fill-red-500" />
              <span>Your Liked Gigs & Wishlist ({likedGigIds.length})</span>
            </h3>
            <p className="text-xs text-fiverr-muted mt-0.5">Quickly access and manage the freelance service gigs you have saved.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-fiverr-dark hover:bg-slate-100 rounded-xl transition-colors text-xs font-bold cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {likedGigIds.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-3">
              <Heart className="w-10 h-10 text-slate-300 mx-auto" />
              <p>You haven't liked any gigs yet. Click the heart icon on any gig card to save it to your wishlist!</p>
            </div>
          ) : (
            gigs.filter(g => likedGigIds.includes(g.id)).map(gig => {
              const gUrl = getGigUrl(gig);
              return (
                <div key={gig.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img 
                      src={gig.image || DEFAULT_GIG_IMAGE} 
                      className="w-16 h-12 rounded-xl object-cover border border-slate-200" 
                      alt={gig.title} 
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE; }}
                    />
                    <div>
                      <a 
                        href={gUrl} 
                        onClick={(e) => {
                          onClose();
                          navigate(gUrl, e);
                        }}
                        className="font-bold text-slate-900 text-fiverr-dark text-xs hover:text-emerald-600 line-clamp-1 cursor-pointer"
                      >
                        {gig.title}
                      </a>
                      <span className="text-[11px] text-fiverr-muted block mt-0.5">{gig.category} · By {gig.freelancerName}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-fiverr-dark text-xs">${gig.price}</span>
                    <a 
                      href={gUrl}
                      onClick={(e) => {
                        onClose();
                        navigate(gUrl, e);
                      }}
                      className="px-3 py-1.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800"
                    >
                      View Gig
                    </a>
                    <button 
                      onClick={() => onToggleLike(gig.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-xl cursor-pointer"
                      title="Remove from wishlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
