import React, { useState, useMemo } from 'react';
import {
  Briefcase, Search, Filter, Eye, CheckCircle2, AlertTriangle,
  Clock, X, Check, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, DollarSign, Ban, Award, FileText, User, Tag, ChevronDown, Trash2
} from 'lucide-react';
import { Project } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';

interface AdminProjectsModuleProps {
  allProjects?: Project[];
  onUpdateProjectStatus?: (projectId: string, status: Project['status'], moderationStatus?: Project['moderationStatus']) => void;
  onDeleteProject?: (projectId: string) => void;
}

export const AdminProjectsModule: React.FC<AdminProjectsModuleProps> = ({
  allProjects = [],
  onUpdateProjectStatus,
  onDeleteProject
}) => {
  // Local robust project state initialized with defaults and local storage filter
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_projects') || '[]');
      return (allProjects || []).filter(p => !deletedIds.includes(p.id));
    } catch {
      return allProjects || [];
    }
  });

  // Keep local state in sync when allProjects prop updates
  React.useEffect(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_projects') || '[]').map((d: any) => String(d));
      setProjects((allProjects || []).filter(p => !deletedIds.includes(String(p.id))));
    } catch {
      setProjects(allProjects || []);
    }
  }, [allProjects]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'completed' | 'suspended'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [moderationFilter, setModerationFilter] = useState<'all' | 'approved' | 'flagged' | 'pending'>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Selected for Inspect / Action Modals
  const [inspectingProject, setInspectingProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedNewStatus, setSelectedNewStatus] = useState<Project['status']>('open');
  const [selectedModerationStatus, setSelectedModerationStatus] = useState<Project['moderationStatus']>('approved');
  const [moderationNoteInput, setModerationNoteInput] = useState('');
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<Project | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Filtered dataset
  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
      const matchesSearch = 
        project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.buyerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (project.skills && project.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())));
      
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || project.category === categoryFilter;
      const matchesModeration = moderationFilter === 'all' || project.moderationStatus === moderationFilter;

      return matchesSearch && matchesStatus && matchesCategory && matchesModeration;
    });
  }, [projects, searchQuery, statusFilter, categoryFilter, moderationFilter]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / itemsPerPage));
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProjects.slice(start, start + itemsPerPage);
  }, [filteredProjects, currentPage, itemsPerPage]);

  // Metrics
  const metrics = useMemo(() => {
    const total = projects.length;
    const open = projects.filter(p => p.status === 'open').length;
    const inProgress = projects.filter(p => p.status === 'in_progress').length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const suspended = projects.filter(p => p.status === 'suspended' || p.moderationStatus === 'flagged').length;
    const totalBudgetSum = projects.reduce((sum, p) => sum + (p.budgetMax || p.budgetMin || 0), 0);

    return { total, open, inProgress, completed, suspended, totalBudgetSum };
  }, [projects]);

  // Handlers
  const handleOpenStatusModal = (project: Project) => {
    setEditingProject(project);
    setSelectedNewStatus(project.status);
    setSelectedModerationStatus(project.moderationStatus || 'approved');
    setModerationNoteInput(project.moderationNotes || '');
    setStatusModalOpen(true);
  };

  const handleSaveStatus = () => {
    if (!editingProject) return;

    setProjects(prev => prev.map(p => {
      if (p.id === editingProject.id) {
        return {
          ...p,
          status: selectedNewStatus,
          moderationStatus: selectedModerationStatus,
          moderationNotes: moderationNoteInput.trim() ? moderationNoteInput.trim() : undefined
        };
      }
      return p;
    }));

    if (onUpdateProjectStatus) {
      onUpdateProjectStatus(editingProject.id, selectedNewStatus, selectedModerationStatus);
    }

    setStatusModalOpen(false);
    setEditingProject(null);
  };

  const handleToggleFeatured = (projectId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id === projectId) {
        return { ...p, featured: !p.featured };
      }
      return p;
    }));
  };

  const handleDeleteProject = () => {
    if (!deleteConfirmProject) return;

    const idToDelete = String(deleteConfirmProject.id);
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_projects') || '[]').map((d: any) => String(d));
      if (!deletedIds.includes(idToDelete)) {
        deletedIds.push(idToDelete);
        localStorage.setItem('workperhour_deleted_projects', JSON.stringify(deletedIds));
      }
    } catch (e) {
      console.error("Error writing deleted projects to localStorage", e);
    }

    setProjects(prev => prev.filter(p => String(p.id) !== idToDelete));
    if (onDeleteProject) {
      onDeleteProject(idToDelete);
    }
    setDeleteConfirmProject(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Buyer Projects & Job Requests</h2>
              <p className="text-xs text-slate-500">Monitor all open client RFP postings, manage bids, enforce moderation, and review budgets</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200">
            Total Pipeline: ${metrics.totalBudgetSum.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Projects</span>
            <Briefcase className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{metrics.total}</div>
          <span className="text-[11px] text-slate-400">All registered job briefs</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600">Open For Bids</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">{metrics.open}</div>
          <span className="text-[11px] text-emerald-600">Active proposal stages</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600">In Progress</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-2">{metrics.inProgress}</div>
          <span className="text-[11px] text-blue-500">Awarded & milestones active</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-600">Completed</span>
            <Award className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-700 mt-2">{metrics.completed}</div>
          <span className="text-[11px] text-purple-500">Successfully delivered</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600">Suspended / Flagged</span>
            <Ban className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-2">{metrics.suspended}</div>
          <span className="text-[11px] text-rose-500">Moderation intervention</span>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search bar */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search projects by title, buyer name, or skill tags..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status selector */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-slate-700 font-medium"
            >
              <option value="all">All Lifecycle States</option>
              <option value="open">Open (Accepting Bids)</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* Moderation selector */}
          <div>
            <select
              value={moderationFilter}
              onChange={(e) => { setModerationFilter(e.target.value as any); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-slate-700 font-medium"
            >
              <option value="all">All Moderation Statuses</option>
              <option value="approved">Approved & Clean</option>
              <option value="flagged">Flagged for Review</option>
              <option value="pending">Pending Moderation</option>
            </select>
          </div>
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Project Brief & Details</th>
                <th className="py-3.5 px-4">Client / Buyer</th>
                <th className="py-3.5 px-4">Budget Range</th>
                <th className="py-3.5 px-4">Bids</th>
                <th className="py-3.5 px-4">Status & Moderation</th>
                <th className="py-3.5 px-4 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProjects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Briefcase className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-base font-semibold text-slate-600">No buyer projects matched your search</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting the status filters or altering your keyword search.</p>
                  </td>
                </tr>
              ) : (
                paginatedProjects.map((project) => {
                  const isSuspended = project.status === 'suspended' || project.moderationStatus === 'flagged';
                  return (
                    <tr key={project.id} className="hover:bg-slate-50/60 transition group">
                      {/* Project info */}
                      <td className="py-4 px-4 max-w-sm">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-indigo-600 tracking-wide">{project.id}</span>
                            {project.featured && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-md border border-amber-200">
                                Featured
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition line-clamp-1">
                            {project.title}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{project.category}</span>
                            {project.subcategory && (
                              <>
                                <span>•</span>
                                <span>{project.subcategory}</span>
                              </>
                            )}
                          </div>
                          {project.skills && project.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {project.skills.slice(0, 3).map((skill, sIdx) => (
                                <span key={sIdx} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded-md font-medium">
                                  {skill}
                                </span>
                              ))}
                              {project.skills.length > 3 && (
                                <span className="text-[10px] text-slate-400">+{project.skills.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Buyer info */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={project.buyerAvatar || DEFAULT_AVATAR}
                            alt={project.buyerName}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                          />
                          <div>
                            <div className="font-semibold text-slate-900 text-xs flex items-center gap-1">
                              {project.buyerName}
                              {project.countryFlag && <span>{project.countryFlag}</span>}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {project.verifiedBuyer ? 'Verified Buyer' : 'Standard Account'} • {project.buyerSpent || '$0 spent'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Budget */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900">
                          ${project.budgetMin.toLocaleString()} - ${project.budgetMax.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{project.deadlineDays} days timeline</span>
                        </div>
                      </td>

                      {/* Proposals */}
                      <td className="py-4 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-xl font-bold text-slate-700 text-xs">
                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                          <span>{project.proposalsCount} proposals</span>
                        </div>
                      </td>

                      {/* Status & Moderation */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div>
                            {project.status === 'open' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Open
                              </span>
                            )}
                            {project.status === 'in_progress' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                In Progress
                              </span>
                            )}
                            {project.status === 'completed' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Completed
                              </span>
                            )}
                            {project.status === 'suspended' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <Ban className="w-3 h-3" />
                                Suspended
                              </span>
                            )}
                          </div>
                          {project.moderationStatus === 'flagged' && (
                            <div className="text-[10px] text-rose-600 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Flagged by admin</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right relative">
                        <button
                          type="button"
                          onClick={() => setOpenDropdownId(openDropdownId === project.id ? null : project.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition inline-flex items-center gap-1.5 ml-auto cursor-pointer"
                        >
                          <span>Actions</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {openDropdownId === project.id && (
                          <div className="absolute right-4 top-12 z-50 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 text-left text-xs divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
                            <div className="py-1 px-1">
                              <button
                                type="button"
                                onClick={() => { setInspectingProject(project); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>Inspect Project</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => { handleOpenStatusModal(project); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-indigo-600 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <Filter className="w-3.5 h-3.5" />
                                <span>Update Status</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => { handleToggleFeatured(project.id); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <Award className="w-3.5 h-3.5 text-amber-500" />
                                <span>{project.featured ? 'Unfeature Project' : 'Feature Project'}</span>
                              </button>
                            </div>
                            <div className="py-1 px-1">
                              <button
                                type="button"
                                onClick={() => { setDeleteConfirmProject(project); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 hover:bg-rose-50 text-rose-600 font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Project</span>
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
            Showing <span className="font-semibold text-slate-700">{filteredProjects.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredProjects.length)}</span> of <span className="font-semibold text-slate-700">{filteredProjects.length}</span> projects
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <span className="font-semibold text-slate-700 px-2">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: INSPECT FULL PROJECT DETAILS */}
      {inspectingProject && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{inspectingProject.id}</span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{inspectingProject.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{inspectingProject.category} • {inspectingProject.subcategory || 'General'}</p>
              </div>
              <button
                onClick={() => setInspectingProject(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Buyer Snapshot */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={inspectingProject.buyerAvatar || DEFAULT_AVATAR}
                  alt={inspectingProject.buyerName}
                  className="w-12 h-12 rounded-full object-cover border border-slate-200"
                  onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                    {inspectingProject.buyerName}
                    {inspectingProject.countryFlag && <span>{inspectingProject.countryFlag}</span>}
                  </h4>
                  <p className="text-xs text-slate-500">
                    Location: {inspectingProject.location || 'Not specified'} • Total Spent: {inspectingProject.buyerSpent || '$0'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-700">{inspectingProject.buyerProjectsPosted || 1} Projects Posted</div>
                <div className="text-[11px] text-emerald-600 font-semibold">{inspectingProject.buyerRating || 5.0} ★ Client Score</div>
              </div>
            </div>

            {/* Project Specs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                <span className="text-[11px] text-indigo-600 font-bold block">Budget Range</span>
                <span className="text-base font-extrabold text-slate-900">
                  ${inspectingProject.budgetMin} - ${inspectingProject.budgetMax}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[11px] text-slate-500 font-bold block">Delivery Target</span>
                <span className="text-base font-extrabold text-slate-900">{inspectingProject.deadlineDays} Days</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[11px] text-slate-500 font-bold block">Proposals Received</span>
                <span className="text-base font-extrabold text-slate-900">{inspectingProject.proposalsCount} Bids</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Scope of Work & Client Brief</h5>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 leading-relaxed max-h-48 overflow-y-auto">
                {inspectingProject.description}
              </div>
            </div>

            {/* Skills */}
            {inspectingProject.skills && inspectingProject.skills.length > 0 && (
              <div>
                <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Required Skills & Technologies</h5>
                <div className="flex flex-wrap gap-1.5">
                  {inspectingProject.skills.map((skill, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium rounded-xl">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Moderation note if any */}
            {inspectingProject.moderationNotes && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800">
                <span className="font-bold block mb-1">Moderator Audit Note:</span>
                {inspectingProject.moderationNotes}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  const p = inspectingProject;
                  setInspectingProject(null);
                  handleOpenStatusModal(p);
                }}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition"
              >
                Change Lifecycle / Moderation Status
              </button>
              <button
                onClick={() => setInspectingProject(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT LIFECYCLE & MODERATION STATUS */}
      {statusModalOpen && editingProject && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Manage Project Status</h3>
                <p className="text-xs text-slate-500">Update publication stage and platform safety flags for #{editingProject.id}</p>
              </div>
              <button
                onClick={() => setStatusModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Project Lifecycle Status</label>
                <select
                  value={selectedNewStatus}
                  onChange={(e) => setSelectedNewStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
                >
                  <option value="open">Open (Accepting Proposals)</option>
                  <option value="in_progress">In Progress (Active Contract)</option>
                  <option value="completed">Completed (Delivered & Paid)</option>
                  <option value="suspended">Suspended / Frozen</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Trust & Moderation Status</label>
                <select
                  value={selectedModerationStatus}
                  onChange={(e) => setSelectedModerationStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
                >
                  <option value="approved">Approved (Live on Marketplace)</option>
                  <option value="pending">Pending Admin Review</option>
                  <option value="flagged">Flagged / Terms Infringement</option>
                  <option value="rejected">Rejected / Hidden Permanently</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Admin Moderation Audit Log Note</label>
                <textarea
                  rows={3}
                  value={moderationNoteInput}
                  onChange={(e) => setModerationNoteInput(e.target.value)}
                  placeholder="Provide reason for suspension, approval, or content correction..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setStatusModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStatus}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE CONFIRMATION */}
      {deleteConfirmProject && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Delete Project Posting?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete project <span className="font-bold text-slate-700">"{deleteConfirmProject.title}"</span>? This will cancel all existing freelancer proposals and notify the client.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmProject(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition"
              >
                Keep Project
              </button>
              <button
                onClick={handleDeleteProject}
                className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700 transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
