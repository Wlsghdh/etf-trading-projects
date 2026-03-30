'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { API_ENDPOINTS, REFRESH_INTERVALS } from '@/lib/constants';
import { useInterval } from '@/hooks/use-interval';
import type { HealthCheckResponse } from '@/lib/types';

export function ServiceHealth() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(API_ENDPOINTS.HEALTH);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useInterval(fetchHealth, REFRESH_INTERVALS.HEALTH);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">서비스 상태</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {health?.services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between rounded-md border border-border p-3"
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${
                  service.status === 'healthy'
                    ? 'bg-green-500'
                    : service.status === 'unhealthy'
                    ? 'bg-red-500'
                    : 'bg-yellow-500'
                }`}
              />
              <div>
                <div className="text-sm font-medium">{service.name}</div>
                <div className="text-xs text-muted-foreground">{service.url}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {service.responseTime != null && (
                <span className="text-xs text-muted-foreground">
                  {service.responseTime}ms
                </span>
              )}
              <Badge
                variant={
                  service.status === 'healthy' ? 'secondary' : 'destructive'
                }
                className="text-xs"
              >
                {service.status === 'healthy'
                  ? '정상'
                  : service.status === 'unhealthy'
                  ? '비정상'
                  : '알 수 없음'}
              </Badge>
            </div>
          </div>
        ))}
        {!health && (
          <div className="text-sm text-muted-foreground text-center py-4">
            헬스체크 로딩중...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
