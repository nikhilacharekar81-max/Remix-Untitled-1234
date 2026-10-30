import React, { useState, useMemo } from 'react';
import {
  FileCode, Plus, Search, Filter, Eye, Edit, Trash2, CheckCircle2,
  Clock, X, Check, RefreshCw, ChevronLeft, ChevronRight, Globe,
  BookOpen, Megaphone, ShieldAlert, Award, FileText, User, Tag,
  ExternalLink, Layers, ArrowUpRight, BarChart2
} from 'lucide-react';
import { DEFAULT_AVATAR } from '../../constants';

export type CmsCategory = 'announcement' | 'help_faq' | 'platform_policy' | 'guide' | 'legal';
export type CmsStatus = 'published' | 'draft' | 'scheduled' | 'archived';

export interface CmsArticle {
  id: string;
  title: string;
  slug: string;
  category: CmsCategory;
  targetAudience: 'all' | 'freelancers' | 'clients';
  excerpt: string;
  content: string;
  authorName: string;
  authorAvatar: string;
  status: CmsStatus;
  viewsCount: number;
  featured: boolean;
  publishedAt: string;
  updatedAt: string;
}

interface AdminCmsModuleProps {
  initialArticles?: CmsArticle[];
  onSaveArticle?: (article: CmsArticle) => void;
  onDeleteArticle?: (id: string) => void;
}

