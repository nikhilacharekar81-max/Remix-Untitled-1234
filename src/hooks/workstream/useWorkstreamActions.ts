import { Order, UserAccount } from '../../types';
import { fetchWithRetry } from '../../utils/fetchRetry';

export interface UseWorkstreamActionsProps {
  currentUser?: UserAccount | null;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setSelectedOrder: React.Dispatch<React.SetStateAction<Order | null>>;
  setIsStartWorkstreamModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  navigate: (to: string, e?: React.MouseEvent) => void;
  financeLedger: any;
}

/**
 * Hook responsible for user workstream actions: persistent start workstream creation with escrow,
 * contact seller actions, and related navigation.
 */
export function useWorkstreamActions({
  currentUser,
  setOrders,
  setSelectedOrder,
  setIsStartWorkstreamModalOpen,
  navigate,
  financeLedger
}: UseWorkstreamActionsProps) {

  const handleStartWorkstreamModalSubmit = async (data: {
    title: string;
    partnerId: string;
    amount: number;
    turnaroundDays: number;
    requirements: string;
  }) => {
    const dueDate = new Date(Date.now() + (data.turnaroundDays || 7) * 86400000).toISOString();

    try {
      const res = await fetchWithRetry('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          sellerId: data.partnerId,
          amount: data.amount,
          dueDate,
          requirements: data.requirements
        })
      });

      if (res.ok) {
        const savedOrder: Order = await res.json();
        setOrders(prev => [savedOrder, ...prev]);
        setSelectedOrder(savedOrder);
        setIsStartWorkstreamModalOpen(false);
        navigate(`/workstream/${savedOrder.id}`);
        return;
      } else {
        const err = await res.json().catch(() => ({}));
        console.warn('Backend order creation returned status', res.status, err);
      }
    } catch (err) {
      console.error('Failed to create persistent order on server:', err);
    }
  };

  const handleContactSeller = async (sellerId: string, _sellerName: string, _gigTitle: string) => {
    navigate(`/workstream?contact=${sellerId}`);
  };

  return {
    handleStartWorkstreamModalSubmit,
    handleContactSeller
  };
}
