import React, { useState } from 'react';
import { X, ShieldCheck, DollarSign, Calendar, User, FileText } from 'lucide-react';
import { UserAccount, Gig } from '../../types';

interface StartWorkstreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    partnerId: string;
    amount: number;
    turnaroundDays: number;
    requirements: string;
  }) => void;
  usersList?: UserAccount[];
  currentUser?: UserAccount | null;
}

export const StartWorkstreamModal: React.FC<StartWorkstreamModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  usersList = [],
  currentUser
}) => {
  const [title, setTitle] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [amount, setAmount] = useState('250');
  const [turnaroundDays, setTurnaroundDays] = useState('5');
  const [requirements, setRequirements] = useState('');

  if (!isOpen) return null;

  const candidates = usersList.filter(u => u.id !== currentUser?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !partnerId) return;

    onSubmit({
      title: title.trim(),
      partnerId,
      amount: Math.max(1, Number(amount) || 50),
      turnaroundDays: Math.max(1, Number(turnaroundDays) || 3),
      requirements: requirements.trim() || 'Workstream scope agreed via initial brief.'
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-fiverr-dark">Start New Workstream</h3>
              <p className="text-[11px] text-slate-400">Initiate a secure escrow collaboration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
              Workstream Scope / Project Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Full Stack MVP Development or Logo Identity Design"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
              Select Collaborator / Partner
            </label>
            <select
              required
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark focus:outline-none focus:border-emerald-500 focus:bg-white"
            >
              <option value="">Choose a freelancer or client...</option>
              {candidates.map((cand) => (
                <option key={cand.id} value={cand.id}>
                  {cand.name} ({cand.role}) - {cand.title || cand.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
                Escrow Budget ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  min="5"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark font-mono font-bold focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
                Turnaround (Days)
              </label>
              <input
                type="number"
                min="1"
                required
                value={turnaroundDays}
                onChange={(e) => setTurnaroundDays(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark font-mono font-bold focus:outline-none focus:border-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
              Requirements & Agreed Milestones
            </label>
            <textarea
              rows={3}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="Outline deliverables, deadlines, design formats, or repository links..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white resize-none"
            />
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-[11px] text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Escrow funds will remain 100% protected until client approves completed work.</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-fiverr-dark font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              Start Workstream
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
