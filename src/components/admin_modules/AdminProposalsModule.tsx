import React, { useState, useMemo } from 'react';
import {
  Send, Search, Filter, Eye, CheckCircle2, AlertTriangle,
  Clock, X, Check, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, DollarSign, Award, FileText, User, Ban, Star
} from 'lucide-react';
import { Proposal } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';

interface ExtendedProposal extends Proposal {
  projectTitle?: string;
  category?: string;
  freelancerLevel?: string;
  freelancerRating?: number;
  clientName?: string;
  clientAvatar?: string;
  moderationNotes?: string;
}

interface AdminProposalsModuleProps {
  initialProposals?: ExtendedProposal[];
  onUpdateProposalStatus?: (id: string, status: Proposal['status']) => void;
  onDeleteProposal?: (id: string) => void;
}

export const AdminProposalsModule: React.FC<AdminProposalsModuleProps> = ({
  initialProposals,
  onUpdateProposalStatus,
  onDeleteProposal
}) => {
  // Local robust proposal state
  const [proposals, setProposals] = useState<ExtendedProposal[]>(() => initialProposals || []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Modals
  const [inspectingProposal, setInspectingProposal] = useState<ExtendedProposal | null>(null);
  const [editStatusProposal, setEditStatusProposal] = useState<ExtendedProposal | null>(null);
  const [newStatus, setNewStatus] = useState<Proposal['status']>('pending');
  const [deleteConfirmProposal, setDeleteConfirmProposal] = useState<ExtendedProposal | null>(null);

  // Metrics
  const metrics = useMemo(() => {
    const total = proposals.length;
    const accepted = proposals.filter(p => p.status === 'accepted').length;
    const pending = proposals.filter(p => p.status === 'pending').length;
    const rejected = proposals.filter(p => p.status === 'rejected').length;
    const totalBidValue = proposals.reduce((sum, p) => sum + p.bidAmount, 0);
    const avgBid = total > 0 ? Math.round(totalBidValue / total) : 0;
    const awardRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    return { total, accepted, pending, rejected, avgBid, awardRate };
  }, [proposals]);

  // Filtered dataset
  const filteredProposals = useMemo(() => {
    return proposals.filter(proposal => {
      const matchesSearch =
        proposal.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        proposal.freelancerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (proposal.projectTitle && proposal.projectTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
        proposal.coverLetter.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || proposal.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || proposal.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [proposals, searchQuery, statusFilter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProposals.length / itemsPerPage));
  const paginatedProposals = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProposals.slice(start, start + itemsPerPage);
  }, [filteredProposals, currentPage, itemsPerPage]);

  // Handlers
  const handleUpdateStatus = () => {
    if (!editStatusProposal) return;
    setProposals(prev => prev.map(p => p.id === editStatusProposal.id ? { ...p, status: newStatus } : p));
    if (onUpdateProposalStatus) onUpdateProposalStatus(editStatusProposal.id, newStatus);
    setEditStatusProposal(null);
  };

  const handleDelete = () => {
    if (!deleteConfirmProposal) return;
    setProposals(prev => prev.filter(p => p.id !== deleteConfirmProposal.id));
    if (onDeleteProposal) onDeleteProposal(deleteConfirmProposal.id);
    setDeleteConfirmProposal(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Proposals & Freelancer Bids Hub</h2>
              <p className="text-xs text-slate-500">Monitor all competitive quotes, cover letters, delivery timelines, and award conversions</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200">
            Average Quote: ${metrics.avgBid.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Bids</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{metrics.total}</div>
          <span className="text-[11px] text-slate-400">Quotes across projects</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600">Accepted & Awarded</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">{metrics.accepted}</div>
          <span className="text-[11px] text-emerald-600">{metrics.awardRate}% conversion</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600">Under Consideration</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-2">{metrics.pending}</div>
          <span className="text-[11px] text-amber-600">Awaiting client decision</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600">Rejected / Flagged</span>
            <Ban className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-2">{metrics.rejected}</div>
          <span className="text-[11px] text-rose-500">Declined or spam filtered</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-600">Win Rate</span>
            <Award className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-700 mt-2">{metrics.awardRate}%</div>
          <span className="text-[11px] text-purple-500">Platform-wide average</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search proposals by freelancer name, project, or cover letter..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
        >
          <option value="all">All Proposal Statuses</option>
          <option value="pending">Pending Client Review</option>
          <option value="accepted">Accepted / Awarded</option>
          <option value="rejected">Rejected / Withdrawn</option>
        </select>
      </div>

      {/* Proposals Table */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Freelancer Candidate</th>
                <th className="py-3 px-4">Target Job / Project</th>
                <th className="py-3 px-4">Bid Amount</th>
                <th className="py-3 px-4">Timeline</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProposals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <Send className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    No proposals matched the search criteria.
                  </td>
                </tr>
              ) : (
                paginatedProposals.map((proposal) => (
                  <tr key={proposal.id} className="hover:bg-slate-50/60 transition group">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={proposal.freelancerAvatar || DEFAULT_AVATAR}
                          alt={proposal.freelancerName}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-1">
                            {proposal.freelancerName}
                            {proposal.freelancerLevel && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-indigo-50 text-indigo-700 rounded-md font-bold">
                                {proposal.freelancerLevel}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <span>{proposal.freelancerTitle}</span>
                            {proposal.freelancerRating && (
                              <>
                                <span>•</span>
                                <span className="text-amber-600 font-semibold flex items-center">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {proposal.freelancerRating}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition line-clamp-1">
                        {proposal.projectTitle || `Project #${proposal.projectId}`}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Client: {proposal.clientName || 'Marketplace Client'} • {proposal.category || 'General'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm">
                        ${proposal.bidAmount.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{proposal.id}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1 text-slate-700 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{proposal.deliveryDays} Days</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(proposal.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {proposal.status === 'accepted' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Accepted
                        </span>
                      )}
                      {proposal.status === 'pending' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Pending Review
                        </span>
                      )}
                      {proposal.status === 'rejected' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          Rejected
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setInspectingProposal(proposal)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="View Cover Letter"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditStatusProposal(proposal);
                            setNewStatus(proposal.status);
                          }}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
                          title="Change Status"
                        >
                          <Filter className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmProposal(proposal)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Remove Proposal"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="py-3.5 px-4 bg-slate-50/75 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-700">{filteredProposals.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredProposals.length)}</span> of <span className="font-semibold text-slate-700">{filteredProposals.length}</span> proposals
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

      {/* MODAL 1: VIEW FULL PROPOSAL COVER LETTER */}
      {inspectingProposal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{inspectingProposal.id}</span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Proposal by {inspectingProposal.freelancerName}</h3>
                <p className="text-xs text-slate-500">For {inspectingProposal.projectTitle}</p>
              </div>
              <button
                onClick={() => setInspectingProposal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 block">Proposed Price</span>
                <span className="text-lg font-bold text-slate-900">${inspectingProposal.bidAmount}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 block">Delivery Time</span>
                <span className="text-lg font-bold text-slate-900">{inspectingProposal.deliveryDays} Days</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Freelancer Cover Letter</h4>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap">
                {inspectingProposal.coverLetter}
              </div>
            </div>

            {inspectingProposal.moderationNotes && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
                <span className="font-bold block mb-1">Administrative Note:</span>
                {inspectingProposal.moderationNotes}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setInspectingProposal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CHANGE PROPOSAL STATUS */}
      {editStatusProposal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Change Proposal Status</h3>
            <p className="text-xs text-slate-500">Proposal #{editStatusProposal.id} by {editStatusProposal.freelancerName}</p>

            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
            >
              <option value="pending">Pending Client Review</option>
              <option value="accepted">Accepted / Award Contract</option>
              <option value="rejected">Rejected</option>
            </select>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditStatusProposal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700"
              >
                Save Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE CONFIRMATION */}
      {deleteConfirmProposal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Delete Proposal #{deleteConfirmProposal.id}?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove this proposal by <span className="font-bold text-slate-700">{deleteConfirmProposal.freelancerName}</span>?
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmProposal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700"
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
