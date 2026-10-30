import React, { useState, useMemo } from 'react';
import { formatMessageTime } from '../../utils/messageTime';
import {
  MessageSquare, Search, Filter, Eye, AlertTriangle, ShieldCheck,
  Clock, X, Check, RefreshCw, ChevronLeft, ChevronRight,
  User, Ban, ShieldAlert, ArrowRight, Download, Send, AlertCircle,
  Phone, Mail, DollarSign, Lock, CheckCircle2, MessageCircle
} from 'lucide-react';
import { DEFAULT_AVATAR } from '../../constants';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderRole: 'client' | 'freelancer';
  text: string;
  timestamp: string;
  flagged?: boolean;
  flagReason?: string;
}

interface ConversationThread {
  id: string;
  orderId?: string;
  projectId?: string;
  projectOrGigTitle: string;
  participantOne: {
    id: string;
    name: string;
    avatar: string;
    role: 'client' | 'freelancer';
    email: string;
    status: 'active' | 'warned' | 'suspended';
  };
  participantTwo: {
    id: string;
    name: string;
    avatar: string;
    role: 'client' | 'freelancer';
    email: string;
    status: 'active' | 'warned' | 'suspended';
  };
  lastMessageSnippet: string;
  lastMessageTime: string;
  totalMessages: number;
  moderationStatus: 'clean' | 'flagged_off_platform' | 'flagged_payment_evasion' | 'warning_issued' | 'muted';
  flaggedCount: number;
  flagReason?: string;
  messages: ChatMessage[];
}

interface AdminMessagesModuleProps {
  initialThreads?: ConversationThread[];
  onModerateThread?: (threadId: string, action: string, note?: string) => void;
}

