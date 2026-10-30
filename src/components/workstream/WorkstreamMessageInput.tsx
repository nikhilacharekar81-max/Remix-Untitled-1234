import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Paperclip, Video, FileSignature, Receipt, ChevronDown,
  MessageSquare, Lock, ShieldCheck, Loader2, FileText, Link as LinkIcon, RotateCcw
} from 'lucide-react';
import { uploadWorkstreamFile } from '../../utils/workstreamUpload';
import { WorkstreamOfferKind } from './types';

type ComposerTab = 'message' | WorkstreamOfferKind | 'refund';

interface WorkstreamMessageInputProps {
  onSendMessage: (text: string) => void;
  onAttachFile: (file: { name: string; size: string; url: string }) => void;
  onStartVideoCall?: () => void;
  /** Creates a real proposal / invoice / deposit request on the server. */
  onCreateOffer?: (input: {
    kind: WorkstreamOfferKind;
    title: string;
    amount: number;
    deliveryDays?: number;
    note?: string;
    reference?: string;
    files?: Array<{ name: string; size: string; url: string }>;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Seller voluntary escrow refund back to buyer wallet (PeoplePerHour "Issue Refund"). */
  onRefundEscrow?: (reason: string) => Promise<{ ok: boolean; error?: string }>;
  /** Seller may send a proposal or deposit request (unfunded inquiry/project, or after first invoice is paid). */
  canSendProposal?: boolean;
  /** Seller of a funded workstream: may raise an invoice to release escrow or bill follow-on work. */
  canRaiseInvoice?: boolean;
  /** Seller of an active funded workstream: may voluntarily refund escrow back to the buyer. */
  canRefundEscrow?: boolean;
  defaultInvoiceAmount?: number;
  defaultInvoiceTitle?: string;
  isGigOrder?: boolean;
  proposalHint?: string;
  invoiceHint?: string;
  orderId?: string;
  workspaceId?: string;
  currencySymbol?: string;
  disabled?: boolean;
  placeholder?: string;
  isCustomOrderStream?: boolean;
}

const inputCls =
  'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition';
const labelCls = 'block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5';

export const WorkstreamMessageInput: React.FC<WorkstreamMessageInputProps> = ({
  onSendMessage,
  onAttachFile,
  onStartVideoCall,
  onCreateOffer,
  onRefundEscrow,
  canSendProposal = false,
  canRaiseInvoice = false,
  canRefundEscrow = false,
  defaultInvoiceAmount = 0,
  defaultInvoiceTitle = '',
  isGigOrder = false,
  proposalHint = 'Not available for this workstream',
  invoiceHint = 'Not available for this workstream',
  orderId,
  workspaceId,
  currencySymbol = '$',
  disabled = false,
  placeholder = 'Click here to reply...',
  isCustomOrderStream = false
}) => {
  const [tab, setTab] = useState<ComposerTab>('message');
  const [text, setText] = useState('');
  const [enterToSend, setEnterToSend] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [invoiceFiles, setInvoiceFiles] = useState<Array<{ name: string; size: string; url: string }>>([]);
  const [refundReason, setRefundReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreOpen]);

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setDays('');
    setNote('');
    setReference('');
    setInvoiceFiles([]);
    setRefundReason('');
    setFormError(null);
  };

  const switchTab = (next: ComposerTab) => {
    setTab(next);
    setMoreOpen(false);
    setFormError(null);
    if (next === 'invoice') {
      if (!amount && defaultInvoiceAmount > 0) setAmount(String(defaultInvoiceAmount));
      if (!title && defaultInvoiceTitle) setTitle(`Final Invoice: ${defaultInvoiceTitle}`.slice(0, 120));
    }
  };

  const submitMessage = () => {
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const modEnter = (e.metaKey || e.ctrlKey) && e.key === 'Enter';
    const plainEnter = enterToSend && e.key === 'Enter' && !e.shiftKey;
    if (modEnter || plainEnter) {
      e.preventDefault();
      submitMessage();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadWorkstreamFile(file, { orderId, workspaceId });
      onAttachFile(result);
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInvoiceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadWorkstreamFile(file, { orderId, workspaceId });
      setInvoiceFiles(prev => [...prev, result]);
    } catch (err: any) {
      setFormError(err?.message || 'File upload failed.');
    } finally {
      if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
    }
  };

