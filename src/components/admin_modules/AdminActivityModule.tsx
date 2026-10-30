import React, { useState, useMemo } from 'react';
import {
  Activity, ShieldCheck, ShieldAlert, AlertTriangle, Search, Filter,
  Eye, Download, RefreshCw, ChevronLeft, ChevronRight, User, Clock,
  FileText, Lock, Globe, Server, CheckCircle2, X, Terminal, Database,
  ArrowUpRight, AlertCircle, Key, UserCheck, DollarSign
} from 'lucide-react';
import { DEFAULT_AVATAR } from '../../constants';

export type EventSeverity = 'info' | 'warning' | 'critical' | 'security';
export type EventCategory = 'auth' | 'financial' | 'moderation' | 'system' | 'user_management';

export interface AuditLogEvent {
  id: string;
  timestamp: string;
  adminName: string;
  adminEmail: string;
  adminAvatar: string;
  action: string;
  category: EventCategory;
  severity: EventSeverity;
  targetResource: string;
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failed' | 'flagged';
  details: string;
  metadataJson?: Record<string, any>;
}

interface AdminActivityModuleProps {
  initialLogs?: AuditLogEvent[];
}

export const AdminActivityModule: React.FC<AdminActivityModuleProps> = ({
  initialLogs
}) => {
  const [logs, setLogs] = useState<AuditLogEvent[]>(() => initialLogs || []);

  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | EventSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | EventCategory>('all');
  const [selectedEvent, setSelectedEvent] = useState<AuditLogEvent | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Filtered Events
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch =
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.adminName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.targetResource.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ipAddress.includes(searchTerm) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
      const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;

      return matchesSearch && matchesSeverity && matchesCategory;
    });
  }, [logs, searchTerm, severityFilter, categoryFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  // Statistics
  const stats = useMemo(() => {
    const total = logs.length;
    const security = logs.filter(l => l.severity === 'security').length;
    const critical = logs.filter(l => l.severity === 'critical').length;
    const financial = logs.filter(l => l.category === 'financial').length;
    return { total, security, critical, financial };
  }, [logs]);

  const exportAuditCsv = () => {
    const headers = ['ID', 'Timestamp', 'Admin', 'Action', 'Category', 'Severity', 'Target', 'IP', 'Status'];
    const rows = logs.map(l => [
      l.id,
      `"${l.timestamp}"`,
      `"${l.adminName}"`,
      `"${l.action}"`,
      l.category,
      l.severity,
      `"${l.targetResource}"`,
      l.ipAddress,
      l.status
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Security Audit Trail & Activity Logs</h2>
              <p className="text-sm text-slate-500">Immutable ledger of administrative mutations, auth challenges, and financial movements.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportAuditCsv}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => setCurrentPage(1)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
          >
            <RefreshCw className="w-4 h-4" />
            Live Sync
          </button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Audit Events (24h)</span>
            <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
              <Terminal className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{stats.total}</span>
            <span className="text-xs text-slate-500 ml-2">records logged</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-rose-700">Security Challenges</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-rose-700">{stats.security}</span>
            <span className="text-xs text-rose-600 ml-2">threats / blocked</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-amber-700">Critical Mutations</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-amber-700">{stats.critical}</span>
            <span className="text-xs text-amber-600 ml-2">high impact actions</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-emerald-700">Financial Ledger Acts</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-emerald-700">{stats.financial}</span>
            <span className="text-xs text-emerald-600 ml-2">escrow/payout audits</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search action, admin, IP address, target resource..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Categories</option>
            <option value="auth">Authentication</option>
            <option value="financial">Financial / Escrow</option>
            <option value="moderation">Moderation</option>
            <option value="system">System / Database</option>
            <option value="user_management">User Management</option>
          </select>

          <select
            value={severityFilter}
            onChange={e => { setSeverityFilter(e.target.value as any); setCurrentPage(1); }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="security">Security Alert</option>
          </select>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-6">Timestamp & Action</th>
                <th className="py-4 px-6">Initiating Actor</th>
                <th className="py-4 px-6">Target Resource</th>
                <th className="py-4 px-6">Severity & Category</th>
                <th className="py-4 px-6">Origin IP</th>
                <th className="py-4 px-6 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No audit records matching your search or filters.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-4 px-6">
                      <div className="font-mono text-xs font-bold text-slate-900">{log.action}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {log.timestamp}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <img
                          src={log.adminAvatar || DEFAULT_AVATAR}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover border border-slate-200"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                        />
                        <div>
                          <div className="font-semibold text-slate-900">{log.adminName}</div>
                          <div className="text-[10px] text-slate-400">{log.adminEmail}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6 max-w-xs">
                      <div className="font-semibold text-slate-800 truncate">{log.targetResource}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{log.details}</div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1 items-start">
                        {log.severity === 'info' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            INFO
                          </span>
                        )}
                        {log.severity === 'warning' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            WARNING
                          </span>
                        )}
                        {log.severity === 'critical' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            CRITICAL
                          </span>
                        )}
                        {log.severity === 'security' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            SECURITY ALERT
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">
                          {log.category.replace('_', ' ')}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-6 font-mono text-[11px] text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        {log.ipAddress}
                      </div>
                      <div className="text-[10px] text-emerald-600 mt-0.5 font-sans font-semibold">
                        {log.status === 'success' ? '✓ Verified' : '⚠ Intercepted'}
                      </div>
                    </td>

                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => setSelectedEvent(log)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {paginatedLogs.length} of {filteredLogs.length} audit entries</span>
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

      {/* AUDIT EVENT INSPECTION MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedEvent.action}</h3>
                  <p className="text-xs text-slate-500">{selectedEvent.id} • {selectedEvent.timestamp}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Initiating Actor</span>
                <span className="text-slate-800 font-bold mt-1 block">{selectedEvent.adminName}</span>
                <span className="text-slate-500 text-[11px]">{selectedEvent.adminEmail}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Origin Network</span>
                <span className="text-slate-800 font-mono font-bold mt-1 block">{selectedEvent.ipAddress}</span>
                <span className="text-slate-500 text-[10px] truncate block">{selectedEvent.userAgent}</span>
              </div>
            </div>

            <div className="text-xs space-y-1">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Target Resource</span>
              <p className="text-slate-900 font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-100">{selectedEvent.targetResource}</p>
            </div>

            <div className="text-xs space-y-1">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Event Description</span>
              <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">{selectedEvent.details}</p>
            </div>

            {selectedEvent.metadataJson && (
              <div className="space-y-1">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Structured Metadata (JSON)</span>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono overflow-x-auto max-h-40">
                  {JSON.stringify(selectedEvent.metadataJson, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
