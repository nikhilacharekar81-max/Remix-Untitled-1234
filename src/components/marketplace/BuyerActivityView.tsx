import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Briefcase,
  CheckCircle2,
  PlusCircle,
  ChevronDown,
  ThumbsUp,
  Heart,
  MapPin,
  FileText
} from 'lucide-react';
import { Project, UserAccount, Order, WorkstreamOffer, Gig, Proposal } from '../../types';
import { getAuthToken, setAuthToken, requestDemoSession } from '../../utils/authToken';
import { getDeviceId } from '../../utils/deviceId';
import { DEFAULT_AVATAR, DEFAULT_GIG_IMAGE } from '../../constants';
import { getGigUrl } from '../../utils/slugify';
import { formatActivityDate, toNumericRef, formatCompactAmount } from '../../utils/formatters';

interface BuyerActivityViewProps {
  projects: Project[];
  orders: Order[];
  offers: WorkstreamOffer[];
  gigs?: Gig[];
  users?: UserAccount[];
  proposals?: Proposal[];
  currentUser: UserAccount | null;
  navigate: (path: string, e?: React.MouseEvent) => void;
  onOpenWorkstream?: (order: Order) => void;
}

type MainSectionTab = 'projects' | 'gigs';
type ProjectSubTab = 'all' | 'open' | 'in_progress' | 'completed' | 'pending' | 'declined' | 'archived';
type GigSubTab = 'all' | 'active' | 'delivered' | 'completed' | 'pending' | 'declined';

