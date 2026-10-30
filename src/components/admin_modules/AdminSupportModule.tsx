import React, { useState, useMemo } from 'react';
import {
  HelpCircle, Search, Filter, MessageSquare, Send, CheckCircle2,
  Clock, AlertTriangle, X, Eye, User, ChevronLeft, ChevronRight,
  RefreshCw, Check, Tag, ShieldCheck, Mail
} from 'lucide-react';
import { SupportTicket } from '../../types';

interface AdminSupportModuleProps {
  initialTickets?: SupportTicket[];
  onReplyTicket?: (ticketId: string, replyText: string) => void;
  onUpdateTicketStatus?: (ticketId: string, status: SupportTicket['status']) => void;
}

export const AdminSupportModule: React.FC<AdminSupportModuleProps> = ({
  initialTickets = [],
  onReplyTicket,
  onUpdateTicketStatus
}) => {
  // Local robust state for support tickets
  const [tickets, setTickets] = useState<SupportTicket[]>(() => initialTickets || []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'priority'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Selected ticket for chat reply thread
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Metrics
  const metrics = useMemo(() => {
    const openCount = tickets.filter(t => t.status === 'open').length;
    const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
    const urgentCount = tickets.filter(t => t.priority === 'urgent' && t.status !== 'closed' && t.status !== 'resolved').length;
    const resolvedCount = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
    return { openCount, inProgressCount, urgentCount, resolvedCount };
  }, [tickets]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        t.id.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        t.userId.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.messages.some(m => m.text.toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    }).sort((a, b) => {
      if (sortBy === 'priority') {
        const score = (p: string) => p === 'urgent' ? 4 : p === 'high' ? 3 : p === 'medium' ? 2 : 1;
        return score(b.priority) - score(a.priority);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tickets, searchQuery, statusFilter, priorityFilter, sortBy]);

  const totalPages = Math.ceil(filteredTickets.length / pageSize) || 1;
  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, currentPage, pageSize]);

  // Reply submission
  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyInput.trim()) return;

    const newMsg = {
      sender: 'Super Admin Agent',
      text: replyInput.trim(),
      timestamp: new Date().toISOString()
    };

    const updated = {
      ...activeTicket,
      status: 'in_progress' as const,
      messages: [...activeTicket.messages, newMsg]
    };

    setTickets(prev => prev.map(t => t.id === activeTicket.id ? updated : t));
    setActiveTicket(updated);

    if (onReplyTicket) {
      onReplyTicket(activeTicket.id, replyInput.trim());
    }

    setReplyInput('');
    showToast(`Reply dispatched to ${activeTicket.userName}. Ticket moved to In Progress.`);
  };

  // Status toggle
  const handleSetStatus = (ticketId: string, newStatus: SupportTicket['status']) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
    if (activeTicket && activeTicket.id === ticketId) {
      setActiveTicket(prev => prev ? { ...prev, status: newStatus } : null);
    }
    if (onUpdateTicketStatus) {
      onUpdateTicketStatus(ticketId, newStatus);
    }
    showToast(`Ticket #${ticketId} status updated to ${newStatus.toUpperCase()}.`);
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
            <span className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <HelpCircle className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Support Ticket Help Desk</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Resolve buyer and freelancer queries, billing issues, 2FA recovery, and escrow assistance in real time.
          </p>
        </div>

        <button
          type="button"
          onClick={() => showToast('Support inbox refreshed with live messages.')}
          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-1.5 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Refresh Inbox</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Unassigned Open</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{metrics.openCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Awaiting first agent response</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Urgent Priority</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{metrics.urgentCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">SLA: 1-hour resolution window</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">In Progress</span>
            <MessageSquare className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics.inProgressCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Active ongoing conversation</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Resolved Tickets</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{metrics.resolvedCount}</div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Satisfied member queries</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by ticket ID, user, subject, or message text..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-purple-600 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-purple-600 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value as any); setCurrentPage(1); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-purple-600 cursor-pointer"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
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
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-purple-600 cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="priority">Highest Priority</option>
          </select>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3.5 px-4">Ticket ID / Created</th>
                <th className="py-3.5 px-4">Requester</th>
                <th className="py-3.5 px-4">Subject</th>
                <th className="py-3.5 px-4">Priority</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedTickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No support tickets found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* ID & Date */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 font-mono">#{t.id}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Requester */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{t.userName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">ID: {t.userId}</div>
                    </td>

                    {/* Subject */}
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="font-bold text-slate-900 line-clamp-1">{t.subject}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {t.messages[t.messages.length - 1]?.text}
                      </div>
                    </td>

                    {/* Priority */}
                    <td className="py-3.5 px-4">
                      {t.priority === 'urgent' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> Urgent
                        </span>
                      )}
                      {t.priority === 'high' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                          High
                        </span>
                      )}
                      {t.priority === 'medium' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                          Medium
                        </span>
                      )}
                      {t.priority === 'low' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center gap-1">
                          Low
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {t.status === 'open' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Open
                        </span>
                      )}
                      {t.status === 'in_progress' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> In Progress
                        </span>
                      )}
                      {t.status === 'resolved' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Resolved
                        </span>
                      )}
                      {t.status === 'closed' && (
                        <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-500 border border-slate-200 inline-flex items-center gap-1">
                          Closed
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setActiveTicket(t); setReplyInput(''); }}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Open Thread
                        </button>
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
            Showing <strong className="text-slate-800">{paginatedTickets.length}</strong> of <strong className="text-slate-800">{filteredTickets.length}</strong> tickets
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

      {/* Ticket Reply & Conversation Modal */}
      {activeTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 font-sans animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{activeTicket.subject}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Ticket #{activeTicket.id} · Requester: {activeTicket.userName}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTicket(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick status bar */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 shrink-0 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] font-bold uppercase text-slate-400">Current Status:</span>
                <span className="font-bold text-slate-800 uppercase text-[11px]">{activeTicket.status.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {activeTicket.status !== 'resolved' && (
                  <button
                    type="button"
                    onClick={() => handleSetStatus(activeTicket.id, 'resolved')}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[10.5px] transition cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Mark Resolved
                  </button>
                )}
                {activeTicket.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={() => handleSetStatus(activeTicket.id, 'closed')}
                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-[10.5px] transition cursor-pointer"
                  >
                    Close Ticket
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Message Feed */}
            <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-slate-50/50 rounded-2xl border border-slate-100">
              {activeTicket.messages.map((m, i) => {
                const isAdmin = m.sender.toLowerCase().includes('admin') || m.sender.toLowerCase().includes('support') || m.sender.toLowerCase().includes('desk');
                return (
                  <div key={i} className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
                      <span className="font-bold text-slate-700">{m.sender}</span>
                      <span>·</span>
                      <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className={`p-3 rounded-2xl max-w-lg text-xs leading-relaxed ${
                      isAdmin
                        ? 'bg-purple-600 text-white rounded-tr-xs shadow-xs'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs shadow-2xs'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Input Form */}
            <form onSubmit={handleSendReply} className="shrink-0 flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Type administrator response..."
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-purple-600 focus:bg-white"
              />
              <button
                type="submit"
                disabled={!replyInput.trim()}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Reply</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
