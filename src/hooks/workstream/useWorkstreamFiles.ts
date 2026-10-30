import { useMemo } from 'react';
import { SharedFileItem } from '../../components/workstream/types';
import { Message, Order } from '../../types';

export interface UseWorkstreamFilesProps {
  selectedOrder?: (Order & { deliverableFiles?: Array<any>; deliveries?: Array<any> }) | null;
  orders?: Array<Order & { deliverableFiles?: Array<any>; deliveries?: Array<any> }>;
  messages?: Message[];
}

function canonicalFileKey(url: string | undefined, fallbackScope: string): string {
  if (url && typeof url === 'string' && url.trim() && url.trim() !== '#') {
    return `url:${url.trim().split('?')[0]}`;
  }
  return `item:${fallbackScope}`;
}

/**
 * Hook responsible for deriving active shared files across all Orders in the active Workspace
 * from workstream messages, deliverable files, and revision submissions with provenance and deduplication.
 */
export function useWorkstreamFiles({
  selectedOrder,
  orders = [],
  messages = []
}: UseWorkstreamFilesProps = {}) {
  const activeSharedFiles: SharedFileItem[] = useMemo(() => {
    if (!selectedOrder) return [];
    const filesMap = new Map<string, SharedFileItem>();

    const wsId = selectedOrder.workspaceId;
    const workspaceOrdersMap = new Map<string, Order & { deliverableFiles?: Array<any>; deliveries?: Array<any> }>();
    if (wsId) {
      for (const ord of orders) {
        if (
          ord.workspaceId === wsId &&
          ord.buyerId === selectedOrder.buyerId &&
          ord.sellerId === selectedOrder.sellerId
        ) {
          workspaceOrdersMap.set(ord.id, ord);
        }
      }
    }
    workspaceOrdersMap.set(selectedOrder.id, selectedOrder);
    const workspaceOrders = Array.from(workspaceOrdersMap.values());
    const workspaceOrderIds = new Set(workspaceOrders.map(o => o.id));
    const orderTitleById = new Map(workspaceOrders.map(o => [o.id, o.title]));

    // 1. Files from Order deliverableFiles / deliveryHistory across all Orders in the Workspace
    for (const ord of workspaceOrders) {
      if (Array.isArray(ord.deliverableFiles)) {
        ord.deliverableFiles.forEach((f: any, idx: number) => {
          if (!f) return;
          const id = f.id || `order_deliv_${ord.id}_${idx}`;
          const key = canonicalFileKey(f.url, `${ord.id}_deliv_${id}_${f.name || idx}`);
          filesMap.set(key, {
            id,
            name: f.name || 'Deliverable File',
            size: f.size || '3.5 MB',
            url: f.url || '#',
            uploadedAt: f.uploadedAt || ord.createdAt,
            uploadedBy: 'Seller',
            uploaderId: ord.sellerId,
            type: f.category || 'deliverable',
            orderId: ord.id,
            orderTitle: ord.title,
            workspaceId: ord.workspaceId || wsId,
            source: 'deliverable'
          });
        });
      }

      const deliveryRecords = Array.isArray((ord as any).deliveryHistory)
        ? (ord as any).deliveryHistory
        : (Array.isArray(ord.deliveries) ? ord.deliveries : []);

      if (deliveryRecords.length > 0) {
        deliveryRecords.forEach((d: any, dIdx: number) => {
          if (Array.isArray(d.files)) {
            d.files.forEach((f: any, fIdx: number) => {
              if (!f) return;
              const id = f.id || `deliv_${ord.id}_v${d.version || dIdx + 1}_${fIdx}`;
              const key = canonicalFileKey(f.url, `${ord.id}_hist_${d.version || dIdx + 1}_${id}_${f.name || fIdx}`);
              if (!filesMap.has(key)) {
                filesMap.set(key, {
                  id,
                  name: f.name || `Deliverable v${d.version || dIdx + 1}`,
                  size: f.size || '1.0 MB',
                  url: f.url || '#',
                  uploadedAt: d.deliveredAt
                    ? new Date(d.deliveredAt).toLocaleDateString()
                    : (d.submittedAt ? new Date(d.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ord.createdAt),
                  uploadedBy: 'Seller',
                  uploaderId: ord.sellerId,
                  type: 'deliverable',
                  orderId: ord.id,
                  orderTitle: ord.title,
                  workspaceId: ord.workspaceId || wsId,
                  source: 'delivery_history'
                });
              }
            });
          }
        });
      }
    }

    // 2. Files attached in Messages or Deliverable Submitted System Events across the Workspace
    messages
      .filter(m => (Boolean(m.orderId) && workspaceOrderIds.has(m.orderId!)) || (Boolean(wsId) && m.metadata?.workspaceId === wsId))
      .forEach(m => {
        const msgOrderId = m.orderId || selectedOrder.id;
        const msgOrderTitle = orderTitleById.get(msgOrderId) || selectedOrder.title;

        if (Array.isArray(m.metadata?.files)) {
          m.metadata.files.forEach((f: any, idx: number) => {
            if (!f) return;
            const id = f.id || `${m.id}_file_${idx}`;
            const key = canonicalFileKey(f.url, `msg_deliv_${m.id}_${id}_${f.name || idx}`);
            if (!filesMap.has(key)) {
              filesMap.set(key, {
                id,
                name: f.name || 'Deliverable File',
                size: f.size || '1.0 MB',
                url: f.url || '#',
                uploadedAt: m.timestamp,
                uploadedBy: m.senderName || 'Seller',
                uploaderId: m.senderId,
                type: 'deliverable',
                orderId: msgOrderId,
                orderTitle: msgOrderTitle,
                workspaceId: m.metadata?.workspaceId || wsId,
                source: 'offer'
              });
            }
          });
        }
        const fileInfo = m.fileInfo;
        if (!fileInfo) return;
        const key = canonicalFileKey(fileInfo.url, `msg_att_${m.id}_${fileInfo.name || 'file'}`);
        if (!filesMap.has(key)) {
          const isDeliverable = m.type === 'deliverable' || fileInfo.type === 'deliverable' || (fileInfo as any).category === 'deliverable';
          filesMap.set(key, {
            id: m.id,
            name: fileInfo.name || 'attachment.pdf',
            size: fileInfo.size || '1.0 MB',
            url: fileInfo.url || '#',
            uploadedAt: m.timestamp,
            uploadedBy: m.senderName,
            uploaderId: m.senderId,
            type: isDeliverable ? 'deliverable' : 'attachment',
            orderId: (fileInfo as any).orderId || msgOrderId,
            orderTitle: msgOrderTitle,
            workspaceId: (fileInfo as any).workspaceId || m.metadata?.workspaceId || wsId,
            source: 'message'
          });
        }
      });

    return Array.from(filesMap.values());
  }, [selectedOrder, orders, messages]);

  return {
    activeSharedFiles
  };
}
