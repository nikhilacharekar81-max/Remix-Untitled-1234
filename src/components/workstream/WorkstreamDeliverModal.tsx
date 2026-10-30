import React, { useState, useRef, useEffect } from 'react';
import { Receipt, X, Upload, Link as LinkIcon, FileText, Trash2, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { WorkstreamItem } from './types';
import { uploadWorkstreamFile } from '../../utils/workstreamUpload';

interface WorkstreamDeliverModalProps {
  isOpen: boolean;
  order: WorkstreamItem;
  escrowRemaining?: number;
  currencySymbol?: string;
  onClose: () => void;
  onSubmitDelivery: (delivery: {
    notes: string;
    reference?: string;
    files: Array<{ name: string; size: string; url: string }>;
    invoiceTitle?: string;
    invoiceAmount?: number;
  }) => void;
}

export const WorkstreamDeliverModal: React.FC<WorkstreamDeliverModalProps> = ({
  isOpen,
  order,
  escrowRemaining,
  currencySymbol = '$',
  onClose,
  onSubmitDelivery
}) => {
  const defaultEscrow = escrowRemaining !== undefined && escrowRemaining > 0 ? escrowRemaining : Number(order.amount || 0);
  const [invoiceTitle, setInvoiceTitle] = useState(`Invoice for ${order.title}`);
  const [invoiceAmount, setInvoiceAmount] = useState(String(defaultEscrow || ''));
  const [notes, setNotes] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; size: string; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInvoiceTitle(`Invoice for ${order.title}`);
      setInvoiceAmount(String(defaultEscrow || ''));
    }
  }, [isOpen, order.title, defaultEscrow]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    if (!selected.length) return;
    setUploading(true);
    setUploadError(null);
    for (const f of selected) {
      try {
        const fileRes = await uploadWorkstreamFile(f, { orderId: order.id, workspaceId: (order as any).workspaceId || order.id });
        setAttachedFiles(prev => [...prev, fileRes]);
      } catch (err: any) {
        setUploadError(err.message || 'File upload failed.');
        break;
      }
    }
    setUploading(false);
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim() || uploading) return;
    const parsedAmount = Number(invoiceAmount) > 0 ? Number(invoiceAmount) : defaultEscrow;

    onSubmitDelivery({
      notes: notes.trim(),
      reference: externalLink.trim() || undefined,
      files: attachedFiles,
      invoiceTitle: invoiceTitle.trim() || `Invoice for ${order.title}`,
      invoiceAmount: parsedAmount
    });
    setNotes('');
    setExternalLink('');
    setAttachedFiles([]);
    setUploadError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-emerald-400 rounded-2xl flex items-center justify-center shadow-sm">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-fiverr-dark">Raise Invoice & Deliver Work</h3>
              <p className="text-[11px] text-slate-400">Order #{order.id} • Posts an interactive Invoice card in WorkStream</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Funded in WorkStream Escrow</span>
            </div>
            <span className="font-mono font-black text-sm">{currencySymbol}{defaultEscrow.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Invoice Description *
              </label>
              <input
                type="text"
                required
                value={invoiceTitle}
                onChange={(e) => setInvoiceTitle(e.target.value)}
                placeholder="e.g., Final Deliverable & Invoice"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Amount ({currencySymbol}) *
              </label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Delivery Summary & Release Notes *
            </label>
            <textarea
              required
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Summarize what has been completed, testing instructions, or credentials for the buyer..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              External Repository / Cloud Link (Optional)
            </label>
            <div className="relative">
              <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={externalLink}
                onChange={(e) => setExternalLink(e.target.value)}
                placeholder="https://github.com/... or Figma / Google Drive link"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Deliverable Files ({attachedFiles.length})
              </label>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{uploading ? 'Uploading...' : 'Upload Files'}</span>
              </button>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {uploadError && (
              <p className="text-[11px] font-semibold text-rose-600 mb-2">{uploadError}</p>
            )}

            {attachedFiles.length > 0 ? (
              <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex items-center gap-2.5 truncate">
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-semibold text-fiverr-dark truncate">{file.name}</span>
                      <span className="text-[10px] text-slate-400">({file.size})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="p-1 text-slate-400 hover:text-red-500 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-2xl p-4 text-center cursor-pointer transition bg-slate-50/50"
              >
                <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                <p className="text-xs font-medium text-slate-600">Click to attach final deliverables</p>
                <p className="text-[10px] text-slate-400 mt-0.5">ZIP, PDF, source code, or design assets</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!notes.trim() || uploading}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-2xl text-xs shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Raise Invoice & Deliver</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
