import React, { useState, useEffect } from 'react';
import { Star, Sparkles, Clock, RefreshCw, ShieldCheck, Lock, MessageSquare, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { Gig, Review, UserAccount, Order } from '../../types';
import { RelatedGigsSection } from './RelatedGigsSection';
import { Reviews } from '../gig_reviews';
import { PPH_CATEGORIES } from '../HeaderCategoriesNav';
import { DEFAULT_AVATAR, DEFAULT_GIG_IMAGE } from '../../constants';

const CATEGORY_SLUGS: Record<string, string> = {
  'All': 'all',
  'Development & IT': 'technology-programming',
  'AI & Data': 'ai-services',
  'Design & Creative': 'design',
  'Mobile Apps': 'technology-programming'
};

PPH_CATEGORIES.forEach(cat => {
  CATEGORY_SLUGS[cat.name] = cat.slug;
  cat.subcategories.forEach(sub => {
    CATEGORY_SLUGS[sub.name] = sub.slug;
  });
});

interface GigDetailViewProps {
  currentGig: Gig;
  gigs: Gig[];
  reviews: Review[];
  orders?: Order[];
  currentUser?: UserAccount | null;
  navigate: (path: string, e?: React.MouseEvent) => void;
  handleContactSeller: (freelancerId: string, freelancerName: string, gigTitle: string, gigId?: string, projectId?: string) => void;
  handleCreateOrder: (orderTitle: string, priceUSD: number, sellerId: string, gigId?: string, extraIds?: string[]) => void;
  isCreatingOrder?: boolean;
  orderFeedback?: { type: 'success' | 'error'; message: string; orderId?: string } | null;
  onDismissOrderFeedback?: () => void;
  slugify?: (text: string) => string;
}

export const GigDetailView: React.FC<GigDetailViewProps> = ({
  currentGig,
  gigs,
  reviews,
  orders,
  currentUser,
  navigate,
  handleContactSeller,
  handleCreateOrder,
  isCreatingOrder = false,
  orderFeedback = null,
  onDismissOrderFeedback,
  slugify
}) => {
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [isPuppetVideoPlaying, setIsPuppetVideoPlaying] = useState<boolean>(false);

  // Fee quote from the server: the same math the ledger applies when the order is funded.
  const [quote, setQuote] = useState<{ gigPrice: number; serviceFee: number; smallOrderFee: number; clientTotal: number; config?: { buyerFeePercent: number; smallOrderThreshold: number } } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ gigId: currentGig.id });
    if (selectedExtras.length > 0) qs.set('extraIds', selectedExtras.join(','));
    fetch(`/api/fees/quote?${qs.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(q => { if (!cancelled) setQuote(q); })
      .catch(() => { if (!cancelled) setQuote(null); });
    return () => { cancelled = true; };
  }, [currentGig.id, selectedExtras]);

  const safeSlugify = (str: string) => {
    if (slugify) return slugify(str);
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-fiverr-muted font-medium">
        <a href="/gigs" onClick={(e) => navigate('/gigs', e)} className="hover:text-fiverr-dark">Home</a>
        <span>/</span>
        <a 
          href={`/categories/${CATEGORY_SLUGS[currentGig.category] || 'technology-programming'}`} 
          onClick={(e) => navigate(`/categories/${CATEGORY_SLUGS[currentGig.category] || 'technology-programming'}`, e)} 
          className="hover:text-fiverr-dark"
        >
          {currentGig.category}
        </a>
        <span>/</span>
        <span className="text-fiverr-dark font-semibold truncate max-w-xs">{currentGig.subcategory || 'Services'}</span>
      </div>

      {/* Title & Seller Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 text-fiverr-dark tracking-tight leading-tight mb-4">
          {currentGig.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2.5">
            <img 
              src={currentGig.freelancerAvatar || DEFAULT_AVATAR} 
              alt={currentGig.freelancerName} 
              className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100" 
              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
            />
            <div>
              <span className="font-bold text-fiverr-dark block">{currentGig.freelancerName}</span>
              <span className="text-fiverr-muted font-mono">@{currentGig.freelancerUsername || safeSlugify(currentGig.freelancerName)}</span>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

          <div className="flex items-center gap-1 font-bold text-fiverr-dark">
            <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>{currentGig.rating}</span>
            <span className="text-slate-400 font-normal">({currentGig.reviewsCount.toLocaleString()} reviews)</span>
          </div>

          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

          <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-md text-[11px]">
            {currentGig.freelancerLevel || 'Top Rated Seller'}
          </span>

          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 font-semibold px-2.5 py-1 rounded-md text-[11px]">
            3 orders in queue
          </span>
        </div>
      </div>

      {/* Main Content Grid: Gallery & Description Left, Package Box Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* LEFT COLUMN: Gallery & Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Media Preview: Interactive Promotional Explainer Video Player */}
          <div className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-xl relative group">
            {isPuppetVideoPlaying ? (
              <div className="relative aspect-video bg-black flex flex-col items-center justify-center text-white p-6">
                <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1536240478700-b869070f9279?w=1200&h=700&fit=crop')` }}></div>
                <div className="relative z-10 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-600/90 text-white flex items-center justify-center mx-auto shadow-lg animate-pulse">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight">Playing Promotional Explainer Video (1080p HD)</h3>
                  <p className="text-xs text-slate-300 max-w-md mx-auto">Custom puppet character rigging, professional voiceover, and dynamic motion graphics.</p>
                  
                  <div className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl p-3 flex items-center gap-4 mt-6">
                    <button onClick={() => setIsPuppetVideoPlaying(false)} className="px-3 py-1 bg-white text-fiverr-dark font-bold rounded-lg text-xs hover:bg-slate-100 cursor-pointer">Pause</button>
                    <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                      <div className="w-3/5 h-full bg-emerald-500 animate-pulse"></div>
                    </div>
                    <span className="text-[10px] font-mono">01:14 / 02:00</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative aspect-video bg-slate-900 flex items-center justify-center group cursor-pointer" onClick={() => setIsPuppetVideoPlaying(true)}>
                <img 
                  src={currentGig.image || DEFAULT_GIG_IMAGE} 
                  alt={currentGig.title} 
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE;
                  }}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-90 transition-opacity" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent flex flex-col justify-between p-6">
                  <div className="flex items-center justify-between">
                    <span className="bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                      🎬 Promotional Explainer Video
                    </span>
                    <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-mono px-2.5 py-1 rounded-lg">02:00 HD</span>
                  </div>

                  <div className="text-center">
                    <div className="w-20 h-20 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-2xl group-hover:scale-110 transition-transform mb-3 border-4 border-white/20">
                      <svg className="w-8 h-8 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                    <span className="text-white font-bold text-sm drop-shadow-md">Click to Play Promotional Explainer Video</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-300 font-medium">
                    <span>Directed by {currentGig.freelancerName}</span>
                    <span>Puppet Animation & Character Rigging</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* About This Gig */}
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs space-y-4">
            <h2 className="text-xl font-bold text-fiverr-dark border-b border-slate-100 pb-3">About This Gig</h2>
            <p className="text-base text-fiverr-dark leading-body whitespace-pre-line font-normal">
              {currentGig.description}
            </p>

            <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs text-fiverr-dark">
              <div>
                <span className="font-bold text-fiverr-dark block mb-1">Service Category</span>
                <span>{currentGig.category}</span>
              </div>
              <div>
                <span className="font-bold text-fiverr-dark block mb-1">Subcategory</span>
                <span>{currentGig.subcategory || 'General'}</span>
              </div>
            </div>
          </div>

          {/* About The Seller */}
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs space-y-6">
            <h2 className="text-xl font-bold text-fiverr-dark border-b border-slate-100 pb-3">About The Seller</h2>
            
            <div className="flex items-center gap-4">
              <img 
                src={currentGig.freelancerAvatar || DEFAULT_AVATAR} 
                alt={currentGig.freelancerName} 
                className="w-16 h-16 rounded-full object-cover ring-4 ring-slate-100" 
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
              />
              <div>
                <h3 className="text-base font-bold text-fiverr-dark">{currentGig.freelancerName}</h3>
                <p className="text-xs text-fiverr-muted font-mono">@{currentGig.freelancerUsername || safeSlugify(currentGig.freelancerName)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-amber-500 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-500" /> {currentGig.rating}
                  </span>
                  <span className="text-xs text-slate-400">({currentGig.reviewsCount} reviews)</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block mb-1">From</span>
                <span className="font-bold text-slate-800">United States</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Member since</span>
                <span className="font-bold text-slate-800">Jan 2024</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Avg. response time</span>
                <span className="font-bold text-slate-800">1 hour</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Last delivery</span>
                <span className="font-bold text-slate-800">about 2 hours</span>
              </div>
            </div>

            <button 
              onClick={() => handleContactSeller(currentGig.freelancerId, currentGig.freelancerName, currentGig.title, currentGig.id)}
              className="w-full sm:w-auto px-6 py-2.5 border-2 border-slate-900 text-fiverr-dark font-bold rounded-xl text-xs hover:bg-slate-900 hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span>Contact Seller ({currentGig.freelancerName})</span>
            </button>
          </div>

          {/* GIG REVIEWS SECTION */}
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
            <Reviews currentGig={currentGig} allReviews={reviews} allOrders={orders} currentUser={currentUser} />
          </div>

        </div>

        {/* RIGHT COLUMN: Simple Order Box with Optional Extras */}
        <div className="lg:col-span-1 sticky top-24">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden p-6 space-y-6">
            {(() => {
              const extrasList = currentGig.extras || [];
              const selectedExtrasObjects = extrasList.filter(e => selectedExtras.includes(e.id));
              const extrasTotalUSD = selectedExtrasObjects.reduce((sum, e) => sum + e.price, 0);
              const totalUSD = currentGig.price + extrasTotalUSD;

              return (
                <>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div>
                      <span className="text-xs font-normal text-fiverr-muted uppercase tracking-wider block">Gig Base Price</span>
                      <span className="text-[19px] font-bold text-fiverr-dark">${currentGig.price.toLocaleString()}</span>
                    </div>
                    <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg">
                      USD ($)
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-fiverr-dark">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-fiverr-muted" />
                      <span>{currentGig.deliveryDays} Days Delivery</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 text-fiverr-muted" />
                      <span>Unlimited Revisions</span>
                    </div>
                  </div>

                  {/* Optional Gig Extras Section */}
                  {extrasList.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                      <h4 className="text-xs font-bold text-fiverr-dark uppercase tracking-wider">
                        Upgrade Your Order with Extras:
                      </h4>
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {extrasList.map(extra => {
                          const isChecked = selectedExtras.includes(extra.id);
                          return (
                            <label 
                              key={extra.id} 
                              className={`flex items-start gap-3 p-3 rounded-2xl border text-xs cursor-pointer transition-all ${isChecked ? 'bg-emerald-50/60 border-emerald-300 text-fiverr-dark font-semibold' : 'bg-slate-50 border-slate-200 text-fiverr-dark hover:bg-slate-100'}`}
                            >
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedExtras(prev => [...prev, extra.id]);
                                  } else {
                                    setSelectedExtras(prev => prev.filter(id => id !== extra.id));
                                  }
                                }}
                                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 shrink-0"
                              />
                              <div className="flex-1 flex items-center justify-between gap-2">
                                <span>{extra.title}</span>
                                <span className="font-bold text-fiverr-dark shrink-0">+${extra.price.toLocaleString()}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Price breakdown and Total Summary */}
                  {(() => {
                    const q = quote && Math.abs(quote.gigPrice - totalUSD) < 0.005 ? quote : null;
                    const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    return (
                      <>
                        {q && (
                          <div className="pt-4 border-t border-slate-100 space-y-1.5 text-xs text-fiverr-muted">
                            <div className="flex justify-between"><span>Order{selectedExtras.length > 0 ? ' + extras' : ''}</span><span>{money(q.gigPrice)}</span></div>
                            <div className="flex justify-between"><span>Service fee ({q.config?.buyerFeePercent ?? 5.5}%)</span><span>{money(q.serviceFee)}</span></div>
                            {q.smallOrderFee > 0 && (
                              <div className="flex justify-between"><span>Small order fee (under ${q.config?.smallOrderThreshold ?? 200})</span><span>{money(q.smallOrderFee)}</span></div>
                            )}
                          </div>
                        )}
                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="text-xs text-fiverr-muted block font-normal">{q ? 'Total you pay' : 'Order amount (fees added at checkout)'}</span>
                            {selectedExtras.length > 0 && (
                              <span className="text-xs text-emerald-600 font-bold block">Includes {selectedExtras.length} selected extra(s)</span>
                            )}
                          </div>
                          <span className="text-[19px] font-bold text-fiverr-dark">{q ? money(q.clientTotal) : `$${totalUSD.toLocaleString()}`}</span>
                        </div>
                      </>
                    );
                  })()}

                  <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-3 flex items-start gap-2.5 text-[11px] text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>100% Escrow Protection. Funds are safely held until work is delivered and approved.</span>
                  </div>

                  {orderFeedback && (
                    <div
                      className={`p-3.5 rounded-2xl border text-xs flex items-start justify-between gap-2.5 ${
                        orderFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : 'bg-rose-50 border-rose-300 text-rose-900'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {orderFeedback.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1">
                          <span className="font-semibold block">{orderFeedback.message}</span>
                          {orderFeedback.orderId && (
                            <button
                              type="button"
                              onClick={(e) => navigate(`/messages/${orderFeedback.orderId}`, e)}
                              className="underline font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                            >
                              Open Workstream #{orderFeedback.orderId} →
                            </button>
                          )}
                        </div>
                      </div>
                      {onDismissOrderFeedback && (
                        <button
                          type="button"
                          onClick={onDismissOrderFeedback}
                          className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                          aria-label="Dismiss message"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {currentGig.status === 'paused' ? (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-center space-y-1">
                      <div className="flex items-center justify-center gap-2 text-amber-900 font-bold text-xs">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>This gig has been paused and cannot be purchased</span>
                      </div>
                      <p className="text-[11px] text-amber-700">The seller has temporarily paused orders for this service.</p>
                    </div>
                  ) : (
                    <button 
                      disabled={isCreatingOrder}
                      onClick={() => handleCreateOrder(
                        `${currentGig.title}${selectedExtrasObjects.length > 0 ? ` (with ${selectedExtrasObjects.length} extra add-ons)` : ''}`, 
                        totalUSD, 
                        currentGig.freelancerId,
                        currentGig.id,
                        selectedExtras
                      )}
                      className={`w-full py-4 font-bold rounded-2xl transition-colors shadow-md text-xs flex items-center justify-center gap-2 ${
                        isCreatingOrder
                          ? 'bg-emerald-300 text-slate-800 cursor-wait'
                          : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer'
                      }`}
                    >
                      {isCreatingOrder ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processing Escrow Order...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>Fund in Escrow & Order Now</span>
                        </>
                      )}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>

      </div>

      {/* RELATED & SIMILAR GIGS SECTION */}
      <RelatedGigsSection
        currentGig={currentGig}
        allGigs={gigs}
        onNavigate={navigate}
        maxItems={4}
      />
    </div>
  );
};
