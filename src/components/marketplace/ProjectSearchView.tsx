import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  Briefcase, 
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
  Star, 
  ShieldCheck, 
  Sparkles, 
  Zap, 
  Flame, 
  Send, 
  PlusCircle, 
  X, 
  SlidersHorizontal,
  Bookmark,
  Share2,
  ExternalLink,
  Building2,
  Tag,
  CheckCircle2,
  Eye,
  TrendingUp,
  FileText
} from 'lucide-react';
import { Project, UserAccount } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';

interface ProjectSearchViewProps {
  projects: Project[];
  navigate: (path: string, e?: React.MouseEvent) => void;
  currentUser?: UserAccount | null;
  query?: string;
}

const CATEGORIES = [
  'All Categories',
  'Technology & Programming',
  'Design & Creative',
  'Digital Marketing',
  'Writing & Translation',
  'Video & Animation',
  'AI & Data',
  'Business'
];

const EXPERIENCE_LEVELS = [
  { id: 'all', label: 'All Levels' },
  { id: 'entry', label: 'Entry Level ($)' },
  { id: 'intermediate', label: 'Intermediate ($$)' },
  { id: 'expert', label: 'Expert ($$$)' }
];

const LOCATIONS = [
  'All Locations',
  'United States',
  'United Kingdom',
  'Canada',
  'Germany',
  'Australia',
  'Switzerland',
  'Worldwide'
];

