import React from 'react';
import { MessageSquare, HelpCircle } from 'lucide-react';

interface UserEmail {
  id: string;
  type: string;
  sentAt: string;
  subject: string;
  body: string;
  read: boolean;
}

interface EmailNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmails: UserEmail[];
  userEmail: string;
  onMarkAsRead: (emailId: string) => void;
  onOpenSupport: () => void;
}

export const EmailNotificationsModal: React.FC<EmailNotificationsModalProps> = ({
  isOpen,
  onClose,
  userEmails,
  userEmail,
  onMarkAsRead,
  onOpenSupport
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-fiverr-dark flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              <span>Official Email Notifications & System Inbox</span>
            </h3>
            <p className="text-xs text-fiverr-muted mt-0.5">
              Official emails dispatched to {userEmail || 'your account'} regarding account status, compliance, and security.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-fiverr-dark hover:bg-slate-100 rounded-xl transition-colors text-xs font-bold"
          >
            ✕ Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {userEmails.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">No official email notifications found.</div>
          ) : (
            userEmails.map(em => {
              let badgeColor = 'bg-slate-100 text-fiverr-dark';
              if (em.type === 'SUSPEND') badgeColor = 'bg-red-100 text-red-800 border-red-200';
              else if (em.type === 'RESTRICT') badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
              else if (em.type === 'IMPERSONATE') badgeColor = 'bg-indigo-100 text-indigo-800 border-indigo-200';

              return (
                <div key={em.id} className={`p-5 rounded-2xl border space-y-3 transition-all ${em.read ? 'bg-slate-50/60 border-slate-200' : 'bg-white border-slate-300 shadow-sm'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-md border ${badgeColor}`}>
                      {em.type} NOTICE
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">{em.sentAt}</span>
                  </div>

                  <h4 className="text-sm font-bold text-fiverr-dark">{em.subject}</h4>
                  <p className="text-xs text-fiverr-dark whitespace-pre-wrap leading-relaxed bg-white p-3 rounded-xl border border-slate-200/80">
                    {em.body}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    {!em.read && (
                      <button 
                        onClick={() => onMarkAsRead(em.id)}
                        className="text-[11px] font-bold text-fiverr-muted hover:text-slate-800 underline cursor-pointer"
                      >
                        Mark as Read
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        onClose();
                        onOpenSupport();
                      }}
                      className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-emerald-400 transition-colors shadow-xs ml-auto flex items-center gap-1.5 cursor-pointer"
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>Contact Support Desk</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
