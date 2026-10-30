import { useState, useEffect } from 'react';

export function useLocalStorageFilter<T extends { id: string | number }>(
  sourceData: T[],
  storageKey: string
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [items, setItems] = useState<T[]>(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem(storageKey) || '[]').map((d: any) => String(d));
      return (sourceData || []).filter(item => !deletedIds.includes(String(item.id)));
    } catch {
      return sourceData || [];
    }
  });

  useEffect(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem(storageKey) || '[]').map((d: any) => String(d));
      setItems((sourceData || []).filter(item => !deletedIds.includes(String(item.id))));
    } catch {
      setItems(sourceData || []);
    }
  }, [sourceData, storageKey]);

  return [items, setItems];
}
