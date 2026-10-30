import React, { useEffect, useRef, useState } from 'react';
import {
  Bell, Briefcase, ChevronDown, FileText, Heart, HelpCircle, LayoutDashboard,
  LogOut, Mail, Menu, Pencil, PlusCircle, Search, Settings, Sparkles, User, Users, Wallet,
  Volume2, VolumeX, X
} from 'lucide-react';
import { PPH_CATEGORIES } from '../components/HeaderCategoriesNav';
import { slugify } from '../utils/slugify';
import type { Order, UserAccount } from '../types';
import { clearAuthToken, getAuthToken } from '../utils/authToken';
import { DEFAULT_AVATAR, getUserInitialsAvatar } from '../constants';

export interface HeaderProps {
  navigate: (to: string, e?: React.MouseEvent) => void;
  currentUser: UserAccount | null;
  orders: Order[];
  likedGigIds: string[];
  /** Route flags used to highlight / scope the category dropdown. */
  isGigsList: boolean;
  isGigDetail: boolean;
  isProjectsList: boolean;
  isProjectDetail: boolean;
  isCategoryRoute: boolean;
  loadUserSession: () => Promise<boolean>;
  updateCurrentUser: (u: UserAccount | null | ((prev: UserAccount | null) => UserAccount | null)) => void;
  setImpersonatedUser: (u: UserAccount | null) => void;
  setSelectedOrder: (o: Order | null) => void;
  setPath: (p: string) => void;
  fetchMessages: (orderId: string) => void | Promise<void>;
  onOpenLogin?: () => void;
  onOpenSignup?: () => void;
  onOpenSwitchUser?: () => void;
}

