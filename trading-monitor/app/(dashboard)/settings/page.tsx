'use client';

import { useState, useEffect } from 'react';
import { ServiceHealth } from '@/components/settings/service-health';
import { DeveloperOptions } from '@/components/settings/developer-options';
import { KisApiStatus } from '@/components/settings/kis-api-status';
import { AutomationControl } from '@/components/settings/automation-control';
import { API_ENDPOINTS } from '@/lib/constants';
import type { DeveloperConfig } from '@/lib/types';

function buildConfigFromApi(automation: Record<string, unknown>): DeveloperConfig {
  return {
    automationEnabled: (automation.enabled as boolean) || false,
    tradingMode: ((automation.trading_mode as string) === 'live' ? 'live' : 'paper'),
    maxHoldings: 100,
    activeRatio: 70,
    benchmarkRatio: 30,
    cycleDays: 63,
    capital: 100000,
    benchmarkETF: 'QQQ',
    kisApiConnected: true,
    schedule: {
      scraping: '06:00',
      featureEngineering: '07:00',
      prediction: '07:30',
      tradeDecision: '08:00',
      kisOrder: (automation.scheduler_time as string) || '23:30',
      monthlyRetrain: '03:00',
    },
  };
}

export default function SettingsPage() {
  const [config, setConfig] = useState<DeveloperConfig | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API_ENDPOINTS.AUTOMATION);
        if (res.ok) {
          const data = await res.json();
          setConfig(buildConfigFromApi(data));
          return;
        }
      } catch { /* silent */ }
      setConfig({
        automationEnabled: false,
        tradingMode: 'paper',
        maxHoldings: 100,
        activeRatio: 70,
        benchmarkRatio: 30,
        cycleDays: 63,
        capital: 100000,
        benchmarkETF: 'QQQ',
        kisApiConnected: false,
        schedule: { scraping: '06:00', featureEngineering: '07:00', prediction: '07:30', tradeDecision: '08:00', kisOrder: '23:30', monthlyRetrain: '03:00' },
      });
    })();
  }, []);

  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* Row 1: 파이프라인 관리 (full width) */}
      <AutomationControl />

      {/* Row 2: KIS API + 서비스 상태 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <KisApiStatus />
        <ServiceHealth />
      </div>

      {/* Row 3: 개발자 옵션 (full width) */}
      <DeveloperOptions config={config} onUpdate={setConfig} />
    </div>
  );
}