  const submitOffer = async () => {
    if (tab === 'message' || tab === 'refund' || !onCreateOffer || submitting) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setFormError(`Enter an amount greater than ${currencySymbol}0.`);
    if (tab === 'invoice' && defaultInvoiceAmount > 0 && amt < defaultInvoiceAmount) {
      return setFormError(`Invoice amount cannot be less than the funded escrow amount (${currencySymbol}${defaultInvoiceAmount.toLocaleString()}).`);
    }
    if (tab !== 'deposit' && title.trim().length < 3) {
      return setFormError(tab === 'proposal' ? 'Add a proposal title (at least 3 characters).' : 'Add a description for the invoice (at least 3 characters).');
    }
    const d = Number(days);
    if (tab === 'proposal' && (!Number.isInteger(d) || d < 1 || d > 365)) return setFormError('Delivery time must be 1-365 days.');

    setSubmitting(true);
    setFormError(null);
    const result = await onCreateOffer({
      kind: tab,
      title: tab === 'deposit' ? (title.trim() || 'Escrow deposit') : title.trim(),
      amount: amt,
      deliveryDays: tab === 'proposal' ? d : undefined,
      note: note.trim() || undefined,
      reference: tab === 'invoice' && reference.trim() ? reference.trim() : undefined,
      files: tab === 'invoice' && invoiceFiles.length > 0 ? invoiceFiles : undefined
    });
    setSubmitting(false);
    if (!result.ok) return setFormError(result.error || 'Could not send. Please try again.');
    resetForm();
    setTab('message');
  };

  const submitRefund = async () => {
    if (!onRefundEscrow || submitting) return;
    if (refundReason.trim().length < 5) {
      return setFormError('Please provide a reason for the refund (at least 5 characters).');
    }
    setSubmitting(true);
    setFormError(null);
    const result = await onRefundEscrow(refundReason.trim());
    setSubmitting(false);
    if (!result.ok) return setFormError(result.error || 'Could not issue refund.');
    resetForm();
    setTab('message');
  };

  const tabBtn = (active: boolean, isDisabled = false, fontClass = 'text-[13px] leading-[17px]') =>
    `px-4 py-3 ${fontClass} font-bold uppercase tracking-wider flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
      isDisabled
        ? 'border-transparent text-slate-300 cursor-not-allowed'
        : active
          ? 'border-emerald-600 text-emerald-700 bg-white cursor-pointer'
          : 'border-transparent text-slate-500 hover:text-fiverr-dark hover:bg-white/60 cursor-pointer'
    }`;

  const proposalOff = !canSendProposal || disabled || !onCreateOffer;
  const invoiceOff = !canRaiseInvoice || disabled || !onCreateOffer;
  const refundOff = !canRefundEscrow || disabled || !onRefundEscrow;

  const headings: Record<WorkstreamOfferKind, { title: string; hint: string; icon: React.ReactNode }> = {
    proposal: {
      title: isCustomOrderStream ? 'Custom Order Proposal' : 'New Proposal',
      hint: isCustomOrderStream
        ? 'Set the scope, price and delivery time. The buyer accepts the proposal and funds escrow to create the Custom Order.'
        : 'Set the scope, price and delivery time. The buyer accepts it and pays into escrow.',
      icon: <FileSignature className="w-4 h-4 text-emerald-600" />
    },
    invoice: {
      title: isCustomOrderStream ? 'Raise Custom Order Invoice' : 'Raise an Invoice & Deliver Work',
      hint: isCustomOrderStream
        ? 'Submit your invoice for completed work under this Custom Order to release escrow.'
        : 'Attach deliverables and submit your invoice to release escrow funds into your wallet.',
      icon: <Receipt className="w-4 h-4 text-emerald-600" />
    },
    deposit: { title: 'Request Deposit', hint: 'Ask the buyer to fund escrow before you start.', icon: <Lock className="w-4 h-4 text-emerald-600" /> }
  };