/** Site header: brand, primary nav, category/search/workstream dropdowns and the user menu. */
export function Header({
  navigate, currentUser, orders, likedGigIds,
  isGigsList, isGigDetail, isProjectsList, isProjectDetail, isCategoryRoute,
  loadUserSession, updateCurrentUser, setImpersonatedUser, setSelectedOrder, setPath, fetchMessages,
  onOpenLogin, onOpenSignup, onOpenSwitchUser
}: HeaderProps) {
  // Dropdown state is local to the header (moved out of App).
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isWorkstreamsDropdownOpen, setIsWorkstreamsDropdownOpen] = useState(false);
  const [isHeaderSearchDropdownOpen, setIsHeaderSearchDropdownOpen] = useState(false);
  const [isHeaderCategoriesDropdownOpen, setIsHeaderCategoriesDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleAvailableNow = () => {
    if (!currentUser) return;
    const updated = { ...currentUser, isAvailableNow: !currentUser.isAvailableNow };
    updateCurrentUser(updated);
  };

  // Close dropdowns on outside click
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsDropdownOpen, setIsNotificationsDropdownOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('worksphere_notif_sound');
      if (stored === 'false') {
        setSoundEnabled(false);
      }
    }
  }, []);

  const playNotificationSound = () => {
    try {
      const soundOn = typeof window !== 'undefined' ? localStorage.getItem('worksphere_notif_sound') !== 'false' : true;
      if (!soundOn) return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') { ctx.resume(); }
      const now = ctx.currentTime;

      const compressor = ctx.createDynamicsCompressor();
      compressor.connect(ctx.destination);

      const playBeep = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(1.0, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(compressor);
        osc.start(start);
        osc.stop(start + duration);
      };

      playBeep(880, now, 0.18);
      playBeep(1175, now + 0.20, 0.18);
      playBeep(880, now + 0.40, 0.22);
    } catch {}
  };

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (typeof window !== 'undefined') localStorage.setItem('worksphere_notif_sound', String(next));
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!currentUser?.id || !token || typeof window === 'undefined') {
      setNotifications([]);
      return;
    }
    const fetchNotifs = async () => {
      const currentToken = getAuthToken();
      if (!currentToken) return;
      try {
        const res = await fetch('/api/notifications', {
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(prev => {
            const prevUnread = prev.filter(n => !n.read).length;
            const newUnread = (data as any[]).filter(n => !n.read).length;
            if (newUnread > prevUnread && prev.length > 0) {
              playNotificationSound();
            }
            return data;
          });
        }
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string, link?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAuthToken() || ''}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
    if (link) {
      setIsNotificationsDropdownOpen(false);
      navigate(link);
    }
  };

  const markAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAuthToken() || ''}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };


  useEffect(() => {
    const handleOutsideClick = () => {
      if (isUserDropdownOpen) setIsUserDropdownOpen(false);
      if (isWorkstreamsDropdownOpen) setIsWorkstreamsDropdownOpen(false);
      if (isHeaderSearchDropdownOpen) setIsHeaderSearchDropdownOpen(false);
      if (isHeaderCategoriesDropdownOpen) setIsHeaderCategoriesDropdownOpen(false);
      if (isNotificationsDropdownOpen) setIsNotificationsDropdownOpen(false);
      if (isMobileMenuOpen) setIsMobileMenuOpen(false);
    };
    if (isUserDropdownOpen || isWorkstreamsDropdownOpen || isHeaderSearchDropdownOpen || isHeaderCategoriesDropdownOpen || isNotificationsDropdownOpen || isMobileMenuOpen) {
      document.addEventListener('click', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [isUserDropdownOpen, isWorkstreamsDropdownOpen, isHeaderSearchDropdownOpen, isHeaderCategoriesDropdownOpen, isNotificationsDropdownOpen, isMobileMenuOpen]);

  useEffect(() => {
    if (!currentUser) {
      setIsWorkstreamsDropdownOpen(false);
      setIsUserDropdownOpen(false);
    }
  }, [currentUser]);

  return (
    <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200/80 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between shadow-2xs w-full max-w-full">
      {/* Left Side: Brand & Nav Links */}
      <div className="flex items-center gap-3 sm:gap-8">
        {/* Mobile Hamburger Menu Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsMobileMenuOpen(!isMobileMenuOpen);
            setIsUserDropdownOpen(false);
            setIsWorkstreamsDropdownOpen(false);
            setIsHeaderSearchDropdownOpen(false);
            setIsHeaderCategoriesDropdownOpen(false);
            setIsNotificationsDropdownOpen(false);
          }}
          className="md:hidden p-2 text-slate-700 hover:text-emerald-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          aria-label="Toggle mobile menu"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-3">
          <a href="/" onClick={(e) => navigate('/', e)} className="flex items-center gap-2.5 text-left group shrink-0">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-extrabold text-base shadow-xs group-hover:bg-slate-800 transition-colors ring-1 ring-slate-800">
              W
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-slate-900 block leading-none">WorkPerHour</span>
              <span className="text-xs text-emerald-600 font-bold uppercase tracking-wider block mt-0.5">Escrow Marketplace</span>
            </div>
          </a>
        </div>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-slate-700">
          {/* CATEGORIES DROPDOWN LINK */}
          <div className="relative">
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setIsHeaderCategoriesDropdownOpen(!isHeaderCategoriesDropdownOpen);
              }}
              className={`transition-colors hover:text-emerald-700 py-1 inline-flex items-center gap-1 cursor-pointer font-medium ${isCategoryRoute ? 'text-emerald-600 font-bold border-b-2 border-emerald-600' : 'text-fiverr-dark'}`}
            >
              <span>Categories</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isHeaderCategoriesDropdownOpen ? 'rotate-180 text-emerald-600' : ''}`} />
            </button>

            {isHeaderCategoriesDropdownOpen && (
              <div 
                className="absolute left-0 top-full -mt-0.5 pt-2 w-[720px] max-w-[calc(100vw-2rem)] z-[120] animate-in fade-in duration-150"
              >
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-5 text-sm">
                  <div className="px-2 pb-3 mb-4 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      Browse All Categories
                    </span>
                      <a 
                      href="/gigs" 
                      onClick={(e) => { 
                        setIsHeaderCategoriesDropdownOpen(false); 
                        navigate('/gigs', e); 
                      }}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      Explore All Gigs →
                    </a>
                  </div>

                  <div className="grid grid-cols-2 gap-3 max-h-[440px] overflow-y-auto p-1">
                    {PPH_CATEGORIES.map((cat) => (
                      <div key={cat.slug} className="p-3.5 rounded-xl hover:bg-emerald-50/40 hover:border-emerald-200/80 transition-all border border-slate-100 group">
                        <a 
                          href={`/categories/${cat.slug}`}
                          onClick={(e) => { 
                            setIsHeaderCategoriesDropdownOpen(false); 
                            navigate(`/categories/${cat.slug}`, e); 
                          }}
                          className="font-semibold text-slate-900 group-hover:text-emerald-600 text-sm block mb-2 flex items-center justify-between"
                        >
                          <span>{cat.name}</span>
                          <span className="text-slate-300 group-hover:text-emerald-600 text-xs transition-colors">→</span>
                        </a>
                        <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-slate-500">
                          {cat.subcategories.slice(0, 5).map((sub) => (
                            <a
                              key={sub.slug}
                              href={`/categories/${sub.slug}`}
                              onClick={(e) => { 
                                setIsHeaderCategoriesDropdownOpen(false); 
                                navigate(`/categories/${sub.slug}`, e); 
                              }}
                              className="hover:text-emerald-600 hover:underline cursor-pointer"
                            >
                              {sub.name}
                            </a>
                          ))}
                          {cat.subcategories.length > 5 && (
                            <a
                              href={`/categories/${cat.slug}`}
                              onClick={(e) => { 
                                setIsHeaderCategoriesDropdownOpen(false); 
                                navigate(`/categories/${cat.slug}`, e); 
                              }}
                              className="text-emerald-600 font-bold hover:underline cursor-pointer"
                            >
                              +{cat.subcategories.length - 5} more
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <a 
            href="/gigs" 
            onClick={(e) => navigate('/gigs', e)}
            className={`transition-colors hover:text-fiverr-dark py-1 ${isGigsList || isGigDetail ? 'text-fiverr-dark font-semibold border-b-2 border-slate-900' : ''}`}
          >
            Explore Gigs
          </a>
          <a 
            href="/projects" 
            onClick={(e) => navigate('/projects', e)}
            className={`transition-colors hover:text-fiverr-dark py-1 ${isProjectsList || isProjectDetail ? 'text-fiverr-dark font-semibold border-b-2 border-slate-900' : ''}`}
          >
            Buyer Requests
          </a>
        </nav>
      </div>

      {/* Zone 3: Primary Actions & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* POST PROJECT BUTTON */}
        <a 
          href="/post-project"
          onClick={(e) => navigate('/post-project', e)}
          className="hidden sm:inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold !text-[12px] leading-[18px] uppercase tracking-wider rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          Post Project
        </a>

        {/* SEARCH DROPDOWN */}
        <div className="relative">
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsHeaderSearchDropdownOpen(!isHeaderSearchDropdownOpen);
              setIsWorkstreamsDropdownOpen(false);
              setIsUserDropdownOpen(false);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl !text-[12px] !leading-[18px] sm:text-sm font-bold text-fiverr-dark transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-fiverr-muted" />
            <span>Search</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isHeaderSearchDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 py-3.5 z-[100] text-sm" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 pb-2.5 mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                Buyers can
              </div>
              <div className="p-1 space-y-0.5">
                <button
                  onClick={() => {
                    setIsHeaderSearchDropdownOpen(false);
                    navigate('/gigs');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="font-bold text-fiverr-dark text-sm">Search offers</div>
                  <span className="text-xs text-fiverr-muted">to buy now</span>
                </button>
                <button
                  onClick={() => {
                    setIsHeaderSearchDropdownOpen(false);
                    navigate('/freelancers');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="font-bold text-fiverr-dark text-sm">Search freelancers</div>
                  <span className="text-xs text-fiverr-muted">to request a proposal</span>
                </button>
              </div>

              <div className="px-4 pt-3 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100 mt-1">
                Freelancers can
              </div>
              <div className="p-1">
                <button
                  onClick={() => {
                    setIsHeaderSearchDropdownOpen(false);
                    navigate('/projects');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="font-bold text-fiverr-dark text-sm">Search projects</div>
                  <span className="text-xs text-fiverr-muted">to quote on</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={(e) => navigate('/wishlist', e)} 
          className="p-2 text-fiverr-dark hover:text-fiverr-dark rounded-full hover:bg-slate-100 transition-colors relative cursor-pointer"
          title="Wishlist / Liked Gigs"
        >
          <Heart className="w-5 h-5 text-fiverr-dark" />
          {likedGigIds.length > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-[14px] font-sans font-bold flex items-center justify-center shadow-xs">
              {likedGigIds.length}
            </span>
          )}
        </button>
        
        <div className="relative">
          <button 
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              let hasUser = !!currentUser;
              if (!hasUser) {
                const ok = await loadUserSession();
                hasUser = ok;
              }
              if (!hasUser) {
                setIsWorkstreamsDropdownOpen(false);
                if (onOpenLogin) onOpenLogin();
                else navigate('/login', e);
                return;
              }
              setIsWorkstreamsDropdownOpen(!isWorkstreamsDropdownOpen);
              setIsUserDropdownOpen(false);
              setIsHeaderSearchDropdownOpen(false);
            }} 
            className="p-2 text-fiverr-dark hover:text-fiverr-dark rounded-full hover:bg-slate-100 transition-colors relative cursor-pointer"
            title="Workstreams & Messages"
          >
            <Mail className="w-5 h-5 text-fiverr-dark" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full"></span>
          </button>

          {currentUser && isWorkstreamsDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 py-3.5 z-[100] text-sm" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 pb-3 mb-2.5 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Workstreams</span>
                <span className="text-xs font-mono text-emerald-600 font-bold">{orders.length} Active</span>
              </div>

              {orders.length === 0 ? (
                <div className="p-6 text-center text-slate-400 space-y-2.5">
                  <Mail className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-700">No workstreams yet</p>
                  <p className="text-[11px] text-slate-500">Explore gigs, post a project, or switch demo user to open an escrow workstream.</p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      onClick={(e) => {
                        setIsWorkstreamsDropdownOpen(false);
                        navigate('/gigs', e);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                    >
                      Explore Gigs
                    </button>
                    <button
                      onClick={(e) => {
                        setIsWorkstreamsDropdownOpen(false);
                        if (onOpenSwitchUser) onOpenSwitchUser();
                        else navigate('/switch-user', e);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1"
                    >
                      <Users className="w-3 h-3" />
                      <span>Switch User</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {orders.slice(0, 5).map(ord => {
                    const activeUid = currentUser?.id;
                    const isBuyer = activeUid === ord.buyerId;
                    const partner = isBuyer ? (ord as any).seller : (ord as any).buyer;
                    const partnerName = partner?.name || (isBuyer ? ord.sellerUsername || 'Seller' : ord.buyerUsername || 'Buyer');
                    const partnerAvatar = partner?.avatar;
                    const previewText = (ord as any).lastMessage || ord.title;
                    const rawDate = (ord as any).lastMessageTime || ord.createdAt;
                    const parsedDate = rawDate ? new Date(rawDate) : null;
                    const formattedDate = parsedDate && !isNaN(parsedDate.getTime())
                      ? parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : (typeof rawDate === 'string' ? rawDate : '');
                    return (
                      <div 
                        key={ord.id}
                        onClick={(e) => {
                          setSelectedOrder(ord);
                          fetchMessages(ord.id);
                          setIsWorkstreamsDropdownOpen(false);
                          navigate('/workstream/' + ord.id, e);
                        }}
                        className="p-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3"
                      >
                        {partnerAvatar ? (
                          <img 
                            src={partnerAvatar || DEFAULT_AVATAR} 
                            alt={partnerName} 
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 shrink-0 mt-0.5" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                            {partnerName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="font-bold text-fiverr-dark truncate">{partnerName}</span>
                            <span className="text-xs text-slate-400 whitespace-nowrap font-mono">{formattedDate}</span>
                          </div>
                          <p className="text-xs text-fiverr-muted truncate">
                            {previewText}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-2 px-3 border-t border-slate-100 mt-2 text-center">
                <button 
                  onClick={(e) => {
                    setIsWorkstreamsDropdownOpen(false);
                    navigate('/messages', e);
                  }}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-fiverr-dark font-bold !text-[12px] !leading-[18px] uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                >
                  View All Workstreams
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsNotificationsDropdownOpen(!isNotificationsDropdownOpen);
              setIsUserDropdownOpen(false);
              setIsWorkstreamsDropdownOpen(false);
            }} 
            className="p-2 text-fiverr-dark hover:text-emerald-600 rounded-full hover:bg-slate-100 transition-colors relative cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-5 h-5 text-fiverr-dark" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-red-500 text-white font-bold text-xs rounded-full min-w-4 text-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotificationsDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/80 py-3 z-50 text-left animate-in fade-in-50 zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-fiverr-dark">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title={soundEnabled ? 'Mute notification sound' : 'Enable notification sound'}
                  >
                    {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                  </button>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No notifications yet. You're all caught up!
                  </div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      onClick={(e) => markAsRead(n.id, n.link, e)}
                      className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3 ${!n.read ? 'bg-emerald-50/40' : ''}`}
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.read ? 'bg-emerald-500' : 'bg-transparent'}`}></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-fiverr-dark truncate">{n.title}</p>
                        <p className="text-[11.5px] text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {(() => {
                            const d = n.createdAt ? new Date(n.createdAt) : null;
                            if (d && !isNaN(d.getTime())) {
                              return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${d.toLocaleDateString()}`;
                            }
                            return n.createdAt || '';
                          })()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {!currentUser ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button 
              type="button"
              onClick={(e) => { 
                if (onOpenSwitchUser) onOpenSwitchUser(); 
                else navigate('/switch-user', e); 
              }} 
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/80 rounded-xl cursor-pointer transition-colors shadow-2xs"
              title="Switch demo account (client, freelancer, admin)"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Switch User</span>
            </button>
            <button 
              type="button"
              onClick={(e) => { if (onOpenLogin) onOpenLogin(); else navigate('/login', e); }} 
              className="px-3 sm:px-4 py-2 text-[13.5px] font-semibold text-fiverr-dark hover:text-emerald-600 cursor-pointer transition-colors"
            >
              Login
            </button>
            <button 
              type="button"
              onClick={(e) => { if (onOpenSignup) onOpenSignup(); else navigate('/signup', e); }} 
              className="px-3 sm:px-4 py-2 text-[13.5px] font-semibold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 cursor-pointer shadow-xs transition-colors"
            >
              Sign Up
            </button>
          </div>
        ) : (
          <div className="relative pl-2 border-l border-slate-200 flex items-center gap-2">
            <button 
              type="button"
              onClick={(e) => { 
                if (onOpenSwitchUser) onOpenSwitchUser(); 
                else navigate('/switch-user', e); 
              }} 
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl cursor-pointer transition"
              title="Switch Demo User Account"
            >
              <Users className="w-3 h-3 text-indigo-600" />
              <span>Switch</span>
            </button>
            <button 
              type="button"
              onClick={(e) => {
                  e.stopPropagation();
                  setIsUserDropdownOpen(!isUserDropdownOpen);
              }}
              className="relative flex items-center gap-1.5 cursor-pointer p-1 rounded-xl hover:bg-slate-100 transition-colors border-none bg-transparent"
            >
              <div className="relative">
                <img 
                  src={currentUser.avatar || getUserInitialsAvatar(currentUser.name)} 
                  alt={currentUser.name} 
                  className="w-8 h-8 rounded-full object-cover border border-slate-200" 
                  onError={(e) => {
                    const img = e.currentTarget;
                    const fallback = getUserInitialsAvatar(currentUser.name);
                    if (img.src !== fallback) {
                      img.src = fallback;
                    }
                  }}
                />
                {currentUser.isAvailableNow && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full animate-pulse" title="Available Now"></span>
                )}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-emerald-950 transition-transform ${isUserDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isUserDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-[100] text-sm" onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-2.5 border-b border-slate-100 mb-2 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-fiverr-dark block">{currentUser.name}</span>
                    <span className="text-xs text-slate-400 uppercase">{currentUser.role}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase ${currentUser.isAvailableNow ? 'text-emerald-700' : 'text-fiverr-muted'}`}>
                      {currentUser.isAvailableNow ? 'Available' : 'Unavailable'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleAvailableNow(); }}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        currentUser.isAvailableNow ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={currentUser.isAvailableNow}
                      title="Toggle availability status"
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          currentUser.isAvailableNow ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <button 
                  onClick={(e) => { setIsUserDropdownOpen(false); navigate('/create-gig', e); }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 text-emerald-600" />
                  <span>Post Gig</span>
                </button>



                <button 
                  onClick={(e) => { 
                    setIsUserDropdownOpen(false); 
                    if (onOpenSwitchUser) onOpenSwitchUser();
                    else navigate('/switch-user', e); 
                  }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50/70 text-indigo-950 font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Switch User Account</span>
                </button>

                <button 
                  onClick={(e) => { setIsUserDropdownOpen(false); navigate('/orders', e); }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                  <span>Dashboard</span>
                </button>

                <div className="w-full px-3 py-1.5 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center justify-between transition group">
                  <button 
                    onClick={(e) => { 
                      setIsUserDropdownOpen(false); 
                      const pUrl = `/${slugify(currentUser.name)}`;
                      navigate(pUrl, e); 
                    }} 
                    className="flex items-center gap-2.5 flex-1 text-left cursor-pointer py-0.5"
                  >
                    <User className="w-4 h-4 text-emerald-600" />
                    <span>Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsUserDropdownOpen(false);
                      navigate('/edit-profile', e);
                    }}
                    className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 hover:border-emerald-400 text-[11px] font-bold rounded-md flex items-center gap-1 cursor-pointer transition shadow-2xs"
                    title="Edit Profile"
                  >
                    <Pencil className="w-3 h-3 text-emerald-600" />
                    <span>Edit</span>
                  </button>
                </div>

                <button 
                  onClick={(e) => { setIsUserDropdownOpen(false); navigate('/buyer-activity', e); }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  <span>Buyer Activity</span>
                </button>

                <button 
                  onClick={(e) => { setIsUserDropdownOpen(false); navigate('/freelance-activity', e); }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Briefcase className="w-4 h-4 text-emerald-600" />
                  <span>Freelancer Activity</span>
                </button>


                <button 
                  onClick={(e) => { setIsUserDropdownOpen(false); navigate('/payments', e); }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  <span>Payments</span>
                </button>

                <button 
                  onClick={(e) => { 
                    setIsUserDropdownOpen(false); 
                    navigate('/settings', e);
                  }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-emerald-600" />
                  <span>Settings</span>
                </button>

                <button 
                  onClick={(e) => { setIsUserDropdownOpen(false); navigate('/support', e); }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-amber-600" />
                  <span>Customer Support</span>
                </button>

                <button 
                  onClick={(e) => { 
                    setIsUserDropdownOpen(false); 
                    navigate('/support', e);
                  }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-fiverr-dark font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-purple-600" />
                  <span>How it works</span>
                </button>

                <div className="my-1 border-t border-slate-100"></div>

                <button 
                  onClick={() => {
                    setIsUserDropdownOpen(false);
                    setImpersonatedUser(null);
                    updateCurrentUser(null);
                    clearAuthToken();
                    localStorage.removeItem('user');
                    localStorage.removeItem('current_user');
                    setPath('/gigs');
                    window.history.pushState({}, '', '/gigs');
                  }} 
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-50 text-red-600 font-semibold flex items-center gap-2.5 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PPH-style Mobile Dropdown Menu */}
      {isMobileMenuOpen && (
        <div 
          className="absolute left-0 top-full w-full bg-white border-b border-slate-200 shadow-2xl py-5 px-5 md:hidden z-[150] text-sm animate-in fade-in slide-in-from-top duration-150 max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-4">
            {/* Search Box / Quick Links */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">Marketplace</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={(e) => {
                    setIsMobileMenuOpen(false);
                    navigate('/gigs', e);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-900 font-bold text-xs transition-colors"
                >
                  Explore Gigs
                </button>
                <button
                  onClick={(e) => {
                    setIsMobileMenuOpen(false);
                    navigate('/projects', e);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-900 font-bold text-xs transition-colors"
                >
                  Buyer Requests
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={(e) => {
                    setIsMobileMenuOpen(false);
                    navigate('/freelancers', e);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-900 font-bold text-xs transition-colors"
                >
                  Find Freelancers
                </button>
                <button
                  onClick={(e) => {
                    setIsMobileMenuOpen(false);
                    navigate('/wishlist', e);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-900 font-bold text-xs transition-colors flex items-center justify-between"
                >
                  <span>Wishlist</span>
                  <span className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                    {likedGigIds.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Post Project Action */}
            <div className="pt-2">
              <button
                onClick={(e) => {
                  setIsMobileMenuOpen(false);
                  navigate('/post-project', e);
                }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-colors text-center cursor-pointer"
              >
                Post Project
              </button>
            </div>

            {/* Top Categories */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">Categories</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PPH_CATEGORIES.slice(0, 6).map((cat) => (
                  <button
                    key={cat.slug}
                    onClick={(e) => {
                      setIsMobileMenuOpen(false);
                      navigate(`/categories/${cat.slug}`, e);
                    }}
                    className="text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors truncate"
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* User / Auth Section */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              {currentUser ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                    <img
                      src={currentUser.avatar || getUserInitialsAvatar(currentUser.name)}
                      alt={currentUser.name}
                      className="w-9 h-9 rounded-full object-cover border border-slate-200"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-900 truncate">{currentUser.name}</p>
                      <p className="text-xs text-emerald-600 uppercase font-semibold">{currentUser.role}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={(e) => {
                        setIsMobileMenuOpen(false);
                        navigate('/orders', e);
                      }}
                      className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer text-center"
                    >
                      Dashboard
                    </button>
                    <button
                      onClick={(e) => {
                        setIsMobileMenuOpen(false);
                        navigate('/messages', e);
                      }}
                      className="py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl transition cursor-pointer text-center"
                    >
                      Workstreams ({orders.length})
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setImpersonatedUser(null);
                      updateCurrentUser(null);
                      clearAuthToken();
                      localStorage.removeItem('user');
                      localStorage.removeItem('current_user');
                      setPath('/gigs');
                      window.history.pushState({}, '', '/gigs');
                    }}
                    className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition text-center cursor-pointer"
                  >
                    Log Out
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={(e) => {
                      setIsMobileMenuOpen(false);
                      if (onOpenLogin) onOpenLogin();
                      else navigate('/login', e);
                    }}
                    className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition text-center cursor-pointer"
                  >
                    Login
                  </button>
                  <button
                    onClick={(e) => {
                      setIsMobileMenuOpen(false);
                      if (onOpenSignup) onOpenSignup();
                      else navigate('/signup', e);
                    }}
                    className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition text-center cursor-pointer"
                  >
                    Sign Up
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