export const AdminMessagesModule: React.FC<AdminMessagesModuleProps> = ({
  initialThreads,
  onModerateThread
}) => {
  const [threads, setThreads] = useState<ConversationThread[]>(() => initialThreads || []);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'flagged' | 'clean' | 'muted'>('all');
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const [warningModalThread, setWarningModalThread] = useState<ConversationThread | null>(null);
  const [warningMessage, setWarningMessage] = useState('');
  const [warningType, setWarningType] = useState<'formal_warning' | 'mute_24h' | 'suspend_account'>('formal_warning');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Filtered threads
  const filteredThreads = useMemo(() => {
    return threads.filter(thread => {
      const matchesSearch =
        thread.participantOne.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        thread.participantTwo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        thread.projectOrGigTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        thread.lastMessageSnippet.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'flagged') {
        matchesStatus = thread.moderationStatus.startsWith('flagged_') || thread.moderationStatus === 'warning_issued';
      } else if (statusFilter === 'clean') {
        matchesStatus = thread.moderationStatus === 'clean';
      } else if (statusFilter === 'muted') {
        matchesStatus = thread.moderationStatus === 'muted';
      }

      return matchesSearch && matchesStatus;
    });
  }, [threads, searchTerm, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredThreads.length / itemsPerPage) || 1;
  const paginatedThreads = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredThreads.slice(start, start + itemsPerPage);
  }, [filteredThreads, currentPage, itemsPerPage]);

  // Statistics
  const stats = useMemo(() => {
    const total = threads.length;
    const flagged = threads.filter(t => t.moderationStatus.startsWith('flagged_') || t.moderationStatus === 'warning_issued').length;
    const offPlatform = threads.filter(t => t.moderationStatus === 'flagged_off_platform').length;
    const paymentEvasion = threads.filter(t => t.moderationStatus === 'flagged_payment_evasion').length;
    return { total, flagged, offPlatform, paymentEvasion };
  }, [threads]);

  // Actions
  const handleMuteThread = (threadId: string) => {
    setThreads(prev =>
      prev.map(t =>
        t.id === threadId
          ? { ...t, moderationStatus: 'muted' as const }
          : t
      )
    );
    if (selectedThread && selectedThread.id === threadId) {
      setSelectedThread(prev => prev ? { ...prev, moderationStatus: 'muted' as const } : null);
    }
    if (onModerateThread) {
      onModerateThread(threadId, 'mute_thread');
    }
  };

  const handleDismissFlag = (threadId: string) => {
    setThreads(prev =>
      prev.map(t =>
        t.id === threadId
          ? { ...t, moderationStatus: 'clean' as const, flaggedCount: 0, flagReason: undefined }
          : t
      )
    );
    if (selectedThread && selectedThread.id === threadId) {
      setSelectedThread(prev => prev ? { ...prev, moderationStatus: 'clean' as const, flaggedCount: 0, flagReason: undefined } : null);
    }
    if (onModerateThread) {
      onModerateThread(threadId, 'dismiss_flag');
    }
  };

  const handleApplyWarning = () => {
    if (!warningModalThread) return;
    const updatedStatus = warningType === 'mute_24h' ? 'muted' : 'warning_issued';

    setThreads(prev =>
      prev.map(t =>
        t.id === warningModalThread.id
          ? {
              ...t,
              moderationStatus: updatedStatus as any,
              flagReason: `Moderator Notice: ${warningMessage || 'Platform terms enforcement'}`
            }
          : t
      )
    );

    if (onModerateThread) {
      onModerateThread(warningModalThread.id, warningType, warningMessage);
    }

    setWarningModalThread(null);
    setWarningMessage('');
  };

  const exportChatLogs = () => {
    const jsonStr = JSON.stringify(threads, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-moderation-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Communication & Chat Moderation Hub</h2>
              <p className="text-sm text-slate-500">Monitor inter-user conversations, detect off-platform leakages, and enforce platform trust.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportChatLogs}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            Export Logs
          </button>
          <button
            onClick={() => setCurrentPage(1)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Stream
          </button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Active Threads</span>
            <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
              <MessageCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{stats.total}</span>
            <span className="text-xs text-slate-500 ml-2">monitored</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-amber-700">Flagged For Review</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-amber-700">{stats.flagged}</span>
            <span className="text-xs text-amber-600 ml-2">policy alerts</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-rose-700">Payment Evasion</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-rose-700">{stats.paymentEvasion}</span>
            <span className="text-xs text-rose-600 ml-2">fee bypass attempts</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-purple-700">Off-Platform Contacts</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Phone className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-purple-700">{stats.offPlatform}</span>
            <span className="text-xs text-purple-600 ml-2">phone/WhatsApp/email</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by participant name, project, or message snippet..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <button
            onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Threads
          </button>
          <button
            onClick={() => { setStatusFilter('flagged'); setCurrentPage(1); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              statusFilter === 'flagged'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Flagged ({stats.flagged})
          </button>
          <button
            onClick={() => { setStatusFilter('clean'); setCurrentPage(1); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              statusFilter === 'clean'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            Clean
          </button>
          <button
            onClick={() => { setStatusFilter('muted'); setCurrentPage(1); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              statusFilter === 'muted'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            Muted
          </button>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-6">Participants</th>
                <th className="py-4 px-6">Associated Project / Order</th>
                <th className="py-4 px-6">Latest Snippet</th>
                <th className="py-4 px-6">Safety Status</th>
                <th className="py-4 px-6 text-right">Moderation Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedThreads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No conversation threads matching your filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedThreads.map(thread => (
                  <tr key={thread.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-4 px-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={thread.participantOne.avatar || DEFAULT_AVATAR}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover border border-slate-200"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                          />
                          <div>
                            <span className="font-semibold text-slate-900">{thread.participantOne.name}</span>
                            <span className="ml-1.5 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Client</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <img
                            src={thread.participantTwo.avatar || DEFAULT_AVATAR}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover border border-slate-200"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                          />
                          <div>
                            <span className="font-semibold text-slate-900">{thread.participantTwo.name}</span>
                            <span className="ml-1.5 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">Freelancer</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6 max-w-xs">
                      <div className="font-semibold text-slate-900 truncate">{thread.projectOrGigTitle}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        {thread.orderId && <span>Order: #{thread.orderId}</span>}
                        {thread.projectId && <span>Project: #{thread.projectId}</span>}
                        <span>• {thread.totalMessages} msgs</span>
                      </div>
                    </td>

                    <td className="py-4 px-6 max-w-xs">
                      <p className="text-slate-600 truncate italic">"{thread.lastMessageSnippet}"</p>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">{thread.lastMessageTime}</span>
                    </td>

                    <td className="py-4 px-6">
                      {thread.moderationStatus === 'clean' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Clean
                        </span>
                      )}
                      {thread.moderationStatus === 'flagged_off_platform' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          <Phone className="w-3.5 h-3.5" /> Off-Platform Contact
                        </span>
                      )}
                      {thread.moderationStatus === 'flagged_payment_evasion' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle className="w-3.5 h-3.5" /> Payment Evasion
                        </span>
                      )}
                      {thread.moderationStatus === 'warning_issued' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertCircle className="w-3.5 h-3.5" /> Warning Issued
                        </span>
                      )}
                      {thread.moderationStatus === 'muted' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                          <Ban className="w-3.5 h-3.5" /> Muted Thread
                        </span>
                      )}
                      {thread.flagReason && (
                        <p className="text-[10px] text-rose-600 mt-1 line-clamp-1">{thread.flagReason}</p>
                      )}
                    </td>

                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedThread(thread)}
                          title="Inspect Full Transcript"
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setWarningModalThread(thread)}
                          title="Issue Policy Warning"
                          className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition"
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMuteThread(thread.id)}
                          title="Mute / Freeze Conversation"
                          className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
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

        {/* PAGINATION */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {paginatedThreads.length} of {filteredThreads.length} conversation threads</span>
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

      {/* TRANSCRIPT INSPECTION MODAL */}
      {selectedThread && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Conversation Transcript Audit</h3>
                <p className="text-xs text-slate-500">{selectedThread.projectOrGigTitle}</p>
              </div>
              <button
                onClick={() => setSelectedThread(null)}
                className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {selectedThread.messages.map(msg => (
                <div
                  key={msg.id}
                  className={`p-3.5 rounded-2xl border ${
                    msg.flagged
                      ? 'bg-rose-50/80 border-rose-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <img 
                        src={msg.senderAvatar || DEFAULT_AVATAR} 
                        alt="" 
                        className="w-5 h-5 rounded-full object-cover" 
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                      />
                      <span className="text-xs font-bold text-slate-900">{msg.senderName}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-400">({msg.senderRole})</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{formatMessageTime(msg.timestamp)}</span>
                  </div>
                  <p className="text-xs text-slate-700">{msg.text}</p>
                  {msg.flagged && (
                    <div className="mt-2 pt-2 border-t border-rose-200 flex items-center gap-2 text-[11px] font-semibold text-rose-700">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {msg.flagReason}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDismissFlag(selectedThread.id)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl border border-emerald-200 transition"
                >
                  Dismiss Flag / Mark Clean
                </button>
                <button
                  onClick={() => handleMuteThread(selectedThread.id)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl border border-rose-200 transition"
                >
                  Mute Thread
                </button>
              </div>
              <button
                onClick={() => setSelectedThread(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POLICY WARNING MODAL */}
      {warningModalThread && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Issue Policy Warning</h3>
              </div>
              <button
                onClick={() => setWarningModalThread(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Enforcement Action</label>
                <select
                  value={warningType}
                  onChange={e => setWarningType(e.target.value as any)}
                  className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="formal_warning">Formal Trust & Safety Warning Notice</option>
                  <option value="mute_24h">24-Hour Messaging Suspension</option>
                  <option value="suspend_account">Escalate to Account Suspension</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Warning Notice & Justification</label>
                <textarea
                  rows={3}
                  placeholder="Specify violation reason (e.g. attempted PayPal bypass, off-platform solicitations)..."
                  value={warningMessage}
                  onChange={e => setWarningMessage(e.target.value)}
                  className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setWarningModalThread(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyWarning}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition shadow-xs"
              >
                Dispatch Warning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
