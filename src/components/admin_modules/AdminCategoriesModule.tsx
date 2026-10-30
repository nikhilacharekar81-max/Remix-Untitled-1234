import React, { useState, useMemo } from 'react';
import {
  Sliders, Search, Plus, Edit2, Trash2, CheckCircle2, ChevronRight,
  FolderTree, Layers, Globe, Eye, X, Check, RefreshCw, FolderPlus,
  ArrowRight, FileText, ChevronDown, AlertTriangle
} from 'lucide-react';
import { PPH_CATEGORIES } from '../HeaderCategoriesNav';

interface SubcategoryItem {
  id: string;
  name: string;
  slug: string;
  servicesCount: number;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: 'active' | 'archived';
  subcategories: SubcategoryItem[];
}

interface AdminCategoriesModuleProps {
  initialCategories?: CategoryItem[];
}

export const AdminCategoriesModule: React.FC<AdminCategoriesModuleProps> = ({
  initialCategories
}) => {
  // Local state initialized with PeoplePerHour taxonomy or stored state
  const [categories, setCategories] = useState<CategoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('workperhour_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Error reading categories from localStorage", e);
    }
    if (initialCategories && initialCategories.length > 0) return initialCategories;
    return PPH_CATEGORIES.map((cat, idx) => ({
      id: `cat_${idx + 1}`,
      name: cat.name,
      slug: cat.slug,
      status: 'active',
      description: `All professional freelance services and subtopics in ${cat.name}.`,
      subcategories: cat.subcategories.map((sub, sIdx) => ({
        id: `sub_${idx + 1}_${sIdx + 1}`,
        name: sub.name,
        slug: sub.slug,
        servicesCount: Math.floor(180 + (sIdx * 35) + (idx * 22))
      }))
    }));
  });;

  // Automatically sync categories changes to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('workperhour_categories', JSON.stringify(categories));
    } catch (e) {
      console.error("Error saving categories to localStorage", e);
    }
  }, [categories]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>(categories[0]?.id || 'cat_1');

  // Modals
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryItem | null>(null);
  const [deleteConfirmCat, setDeleteConfirmCat] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmSub, setDeleteConfirmSub] = useState<{ catId: string; subId: string; name: string } | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Subcategory Add/Edit Modal
  const [isAddSubModalOpen, setIsAddSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<{ catId: string; sub: SubcategoryItem } | null>(null);
  const [subName, setSubName] = useState('');
  const [subSlug, setSubSlug] = useState('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const totalCategories = categories.length;
    const totalSubcategories = categories.reduce((sum, c) => sum + c.subcategories.length, 0);
    const totalServices = categories.reduce(
      (sum, c) => sum + c.subcategories.reduce((sSum, s) => sSum + s.servicesCount, 0),
      0
    );
    const activeCategories = categories.filter(c => c.status === 'active').length;
    return { totalCategories, totalSubcategories, totalServices, activeCategories };
  }, [categories]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return categories.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.subcategories.some(s => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
    );
  }, [categories, searchQuery]);

  const activeCategory = useMemo(() => {
    return categories.find(c => c.id === selectedCatId) || categories[0];
  }, [categories, selectedCatId]);

  // Handlers for Categories
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const slug = newCatSlug.trim() || newCatName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (editingCat) {
      setCategories(prev => prev.map(c => c.id === editingCat.id ? {
        ...c,
        name: newCatName.trim(),
        slug,
        description: newCatDesc.trim() || c.description
      } : c));
      showToast(`Category "${newCatName}" updated.`);
    } else {
      const newCat: CategoryItem = {
        id: `cat_${Date.now()}`,
        name: newCatName.trim(),
        slug,
        description: newCatDesc.trim() || `Explore freelance offerings in ${newCatName.trim()}.`,
        status: 'active',
        subcategories: []
      };
      setCategories(prev => [...prev, newCat]);
      setSelectedCatId(newCat.id);
      showToast(`Category "${newCatName}" created successfully.`);
    }

    setIsAddCatModalOpen(false);
    setEditingCat(null);
    setNewCatName('');
    setNewCatSlug('');
    setNewCatDesc('');
  };

  const executeDeleteCategory = (catId: string, name: string) => {
    setCategories(prev => prev.filter(c => c.id !== catId));
    if (selectedCatId === catId && categories.length > 1) {
      const remaining = categories.filter(c => c.id !== catId);
      setSelectedCatId(remaining[0].id);
    }
    showToast(`Category "${name}" removed from platform taxonomy.`);
  };

  // Handlers for Subcategories
  const handleSaveSubcategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim() || !activeCategory) return;

    const slug = subSlug.trim() || subName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (editingSub) {
      setCategories(prev => prev.map(c => {
        if (c.id === editingSub.catId) {
          return {
            ...c,
            subcategories: c.subcategories.map(s => s.id === editingSub.sub.id ? {
              ...s,
              name: subName.trim(),
              slug
            } : s)
          };
        }
        return c;
      }));
      showToast(`Subcategory "${subName}" updated.`);
    } else {
      const newSub: SubcategoryItem = {
        id: `sub_${Date.now()}`,
        name: subName.trim(),
        slug,
        servicesCount: 0
      };
      setCategories(prev => prev.map(c => {
        if (c.id === activeCategory.id) {
          return {
            ...c,
            subcategories: [...c.subcategories, newSub]
          };
        }
        return c;
      }));
      showToast(`Subcategory "${subName}" added to ${activeCategory.name}.`);
    }

    setIsAddSubModalOpen(false);
    setEditingSub(null);
    setSubName('');
    setSubSlug('');
  };

  const executeDeleteSubcategory = (catId: string, subId: string, name: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id === catId) {
        return {
          ...c,
          subcategories: c.subcategories.filter(s => s.id !== subId)
        };
      }
      return c;
    }));
    showToast(`Subcategory "${name}" deleted.`);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Sliders className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Taxonomy, Categories & Slugs</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage the PeoplePerHour 2-tier marketplace taxonomy tree, configure canonical SEO slugs, and organize gig topics.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingCat(null);
            setNewCatName('');
            setNewCatSlug('');
            setNewCatDesc('');
            setIsAddCatModalOpen(true);
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Main Category</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Main Categories</span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.totalCategories}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">{metrics.activeCategories} published in header nav</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Subcategories / Topics</span>
            <FolderTree className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-600">{metrics.totalSubcategories}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Fine-grained search filters</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Indexed Services</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.totalServices.toLocaleString()}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Mapped gigs and RFP projects</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Canonical SEO Slugs</span>
            <Globe className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">100% Valid</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Auto-generated clean URLs</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search categories, subcategories, or slugs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white"
          />
        </div>
      </div>

      {/* 2-Column Split: Categories on left, Subcategories table on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Categories List */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 shadow-2xs p-4 space-y-2 max-h-[680px] overflow-y-auto">
          <div className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Primary Taxonomy</span>
            <span>{filteredCategories.length} Categories</span>
          </div>

          <div className="space-y-1.5">
            {filteredCategories.map((c) => {
              const isSelected = c.id === selectedCatId;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCatId(c.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 shadow-2xs font-bold'
                      : 'border-slate-100 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="text-xs font-bold truncate flex items-center gap-1.5">
                      <span>{c.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                      /categories/{c.slug}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-full text-[10px] text-slate-600 font-mono font-bold">
                      {c.subcategories.length}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCat(c);
                        setNewCatName(c.name);
                        setNewCatSlug(c.slug);
                        setNewCatDesc(c.description || '');
                        setIsAddCatModalOpen(true);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-800 rounded transition"
                      title="Edit Category"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmCat({ id: c.id, name: c.name });
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                      title="Delete Category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Subcategories Table for Selected Category */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 space-y-4">
          {activeCategory ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{activeCategory.name}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active Canonical
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    URL Pattern: <code className="font-mono text-emerald-700 font-semibold">/categories/{activeCategory.slug}</code>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingSub(null);
                    setSubName('');
                    setSubSlug('');
                    setIsAddSubModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer self-start sm:self-auto"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Add Subcategory</span>
                </button>
              </div>

              {/* Subcategories Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3">Subcategory Name</th>
                      <th className="py-3 px-3">SEO Route Slug</th>
                      <th className="py-3 px-3">Services Count</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {activeCategory.subcategories.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-slate-400">
                          No subcategories in this category yet. Click "Add Subcategory" to create one.
                        </td>
                      </tr>
                    ) : (
                      activeCategory.subcategories.map((sub) => (
                        <tr key={sub.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3 font-bold text-slate-900">{sub.name}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-emerald-700">
                            /categories/{sub.slug}
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-mono font-bold">
                            {sub.servicesCount} Gigs
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSub({ catId: activeCategory.id, sub });
                                  setSubName(sub.name);
                                  setSubSlug(sub.slug);
                                  setIsAddSubModalOpen(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                title="Edit Subcategory"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmSub({ catId: activeCategory.id, subId: sub.id, name: sub.name })}
                                className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                title="Delete Subcategory"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">Select a category on the left to view subcategories.</div>
          )}
        </div>
      </div>

      {/* Add / Edit Category Modal */}
      {isAddCatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {editingCat ? 'Edit Main Category' : 'Create Main Category'}
              </h3>
              <button
                onClick={() => setIsAddCatModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Artificial Intelligence & Robotics"
                  value={newCatName}
                  onChange={(e) => {
                    setNewCatName(e.target.value);
                    if (!editingCat) {
                      setNewCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                    }
                  }}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                  Canonical Slug (URL Friendly)
                </label>
                <input
                  type="text"
                  placeholder="e.g. artificial-intelligence-robotics"
                  value={newCatSlug}
                  onChange={(e) => setNewCatSlug(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                  Description / SEO Meta Summary
                </label>
                <textarea
                  rows={2}
                  placeholder="Short description for search discovery..."
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCatModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
                >
                  {editingCat ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Subcategory Modal */}
      {isAddSubModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {editingSub ? 'Edit Subcategory' : `Add Subcategory to ${activeCategory.name}`}
              </h3>
              <button
                onClick={() => setIsAddSubModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubcategory} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                  Subcategory Topic Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Next.js & React Applications"
                  value={subName}
                  onChange={(e) => {
                    setSubName(e.target.value);
                    if (!editingSub) {
                      setSubSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                    }
                  }}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-indigo-600 focus:bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                  Subcategory Route Slug
                </label>
                <input
                  type="text"
                  placeholder="e.g. react-applications"
                  value={subSlug}
                  onChange={(e) => setSubSlug(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-indigo-600 focus:bg-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSubModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
                >
                  {editingSub ? 'Save Subcategory' : 'Add to Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CATEGORY CONFIRMATION MODAL */}
      {deleteConfirmCat && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Delete Main Category?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete category <span className="font-bold text-slate-800">"{deleteConfirmCat.name}"</span> and all associated subcategories? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmCat(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const cat = deleteConfirmCat;
                  setDeleteConfirmCat(null);
                  executeDeleteCategory(cat.id, cat.name);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer"
              >
                Yes, Delete Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE SUBCATEGORY CONFIRMATION MODAL */}
      {deleteConfirmSub && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Delete Subcategory?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete subcategory <span className="font-bold text-slate-800">"{deleteConfirmSub.name}"</span>?
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmSub(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const sub = deleteConfirmSub;
                  setDeleteConfirmSub(null);
                  executeDeleteSubcategory(sub.catId, sub.subId, sub.name);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer"
              >
                Yes, Delete Subcategory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
