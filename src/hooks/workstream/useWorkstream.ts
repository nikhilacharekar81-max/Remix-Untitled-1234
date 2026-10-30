import { useMemo, useCallback, useRef } from 'react';
import { useWorkstreamList } from './useWorkstreamList';
import { useWorkstreamFilters } from './useWorkstreamFilters';
import { useWorkstreamSelection } from './useWorkstreamSelection';
import { useWorkstreamMessages } from './useWorkstreamMessages';
import { useWorkstreamRealtime } from './useWorkstreamRealtime';
import { useWorkstreamActions } from './useWorkstreamActions';
import { useWorkstreamFiles } from './useWorkstreamFiles';
import { useWorkstreamDelivery } from './useWorkstreamDelivery';
import { useWorkstreamRevision } from './useWorkstreamRevision';
import { useWorkstreamEscrow } from './useWorkstreamEscrow';
import { useWorkstreamReview } from './useWorkstreamReview';
import { useWorkstreamMeeting } from './useWorkstreamMeeting';

/**
 * Top-level orchestration hook for all workstream sub-hooks.
 * Connects shared order state, messages, realtime events, and selected order synchronization.
 */
export function useWorkstream(props?: any) {
  const list = useWorkstreamList(props);
  // The filter hook needs the hydrated items produced by the list hook. App.tsx only passes raw `orders`,
  // so without this the filter hook always received [] and the workstream table was empty for every user.
  const filters = useWorkstreamFilters({ ...props, hydratedWorkstreamItems: list.hydratedWorkstreamItems });
  const selection = useWorkstreamSelection();

  // Synchronize authoritative selected order with updated orders list (Phase 29)
  const currentSelectedOrder = useMemo(() => {
    const raw = props?.selectedOrder || selection.selectedOrder;
    if (!raw) return null;
    const authoritative = list.hydratedWorkstreamItems.find(o => o.id === raw.id);
    return authoritative || raw;
  }, [props?.selectedOrder, selection.selectedOrder, list.hydratedWorkstreamItems]);

  const messages = useWorkstreamMessages({
    messages: props?.messages,
    setMessages: props?.setMessages,
    currentUserId: (props?.impersonatedUser || props?.currentUser)?.id,
    activeOrderId: currentSelectedOrder?.id,
    activeWorkspaceId: currentSelectedOrder?.workspaceId || props?.selectedWorkspaceId,
    isInquiry: !!(currentSelectedOrder as any)?.isInquiry
  });
  
  const currentSelectedOrderRef = useRef(currentSelectedOrder);
  currentSelectedOrderRef.current = currentSelectedOrder;
  
  const onReconnect = useCallback(() => {
    if (currentSelectedOrderRef.current) {
      messages.fetchMessages(currentSelectedOrderRef.current.id);
    }
  }, [messages.fetchMessages]);

  const ordersRef = useRef<any[] | undefined>(props?.orders);
  ordersRef.current = props?.orders;
  const realtime = useWorkstreamRealtime({
    ...props,
    onReconnect,
    hasOrder: (id: string) => (ordersRef.current || []).some((o: any) => o.id === id),
    onUnknownOrder: props?.refresh,
    onOrderStateChanged: props?.refresh
  });
  const actions = useWorkstreamActions(props);

  const activeMessages = props?.messages || messages.messages;
  const activeSetMessages = props?.setMessages || messages.setMessages;

  const files = useWorkstreamFiles({
    selectedOrder: currentSelectedOrder,
    orders: list.hydratedWorkstreamItems,
    messages: activeMessages
  });

  const delivery = useWorkstreamDelivery({
    selectedOrder: currentSelectedOrder,
    setOrders: props?.setOrders,
    setSelectedOrder: props?.setSelectedOrder || selection.setSelectedOrder,
    setMessages: activeSetMessages
  });

  const revision = useWorkstreamRevision({
    selectedOrder: currentSelectedOrder,
    setOrders: props?.setOrders,
    setSelectedOrder: props?.setSelectedOrder || selection.setSelectedOrder,
    setMessages: activeSetMessages
  });

  const escrow = useWorkstreamEscrow({
    selectedOrder: currentSelectedOrder,
    setOrders: props?.setOrders,
    setSelectedOrder: props?.setSelectedOrder || selection.setSelectedOrder,
    setMessages: activeSetMessages
  });

  const review = useWorkstreamReview({
    selectedOrder: currentSelectedOrder,
    setOrders: props?.setOrders,
    setSelectedOrder: props?.setSelectedOrder || selection.setSelectedOrder,
    setMessages: activeSetMessages,
    setReviews: props?.setReviews,
    refresh: props?.refresh
  });
  const meeting = useWorkstreamMeeting(props);

  return {
    ...list,
    ...filters,
    ...selection,
    selectedOrder: currentSelectedOrder,
    ...messages,
    ...realtime,
    ...actions,
    ...files,
    ...delivery,
    ...revision,
    ...escrow,
    ...review,
    ...meeting
  };
}