  return (
    <div className="p-4 sm:p-5 bg-white border-t border-slate-100">
      <div className="bg-slate-50 border border-slate-200 rounded-2xl">
        <div className="flex items-stretch border-b border-slate-200 rounded-t-2xl overflow-visible flex-wrap">
          <button type="button" onClick={() => switchTab('message')} className={tabBtn(tab === 'message', false, '!text-[11px] leading-[15px]') + ' rounded-tl-2xl'}>
            <MessageSquare className="w-3.5 h-3.5" /> Send Message
          </button>

          <button type="button" onClick={() => onStartVideoCall?.()} disabled={!onStartVideoCall} className={tabBtn(false, !onStartVideoCall, '!text-[11px] leading-[15px]')}>
            <Video className="w-3.5 h-3.5" /> Video Call
          </button>

          <button type="button" disabled={proposalOff} title={proposalOff ? proposalHint : (isCustomOrderStream ? 'Send a Custom Order Proposal' : 'Send a Proposal')}
            onClick={() => switchTab('proposal')} className={tabBtn(tab === 'proposal', proposalOff, '!text-[11px] leading-[15px]')}>
            <FileSignature className="w-3.5 h-3.5" /> {isCustomOrderStream ? 'Custom Order Proposal' : 'New Proposal'}
          </button>

          <button type="button" disabled={invoiceOff} title={invoiceOff ? invoiceHint : (isCustomOrderStream ? 'Raise Custom Order Invoice' : 'Raise an Invoice')}
            onClick={() => switchTab('invoice')} className={tabBtn(tab === 'invoice', invoiceOff, '!text-[11px] leading-[15px]')}>
            <Receipt className="w-3.5 h-3.5" /> {isCustomOrderStream ? 'Custom Order Invoice' : 'Raise Invoice'}
          </button>

          <div className="relative" ref={moreRef}>
            <button type="button" onClick={() => setMoreOpen(o => !o)} className={tabBtn(tab === 'deposit' || tab === 'refund' || moreOpen, false, '!text-[11px] leading-[15px]')}
              aria-haspopup="menu" aria-expanded={moreOpen}>
              More <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && (
              <div role="menu" className="absolute left-0 top-full mt-1 z-30 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5">
                <button type="button" role="menuitem" disabled={proposalOff} title={proposalOff ? proposalHint : undefined}
                  onClick={() => switchTab('deposit')}
                  className={`w-full px-3.5 py-2 !text-[11px] leading-[15px] font-bold uppercase tracking-wider flex items-center gap-2 text-left ${proposalOff ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer'}`}>
                  <Lock className="w-3.5 h-3.5" /> Request Deposit
                </button>
                <button type="button" role="menuitem" disabled={refundOff} title={refundOff ? 'Only the seller of an active funded workstream can issue an escrow refund' : undefined}
                  onClick={() => switchTab('refund')}
                  className={`w-full px-3.5 py-2 !text-[11px] leading-[15px] font-bold uppercase tracking-wider flex items-center gap-2 text-left ${refundOff ? 'text-slate-300 cursor-not-allowed' : 'text-rose-600 hover:bg-rose-50 cursor-pointer'}`}>
                  <RotateCcw className="w-3.5 h-3.5" /> Issue Escrow Refund
                </button>
              </div>
            )}
          </div>
        </div>

