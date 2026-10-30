/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppData } from './hooks/useAppData';
import { useWorkstream } from './hooks/workstream/useWorkstream';
import { Header } from './layout/Header';
import { Footer } from './layout/Footer';
import { ImpersonationBanner } from './layout/ImpersonationBanner';
import { PPH_CATEGORIES } from './components/HeaderCategoriesNav';
import { MarketplaceGigsView } from './components/marketplace/MarketplaceGigsView';
import { FreelancerSearchView } from './components/marketplace/FreelancerSearchView';
import { ProjectSearchView } from './components/marketplace/ProjectSearchView';
import { ProjectDetailView } from './components/marketplace/ProjectDetailView';
import { BuyerActivityView } from './components/marketplace/BuyerActivityView';
import { FreelancerActivityView } from './components/marketplace/FreelancerActivityView';
import { GigDetailView } from './components/gigs/GigDetailView';
import { CreateGigView } from './components/gigs/CreateGigView';
import { FreelancerProfileView } from './components/profile/FreelancerProfileView';
import { EditProfilePage } from './components/profile/EditProfilePage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkstreamWorkspace } from './components/workstream/WorkstreamWorkspace';
import { WorkstreamList } from './components/workstream/WorkstreamList';
import { PaymentsModule } from './components/PaymentsModule';
import {
  LoginModal,
  SignupModal,
  UserSwitchModal,
  ForgotPasswordModal,
  VerifyModal,
  SupportModal,
  WishlistModal,
  EmailNotificationsModal
} from './components/modals';
import { slugify, getGigUrl } from './utils/slugify';
import { getAuthToken, setAuthToken, clearAuthToken, requestDemoSession } from './utils/authToken';
import { getDeviceId } from './utils/deviceId';
import { DEFAULT_GIG_IMAGE } from './constants';
import { RESERVED_ROUTES } from './shared/routes';
import type { UserAccount, Gig, Order, GigExtra } from './types';

export interface AppProps {
  initialPath?: string;
  initialData?: any;
}

const CATEGORY_SLUGS: Record<string, string> = {
  'All': 'all',
  'Development & IT': 'technology-programming',
  'AI & Data': 'ai-services',
  'Design & Creative': 'design',
  'Mobile Apps': 'technology-programming'
};

PPH_CATEGORIES.forEach(cat => {
  CATEGORY_SLUGS[cat.name] = cat.slug;
  cat.subcategories?.forEach(sub => {
    CATEGORY_SLUGS[sub.name] = sub.slug;
  });
});

