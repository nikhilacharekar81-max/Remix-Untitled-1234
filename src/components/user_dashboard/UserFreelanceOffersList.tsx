import React from 'react';
import { Gig } from '../../types';
import { ChevronDown, ThumbsUp, Heart } from 'lucide-react';
import { DEFAULT_GIG_IMAGE } from '../../constants';

interface UserFreelanceOffersListProps {
  gigs: Gig[];
  freelanceSubFilter: string;
  activeFeatureDropdownGigId: string | null;
  soldCountsByGigId?: Record<string, number>;
  lastActivityByGigId?: Record<string, string>;
  onToggleDropdown: (gigId: string, e: React.MouseEvent) => void;
  onFeatureGig: (gigId: string) => void;
  onNavigateGig: (url: string, e: React.MouseEvent) => void;
  onPauseResumeGig: (gig: Gig) => void;
  onViewGigProgress: (gig: Gig) => void;
  onEditGig: (gig: Gig) => void;
  onDeleteGig: (gigId: string, title?: string) => void;
  getGigUrl: (gig: Gig) => string;
}

export const UserFreelanceOffersList: React.FC<UserFreelanceOffersListProps> = ({
  gigs,
  freelanceSubFilter,
  activeFeatureDropdownGigId,
  soldCountsByGigId = {},
  lastActivityByGigId = {},
  onToggleDropdown,
  onFeatureGig,
  onNavigateGig,
  onPauseResumeGig,
  onViewGigProgress,
  onEditGig,
  onDeleteGig,
  getGigUrl
}) => {
  if (gigs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500 text-sm space-y-1.5 bg-white font-sans">
        <p className="font-bold text-slate-900 text-base">No gigs found under &ldquo;{freelanceSubFilter}&rdquo;.</p>
        <p className="text-slate-500 text-sm">Post a new gig or switch filters above to view your listings.</p>
      </div>
    );
  }

  const renderCornerRibbon = (status: string) => {
    const normalized = (status || 'active').toLowerCase();
    let label = 'ACTIVE';
    let bgClass = 'bg-emerald-600';

    if (normalized === 'paused') {
      label = 'PAUSED';
      bgClass = 'bg-slate-800';
    } else if (normalized === 'moderation') {
      label = 'PENDING';
      bgClass = 'bg-amber-500';
    } else if (normalized === 'deleted') {
      label = 'DECLINED';
      bgClass = 'bg-rose-600';
    }

    return (
      <div
        className={`absolute -left-7 top-2.5 w-24 -rotate-45 text-center py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-xs pointer-events-none ${bgClass}`}
      >
        {label}
      </div>
    );
  };

  return (
    <div className="bg-white divide-y divide-slate-200/80 font-sans">
      {gigs.map(gig => {
        const gUrl = getGigUrl(gig);
        const isDeleted = gig.status === 'deleted';
        const isModeration = gig.status === 'moderation';
        const isPaused = gig.status === 'paused';
        const isActive = gig.status === 'active';
        const isDropdownOpen = activeFeatureDropdownGigId === gig.id;
        const soldCount = soldCountsByGigId[gig.id] ?? 0;
        const lastActivity = lastActivityByGigId[gig.id] || 'Recently updated';
        const hasRating = (gig.reviewsCount || 0) > 0;
        const ratingPercent = Math.round(((gig.rating || 5) / 5) * 100);

        return (
          <div
            key={gig.id}
            className={`py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 transition-colors ${
              isDeleted ? 'opacity-65' : ''
            }`}
          >
            {/* Left + Middle: Thumbnail and Gig Metadata */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="relative w-28 h-20 sm:w-32 sm:h-[84px] overflow-hidden bg-slate-100 border border-slate-200/90 shrink-0 rounded-lg shadow-2xs">
                <img
                  src={gig.image || DEFAULT_GIG_IMAGE}
                  alt={gig.title}
                  className={`w-full h-full object-cover ${isDeleted ? 'grayscale' : ''}`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE;
                  }}
                />
                {renderCornerRibbon(gig.status)}
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[76px]">
                <div>
                  {isDeleted ? (
                    <span className="text-base font-bold text-slate-400 line-through line-clamp-2 leading-snug">
                      {gig.title}
                    </span>
                  ) : isModeration ? (
                    <button
                      type="button"
                      onClick={() => onViewGigProgress(gig)}
                      className="text-left text-base font-bold text-slate-900 hover:text-emerald-600 transition-colors line-clamp-2 leading-snug cursor-pointer"
                    >
                      {gig.title}
                    </button>
                  ) : (
                    <a
                      href={gUrl}
                      onClick={(e) => onNavigateGig(gUrl, e)}
                      className="text-base font-bold text-slate-900 hover:text-emerald-600 transition-colors line-clamp-2 leading-snug cursor-pointer block"
                    >
                      {gig.title}
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 mt-2">
                  <span>
                    Last activity: <strong className="font-semibold text-slate-700">{lastActivity}</strong>
                  </span>
                  {hasRating ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                      <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{ratingPercent}%</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">Not rated</span>
                  )}
                  <span>
                    Price: <strong className="font-bold text-slate-900">${gig.price}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Heart className="w-3.5 h-3.5 fill-slate-300 text-slate-400" />
                    <span>{gig.reviewsCount || 0}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Sold Counter + Split Button with Small Dropdown at the End */}
            <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 self-stretch sm:min-w-[175px] gap-2.5">
              <div className="text-left sm:text-right leading-none">
                <span className="block text-xl font-bold text-slate-900 tracking-tight">
                  {soldCount}
                </span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                  SOLD
                </span>
              </div>

              {!isDeleted ? (
                <div className="relative">
                  <div
                    className={`inline-flex items-stretch rounded-lg border overflow-hidden shadow-2xs transition-colors ${
                      isDropdownOpen ? 'border-emerald-600 ring-2 ring-emerald-500/15' : 'border-slate-200 hover:border-slate-300'
                    } bg-white`}
                  >
                    <button
                      type="button"
                      onClick={() => onFeatureGig(gig.id)}
                      disabled={isModeration}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 ${
                        isDropdownOpen
                          ? 'text-emerald-600 bg-emerald-50/40'
                          : gig.featured
                          ? 'text-emerald-600 bg-emerald-50/60'
                          : 'text-slate-700 hover:text-emerald-600 hover:bg-slate-50'
                      }`}
                    >
                      {gig.featured ? 'FEATURED' : 'FEATURE IT'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onToggleDropdown(gig.id, e)}
                      aria-label="Gig actions"
                      className={`px-2.5 py-2 border-l flex items-center justify-center transition-colors cursor-pointer ${
                        isDropdownOpen
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border-slate-200'
                      }`}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isDropdownOpen && (
                    <div
                      className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-200/90 py-1.5 z-50 text-[13px] text-slate-700 font-sans"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(isActive || isPaused) && (
                        <button
                          type="button"
                          onClick={() => onPauseResumeGig(gig)}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 hover:text-emerald-600 text-slate-700 font-semibold transition-colors cursor-pointer block"
                        >
                          {isPaused ? 'Resume' : 'Pause'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onViewGigProgress(gig)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 hover:text-emerald-600 text-slate-700 font-semibold transition-colors cursor-pointer block"
                      >
                        View Progress
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditGig(gig)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 hover:text-emerald-600 text-slate-700 font-semibold transition-colors cursor-pointer block"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteGig(gig.id, gig.title)}
                        className="w-full text-left px-4 py-2 hover:bg-rose-50 text-slate-700 hover:text-rose-600 font-semibold transition-colors cursor-pointer block"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-3.5 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold uppercase tracking-wider">
                  Declined
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