export const AdminCmsModule: React.FC<AdminCmsModuleProps> = ({
  initialArticles,
  onSaveArticle,
  onDeleteArticle
}) => {
  const [articles, setArticles] = useState<CmsArticle[]>(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_cms_articles') || '[]');
      return (initialArticles || []).filter(a => !deletedIds.includes(a.id));
    } catch {
      return initialArticles || [];
    }
  });

  React.useEffect(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_cms_articles') || '[]');
      setArticles((initialArticles || []).filter(a => !deletedIds.includes(a.id)));
    } catch {
      setArticles(initialArticles || []);
    }
  }, [initialArticles]);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | CmsCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CmsStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Modals state
  const [editingArticle, setEditingArticle] = useState<CmsArticle | null>(null);
  const [previewingArticle, setPreviewingArticle] = useState<CmsArticle | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Form State for Create/Edit
  const [formData, setFormData] = useState<Partial<CmsArticle>>({
    title: '',
    slug: '',
    category: 'announcement',
    targetAudience: 'all',
    excerpt: '',
    content: '',
    status: 'draft',
    featured: false
  });

  // Filtered Articles
  const filteredArticles = useMemo(() => {
    return articles.filter(article => {
      const matchesSearch =
        article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.slug.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCat = categoryFilter === 'all' || article.category === categoryFilter;
      const matchesStat = statusFilter === 'all' || article.status === statusFilter;

      return matchesSearch && matchesCat && matchesStat;
    });
  }, [articles, searchTerm, categoryFilter, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredArticles.length / itemsPerPage) || 1;
  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredArticles.slice(start, start + itemsPerPage);
  }, [filteredArticles, currentPage, itemsPerPage]);

  // Stats
  const stats = useMemo(() => {
    const published = articles.filter(a => a.status === 'published').length;
    const drafts = articles.filter(a => a.status === 'draft').length;
    const announcements = articles.filter(a => a.category === 'announcement' && a.status === 'published').length;
    const totalViews = articles.reduce((sum, a) => sum + a.viewsCount, 0);
    return { published, drafts, announcements, totalViews };
  }, [articles]);

  const handleOpenCreateModal = () => {
    setFormData({
      title: '',
      slug: '',
      category: 'announcement',
      targetAudience: 'all',
      excerpt: '',
      content: '',
      status: 'draft',
      featured: false
    });
    setIsCreatingNew(true);
  };

  const handleOpenEditModal = (article: CmsArticle) => {
    setFormData({ ...article });
    setEditingArticle(article);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    const generatedSlug = formData.slug || formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (isCreatingNew) {
      const newArticle: CmsArticle = {
        id: `cms_${Date.now()}`,
        title: formData.title || 'Untitled Article',
        slug: generatedSlug,
        category: (formData.category as CmsCategory) || 'announcement',
        targetAudience: (formData.targetAudience as any) || 'all',
        excerpt: formData.excerpt || '',
        content: formData.content || '',
        authorName: 'Platform Administrator',
        authorAvatar: DEFAULT_AVATAR,
        status: (formData.status as CmsStatus) || 'draft',
        viewsCount: 0,
        featured: !!formData.featured,
        publishedAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10)
      };
      setArticles([newArticle, ...articles]);
      if (onSaveArticle) onSaveArticle(newArticle);
      setIsCreatingNew(false);
    } else if (editingArticle) {
      const updated: CmsArticle = {
        ...editingArticle,
        ...formData,
        slug: generatedSlug,
        updatedAt: new Date().toISOString().slice(0, 10)
      } as CmsArticle;

      setArticles(prev => prev.map(a => a.id === updated.id ? updated : a));
      if (onSaveArticle) onSaveArticle(updated);
      setEditingArticle(null);
    }
  };

  const handleDelete = (id: string) => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_cms_articles') || '[]');
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        localStorage.setItem('workperhour_deleted_cms_articles', JSON.stringify(deletedIds));
      }
    } catch (e) {
      console.error("Error saving deleted CMS article to localStorage", e);
    }

    setArticles(prev => prev.filter(a => a.id !== id));
    if (onDeleteArticle) onDeleteArticle(id);
  };

  const handleToggleStatus = (article: CmsArticle) => {
    const nextStatus: CmsStatus = article.status === 'published' ? 'draft' : 'published';
    const updated = { ...article, status: nextStatus, updatedAt: new Date().toISOString().slice(0, 10) };
    setArticles(prev => prev.map(a => a.id === article.id ? updated : a));
    if (onSaveArticle) onSaveArticle(updated);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl">
              <FileCode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Content Management System (CMS)</h2>
              <p className="text-sm text-slate-500">Author announcements, publish policy docs, manage knowledgebase articles, and maintain guides.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New CMS Article
          </button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Published Content</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{stats.published}</span>
            <span className="text-xs text-slate-500 ml-2">live pages</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-amber-700">Pending Drafts</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-amber-700">{stats.drafts}</span>
            <span className="text-xs text-amber-600 ml-2">in review</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-blue-700">Active Announcements</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Megaphone className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-blue-700">{stats.announcements}</span>
            <span className="text-xs text-blue-600 ml-2">platform banners</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-purple-700">Total Reader Views</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <BarChart2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-purple-700">{(stats.totalViews / 1000).toFixed(1)}k</span>
            <span className="text-xs text-purple-600 ml-2">impressions</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search article title, excerpt, slug..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Categories</option>
            <option value="announcement">Announcements</option>
            <option value="guide">Guides & Tutorials</option>
            <option value="help_faq">Help Center & FAQ</option>
            <option value="platform_policy">Platform Policies</option>
            <option value="legal">Legal & Terms</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-6">Document Title & Slug</th>
                <th className="py-4 px-6">Category & Audience</th>
                <th className="py-4 px-6">Author</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Views</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedArticles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <FileCode className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No CMS articles matching your filter parameters.
                  </td>
                </tr>
              ) : (
                paginatedArticles.map(article => (
                  <tr key={article.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-4 px-6 max-w-sm">
                      <div className="flex items-center gap-2">
                        {article.featured && (
                          <span className="p-1 rounded bg-amber-100 text-amber-700" title="Featured Article">
                            <Award className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <span className="font-semibold text-slate-900 line-clamp-1">{article.title}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">/{article.slug}</div>
                    </td>

                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                        {article.category.replace('_', ' ')}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1 uppercase font-semibold">
                        Target: {article.targetAudience}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <img
                          src={article.authorAvatar || DEFAULT_AVATAR}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover border border-slate-200"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                        />
                        <span className="text-slate-800 font-medium truncate max-w-[120px]">{article.authorName}</span>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      {article.status === 'published' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Published
                        </span>
                      )}
                      {article.status === 'draft' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3.5 h-3.5" /> Draft
                        </span>
                      )}
                      {article.status === 'scheduled' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <Clock className="w-3.5 h-3.5" /> Scheduled
                        </span>
                      )}
                      {article.status === 'archived' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          Archived
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-6 font-semibold text-slate-700">
                      {article.viewsCount.toLocaleString()}
                    </td>

                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setPreviewingArticle(article)}
                          title="Preview Live Page"
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(article)}
                          title="Edit Document"
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(article)}
                          title={article.status === 'published' ? 'Switch to Draft' : 'Publish Article'}
                          className={`p-1.5 rounded-lg transition ${
                            article.status === 'published'
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {article.status === 'published' ? <Clock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(article.id)}
                          title="Delete Article"
                          className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {paginatedArticles.length} of {filteredArticles.length} CMS documents</span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {(isCreatingNew || editingArticle) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {isCreatingNew ? 'Create New CMS Document' : 'Edit CMS Document'}
              </h3>
              <button
                onClick={() => { setIsCreatingNew(false); setEditingArticle(null); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Document Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2026 Escrow Protection Standards & Guidelines"
                  value={formData.title || ''}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700">URL Slug</label>
                  <input
                    type="text"
                    placeholder="auto-generated-if-empty"
                    value={formData.slug || ''}
                    onChange={e => setFormData({ ...formData, slug: e.target.value })}
                    className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                    className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="announcement">Announcement</option>
                    <option value="guide">Guide & Best Practices</option>
                    <option value="help_faq">Help Center & FAQ</option>
                    <option value="platform_policy">Platform Policy</option>
                    <option value="legal">Legal & Terms</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700">Target Audience</label>
                  <select
                    value={formData.targetAudience}
                    onChange={e => setFormData({ ...formData, targetAudience: e.target.value as any })}
                    className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">All Community Members</option>
                    <option value="freelancers">Freelancers Only</option>
                    <option value="clients">Clients & Employers Only</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Publication Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="published">Published Immediately</option>
                    <option value="draft">Save as Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Excerpt / Short Summary</label>
                <textarea
                  rows={2}
                  placeholder="Concise overview displayed in search snippets and previews..."
                  value={formData.excerpt || ''}
                  onChange={e => setFormData({ ...formData, excerpt: e.target.value })}
                  className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Article Content (Markdown / HTML)</label>
                <textarea
                  rows={8}
                  placeholder="Enter full formatted article text..."
                  value={formData.content || ''}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="featuredCheck"
                  checked={!!formData.featured}
                  onChange={e => setFormData({ ...formData, featured: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="featuredCheck" className="font-semibold text-slate-700 cursor-pointer">
                  Pin as Featured Announcement on Homepage Banner
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsCreatingNew(false); setEditingArticle(null); }}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-xs"
                >
                  Save Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW MODAL */}
      {previewingArticle && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-slate-100 text-slate-700">
                  {previewingArticle.category.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-400">/{previewingArticle.slug}</span>
              </div>
              <button
                onClick={() => setPreviewingArticle(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-900">{previewingArticle.title}</h1>
              <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <img 
                    src={previewingArticle.authorAvatar || DEFAULT_AVATAR} 
                    alt="" 
                    className="w-5 h-5 rounded-full object-cover" 
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                  />
                  <span className="font-semibold text-slate-800">{previewingArticle.authorName}</span>
                </div>
                <span>•</span>
                <span>Published: {previewingArticle.publishedAt}</span>
                <span>•</span>
                <span>{previewingArticle.viewsCount.toLocaleString()} views</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-medium text-slate-600 italic">
              {previewingArticle.excerpt}
            </div>

            <div className="prose prose-sm max-w-none text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
              {previewingArticle.content}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                onClick={() => setPreviewingArticle(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
