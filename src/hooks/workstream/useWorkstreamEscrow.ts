import { useState } from 'react';
import { Order, Message } from '../../types';
import { fetchWithRetry } from '../../utils/fetchRetry';

export interface UseWorkstreamEscrowProps {
  selectedOrder?: Order | null;
  setOrders?: React.Dispatch<React.SetStateAction<Order[]>>;
  setSelectedOrder?: React.Dispatch<React.SetStateAction<Order | null>>;
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
}

/**
 * Hook responsible for managing authoritative workstream escrow release.
 * Review submission is cleanly separated from escrow release.
 */
export function useWorkstreamEscrow({
  selectedOrder,
  setOrders,
  setSelectedOrder,
  setMessages
}: UseWorkstreamEscrowProps) {
  const [isReleasingEscrow, setIsReleasingEscrow] = useState(false);
  const [escrowError, setEscrowError] = useState<string | null>(null);

  const handleReleaseEscrow = async (): Promise<boolean> => {
    if (!selectedOrder) return false;

    setEscrowError(null);
    setIsReleasingEscrow(true);

    try {
      const releaseRes = await fetchWithRetry('/api/payments/escrow/release', {
        method: 'POST',
        body: JSON.stringify({ orderId: selectedOrder.id })
      });

      if (!releaseRes.ok) {
        const errData = await releaseRes.json().catch(() => ({}));
        console.warn('Backend escrow release failed:', errData.error);
        setEscrowError(errData.error || 'Failed to release escrow funds.');
        setIsReleasingEscrow(false);
        return false;
      }

      const data = await releaseRes.json();
      const updatedOrder: Order = data.order || { ...selectedOrder, status: 'completed' };

      if (setOrders) {
        setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updatedOrder : o));
      }
      if (setSelectedOrder) {
        setSelectedOrder(updatedOrder);
      }

      // Sync authoritative thread messages (deliverable_approved, escrow_released, order_completed)
      if (setMessages) {
        try {
          const msgRes = await fetchWithRetry(`/api/messages/${selectedOrder.id}`);
          if (msgRes.ok) {
            const freshMessages = await msgRes.json();
            if (Array.isArray(freshMessages)) {
              setMessages(prev => [...prev.filter(m => m.orderId !== selectedOrder.id), ...freshMessages]);
            }
          }
        } catch {
          const sysMsg: Message = {
            id: `msg_escrow_${Date.now()}`,
            orderId: selectedOrder.id,
            senderId: 'system',
            senderName: 'WorkSphere Escrow Vault',
            text: `🎉 Escrow funds ($${selectedOrder.amount.toLocaleString()}) released to seller! Workstream marked as completed. Deliverables accepted.`,
            timestamp: new Date().toISOString(),
            type: 'system',
            metadata: {
              action: 'escrow_released',
              amount: selectedOrder.amount
            }
          };
          setMessages(prev => prev.some(m => m.orderId === selectedOrder.id && m.type === 'system' && m.metadata?.action === 'escrow_released') ? prev : [...prev, sysMsg]);
        }
      }

      setIsReleasingEscrow(false);
      return true;
    } catch (err) {
      console.error('Failed to call backend escrow release:', err);
      setEscrowError('Network error releasing escrow funds. Please try again.');
      setIsReleasingEscrow(false);
      return false;
    }
  };

  return {
    isReleasingEscrow,
    escrowError,
    handleReleaseEscrow
  };
}