        {tab === 'message' ? (
          <form onSubmit={(e) => { e.preventDefault(); submitMessage(); }} className="p-3 sm:p-4 space-y-3">
            <div className="relative">
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={placeholder}
                className="w-full px-4 pt-3 pb-10 bg-white border border-slate-200 rounded-xl text-sm text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition resize-none leading-relaxed"
              />
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="absolute right-2 bottom-2 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-fiverr-dark rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Attach File or Deliverable">
                <Paperclip className="w-3.5 h-3.5" /> Attach files
              </button>
            </div>

            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              Keep all payments and project transactions on the platform to stay protected.
            </p>

            <div className="flex items-center justify-end gap-4">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                <input type="checkbox" checked={enterToSend} onChange={(e) => setEnterToSend(e.target.checked)} className="accent-emerald-600 w-3.5 h-3.5" />
                Press enter to send
              </label>
              <button type="submit" disabled={!text.trim() || disabled}
                className="px-7 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 shadow-xs transition cursor-pointer">
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </div>
          </form>
        ) : tab === 'refund' ? (
          <div className="p-4 sm:p-5 space-y-4 bg-white rounded-b-2xl">
            <div className="flex items-start gap-2.5">
              <span className="p-2 bg-rose-50 rounded-xl shrink-0"><RotateCcw className="w-4 h-4 text-rose-600" /></span>
              <div>
                <h4 className="text-sm font-bold text-fiverr-dark">Issue Escrow Refund to Buyer</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Refund the active escrow balance ({currencySymbol}{defaultInvoiceAmount.toLocaleString()}) back to the buyer's wallet and close this order.
                </p>
              </div>
            </div>

            <div>
              <label className={labelCls}>Reason for Refund</label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                maxLength={500}
                className={inputCls + ' resize-none leading-relaxed'}
                placeholder="Explain why you are issuing a full refund of the escrow deposit..."
              />
            </div>

            {formError && <p className="text-xs font-semibold text-rose-600">{formError}</p>}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => { resetForm(); setTab('message'); }} disabled={submitting}
                className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={submitRefund} disabled={submitting || disabled}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-xs transition cursor-pointer">
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Confirm Refund
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4 bg-white rounded-b-2xl">
            <div className="flex items-start gap-2.5">
              <span className="p-2 bg-emerald-50 rounded-xl shrink-0">{headings[tab].icon}</span>
              <div>
                <h4 className="text-sm font-bold text-fiverr-dark">{headings[tab].title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{headings[tab].hint}</p>
              </div>
            </div>

            {tab === 'invoice' && defaultInvoiceAmount > 0 && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-2">
                <Receipt className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">{isGigOrder ? 'Gig Escrow Policy:' : 'Escrow Coverage:'}</span>{' '}
                  {currencySymbol}{defaultInvoiceAmount.toLocaleString()} is currently held in escrow. When the buyer pays this invoice, the funds are released directly to your wallet.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tab !== 'deposit' && (
                <div className="sm:col-span-2">
                  <label className={labelCls}>{tab === 'proposal' ? (isCustomOrderStream ? 'Custom Order Proposal Title' : 'Proposal title') : (isCustomOrderStream ? 'Custom Order Invoice Description' : 'Invoice Description')}</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputCls}
                    placeholder={tab === 'proposal' ? 'e.g. Full-stack feature milestone — Phase 2' : (isCustomOrderStream ? 'e.g. Custom Order Invoice — Completed deliverables' : 'e.g. Final Invoice — Completed deliverables')} />
                </div>
              )}
              <div>
                <label className={labelCls}>Amount ({currencySymbol})</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inputCls} placeholder="0.00" />
              </div>
              {tab === 'proposal' && (
                <div>
                  <label className={labelCls}>Delivery time (days)</label>
                  <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className={inputCls} placeholder="e.g. 5" />
                </div>
              )}
              {tab === 'invoice' && (
                <div>
                  <label className={labelCls}>Live Link / Reference URL (Optional)</label>
                  <div className="relative">
                    <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} placeholder="https://..." />
                  </div>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className={labelCls}>{tab === 'invoice' ? (isCustomOrderStream ? 'Custom Order Delivery Notes & Breakdown' : 'Delivery Notes & Breakdown') : 'Note (optional)'}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000}
                  className={inputCls + ' resize-none leading-relaxed'}
                  placeholder={tab === 'invoice' ? (isCustomOrderStream ? 'Describe the completed work under this Custom Order...' : 'Describe the completed work and deliverables included with this invoice...') : 'Add scope, terms or anything the buyer should know...'} />
              </div>

              {tab === 'invoice' && (
                <div className="sm:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={labelCls + ' mb-0'}>Attached Deliverables ({invoiceFiles.length})</span>
                    <input type="file" ref={invoiceFileInputRef} onChange={handleInvoiceFileChange} className="hidden" />
                    <button
                      type="button"
                      onClick={() => invoiceFileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5" /> Attach Deliverable File
                    </button>
                  </div>
                  {invoiceFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {invoiceFiles.map((f, idx) => (
                        <div key={idx} className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-bold text-fiverr-dark">{f.name}</span>
                          <span className="text-xs text-slate-400 font-mono">({f.size})</span>
                          <button
                            type="button"
                            onClick={() => setInvoiceFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-600 font-bold cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {formError && <p className="text-xs font-semibold text-rose-600">{formError}</p>}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                {tab === 'invoice'
                  ? (isCustomOrderStream ? 'When the buyer pays this Custom Order Invoice, funds are released directly to your wallet.' : 'When the buyer pays this invoice, funds are credited to your wallet.')
                  : (isCustomOrderStream ? 'The buyer funds escrow when they accept the Custom Order Proposal.' : 'The buyer pays into escrow when they accept.')}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { resetForm(); setTab('message'); }} disabled={submitting}
                  className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                  Cancel
                </button>
                <button type="button" onClick={submitOffer} disabled={submitting || disabled}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-xs transition cursor-pointer">
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {tab === 'invoice' ? (isCustomOrderStream ? 'Send Custom Order Invoice' : 'Send Invoice') : (isCustomOrderStream ? 'Send Custom Order Proposal' : 'Send')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
