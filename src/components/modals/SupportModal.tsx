import React from 'react';
import { HelpCircle } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  supportSubject: string;
  setSupportSubject: (subject: string) => void;
  supportMessage: string;
  setSupportMessage: (message: string) => void;
  onSubmitTicket: (e: React.FormEvent, isAppeal?: boolean) => void;
  isAppeal?: boolean;
}

export const SupportModal: React.FC<SupportModalProps> = ({
  isOpen,
  onClose,
  supportSubject,
  setSupportSubject,
  supportMessage,
  setSupportMessage,
  onSubmitTicket,
  isAppeal
}) => {
  if (!isOpen) return null;

  const isAppealContext = Boolean(isAppeal || supportSubject.toLowerCase().includes('appeal'));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-fiverr-dark flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-emerald-600" />
              <span>Contact WorkSphere Support Desk</span>
            </h3>
            <p className="text-xs text-fiverr-muted mt-0.5">Submit an appeal, ask questions about restrictions, or request support assistance.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-fiverr-dark hover:bg-slate-100 rounded-xl transition-colors text-xs font-bold cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        <form onSubmit={(e) => onSubmitTicket(e, isAppealContext)} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider mb-2">Inquiry Subject / Topic</label>
            <input 
              type="text" 
              placeholder="e.g. Account Status Review / Appeal Request" 
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-fiverr-dark uppercase tracking-wider mb-2">Detailed Message / Explanation</label>
            <textarea 
              rows={5}
              placeholder="Please describe your inquiry or appeal details..."
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-fiverr-dark hover:text-fiverr-dark bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {isAppealContext ? 'Submit Account Appeal' : 'Submit Support Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
