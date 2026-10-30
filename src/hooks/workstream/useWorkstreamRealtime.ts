import { useEffect, useRef } from 'react';
import { Message, Order } from '../../types';
import { getAuthToken } from '../../utils/authToken';
import { compareMessageTime } from '../../utils/messageTime';

export interface UseWorkstreamRealtimeProps {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  currentUser?: { id: string } | null;
  impersonatedUser?: { id: string } | null;
  onReconnect?: () => void;
  /** True when the order is already in the user's list. */
  hasOrder?: (orderId: string) => boolean;
  /** Called when a message arrives for an order the user doesn't have yet (e.g. a new project chat). */
  onUnknownOrder?: () => void;
  /** Called (debounced) when a system/lifecycle message arrives, so order status can be refetched. */
  onOrderStateChanged?: () => void;
}

/**
 * Hook responsible for establishing and maintaining the WebSocket connection
 * for real-time workstream message synchronization and order updates.
 */
export function useWorkstreamRealtime({
  setMessages,
  setOrders,
  currentUser,
  impersonatedUser,
  onReconnect,
  hasOrder,
  onUnknownOrder,
  onOrderStateChanged
}: UseWorkstreamRealtimeProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const hasOrderRef = useRef(hasOrder);
  hasOrderRef.current = hasOrder;
  const onUnknownOrderRef = useRef(onUnknownOrder);
  onUnknownOrderRef.current = onUnknownOrder;
  const onOrderStateChangedRef = useRef(onOrderStateChanged);
  onOrderStateChangedRef.current = onOrderStateChanged;
  const stateRefreshTimerRef = useRef<any>(null);
  const lastUnknownRefreshRef = useRef(0);

  useEffect(() => {
    // Authenticate with the signed session token only. Never fall back to a user ID or an admin identity.
    const token = getAuthToken();
    if (!token) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    let reconnectTimeout: any = null;
    let isUnmounted = false;

    const connect = () => {
      if (isUnmounted) return;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('Workstream WebSocket connected, authenticating...');
        socket.send(JSON.stringify({ type: 'AUTHENTICATE', token }));
        if (onReconnectRef.current) onReconnectRef.current();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'MESSAGE_RECEIVED' && data.message) {
            const incomingMsg = data.message;
            if (hasOrderRef.current && !hasOrderRef.current(incomingMsg.orderId) && Date.now() - lastUnknownRefreshRef.current > 3000) {
              lastUnknownRefreshRef.current = Date.now();
              onUnknownOrderRef.current?.();
            }
            // Delivery, revision, release, dispute, offers etc. arrive with system type or metadata.action; refetch orders so status follows.
            if ((incomingMsg.type === 'system' || incomingMsg.metadata?.action) && onOrderStateChangedRef.current) {
              if (stateRefreshTimerRef.current) clearTimeout(stateRefreshTimerRef.current);
              stateRefreshTimerRef.current = setTimeout(() => onOrderStateChangedRef.current?.(), 400);
            }
            setMessages(prev => {
              // One-per-order lifecycle events may already exist locally under a different (client-made) id.
              const singletonAction = incomingMsg.type === 'system' && ['escrow_released', 'review_submitted', 'review_reply_submitted', 'order_auto_accepted', 'order_completed', 'deliverable_approved'].includes(incomingMsg.metadata?.action)
                ? incomingMsg.metadata.action : null;
              const clientMsgId = incomingMsg.metadata?.clientMessageId;
              const isSame = (m: any) =>
                m.id === incomingMsg.id ||
                (clientMsgId && m.metadata?.clientMessageId === clientMsgId) ||
                (singletonAction && m.type === 'system' && m.orderId === incomingMsg.orderId && m.metadata?.action === incomingMsg.metadata?.action);
              const alreadyExists = prev.some(isSame);
              if (alreadyExists) {
                // If it exists but was optimistic, update it with full server data
                return prev.map(m => isSame(m) ? { ...incomingMsg, status: 'sent' } : m);
              }
              const next = [...prev, incomingMsg];
              return next.sort(compareMessageTime);
            });
            setOrders(prev => prev.map(o => {
              if (o.id === incomingMsg.orderId) {
                return {
                  ...o,
                  lastMessage: incomingMsg.text,
                  lastMessageTime: incomingMsg.timestamp
                };
              }
              return o;
            }));
          } else if (data.type === 'MESSAGE_ACK' && data.message) {
            setMessages(prev => prev.map(m => 
              m.metadata?.clientMessageId === data.clientMessageId ? data.message : m
            ));
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      socket.onerror = (err) => {
        console.warn('WebSocket error encountered:', err);
      };

      socket.onclose = (ev) => {
        if (ev.code === 4401 || ev.code === 1008) return; // rejected as unauthenticated: do not retry with the same credentials
        console.log('Workstream WebSocket disconnected, scheduling reconnect...');
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        wsRef.current.close();
      }
    };
  }, [currentUser?.id, impersonatedUser?.id, setMessages, setOrders]);

  return {
    wsRef
  };
}
