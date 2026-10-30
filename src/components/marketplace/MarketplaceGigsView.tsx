import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  Search, 
  ChevronRight, 
  ChevronLeft,
  Grid, 
  List, 
  Briefcase, 
  Star, 
  Heart,
  Clock,
  Send,
  Flame,
  Sparkles,
  DollarSign,
  Check,
  SlidersHorizontal,
  ArrowUpDown,
  Zap
} from 'lucide-react';
import { Gig, Project } from '../../types';
import { DEFAULT_AVATAR, DEFAULT_GIG_IMAGE } from '../../constants';
import { Avatar, GigImage } from '../../components/ui';

interface MarketplaceGigsViewProps {
  filteredGigs: Gig[];
  projects?: Project[];
  currentCategory: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeDropdown: string | null;
  setActiveDropdown: (d: string | null) => void;
  serviceOptionFilter: string;
  setServiceOptionFilter: (f: string) => void;
  sellerLevelFilter: string;
  setSellerLevelFilter: (f: string) => void;
  budgetFilter: string;
  setBudgetFilter: (f: string) => void;
  deliveryTimeFilter: number | null;
  setDeliveryTimeFilter: (d: number | null) => void;
  onlineNowOnly: boolean;
  setOnlineNowOnly: (b: boolean) => void;
  gigViewMode: 'grid' | 'list';
  setGigViewMode: (m: 'grid' | 'list') => void;
  likedGigIds: string[];
  handleToggleLike: (gigId: string, e: React.MouseEvent) => void;
  navigate: (path: string, e?: React.MouseEvent) => void;
  getGigUrl: (gig: Gig) => string;
  currentUser: any;
  setIsSignupModalOpen: (b: boolean) => void;
  slugify: (name: string) => string;
  CATEGORY_SLUGS: Record<string, string>;
  isHomePage?: boolean;
}

type SortOption = 'recommended' | 'bestselling' | 'rating' | 'price_asc' | 'price_desc' | 'newest';

function formatFiverrTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.toLowerCase().startsWith('i will')) {
    return 'I will ' + trimmed.slice(6).trim();
  }
  return `I will ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

function formatFiverrReviewCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

export const MarketplaceGigsView: React.FC<MarketplaceGigsViewProps> = ({
  filteredGigs,
  projects = [],
  currentCategory,
  searchQuery,
  setSearchQuery,
  activeDropdown,
  setActiveDropdown,
  serviceOptionFilter,
  setServiceOptionFilter,
  sellerLevelFilter,
  setSellerLevelFilter,
  budgetFilter,
  setBudgetFilter,
  deliveryTimeFilter,
  setDeliveryTimeFilter,
  onlineNowOnly,
  setOnlineNowOnly,
  gigViewMode,
  setGigViewMode,
  likedGigIds,
  handleToggleLike,
  navigate,
  getGigUrl,
  currentUser,
  setIsSignupModalOpen,
  slugify,
  CATEGORY_SLUGS,
  isHomePage = false
}) => {
  // Sort State
  const [sortBy, setSortBy] = useState<SortOption>('recommended');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Custom budget inputs
  const [customMin, setCustomMin] = useState('');
  const [customMax, setCustomMax] = useState('');

  // Per-gig carousel index state
  const [carouselIndices, setCarouselIndices] = useState<Record<string, number>>({});

  const handleNextSlide = (gigId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCarouselIndices(prev => ({
      ...prev,
      [gigId]: ((prev[gigId] || 0) + 1) % 3
    }));
  };

  const handlePrevSlide = (gigId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCarouselIndices(prev => ({
      ...prev,
      [gigId]: ((prev[gigId] || 0) - 1 + 3) % 3
    }));
  };

  // Filter & Sort Logic
  const sortedAndFilteredGigs = useMemo(() => {
    let list = [...filteredGigs];

    // Custom budget range if set
    if (budgetFilter.startsWith('custom:')) {
      const parts = budgetFilter.replace('custom:', '').split('-');
      const min = parseFloat(parts[0]) || 0;
      const max = parseFloat(parts[1]) || Infinity;
      list = list.filter(g => g.price >= min && g.price <= max);
    }

    // Sort order
    switch (sortBy) {
      case 'bestselling':
        list.sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
        break;
      case 'rating':
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'price_asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'newest':
        list.sort((a, b) => String(b.id).localeCompare(String(a.id)));
        break;
      case 'recommended':
      default:
        list.sort((a, b) => {
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          return (b.rating * (b.reviewsCount || 1)) - (a.rating * (a.reviewsCount || 1));
        });
        break;
    }

    return list;
  }, [filteredGigs, budgetFilter, sortBy]);

  const sortLabels: Record<SortOption, string> = {
    recommended: 'Recommended',
    bestselling: 'Best Selling',
    rating: 'Top Rated',
    price_asc: 'Price: Low to High',
    price_desc: 'Price: High to Low',
    newest: 'Newest Arrivals'
  };

  const handleApplyCustomBudget = () => {
    const min = parseFloat(customMin) || 0;
    const max = parseFloat(customMax) || 0;
    if (max > 0 && max >= min) {
      setBudgetFilter(`custom:${min}-${max}`);
    } else if (min > 0) {
      setBudgetFilter(`custom:${min}-999999`);
    } else {
      setBudgetFilter('All');
    }
    setActiveDropdown(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans text-slate-800">
      {isHomePage ? (
        /* ========================================================= */
        /* HOMEPAGE HERO BANNER WITH TRUST METRICS                   */
        /* ========================================================= */
        <div className="relative rounded-3xl bg-slate-900 dark:bg-slate-950 text-white p-8 md:p-12 mb-8 overflow-hidden shadow-2xl border border-slate-800">
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-emerald-950/60 pointer-events-none" />
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold mb-4 border border-emerald-500/20 backdrop-blur-md">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>100% Escrow Protection</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-300">Vetted Top 1% Freelancers</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight tracking-tight mb-4 text-white text-balance">
              {currentCategory === 'All' ? 'Hire top freelance talent with fixed-price escrow' : `${currentCategory} Freelance Gigs`}
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-8 max-w-2xl">
              Connect with vetted software engineers, UI/UX product designers, and AI specialists. Funds remain safely held in escrow until deliverables are accepted.
            </p>

            {/* Search Bar */}
            <div className="flex items-center bg-white dark:bg-slate-900 rounded-2xl p-2 shadow-2xl max-w-xl border border-slate-200 dark:border-slate-800">
              <Search className="w-5 h-5 text-slate-400 ml-3 shrink-0" />
              <input
                type="text"
                placeholder="Search services (e.g. React, UI/UX, AI Agents)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 focus:outline-none bg-transparent"
              />
              <button
                type="button"
                onClick={(e) => navigate('/gigs', e)}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 shadow-md active:scale-98"
              >
                Search
              </button>
            </div>
          </div>

          {/* 4-Column Trust & Performance Ticker */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-4 pt-8 mt-8 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="font-mono font-bold text-sm text-white tabular-nums">$14.2M+</div>
                <div className="text-slate-400 text-[11px]">Escrow Secured</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <div className="font-mono font-bold text-sm text-white tabular-nums">100%</div>
                <div className="text-slate-400 text-[11px]">Milestone Guaranteed</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="font-mono font-bold text-sm text-white tabular-nums">&lt; 2 Hours</div>
                <div className="text-slate-400 text-[11px]">Avg First Delivery</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Star className="w-4 h-4 fill-emerald-400" />
              </div>
              <div>
                <div className="font-mono font-bold text-sm text-white tabular-nums">4.96 / 5.0</div>
                <div className="text-slate-400 text-[11px]">Client Rating (12k+ Reviews)</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* EXPLORE GIGS HEADER: Breadcrumbs & Page Headline          */
        /* ========================================================= */
        <div className="mb-6">
          {/* Breadcrumb row */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">
            <a 
              href="/" 
              onClick={(e) => navigate('/', e)} 
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              WorkPerHour
            </a>
            <span aria-hidden="true">·</span>
            <span className="text-slate-700 dark:text-slate-300 capitalize">
              {currentCategory === 'All' ? 'Services' : currentCategory}
            </span>
          </div>

          {/* Category Title & Description */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {currentCategory === 'All' ? 'Explore Freelance Services' : `${currentCategory} Services`}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Find top-rated talent, review verified portfolios, and hire securely with WorkPerHour USD Escrow protection.
              </p>
            </div>

            {/* Quick Search Input */}
            <div className="relative w-full md:w-80 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search gigs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:border-slate-400 shadow-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SEGMENTED CATEGORY CONTROL STRIP                          */}
      {/* ========================================================= */}
      <div className="p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center gap-1 overflow-x-auto pb-1 mb-6 scrollbar-none border border-slate-200/60 dark:border-slate-800/80">
        {['All', 'Development & IT', 'AI & Data', 'Design & Creative', 'Mobile Apps'].map(catName => {
          const slug = CATEGORY_SLUGS[catName];
          const catUrl = slug === 'all' ? '/' : `/categories/${slug}`;
          const isActive = currentCategory === catName;
          return (
            <a
              key={catName}
              href={catUrl}
              onClick={(e) => navigate(catUrl, e)}
              className={`px-4 py-2 text-xs font-medium rounded-xl whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                isActive 
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-semibold' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {catName}
            </a>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* FIVERR FILTER TOOLBAR                                     */}
      {/* ========================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 mb-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Service Options Filter */}
            <div className="relative">
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'service' ? null : 'service')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  serviceOptionFilter !== 'All'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span>Service options {serviceOptionFilter !== 'All' ? `(${serviceOptionFilter})` : ''}</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeDropdown === 'service' ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              {activeDropdown === 'service' && (
                <div className="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-1">
                  {['All', 'Development & IT', 'AI & Data', 'Design & Creative', 'Mobile Apps'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => { setServiceOptionFilter(opt); setActiveDropdown(null); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                        serviceOptionFilter === opt ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{opt}</span>
                      {serviceOptionFilter === opt && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Seller Details Filter */}
            <div className="relative">
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'seller' ? null : 'seller')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  sellerLevelFilter !== 'All'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span>Seller details {sellerLevelFilter !== 'All' ? `(${sellerLevelFilter})` : ''}</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeDropdown === 'seller' ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              {activeDropdown === 'seller' && (
                <div className="absolute left-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-1">
                  {[
                    { label: 'All Sellers', value: 'All' },
                    { label: 'Top Rated Seller', value: 'Top Rated' },
                    { label: 'Level 2 Seller', value: 'Level 2' },
                    { label: 'Level 1 Seller', value: 'Level 1' },
                    { label: 'New Seller', value: 'New Seller' }
                  ].map(lvl => (
                    <button
                      key={lvl.value}
                      onClick={() => { setSellerLevelFilter(lvl.value); setActiveDropdown(null); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                        sellerLevelFilter === lvl.value ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{lvl.label}</span>
                      {sellerLevelFilter === lvl.value && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Budget Filter with Custom Range */}
            <div className="relative">
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'budget' ? null : 'budget')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  budgetFilter && budgetFilter !== 'All'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span>
                  Budget {budgetFilter && budgetFilter !== 'All' ? `(${budgetFilter.replace('custom:', '$')})` : ''}
                </span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeDropdown === 'budget' ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              {activeDropdown === 'budget' && (
                <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-2.5">
                  <div className="space-y-1">
                    {[
                      { label: 'Any Budget', value: 'All' },
                      { label: 'Value (Under $50)', value: 'under25' },
                      { label: 'Mid-range ($50 - $100)', value: '50to100' },
                      { label: 'High-end ($100+)', value: 'over100' },
                    ].map(b => (
                      <button
                        key={b.value}
                        onClick={() => { setBudgetFilter(b.value); setActiveDropdown(null); }}
                        className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                          budgetFilter === b.value ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{b.label}</span>
                        {budgetFilter === b.value && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                      </button>
                    ))}
                  </div>

                  {/* Custom Min / Max USD */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[11px] font-bold text-slate-700 mb-1.5">Custom Budget ($ USD)</div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                        <input
                          type="number"
                          placeholder="Min"
                          value={customMin}
                          onChange={e => setCustomMin(e.target.value)}
                          className="w-full pl-5 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden"
                        />
                      </div>
                      <span className="text-slate-400 text-xs">-</span>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                        <input
                          type="number"
                          placeholder="Max"
                          value={customMax}
                          onChange={e => setCustomMax(e.target.value)}
                          className="w-full pl-5 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyCustomBudget}
                      className="mt-2 w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Time Filter */}
            <div className="relative">
              <button 
                onClick={() => setActiveDropdown(activeDropdown === 'delivery' ? null : 'delivery')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  deliveryTimeFilter !== null
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span>Delivery time {deliveryTimeFilter !== null ? `(≤ ${deliveryTimeFilter}d)` : ''}</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeDropdown === 'delivery' ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              {activeDropdown === 'delivery' && (
                <div className="absolute left-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-1">
                  {[
                    { label: 'Any Delivery Time', value: null },
                    { label: 'Express 24H (1 day)', value: 1 },
                    { label: 'Up to 3 Days', value: 3 },
                    { label: 'Up to 7 Days', value: 7 },
                    { label: 'Up to 14 Days', value: 14 },
                  ].map(d => (
                    <button
                      key={String(d.value)}
                      onClick={() => { setDeliveryTimeFilter(d.value); setActiveDropdown(null); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                        deliveryTimeFilter === d.value ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{d.label}</span>
                      {deliveryTimeFilter === d.value && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Fiverr-style Toggles (Pro Services & Online Now) */}
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
            {/* Online Now Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div 
                onClick={() => setOnlineNowOnly(!onlineNowOnly)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                  onlineNowOnly ? 'bg-emerald-600' : 'bg-slate-200'
                }`}
              >
                <div 
                  className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                    onlineNowOnly ? 'left-4.5' : 'left-0.5'
                  }`}
                />
              </div>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span>Online now</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* FIVERR META BAR: Count, Sort Dropdown & View Mode Switch    */}
      {/* ========================================================= */}
      <div className="flex items-center justify-between gap-4 mb-5 text-xs">
        <div className="text-slate-500 font-medium">
          <strong className="text-slate-900 font-bold">{sortedAndFilteredGigs.length.toLocaleString()}</strong> services available
        </div>

        <div className="flex items-center gap-3">
          {/* Sort By Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900 font-semibold cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-100 transition"
            >
              <span className="text-slate-500 font-normal">Sort by:</span>
              <span>{sortLabels[sortBy]}</span>
              <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showSortDropdown ? '-rotate-90' : 'rotate-90'}`} />
            </button>

            {showSortDropdown && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-1.5 space-y-0.5">
                {(Object.keys(sortLabels) as SortOption[]).map(key => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSortBy(key);
                      setShowSortDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg font-medium transition-colors flex items-center justify-between cursor-pointer ${
                      sortBy === key ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{sortLabels[key]}</span>
                    {sortBy === key && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grid / Listicle Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <button
              type="button"
              onClick={() => setGigViewMode('grid')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                gigViewMode === 'grid' 
                  ? 'bg-white text-slate-900 shadow-2xs font-bold' 
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setGigViewMode('list')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                gigViewMode === 'list' 
                  ? 'bg-white text-slate-900 shadow-2xs font-bold' 
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* FIVERR GIG GRID VIEW                                       */}
      {/* ========================================================= */}
      {sortedAndFilteredGigs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-2xs space-y-4 my-8">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Briefcase className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Services Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Try adjusting your search query, budget parameters, or seller details to discover more freelance gigs.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setBudgetFilter('All');
                setSellerLevelFilter('All');
                setServiceOptionFilter('All');
                setDeliveryTimeFilter(null);
                setOnlineNowOnly(false);
              }}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : gigViewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedAndFilteredGigs.map(gig => {
            const currentSlide = carouselIndices[gig.id] || 0;
            const gigUrl = getGigUrl(gig);
            const sellerUrl = `/${slugify(gig.freelancerName)}`;
            const isLiked = likedGigIds.includes(gig.id);
            const isTopSeller = gig.freelancerLevel?.toLowerCase().includes('top') || gig.rating >= 4.9;

            return (
              <div 
                key={gig.id} 
                onClick={(e) => navigate(gigUrl, e)}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between group cursor-pointer relative"
              >
                {/* 16:10 Fiverr Aspect Ratio Image Container */}
                <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-800 select-none">
                  <GigImage 
                    src={gig.image} 
                    title={gig.title} 
                    category={gig.category}
                    className="w-full h-full group-hover:scale-105 transition-transform duration-300 object-cover" 
                  />

                  {/* Top-Left Fiverr Badge: Choice */}
                  {gig.featured && (
                    <div className="absolute top-2.5 left-2.5 z-10">
                      <span className="bg-emerald-600 text-white font-bold text-xs px-2 py-0.5 rounded-sm tracking-wide uppercase shadow-xs flex items-center gap-1">
                        <Sparkles className="w-3 h-3 fill-white" />
                        <span>Fiverr's Choice</span>
                      </span>
                    </div>
                  )}

                  {/* Top-Right Heart Wishlist Button */}
                  <button 
                    type="button"
                    onClick={(e) => handleToggleLike(gig.id, e)}
                    className={`absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                      isLiked 
                        ? 'bg-white text-red-500 fill-red-500 scale-105' 
                        : 'bg-white/80 hover:bg-white text-slate-700 hover:text-red-500 backdrop-blur-xs'
                    }`}
                    title={isLiked ? 'Remove from Saved' : 'Save to List'}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                  </button>

                  {/* Hover Left / Right Carousel Navigation Arrows */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      type="button"
                      onClick={(e) => handlePrevSlide(gig.id, e)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 hover:bg-white text-slate-800 shadow-md flex items-center justify-center transition cursor-pointer"
                      title="Previous"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleNextSlide(gig.id, e)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 hover:bg-white text-slate-800 shadow-md flex items-center justify-center transition cursor-pointer"
                      title="Next"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Carousel Indicator Dots */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
                    <span className={`w-1.5 h-1.5 rounded-full transition-all ${currentSlide === 0 ? 'bg-white scale-125' : 'bg-white/50'}`} />
                    <span className={`w-1.5 h-1.5 rounded-full transition-all ${currentSlide === 1 ? 'bg-white scale-125' : 'bg-white/50'}`} />
                    <span className={`w-1.5 h-1.5 rounded-full transition-all ${currentSlide === 2 ? 'bg-white scale-125' : 'bg-white/50'}`} />
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Seller Profile Header Row */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="relative">
                        <Avatar 
                          src={gig.freelancerAvatar} 
                          name={gig.freelancerName} 
                          size="xs"
                        />
                        {/* Green Online Dot */}
                        <span className="w-2 h-2 rounded-full bg-emerald-500 ring-1.5 ring-white dark:ring-slate-900 absolute -bottom-0.5 -right-0.5 inline-block" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <a 
                          href={sellerUrl}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(sellerUrl, e);
                          }}
                          className="text-xs font-bold text-slate-900 dark:text-slate-100 hover:underline block truncate"
                        >
                          {gig.freelancerName}
                        </a>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block truncate">
                          {gig.freelancerLevel || 'Level 2 Seller'}
                        </span>
                      </div>
                    </div>

                    {/* Gig Title: Exactly "I will ..." */}
                    <h3 className="text-sm sm:text-base leading-snug font-normal text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2 min-h-[44px] mb-2.5">
                      <a
                        href={gigUrl}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(gigUrl, e);
                        }}
                        className="text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors block"
                      >
                        {formatFiverrTitle(gig.title)}
                      </a>
                    </h3>

                    {/* Rating & Review Count */}
                    <div className="flex items-center gap-1 text-xs mb-3">
                      <Star className="w-3.5 h-3.5 fill-slate-900 dark:fill-amber-400 text-slate-900 dark:text-amber-400 shrink-0" />
                      <span className="font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                        {(gig.rating || 5.0).toFixed(1)}
                      </span>
                      <span className="text-slate-400 font-normal">
                        ({formatFiverrReviewCount(gig.reviewsCount || 1)})
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Delivery Badge & Pricing */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{gig.deliveryDays || 3}d delivery</span>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">From</span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums">${gig.price}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ========================================================= */
        /* FIVERR LISTICLE VIEW                                      */
        /* ========================================================= */
        <div className="space-y-4">
          {sortedAndFilteredGigs.map(gig => {
            const gigUrl = getGigUrl(gig);
            const sellerUrl = `/${slugify(gig.freelancerName)}`;
            const isLiked = likedGigIds.includes(gig.id);

            return (
              <div 
                key={gig.id} 
                onClick={(e) => navigate(gigUrl, e)}
                className="bg-white rounded-xl border border-slate-200/90 p-4 hover:shadow-md transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-5 group cursor-pointer overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto flex-1 min-w-0">
                  <div className="relative w-full sm:w-48 aspect-[16/10] rounded-lg overflow-hidden bg-slate-100 shrink-0">
                    <GigImage 
                      src={gig.image} 
                      title={gig.title} 
                      category={gig.category}
                      className="w-full h-full group-hover:scale-105 transition-transform duration-300 object-cover" 
                    />
                    <button 
                      type="button"
                      onClick={(e) => handleToggleLike(gig.id, e)}
                      className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                        isLiked 
                          ? 'bg-white text-red-500 fill-red-500' 
                          : 'bg-black/30 text-white hover:bg-white hover:text-red-500'
                      }`}
                      title={isLiked ? 'Remove from Saved' : 'Save to List'}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                    </button>
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0 w-full">
                    {/* Seller row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Avatar 
                        src={gig.freelancerAvatar} 
                        name={gig.freelancerName} 
                        size="xs"
                      />
                      <a 
                        href={sellerUrl}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(sellerUrl, e);
                        }}
                        className="text-xs font-bold text-slate-800 hover:underline truncate"
                      >
                        {gig.freelancerName}
                      </a>
                      <span className="text-[11px] text-slate-400">
                        • {gig.freelancerLevel || 'Top Rated'}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors line-clamp-2 sm:line-clamp-1">
                      <a
                        href={gigUrl}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(gigUrl, e);
                        }}
                        className="text-slate-900 hover:text-emerald-600 transition-colors block"
                      >
                        {formatFiverrTitle(gig.title)}
                      </a>
                    </h3>

                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      <div className="flex items-center gap-1 font-bold text-slate-900">
                        <Star className="w-3.5 h-3.5 fill-slate-900 text-slate-900" />
                        <span>{(gig.rating || 5.0).toFixed(1)}</span>
                        <span className="text-slate-400 font-normal">({formatFiverrReviewCount(gig.reviewsCount || 1)})</span>
                      </div>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500 text-[11px] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {gig.deliveryDays || 3} days delivery
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:flex-col md:items-end w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 gap-3 shrink-0">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-medium">Starting at</span>
                    <span className="text-xl font-bold text-slate-900 font-mono tabular-nums">${gig.price}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(gigUrl, e);
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* Featured Projects Section                                 */}
      {/* ========================================================= */}
      {projects && projects.length > 0 && (
        <div className="mt-16 pt-12 border-t border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Active Buyer Projects & Bidding Opportunities
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Explore open client requests with funded escrow budgets. Submit proposals, bid on custom work, and collaborate securely.
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => navigate('/projects', e)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
            >
              <span>View All Projects ({projects.length})</span>
              <ChevronRight className="w-4 h-4 text-emerald-400" />
            </button>
          </div>

          {/* Listicle View of Projects */}
          <div className="space-y-4">
            {projects.slice(0, 8).map((project) => {
              const projectUrl = `/projects/${project.id}`;
              return (
                <div
                  key={project.id}
                  onClick={(e) => navigate(projectUrl, e)}
                  className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-500/50 hover:shadow-lg transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 group cursor-pointer"
                >
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <img 
                          src={project.buyerAvatar || DEFAULT_AVATAR} 
                          alt={project.buyerName} 
                          className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-slate-200" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                          }}
                        />
                        <span className="font-bold text-slate-900 text-xs">{project.buyerName}</span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {project.countryFlag} {project.location || 'Client'}
                        </span>
                      </div>

                      <span className="text-slate-300">•</span>

                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 uppercase tracking-wider">
                        {project.category}
                      </span>

                      {project.isUrgent && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-100 text-orange-800">
                          <Flame className="w-3 h-3 text-orange-500" /> Urgent
                        </span>
                      )}

                      {project.featured && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                          <Sparkles className="w-3 h-3 text-amber-500" /> Featured
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-base text-slate-900 group-hover:text-emerald-600 transition-colors line-clamp-1 leading-snug">
                      <a 
                        href={projectUrl} 
                        onClick={(e) => { e.stopPropagation(); navigate(projectUrl, e); }}
                        className="text-slate-900 hover:text-emerald-600 transition-colors block"
                      >
                        {project.title}
                      </a>
                    </h3>

                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {project.skills && project.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {project.skills.slice(0, 4).map((skill, idx) => (
                            <span key={idx} className="text-[10px] font-medium bg-slate-50 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200/60">
                              {skill}
                            </span>
                          ))}
                          {project.skills.length > 4 && (
                            <span className="text-[10px] text-slate-400 font-medium">+{project.skills.length - 4} more</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium ml-auto md:ml-0 pt-1 md:pt-0">
                        <span className="flex items-center gap-1">
                          <Send className="w-3 h-3 text-slate-400" />
                          <strong className="text-slate-700 font-bold">{project.proposalsCount || 0}</strong> proposals
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Est. {project.deadlineDays || 7} days
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col items-center md:items-end justify-between w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 gap-3 shrink-0">
                    <div className="text-left md:text-right">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">
                        {project.projectType === 'hourly' ? 'Hourly Budget' : 'Fixed Budget'}
                      </span>
                      <span className="text-lg font-black text-emerald-600 font-mono">
                        ${project.budgetMin} - ${project.budgetMax}
                        {project.projectType === 'hourly' && <span className="text-xs font-normal text-slate-500">/hr</span>}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(projectUrl, e);
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all shadow-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Submit Proposal</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
