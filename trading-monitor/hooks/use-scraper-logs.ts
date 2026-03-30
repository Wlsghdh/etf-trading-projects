'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ScraperLogsResponse, LogLevel } from '@/lib/chart-types';
import { API_ENDPOINTS, REFRESH_INTERVALS } from '@/lib/constants';
import { useInterval } from './use-interval';

interface UseScraperLogsResult {
  data: ScraperLogsResponse | null;
  isLoading: boolean;
  error: Error | null;
}

export function useScraperLogs(
  level: LogLevel | 'ALL' = 'ALL',
  symbol: string = '',
  limit: number = 100,
  autoRefresh: boolean = true
): UseScraperLogsResult {
  const [data, setData] = useState<ScraperLogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (level !== 'ALL') params.set('level', level);
      if (symbol) params.set('symbol', symbol);
      params.set('limit', String(limit));

      const response = await fetch(`${API_ENDPOINTS.SCRAPER_LOGS}?${params}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [level, symbol, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useInterval(fetchLogs, autoRefresh ? REFRESH_INTERVALS.SCRAPER_LOGS : null);

  return { data, isLoading, error };
}
