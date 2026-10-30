import { Order, Message } from '../../types';
import { fetchWithRetry } from '../../utils/fetchRetry';

export interface UseWorkstreamDeliveryProps {
  selectedOrder?: Order | null;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setSelectedOrder: React.Dispatch<React.SetStateAction<Order | null>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

/**
 * Hook responsible for managing workstream delivery state and persistent API submissions.
 */
export function useWorkstreamDelivery({
  selectedOrder,
  setOrders,
  setSelectedOrder,
  setMessages
}: UseWorkstreamDeliveryProps) {

  const handleDeliverWork = async (delivery: {
    notes: string;
    reference?: string;
    files: Array<{ name: string; size: string; url: string }>;
    invoiceTitle?: string;
    invoiceAmount?: number;
  }): Promise<boolean> => {
    if (!selectedOrder) return false;

    try {
      const res = await fetchWithRetry(`/api/orders/${selectedOrder.id}/deliverable`, {
        method: 'POST',
        body: JSON.stringify({
          notes: delivery.notes,
          reference: delivery.reference,
          files: delivery.files,
          createInvoiceOffer: true,
          invoiceTitle: delivery.invoiceTitle,
          invoiceAmount: delivery.invoiceAmount
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('Deliver work failed:', err);
        throw new Error(err.error || 'Failed to submit deliverables. Please check network connection.');
      }

      const data = await res.json();
      const updatedOrder = data.order || { ...selectedOrder, status: 'delivered', deliverableFiles: data.files || delivery.files };
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updatedOrder : o));
      setSelectedOrder(updatedOrder);

      // Fetch fresh thread messages
      const msgRes = await fetchWithRetry(`/api/messages/${selectedOrder.id}`);
      if (msgRes.ok) {
        const freshMessages = await msgRes.json();
        if (Array.isArray(freshMessages)) {
          setMessages(prev => [...prev.filter(m => m.orderId !== selectedOrder.id), ...freshMessages]);
        }
      }
      return true;
    } catch (err) {
      console.error('Failed to submit persistent deliverable:', err);
      alert('Network error submitting deliverables.');
      return false;
    }
  };

  return {
    handleDeliverWork
  };
}
