import { useState } from 'react';
import { WorkstreamItem } from '../../components/workstream/types';

/**
 * Hook responsible for managing workstream selection state (selected order,
 * active selection/reset helpers).
 */
export function useWorkstreamSelection() {
  const [selectedOrder, setSelectedOrder] = useState<WorkstreamItem | null>(null);

  const selectOrder = (order: WorkstreamItem | null) => {
    setSelectedOrder(order);
  };

  const clearSelection = () => {
    setSelectedOrder(null);
  };

  return {
    selectedOrder,
    setSelectedOrder,
    selectOrder,
    clearSelection
  };
}
