import React, { useState, useMemo } from 'react';
import {
  Flag, Search, Filter, AlertTriangle, CheckCircle2, Clock,
  ShieldAlert, Eye, X, UserX, Trash2, Check, RefreshCw,
  ChevronLeft, ChevronRight, AlertCircle, Ban, Layers, MessageSquare
} from 'lucide-react';

export interface FlaggedReportItem {
  id: string;
  targetType: 'user' | 'gig' | 'project' | 'message';
  targetId: string;
  targetTitle: string;
  reporterId: string;
  reporterName: string;
  reason: 'spam' | 'harassment' | 'fraud' | 'copyright' | 'poor_quality' | 'policy_violation';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'investigating' | 'action_taken' | 'dismissed';
  createdAt: string;
  adminNotes?: string;
  actionTaken?: string;
}

interface AdminReportsModuleProps {
  initialReports?: FlaggedReportItem[];
  onTakeAction?: (reportId: string, action: string) => void;
  onDismissReport?: (reportId: string) => void;
}

export const AdminReportsModule: React.FC<AdminReportsModuleProps> = ({
  initialReports = [],
  onTakeAction,
  onDismissReport
}) => {
  // Local robust state for flagged reports
  const [reports, setReports] = useState<FlaggedReportItem[]>(() => initialReports || []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'investigating' | 'action_taken' | 'dismissed'>('all');
  const [targetFilter, setTargetFilter] = useState<'all' | 'user' | 'gig' | 'project' | 'message'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'severity'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Modals & Feedback
  const [selectedReport, setSelectedReport] = useState<FlaggedReportItem | null>(null);
  const [actionModal, setActionModal] = useState<{ report: FlaggedReportItem } | null>(null);
  const [chosenAction, setChosenAction] = useState<'warn' | 'suspend' | 'delist' | 'dismiss'>('warn');
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const pendingTotal = reports.filter(r => r.status === 'pending').length;
    const criticalTotal = reports.filter(r => r.severity === 'critical' && r.status !== 'dismissed' && r.status !== 'action_taken').length;
    const actionTakenTotal = reports.filter(r => r.status === 'action_taken').length;
    const totalReports = reports.length;
    return { pendingTotal, criticalTotal, actionTakenTotal, totalReports };
  }, [reports]);

  // Filtered List
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        r.id.toLowerCase().includes(q) ||
        r.targetId.toLowerCase().includes(q) ||
        r.targetTitle.toLowerCase().includes(q) ||
        r.reporterName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesTarget = targetFilter === 'all' || r.targetType === targetFilter;
      const matchesSeverity = severityFilter === 'all' || r.severity === severityFilter;
      return matchesSearch && matchesStatus && matchesTarget && matchesSeverity;
    }).sort((a, b) => {
      if (sortBy === 'severity') {
        const score = (s: string) => s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : 1;
        return score(b.severity) - score(a.severity);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [reports, searchQuery, statusFilter, targetFilter, severityFilter, sortBy]);

  const totalPages = Math.ceil(filteredReports.length / pageSize) || 1;
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReports.slice(start, start + pageSize);
  }, [filteredReports, currentPage, pageSize]);

  // Execute Action
  const handleConfirmAction = () => {
    if (!actionModal) return;
    const { report } = actionModal;

    let finalActionDescription = '';
    let finalStatus: FlaggedReportItem['status'] = 'action_taken';

    if (chosenAction === 'warn') {
      finalActionDescription = `Official platform compliance warning dispatched to ${report.targetType} #${report.targetId}.`;
    } else if (chosenAction === 'suspend') {
      finalActionDescription = `Target ${report.targetType} #${report.targetId} suspended pending identity/compliance review.`;
    } else if (chosenAction === 'delist') {
      finalActionDescription = `Target ${report.targetType} removed/delisted from public marketplace index.`;
    } else if (chosenAction === 'dismiss') {
      finalActionDescription = `Report dismissed by administrator as non-violating.`;
      finalStatus = 'dismissed';
    }

    setReports(prev => prev.map(r => r.id === report.id ? {
      ...r,
      status: finalStatus,
      actionTaken: finalActionDescription,
      adminNotes: adminNoteInput || r.adminNotes
    } : r));

    if (chosenAction === 'dismiss') {
      if (onDismissReport) onDismissReport(report.id);
      showToast(`Report #${report.id} was dismissed.`);
    } else {
      if (onTakeAction) onTakeAction(report.id, chosenAction);
      showToast(`Action taken on Report #${report.id}: ${finalActionDescription}`);
    }

    setActionModal(null);
    setAdminNoteInput('');
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
            <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <Flag className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Flagged Reports & Content Cases</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Moderate community flagged users, spam offerings, prohibited requests, copyright infringements, and Terms of Service violations.
          </p>
        </div>

        <button
          type="button"
          onClick={() => showToast('Flagged cases queue refreshed.')}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-1.5 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Pending Reports</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.pendingTotal}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Awaiting moderator triage</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Critical Severity</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{metrics.criticalTotal}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Phishing, fraud, or abuse</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Enforcements Taken</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{metrics.actionTakenTotal}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Delisted, warned, or suspended</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Recorded</span>
            <ShieldAlert className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.totalReports}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Community safety telemetry</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reports by ID, reported target, reporter, or reason..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-emerald-600 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-emerald-600 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="investigating">Investigating</option>
              <option value="action_taken">Action Taken</option>
              <option value="dismissed">Dismissed</option>
            </select>

            <select
              value={targetFilter}
              onChange={(e) => { setTargetFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-emerald-600 cursor-pointer"
            >
              <option value="all">All Targets</option>
              <option value="user">Users</option>
              <option value="gig">Gigs / Offers</option>
              <option value="project">Buyer Projects</option>
              <option value="message">Chat Messages</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-emerald-600 cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-xs text-slate-400 font-medium">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-emerald-600 cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="severity">Highest Severity</option>
          </select>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3.5 px-4">Report ID / Date</th>
                <th className="py-3.5 px-4">Flagged Target</th>
                <th className="py-3.5 px-4">Violation Type</th>
                <th className="py-3.5 px-4">Severity</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Moderator Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedReports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No flagged reports matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedReports.map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* ID & Date */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 font-mono">#{rep.id}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(rep.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </td>

                    {/* Target */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-slate-900 line-clamp-1">{rep.targetTitle}</div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                        <span className="uppercase text-[9.5px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold">
                          {rep.targetType}
                        </span>
                        <span>#{rep.targetId}</span>
                      </div>
                    </td>

                    {/* Reason */}
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                        {rep.reason.replace('_', ' ')}
                      </span>
                      <div className="text-[10.5px] text-slate-400 mt-1">by {rep.reporterName}</div>
                    </td>

                    {/* Severity */}
                    <td className="py-3.5 px-4">
                      {rep.severity === 'critical' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> Critical
                        </span>
                      )}
                      {rep.severity === 'high' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                          High
                        </span>
                      )}
                      {rep.severity === 'medium' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                          Medium
                        </span>
                      )}
                      {rep.severity === 'low' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
                          Low
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {rep.status === 'pending' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pending Review
                        </span>
                      )}
                      {rep.status === 'investigating' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Under Audit
                        </span>
                      )}
                      {rep.status === 'action_taken' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Action Taken
                        </span>
                      )}
                      {rep.status === 'dismissed' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-500 border border-slate-200 inline-flex items-center gap-1">
                          Dismissed
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedReport(rep)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition cursor-pointer"
                          title="Inspect Evidence"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {rep.status !== 'action_taken' && rep.status !== 'dismissed' && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionModal({ report: rep });
                              setAdminNoteInput('');
                            }}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                          >
                            <ShieldAlert className="w-3 h-3" /> Enforce
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>
            Showing <strong className="text-slate-800">{paginatedReports.length}</strong> of <strong className="text-slate-800">{filteredReports.length}</strong> cases
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-700">Page {currentPage} of {totalPages}</span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Inspect Report Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900 text-base">Community Report Details</h3>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Report ID</span>
                  <p className="font-mono font-bold text-slate-800">#{selectedReport.id}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Reported By</span>
                  <p className="font-bold text-slate-800">{selectedReport.reporterName} ({selectedReport.reporterId})</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Target Entity</span>
                  <p className="font-bold text-slate-800">{selectedReport.targetType.toUpperCase()}: {selectedReport.targetId}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase">Severity Tag</span>
                  <p className="font-bold uppercase text-rose-700">{selectedReport.severity}</p>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Target Title / Content Preview</span>
                <p className="p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 text-slate-900 font-semibold">
                  {selectedReport.targetTitle}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Reporter's Complaint Description</span>
                <p className="p-3 bg-slate-900 text-rose-300 font-mono text-[11.5px] rounded-xl mt-1 leading-relaxed">
                  {selectedReport.description}
                </p>
              </div>

              {selectedReport.actionTaken && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-emerald-800 font-bold text-[10.5px] uppercase block mb-1">
                    Enforcement Record
                  </span>
                  <p className="text-emerald-900 text-[11.5px]">{selectedReport.actionTaken}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enforcement Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-slate-900 pb-2 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Take Enforcement Action</h3>
                <p className="text-xs text-slate-500">Case #{actionModal.report.id} · {actionModal.report.targetType} #{actionModal.report.targetId}</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[10.5px] font-bold uppercase text-slate-500">
                Select Administrative Action
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setChosenAction('warn')}
                  className={`p-3 rounded-xl border text-left font-bold transition cursor-pointer ${
                    chosenAction === 'warn'
                      ? 'bg-amber-50 border-amber-400 text-amber-800 shadow-2xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 mb-1 text-amber-600" />
                  Issue Warning
                </button>

                <button
                  type="button"
                  onClick={() => setChosenAction('delist')}
                  className={`p-3 rounded-xl border text-left font-bold transition cursor-pointer ${
                    chosenAction === 'delist'
                      ? 'bg-rose-50 border-rose-400 text-rose-800 shadow-2xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Trash2 className="w-4 h-4 mb-1 text-rose-600" />
                  Delist Content
                </button>

                <button
                  type="button"
                  onClick={() => setChosenAction('suspend')}
                  className={`p-3 rounded-xl border text-left font-bold transition cursor-pointer ${
                    chosenAction === 'suspend'
                      ? 'bg-red-50 border-red-500 text-red-900 shadow-2xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Ban className="w-4 h-4 mb-1 text-red-700" />
                  Suspend Account
                </button>

                <button
                  type="button"
                  onClick={() => setChosenAction('dismiss')}
                  className={`p-3 rounded-xl border text-left font-bold transition cursor-pointer ${
                    chosenAction === 'dismiss'
                      ? 'bg-slate-100 border-slate-400 text-slate-800 shadow-2xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Check className="w-4 h-4 mb-1 text-slate-600" />
                  Dismiss Case
                </button>
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase text-slate-500 mb-1">
                  Enforcement Notes & Audit Log Reason
                </label>
                <textarea
                  rows={2}
                  placeholder="Record justification for internal compliance..."
                  value={adminNoteInput}
                  onChange={(e) => setAdminNoteInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-rose-600 focus:bg-white resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`px-4 py-2 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer ${
                  chosenAction === 'dismiss' ? 'bg-slate-800 hover:bg-slate-700' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                Execute Enforcement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
