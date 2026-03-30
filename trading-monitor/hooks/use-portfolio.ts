'use client';

import { useState, useEffect, useCallback } from 'react';
import { PortfolioResponse } from '@/lib/types';
import { API_ENDPOINTS, REFRESH_INTERVALS } from '@/lib/constants';
import { useInterval } from './use-interval';

interface UsePortfolioResult {
  data: PortfolioResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
}

export function usePortfolio(): UsePortfolioResult {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPortfolio = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.PORTFOLIO);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const portfolio = await response.json();
      setData(portfolio);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  useInterval(fetchPortfolio, REFRESH_INTERVALS.PORTFOLIO);

  return { data, isLoading, error, refetch: fetchPortfolio, lastUpdated };
}
