import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  Star, 
  ShieldCheck, 
  Clock, 
  DollarSign, 
  Filter, 
  Globe, 
  Check, 
  ArrowRight, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  Grid, 
  List, 
  Heart, 
  Sparkles, 
  Sliders, 
  X, 
  Briefcase, 
  Award,
  CheckCircle2,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { UserAccount, Gig } from '../../types';
import { PPH_CATEGORIES } from '../HeaderCategoriesNav';
import { getGigUrl } from '../../utils/slugify';
import { DEFAULT_AVATAR, DEFAULT_GIG_IMAGE } from '../../constants';

interface FreelancerSearchViewProps {
  usersList: UserAccount[];
  gigs: Gig[];
  navigate: (path: string, e?: React.MouseEvent) => void;
  currentUser: UserAccount | null;
  setIsSignupModalOpen: (b: boolean) => void;
  slugify: (name: string) => string;
  query?: string;
}

export const FreelancerSearchView: React.FC<FreelancerSearchViewProps> = ({
  usersList,
  gigs,
  navigate,
  currentUser,
  setIsSignupModalOpen,
  slugify,
  query
}) => {
  // Read initial query parameters from URL
  const getInitialParams = () => {
    try {
      const urlParams = new URLSearchParams(query || (typeof window !== 'undefined' ? window.location.search : ''));
      return {
        q: urlParams.get('q') || urlParams.get('search') || '',
        category: urlParams.get('category') || 'All',
        location: urlParams.get('location') || 'All',
        minRate: Number(urlParams.get('minRate')) || 0,
        maxRate: Number(urlParams.get('maxRate')) || 200,
        minRating: Number(urlParams.get('minRating')) || 0,
        availableNow: urlParams.get('available') === 'true',
        verifiedOnly: urlParams.get('verified') === 'true',
        hasOffers: urlParams.get('hasOffers') === 'true'
      };
    } catch (e) {
      return {
        q: '',
        category: 'All',
        location: 'All',
        minRate: 0,
        maxRate: 200,
        minRating: 0,
        availableNow: false,
        verifiedOnly: false,
        hasOffers: false
      };
    }
  };

  const initialParams = getInitialParams();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>(initialParams.q);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialParams.category);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('All');
  const [selectedLocation, setSelectedLocation] = useState<string>(initialParams.location);
  const [selectedSkill, setSelectedSkill] = useState<string>('All');
  const [minRate, setMinRate] = useState<number>(initialParams.minRate);
  const [maxRate, setMaxRate] = useState<number>(initialParams.maxRate);
  const [minRating, setMinRating] = useState<number>(initialParams.minRating);
  const [availableNowOnly, setAvailableNowOnly] = useState<boolean>(initialParams.availableNow);
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(initialParams.verifiedOnly);
  const [hasOffersOnly, setHasOffersOnly] = useState<boolean>(initialParams.hasOffers);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('All');

  // Sorting & Layout State
  const [sortBy, setSortBy] = useState<'relevance' | 'rating' | 'rate_low' | 'rate_high' | 'reviews' | 'jobs'>('relevance');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [savedUserIds, setSavedUserIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('saved_freelancer_ids');
      if (saved) setSavedUserIds(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Mobile Filter Drawer State
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  // Carousel scroll ref for Top Trending Offers
  const carouselRef = useRef<HTMLDivElement>(null);

  // Sync state with URL without full page reload
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (selectedCategory !== 'All') params.set('category', selectedCategory);
      if (selectedLocation !== 'All') params.set('location', selectedLocation);
      if (minRate > 0) params.set('minRate', minRate.toString());
      if (maxRate < 200) params.set('maxRate', maxRate.toString());
      if (minRating > 0) params.set('minRating', minRating.toString());
      if (availableNowOnly) params.set('available', 'true');
      if (verifiedOnly) params.set('verified', 'true');
      if (hasOffersOnly) params.set('hasOffers', 'true');

      const queryString = params.toString();
      const newUrl = queryString ? `/freelancers?${queryString}` : '/freelancers';
      window.history.replaceState(null, '', newUrl);
    } catch (e) {
      // Ignore if history state update is blocked
    }
  }, [
    searchQuery, 
    selectedCategory, 
    selectedLocation, 
    minRate, 
    maxRate, 
    minRating, 
    availableNowOnly, 
    verifiedOnly, 
    hasOffersOnly
  ]);

  // Wishlist toggle handler
  const toggleSaveUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedUserIds(prev => {
      const updated = prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId];
      localStorage.setItem('saved_freelancer_ids', JSON.stringify(updated));
      return updated;
    });
  };

  // Popular skills list extracted from all users
  const popularSkills = useMemo(() => {
    const skillsMap = new Map<string, number>();
    usersList.forEach(u => {
      if (u.skills) {
        u.skills.forEach(s => {
          skillsMap.set(s, (skillsMap.get(s) || 0) + 1);
        });
      }
    });
    return Array.from(skillsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([skill]) => skill)
      .slice(0, 10);
  }, [usersList]);

  // Top trending active offers across platform
  const topTrendingOffers = useMemo(() => {
    return gigs.filter(g => g.status === 'active').slice(0, 8);
  }, [gigs]);

  // Unique locations from users
  const locationsList = useMemo(() => {
    const locs = new Set<string>();
    usersList.forEach(u => {
      if (u.location) locs.add(u.location);
    });
    return ['All', 'Remote', 'United Kingdom', 'United States', 'Canada', 'Germany', 'India', 'Australia', 'Spain', ...Array.from(locs)];
  }, [usersList]);

  // Filter Freelancers
  const filteredFreelancers = useMemo(() => {
    return usersList.filter(u => {
      // Exclude admin accounts from search
      if (u.role === 'admin' || u.role === 'super_admin') return false;

      // Text search match (name, username, title, bio, skills)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = u.name.toLowerCase().includes(q);
        const usernameMatch = u.username ? u.username.toLowerCase().includes(q) : false;
        const titleMatch = u.title ? u.title.toLowerCase().includes(q) : false;
        const bioMatch = u.bio ? u.bio.toLowerCase().includes(q) : false;
        const skillMatch = u.skills ? u.skills.some(s => s.toLowerCase().includes(q)) : false;
        if (!nameMatch && !usernameMatch && !titleMatch && !bioMatch && !skillMatch) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'All') {
        if (!u.category) return false;
        if (!u.category.toLowerCase().includes(selectedCategory.toLowerCase()) && 
            !selectedCategory.toLowerCase().includes(u.category.toLowerCase())) {
          return false;
        }
      }

      // Subcategory filter
      if (selectedSubcategory !== 'All') {
        if (!u.subcategory || !u.subcategory.toLowerCase().includes(selectedSubcategory.toLowerCase())) {
          return false;
        }
      }

      // Location filter
      if (selectedLocation !== 'All') {
        if (selectedLocation === 'Remote') {
          const loc = (u.location || '').toLowerCase();
          const isRemoteUser = loc.includes('remote') || loc.includes('worldwide') || loc.includes('online') || Boolean((u as any).isRemote);
          if (!isRemoteUser) return false;
        } else {
          if (!u.location || !u.location.toLowerCase().includes(selectedLocation.toLowerCase())) {
            return false;
          }
        }
      }

      // Skill filter
      if (selectedSkill !== 'All') {
        if (!u.skills || !u.skills.includes(selectedSkill)) {
          return false;
        }
      }

      // Hourly Rate filter
      const rate = u.hourlyRate || 50;
      if (rate < minRate || rate > maxRate) return false;

      // Rating filter
      if (minRating > 0 && (u.rating || 0) < minRating) return false;

      // Available Now filter
      if (availableNowOnly && !u.isAvailableNow) return false;

      // Verified filter
      if (verifiedOnly && !u.verified) return false;

      // Language filter
      if (selectedLanguage !== 'All') {
        if (!u.languages || !u.languages.some(l => l.toLowerCase().includes(selectedLanguage.toLowerCase()))) {
          return false;
        }
      }

      // Has offers filter
      if (hasOffersOnly) {
        const userGigs = gigs.filter(g => g.freelancerId === u.id || g.freelancerName === u.name);
        if (userGigs.length === 0) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'rate_low') return (a.hourlyRate || 0) - (b.hourlyRate || 0);
      if (sortBy === 'rate_high') return (b.hourlyRate || 0) - (a.hourlyRate || 0);
      if (sortBy === 'reviews') return (b.reviewsCount || 0) - (a.reviewsCount || 0);
      if (sortBy === 'jobs') return (b.completedJobs || 0) - (a.completedJobs || 0);
      // Default relevance
      return (b.rating || 0) * (b.reviewsCount || 1) - (a.rating || 0) * (a.reviewsCount || 1);
    });
  }, [
    usersList, 
    gigs, 
    searchQuery, 
    selectedCategory, 
    selectedSubcategory, 
    selectedLocation, 
    selectedSkill, 
    minRate, 
    maxRate, 
    minRating, 
    availableNowOnly, 
    verifiedOnly, 
    hasOffersOnly, 
    selectedLanguage, 
    sortBy
  ]);

  // Paginated freelancers
  const paginatedFreelancers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredFreelancers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredFreelancers, currentPage]);

  const totalPages = Math.ceil(filteredFreelancers.length / itemsPerPage);

  // Clear all filters handler
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedSubcategory('All');
    setSelectedLocation('All');
    setSelectedSkill('All');
    setMinRate(0);
    setMaxRate(200);
    setMinRating(0);
    setAvailableNowOnly(false);
    setVerifiedOnly(false);
    setHasOffersOnly(false);
    setSelectedLanguage('All');
    setCurrentPage(1);
  };

  // Carousel scroll controls
  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = direction === 'left' ? -320 : 320;
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">
      {/* 1. HERO SEARCH HEADER BANNER */}
      <div className="bg-slate-900 text-white relative overflow-hidden shadow-xl border-b border-slate-800">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 opacity-90 pointer-events-none"></div>
        <div className="absolute right-0 top-0 w-1/2 h-full opacity-15 bg-cover bg-center pointer-events-none hidden md:block" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&h=800&fit=crop')` }}></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14 relative z-10">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-4 font-medium">
            <button onClick={() => navigate('/')} className="hover:text-emerald-400 transition-colors cursor-pointer">Home</button>
            <span>/</span>
            <span className="text-white font-semibold">Search Freelancers</span>
          </div>

          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Verified Top Freelancer Directory</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
              Search & Hire Expert Freelancers
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Find elite developers, designers, writers, and marketing specialists. Send direct proposals or start escrow workstreams with 100% money-back guarantee.
            </p>

            {/* MAIN SEARCH BAR */}
            <div className="pt-2">
              <div className="flex flex-col sm:flex-row items-stretch bg-white rounded-2xl p-2 shadow-2xl border border-slate-200/20 gap-2">
                <div className="flex-1 flex items-center px-3 py-2 bg-slate-50 sm:bg-transparent rounded-xl">
                  <Search className="w-5 h-5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search by skill, name, title, or service (e.g. React, Figma, SEO)..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full ml-3 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none bg-transparent"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Category Dropdown in Search Bar */}
                <div className="sm:w-56 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-2 flex items-center">
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setSelectedSubcategory('All');
                      setCurrentPage(1);
                    }}
                    className="w-full bg-transparent text-slate-800 text-xs font-bold py-2 px-2 focus:outline-none cursor-pointer"
                  >
                    <option value="All">All Categories</option>
                    {PPH_CATEGORIES.map(cat => (
                      <option key={cat.slug} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </button>
              </div>

              {/* Popular Skill Pills */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400 font-semibold">Popular Skills:</span>
                {popularSkills.map(skill => (
                  <button
                    key={skill}
                    onClick={() => {
                      setSelectedSkill(selectedSkill === skill ? 'All' : skill);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      selectedSkill === skill 
                        ? 'bg-emerald-500 text-white shadow-sm' 
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TOP TRENDING OFFERS CAROUSEL SHOWCASE */}
      {topTrendingOffers.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h2 className="text-base font-bold text-slate-900">Top Trending Offers by Verified Freelancers</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                  Featured Services
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => scrollCarousel('left')}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  title="Scroll Left"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => scrollCarousel('right')}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  title="Scroll Right"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Horizontal Scroll Grid */}
            <div 
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto pb-2 scrollbar-none scroll-smooth"
            >
              {topTrendingOffers.map(gig => (
                <div 
                  key={gig.id}
                  onClick={() => navigate(getGigUrl(gig))}
                  className="min-w-[260px] max-w-[280px] bg-slate-50 rounded-xl border border-slate-200 p-3 hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between shrink-0"
                >
                  <div className="space-y-2">
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-200">
                      <img 
                        src={gig.image || DEFAULT_GIG_IMAGE} 
                        alt={gig.title} 
                        className="w-full h-full object-cover" 
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE; }}
                      />
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/90 text-emerald-400 font-extrabold text-[11px] shadow-sm">
                        ${gig.price}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <img 
                        src={gig.freelancerAvatar || DEFAULT_AVATAR} 
                        alt={gig.freelancerName} 
                        className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-300" 
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                      />
                      <span className="text-xs font-bold text-slate-800 truncate">{gig.freelancerName}</span>
                    </div>

                    <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug hover:text-emerald-600 transition-colors">
                      {gig.title}
                    </h3>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1 font-bold text-amber-500">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{gig.rating}</span>
                      <span className="text-slate-400 font-normal">({gig.reviewsCount})</span>
                    </div>
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                      View Offer <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN FREELANCER DIRECTORY CONTAINER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* LEFT SIDEBAR FILTERS (Desktop) */}
          <aside className="w-full lg:w-72 shrink-0 space-y-6 hidden lg:block">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs sticky top-24 space-y-6">
              
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <span>Filter Freelancers</span>
                </div>
                {(selectedCategory !== 'All' || selectedLocation !== 'All' || minRate > 0 || maxRate < 200 || minRating > 0 || availableNowOnly || verifiedOnly || hasOffersOnly) && (
                  <button 
                    onClick={handleClearFilters}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                  >
                    Reset All
                  </button>
                )}
              </div>

              {/* Fast Status Toggles */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Freelancer Status</span>
                
                {/* Available Now Toggle */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-bold text-slate-800">Available Now</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={availableNowOnly}
                    onChange={(e) => {
                      setAvailableNowOnly(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                </label>

                {/* Certified / Verified Only */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">Certified Freelancers</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={verifiedOnly}
                    onChange={(e) => {
                      setVerifiedOnly(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                </label>

                {/* Has Active Offers */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-slate-800">Has Active Offers</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={hasOffersOnly}
                    onChange={(e) => {
                      setHasOffersOnly(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setSelectedSubcategory('All');
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  {PPH_CATEGORIES.map(cat => (
                    <option key={cat.slug} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Subcategory Filter (if category selected) */}
              {selectedCategory !== 'All' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Subcategory</label>
                  <select
                    value={selectedSubcategory}
                    onChange={(e) => {
                      setSelectedSubcategory(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                  >
                    <option value="All">All Subcategories</option>
                    {PPH_CATEGORIES.find(c => c.name === selectedCategory)?.subcategories.map(sub => (
                      <option key={sub.slug} value={sub.name}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Location Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Location / Country</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => {
                    setSelectedLocation(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                >
                  {locationsList.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* Hourly Rate Filter Range */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-400">Hourly Rate</span>
                  <span className="font-extrabold text-emerald-600">${minRate} - ${maxRate}+/hr</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={minRate}
                    onChange={(e) => {
                      setMinRate(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    placeholder="Min $"
                    className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-slate-400 text-xs">-</span>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={maxRate}
                    onChange={(e) => {
                      setMaxRate(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    placeholder="Max $"
                    className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Minimum Rating Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Minimum Rating</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 4.0, 4.5, 4.8].map(r => (
                    <button
                      key={r}
                      onClick={() => {
                        setMinRating(r);
                        setCurrentPage(1);
                      }}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        minRating === r 
                          ? 'bg-amber-500 text-white shadow-xs' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {r === 0 ? 'Any' : `${r}+ ⭐`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Languages Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => {
                    setSelectedLanguage(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Languages</option>
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="German">German</option>
                  <option value="French">French</option>
                  <option value="Mandarin">Mandarin</option>
                  <option value="Hindi">Hindi</option>
                </select>
              </div>

            </div>
          </aside>

          {/* MAIN RESULTS AREA */}
          <main className="flex-1 space-y-6">

            {/* TOP BAR: RESULTS STATS, SORTING & VIEW TOGGLE */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMobileFilterOpen(true)}
                  className="lg:hidden px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Filter className="w-4 h-4 text-emerald-600" />
                  <span>Filters</span>
                </button>

                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    {filteredFreelancers.length} Freelancers Found
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {selectedCategory !== 'All' ? `In ${selectedCategory}` : 'Across all skills & categories'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 ml-auto">
                {/* SORT BY DROPDOWN */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold hidden sm:inline">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="relevance">Best Match</option>
                    <option value="rating">Highest Rated</option>
                    <option value="reviews">Most Reviews</option>
                    <option value="jobs">Most Jobs Completed</option>
                    <option value="rate_low">Hourly Rate: Low to High</option>
                    <option value="rate_high">Hourly Rate: High to Low</option>
                  </select>
                </div>

                {/* VIEW MODE TOGGLE */}
                <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      viewMode === 'grid' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="Grid View"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      viewMode === 'list' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ACTIVE FILTER BADGES ROW */}
            {(searchQuery || selectedCategory !== 'All' || selectedLocation !== 'All' || selectedSkill !== 'All' || availableNowOnly || verifiedOnly || hasOffersOnly) && (
              <div className="flex flex-wrap items-center gap-2 bg-slate-100/80 p-3 rounded-2xl border border-slate-200/60">
                <span className="text-xs font-bold text-slate-500">Active Filters:</span>

                {searchQuery && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery('')} className="hover:text-red-500 cursor-pointer ml-1"><X className="w-3 h-3" /></button>
                  </span>
                )}

                {selectedCategory !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs">
                    Category: {selectedCategory}
                    <button onClick={() => setSelectedCategory('All')} className="hover:text-red-500 cursor-pointer ml-1"><X className="w-3 h-3" /></button>
                  </span>
                )}

                {selectedLocation !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs">
                    Location: {selectedLocation}
                    <button onClick={() => setSelectedLocation('All')} className="hover:text-red-500 cursor-pointer ml-1"><X className="w-3 h-3" /></button>
                  </span>
                )}

                {selectedSkill !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs">
                    Skill: {selectedSkill}
                    <button onClick={() => setSelectedSkill('All')} className="hover:text-red-500 cursor-pointer ml-1"><X className="w-3 h-3" /></button>
                  </span>
                )}

                {availableNowOnly && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs">
                    Available Now
                    <button onClick={() => setAvailableNowOnly(false)} className="hover:text-red-500 cursor-pointer ml-1"><X className="w-3 h-3" /></button>
                  </span>
                )}

                {verifiedOnly && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200 shadow-2xs">
                    Certified Only
                    <button onClick={() => setVerifiedOnly(false)} className="hover:text-red-500 cursor-pointer ml-1"><X className="w-3 h-3" /></button>
                  </span>
                )}

                <button
                  onClick={handleClearFilters}
                  className="text-xs font-bold text-red-600 hover:text-red-700 ml-auto cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* FREELANCER CARDS LIST / GRID */}
            {paginatedFreelancers.length > 0 ? (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6' : 'space-y-4'}>
                {paginatedFreelancers.map(user => {
                  const isSaved = savedUserIds.includes(user.id);
                  const userGigs = gigs.filter(g => g.freelancerId === user.id || g.freelancerName === user.name);

                  if (viewMode === 'grid') {
                    return (
                      <div 
                        key={user.id}
                        className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-emerald-500 hover:shadow-xl transition-all duration-200 flex flex-col justify-between space-y-4 relative group"
                      >
                        {/* Top Header Row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3.5">
                            <div className="relative shrink-0">
                              <img 
                                src={user.avatar || DEFAULT_AVATAR} 
                                alt={user.name} 
                                className="w-14 h-14 rounded-full object-cover ring-2 ring-slate-100 shadow-xs" 
                                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                              />
                              {user.isAvailableNow && (
                                <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" title="Available Now"></span>
                              )}
                            </div>

                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 
                                  onClick={() => navigate(`/${slugify(user.name)}`)}
                                  className="text-base font-extrabold text-slate-900 hover:text-emerald-600 transition-colors cursor-pointer"
                                >
                                  {user.name}
                                </h3>
                                {user.verified && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                    CERTIFIED
                                  </span>
                                )}
                              </div>

                              <span className="text-xs text-slate-500 block font-medium">
                                @{user.username || slugify(user.name)}
                              </span>

                              {/* Location */}
                              {user.location && (
                                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                                  <span>{user.countryFlag || '🌐'}</span>
                                  <span>{user.location}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Heart Bookmark Button */}
                          <button
                            onClick={(e) => toggleSaveUser(user.id, e)}
                            className={`p-2 rounded-xl transition-colors cursor-pointer ${
                              isSaved ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-slate-100'
                            }`}
                            title={isSaved ? 'Saved to Wishlist' : 'Save Freelancer'}
                          >
                            <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-500' : ''}`} />
                          </button>
                        </div>

                        {/* Title & Bio */}
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 line-clamp-1 mb-1">
                            {user.title || 'Verified Freelance Specialist'}
                          </h4>
                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {user.bio || 'Experienced freelancer providing high quality services with top client satisfaction rates.'}
                          </p>
                        </div>

                        {/* Rating, Response & Rate Stats Bar */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 font-bold text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span>{user.rating || 5.0}</span>
                            <span className="text-slate-400 font-normal">({user.reviewsCount || 0})</span>
                          </div>

                          <div className="text-slate-500 font-medium text-[11px]">
                            ⚡ {user.responseTime || '1 hr'} resp
                          </div>

                          <div className="font-extrabold text-slate-900 text-sm">
                            ${user.hourlyRate || 50}<span className="text-xs text-slate-500 font-normal">/hr</span>
                          </div>
                        </div>

                        {/* Skills Chips */}
                        <div className="flex flex-wrap gap-1">
                          {(user.skills || ['React', 'Node.js', 'UI/UX']).slice(0, 4).map((skill, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setSelectedSkill(skill);
                                setCurrentPage(1);
                              }}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 transition-colors cursor-pointer"
                            >
                              {skill}
                            </button>
                          ))}
                        </div>

                        {/* Featured Offers Preview Row (if any) */}
                        {userGigs.length > 0 && (
                          <div className="pt-2 border-t border-slate-100">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                              Popular Offer
                            </span>
                            <div 
                              onClick={() => navigate(getGigUrl(userGigs[0]))}
                              className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-100"
                            >
                              <img 
                                src={userGigs[0].image || DEFAULT_GIG_IMAGE} 
                                alt="" 
                                className="w-8 h-8 rounded object-cover shrink-0" 
                                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE; }}
                              />
                              <span className="text-[11px] font-bold text-slate-800 truncate flex-1">{userGigs[0].title}</span>
                              <span className="text-[11px] font-extrabold text-emerald-600 shrink-0">${userGigs[0].price}</span>
                            </div>
                          </div>
                        )}

                        {/* Actions Footers */}
                        <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/${slugify(user.name)}`)}
                            className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Request Proposal</span>
                          </button>
                          <button
                            onClick={() => navigate(`/${slugify(user.name)}`)}
                            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                          >
                            Profile
                          </button>
                        </div>
                      </div>
                    );
                  } else {
                    // LIST VIEW ROW
                    return (
                      <div 
                        key={user.id}
                        className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-emerald-500 hover:shadow-lg transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                      >
                        <div className="flex items-start gap-4 flex-1">
                          <div className="relative shrink-0">
                            <img 
                              src={user.avatar || DEFAULT_AVATAR} 
                              alt={user.name} 
                              className="w-16 h-16 rounded-full object-cover ring-2 ring-slate-100 shadow-xs" 
                              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                            />
                            {user.isAvailableNow && (
                              <span className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" title="Available Now"></span>
                            )}
                          </div>

                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 
                                onClick={() => navigate(`/${slugify(user.name)}`)}
                                className="text-base font-extrabold text-slate-900 hover:text-emerald-600 transition-colors cursor-pointer"
                              >
                                {user.name}
                              </h3>
                              {user.verified && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                  CERTIFIED
                                </span>
                              )}
                              <span className="text-xs text-slate-400 font-medium">@{user.username || slugify(user.name)}</span>
                            </div>

                            <p className="text-xs font-bold text-slate-800">{user.title}</p>

                            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed max-w-2xl">
                              {user.bio}
                            </p>

                            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                              <div className="flex items-center gap-1 font-bold text-amber-500">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                <span>{user.rating || 5.0}</span>
                                <span className="text-slate-400 font-normal">({user.reviewsCount || 0} reviews)</span>
                              </div>

                              {user.location && (
                                <span className="text-slate-500 font-medium flex items-center gap-1">
                                  <span>{user.countryFlag || '🌐'}</span> {user.location}
                                </span>
                              )}

                              <span className="text-slate-500 font-medium">
                                ⚡ {user.responseTime || '1 hour'} response time
                              </span>

                              {user.completedJobs ? (
                                <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px]">
                                  {user.completedJobs} Jobs Completed
                                </span>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {(user.skills || []).map((skill, idx) => (
                                <span key={idx} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* List view right column with price & action */}
                        <div className="flex md:flex-col items-center md:items-end justify-between w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0 gap-3">
                          <div className="text-left md:text-right">
                            <span className="text-xs text-slate-400 font-semibold block">Hourly Rate</span>
                            <span className="text-xl font-black text-slate-900">${user.hourlyRate || 50}/hr</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => toggleSaveUser(user.id, e)}
                              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                                isSaved ? 'bg-rose-50 border-rose-200 text-rose-500' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-rose-500'
                              }`}
                            >
                              <Heart className={`w-4 h-4 ${isSaved ? 'fill-rose-500' : ''}`} />
                            </button>

                            <button
                              onClick={() => navigate(`/${slugify(user.name)}`)}
                              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              <span>Request Proposal</span>
                              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            ) : (
              /* EMPTY STATE */
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <Search className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">No Freelancers Match Your Criteria</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto">
                  Try adjusting your search terms, broadening category filters, or turning off specific rate or location restrictions.
                </p>
                <button
                  onClick={handleClearFilters}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            )}

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-6">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      currentPage === page 
                        ? 'bg-slate-900 text-white shadow-xs' 
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}

          </main>
        </div>
      </div>

      {/* MOBILE SLIDE-OVER FILTERS DRAWER */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-[200] flex">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setIsMobileFilterOpen(false)}></div>
          <div className="relative ml-auto w-full max-w-xs bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6 z-10">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base">Filter Freelancers</h3>
              <button onClick={() => setIsMobileFilterOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Toggles */}
            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Available Now</span>
                <input
                  type="checkbox"
                  checked={availableNowOnly}
                  onChange={(e) => setAvailableNowOnly(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Certified Only</span>
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400">Category</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium"
              >
                <option value="All">All Categories</option>
                {PPH_CATEGORIES.map(c => <option key={c.slug} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            {/* Location */}
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400">Location</span>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium"
              >
                {locationsList.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <button
              onClick={() => setIsMobileFilterOpen(false)}
              className="w-full py-3 bg-emerald-600 text-white text-xs font-bold uppercase rounded-xl"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
