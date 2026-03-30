'use client';

import { useState, useEffect, useCallback } from 'react';
import { DailySummary } from '@/lib/types';
import { API_ENDPOINTS, REFRESH_INTERVALS } from '@/lib/constants';
import { useInterval } from './use-interval';

interface UseHistoryResult {
  data: DailySummary[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useHistory(): UseHistoryResult {
  const [data, setData] = useState<DailySummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.HISTORY);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const history = await response.json();
      setData(history);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useInterval(fetchHistory, REFRESH_INTERVALS.HISTORY);

  return { data, isLoading, error, refetch: fetchHistory, lastUpdated };
}
