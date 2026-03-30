'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ChartDataResponse, ChartTimeframe } from '@/lib/chart-types';
import { API_ENDPOINTS } from '@/lib/constants';

interface UseChartDataResult {
  data: ChartDataResponse | null;
  isLoading: boolean;
  error: Error | null;
}

export function useChartData(
  symbol: string | null,
  timeframe: ChartTimeframe = 'D',
  limit: number = 100
): UseChartDataResult {
  const [data, setData] = useState<ChartDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!symbol) {
      setData(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_ENDPOINTS.CHART_DATA}/${symbol}?timeframe=${timeframe}&limit=${limit}`
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [symbol, timeframe, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}
