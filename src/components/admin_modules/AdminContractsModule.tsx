import React, { useState, useMemo } from 'react';
import {
  FileText, Search, Filter, Eye, CheckCircle2, AlertTriangle,
  Clock, X, Check, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, DollarSign, ShieldCheck, User, Calendar, Award,
  ArrowRight, ShieldAlert, Ban, Layers
} from 'lucide-react';
import { DEFAULT_AVATAR } from '../../constants';

interface Milestone {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  status: 'funded' | 'in_progress' | 'submitted' | 'released' | 'disputed';
  deliverablesSummary?: string;
}

interface ContractItem {
  id: string;
  orderId?: string;
  projectId?: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientAvatar: string;
  freelancerName: string;
  freelancerEmail: string;
  freelancerAvatar: string;
  totalAmount: number;
  fundedInEscrow: number;
  releasedAmount: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'milestone_review' | 'completed' | 'disputed' | 'terminated';
  milestones: Milestone[];
  termsAgreedAt: string;
  disputeReason?: string;
}

interface AdminContractsModuleProps {
  initialContracts?: ContractItem[];
}

export const AdminContractsModule: React.FC<AdminContractsModuleProps> = ({
  initialContracts
}) => {
  // Local robust state for contracts
  const [contracts, setContracts] = useState<ContractItem[]>(() => initialContracts || []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'milestone_review' | 'completed' | 'disputed' | 'terminated'>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Modals
  const [selectedContract, setSelectedContract] = useState<ContractItem | null>(null);
  const [manageMilestoneModalContract, setManageMilestoneModalContract] = useState<ContractItem | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [terminateConfirmContract, setTerminateConfirmContract] = useState<ContractItem | null>(null);
  const [terminateReason, setTerminateReason] = useState('');

  // Metrics
  const metrics = useMemo(() => {
    const total = contracts.length;
    const active = contracts.filter(c => c.status === 'active').length;
    const review = contracts.filter(c => c.status === 'milestone_review').length;
    const completed = contracts.filter(c => c.status === 'completed').length;
    const disputed = contracts.filter(c => c.status === 'disputed').length;
    const totalValue = contracts.reduce((sum, c) => sum + c.totalAmount, 0);
    const inEscrow = contracts.reduce((sum, c) => sum + c.fundedInEscrow, 0);

    return { total, active, review, completed, disputed, totalValue, inEscrow };
  }, [contracts]);

  // Filtered dataset
  const filteredContracts = useMemo(() => {
    return contracts.filter(contract => {
      const matchesSearch =
        contract.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contract.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contract.freelancerName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contracts, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / itemsPerPage));
  const paginatedContracts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredContracts.slice(start, start + itemsPerPage);
  }, [filteredContracts, currentPage, itemsPerPage]);

  // Handlers
  const handleForceReleaseMilestone = (contractId: string, milestoneId: string) => {
    setContracts(prev => prev.map(c => {
      if (c.id === contractId) {
        const targetMs = c.milestones.find(m => m.id === milestoneId);
        if (!targetMs || targetMs.status === 'released') return c;
        const newReleased = c.releasedAmount + targetMs.amount;
        const newEscrow = Math.max(0, c.fundedInEscrow - targetMs.amount);
        const updatedMilestones = c.milestones.map(m => m.id === milestoneId ? { ...m, status: 'released' as const } : m);
        const allDone = updatedMilestones.every(m => m.status === 'released');
        return {
          ...c,
          releasedAmount: newReleased,
          fundedInEscrow: newEscrow,
          status: allDone ? 'completed' : c.status,
          milestones: updatedMilestones
        };
      }
      return c;
    }));
    setManageMilestoneModalContract(null);
    setSelectedMilestone(null);
  };

  const handleTerminateContract = () => {
    if (!terminateConfirmContract) return;
    setContracts(prev => prev.map(c => {
      if (c.id === terminateConfirmContract.id) {
        return {
          ...c,
          status: 'terminated',
          disputeReason: terminateReason.trim() || 'Terminated by platform administrator after contract breach evaluation.'
        };
      }
      return c;
    }));
    setTerminateConfirmContract(null);
    setTerminateReason('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Legal Contracts & Milestone Escrow Hub</h2>
              <p className="text-xs text-slate-500">Oversee bilateral agreements, supervise staged escrow deliverables, and mediate milestones</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200">
            Escrow Liabilities: ${metrics.inEscrow.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Value</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">${metrics.totalValue.toLocaleString()}</div>
          <span className="text-[11px] text-slate-400">{metrics.total} active covenants</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600">In Execution</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">{metrics.active}</div>
          <span className="text-[11px] text-emerald-600">Working in milestones</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600">Review Pending</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-2">{metrics.review}</div>
          <span className="text-[11px] text-amber-600">Deliverables submitted</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-600">Completed</span>
            <Award className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-700 mt-2">{metrics.completed}</div>
          <span className="text-[11px] text-purple-500">100% funded & cleared</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600">Disputed / Frozen</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-2">{metrics.disputed}</div>
          <span className="text-[11px] text-rose-500">Requires mediator sign-off</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search contracts by ID, title, client, or freelancer..."
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
          <option value="all">All Contract Stages</option>
          <option value="active">Active (In Execution)</option>
          <option value="milestone_review">Milestone Submitted for Review</option>
          <option value="completed">Completed & Released</option>
          <option value="disputed">Under Dispute</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      {/* Contracts Table */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Contract Agreement</th>
                <th className="py-3 px-4">Client & Freelancer</th>
                <th className="py-3 px-4">Value & Escrow</th>
                <th className="py-3 px-4">Milestones</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedContracts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    No contracts matched the selected filters.
                  </td>
                </tr>
              ) : (
                paginatedContracts.map((contract) => {
                  const completedMilestones = contract.milestones.filter(m => m.status === 'released').length;
                  return (
                    <tr key={contract.id} className="hover:bg-slate-50/60 transition group">
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-mono font-bold text-indigo-600">{contract.id}</div>
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition line-clamp-1">
                          {contract.title}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {contract.startDate} to {contract.endDate}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <img
                              src={contract.clientAvatar || DEFAULT_AVATAR}
                              alt={contract.clientName}
                              className="w-5 h-5 rounded-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                            />
                            <span className="font-semibold text-slate-800 text-[11px]">Client: {contract.clientName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <img
                              src={contract.freelancerAvatar || DEFAULT_AVATAR}
                              alt={contract.freelancerName}
                              className="w-5 h-5 rounded-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                            />
                            <span className="font-semibold text-slate-800 text-[11px]">Dev: {contract.freelancerName}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">
                          ${contract.totalAmount.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Escrow: <span className="text-blue-600 font-semibold">${contract.fundedInEscrow.toLocaleString()}</span> • Released: <span className="text-emerald-600 font-semibold">${contract.releasedAmount.toLocaleString()}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-xl text-slate-700 font-bold text-[11px]">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>{completedMilestones} / {contract.milestones.length} Completed</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {contract.status === 'active' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        )}
                        {contract.status === 'milestone_review' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Milestone Review
                          </span>
                        )}
                        {contract.status === 'completed' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            Completed
                          </span>
                        )}
                        {contract.status === 'disputed' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Disputed
                          </span>
                        )}
                        {contract.status === 'terminated' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                            Terminated
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedContract(contract)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Inspect Contract"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setManageMilestoneModalContract(contract);
                              setSelectedMilestone(contract.milestones[0] || null);
                            }}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Supervise Milestones"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setTerminateConfirmContract(contract)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Terminate Contract"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </div>
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
            Showing <span className="font-semibold text-slate-700">{filteredContracts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredContracts.length)}</span> of <span className="font-semibold text-slate-700">{filteredContracts.length}</span> contracts
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

      {/* MODAL 1: INSPECT FULL CONTRACT & MILESTONES */}
      {selectedContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{selectedContract.id}</span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{selectedContract.title}</h3>
                <p className="text-xs text-slate-500">Executed on {new Date(selectedContract.termsAgreedAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => setSelectedContract(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Financial Overview */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[11px] font-bold text-slate-500 block">Total Covenant</span>
                <span className="text-lg font-bold text-slate-900">${selectedContract.totalAmount.toLocaleString()}</span>
              </div>
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
                <span className="text-[11px] font-bold text-blue-600 block">In Escrow Hold</span>
                <span className="text-lg font-bold text-blue-700">${selectedContract.fundedInEscrow.toLocaleString()}</span>
              </div>
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <span className="text-[11px] font-bold text-emerald-600 block">Released to Dev</span>
                <span className="text-lg font-bold text-emerald-700">${selectedContract.releasedAmount.toLocaleString()}</span>
              </div>
            </div>

            {/* Milestones Staging */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Escrow Milestone Schedule</h4>
              <div className="space-y-2.5 max-h-60 overflow-y-auto">
                {selectedContract.milestones.map((m, idx) => (
                  <div key={m.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">Milestone {idx + 1}: {m.title}</span>
                      <span className="font-mono font-bold text-slate-800 text-xs">${m.amount}</span>
                    </div>
                    {m.deliverablesSummary && (
                      <p className="text-[11px] text-slate-500">{m.deliverablesSummary}</p>
                    )}
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                      <span className="text-slate-400">Target: {m.dueDate}</span>
                      <span className="font-semibold capitalize text-indigo-600">{m.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedContract.disputeReason && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
                <span className="font-bold block mb-1">Contract Dispute / Breach Notes:</span>
                {selectedContract.disputeReason}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedContract(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition"
              >
                Close Contract Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SUPERVISE & FORCE RELEASE MILESTONE */}
      {manageMilestoneModalContract && selectedMilestone && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Admin Escrow Milestone Control</h3>
                <p className="text-xs text-slate-500">Contract #{manageMilestoneModalContract.id}</p>
              </div>
              <button
                onClick={() => setManageMilestoneModalContract(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Select Milestone to Review</label>
                <select
                  value={selectedMilestone.id}
                  onChange={(e) => {
                    const found = manageMilestoneModalContract.milestones.find(m => m.id === e.target.value);
                    if (found) setSelectedMilestone(found);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  {manageMilestoneModalContract.milestones.map((m, idx) => (
                    <option key={m.id} value={m.id}>
                      #{idx + 1} - {m.title} (${m.amount}) [{m.status}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                <div><span className="font-bold text-slate-700">Amount:</span> ${selectedMilestone.amount}</div>
                <div><span className="font-bold text-slate-700">Current Status:</span> {selectedMilestone.status}</div>
                <div><span className="font-bold text-slate-700">Due Date:</span> {selectedMilestone.dueDate}</div>
                {selectedMilestone.deliverablesSummary && (
                  <div><span className="font-bold text-slate-700">Deliverables:</span> {selectedMilestone.deliverablesSummary}</div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setManageMilestoneModalContract(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              {selectedMilestone.status !== 'released' && (
                <button
                  onClick={() => handleForceReleaseMilestone(manageMilestoneModalContract.id, selectedMilestone.id)}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition"
                >
                  Admin Force Release (${selectedMilestone.amount})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TERMINATE CONTRACT */}
      {terminateConfirmContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Terminate Contract #{terminateConfirmContract.id}?</h3>
              <p className="text-xs text-slate-500 mt-1">
                This will freeze remaining escrow funds, cancel subsequent milestones, and record an administrative termination audit trail.
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Termination Grounds</label>
              <textarea
                rows={3}
                placeholder="Specify contract violation or failure to deliver..."
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setTerminateConfirmContract(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleTerminateContract}
                className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700"
              >
                Confirm Termination
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
