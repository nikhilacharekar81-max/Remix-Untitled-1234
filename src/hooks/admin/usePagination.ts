import { useState, useMemo } from 'react';

export function usePagination<T>(
  data: T[],
  pageSize: number
): {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  paginatedData: T[];
} {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, currentPage, pageSize]);

  return { currentPage, setCurrentPage, totalPages, paginatedData };
}
