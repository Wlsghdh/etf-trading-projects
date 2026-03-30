'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ScraperJobStatus } from '@/lib/chart-types';
import { API_ENDPOINTS, REFRESH_INTERVALS } from '@/lib/constants';
import { useInterval } from './use-interval';

interface UseScraperStatusResult {
  data: ScraperJobStatus | null;
  isLoading: boolean;
  error: Error | null;
}

export function useScraperStatus(): UseScraperStatusResult {
  const [data, setData] = useState<ScraperJobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.SCRAPER_STATUS);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useInterval(fetchStatus, REFRESH_INTERVALS.SCRAPER_STATUS);

  return { data, isLoading, error };
}