export const ProjectSearchView: React.FC<ProjectSearchViewProps> = ({
  projects,
  navigate,
  currentUser,
  query
}) => {
  // Read URL query parameters
  const getInitialParams = () => {
    const searchParams = new URLSearchParams(query || (typeof window !== 'undefined' ? window.location.search : ''));
    return {
      q: searchParams.get('q') || searchParams.get('query') || searchParams.get('search') || '',
      category: searchParams.get('category') || 'All Categories',
      projectType: searchParams.get('type') || 'all',
      minBudget: searchParams.get('minBudget') ? Number(searchParams.get('minBudget')) : 0,
      maxBudget: searchParams.get('maxBudget') ? Number(searchParams.get('maxBudget')) : 10000,
      experienceLevel: searchParams.get('exp') || 'all',
      location: searchParams.get('location') || 'All Locations',
      urgentOnly: searchParams.get('urgent') === 'true',
      featuredOnly: searchParams.get('featured') === 'true',
      verifiedOnly: searchParams.get('verified') === 'true',
      sort: searchParams.get('sort') || 'newest',
      viewMode: (searchParams.get('view') as 'list' | 'grid') || 'list'
    };
  };

  const initialValues = getInitialParams();

  // State
  const [searchQuery, setSearchQuery] = useState(initialValues.q);
  const [selectedCategory, setSelectedCategory] = useState(initialValues.category);
  const [projectType, setProjectType] = useState<string>(initialValues.projectType);
  const [minBudget, setMinBudget] = useState<number>(initialValues.minBudget);
  const [maxBudget, setMaxBudget] = useState<number>(initialValues.maxBudget);
  const [experienceLevel, setExperienceLevel] = useState<string>(initialValues.experienceLevel);
  const [selectedLocation, setSelectedLocation] = useState<string>(initialValues.location);
  const [urgentOnly, setUrgentOnly] = useState<boolean>(initialValues.urgentOnly);
  const [featuredOnly, setFeaturedOnly] = useState<boolean>(initialValues.featuredOnly);
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(initialValues.verifiedOnly);
  const [sortBy, setSortBy] = useState<string>(initialValues.sort);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(initialValues.viewMode);
  
  // UI states
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [savedProjectIds, setSavedProjectIds] = useState<string[]>([]);
  
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wph_saved_projects');
      if (saved) setSavedProjectIds(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
  }, []);
  
  // Quick Preview Modal
  const [previewProject, setPreviewProject] = useState<Project | null>(null);

  // Sync state to URL without reloading page
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (selectedCategory !== 'All Categories') params.set('category', selectedCategory);
    if (projectType !== 'all') params.set('type', projectType);
    if (minBudget > 0) params.set('minBudget', minBudget.toString());
    if (maxBudget < 10000) params.set('maxBudget', maxBudget.toString());
    if (experienceLevel !== 'all') params.set('exp', experienceLevel);
    if (selectedLocation !== 'All Locations') params.set('location', selectedLocation);
    if (urgentOnly) params.set('urgent', 'true');
    if (featuredOnly) params.set('featured', 'true');
    if (verifiedOnly) params.set('verified', 'true');
    if (sortBy !== 'newest') params.set('sort', sortBy);
    if (viewMode !== 'list') params.set('view', viewMode);

    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  }, [
    searchQuery,
    selectedCategory,
    projectType,
    minBudget,
    maxBudget,
    experienceLevel,
    selectedLocation,
    urgentOnly,
    featuredOnly,
    verifiedOnly,
    sortBy,
    viewMode
  ]);

  // Toggle Save Project
  const handleToggleSaveProject = (projectId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSavedProjectIds(prev => {
      const isSaved = prev.includes(projectId);
      const updated = isSaved ? prev.filter(id => id !== projectId) : [...prev, projectId];
      try {
        localStorage.setItem('wph_saved_projects', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All Categories');
    setProjectType('all');
    setMinBudget(0);
    setMaxBudget(10000);
    setExperienceLevel('all');
    setSelectedLocation('All Locations');
    setUrgentOnly(false);
    setFeaturedOnly(false);
    setVerifiedOnly(false);
    setSortBy('newest');
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (selectedCategory !== 'All Categories') count++;
    if (projectType !== 'all') count++;
    if (minBudget > 0 || maxBudget < 10000) count++;
    if (experienceLevel !== 'all') count++;
    if (selectedLocation !== 'All Locations') count++;
    if (urgentOnly) count++;
    if (featuredOnly) count++;
    if (verifiedOnly) count++;
    return count;
  }, [
    searchQuery,
    selectedCategory,
    projectType,
    minBudget,
    maxBudget,
    experienceLevel,
    selectedLocation,
    urgentOnly,
    featuredOnly,
    verifiedOnly
  ]);

  // Filter and Sort Logic
  const filteredProjects = useMemo(() => {
    return projects.filter(proj => {
      // Status check (only open / published)
      if (proj.status !== 'open' && proj.status !== 'published') return false;

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = proj.title.toLowerCase().includes(query);
        const matchesDesc = proj.description.toLowerCase().includes(query);
        const matchesBuyer = proj.buyerName.toLowerCase().includes(query);
        const matchesCategory = proj.category.toLowerCase().includes(query);
        const matchesSubcategory = proj.subcategory?.toLowerCase().includes(query) || false;
        const matchesSkills = proj.skills?.some(s => s.toLowerCase().includes(query)) || false;

        if (!matchesTitle && !matchesDesc && !matchesBuyer && !matchesCategory && !matchesSubcategory && !matchesSkills) {
          return false;
        }
      }

      // Category
      if (selectedCategory !== 'All Categories') {
        if (!proj.category || proj.category.toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
      }

      // Project Type
      if (projectType !== 'all') {
        if (projectType === 'fixed' && proj.projectType === 'hourly') return false;
        if (projectType === 'hourly' && proj.projectType === 'fixed') return false;
      }

      // Budget Range
      if (proj.budgetMax < minBudget) return false;
      if (proj.budgetMin > maxBudget && maxBudget < 10000) return false;

      // Experience Level
      if (experienceLevel !== 'all') {
        if (!proj.experienceLevel || proj.experienceLevel !== experienceLevel) return false;
      }

      // Location
      if (selectedLocation !== 'All Locations') {
        if (!proj.location) return false;
        const locQuery = selectedLocation.toLowerCase();
        const matchesLoc = proj.location.toLowerCase().includes(locQuery) ||
                           (selectedLocation === 'Worldwide' && (proj.location.toLowerCase().includes('remote') || proj.location.toLowerCase().includes('worldwide')));
        if (!matchesLoc) return false;
      }

      // Flags
      if (urgentOnly && !proj.isUrgent) return false;
      if (featuredOnly && !proj.featured) return false;
      if (verifiedOnly && !proj.verifiedBuyer) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') {
        return (b.id || '').localeCompare(a.id || '');
      }
      if (sortBy === 'budget_high') {
        return b.budgetMax - a.budgetMax;
      }
      if (sortBy === 'budget_low') {
        return a.budgetMin - b.budgetMin;
      }
      if (sortBy === 'proposals_fewest') {
        return a.proposalsCount - b.proposalsCount;
      }
      if (sortBy === 'proposals_most') {
        return b.proposalsCount - a.proposalsCount;
      }
      return 0;
    });
  }, [
    projects,
    searchQuery,
    selectedCategory,
    projectType,
    minBudget,
    maxBudget,
    experienceLevel,
    selectedLocation,
    urgentOnly,
    featuredOnly,
    verifiedOnly,
    sortBy
  ]);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 font-sans">
      {/* 1. HERO HEADER BANNER */}
      <div className="bg-slate-900 text-white border-b border-slate-800 relative overflow-hidden py-10 md:py-14 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-emerald-950/60 opacity-90 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider shadow-xs">
                <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                <span>Client Project Requests</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Freelance Jobs & Buyer Requests
              </h1>
              <p className="text-sm sm:text-base text-slate-300 font-normal leading-relaxed">
                Explore funded client requests, filter by budget and category, and submit winning custom proposals with escrow protection.
              </p>
            </div>

            {/* Post Project CTA Button */}
            <div className="shrink-0">
              <a
                href="/post-project"
                onClick={(e) => navigate('/post-project', e)}
                className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-slate-950" />
                <span>Post a Project Request</span>
              </a>
            </div>
          </div>

          {/* MAIN SEARCH BAR */}
          <div className="bg-white rounded-2xl p-2.5 shadow-2xl flex flex-col sm:flex-row items-center gap-2 border border-slate-200/80">
            <div className="relative flex-1 w-full flex items-center">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects by keyword, skills (e.g. React, Figma, Copywriting)..."
                className="w-full pl-12 pr-10 py-3 text-slate-900 text-sm font-medium placeholder-slate-400 focus:outline-none bg-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category Select Inside Search Bar */}
            <div className="w-full sm:w-56 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full py-3 px-3 text-slate-700 text-sm font-medium bg-transparent focus:outline-none cursor-pointer"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat} className="text-slate-900">
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {}}
              className="w-full sm:w-auto px-7 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
            </button>
          </div>

          {/* Quick Filter Tag Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pt-5 pb-1 no-scrollbar text-xs">
            <span className="text-slate-400 font-semibold shrink-0 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Popular:
            </span>
            {['React', 'Figma', 'WordPress', 'Python', 'Copywriting', 'Logo Design', 'Google Ads', 'Machine Learning'].map(skill => (
              <button
                key={skill}
                onClick={() => setSearchQuery(skill)}
                className={`shrink-0 px-3 py-1 rounded-full border transition-all cursor-pointer ${
                  searchQuery.toLowerCase() === skill.toLowerCase()
                    ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. MAIN CONTENT SECTION */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* DESKTOP SIDEBAR FILTERS */}
          <aside className="hidden lg:block w-72 shrink-0 space-y-6 sticky top-24">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-6">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
                  <Filter className="w-4 h-4 text-emerald-600" />
                  <span>Filter Projects</span>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleResetFilters}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                  >
                    Reset ({activeFilterCount})
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Category
                </label>
                <div className="space-y-1">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-emerald-50 text-emerald-800 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span>{cat}</span>
                      {selectedCategory === cat && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Type Filter */}
              <div className="space-y-2.5 pt-4 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Project Type
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'fixed', label: 'Fixed' },
                    { id: 'hourly', label: 'Hourly' }
                  ].map(type => (
                    <button
                      key={type.id}
                      onClick={() => setProjectType(type.id)}
                      className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        projectType === type.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget Filter */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Budget Range ($)
                  </label>
                  <span className="text-xs font-bold text-emerald-600">
                    ${minBudget} - {maxBudget >= 10000 ? '$10k+' : `$${maxBudget}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium block mb-1">Min ($)</span>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={minBudget}
                      onChange={(e) => setMinBudget(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-medium block mb-1">Max ($)</span>
                    <input
                      type="number"
                      min={50}
                      step={100}
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { label: '< $500', min: 0, max: 500 },
                    { label: '$500 - $1.5k', min: 500, max: 1500 },
                    { label: '$1.5k - $5k', min: 1500, max: 5000 },
                    { label: '$5k+', min: 5000, max: 10000 }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => { setMinBudget(preset.min); setMaxBudget(preset.max); }}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience Level Filter */}
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Experience Level
                </label>
                <div className="space-y-1">
                  {EXPERIENCE_LEVELS.map(exp => (
                    <label
                      key={exp.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="experienceLevel"
                        checked={experienceLevel === exp.id}
                        onChange={() => setExperienceLevel(exp.id)}
                        className="accent-emerald-600"
                      />
                      <span>{exp.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Location Filter */}
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Client Location
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer text-slate-800"
                >
                  {LOCATIONS.map(loc => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Special Badges Toggles */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Preferences
                </label>
                
                {/* Urgent Only */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-orange-50/50 hover:bg-orange-50 border border-orange-200/60 cursor-pointer transition-colors">
                  <span className="flex items-center gap-2 text-xs font-bold text-orange-900">
                    <Flame className="w-4 h-4 text-orange-500" /> Urgent Projects Only
                  </span>
                  <input
                    type="checkbox"
                    checked={urgentOnly}
                    onChange={(e) => setUrgentOnly(e.target.checked)}
                    className="accent-orange-500 w-4 h-4 rounded"
                  />
                </label>

                {/* Featured Only */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-amber-50/50 hover:bg-amber-50 border border-amber-200/60 cursor-pointer transition-colors">
                  <span className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <Sparkles className="w-4 h-4 text-amber-500" /> Featured Only
                  </span>
                  <input
                    type="checkbox"
                    checked={featuredOnly}
                    onChange={(e) => setFeaturedOnly(e.target.checked)}
                    className="accent-amber-500 w-4 h-4 rounded"
                  />
                </label>

                {/* Verified Buyers Only */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-200/60 cursor-pointer transition-colors">
                  <span className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Verified Buyers Only
                  </span>
                  <input
                    type="checkbox"
                    checked={verifiedOnly}
                    onChange={(e) => setVerifiedOnly(e.target.checked)}
                    className="accent-emerald-600 w-4 h-4 rounded"
                  />
                </label>
              </div>

            </div>
          </aside>

          {/* RIGHT COLUMN: LISTINGS & TOOLBAR */}
          <main className="flex-1 w-full space-y-5">
            
            {/* TOOLBAR: RESULTS COUNT, VIEW MODE, SORT */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>{filteredProjects.length} Projects Found</span>
                  {selectedCategory !== 'All Categories' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                      {selectedCategory}
                    </span>
                  )}
                </div>

                {/* Mobile Filter Toggle Button */}
                <button
                  onClick={() => setIsMobileFilterOpen(true)}
                  className="lg:hidden px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filter {activeFilterCount > 0 && `(${activeFilterCount})`}</span>
                </button>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {/* View Switcher */}
                <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="Grid View"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium hidden sm:inline">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer text-slate-800"
                  >
                    <option value="newest">Newest First</option>
                    <option value="budget_high">Highest Budget</option>
                    <option value="budget_low">Lowest Budget</option>
                    <option value="proposals_fewest">Fewest Proposals</option>
                    <option value="proposals_most">Most Proposals</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ACTIVE FILTERS REMOVABLE CHIPS */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 py-1">
                <span className="text-xs font-bold text-slate-400">Active Filters:</span>
                {searchQuery && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200 text-slate-800 text-xs font-medium">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery('')} className="hover:text-slate-950"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {selectedCategory !== 'All Categories' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
                    {selectedCategory}
                    <button onClick={() => setSelectedCategory('All Categories')} className="hover:text-emerald-950"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {projectType !== 'all' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 text-teal-800 text-xs font-medium capitalize">
                    Type: {projectType}
                    <button onClick={() => setProjectType('all')} className="hover:text-teal-950"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {(minBudget > 0 || maxBudget < 10000) && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                    ${minBudget} - ${maxBudget}
                    <button onClick={() => { setMinBudget(0); setMaxBudget(10000); }} className="hover:text-blue-950"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {urgentOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-medium">
                    🔥 Urgent Only
                    <button onClick={() => setUrgentOnly(false)} className="hover:text-orange-950"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {featuredOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                    ⭐ Featured
                    <button onClick={() => setFeaturedOnly(false)} className="hover:text-amber-950"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {verifiedOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
                    🛡️ Verified Buyer
                    <button onClick={() => setVerifiedOnly(false)} className="hover:text-emerald-950"><X className="w-3 h-3" /></button>
                  </span>
                )}
                <button
                  onClick={handleResetFilters}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer ml-1"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* PROJECT LIST / GRID RESULTS */}
            {filteredProjects.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center space-y-4 shadow-xs">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                  <Search className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">No projects match your search criteria</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Try adjusting your keywords, expanding budget filters, or clearing selected categories to view more open project requests.
                </p>
                <button
                  onClick={handleResetFilters}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Clear All Filters
                </button>
              </div>
            ) : viewMode === 'list' ? (
              /* LIST VIEW */
              <div className="space-y-4">
                {filteredProjects.map(proj => {
                  const isSaved = savedProjectIds.includes(proj.id);
                  return (
                    <div
                      key={proj.id}
                      className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 hover:border-emerald-500/50 hover:shadow-lg transition-all relative group"
                    >
                      {/* Top Row: Buyer Avatar, Title, Budget */}
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-3">
                        <div className="flex items-start gap-3.5 flex-1">
                          <img
                            src={proj.buyerAvatar || DEFAULT_AVATAR}
                            alt={proj.buyerName}
                            className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0 mt-0.5"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                            }}
                          />
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                {proj.buyerName}
                                {proj.countryFlag && <span className="text-xs ml-0.5">{proj.countryFlag}</span>}
                              </span>
                              {proj.verifiedBuyer && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Verified</span>
                                </span>
                              )}
                              {proj.buyerRating ? (
                                <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  <span className="font-bold text-slate-800">{proj.buyerRating.toFixed(1)}</span>
                                  {proj.buyerSpent !== undefined ? <span>• ${proj.buyerSpent.toLocaleString()} spent</span> : null}
                                  <span className="mx-1">•</span>
                                  {proj.hireRate !== null && proj.hireRate !== undefined ? (
                                    <span className="text-emerald-600 font-bold">{Math.round(proj.hireRate * 100)}% Hire Rate</span>
                                  ) : (
                                    <span className="text-slate-400">Not enough history</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500 font-medium">New buyer</span>
                              )}
                              <span className="text-[11px] text-slate-400 font-medium">• {proj.createdAt}</span>
                            </div>

                            {/* Project Title */}
                            <a
                              href={`/projects/${proj.id}`}
                              onClick={(e) => navigate(`/projects/${proj.id}`, e)}
                              className="text-base sm:text-lg font-bold text-slate-900 hover:text-emerald-600 transition-colors line-clamp-1 block"
                            >
                              {proj.title}
                            </a>
                          </div>
                        </div>

                        {/* Budget Badge & Bookmark Button */}
                        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                          <div className="text-left md:text-right">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">
                              {proj.projectType === 'hourly' ? 'Hourly Rate' : 'Fixed Budget'}
                            </span>
                            <span className="text-base sm:text-lg font-black text-emerald-600">
                              ${proj.budgetMin} - ${proj.budgetMax}
                              {proj.projectType === 'hourly' && <span className="text-xs font-normal text-slate-500">/hr</span>}
                            </span>
                          </div>

                          <button
                            onClick={(e) => handleToggleSaveProject(proj.id, e)}
                            className={`p-2 rounded-xl border transition-all cursor-pointer ${
                              isSaved
                                ? 'bg-rose-50 border-rose-200 text-rose-500'
                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                            title={isSaved ? 'Saved Project' : 'Save Project'}
                          >
                            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-rose-500' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Description Preview */}
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4 line-clamp-2">
                        {proj.description}
                      </p>

                      {/* Skills Chips */}
                      {proj.skills && proj.skills.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-4">
                          {proj.skills.map(skill => (
                            <button
                              key={skill}
                              onClick={() => setSearchQuery(skill)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              {skill}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Footer Row: Category, Badges, Proposals, Actions */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 border-t border-slate-100 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">
                            {proj.category}
                          </span>

                          {proj.isUrgent && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 font-bold text-[10px]">
                              <Flame className="w-3 h-3 text-orange-500" /> Urgent
                            </span>
                          )}

                          {proj.featured && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                              <Sparkles className="w-3 h-3 text-amber-500" /> Featured
                            </span>
                          )}

                          <span className="text-slate-400 font-medium">
                            • <strong className="text-slate-700 font-bold">{proj.proposalsCount}</strong> proposals
                          </span>

                          <span className="text-slate-400 font-medium hidden sm:inline">
                            • Est. {proj.deadlineDays} days
                          </span>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setPreviewProject(proj)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer bg-slate-50"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>Quick View</span>
                          </button>

                          <a
                            href={`/projects/${proj.id}`}
                            onClick={(e) => navigate(`/projects/${proj.id}`, e)}
                            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-xs flex items-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Submit Proposal</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* GRID VIEW */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredProjects.map(proj => {
                  const isSaved = savedProjectIds.includes(proj.id);
                  return (
                    <div
                      key={proj.id}
                      className="bg-white rounded-2xl border border-slate-200/90 p-5 hover:border-emerald-500/50 hover:shadow-lg transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        {/* Header: Buyer Info & Save */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={proj.buyerAvatar || DEFAULT_AVATAR}
                              alt={proj.buyerName}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                              }}
                            />
                            <div>
                              <span className="text-xs font-bold text-slate-800 block line-clamp-1">
                                {proj.buyerName} {proj.countryFlag}
                              </span>
                              <span className="text-[10px] text-slate-400 block">{proj.createdAt}</span>
                            </div>
                          </div>

                          <button
                            onClick={(e) => handleToggleSaveProject(proj.id, e)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              isSaved
                                ? 'bg-rose-50 border-rose-200 text-rose-500'
                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700'
                            }`}
                          >
                            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-rose-500' : ''}`} />
                          </button>
                        </div>

                        {/* Title */}
                        <a
                          href={`/projects/${proj.id}`}
                          onClick={(e) => navigate(`/projects/${proj.id}`, e)}
                          className="text-base font-bold text-slate-900 hover:text-emerald-600 transition-colors line-clamp-2 block"
                        >
                          {proj.title}
                        </a>

                        {/* Description */}
                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                          {proj.description}
                        </p>

                        {/* Skills */}
                        {proj.skills && proj.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {proj.skills.slice(0, 4).map(skill => (
                              <span key={skill} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                                {skill}
                              </span>
                            ))}
                            {proj.skills.length > 4 && (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-400 text-[10px] font-medium">
                                +{proj.skills.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                            {proj.category}
                          </span>
                          <span className="text-sm font-black text-emerald-600">
                            ${proj.budgetMin} - ${proj.budgetMax}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPreviewProject(proj)}
                            className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer text-center"
                          >
                            Preview
                          </button>
                          <a
                            href={`/projects/${proj.id}`}
                            onClick={(e) => navigate(`/projects/${proj.id}`, e)}
                            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors text-center shadow-xs"
                          >
                            Apply Now
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

        </div>
      </div>

      {/* 3. QUICK PREVIEW MODAL */}
      {previewProject && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setPreviewProject(null)}
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-start gap-4">
              <img
                src={previewProject.buyerAvatar || DEFAULT_AVATAR}
                alt={previewProject.buyerName}
                className="w-14 h-14 rounded-full object-cover border-2 border-slate-100 shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                }}
              />
              <div className="space-y-1 pr-8">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{previewProject.buyerName}</span>
                  {previewProject.countryFlag && <span>{previewProject.countryFlag}</span>}
                  {previewProject.verifiedBuyer && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      Verified Buyer
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-slate-900 leading-snug">
                  {previewProject.title}
                </h2>
                <div className="text-xs text-slate-400 flex items-center gap-3">
                  <span>Posted {previewProject.createdAt}</span>
                  <span>•</span>
                  <span>{previewProject.proposalsCount} proposals</span>
                  <span>•</span>
                  <span>{previewProject.category}</span>
                  <span>•</span>
                  {previewProject.hireRate !== null && previewProject.hireRate !== undefined ? (
                    <span className="text-emerald-600 font-bold">{Math.round(previewProject.hireRate * 100)}% Hire Rate</span>
                  ) : (
                    <span>Not enough history</span>
                  )}
                </div>
              </div>
            </div>

            {/* Budget & Key Metrics */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="text-center border-r border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Est. Budget</span>
                <span className="text-base font-extrabold text-emerald-600">
                  ${previewProject.budgetMin} - ${previewProject.budgetMax}
                </span>
              </div>
              <div className="text-center border-r border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Type</span>
                <span className="text-sm font-bold text-slate-800 capitalize">
                  {previewProject.projectType || 'Fixed Price'}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Deadline</span>
                <span className="text-sm font-bold text-slate-800">
                  {previewProject.deadlineDays} Days
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Project Overview</h4>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {previewProject.description}
              </p>
            </div>

            {/* Skills */}
            {previewProject.skills && previewProject.skills.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Required Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {previewProject.skills.map(s => (
                    <span key={s} className="px-3 py-1 rounded-xl bg-slate-100 text-slate-800 text-xs font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setPreviewProject(null)}
                className="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors"
              >
                Close
              </button>
              <a
                href={`/projects/${previewProject.id}`}
                onClick={(e) => {
                  setPreviewProject(null);
                  navigate(`/projects/${previewProject.id}`, e);
                }}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-md flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Submit Custom Proposal</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 4. MOBILE DRAWER SLIDE-OVER FILTERS */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end lg:hidden">
          <div className="w-full max-w-xs bg-white h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-900 text-lg">Filter Projects</h3>
                <button
                  onClick={() => setIsMobileFilterOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Budget */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Budget Min/Max ($)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={minBudget}
                    onChange={(e) => setMinBudget(Number(e.target.value))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    placeholder="Min"
                  />
                  <input
                    type="number"
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(Number(e.target.value))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    placeholder="Max"
                  />
                </div>
              </div>

              {/* Badges */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} className="accent-orange-500" />
                  Urgent Only
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={featuredOnly} onChange={(e) => setFeaturedOnly(e.target.checked)} className="accent-amber-500" />
                  Featured Only
                </label>
              </div>
            </div>

            <button
              onClick={() => setIsMobileFilterOpen(false)}
              className="w-full py-3 bg-emerald-600 text-white font-bold text-xs rounded-xl"
            >
              Show Results
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
