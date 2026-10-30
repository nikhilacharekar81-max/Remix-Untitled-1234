import { Order, Message } from '../../types';
import { fetchWithRetry } from '../../utils/fetchRetry';

export interface UseWorkstreamRevisionProps {
  selectedOrder?: Order | null;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setSelectedOrder: React.Dispatch<React.SetStateAction<Order | null>>;
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
}

/**
 * Hook responsible for managing workstream revision requests and persistent backend storage.
 */
export function useWorkstreamRevision({
  selectedOrder,
  setOrders,
  setSelectedOrder,
  setMessages
}: UseWorkstreamRevisionProps) {

  const handleRequestRevision = async (reason: string): Promise<boolean> => {
    if (!selectedOrder) return false;

    try {
      const res = await fetchWithRetry(`/api/orders/${selectedOrder.id}/revision`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('Revision request failed:', err);
        alert(err.error || 'Failed to submit revision request.');
        return false;
      }

      const data = await res.json();
      const updatedOrder = data.order || { ...selectedOrder, status: 'revision' };
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updatedOrder : o));
      setSelectedOrder(updatedOrder);

      if (setMessages) {
        const msgRes = await fetchWithRetry(`/api/messages/${selectedOrder.id}`);
        if (msgRes.ok) {
          const freshMessages = await msgRes.json();
          if (Array.isArray(freshMessages)) {
            setMessages(prev => [...prev.filter(m => m.orderId !== selectedOrder.id), ...freshMessages]);
          }
        }
      }
      return true;
    } catch (err) {
      console.error('Failed to submit persistent revision request:', err);
      alert('Network error submitting revision request.');
      return false;
    }
  };

  return {
    handleRequestRevision
  };
}
