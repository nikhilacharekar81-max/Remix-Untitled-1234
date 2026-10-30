import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Briefcase,
  CheckCircle2,
  PlusCircle
} from 'lucide-react';
import { Gig, Order, UserAccount, Category, Project, Proposal } from '../../types';
import { UserFreelanceOffersList } from '../user_dashboard/UserFreelanceOffersList';
import { UserFreelanceProjectsList, FreelancerProjectActivityItem } from '../user_dashboard/UserFreelanceProjectsList';
import { UserActivitySummarySidebar } from '../user_dashboard/UserActivitySummarySidebar';
import { EditGigModal } from '../gigs/EditGigModal';
import { DeleteGigModal } from '../gigs/DeleteGigModal';
import { ViewingGigModal } from '../gigs/ViewingGigModal';
import { getGigUrl } from '../../utils/slugify';
import { getAuthToken } from '../../utils/authToken';
import { getDeviceId } from '../../utils/deviceId';
import { DEFAULT_AVATAR } from '../../constants';
import { formatActivityDate, toNumericRef } from '../../utils/formatters';

interface FreelancerActivityViewProps {
  currentUser: UserAccount | null;
  orders: Order[];
  allGigs: Gig[];
  categories: Category[];
  projects?: Project[];
  proposals?: Proposal[];
  users?: UserAccount[];
  navigate: (path: string, e?: React.MouseEvent) => void;
  onOpenWorkstream?: (order: Order) => void;
  onRefresh?: () => void;
}

type MainSectionTab = 'projects' | 'gigs';
type ProjectSubTab = 'all' | 'pending_proposals' | 'in_progress' | 'completed';
type GigSubTab = 'all' | 'active' | 'paused' | 'pending' | 'declined' | 'featured';

function isOrderCompletedOrActive(order: Order): boolean {
  return (
    order.status === 'completed' ||
    order.status === 'delivered' ||
    order.status === 'in_progress' ||
    order.status === 'work_in_progress' ||
    order.status === 'funded_in_escrow' ||
    order.status === 'revision'
  );
}