export default function App({ initialPath = '/', initialData }: AppProps) {
  // Navigation / Route state
  const [currentPath, setCurrentPath] = useState<string>(initialPath);

  const navigate = useCallback((to: string, e?: React.MouseEvent) => {
    if (e && (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)) {
      return;
    }
    if (e) {
      e.preventDefault();
    }
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', to);
      window.scrollTo(0, 0);
    }
    setCurrentPath(to);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Application Data
  const appData = useAppData(initialData);
  const {
    users,
    setUsers,
    gigs,
    setGigs,
    projects,
    setProjects,
    proposals,
    setProposals,
    offers,
    setOffers,
    orders,
    setOrders,
    reviews,
    setReviews,
    messages,
    setMessages,
    disputes,
    setDisputes,
    refunds,
    setRefunds,
    payouts,
    setPayouts,
    categories,
    setCategories,
    supportTickets,
    setSupportTickets,
    auditLogs,
    setAuditLogs,
    userEmails,
    setUserEmails,
    fetchUserEmails,
    platformFee,
    clientServiceFee,
    smallOrderFeeThreshold,
    smallOrderFeeAmount,
    escrowProtectionDays,
    refresh
  } = appData;

  // Active / Impersonated User state (initialized identically on server and client to prevent hydration mismatch)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    if (initialData?.users && initialData.users.length > 0) {
      const elena = initialData.users.find((u: any) => u.id === 'u3' || u.name?.includes('Elena Rostova'));
      const defaultUser = elena || initialData.users[0];
      if (defaultUser) {
        return defaultUser;
      }
    }
    return null;
  });

  const [impersonatedUser, setImpersonatedUser] = useState<UserAccount | null>(null);
  const activeUser = impersonatedUser || currentUser;

  // Keep currentUser in sync with canonical users list
  useEffect(() => {
    if (currentUser?.id && users.length > 0) {
      const freshUser = users.find(u => u.id === currentUser.id);
      if (freshUser && JSON.stringify(freshUser) !== JSON.stringify(currentUser)) {
        setCurrentUser(freshUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem('current_user', JSON.stringify(freshUser));
        }
      }
    }
  }, [users, currentUser?.id]);

  const updateCurrentUser = useCallback(
    (u: UserAccount | null | ((prev: UserAccount | null) => UserAccount | null)) => {
      setCurrentUser(prev => {
        const next = typeof u === 'function' ? u(prev) : u;
        if (typeof window !== 'undefined') {
          if (next) {
            localStorage.setItem('current_user', JSON.stringify(next));
          } else {
            localStorage.removeItem('current_user');
          }
        }
        return next;
      });
    },
    []
  );

  const loadUserSession = useCallback(async (): Promise<boolean> => {
    const existingToken = getAuthToken();
    if (existingToken) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${existingToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            updateCurrentUser(data.user);
            return true;
          }
        }
      } catch {}
    }

    let storedUser: any = null;
    try {
      const storedRaw = typeof window !== 'undefined'
        ? localStorage.getItem('current_user')
        : null;
      storedUser = storedRaw ? JSON.parse(storedRaw) : null;
    } catch {}

    const targetUserId = storedUser?.id || 'u3';

    try {
      const demoSession = await requestDemoSession(targetUserId);
      if (demoSession?.token && demoSession?.user) {
        setAuthToken(demoSession.token);
        updateCurrentUser(demoSession.user);
        return true;
      }
    } catch {}
    return false;
  }, [updateCurrentUser]);

  // Initial client hydration fetch
  useEffect(() => {
    refresh();
    loadUserSession().then((loaded) => {
      if (loaded) {
        refresh();
      }
    });
  }, [loadUserSession, refresh]);

  // Liked Gigs state
  const [likedGigIds, setLikedGigIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('worksphere_liked_gigs');
        if (stored) setLikedGigIds(JSON.parse(stored));
      } catch {}
    }
  }, []);

  const handleToggleLike = useCallback((gigId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setLikedGigIds(prev => {
      const next = prev.includes(gigId) ? prev.filter(id => id !== gigId) : [...prev, gigId];
      if (typeof window !== 'undefined') {
        localStorage.setItem('worksphere_liked_gigs', JSON.stringify(next));
      }
      return next;
    });
  }, []);

  // Modal open states
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const [isUserSwitchModalOpen, setIsUserSwitchModalOpen] = useState(false);
  const [isForgotPasswordModalOpen, setIsForgotPasswordModalOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isWishlistModalOpen, setIsWishlistModalOpen] = useState(false);
  const [isEmailNotificationsModalOpen, setIsEmailNotificationsModalOpen] = useState(false);

  // Authentication form states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginRequiresCode, setLoginRequiresCode] = useState(false);
  const [loginVerificationMessage, setLoginVerificationMessage] = useState('');
  const [mockEmailCodeDisplay, setMockEmailCodeDisplay] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupMobile, setSignupMobile] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupError, setSignupError] = useState<string | null>(null);
  const [isSubmittingSignup, setIsSubmittingSignup] = useState(false);

  const [verificationMode, setVerificationMode] = useState<'email' | 'sms'>('email');
  const [emailCodeInput, setEmailCodeInput] = useState('');
  const [smsCodeInput, setSmsCodeInput] = useState('');
  const [verifyEmail, setVerifyEmail] = useState('');

  const [forgotStep, setForgotStep] = useState<'request' | 'verify' | 'reset'>('request');
  const [forgotQuery, setForgotQuery] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [mockForgotCodeDisplay, setMockForgotCodeDisplay] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');

  // Marketplace filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [serviceOptionFilter, setServiceOptionFilter] = useState('All');
  const [sellerLevelFilter, setSellerLevelFilter] = useState('All');
  const [budgetFilter, setBudgetFilter] = useState('All');
  const [deliveryTimeFilter, setDeliveryTimeFilter] = useState<number | null>(null);
  const [onlineNowOnly, setOnlineNowOnly] = useState(false);
  const [gigViewMode, setGigViewMode] = useState<'grid' | 'list'>('grid');

  // Workstream & Selected Order state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [starredOrderIds, setStarredOrderIds] = useState<string[]>([]);
  const [workstreamSearch, setWorkstreamSearch] = useState('');
  const [orderFeedback, setOrderFeedback] = useState<{ type: 'success' | 'error'; message: string; orderId?: string } | null>(null);

  useEffect(() => {
    if (!orderFeedback) return;
    const timer = setTimeout(() => {
      setOrderFeedback(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [orderFeedback]);

  const toggleStarOrder = useCallback((orderId: string) => {
    setStarredOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  }, []);

  const workstream = useWorkstream({
    orders,
    setOrders,
    usersList: users,
    gigs,
    messages,
    setMessages,
    reviews,
    setReviews,
    currentUser: activeUser,
    impersonatedUser,
    selectedOrder,
    setSelectedOrder,
    refresh
  });

  // Create Gig state
  const [newGigTitle, setNewGigTitle] = useState('');
  const [newGigCat, setNewGigCat] = useState('Development & IT');
  const [newGigDesc, setNewGigDesc] = useState('');
  const [newGigPrice, setNewGigPrice] = useState(25);
  const [newGigDays, setNewGigDays] = useState(3);
  const [newGigImage, setNewGigImage] = useState('');
  const [isOptimizingGig, setIsOptimizingGig] = useState(false);
  const [newGigExtras, setNewGigExtras] = useState<GigExtra[]>([]);
  const [extraTitleInput, setExtraTitleInput] = useState('');
  const [extraPriceInput, setExtraPriceInput] = useState(10);

  const handleOptimizeGigWithAI = async () => {
    if (!newGigTitle.trim()) return;
    setIsOptimizingGig(true);
    try {
      const res = await fetch('/api/gigs/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newGigTitle, category: newGigCat })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) setNewGigTitle(data.title);
        if (data.description) setNewGigDesc(data.description);
      }
    } catch (e) {
      console.warn('AI optimize error:', e);
    } finally {
      setIsOptimizingGig(false);
    }
  };

  const handleAddGigExtra = () => {
    if (!extraTitleInput.trim()) return;
    setNewGigExtras(prev => [
      ...prev,
      { id: 'extra_' + Date.now(), title: extraTitleInput.trim(), price: extraPriceInput }
    ]);
    setExtraTitleInput('');
    setExtraPriceInput(10);
  };

  const handleRemoveGigExtra = (id: string) => {
    setNewGigExtras(prev => prev.filter(e => e.id !== id));
  };

  const handlePublishGig = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAuthToken();
    if (!token || !activeUser) {
      setIsLoginModalOpen(true);
      return;
    }
    try {
      const res = await fetch('/api/gigs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newGigTitle,
          category: newGigCat,
          description: newGigDesc,
          price: newGigPrice,
          deliveryDays: newGigDays,
          image: newGigImage || DEFAULT_GIG_IMAGE,
          extras: newGigExtras
        })
      });
      if (res.ok) {
        const created = await res.json();
        await refresh();
        navigate(getGigUrl(created));
      }
    } catch (err) {
      console.error('Publish gig failed:', err);
    }
  };

  // Auth Handlers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLogin(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': getDeviceId()
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          code: loginCode
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Login failed.');
        return;
      }
      if (data.requiresVerification || data.requires2FA) {
        setLoginRequiresCode(true);
        setLoginVerificationMessage(data.message || 'Verification required');
        if (data.mockEmailCode) setMockEmailCodeDisplay(data.mockEmailCode);
        return;
      }
      if (data.token) {
        setAuthToken(data.token);
        updateCurrentUser(data.user);
        setIsLoginModalOpen(false);
        setLoginPassword('');
        setLoginCode('');
        refresh();
      }
    } catch (err: any) {
      setLoginError(err.message || 'Network error.');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingSignup(true);
    setSignupError(null);
    if (signupPassword !== signupConfirmPassword) {
      setSignupError('Passwords do not match.');
      setIsSubmittingSignup(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': getDeviceId()
        },
        body: JSON.stringify({
          name: signupName,
          email: signupEmail,
          mobile: signupMobile,
          password: signupPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setSignupError(data.error || 'Signup failed.');
        return;
      }
      setIsSignupModalOpen(false);
      if (data.requiresVerification) {
        setVerifyEmail(signupEmail);
        if (data.mockEmailCode) setMockEmailCodeDisplay(data.mockEmailCode);
        setIsVerifyModalOpen(true);
      } else if (data.token) {
        setAuthToken(data.token);
        updateCurrentUser(data.user);
        refresh();
      }
    } catch (err: any) {
      setSignupError(err.message || 'Network error.');
    } finally {
      setIsSubmittingSignup(false);
    }
  };

  const handleVerifyEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail, code: emailCodeInput })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setAuthToken(data.token);
        updateCurrentUser(data.user);
        setIsVerifyModalOpen(false);
        refresh();
      }
    } catch (e) {
      console.error('Verify error:', e);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotQuery, email: forgotQuery })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.mockCode || data.mockEmailCode) {
          setMockForgotCodeDisplay(data.mockCode || data.mockEmailCode);
        }
        setForgotStep('verify');
      }
    } catch (err) {
      console.error('Forgot password request error:', err);
    }
  };

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotCode.trim().length === 6) {
      setForgotStep('reset');
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmNewPassword) return;
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: forgotQuery,
          email: forgotQuery,
          code: forgotCode,
          newPassword
        })
      });
      if (res.ok) {
        setIsForgotPasswordModalOpen(false);
        setForgotStep('request');
        setForgotCode('');
        setNewPassword('');
        setConfirmNewPassword('');
        setIsLoginModalOpen(true);
      }
    } catch (err) {
      console.error('Reset password error:', err);
    }
  };

  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const isCreatingOrderRef = useRef(false);
  const handleCreateOrder = useCallback(
    async (orderTitle: string, priceUSD: number, sellerId: string, gigId?: string, extraIds?: string[]) => {
      if (!activeUser) {
        setIsLoginModalOpen(true);
        return;
      }
      if (isCreatingOrderRef.current || isCreatingOrder) return;
      isCreatingOrderRef.current = true;
      setIsCreatingOrder(true);
      setOrderFeedback(null);

      const normalizedExtraIds = Array.isArray(extraIds)
        ? Array.from(new Set(extraIds.map(String).filter(Boolean))).sort()
        : [];
      const payloadKey = `fivepa_patt_${activeUser.id}_${sellerId}_${gigId || 'custom'}_${encodeURIComponent(orderTitle)}_${priceUSD}_${normalizedExtraIds.join(',')}`;
      let clientRequestId = '';
      try {
        clientRequestId = sessionStorage.getItem(payloadKey) || '';
      } catch {}
      if (!clientRequestId) {
        clientRequestId = 'req_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        try {
          sessionStorage.setItem(payloadKey, clientRequestId);
        } catch {}
      }

      try {
        let token = getAuthToken();
        const isPrivileged = ['admin', 'super_admin', 'support'].includes(activeUser.role || '');
        if (!token && !isPrivileged) {
          const session = await requestDemoSession(activeUser.id);
          if (session?.token) {
            token = session.token;
            setAuthToken(token);
          }
        }
        if (!token) {
          setIsLoginModalOpen(true);
          return;
        }

        const sendOrderRequest = (tok: string) =>
          fetch('/api/orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-device-id': getDeviceId(),
              'x-idempotency-key': clientRequestId,
              Authorization: `Bearer ${tok}`
            },
            body: JSON.stringify({
              title: orderTitle,
              amount: priceUSD,
              buyerId: activeUser.id,
              sellerId,
              gigId,
              extraIds: normalizedExtraIds
            })
          });

        let res = await sendOrderRequest(token);
        if (res.status === 401 && !isPrivileged) {
          const recovered = await requestDemoSession(activeUser.id);
          if (recovered?.token) {
            token = recovered.token;
            setAuthToken(token);
            res = await sendOrderRequest(token);
          }
        }
        if (res.ok) {
          const newOrder = await res.json();
          try { sessionStorage.removeItem(payloadKey); } catch {}
          setOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
          setSelectedOrder(newOrder);
          workstream.fetchMessages(newOrder.id);
          setOrderFeedback({
            type: 'success',
            message: `Order #${newOrder.id} placed successfully! Funds are secured in escrow.`,
            orderId: newOrder.id
          });
          navigate(`/workstream/${newOrder.id}`);
          void refresh(activeUser.id);
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || errData.message || `Failed to place order (HTTP ${res.status})`;
          if (res.status === 400 || res.status === 403 || res.status === 409 || res.status === 422) {
            try { sessionStorage.removeItem(payloadKey); } catch {}
          }
          setOrderFeedback({
            type: 'error',
            message: errMsg
          });
        }
      } catch (e: any) {
        console.error('Order creation failed:', e);
        setOrderFeedback({
          type: 'error',
          message: e?.message || 'Network error while placing order. Please check your connection and retry.'
        });
      } finally {
        isCreatingOrderRef.current = false;
        setIsCreatingOrder(false);
      }
    },
    [activeUser, isCreatingOrder, navigate, refresh, setOrders, workstream]
  );

  const handleContactSeller = useCallback(
    async (freelancerId: string, freelancerName: string, gigTitle?: string, gigId?: string, projectId?: string) => {
      if (!activeUser) {
        setIsLoginModalOpen(true);
        return;
      }
      if (activeUser.id === freelancerId) {
        setOrderFeedback({
          type: 'error',
          message: 'You cannot open an inquiry with yourself.'
        });
        return;
      }

      const rawTitle = (gigTitle || `Consultation with ${freelancerName || 'Seller'}`).trim();
      const inquiryTitle = /^inquiry:/i.test(rawTitle) ? rawTitle : `Inquiry: ${rawTitle}`;

      try {
        let token = getAuthToken();
        const isPrivileged = ['admin', 'super_admin', 'support'].includes(activeUser.role || '');
        if (!token && !isPrivileged) {
          const session = await requestDemoSession(activeUser.id);
          if (session?.token) {
            token = session.token;
            setAuthToken(token);
          }
        }
        if (!token) {
          setIsLoginModalOpen(true);
          return;
        }

        const sendInquiryRequest = (tok: string) =>
          fetch('/api/orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-device-id': getDeviceId(),
              Authorization: `Bearer ${tok}`
            },
            body: JSON.stringify({
              title: inquiryTitle,
              amount: 0,
              isInquiry: true,
              buyerId: activeUser.id,
              sellerId: freelancerId,
              ...(gigId ? { gigId } : {}),
              ...(projectId ? { projectId } : {}),
              ...(!gigId && !projectId ? { originType: 'profile' } : {})
            })
          });

        let res = await sendInquiryRequest(token);
        if (res.status === 401 && !isPrivileged) {
          const recovered = await requestDemoSession(activeUser.id);
          if (recovered?.token) {
            token = recovered.token;
            setAuthToken(token);
            res = await sendInquiryRequest(token);
          }
        }

        if (res.ok) {
          const inquiryOrder = await res.json();
          setOrders(prev => [inquiryOrder, ...prev.filter(o => o.id !== inquiryOrder.id)]);
          setSelectedOrder(inquiryOrder);
          workstream.fetchMessages(inquiryOrder.id);
          navigate(`/workstream/${inquiryOrder.id}`);
          void refresh(activeUser.id);
        } else {
          const errData = await res.json().catch(() => ({}));
          setOrderFeedback({
            type: 'error',
            message: errData.error || 'Failed to open inquiry WorkStream.'
          });
        }
      } catch (err: any) {
        console.error('Contact seller inquiry failed:', err);
        setOrderFeedback({
          type: 'error',
          message: err?.message || 'Network error while opening inquiry.'
        });
      }
    },
    [activeUser, navigate, refresh, setOrders, workstream]
  );

  // Parse path & route segments
  let rawCleanPath = currentPath.split('?')[0].replace(/\/+$/, '') || '/';
  if (rawCleanPath === '/index.html') {
    rawCleanPath = '/';
  }
  const cleanPath = rawCleanPath;
  const pathParts = cleanPath.split('/').filter(Boolean);

  // Check modal trigger routes
  useEffect(() => {
    if (cleanPath === '/login') setIsLoginModalOpen(true);
    if (cleanPath === '/signup') setIsSignupModalOpen(true);
    if (cleanPath === '/switch-user') setIsUserSwitchModalOpen(true);
    if (cleanPath === '/support') setIsSupportModalOpen(true);
    if (cleanPath === '/wishlist') setIsWishlistModalOpen(true);
    if (cleanPath === '/notifications') setIsEmailNotificationsModalOpen(true);
    if (cleanPath === '/verify') setIsVerifyModalOpen(true);
    if (cleanPath === '/forgot-password') setIsForgotPasswordModalOpen(true);
  }, [cleanPath]);

  const resolveOrderFromRouteParam = useCallback(
    (targetId: string | null) => {
      if (!targetId) return null;
      let decodedId = targetId;
      try {
        decodedId = decodeURIComponent(targetId);
      } catch {}

      const allItems = workstream.hydratedWorkstreamItems.length > 0 ? workstream.hydratedWorkstreamItems : orders;
      // 1. Exact Order ID match
      const exactMatch =
        allItems.find(
          o =>
            o.id === targetId ||
            o.id === decodedId ||
            (o as any).gigOrderId === targetId ||
            (o as any).gigOrderId === decodedId ||
            (o as any).projectOrderId === targetId ||
            (o as any).projectOrderId === decodedId
        );
      if (exactMatch) return exactMatch;

      // 2. Workspace ID match -> resolve deterministically to the most recently updated / active order in that Workspace
      const wsMatches = allItems.filter(
        o => o.workspaceId === targetId || o.workspaceId === decodedId
      );
      if (wsMatches.length > 0) {
        const sorted = [...wsMatches].sort((a, b) => {
          const tA = new Date((a as any).updatedAt || a.createdAt || 0).getTime();
          const tB = new Date((b as any).updatedAt || b.createdAt || 0).getTime();
          if (tA !== tB) return tA - tB;
          return a.id.localeCompare(b.id);
        });
        return sorted[sorted.length - 1];
      }
      return null;
    },
    [orders, workstream.hydratedWorkstreamItems]
  );

  useEffect(() => {
    if (
      (cleanPath.startsWith('/workstream/') ||
        cleanPath.startsWith('/workspace/') ||
        cleanPath.startsWith('/messages/') ||
        cleanPath.startsWith('/orders/')) &&
      pathParts.length >= 2
    ) {
      const targetOrderId = pathParts[1];
      if (targetOrderId) {
        const matched = resolveOrderFromRouteParam(targetOrderId);
        if (matched && selectedOrder?.id !== matched.id) {
          setSelectedOrder(matched);
        }
      }
    } else if (
      cleanPath === '/workstream' ||
      cleanPath === '/workspace' ||
      cleanPath === '/messages' ||
      cleanPath === '/orders'
    ) {
      if (selectedOrder !== null) {
        setSelectedOrder(null);
      }
    }
  }, [cleanPath, pathParts, resolveOrderFromRouteParam, selectedOrder]);

  // Route flags
  const isGigsList = cleanPath === '/gigs' || cleanPath.startsWith('/categories');
  const isProjectsList = ['/projects', '/search-projects', '/project-search', '/freelance-jobs'].includes(cleanPath);
  const isFreelancersList = ['/freelancers', '/search-freelancers', '/freelancer-search'].includes(cleanPath);
  const isCategoryRoute = cleanPath.startsWith('/categories');
  const isProjectDetail = pathParts.length === 2 && (pathParts[0].toLowerCase() === 'projects' || pathParts[0].toLowerCase() === 'project');
  const isGigDetail =
    (pathParts.length >= 2 && (pathParts[0].toLowerCase() === 'gig' || pathParts[0].toLowerCase() === 'gigs')) ||
    (pathParts.length === 2 && !RESERVED_ROUTES.includes(pathParts[0].toLowerCase()));

  // Active Category detection
  const currentCategory = useMemo(() => {
    if (cleanPath.startsWith('/categories/')) {
      const slug = cleanPath.replace('/categories/', '').toLowerCase();
      for (const [name, s] of Object.entries(CATEGORY_SLUGS)) {
        if (s.toLowerCase() === slug) return name;
      }
      return slug;
    }
    return 'All';
  }, [cleanPath]);

  // Filtered Gigs
  const filteredGigs = useMemo(() => {
    return gigs.filter(g => {
      if (currentCategory && currentCategory !== 'All') {
        const catSlug = CATEGORY_SLUGS[g.category] || slugify(g.category);
        const targetSlug = CATEGORY_SLUGS[currentCategory] || slugify(currentCategory);
        if (catSlug !== targetSlug && g.category.toLowerCase() !== currentCategory.toLowerCase()) {
          return false;
        }
      }
      if (serviceOptionFilter && serviceOptionFilter !== 'All') {
        const catSlug = CATEGORY_SLUGS[g.category] || slugify(g.category);
        const optSlug = CATEGORY_SLUGS[serviceOptionFilter] || slugify(serviceOptionFilter);
        if (catSlug !== optSlug && g.category.toLowerCase() !== serviceOptionFilter.toLowerCase()) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = g.title.toLowerCase().includes(q);
        const matchDesc = g.description?.toLowerCase().includes(q);
        const matchSeller = g.freelancerName?.toLowerCase().includes(q);
        const matchTags = g.tags?.some(t => t.toLowerCase().includes(q));
        if (!matchTitle && !matchDesc && !matchSeller && !matchTags) return false;
      }
      if (budgetFilter && budgetFilter !== 'All') {
        if (budgetFilter === 'under25' && g.price >= 50) return false;
        if (budgetFilter === '50to100' && (g.price < 50 || g.price > 100)) return false;
        if (budgetFilter === 'over100' && g.price <= 100) return false;
        if (budgetFilter.startsWith('custom:')) {
          const parts = budgetFilter.replace('custom:', '').split('-');
          const min = parseFloat(parts[0]) || 0;
          const max = parseFloat(parts[1]) || Infinity;
          if (g.price < min || g.price > max) return false;
        }
      }
      if (deliveryTimeFilter) {
        if (g.deliveryDays > deliveryTimeFilter) return false;
      }
      if (sellerLevelFilter && sellerLevelFilter !== 'All' && g.freelancerLevel && !g.freelancerLevel.toLowerCase().includes(sellerLevelFilter.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [gigs, currentCategory, serviceOptionFilter, searchQuery, budgetFilter, deliveryTimeFilter, sellerLevelFilter]);

  // Determine current active view
  let mainContent: React.ReactNode = null;
  const currentSearchQuery = currentPath.includes('?')
    ? currentPath.slice(currentPath.indexOf('?'))
    : (initialData?.query ? `?${initialData.query}` : '');

  if (cleanPath.startsWith('/admin')) {
    mainContent = (
      <AdminPage
        currentUser={activeUser}
        impersonatedUser={impersonatedUser}
        updateCurrentUser={updateCurrentUser}
        setImpersonatedUser={setImpersonatedUser}
        usersList={users}
        setUsersList={setUsers}
        projects={projects}
        gigs={gigs}
        orders={orders}
        proposals={proposals}
        platformFee={platformFee}
        clientServiceFee={clientServiceFee}
        smallOrderFeeThreshold={smallOrderFeeThreshold}
        smallOrderFeeAmount={smallOrderFeeAmount}
        escrowProtectionDays={escrowProtectionDays}
        navigate={navigate}
        refresh={refresh}
        getDeviceId={getDeviceId}
      />
    );
  } else if (cleanPath === '/settings') {
    mainContent = (
      <SettingsPage
        currentUser={activeUser}
        updateCurrentUser={updateCurrentUser}
        navigate={navigate}
      />
    );
  } else if (cleanPath === '/edit-profile') {
    mainContent = (
      <EditProfilePage
        currentUser={activeUser}
        updateCurrentUser={updateCurrentUser}
        navigate={navigate}
      />
    );
  } else if (cleanPath === '/create-gig' || cleanPath === '/post-gig') {
    mainContent = (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <CreateGigView
          newGigTitle={newGigTitle}
          setNewGigTitle={setNewGigTitle}
          newGigCat={newGigCat}
          setNewGigCat={setNewGigCat}
          newGigDesc={newGigDesc}
          setNewGigDesc={setNewGigDesc}
          newGigPrice={newGigPrice}
          setNewGigPrice={setNewGigPrice}
          newGigDays={newGigDays}
          setNewGigDays={setNewGigDays}
          newGigImage={newGigImage}
          setNewGigImage={setNewGigImage}
          isOptimizingGig={isOptimizingGig}
          handleOptimizeGigWithAI={handleOptimizeGigWithAI}
          newGigExtras={newGigExtras}
          extraTitleInput={extraTitleInput}
          setExtraTitleInput={setExtraTitleInput}
          extraPriceInput={extraPriceInput}
          setExtraPriceInput={setExtraPriceInput}
          handleAddGigExtra={handleAddGigExtra}
          handleRemoveGigExtra={handleRemoveGigExtra}
          handlePublishGig={handlePublishGig}
        />
      </div>
    );
  } else if (cleanPath === '/buyer-activity') {
    mainContent = (
      <BuyerActivityView
        projects={projects}
        orders={orders}
        offers={offers}
        gigs={gigs}
        users={users}
        proposals={proposals}
        currentUser={activeUser}
        navigate={navigate}
        onOpenWorkstream={(ord) => {
          setSelectedOrder(ord);
          navigate(`/workstream/${ord.id}`);
        }}
      />
    );
  } else if (cleanPath === '/freelance-activity' || cleanPath === '/freelancer') {
    mainContent = (
      <FreelancerActivityView
        currentUser={activeUser}
        orders={orders}
        allGigs={gigs}
        categories={categories}
        projects={projects}
        proposals={proposals}
        users={users}
        navigate={navigate}
        onRefresh={refresh}
      />
    );
  } else if (
    cleanPath === '/orders' ||
    cleanPath === '/messages' ||
    cleanPath === '/workstream' ||
    cleanPath === '/workspace' ||
    cleanPath.startsWith('/messages/') ||
    cleanPath.startsWith('/orders/') ||
    cleanPath.startsWith('/workstream/') ||
    cleanPath.startsWith('/workspace/')
  ) {
    const routeOrderId = pathParts.length >= 2 ? pathParts[1] : null;
    const rawActiveOrder = routeOrderId
      ? resolveOrderFromRouteParam(routeOrderId) ||
        (selectedOrder?.id === routeOrderId || selectedOrder?.workspaceId === routeOrderId ? selectedOrder : null)
      : null;

    if (rawActiveOrder) {
      const hydratedActiveOrder = {
        ...rawActiveOrder,
        seller: (rawActiveOrder as any).seller || users.find(u => u.id === rawActiveOrder.sellerId),
        buyer: (rawActiveOrder as any).buyer || users.find(u => u.id === rawActiveOrder.buyerId),
        gig: (rawActiveOrder as any).gig || gigs.find(g => g.id === rawActiveOrder.gigId)
      };
      const workstreamPartner = users.find(
        u => u.id === (activeUser?.id === hydratedActiveOrder.buyerId ? hydratedActiveOrder.sellerId : hydratedActiveOrder.buyerId)
      );
      const workspaceOrders = hydratedActiveOrder.workspaceId
        ? workstream.hydratedWorkstreamItems
            .filter(
              o =>
                o.workspaceId === hydratedActiveOrder.workspaceId &&
                o.buyerId === hydratedActiveOrder.buyerId &&
                o.sellerId === hydratedActiveOrder.sellerId
            )
            .sort((a, b) => {
              const tA = new Date((a as any).updatedAt || a.createdAt || 0).getTime();
              const tB = new Date((b as any).updatedAt || b.createdAt || 0).getTime();
              if (tA !== tB) return tA - tB;
              return a.id.localeCompare(b.id);
            })
        : [hydratedActiveOrder as any];
      const workspaceOrderIds = new Set(workspaceOrders.map(o => o.id));
      workspaceOrderIds.add(hydratedActiveOrder.id);

      const workspaceMessages = workstream.messages
        .filter(
          m =>
            (m.orderId && workspaceOrderIds.has(m.orderId)) ||
            (Boolean(hydratedActiveOrder.workspaceId) &&
              (m.workspaceId === hydratedActiveOrder.workspaceId ||
               m.metadata?.workspaceId === hydratedActiveOrder.workspaceId ||
               m.orderId === hydratedActiveOrder.workspaceId))
        )
        .sort((a, b) => {
          const tA = a.timestamp ? new Date(a.timestamp).getTime() : NaN;
          const tB = b.timestamp ? new Date(b.timestamp).getTime() : NaN;
          const validA = !isNaN(tA);
          const validB = !isNaN(tB);
          if (!validA && !validB) return String(a.id || '').localeCompare(String(b.id || ''));
          if (!validA) return 1;
          if (!validB) return -1;
          if (tA !== tB) return tA - tB;
          return String(a.id || '').localeCompare(String(b.id || ''));
        });

      mainContent = (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <WorkstreamWorkspace
            order={hydratedActiveOrder as any}
            workspaceOrders={workspaceOrders as any}
            onSelectOrder={(oid) => {
              const matched = orders.find(o => o.id === oid);
              if (matched) setSelectedOrder(matched);
              navigate(`/workstream/${oid}`);
            }}
            messages={workspaceMessages as any}
            files={workstream.activeSharedFiles}
            currentUser={activeUser}
            usersList={users}
            partner={workstreamPartner}
            onBack={() => {
              setSelectedOrder(null);
              navigate('/workstream');
            }}
            onSendMessage={workstream.sendMessage}
            onAttachFile={(file) => workstream.sendMessage(`Attached file: ${file.name}`, 'file', file)}
            sendEvent={workstream.sendEvent}
            onOrderChanged={(updatedOrder, newOrder) => {
              const targetOrder = newOrder || updatedOrder;
              if (targetOrder && targetOrder.id) {
                setOrders(prev => {
                  const withoutTarget = prev.filter(
                    o =>
                      o.id !== targetOrder.id &&
                      !(targetOrder.workspaceId && (o as any).isInquiry && o.id === targetOrder.workspaceId)
                  );
                  return [targetOrder, ...withoutTarget];
                });
                setSelectedOrder(targetOrder);
                if (newOrder?.id && newOrder.id !== hydratedActiveOrder.id) {
                  workstream.fetchMessages(newOrder.id);
                  navigate(`/workstream/${newOrder.id}`);
                }
              }
              if (activeUser?.id) void refresh(activeUser.id);
            }}
            onReleaseEscrow={workstream.handleReleaseEscrow}
            onDeliverWork={workstream.handleDeliverWork}
            onRequestRevision={workstream.handleRequestRevision}
            isReviewModalOpen={workstream.isReviewModalOpen}
            setIsReviewModalOpen={workstream.setIsReviewModalOpen}
            handleSubmitReview={workstream.handleSubmitReview}
          />
        </div>
      );
    } else {
      mainContent = (
        <div className="max-w-7xl mx-auto py-8 px-4">
          <WorkstreamList
            workstreams={workstream.hydratedWorkstreamItems}
            currentUser={activeUser}
            selectedOrderId={selectedOrder?.id}
            onSelectOrder={(id: string) => {
              const matched = orders.find(o => o.id === id);
              setSelectedOrder(matched || null);
              navigate(`/workstream/${id}`);
            }}
            starredIds={starredOrderIds}
            onToggleStar={toggleStarOrder}
            searchQuery={workstreamSearch}
            onSearchChange={setWorkstreamSearch}
            onStartNewWorkstream={() => navigate('/gigs')}
          />
        </div>
      );
    }
  } else if (isProjectsList) {
    mainContent = (
      <ProjectSearchView
        projects={projects}
        navigate={navigate}
        currentUser={activeUser}
        query={currentSearchQuery}
      />
    );
  } else if (isFreelancersList) {
    mainContent = (
      <FreelancerSearchView
        usersList={users}
        gigs={gigs}
        navigate={navigate}
        currentUser={activeUser}
        setIsSignupModalOpen={setIsSignupModalOpen}
        slugify={slugify}
        query={currentSearchQuery}
      />
    );
  } else if (isProjectDetail) {
    const projId = pathParts[1];
    const project = projects.find(
      p => p.id === projId || (p.slug && p.slug.toLowerCase() === projId.toLowerCase())
    );
    if (project) {
      mainContent = (
        <ProjectDetailView
          project={project}
          currentUser={activeUser as any}
          navigate={navigate}
          allProjects={projects}
          proposals={proposals}
          orders={orders}
          onRefresh={refresh}
        />
      );
    }
  } else if (isGigDetail) {
    let gig: Gig | undefined;
    if (pathParts[0].toLowerCase() === 'gig' || pathParts[0].toLowerCase() === 'gigs') {
      const gigId = pathParts[1];
      gig = gigs.find(g => g.id === gigId || (g.slug && g.slug.toLowerCase() === gigId.toLowerCase()));
    } else if (pathParts.length === 2) {
      const [, gigSlug] = pathParts;
      gig = gigs.find(
        g =>
          (g.slug && g.slug.toLowerCase() === gigSlug.toLowerCase()) ||
          g.id === gigSlug ||
          slugify(g.title) === gigSlug.toLowerCase()
      );
    }
    if (gig) {
      mainContent = (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <GigDetailView
            currentGig={gig}
            gigs={gigs}
            reviews={reviews}
            orders={orders}
            currentUser={activeUser}
            navigate={navigate}
            handleContactSeller={handleContactSeller}
            handleCreateOrder={handleCreateOrder}
            isCreatingOrder={isCreatingOrder}
            orderFeedback={orderFeedback}
            onDismissOrderFeedback={() => setOrderFeedback(null)}
            slugify={slugify}
          />
        </div>
      );
    }
  } else if (cleanPath === '/payments' || cleanPath.startsWith('/payments')) {
    mainContent = (
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <PaymentsModule
          currentUser={activeUser}
          orders={orders}
          offers={offers}
          gigs={gigs}
          projects={projects}
          proposals={proposals}
          users={users}
          platformFee={platformFee}
          clientServiceFee={clientServiceFee}
          smallOrderFeeThreshold={smallOrderFeeThreshold}
          smallOrderFeeAmount={smallOrderFeeAmount}
          escrowProtectionDays={escrowProtectionDays}
          navigate={navigate}
          onOpenWorkstream={(ord) => {
            setSelectedOrder(ord);
            navigate(`/workstream/${ord.id}`);
          }}
          onBalanceUpdate={refresh}
        />
      </div>
    );
  } else if (
    (pathParts.length === 1 && !RESERVED_ROUTES.includes(pathParts[0].toLowerCase())) ||
    (pathParts.length === 2 && ['profile', 'freelancer', 'user', 'freelancers'].includes(pathParts[0].toLowerCase()))
  ) {
    const usernameParam = (pathParts.length === 2 ? pathParts[1] : pathParts[0]).toLowerCase();
    const matchedUser = users.find(
      u =>
        (u.username && u.username.toLowerCase() === usernameParam) ||
        slugify(u.name) === usernameParam ||
        u.id === usernameParam
    );
    if (matchedUser) {
      mainContent = (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <FreelancerProfileView
            profileUser={matchedUser}
            currentUser={activeUser}
            gigs={gigs}
            reviews={reviews}
            onNavigate={navigate}
            onContact={(targetId) => handleContactSeller(targetId || matchedUser.id, matchedUser.name, `Consultation with ${matchedUser.name}`)}
          />
        </div>
      );
    }
  }

  // Fallback to Marketplace Gigs View if not matched
  if (!mainContent) {
    mainContent = (
      <MarketplaceGigsView
        filteredGigs={filteredGigs}
        projects={projects}
        currentCategory={currentCategory}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        serviceOptionFilter={serviceOptionFilter}
        setServiceOptionFilter={setServiceOptionFilter}
        sellerLevelFilter={sellerLevelFilter}
        setSellerLevelFilter={setSellerLevelFilter}
        budgetFilter={budgetFilter}
        setBudgetFilter={setBudgetFilter}
        deliveryTimeFilter={deliveryTimeFilter}
        setDeliveryTimeFilter={setDeliveryTimeFilter}
        onlineNowOnly={onlineNowOnly}
        setOnlineNowOnly={setOnlineNowOnly}
        gigViewMode={gigViewMode}
        setGigViewMode={setGigViewMode}
        likedGigIds={likedGigIds}
        handleToggleLike={handleToggleLike}
        navigate={navigate}
        getGigUrl={getGigUrl}
        currentUser={activeUser}
        setIsSignupModalOpen={setIsSignupModalOpen}
        slugify={slugify}
        CATEGORY_SLUGS={CATEGORY_SLUGS}
        isHomePage={cleanPath === '/'}
      />
    );
  }

  const handleStopImpersonation = () => {
    setImpersonatedUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Impersonation Banner for Super Admin */}
      <ImpersonationBanner
        impersonatedUser={impersonatedUser}
        onStop={handleStopImpersonation}
      />

      {/* Main Global Header */}
      <Header
        navigate={navigate}
        currentUser={activeUser}
        orders={orders}
        likedGigIds={likedGigIds}
        isGigsList={isGigsList}
        isGigDetail={isGigDetail}
        isProjectsList={isProjectsList}
        isProjectDetail={isProjectDetail}
        isCategoryRoute={isCategoryRoute}
        loadUserSession={loadUserSession}
        updateCurrentUser={updateCurrentUser}
        setImpersonatedUser={setImpersonatedUser}
        setSelectedOrder={setSelectedOrder}
        setPath={setCurrentPath}
        fetchMessages={workstream.fetchMessages}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onOpenSignup={() => setIsSignupModalOpen(true)}
        onOpenSwitchUser={() => setIsUserSwitchModalOpen(true)}
      />

      {/* Order Purchase Status Banner */}
      {orderFeedback && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3 shadow-sm flex items-center justify-between gap-4 text-xs font-medium ${
              orderFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  orderFeedback.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              />
              <span className="font-bold">{orderFeedback.message}</span>
              {orderFeedback.orderId && cleanPath !== `/workstream/${orderFeedback.orderId}` && cleanPath !== `/messages/${orderFeedback.orderId}` && (
                <button
                  type="button"
                  onClick={(e) => navigate(`/workstream/${orderFeedback.orderId}`, e)}
                  className="underline font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer ml-1"
                >
                  View Workstream #{orderFeedback.orderId}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOrderFeedback(null)}
              className="text-slate-500 hover:text-slate-900 font-bold px-2 py-0.5 rounded-lg cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Page Content Body */}
      <main className="flex-1">
        {mainContent}
      </main>

      {/* Global Footer */}
      <Footer navigate={navigate} />

      {/* Auth & Utility Modals */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        loginRequiresCode={loginRequiresCode}
        loginVerificationMessage={loginVerificationMessage}
        mockEmailCodeDisplay={mockEmailCodeDisplay}
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        loginCode={loginCode}
        setLoginCode={setLoginCode}
        handleLoginSubmit={handleLoginSubmit}
        setLoginRequiresCode={setLoginRequiresCode}
        usersList={users}
        updateCurrentUser={updateCurrentUser}
        setImpersonatedUser={setImpersonatedUser}
        refresh={refresh}
        setIsForgotPasswordModalOpen={setIsForgotPasswordModalOpen}
        setMockEmailCodeDisplay={setMockEmailCodeDisplay}
        loginError={loginError}
        isSubmittingLogin={isSubmittingLogin}
        onSwitchToSignup={() => {
          setIsLoginModalOpen(false);
          setIsSignupModalOpen(true);
        }}
      />

      <SignupModal
        isOpen={isSignupModalOpen}
        onClose={() => setIsSignupModalOpen(false)}
        handleSignupSubmit={handleSignupSubmit}
        signupName={signupName}
        setSignupName={setSignupName}
        signupEmail={signupEmail}
        setSignupEmail={setSignupEmail}
        signupMobile={signupMobile}
        setSignupMobile={setSignupMobile}
        signupPassword={signupPassword}
        setSignupPassword={setSignupPassword}
        signupConfirmPassword={signupConfirmPassword}
        setSignupConfirmPassword={setSignupConfirmPassword}
        signupError={signupError}
        isSubmittingSignup={isSubmittingSignup}
        onSwitchToLogin={() => {
          setIsSignupModalOpen(false);
          setIsLoginModalOpen(true);
        }}
      />

      <UserSwitchModal
        isOpen={isUserSwitchModalOpen}
        onClose={() => setIsUserSwitchModalOpen(false)}
        usersList={users}
        currentUser={activeUser}
        setCurrentUser={updateCurrentUser}
        setImpersonatedUser={setImpersonatedUser}
        refresh={refresh}
      />

      <ForgotPasswordModal
        isOpen={isForgotPasswordModalOpen}
        onClose={() => setIsForgotPasswordModalOpen(false)}
        forgotStep={forgotStep}
        setForgotStep={setForgotStep}
        forgotQuery={forgotQuery}
        setForgotQuery={setForgotQuery}
        forgotCode={forgotCode}
        setForgotCode={setForgotCode}
        mockForgotCodeDisplay={mockForgotCodeDisplay}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmNewPassword={confirmNewPassword}
        setConfirmNewPassword={setConfirmNewPassword}
        handleForgotRequest={handleForgotRequest}
        handleForgotVerify={handleForgotVerify}
        handleForgotReset={handleForgotReset}
        setForgotCodeEmpty={() => setForgotCode('')}
      />

      <VerifyModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        verificationMode={verificationMode}
        setVerificationMode={setVerificationMode}
        emailCodeInput={emailCodeInput}
        setEmailCodeInput={setEmailCodeInput}
        smsCodeInput={smsCodeInput}
        setSmsCodeInput={setSmsCodeInput}
        handleVerifyEmailSubmit={handleVerifyEmailSubmit}
        handleVerifySmsSubmit={(e) => e.preventDefault()}
        handleResendEmailCode={() => {}}
        handleResendSmsCode={() => {}}
        verifyEmail={verifyEmail}
        mockEmailCodeDisplay={mockEmailCodeDisplay || undefined}
      />

      <SupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        supportSubject={supportSubject}
        setSupportSubject={setSupportSubject}
        supportMessage={supportMessage}
        setSupportMessage={setSupportMessage}
        onSubmitTicket={(e) => {
          e.preventDefault();
          setIsSupportModalOpen(false);
        }}
      />

      <WishlistModal
        isOpen={isWishlistModalOpen}
        onClose={() => setIsWishlistModalOpen(false)}
        likedGigIds={likedGigIds}
        gigs={gigs}
        onToggleLike={(id) => handleToggleLike(id)}
        getGigUrl={getGigUrl}
        navigate={navigate}
      />

      <EmailNotificationsModal
        isOpen={isEmailNotificationsModalOpen}
        onClose={() => setIsEmailNotificationsModalOpen(false)}
        userEmails={userEmails as any}
        userEmail={activeUser?.email || ''}
        onMarkAsRead={() => {}}
        onOpenSupport={() => setIsSupportModalOpen(true)}
      />
    </div>
  );
}
