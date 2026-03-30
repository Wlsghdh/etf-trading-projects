'use client';

import { useState, useEffect, useCallback } from 'react';
import { Order } from '@/lib/types';
import { API_ENDPOINTS, REFRESH_INTERVALS } from '@/lib/constants';
import { useInterval } from './use-interval';

interface UseOrdersResult {
  data: Order[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useOrders(): UseOrdersResult {
  const [data, setData] = useState<Order[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.ORDERS);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const orders = await response.json();
      setData(orders);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useInterval(fetchOrders, REFRESH_INTERVALS.ORDERS);

  return { data, isLoading, error, refetch: fetchOrders, lastUpdated };
}
