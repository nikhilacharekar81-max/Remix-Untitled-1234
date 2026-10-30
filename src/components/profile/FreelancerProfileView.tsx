import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, CheckCircle2, Star, MapPin, Clock, MessageSquare, 
  Briefcase, Check, ExternalLink, ChevronRight, Award, User, 
  Sparkles, Globe, Filter, Eye, Tag, Pencil, Settings
} from 'lucide-react';
import { UserAccount, Gig, Review } from '../../types';
import { Reviews } from '../gig_reviews';
import { DEFAULT_AVATAR, DEFAULT_GIG_IMAGE } from '../../constants';

interface FreelancerProfileViewProps {
  profileUser: UserAccount;
  currentUser: UserAccount | null;
  gigs: Gig[];
  reviews?: Review[];
  onNavigate: (to: string, e?: React.MouseEvent) => void;
  onFeatureGig?: (gigId: string) => void;
  onContact?: (freelancerId?: string) => void | Promise<void>;
  onEditProfile?: () => void;
}

export const FreelancerProfileView: React.FC<FreelancerProfileViewProps> = ({
  profileUser,
  currentUser,
  gigs,
  reviews = [],
  onNavigate,
  onFeatureGig,
  onContact,
  onEditProfile
}) => {
  const [activeTab, setActiveTab] = useState<'services' | 'portfolio' | 'reviews' | 'about'>('services');
  const [searchGigs, setSearchGigs] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isContacting, setIsContacting] = useState(false);

  const isOwner = currentUser?.id === profileUser.id;

  // Filter gigs for this freelancer
  const userGigs = useMemo(() => {
    return gigs.filter(g => g.freelancerId === profileUser.id);
  }, [gigs, profileUser.id]);

  const filteredGigs = useMemo(() => {
    return userGigs.filter(g => {
      const matchesSearch = g.title.toLowerCase().includes(searchGigs.toLowerCase()) ||
                            g.description.toLowerCase().includes(searchGigs.toLowerCase());
      const matchesCat = selectedCategory === 'all' || g.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [userGigs, searchGigs, selectedCategory]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    userGigs.forEach(g => {
      if (g.category) cats.add(g.category);
    });
    return Array.from(cats);
  }, [userGigs]);

  const userReviews = useMemo(() => {
    return reviews.filter(r => r.targetUserId === profileUser.id);
  }, [reviews, profileUser.id]);

  const averageRating = useMemo(() => {
    if (userReviews.length === 0) return profileUser.rating || 5.0;
    const sum = userReviews.reduce((acc, r) => acc + (r.rating || 5), 0);
    return Number((sum / userReviews.length).toFixed(1));
  }, [userReviews, profileUser.rating]);

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Profile Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50/50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            <div className="relative">
              <img
                src={profileUser.avatar || DEFAULT_AVATAR}
                alt={profileUser.name}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover ring-4 ring-slate-100 shadow-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                }}
              />
              {profileUser.isAvailableNow && (
                <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-500/20" title="Available for work now" />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {profileUser.name}
                </h1>
                {profileUser.verified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
                {profileUser.countryFlag && (
                  <span className="text-lg" title={profileUser.location}>{profileUser.countryFlag}</span>
                )}
              </div>

              <p className="text-sm font-semibold text-indigo-600">
                {profileUser.title}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs font-medium text-slate-500 pt-1">
                {profileUser.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> {profileUser.location}
                  </span>
                )}
                {profileUser.responseTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Responds in {profileUser.responseTime}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="font-bold text-slate-700">{averageRating}</span> ({userReviews.length || profileUser.reviewsCount || 0} reviews)
                </span>
                <span className="flex items-center gap-1 font-bold text-slate-700">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" /> {profileUser.completedJobs || 0} Jobs Done
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions & Rate */}
          <div className="flex flex-col sm:flex-row md:flex-col items-center sm:justify-end gap-3 self-center md:self-start w-full md:w-auto">
            <div className="text-center md:text-right bg-slate-50 border border-slate-100 rounded-2xl p-4 w-full sm:w-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Hourly Rate</span>
              <span className="text-2xl font-black text-slate-900">${profileUser.hourlyRate || 50}<span className="text-xs font-medium text-slate-400">/hr</span></span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {isOwner ? (
                <button
                  type="button"
                  onClick={onEditProfile}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Profile
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isContacting}
                  onClick={async () => {
                    if (onContact) {
                      try {
                        setIsContacting(true);
                        await onContact(profileUser.id);
                      } finally {
                        setIsContacting(false);
                      }
                    }
                  }}
                  className={`flex-1 sm:flex-initial px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-100 transition flex items-center justify-center gap-1.5 ${isContacting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> {isContacting ? 'Opening WorkStream...' : 'Contact Me'}
                </button>
              )}

              <button
                type="button"
                onClick={handleShare}
                className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition shadow-xs text-xs font-bold"
                title="Copy Profile Link"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <ExternalLink className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        {profileUser.bio && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">About Freelancer</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-4xl whitespace-pre-line">
              {profileUser.bio}
            </p>
          </div>
        )}

        {/* Skills Tag Cloud */}
        {profileUser.skills && profileUser.skills.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {profileUser.skills.map((skill, index) => (
              <span
                key={index}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'services'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Offered Services ({userGigs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'reviews'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Star className="w-4 h-4" />
          Client Reviews ({userReviews.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('about')}
          className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'about'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="w-4 h-4" />
          Credentials & Verifications
        </button>
      </div>

      {/* Tab 1: Services / Gigs */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-3">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search services..."
                value={searchGigs}
                onChange={(e) => setSearchGigs(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {categories.map((cat, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Gigs Grid */}
          {filteredGigs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No services found</p>
              <p className="text-xs text-slate-400">Try adjusting your search criteria or category filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGigs.map((gig) => (
                <div
                  key={gig.id}
                  onClick={(e) => onNavigate(`/gig/${gig.id}`, e)}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg hover:border-slate-300 transition duration-200 cursor-pointer flex flex-col group"
                >
                  <div className="aspect-video bg-slate-100 relative overflow-hidden">
                    <img
                      src={gig.image || DEFAULT_GIG_IMAGE}
                      alt={gig.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE;
                      }}
                    />
                    {gig.featured && (
                      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-amber-500 text-white text-[10px] font-black rounded-md tracking-wider uppercase shadow-xs">
                        Featured
                      </span>
                    )}
                    <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold rounded-md">
                      {gig.deliveryDays} Days Delivery
                    </span>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
                        {gig.category}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2 group-hover:text-indigo-600 transition">
                        {gig.title}
                      </h4>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 font-semibold text-slate-600">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        {gig.rating} <span className="text-slate-400 font-normal">({gig.reviewsCount})</span>
                      </span>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-medium">FROM</span>
                        <span className="text-sm font-black text-slate-900">${gig.price}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Reviews */}
      {activeTab === 'reviews' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          <Reviews
            allReviews={userReviews}
            targetUser={profileUser}
            currentUser={currentUser}
          />
        </div>
      )}

      {/* Tab 3: About & Verifications */}
      {activeTab === 'about' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Verifications List */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Identity & Security Verifications
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-700">Email Verification</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-700">Phone Verification</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-700">Government ID Verified</span>
                <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md ${
                  profileUser.verified 
                    ? 'text-emerald-700 bg-emerald-50' 
                    : 'text-amber-700 bg-amber-50'
                }`}>
                  {profileUser.verified ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                  {profileUser.verified ? 'Verified' : 'Pending Review'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-700">Member Since</span>
                <span className="font-bold text-slate-900">{profileUser.createdAt || '2026'}</span>
              </div>
            </div>
          </div>

          {/* Certifications & Languages */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" /> Languages & Certifications
            </h3>

            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-2">Languages</h4>
                <div className="flex flex-wrap gap-2">
                  {(profileUser.languages || ['English (Fluent)']).map((lang, idx) => (
                    <span key={idx} className="px-3 py-1 bg-slate-100 rounded-lg font-bold text-slate-700">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>

              {profileUser.certifications && profileUser.certifications.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-2">Verified Certifications</h4>
                  <ul className="space-y-1.5">
                    {profileUser.certifications.map((cert, idx) => (
                      <li key={idx} className="flex items-center gap-2 font-medium text-slate-700">
                        <Check className="w-3.5 h-3.5 text-indigo-600" /> {cert}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
