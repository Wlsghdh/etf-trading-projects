'use client';

import { useState, useEffect, useCallback } from 'react';
import type { HealthCheckResponse } from '@/lib/types';
import { API_ENDPOINTS, REFRESH_INTERVALS } from '@/lib/constants';
import { useInterval } from './use-interval';

interface ConnectionStatus {
  isConnected: boolean;
  services: {
    tradingService: boolean;
    mlService: boolean;
    scraperService: boolean;
  };
}

const DEFAULT_STATUS: ConnectionStatus = {
  isConnected: false,
  services: {
    tradingService: false,
    mlService: false,
    scraperService: false,
  },
};

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(DEFAULT_STATUS);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(API_ENDPOINTS.HEALTH);
      if (!response.ok) {
        setStatus(DEFAULT_STATUS);
        return;
      }
      const data: HealthCheckResponse = await response.json();

      const tradingService =
        data.services.find((s) => s.name === 'trading-service')?.status === 'healthy';
      const mlService =
        data.services.find((s) => s.name === 'ml-service')?.status === 'healthy';
      const scraperService =
        data.services.find((s) => s.name === 'scraper-service')?.status === 'healthy';

      setStatus({
        isConnected: tradingService,
        services: { tradingService, mlService, scraperService },
      });
    } catch {
      setStatus(DEFAULT_STATUS);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useInterval(fetchHealth, REFRESH_INTERVALS.HEALTH);

  return status;
}
