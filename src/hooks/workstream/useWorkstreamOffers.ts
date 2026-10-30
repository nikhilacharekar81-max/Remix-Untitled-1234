import { useState, useCallback, useEffect, useRef } from 'react';
import { getAuthToken } from '../../utils/authToken';
import { WorkstreamOffer, WorkstreamOfferKind } from '../../components/workstream/types';

export interface CreateOfferInput {
  kind: WorkstreamOfferKind;
  title: string;
  amount: number;
  deliveryDays?: number;
  note?: string;
  reference?: string;
  files?: Array<{ name: string; size: string; url: string }>;
  deliverWork?: boolean;
}

export interface OfferActionResult {
  ok: boolean;
  error?: string;
  order?: any;
  newOrder?: any;
}

/**
 * Loads the real proposals / invoices / deposit requests of one workstream and exposes the
 * seller / buyer actions. The server is the only source of truth for status and money movement.
 * `refreshKey` should change whenever a new workstream message arrives so statuses stay live.
 */
export function useWorkstreamOffers(orderId: string | undefined, refreshKey?: string) {
  const [offers, setOffers] = useState<WorkstreamOffer[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [escrowFunded, setEscrowFunded] = useState(false);
  const [escrowRemaining, setEscrowRemaining] = useState(0);
  const [totalReleased, setTotalReleased] = useState(0);
  const [hasPaidInvoice, setHasPaidInvoice] = useState(false);
  const activeOrderRef = useRef<string | undefined>(orderId);
  activeOrderRef.current = orderId;

  const headers = () => {
    const token = getAuthToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const refresh = useCallback(async () => {
    if (!orderId || !getAuthToken()) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/offers`, { headers: headers() });
      if (!res.ok || activeOrderRef.current !== orderId) return;
      const data = await res.json();
      setOffers(Array.isArray(data.offers) ? data.offers : []);
      if (data.currencySymbol) setCurrencySymbol(data.currencySymbol);
      setEscrowFunded(!!data.escrowFunded);
      setEscrowRemaining(Number(data.escrowRemaining || 0));
      setTotalReleased(Number(data.totalReleased || 0));
      setHasPaidInvoice(!!data.hasPaidInvoice);
    } catch (err) {
      console.error('Failed to load workstream offers:', err);
    }
  }, [orderId]);

  useEffect(() => {
    setOffers([]);
    setEscrowFunded(false);
    setEscrowRemaining(0);
    setTotalReleased(0);
    setHasPaidInvoice(false);
    refresh();
  }, [orderId, refresh]);

  useEffect(() => {
    if (refreshKey) refresh();
  }, [refreshKey, refresh]);

  const request = async (url: string, body?: any): Promise<OfferActionResult & { offer?: WorkstreamOffer }> => {
    try {
      const res = await fetch(url, { method: 'POST', headers: headers(), body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Something went wrong.' };
      if (data.offer) {
        setOffers(prev => {
          const exists = prev.some(o => o.id === data.offer.id);
          return exists ? prev.map(o => (o.id === data.offer.id ? data.offer : o)) : [data.offer, ...prev];
        });
      }
      await refresh();
      return { ok: true, ...data };
    } catch {
      return { ok: false, error: 'Network error. Please try again.' };
    }
  };

  const createOffer = (input: CreateOfferInput) =>
    request(`/api/orders/${orderId}/offers`, { ...input, deliverWork: input.kind === 'invoice' ? true : input.deliverWork });
  const respond = (offerId: string, action: 'accept' | 'decline' | 'cancel', reason?: string) => {
    const payload: Record<string, any> = {};
    if (reason) payload.reason = reason;
    if (orderId) payload.workstreamId = orderId;
    return request(`/api/offers/${offerId}/${action}`, Object.keys(payload).length > 0 ? payload : undefined);
  };
  const refundEscrow = (reason: string) =>
    request('/api/payments/escrow/refund', { orderId, reason });

  return {
    offers,
    currencySymbol,
    escrowFunded,
    escrowRemaining,
    totalReleased,
    hasPaidInvoice,
    createOffer,
    respond,
    refundEscrow,
    refresh
  };
}