export const BuyerActivityView: React.FC<BuyerActivityViewProps> = ({
  projects,
  orders,
  offers = [],
  gigs = [],
  users = [],
  proposals = [],
  currentUser,
  navigate,
  onOpenWorkstream
}) => {
  const [activeSection, setActiveSection] = useState<MainSectionTab>('projects');
  const [projectSubTab, setProjectSubTab] = useState<ProjectSubTab>('all');
  const [gigSubTab, setGigSubTab] = useState<GigSubTab>('all');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [fetchedOrders, setFetchedOrders] = useState<Order[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadLatestBuyerOrders = useCallback(async () => {
    if (!currentUser) return;
    try {
      let token = getAuthToken();
      let tokenUserId: string | null = null;
      let tokenUserRole: string | null = null;
      if (token) {
        try {
          const [b64] = token.split('.');
          if (b64 && typeof atob === 'function') {
            const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
            if (payload?.id) tokenUserId = payload.id;
            if (payload?.role) tokenUserRole = payload.role;
          }
        } catch {}
      }
      const isTokenAdmin = Boolean(tokenUserRole && ['admin', 'super_admin', 'support'].includes(tokenUserRole));
      const isPrivileged = ['admin', 'super_admin', 'support'].includes(currentUser.role || '');
      if ((!token || (!isTokenAdmin && tokenUserId !== currentUser.id)) && !isPrivileged) {
        const session = await requestDemoSession(currentUser.id);
        if (session?.token) {
          token = session.token;
          setAuthToken(token);
        }
      }
      if (!token) return;

      const buildHeaders = (tok: string): Record<string, string> => ({
        'x-device-id': getDeviceId(),
        Authorization: `Bearer ${tok}`
      });

      let res = await fetch('/api/orders', { headers: buildHeaders(token) });
      if (res.status === 401 && !isPrivileged) {
        const recovered = await requestDemoSession(currentUser.id);
        if (recovered?.token) {
          token = recovered.token;
          setAuthToken(token);
          res = await fetch('/api/orders', { headers: buildHeaders(token) });
        }
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setFetchedOrders(data);
        }
      }
    } catch (e) {
      console.warn('Failed to refresh buyer orders:', e);
    }
  }, [currentUser]);

  useEffect(() => {
    loadLatestBuyerOrders();
  }, [loadLatestBuyerOrders]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdownId(null);
    if (activeDropdownId) {
      window.addEventListener('click', handleOutsideClick);
      return () => window.removeEventListener('click', handleOutsideClick);
    }
  }, [activeDropdownId]);

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center font-sans">
        <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
            <Briefcase className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">My Buyer Activity</h1>
          <p className="text-slate-500 max-w-md mx-auto text-sm">
            Please log in to view and manage your posted projects, ordered gigs, and escrow workstreams.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-slate-800 transition-all shadow-sm cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Merge prop orders and freshly fetched orders so newly placed gig orders are always present
  const mergedOrders = useMemo(() => {
    const byId = new Map<string, Order>();
    for (const o of orders) {
      if (o && o.id) byId.set(o.id, o);
    }
    for (const o of fetchedOrders) {
      if (o && o.id) byId.set(o.id, { ...(byId.get(o.id) || {}), ...o });
    }
    return Array.from(byId.values());
  }, [orders, fetchedOrders]);

  // Filter projects belonging strictly to current buyer
  const myProjects = useMemo(() => {
    return projects
      .filter(p => p.buyerId === currentUser.id)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [projects, currentUser.id]);

  // Filter orders (workstreams) belonging to current buyer
  const myWorkstreams = useMemo(() => {
    return mergedOrders
      .filter(o => o.buyerId === currentUser.id)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [mergedOrders, currentUser.id]);

  const myProjectIds = useMemo(() => new Set(myProjects.map(p => p.id)), [myProjects]);

  const myGigOrders = useMemo(() => {
    return myWorkstreams.filter(o => {
      if (o.orderType === 'gig' || o.type === 'gig' || Boolean(o.gigId)) return true;
      if (o.projectId && myProjectIds.has(o.projectId)) return false;
      return !o.projectId;
    });
  }, [myWorkstreams, myProjectIds]);

  const resolveOrderSeller = useCallback(
    (ord: Order) => {
      const linkedGig = ord.gigId ? gigs.find(g => g.id === ord.gigId) : undefined;
      const sellerUser = users.find(u => u.id === ord.sellerId) || (ord as any).seller;
      const sellerName =
        (ord as any).sellerName ||
        sellerUser?.name ||
        linkedGig?.freelancerName ||
        ord.sellerUsername ||
        'Freelancer';
      const sellerUsername =
        ord.sellerUsername ||
        sellerUser?.username ||
        linkedGig?.freelancerUsername ||
        'freelancer';
      const sellerAvatar =
        (ord as any).sellerAvatar ||
        sellerUser?.avatar ||
        linkedGig?.freelancerAvatar ||
        DEFAULT_AVATAR;
      const gigTitle = ord.serviceTitle || ord.title || linkedGig?.title || 'Gig Service Order';
      const gigImage =
        (ord as any).serviceImage ||
        linkedGig?.image ||
        DEFAULT_GIG_IMAGE;
      const gigUrl =
        ord.serviceUrl ||
        (linkedGig ? getGigUrl(linkedGig) : ord.gigId ? `/gig/${ord.gigId}${ord.gigSlug ? `/${ord.gigSlug}` : ''}` : undefined);

      return {
        sellerName,
        sellerUsername,
        sellerAvatar,
        gigTitle,
        gigImage,
        gigUrl,
        linkedGig
      };
    },
    [gigs, users]
  );

  const handleOpenOrderWorkstream = useCallback(
    (ord: Order) => {
      setActiveDropdownId(null);
      if (onOpenWorkstream) {
        onOpenWorkstream(ord);
      } else {
        navigate(`/workstream/${ord.id}`);
      }
    },
    [onOpenWorkstream, navigate]
  );

  // Build unified items for PROJECTS tab (strictly Buyer's own posted projects)
  const buyerProjectItems = useMemo(() => {
    return myProjects.map((proj, idx) => {
      const linkedOrders = myWorkstreams.filter(o => o.projectId === proj.id);
      const primaryOrder = linkedOrders[0];
      const sellerInfo = primaryOrder ? resolveOrderSeller(primaryOrder) : null;
      const isCompleted = proj.status === 'completed' || primaryOrder?.status === 'completed';
      const isInProgress =
        proj.status === 'in_progress' ||
        Boolean(
          primaryOrder &&
            ['funded_in_escrow', 'in_progress', 'work_in_progress', 'delivered', 'revision', 'revision_requested'].includes(
              primaryOrder.status
            )
        );
      const isOpen = proj.status === 'open' || proj.status === 'published' || (!isCompleted && !isInProgress);

      let subCat: ProjectSubTab = 'open';
      if (isCompleted) subCat = 'completed';
      else if (isInProgress) subCat = 'in_progress';
      else if (proj.moderationStatus === 'pending') subCat = 'pending';
      else if (proj.moderationStatus === 'rejected' || proj.status === 'suspended') subCat = 'declined';
      else if (proj.status === 'unpublished') subCat = 'archived';

      const budgetVal = primaryOrder
        ? Number(primaryOrder.amount || 0)
        : Number(proj.budgetMax || proj.budgetMin || 0);

      return {
        id: proj.id,
        title: proj.title,
        slug: proj.slug,
        description: proj.description,
        counterpartyName: sellerInfo ? sellerInfo.sellerName : `${proj.proposalsCount || 0} Proposals`,
        counterpartyUsername: sellerInfo?.sellerUsername,
        counterpartyAvatar: sellerInfo ? sellerInfo.sellerAvatar : currentUser.avatar || DEFAULT_AVATAR,
        dateLabel: primaryOrder ? 'Awarded:' : 'Posted:',
        dateValue: formatActivityDate(proj.createdAt),
        amountLabel: primaryOrder ? 'Escrow:' : 'Budget:',
        amountValue: budgetVal,
        proposalsCount: proj.proposalsCount || 0,
        status: proj.status,
        subCategory: subCat,
        location: 'Remote',
        refNumber: toNumericRef(proj.id, idx + 1),
        order: primaryOrder,
        projectId: proj.id,
        sortTimestamp: new Date(proj.createdAt || 0).getTime() || 0
      };
    });
  }, [myProjects, myWorkstreams, resolveOrderSeller, currentUser.avatar]);

  const filteredProjectItems = useMemo(() => {
    if (projectSubTab === 'all') return buyerProjectItems;
    return buyerProjectItems.filter(item => item.subCategory === projectSubTab);
  }, [buyerProjectItems, projectSubTab]);

  // Filter Gig orders for GIGS tab
  const filteredGigOrders = useMemo(() => {
    return myGigOrders.filter(ord => {
      const st = (ord.status || '').toLowerCase();
      if (gigSubTab === 'all') return true;
      if (gigSubTab === 'active') {
        return ['funded_in_escrow', 'in_progress', 'work_in_progress', 'revision', 'revision_requested'].includes(st);
      }
      if (gigSubTab === 'delivered') {
        return st === 'delivered';
      }
      if (gigSubTab === 'completed') {
        return st === 'completed';
      }
      if (gigSubTab === 'pending') {
        return st === 'payment_pending' || st === 'pending';
      }
      if (gigSubTab === 'declined') {
        return st === 'cancelled' || st === 'refunded' || st === 'disputed';
      }
      return true;
    });
  }, [myGigOrders, gigSubTab]);

  // Sidebar Statistics matching PeoplePerHour Buyer Activity Sidebar from user image exactly
  const summary = useMemo(() => {
    const projectsIPosted = myProjects.length;
    const projectsIAwarded = myWorkstreams.filter(o => o.projectId && myProjectIds.has(o.projectId)).length;
    const projectsInProgress = myWorkstreams.filter(
      o => o.projectId && myProjectIds.has(o.projectId) && ['funded_in_escrow', 'in_progress', 'work_in_progress', 'delivered', 'revision', 'revision_requested'].includes(o.status)
    ).length;
    const liveProposalCount = proposals.filter(pr => myProjectIds.has(pr.projectId) && pr.status === 'pending').length;
    const pendingProposals = Math.max(
      liveProposalCount,
      myProjects.reduce((sum, p) => sum + (p.proposalsCount || 0), 0)
    );
    const paidOut = myWorkstreams
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);

    return {
      projectsIPosted,
      projectsIAwarded,
      projectsInProgress,
      pendingProposals,
      paidOut
    };
  }, [myProjects, myWorkstreams, myProjectIds, proposals]);

  const gigSummary = useMemo(() => {
    const orderedCount = myGigOrders.length;
    const activeCount = myGigOrders.filter(o =>
      ['funded_in_escrow', 'in_progress', 'work_in_progress', 'delivered', 'revision', 'revision_requested'].includes(
        o.status
      )
    ).length;
    const completedCount = myGigOrders.filter(o => o.status === 'completed').length;
    const totalSpent = myGigOrders
      .filter(o => o.status !== 'cancelled' && (o.status as string) !== 'refunded')
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);

    return {
      orderedCount,
      activeCount,
      completedCount,
      totalSpent
    };
  }, [myGigOrders]);

  const projectSubTabs: { id: ProjectSubTab; label: string }[] = [
    { id: 'all', label: 'All projects' },
    { id: 'open', label: 'Open for Proposals' },
    { id: 'in_progress', label: 'Work in progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'pending', label: 'Pending' },
    { id: 'declined', label: 'Declined' },
    { id: 'archived', label: 'Archived' }
  ];

  const gigSubTabs: { id: GigSubTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'completed', label: 'Completed' },
    { id: 'pending', label: 'Pending' },
    { id: 'declined', label: 'Declined' }
  ];

  const renderOrderCornerRibbon = (status: string) => {
    const normalized = (status || 'in_progress').toLowerCase();
    let label = 'ACTIVE';
    let bgClass = 'bg-emerald-600';

    if (normalized === 'completed') {
      label = 'COMPLETED';
      bgClass = 'bg-emerald-600';
    } else if (normalized === 'delivered') {
      label = 'DELIVERED';
      bgClass = 'bg-amber-500';
    } else if (normalized === 'payment_pending' || normalized === 'pending') {
      label = 'PENDING';
      bgClass = 'bg-amber-500';
    } else if (normalized === 'cancelled' || normalized === 'refunded') {
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-slate-800 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Main Content Area */}
        <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
                My Buyer Activity
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Manage your posted projects, ordered gigs, proposals, and ongoing escrow workstreams.
              </p>
            </div>

            {activeSection === 'projects' ? (
              <button
                onClick={() => navigate('/post-project')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
              >
                <PlusCircle className="w-4 h-4" />
                <span>POST PROJECT</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/gigs')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Order New Gig</span>
              </button>
            )}
          </div>

          {/* Primary Connected Tabs: PROJECTS | GIGS */}
          <div className="grid grid-cols-2 mb-6 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveSection('projects')}
              className={`py-2.5 text-center text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                activeSection === 'projects'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              PROJECTS
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('gigs')}
              className={`py-2.5 text-center text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                activeSection === 'gigs'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              GIGS ORDERED
            </button>
          </div>

          {/* Sub-filter Navigation Bar (PeoplePerHour Style) */}
          {activeSection === 'projects' ? (
            <div className="border-b border-slate-200 px-1 flex flex-wrap items-center gap-5 mb-2">
              {projectSubTabs.map(tab => {
                const isActive = projectSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProjectSubTab(tab.id)}
                    className={`py-3 text-[13px] transition-colors border-b-2 -mb-px cursor-pointer ${
                      isActive
                        ? 'border-emerald-600 text-emerald-600 font-bold'
                        : 'border-transparent text-slate-500 hover:text-slate-800 font-medium'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="border-b border-slate-200 px-1 flex flex-wrap items-center gap-6 mb-2">
              {gigSubTabs.map(tab => {
                const isActive = gigSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setGigSubTab(tab.id)}
                    className={`py-3 text-[13px] transition-colors border-b-2 -mb-px cursor-pointer ${
                      isActive
                        ? 'border-emerald-600 text-emerald-600 font-bold'
                        : 'border-transparent text-slate-500 hover:text-slate-800 font-medium'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tab Content */}
          {activeSection === 'projects' ? (
            filteredProjectItems.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm space-y-1.5 bg-white font-sans">
                <p className="font-bold text-slate-900 text-base">
                  No projects found under &ldquo;{projectSubTabs.find(t => t.id === projectSubTab)?.label || 'All'}&rdquo;.
                </p>
                <p className="text-slate-500 text-sm">
                  Projects you have posted will appear here with proposal counts and management controls.
                </p>
              </div>
            ) : (
              <div className="bg-white divide-y divide-slate-200/80 font-sans">
                {filteredProjectItems.map(item => {
                  const isCompleted = item.subCategory === 'completed';
                  const isInProgress = item.subCategory === 'in_progress';
                  const isAwarded = Boolean(item.order);

                  return (
                    <div
                      key={item.id}
                      className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors"
                    >
                      {/* Left Side: Project Title + Metadata Row (PeoplePerHour Layout) */}
                      <div className="space-y-2 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/projects/${item.id}`)}
                          className="text-left text-base font-bold text-slate-900 hover:text-emerald-600 transition-colors leading-snug cursor-pointer block"
                        >
                          {item.title}
                        </button>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-500">
                          <span className={`font-semibold ${isCompleted ? 'text-emerald-600' : isInProgress ? 'text-blue-600' : 'text-slate-600'}`}>
                            {isCompleted ? 'Completed' : isInProgress ? 'Awarded' : 'Open for Proposals'}
                          </span>
                          <span>
                            Posted: <strong className="font-semibold text-slate-700">{item.dateValue}</strong>
                          </span>
                          <span>
                            Budget: <strong className="font-bold text-slate-900">${item.amountValue.toLocaleString()}</strong>
                          </span>
                          <span className="text-slate-400 font-medium">#{item.refNumber}</span>
                        </div>
                      </div>

                      {/* Right Side: Proposals Count / Action Button (PeoplePerHour Style) */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 sm:min-w-[170px] gap-2.5">
                        <div className="text-left sm:text-right leading-none">
                          <span className="block text-xl font-bold text-slate-900 tracking-tight">
                            {item.proposalsCount}
                          </span>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                            PROPOSALS ACCEPTED
                          </span>
                        </div>

                        {item.order ? (
                          <button
                            type="button"
                            onClick={() => handleOpenOrderWorkstream(item.order!)}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                          >
                            VIEW PROGRESS
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => navigate(`/projects/${item.id}`)}
                            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                          >
                            POST SIMILAR
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredGigOrders.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm space-y-1.5 bg-white font-sans">
              <p className="font-bold text-slate-900 text-base">
                No gigs found under &ldquo;{gigSubTabs.find(t => t.id === gigSubTab)?.label || 'All'}&rdquo;.
              </p>
              <p className="text-slate-500 text-sm">
                Order a gig from the marketplace or switch filters above to view your active gig orders.
              </p>
            </div>
          ) : (
            <div className="bg-white divide-y divide-slate-200/80 font-sans">
              {filteredGigOrders.map((ord, idx) => {
                const { sellerName, sellerUsername, sellerAvatar, gigTitle, gigImage, gigUrl, linkedGig } =
                  resolveOrderSeller(ord);
                const isCancelled = ord.status === 'cancelled' || (ord.status as string) === 'refunded';
                const isDropdownOpen = activeDropdownId === ord.id;
                const ratingPercent = Math.round(((linkedGig?.rating || 5) / 5) * 100);
                const reviewsCount = linkedGig?.reviewsCount ?? 1;
                const refNum = toNumericRef(ord.id, idx + 1);

                return (
                  <div
                    key={ord.id}
                    className={`py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 transition-colors ${
                      isCancelled ? 'opacity-65' : ''
                    }`}
                  >
                    {/* Left + Middle: Thumbnail and Gig Order Metadata */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div
                        onClick={() => handleOpenOrderWorkstream(ord)}
                        className="relative w-28 h-20 sm:w-32 sm:h-[84px] overflow-hidden bg-slate-100 border border-slate-200/90 shrink-0 rounded-lg shadow-2xs cursor-pointer"
                      >
                        <img
                          src={gigImage}
                          alt={gigTitle}
                          className={`w-full h-full object-cover ${isCancelled ? 'grayscale' : ''}`}
                          onError={e => {
                            (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE;
                          }}
                        />
                        {renderOrderCornerRibbon(ord.status)}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[76px]">
                        <div>
                          <button
                            type="button"
                            onClick={() => handleOpenOrderWorkstream(ord)}
                            className="text-left text-base font-bold text-slate-900 hover:text-emerald-600 transition-colors line-clamp-2 leading-snug cursor-pointer block"
                          >
                            {gigTitle}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 mt-2">
                          <div
                            onClick={() => navigate(`/${sellerUsername}`)}
                            className="inline-flex items-center gap-2 text-slate-800 hover:text-emerald-600 font-semibold cursor-pointer"
                          >
                            <img
                              src={sellerAvatar}
                              alt={sellerName}
                              className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
                              onError={e => {
                                (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                              }}
                            />
                            <span>{sellerName}</span>
                          </div>

                          <span>
                            Ordered:{' '}
                            <strong className="font-semibold text-slate-700">
                              {formatActivityDate(ord.createdAt)}
                            </strong>
                          </span>

                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                            <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{ratingPercent}%</span>
                          </span>

                          <span>
                            Price:{' '}
                            <strong className="font-bold text-slate-900">
                              ${Number(ord.amount || 0).toLocaleString()}
                            </strong>
                          </span>

                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <Heart className="w-3.5 h-3.5 fill-slate-300 text-slate-400" />
                            <span>{reviewsCount}</span>
                          </span>

                          <span className="text-slate-400 font-medium">#{refNum}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount Counter + Split Button with Small Dropdown at the End */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 self-stretch sm:min-w-[175px] gap-2.5">
                      <div className="text-left sm:text-right leading-none">
                        <span className="block text-xl font-bold text-slate-900 tracking-tight">
                          ${formatCompactAmount(Number(ord.amount || 0))}
                        </span>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                          ESCROW
                        </span>
                      </div>

                      {!isCancelled ? (
                        <div className="relative">
                          <div
                            className={`inline-flex items-stretch rounded-lg border overflow-hidden shadow-2xs transition-colors ${
                              isDropdownOpen
                                ? 'border-emerald-600 ring-2 ring-emerald-500/15'
                                : 'border-slate-200 hover:border-slate-300'
                            } bg-white`}
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenOrderWorkstream(ord)}
                              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                isDropdownOpen
                                  ? 'text-emerald-600 bg-emerald-50/40'
                                  : 'text-slate-700 hover:text-emerald-600 hover:bg-slate-50'
                              }`}
                            >
                              VIEW PROGRESS
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setActiveDropdownId(prev => (prev === ord.id ? null : ord.id));
                              }}
                              aria-label="Gig order actions"
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
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleOpenOrderWorkstream(ord)}
                                className="w-full text-left px-4 py-2 hover:bg-slate-50 hover:text-emerald-600 text-slate-700 font-semibold transition-colors cursor-pointer block"
                              >
                                View Progress
                              </button>
                              {gigUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveDropdownId(null);
                                    navigate(gigUrl);
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-slate-50 hover:text-emerald-600 text-slate-700 font-semibold transition-colors cursor-pointer block"
                                >
                                  View Gig Listing
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  navigate(`/${sellerUsername}`);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-slate-50 hover:text-emerald-600 text-slate-700 font-semibold transition-colors cursor-pointer block"
                              >
                                Freelancer Profile
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
          )}
        </div>

        {/* Right Column: MY ACTIVITY SUMMARY (Matching PeoplePerHour image layout exactly) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4 font-sans">
            <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-emerald-50 inline-block shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                MY ACTIVITY SUMMARY
              </h3>
            </div>

            {activeSection === 'projects' ? (
              <div className="space-y-3.5 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Projects I posted</span>
                  <span className="font-bold text-slate-900">{summary.projectsIPosted}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Projects I awarded</span>
                  <span className="font-bold text-slate-900">{summary.projectsIAwarded}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Projects in progress</span>
                  <span className="font-bold text-slate-900">{summary.projectsInProgress}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Pending Proposals</span>
                  <span className="font-bold text-slate-900">{summary.pendingProposals}</span>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Paid Out</span>
                  <span className="font-bold text-emerald-600 text-base">
                    ${summary.paidOut.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Gigs I ordered</span>
                  <span className="font-bold text-slate-900">{gigSummary.orderedCount}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Active Gig Orders</span>
                  <span className="font-bold text-slate-900">{gigSummary.activeCount}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Completed Gig Orders</span>
                  <span className="font-bold text-slate-900">{gigSummary.completedCount}</span>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Total Escrow / Spent</span>
                  <span className="font-bold text-emerald-600 text-base">
                    ${gigSummary.totalSpent.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
