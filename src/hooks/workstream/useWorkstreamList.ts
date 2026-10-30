import { useMemo } from 'react';
import { compareMessageTime } from '../../utils/messageTime';
import { Order, UserAccount, Gig, Message } from '../../types';
import { WorkstreamItem } from '../../components/workstream/types';

export interface UseWorkstreamListProps {
  orders?: Order[];
  usersList?: UserAccount[];
  gigs?: Gig[];
  messages?: Message[];
  currentUser?: UserAccount | null;
  impersonatedUser?: UserAccount | null;
}

/**
 * Hook responsible for hydrating workstream order items with related seller,
 * buyer, gig metadata, and the latest thread message details for the active user session.
 * Preserves preview reliability even when individual workstream messages are loaded/unloaded.
 */
export function useWorkstreamList({
  orders = [],
  usersList = [],
  gigs = [],
  messages = [],
  currentUser,
  impersonatedUser
}: UseWorkstreamListProps = {}) {
  const hydratedWorkstreamItems: WorkstreamItem[] = useMemo(() => {
    const activeUid = impersonatedUser ? impersonatedUser.id : currentUser?.id;
    const relevantOrders = activeUid 
      ? orders.filter(o => o.buyerId === activeUid || o.sellerId === activeUid || (o as any).clientId === activeUid || (o as any).freelancerId === activeUid || currentUser?.role === 'super_admin' || currentUser?.role === 'admin' || (currentUser as any)?.role === 'support_admin')
      : orders;

    return relevantOrders.map(o => {
      const seller = usersList.find(u => u.id === o.sellerId || u.id === (o as any).freelancerId);
      const buyer = usersList.find(u => u.id === o.buyerId || u.id === (o as any).clientId);
      const gig = gigs.find(g => g.id === o.gigId);
      
      const orderMsgs = messages.filter(m => m.orderId === o.id);
      // 21: Sort by timestamp to ensure we pick the chronologically latest message
      const sortedMsgs = [...orderMsgs].sort(compareMessageTime);
      const lastMsg = sortedMsgs.length > 0 ? sortedMsgs[sortedMsgs.length - 1] : undefined;

      return {
        ...o,
        seller,
        buyer,
        gig,
        lastMessage: lastMsg ? lastMsg.text : (o as any).lastMessage,
        lastMessageTime: lastMsg ? lastMsg.timestamp : (o as any).lastMessageTime
      };
    });
  }, [orders, usersList, gigs, messages, currentUser, impersonatedUser]);

  return {
    hydratedWorkstreamItems,
    workstreams: hydratedWorkstreamItems
  };
}
