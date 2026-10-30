import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers, Search, Filter, Star, Eye, Edit2, Trash2, CheckCircle2,
  AlertTriangle, Clock, X, Check, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, DollarSign, Sparkles, Ban, Settings, ShieldCheck, ExternalLink,
  PlusCircle, Download, CheckSquare, Square, ChevronDown, Play, Pause
} from 'lucide-react';
import { Gig, UserAccount } from '../../types';
import { DEFAULT_AVATAR, DEFAULT_GIG_IMAGE } from '../../constants';

interface AdminGigsModuleProps {
  allGigs?: Gig[];
  allUsers?: UserAccount[];
  onUpdateGigStatus?: (gigId: string, status: Gig['status']) => void;
  onToggleFeatured?: (gigId: string, featured: boolean) => void;
  onDeleteGig?: (gigId: string) => void;
  onCreateGig?: (newGig: any) => void;
}

export const AdminGigsModule: React.FC<AdminGigsModuleProps> = ({
  allGigs = [],
  allUsers = [],
  onUpdateGigStatus,
  onToggleFeatured,
  onDeleteGig,
  onCreateGig
}) => {
  const effectiveGigs = allGigs || [];
  const effectiveUsers = allUsers || [];

  const [gigs, setGigs] = useState<Gig[]>(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_gigs') || '[]').map((d: any) => String(d));
      return (effectiveGigs || []).filter(g => !deletedIds.includes(String(g.id)));
    } catch {
      return effectiveGigs || [];
    }
  });

  useEffect(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_gigs') || '[]').map((d: any) => String(d));
      const source = allGigs || [];
      setGigs((source || []).filter(g => !deletedIds.includes(String(g.id))));
    } catch {
      const source = allGigs || [];
      setGigs(source || []);
    }
  }, [allGigs]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'moderation' | 'deleted'>('all');
  const [featuredFilter, setFeaturedFilter] = useState<'all' | 'featured' | 'standard'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'price_desc' | 'rating_desc'>('newest');

  // Selection & Bulk Actions
  const [selectedGigIds, setSelectedGigIds] = useState<string[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  // Modals & Feedback
  const [inspectingGig, setInspectingGig] = useState<Gig | null>(null);
  const [editingGig, setEditingGig] = useState<Gig | null>(null);
  const [deleteConfirmGig, setDeleteConfirmGig] = useState<Gig | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [editGigForm, setEditGigForm] = useState({
    title: '',
    category: '',
    subcategory: '',
    description: '',
    price: 0,
    deliveryDays: 1,
    status: 'active' as Gig['status'],
    featured: false
  });
  const [moderatingGig, setModeratingGig] = useState<Gig | null>(null);
  const [moderationDecision, setModerationDecision] = useState<'approved' | 'flagged' | 'rejected'>('approved');
  const [modNote, setModNote] = useState('');
  
  // Admin Create Gig Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Development & IT');
  const [newPrice, setNewPrice] = useState(450);
  const [newDelivery, setNewDelivery] = useState(5);
  const [newDesc, setNewDesc] = useState('');
  const [selectedSellerId, setSelectedSellerId] = useState(effectiveUsers[0]?.id || 'user_1');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const totalGigs = gigs.length;
    const activeGigs = gigs.filter(g => g.status === 'active').length;
    const pausedGigs = gigs.filter(g => g.status === 'paused').length;
    const moderationGigs = gigs.filter(g => g.status === 'moderation').length;
    const deletedGigs = gigs.filter(g => g.status === 'deleted').length;
    return { totalGigs, activeGigs, pausedGigs, moderationGigs, deletedGigs };
  }, [gigs]);

  const uniqueCategories = useMemo(() => {
    const set = new Set(gigs.map(g => g.category));
    return Array.from(set);
  }, [gigs]);

  // Filtered Gigs
  const filteredGigs = useMemo(() => {
    return gigs.filter(g => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        g.id.toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q) ||
        g.freelancerName.toLowerCase().includes(q) ||
        (g.freelancerUsername || '').toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q);
      const matchesCat = categoryFilter === 'all' || g.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || g.status === statusFilter;
      const matchesFeatured =
        featuredFilter === 'all' ? true :
        featuredFilter === 'featured' ? g.featured :
        !g.featured;

      return matchesSearch && matchesCat && matchesStatus && matchesFeatured;
    }).sort((a, b) => {
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'rating_desc') return b.rating - a.rating;
      return (b.reviewsCount || 0) - (a.reviewsCount || 0);
    });
  }, [gigs, searchQuery, categoryFilter, statusFilter, featuredFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredGigs.length / pageSize));
  const paginatedGigs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGigs.slice(start, start + pageSize);
  }, [filteredGigs, currentPage, pageSize]);

  // Handlers
  const handleToggleFeaturedClick = async (gig: Gig) => {
    const nextState = !gig.featured;
    setGigs(prev => prev.map(g => g.id === gig.id ? { ...g, featured: nextState } : g));
    if (onToggleFeatured) onToggleFeatured(gig.id, nextState);
    showToast(`Gig #${gig.id} ${nextState ? 'featured on marketplace ($10 fee applied)' : 'removed from featured spot'}.`);
    
    try {
      await fetch(`/api/admin/gigs/${gig.id}/feature`, { method: 'PATCH' });
    } catch (e) {
      console.warn('API sync error:', e);
    }
  };

  const handleStatusToggle = async (gig: Gig) => {
    const nextStatus = gig.status === 'paused' ? 'active' : 'paused';
    setGigs(prev => prev.map(g => g.id === gig.id ? { ...g, status: nextStatus } : g));
    if (onUpdateGigStatus) onUpdateGigStatus(gig.id, nextStatus);
    showToast(`Gig #${gig.id} status changed to ${nextStatus.toUpperCase()}.`);

    try {
      await fetch(`/api/admin/gigs/${gig.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
    } catch (e) {
      console.warn('API sync error:', e);
    }
  };

  const executeDeleteGig = async (id: string, title?: string) => {
    const targetId = String(id);
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_gigs') || '[]').map((d: any) => String(d));
      if (!deletedIds.includes(targetId)) {
        deletedIds.push(targetId);
        localStorage.setItem('workperhour_deleted_gigs', JSON.stringify(deletedIds));
      }
    } catch {}

    setGigs(prev => prev.filter(g => String(g.id) !== targetId));
    if (onDeleteGig) onDeleteGig(id);
    showToast(`Service listing permanently deleted.`);

    try {
      await fetch(`/api/admin/gigs/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('API delete error:', e);
    }
  };

  const handleBulkFeature = () => {
    if (selectedGigIds.length === 0) return;
    setGigs(prev => prev.map(g => selectedGigIds.includes(g.id) ? { ...g, featured: true } : g));
    showToast(`Successfully pinned ${selectedGigIds.length} gigs as featured.`);
    setSelectedGigIds([]);
  };

  const handleBulkPause = () => {
    if (selectedGigIds.length === 0) return;
    setGigs(prev => prev.map(g => selectedGigIds.includes(g.id) ? { ...g, status: 'paused' } : g));
    showToast(`Successfully paused ${selectedGigIds.length} gigs.`);
    setSelectedGigIds([]);
  };

  const executeBulkDelete = async () => {
    if (selectedGigIds.length === 0) return;

    const idsToRemove = selectedGigIds.map(id => String(id));
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_gigs') || '[]').map((d: any) => String(d));
      for (const idStr of idsToRemove) {
        if (!deletedIds.includes(idStr)) deletedIds.push(idStr);
      }
      localStorage.setItem('workperhour_deleted_gigs', JSON.stringify(deletedIds));
    } catch {}

    setGigs(prev => prev.filter(g => !idsToRemove.includes(String(g.id))));
    if (onDeleteGig) {
      selectedGigIds.forEach(id => onDeleteGig(id));
    }
    showToast(`Successfully deleted ${idsToRemove.length} gigs.`);

    for (const id of selectedGigIds) {
      try {
        await fetch(`/api/admin/gigs/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.warn('API delete error:', e);
      }
    }

    setSelectedGigIds([]);
    setIsBulkDeleteModalOpen(false);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Title', 'Freelancer', 'Category', 'Price (USD)', 'Delivery Days', 'Rating', 'Status', 'Featured'];
    const rows = filteredGigs.map(g => [
      g.id,
      `"${g.title.replace(/"/g, '""')}"`,
      `"${g.freelancerName}"`,
      g.category,
      g.price,
      g.deliveryDays,
      g.rating || 5.0,
      g.status,
      g.featured ? 'Yes' : 'No'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `workperhour_gigs_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Gig listings exported to CSV successfully.');
  };

  const handleOpenEditModal = (g: Gig) => {
    setEditingGig(g);
    setEditGigForm({
      title: g.title || '',
      category: g.category || 'Development & IT',
      subcategory: g.subcategory || '',
      description: g.description || '',
      price: g.price || 0,
      deliveryDays: g.deliveryDays || 1,
      status: g.status || 'active',
      featured: !!g.featured
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGig) return;
    try {
      const res = await fetch(`/api/admin/gigs/${editingGig.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editGigForm)
      });
      const updated = await res.json();
      setGigs(prev => prev.map(g => g.id === editingGig.id ? updated : g));
      setEditingGig(null);
      showToast(`Gig updated successfully!`);
    } catch (err) {
      console.error(err);
      setGigs(prev => prev.map(g => g.id === editingGig.id ? { ...g, ...editGigForm } : g));
      setEditingGig(null);
      showToast(`Gig updated locally.`);
    }
  };

  const handleSaveModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moderatingGig) return;
    try {
      await fetch(`/api/admin/gigs/${moderatingGig.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moderationStatus: moderationDecision,
          moderationNotes: modNote
        })
      });
      setGigs(prev => prev.map(g => g.id === moderatingGig.id ? { ...g, moderationStatus: moderationDecision, moderationNotes: modNote } : g));
      setModeratingGig(null);
      setModNote('');
      showToast(`Moderation verdict recorded.`);
    } catch (err) {
      console.error(err);
      setModeratingGig(null);
    }
  };

  const handleAdminCreateGig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const seller = allUsers.find(u => u.id === selectedSellerId) || allUsers[0] || { id: 'user_1', name: 'Alex Rivera', avatar: '' };
    
    const newGigObj = {
      id: 'gig_' + Date.now(),
      freelancerId: seller.id,
      freelancerName: seller.name,
      freelancerAvatar: seller.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
      title: newTitle,
      category: newCategory,
      description: newDesc || 'Admin published service offer.',
      price: Number(newPrice),
      deliveryDays: Number(newDelivery),
      rating: 5.0,
      reviewsCount: 0,
      image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=500&fit=crop',
      status: 'active' as const,
      featured: false,
      moderationStatus: 'approved' as const
    };

    setGigs(prev => [newGigObj, ...prev]);
    if (onCreateGig) onCreateGig(newGigObj);
    setIsCreateModalOpen(false);
    setNewTitle('');
    setNewDesc('');
    showToast('New service gig successfully published by Administrator.');

    try {
      await fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGigObj)
      });
    } catch (e) {
      console.warn('API sync error:', e);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-800 animate-in slide-in-from-bottom duration-200 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Services & Gigs Management</h2>
            <p className="text-xs text-slate-500">Monitor freelancer service offers, audit pricing, pin featured listings, and execute content moderation.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Create New Gig</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Services</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{metrics.totalGigs}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Active Gigs</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{metrics.activeGigs}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">Paused Gigs</span>
          <div className="text-2xl font-bold text-amber-700 mt-1">{metrics.pausedGigs}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Under Moderation</span>
          <div className="text-2xl font-bold text-blue-700 mt-1">{metrics.moderationGigs}</div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-rose-600 tracking-wider">Deleted</span>
          <div className="text-2xl font-bold text-rose-700 mt-1">{metrics.deletedGigs}</div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search title, seller, ID, category..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-emerald-600"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <option value="all">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="moderation">Under Moderation</option>
            <option value="deleted">Deleted</option>
          </select>

          <select
            value={featuredFilter}
            onChange={(e) => { setFeaturedFilter(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <option value="all">All Features</option>
            <option value="featured">Featured Only</option>
            <option value="standard">Standard Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-xs text-slate-400 font-medium">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-emerald-600 cursor-pointer"
          >
            <option value="newest">Most Popular</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="rating_desc">Highest Rated</option>
          </select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedGigIds.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-center justify-between text-xs text-indigo-900 animate-in fade-in duration-150">
          <div className="font-bold flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">{selectedGigIds.length}</span>
            <span>Gigs Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleBulkFeature} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg cursor-pointer">Pin as Featured</button>
            <button type="button" onClick={handleBulkPause} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer">Pause Selected</button>
            <button type="button" onClick={() => setIsBulkDeleteModalOpen(true)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg cursor-pointer">Delete Selected</button>
            <button type="button" onClick={() => setSelectedGigIds([])} className="px-2 py-1 text-slate-500 hover:underline">Clear</button>
          </div>
        </div>
      )}

      {/* Gigs Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3.5 px-4 w-10">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedGigIds.length === paginatedGigs.length) setSelectedGigIds([]);
                      else setSelectedGigIds(paginatedGigs.map(g => g.id));
                    }}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {selectedGigIds.length > 0 && selectedGigIds.length === paginatedGigs.length ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="py-3.5 px-4">Service Offer</th>
                <th className="py-3.5 px-4">Seller / Freelancer</th>
                <th className="py-3.5 px-4">Category & Subtopic</th>
                <th className="py-3.5 px-4">Price & Delivery</th>
                <th className="py-3.5 px-4">Rating / Sales</th>
                <th className="py-3.5 px-4">Status & Featured</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {paginatedGigs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                    No service listings matching your search or filters.
                  </td>
                </tr>
              ) : (
                paginatedGigs.map(g => {
                  const isChecked = selectedGigIds.includes(g.id);
                  return (
                    <tr key={g.id} className="hover:bg-slate-50/60 transition group">
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGigIds(prev => isChecked ? prev.filter(id => id !== g.id) : [...prev, g.id]);
                          }}
                          className="text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>

                      {/* Service Offer */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex items-center gap-3">
                          <img
                            src={g.image || DEFAULT_GIG_IMAGE}
                            alt=""
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE; }}
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 group-hover:text-emerald-600 transition line-clamp-1">
                              {g.title}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">ID: #{g.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Seller */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <img
                            src={g.freelancerAvatar || DEFAULT_AVATAR}
                            alt={g.freelancerName}
                            className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                          />
                          <div>
                            <div className="font-bold text-slate-900 leading-tight">{g.freelancerName}</div>
                            <div className="text-[10px] text-slate-400">{g.freelancerLevel || 'PRO FREELANCER'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{g.category}</div>
                        <div className="text-[11px] text-slate-400">{g.subcategory || 'General'}</div>
                      </td>

                      {/* Price & Delivery */}
                      <td className="py-3.5 px-4 font-mono">
                        <span className="font-bold text-emerald-600 text-sm">
                          ${g.price} USD
                        </span>
                        <div className="text-[10.5px] text-slate-400 font-sans">
                          {g.deliveryDays} Days Delivery
                        </div>
                      </td>

                      {/* Rating / Sales */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 font-bold text-slate-900">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>{(g.rating || 5.0).toFixed(1)}</span>
                          <span className="text-slate-400 text-[10.5px] font-normal">({g.reviewsCount || 12})</span>
                        </div>
                      </td>

                      {/* Status & Featured Badge */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {g.status === 'active' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block">
                              Active
                            </span>
                          )}
                          {g.status === 'paused' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-block">
                              Paused
                            </span>
                          )}
                          {g.status === 'moderation' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 inline-block">
                              Under Moderation
                            </span>
                          )}
                          {g.status === 'deleted' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-block">
                              Deleted
                            </span>
                          )}

                          {g.featured && (
                            <div>
                              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5 fill-amber-500" /> Featured ($10)
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right relative">
                        <button
                          type="button"
                          onClick={() => setOpenDropdownId(openDropdownId === g.id ? null : g.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition inline-flex items-center gap-1.5 ml-auto cursor-pointer"
                        >
                          <span>Actions</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {openDropdownId === g.id && (
                          <div className="absolute right-4 top-12 z-50 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 text-left text-xs divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
                            <div className="py-1 px-1">
                              <button
                                type="button"
                                onClick={() => { setInspectingGig(g); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>Inspect Listing</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => { handleToggleFeaturedClick(g); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                <span>{g.featured ? 'Remove Featured' : 'Pin Featured ($10)'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => { handleOpenEditModal(g); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-indigo-600 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <Settings className="w-3.5 h-3.5" />
                                <span>Edit Gig</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setModeratingGig(g);
                                  setModerationDecision(g.moderationStatus === 'approved' ? 'approved' : 'flagged');
                                  setModNote(g.moderationNotes || '');
                                  setOpenDropdownId(null);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-purple-600 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Moderate Listing</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => { handleStatusToggle(g); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                {g.status === 'paused' ? <Play className="w-3.5 h-3.5 text-emerald-600" /> : <Pause className="w-3.5 h-3.5 text-amber-600" />}
                                <span>{g.status === 'paused' ? 'Resume Gig (Active)' : 'Pause Gig'}</span>
                              </button>
                            </div>
                            <div className="py-1 px-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmGig(g);
                                  setOpenDropdownId(null);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-rose-50 text-rose-600 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Listing</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="py-3.5 px-4 bg-slate-50/75 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-700">{filteredGigs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * pageSize, filteredGigs.length)}</span> of <span className="font-semibold text-slate-700">{filteredGigs.length}</span> service offers
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <span className="font-semibold text-slate-700 px-2">Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* INSPECT GIG MODAL WITH ANALYTICS & HEALTH SCORE */}
      {inspectingGig && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Service Listing Inspection & Analytics</span>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">{inspectingGig.title}</h3>
                <span className="text-xs text-slate-400 font-mono">ID: #{inspectingGig.id}</span>
              </div>
              <button
                type="button"
                onClick={() => setInspectingGig(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <img 
                src={inspectingGig.image || DEFAULT_GIG_IMAGE} 
                className="w-full h-52 rounded-2xl object-cover border border-slate-200" 
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_GIG_IMAGE; }}
              />
              <div className="space-y-3 text-xs">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Seller Information</span>
                  <div className="font-bold text-slate-900 text-sm mt-1">{inspectingGig.freelancerName}</div>
                  <div className="text-slate-500">{inspectingGig.freelancerLevel || 'Top Rated'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Price</span>
                    <div className="font-bold text-emerald-600 text-sm mt-0.5">${inspectingGig.price} USD</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Delivery</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">{inspectingGig.deliveryDays} Days</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Analytics Scorecard */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Performance Analytics & Health Score</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-slate-400 text-[10px] font-bold uppercase">Total Views</div>
                  <div className="text-base font-bold text-slate-900 font-mono mt-0.5">1,482</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-slate-400 text-[10px] font-bold uppercase">Inquiries</div>
                  <div className="text-base font-bold text-indigo-600 font-mono mt-0.5">46</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-slate-400 text-[10px] font-bold uppercase">Completed Orders</div>
                  <div className="text-base font-bold text-emerald-600 font-mono mt-0.5">{inspectingGig.reviewsCount || 18}</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-slate-400 text-[10px] font-bold uppercase">Health Score</div>
                  <div className="text-base font-bold text-emerald-700 font-mono mt-0.5">98/100</div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
              <span className="text-[10px] text-slate-400 font-bold block uppercase">Full Description</span>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{inspectingGig.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* EDIT GIG MODAL */}
      {editingGig && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Edit Service Listing</h3>
              <button type="button" onClick={() => setEditingGig(null)} className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">✕ Close</button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Gig Title</label>
                <input
                  type="text"
                  value={editGigForm.title}
                  onChange={(e) => setEditGigForm({ ...editGigForm, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-emerald-600 font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price ($ USD)</label>
                  <input
                    type="number"
                    value={editGigForm.price}
                    onChange={(e) => setEditGigForm({ ...editGigForm, price: Number(e.target.value) })}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Delivery Days</label>
                  <input
                    type="number"
                    value={editGigForm.deliveryDays}
                    onChange={(e) => setEditGigForm({ ...editGigForm, deliveryDays: Number(e.target.value) })}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={4}
                  value={editGigForm.description}
                  onChange={(e) => setEditGigForm({ ...editGigForm, description: e.target.value })}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingGig(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-sm cursor-pointer">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN CREATE GIG MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Publish New Service Gig (Admin)</h3>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">✕ Close</button>
            </div>
            <form onSubmit={handleAdminCreateGig} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Seller / Freelancer</label>
                <select
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold cursor-pointer"
                >
                  {allUsers.filter(u => u.role !== 'admin').map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Gig Title</label>
                <input
                  type="text"
                  placeholder="I will build a production React web application..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-emerald-600 font-medium"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 cursor-pointer"
                  >
                    <option value="Development & IT">Development & IT</option>
                    <option value="AI & Data">AI & Data</option>
                    <option value="Design & Creative">Design & Creative</option>
                    <option value="Mobile Apps">Mobile Apps</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price ($)</label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Delivery Days</label>
                  <input
                    type="number"
                    value={newDelivery}
                    onChange={(e) => setNewDelivery(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={4}
                  placeholder="Detailed service deliverables and tech stack..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-sm cursor-pointer">Publish Gig</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODERATE GIG MODAL */}
      {moderatingGig && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Moderate Service Listing</h3>
              <button type="button" onClick={() => setModeratingGig(null)} className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">✕ Close</button>
            </div>
            <form onSubmit={handleSaveModeration} className="space-y-4 text-xs">
              <div>
                <span className="text-slate-400 block font-bold mb-1">Gig:</span>
                <span className="font-bold text-slate-900">{moderatingGig.title}</span>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Moderation Verdict</label>
                <select
                  value={moderationDecision}
                  onChange={(e) => setModerationDecision(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold cursor-pointer"
                >
                  <option value="approved">✓ Approved (Complies with Policy)</option>
                  <option value="flagged">⚠ Flagged for Warning</option>
                  <option value="rejected">✕ Rejected (Policy Violation)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Moderator Notes</label>
                <textarea
                  rows={3}
                  placeholder="Provide audit notes or reason for moderation..."
                  value={modNote}
                  onChange={(e) => setModNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModeratingGig(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-sm cursor-pointer">Save Verdict</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SINGLE DELETE CONFIRMATION MODAL */}
      {deleteConfirmGig && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Delete Service Offer?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete service listing <span className="font-semibold text-slate-800">"{deleteConfirmGig.title}"</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmGig(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = deleteConfirmGig;
                  setDeleteConfirmGig(null);
                  executeDeleteGig(target.id, target.title);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer"
              >
                Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Delete Selected Services?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete <span className="font-bold text-slate-800">{selectedGigIds.length}</span> selected service listings? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeBulkDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer"
              >
                Yes, Delete All Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
