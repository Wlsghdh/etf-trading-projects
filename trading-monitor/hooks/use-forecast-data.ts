'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ForecastResponse } from '@/lib/chart-types';
import { API_ENDPOINTS } from '@/lib/constants';

interface UseForecastDataResult {
  data: ForecastResponse | null;
  isLoading: boolean;
  error: Error | null;
}

export function useForecastData(
  symbol: string | null,
  enabled: boolean = false,
  days: number = 30,
  currentPrice?: number
): UseForecastDataResult {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!symbol || !enabled) {
      setData(null);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (currentPrice) params.set('current_price', String(currentPrice));

      const response = await fetch(
        `${API_ENDPOINTS.FORECAST}/${symbol}?${params}`
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
  }, [symbol, enabled, days, currentPrice]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}