export const FreelancerActivityView: React.FC<FreelancerActivityViewProps> = ({
  currentUser,
  orders = [],
  allGigs = [],
  categories = [],
  projects = [],
  proposals = [],
  users = [],
  navigate,
  onOpenWorkstream,
  onRefresh
}) => {
  const [myGigs, setMyGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<MainSectionTab>('gigs');
  const [projectSubTab, setProjectSubTab] = useState<ProjectSubTab>('all');
  const [gigSubTab, setGigSubTab] = useState<GigSubTab>('all');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  // Modals state
  const [viewingGig, setViewingGig] = useState<Gig | null>(null);
  const [editingGig, setEditingGig] = useState<Gig | null>(null);
  const [gigToDelete, setGigToDelete] = useState<{ id: string; title?: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchMyGigs = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'x-device-id': getDeviceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch('/api/my/gigs', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setMyGigs(data);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch /api/my/gigs:', e);
    }

    const userGigs = allGigs.filter(g => g.freelancerId === currentUser.id);
    setMyGigs(userGigs);
    setLoading(false);
  }, [currentUser, allGigs]);

  useEffect(() => {
    fetchMyGigs();
  }, [fetchMyGigs]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdownId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // All seller orders belonging to current freelancer
  const mySellerOrders = useMemo(() => {
    if (!currentUser) return [];
    return orders.filter(o => o.sellerId === currentUser.id && o.status !== 'cancelled');
  }, [orders, currentUser]);

  // Identify Gig orders vs Project orders
  const myGigIds = useMemo(() => new Set(myGigs.map(g => g.id)), [myGigs]);

  const myGigOrders = useMemo(() => {
    return mySellerOrders.filter(o => {
      if (o.orderType === 'gig' || o.type === 'gig') return true;
      if (o.orderType === 'project' || o.type === 'project') return false;
      if (o.projectId || o.proposalId) return false;
      return Boolean(o.gigId && myGigIds.has(o.gigId)) || Boolean(o.gigId);
    });
  }, [mySellerOrders, myGigIds]);

  const myProjectOrders = useMemo(() => {
    const explicitProjectOrders = mySellerOrders.filter(
      o => o.orderType === 'project' || o.type === 'project' || Boolean(o.projectId) || Boolean(o.proposalId) || !o.gigId
    );
    if (explicitProjectOrders.length > 0) {
      return explicitProjectOrders;
    }
    return mySellerOrders;
  }, [mySellerOrders]);

  // Per-gig sold counts and last activity
  const { gigSoldCounts, lastActivityByGigId } = useMemo(() => {
    const soldMap: Record<string, number> = {};
    const activityMap: Record<string, string> = {};
    for (const gig of myGigs) {
      soldMap[gig.id] = 0;
    }
    for (const order of myGigOrders) {
      if (order.gigId && isOrderCompletedOrActive(order)) {
        soldMap[order.gigId] = (soldMap[order.gigId] || 0) + 1;
        if (order.createdAt && !activityMap[order.gigId]) {
          activityMap[order.gigId] = formatActivityDate(order.createdAt);
        }
      }
    }
    return { gigSoldCounts: soldMap, lastActivityByGigId: activityMap };
  }, [myGigs, myGigOrders]);

  // Non-deleted gigs for normal views, declined shows deleted/rejected
  const filteredGigs = useMemo(() => {
    return myGigs.filter(g => {
      if (gigSubTab === 'all') return g.status !== 'deleted';
      if (gigSubTab === 'active') return g.status === 'active';
      if (gigSubTab === 'paused') return g.status === 'paused';
      if (gigSubTab === 'pending') return g.status === 'moderation';
      if (gigSubTab === 'declined') return g.status === 'deleted' || g.moderationStatus === 'rejected';
      if (gigSubTab === 'featured') return Boolean(g.featured) && g.status !== 'deleted';
      return true;
    });
  }, [myGigs, gigSubTab]);

  // Build project activity items combining freelancer's project workstreams and proposals
  const allProjectItems = useMemo<FreelancerProjectActivityItem[]>(() => {
    if (!currentUser) return [];

    const items: FreelancerProjectActivityItem[] = [];
    const coveredProjectIds = new Set<string>();
    const coveredProposalIds = new Set<string>();

    // 1. Orders / active & completed workstreams
    myProjectOrders.forEach((order, index) => {
      if (order.projectId) coveredProjectIds.add(order.projectId);
      if (order.proposalId) coveredProposalIds.add(order.proposalId);

      const orderTitle = order.title || order.serviceTitle || '';
      const linkedProject = order.projectId
        ? projects.find(p => p.id === order.projectId)
        : projects.find(p => p.title.toLowerCase() === orderTitle.toLowerCase());

      if (linkedProject) {
        coveredProjectIds.add(linkedProject.id);
      }

      const linkedProposal = proposals.find(
        pr =>
          (order.proposalId && pr.id === order.proposalId) ||
          (linkedProject && pr.projectId === linkedProject.id && pr.freelancerId === currentUser.id)
      );
      if (linkedProposal) {
        coveredProposalIds.add(linkedProposal.id);
      }

      const buyer = users.find(u => u.id === order.buyerId);
      const isCompleted = order.status === 'completed';
      const orderAmount =
        Number(order.amount) ||
        linkedProposal?.bidAmount ||
        linkedProject?.budget ||
        linkedProject?.budgetMax ||
        0;

      items.push({
        id: `order-${order.id}`,
        title: linkedProject?.title || order.title || order.serviceTitle || 'Project Workstream',
        buyerName: buyer?.name || linkedProject?.buyerName || order.buyerUsername || 'Client',
        buyerAvatar: buyer?.avatar || linkedProject?.buyerAvatar || DEFAULT_AVATAR,
        awardedDate: formatActivityDate(order.createdAt || linkedProject?.createdAt),
        proposalAmount: linkedProposal?.bidAmount || orderAmount,
        earningsAmount: orderAmount,
        location: linkedProject?.location || 'Remote',
        refNumber: toNumericRef(order.projectId || order.id, index),
        statusCategory: isCompleted ? 'completed' : 'in_progress',
        order,
        workstreamOrderId: order.id,
        projectId: linkedProject?.id || order.projectId
      });
    });

    // 2. Proposals submitted by this freelancer that don't yet have an order
    const myProposals = proposals.filter(
      pr => pr.freelancerId === currentUser.id && !coveredProposalIds.has(pr.id)
    );

    myProposals.forEach((proposal, idx) => {
      if (proposal.projectId && coveredProjectIds.has(proposal.projectId)) return;
      if (proposal.status === 'rejected') return;

      const linkedProject = projects.find(p => p.id === proposal.projectId);
      const buyer = linkedProject ? users.find(u => u.id === linkedProject.buyerId) : undefined;

      const matchingOrder = mySellerOrders.find(
        o =>
          o.id === proposal.workstreamOrderId ||
          o.projectId === proposal.projectId ||
          o.proposalId === proposal.id ||
          (linkedProject && o.buyerId === linkedProject.buyerId)
      );

      const isAccepted =
        proposal.status === 'accepted' ||
        linkedProject?.status === 'in_progress' ||
        linkedProject?.status === 'in-progress' ||
        linkedProject?.status === 'completed';
      const isCompleted =
        linkedProject?.status === 'completed' || matchingOrder?.status === 'completed';

      const bidAmount = Number(proposal.bidAmount) || linkedProject?.budget || linkedProject?.budgetMax || 0;

      items.push({
        id: `proposal-${proposal.id}`,
        title: linkedProject?.title || `Project #${proposal.projectId}`,
        buyerName: buyer?.name || linkedProject?.buyerName || 'Client',
        buyerAvatar: buyer?.avatar || linkedProject?.buyerAvatar || DEFAULT_AVATAR,
        awardedDate: formatActivityDate(proposal.createdAt || linkedProject?.createdAt),
        proposalAmount: bidAmount,
        earningsAmount: isCompleted || isAccepted ? Number(matchingOrder?.amount ?? bidAmount) : 0,
        location: linkedProject?.location || 'Remote',
        refNumber: toNumericRef(proposal.projectId || proposal.id, idx + 100),
        statusCategory: isCompleted ? 'completed' : isAccepted ? 'in_progress' : 'pending_proposals',
        order: matchingOrder,
        workstreamOrderId: matchingOrder?.id || proposal.workstreamOrderId,
        projectId: linkedProject?.id || proposal.projectId
      });
    });

    return items;
  }, [currentUser, myProjectOrders, mySellerOrders, projects, proposals, users]);

  const filteredProjectItems = useMemo(() => {
    return allProjectItems.filter(item => {
      if (projectSubTab === 'all') return true;
      return item.statusCategory === projectSubTab;
    });
  }, [allProjectItems, projectSubTab]);

  // Separate Earnings & Summary Stats for Gigs vs Projects
  const gigStats = useMemo(() => {
    const nonDeletedGigs = myGigs.filter(g => g.status !== 'deleted');
    const postedCount = nonDeletedGigs.length;
    const activeCount = nonDeletedGigs.filter(g => g.status === 'active').length;
    const soldCount = myGigOrders.filter(isOrderCompletedOrActive).length;
    const earnings = myGigOrders
      .filter(isOrderCompletedOrActive)
      .reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

    return {
      postedCount,
      activeCount,
      soldCount,
      earnings
    };
  }, [myGigs, myGigOrders]);

  const projectStats = useMemo(() => {
    const pendingProposalsCount = allProjectItems.filter(i => i.statusCategory === 'pending_proposals').length;
    const awardedCount = allProjectItems.filter(
      i => i.statusCategory === 'in_progress' || i.statusCategory === 'completed'
    ).length;
    const inProgressCount = allProjectItems.filter(i => i.statusCategory === 'in_progress').length;
    const earnings = allProjectItems
      .filter(i => i.statusCategory === 'completed' || i.statusCategory === 'in_progress')
      .reduce((sum, i) => sum + (Number(i.earningsAmount) || 0), 0);

    return {
      pendingProposalsCount,
      awardedCount,
      inProgressCount,
      earnings
    };
  }, [allProjectItems]);

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center font-sans">
        <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
            <Briefcase className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">My Freelancer Activity</h1>
          <p className="text-slate-500 max-w-md mx-auto">
            Please log in to your account to view your projects, manage your gigs, and track your earnings.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg cursor-pointer"
          >
            Login to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Workstream navigation handler for Projects "VIEW PROGRESS"
  const handleOpenProjectWorkstream = (orderId: string, order?: Order, projectId?: string) => {
    if (order) {
      if (onOpenWorkstream) {
        onOpenWorkstream(order);
      } else {
        navigate(`/workstream/${order.id}`);
      }
      return;
    }

    if (orderId) {
      const matchedOrder = orders.find(o => o.id === orderId);
      if (matchedOrder && onOpenWorkstream) {
        onOpenWorkstream(matchedOrder);
      } else {
        navigate(`/workstream/${orderId}`);
      }
      return;
    }

    if (projectId) {
      const matchedProjectOrder = orders.find(
        o => o.projectId === projectId && o.sellerId === currentUser.id
      );
      if (matchedProjectOrder) {
        if (onOpenWorkstream) {
          onOpenWorkstream(matchedProjectOrder);
        } else {
          navigate(`/workstream/${matchedProjectOrder.id}`);
        }
        return;
      }
      navigate(`/projects/${projectId}`);
      return;
    }

    navigate('/workstream');
  };

  // Gig action handlers
  const handlePauseResume = async (gig: Gig) => {
    const nextStatus = gig.status === 'active' ? 'paused' : 'active';
    setMyGigs(prev => prev.map(g => (g.id === gig.id ? { ...g, status: nextStatus } : g)));
    setActiveDropdownId(null);
    showToast(`Gig "${gig.title}" is now ${nextStatus === 'active' ? 'Active' : 'Paused'}.`);

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-device-id': getDeviceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`/api/gigs/${gig.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: nextStatus })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to update gig status on server.');
        await fetchMyGigs();
      } else if (onRefresh) {
        onRefresh();
      }
    } catch (e) {
      console.warn('Network error updating gig status:', e);
      await fetchMyGigs();
    }
  };

  const handleOpenEdit = (gig: Gig) => {
    if (gig.status === 'deleted') {
      showToast('Deleted gigs cannot be edited.');
      return;
    }
    setEditingGig(gig);
    setActiveDropdownId(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGig) return;

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    const title = String(formData.get('title') || '').trim();
    const category = String(formData.get('category') || editingGig.category);
    const subcategory = String(formData.get('subcategory') || '');
    const price = Number(formData.get('price')) || editingGig.price;
    const deliveryDays = Number(formData.get('deliveryDays')) || editingGig.deliveryDays;
    const description = String(formData.get('description') || '').trim();
    const featured = formData.get('featured') === 'on';

    const payload = {
      title,
      category,
      subcategory,
      price,
      deliveryDays,
      description,
      featured
    };

    setMyGigs(prev =>
      prev.map(g => (g.id === editingGig.id ? { ...g, ...payload } : g))
    );
    setEditingGig(null);
    showToast('Gig details saved successfully.');

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-device-id': getDeviceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`/api/gigs/${editingGig.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to save edits on server.');
        await fetchMyGigs();
      } else if (onRefresh) {
        onRefresh();
      }
    } catch (e) {
      console.warn('Network error updating gig:', e);
      await fetchMyGigs();
    }
  };

  const handleOpenDelete = (gigId: string, title?: string) => {
    setGigToDelete({ id: gigId, title });
    setActiveDropdownId(null);
  };

  const handleConfirmDelete = async () => {
    if (!gigToDelete) return;
    const targetId = gigToDelete.id;

    setMyGigs(prev =>
      prev.map(g => (g.id === targetId ? { ...g, status: 'deleted' } : g))
    );
    setGigToDelete(null);
    if (viewingGig?.id === targetId) setViewingGig(null);
    showToast('Gig has been moved to Declined / Deleted.');

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'x-device-id': getDeviceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`/api/gigs/${targetId}`, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to delete gig on server.');
        await fetchMyGigs();
      } else if (onRefresh) {
        onRefresh();
      }
    } catch (e) {
      console.warn('Network error deleting gig:', e);
      await fetchMyGigs();
    }
  };

  const handleFeatureGig = async (gigId: string) => {
    const gig = myGigs.find(g => g.id === gigId);
    if (!gig) return;
    const nextFeatured = !gig.featured;

    setMyGigs(prev => prev.map(g => (g.id === gigId ? { ...g, featured: nextFeatured } : g)));
    showToast(`Gig "${gig.title}" ${nextFeatured ? 'featured' : 'unfeatured'}.`);

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'x-device-id': getDeviceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      await fetch(`/api/admin/gigs/${gigId}/feature`, { method: 'PATCH', headers });
      if (onRefresh) onRefresh();
    } catch (e) {
      console.warn('API feature error:', e);
    }
  };

  const handleViewGigProgress = (gig: Gig) => {
    setActiveDropdownId(null);
    const gigOrder = myGigOrders.find(o => o.gigId === gig.id);
    if (gigOrder) {
      if (onOpenWorkstream) {
        onOpenWorkstream(gigOrder);
      } else {
        navigate(`/workstream/${gigOrder.id}`);
      }
      return;
    }
    setViewingGig(gig);
  };

  const projectSubTabs: { id: ProjectSubTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending_proposals', label: 'Pending Proposals' },
    { id: 'in_progress', label: 'In progress' },
    { id: 'completed', label: 'Completed' }
  ];

  const gigSubTabs: { id: GigSubTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'paused', label: 'Paused' },
    { id: 'pending', label: 'Pending' },
    { id: 'declined', label: 'Declined' },
    { id: 'featured', label: 'Featured' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-slate-800 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main 2-Column Layout with Fiverr-aligned site styling */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Main Content Area */}
        <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
                My Freelancer Activity
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Manage your active gigs, project proposals, and escrow workstreams.
              </p>
            </div>

            {activeSection === 'gigs' && (
              <button
                onClick={() => navigate('/create-gig')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Post New Gig</span>
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
              GIGS
            </button>
          </div>

          {/* Sub-filter Navigation Bar (Fiverr Tab Bar Style) */}
          {activeSection === 'projects' ? (
            <div className="border-b border-slate-200 px-1 flex flex-wrap items-center gap-6 mb-2">
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
            <UserFreelanceProjectsList
              items={filteredProjectItems}
              freelanceSubFilter={
                projectSubTabs.find(t => t.id === projectSubTab)?.label || 'All'
              }
              onOpenWorkstream={handleOpenProjectWorkstream}
            />
          ) : loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading your gigs...
            </div>
          ) : (
            <UserFreelanceOffersList
              gigs={filteredGigs}
              freelanceSubFilter={
                gigSubTabs.find(t => t.id === gigSubTab)?.label || 'All'
              }
              soldCountsByGigId={gigSoldCounts}
              lastActivityByGigId={lastActivityByGigId}
              activeFeatureDropdownGigId={activeDropdownId}
              onToggleDropdown={(id, e) => {
                e.stopPropagation();
                setActiveDropdownId(prev => (prev === id ? null : id));
              }}
              onFeatureGig={handleFeatureGig}
              onNavigateGig={(url, e) => {
                if (e) e.preventDefault();
                navigate(url, e);
              }}
              onPauseResumeGig={handlePauseResume}
              onViewGigProgress={handleViewGigProgress}
              onEditGig={handleOpenEdit}
              onDeleteGig={handleOpenDelete}
              getGigUrl={getGigUrl}
            />
          )}
        </div>

        {/* Right Column: MY ACTIVITY SUMMARY */}
        <div className="lg:col-span-4">
          <UserActivitySummarySidebar
            activeSection={activeSection}
            totalOffers={gigStats.postedCount}
            activeOffersCount={gigStats.activeCount}
            completedOrdersCount={gigStats.soldCount}
            totalEarnings={gigStats.earnings}
            pendingProposalsCount={projectStats.pendingProposalsCount}
            awardedProjectsCount={projectStats.awardedCount}
            inProgressProjectsCount={projectStats.inProgressCount}
            projectEarnings={projectStats.earnings}
          />
        </div>
      </div>

      {/* VIEW GIG MODAL */}
      <ViewingGigModal
        viewingGig={viewingGig}
        onClose={() => setViewingGig(null)}
        onDelete={id => handleOpenDelete(id, viewingGig?.title)}
        onEdit={gig => {
          setViewingGig(null);
          handleOpenEdit(gig);
        }}
        allGigs={allGigs}
      />

      {/* EDIT GIG MODAL */}
      <EditGigModal
        editingGig={editingGig}
        categories={categories}
        onClose={() => setEditingGig(null)}
        onSave={handleSaveEdit}
        onDelete={id => {
          setEditingGig(null);
          handleOpenDelete(id, editingGig?.title);
        }}
      />

      {/* DELETE GIG MODAL */}
      <DeleteGigModal
        gigToDelete={gigToDelete}
        onClose={() => setGigToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
