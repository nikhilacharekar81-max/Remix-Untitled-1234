import React, { useState, useEffect } from 'react';
import { Receipt, Download, Printer, ShieldCheck, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { fetchWithRetry } from '../../utils/fetchRetry';

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  orderId: string;
  workspaceId: string;
  title: string;
  status: 'paid' | 'in_escrow' | 'refunded';
  issueDate: string;
  dueDate: string;
  completedAt?: string | null;
  buyer: {
    id: string;
    name: string;
    email: string;
    country?: string;
  };
  seller: {
    id: string;
    name: string;
    email: string;
    country?: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  subtotal: number;
  serviceFee: number;
  smallOrderFee: number;
  tax: number;
  buyerTotal: number;
  platformCommission: number;
  sellerNet: number;
  currency: string;
  notes: string;
}

interface WorkstreamInvoiceTabProps {
  orderId: string;
}

export const WorkstreamInvoiceTab: React.FC<WorkstreamInvoiceTabProps> = ({ orderId }) => {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadInvoice() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithRetry(`/api/orders/${orderId}/invoice`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load invoice');
        }
        const data = await res.json();
        if (isMounted) setInvoice(data);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load invoice');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadInvoice();
    return () => {
      isMounted = false;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center min-h-[360px]">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-medium">Loading official invoice & receipt...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-8 text-center text-slate-500 min-h-[300px] flex flex-col items-center justify-center">
        <Receipt className="w-10 h-10 text-slate-300 mb-2" />
        <p className="text-sm font-semibold text-slate-700">Invoice not available</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">{error || 'Could not retrieve invoice for this order.'}</p>
      </div>
    );
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const statusBadge = {
    paid: {
      label: 'PAID & RELEASED',
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2
    },
    in_escrow: {
      label: 'HELD IN ESCROW',
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: Clock
    },
    refunded: {
      label: 'REFUNDED',
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: RotateCcw
    }
  }[invoice.status] || {
    label: invoice.status.toUpperCase(),
    bg: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: Receipt
  };

  const StatusIcon = statusBadge.icon;

  return (
    <div className="p-6 space-y-6">
      {/* ACTION BAR */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 print:hidden">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" />
            <span>Official Invoice & Payment Voucher</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Authoritative tax and settlement record for Order #{invoice.orderId}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* PRINTABLE INVOICE CARD */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6 print:border-none print:shadow-none print:p-0">
        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-slate-900">Five<span className="text-emerald-600">PA</span></span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Marketplace</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Escrow Protection & Payment Clearing</p>
            <p className="text-xs text-slate-400">VAT / Billing ID: FIVEPA-INTL-ESCROW</p>
          </div>

          <div className="sm:text-right space-y-1">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusBadge.bg}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              <span>{statusBadge.label}</span>
            </span>
            <p className="text-sm font-bold text-slate-900 mt-2">{invoice.invoiceNumber}</p>
            <p className="text-xs text-slate-500">Date: {invoice.issueDate}</p>
            {invoice.completedAt && (
              <p className="text-xs text-emerald-600 font-medium">Settled: {invoice.completedAt.slice(0, 10)}</p>
            )}
          </div>
        </div>

        {/* PARTICIPANTS SECTION */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-50/60 border border-slate-100 text-xs">
          <div>
            <span className="font-bold text-slate-400 uppercase tracking-wider text-xs">Issued To (Client)</span>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{invoice.buyer.name}</p>
            <p className="text-slate-600 mt-0.5">{invoice.buyer.email}</p>
            <p className="text-slate-400 mt-0.5">Account ID: {invoice.buyer.id} • {invoice.buyer.country || 'Global'}</p>
          </div>
          <div className="sm:text-right">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-xs">Provided By (Freelancer)</span>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{invoice.seller.name}</p>
            <p className="text-slate-600 mt-0.5">{invoice.seller.email}</p>
            <p className="text-slate-400 mt-0.5">Account ID: {invoice.seller.id} • {invoice.seller.country || 'Global'}</p>
          </div>
        </div>

        {/* LINE ITEMS TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-xs">
                <th className="py-2.5">Description</th>
                <th className="py-2.5 text-center">Qty</th>
                <th className="py-2.5 text-right">Unit Price</th>
                <th className="py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3 font-medium text-slate-900">{item.description}</td>
                  <td className="py-3 text-center">{item.quantity}</td>
                  <td className="py-3 text-right">${item.unitPrice.toFixed(2)}</td>
                  <td className="py-3 text-right font-semibold">${item.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FINANCIAL TOTALS BREAKDOWN */}
        <div className="flex flex-col sm:flex-row justify-between items-start pt-4 border-t border-slate-200 gap-4">
          <div className="max-w-xs space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>100% Escrow Protection</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Payment was verified and held securely in Escrow. All funds are cleared in full accordance with Marketplace Terms of Service.
            </p>
          </div>

          <div className="w-full sm:w-64 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Item Subtotal:</span>
              <span className="font-semibold">${invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.serviceFee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Client Service Fee:</span>
                <span className="font-semibold">${invoice.serviceFee.toFixed(2)}</span>
              </div>
            )}
            {invoice.smallOrderFee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Small Order Fee:</span>
                <span className="font-semibold">${invoice.smallOrderFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Tax (0%):</span>
              <span className="font-semibold">$0.00</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
              <span>Total Paid (USD):</span>
              <span className="text-emerald-600">${invoice.buyerTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
