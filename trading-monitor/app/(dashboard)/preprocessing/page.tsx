'use client';

import { useState, useEffect, useCallback } from 'react';
import { FeatureStatusCard } from '@/components/preprocessing/feature-status-card';
import { FeatureDBOverview } from '@/components/preprocessing/feature-db-overview';
import { FeatureColumns } from '@/components/preprocessing/feature-columns';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { useInterval } from '@/hooks/use-interval';
import type { DBOverview } from '@/lib/types';

const HELP_ITEMS = [
  {
    label: '피처 엔지니어링이란?',
    description: 'TradingView 원본 데이터(etf2_db)에서 ML 학습에 필요한 85개 지표를 계산하여 etf2_db_processed에 저장하는 과정.',
  },
  {
    label: '실행 조건',
    description: '스크래핑(데이터 수집)이 완료된 후 자동 실행. run-pipeline.sh Step 2에 해당.',
  },
  {
    color: 'bg-green-500',
    label: '최신 (초록)',
    description: 'etf2_db_processed 테이블에 최근 3일 이내 데이터가 있음. 피처 계산 완료.',
  },
  {
    color: 'bg-red-500',
    label: '지연 (빨강)',
    description: '3일 이상 업데이트 안 된 테이블. 피처 재계산 필요.',
  },
  {
    label: '85개 피처 구성',
    description: '기술지표(RSI, MACD, BB 등) + 거시경제(VIX, DXY 등) + Z-score 정규화 + 교차 랭크 피처.',
  },
  {
    label: '거시경제 피처',
    description: 'include_macro=true일 때 VIX, DXY, US10Y, 유가 등 거시경제 데이터를 함께 계산.',
  },
  {
    label: '시프트 피처',
    description: 'shift_features=true일 때 미래 목표 수익률 대비 피처를 시간 정렬하여 데이터 누수 방지.',
  },
];

interface FeatureStatus {
  status: string;
  message: string;
  progress: number;
  total: number;
}

export default function PreprocessingPage() {
  const [featureStatus, setFeatureStatus] = useState<FeatureStatus | null>(null);
  const [processedDB, setProcessedDB] = useState<DBOverview | null>(null);
  const [rawDB, setRawDB] = useState<DBOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [statusRes, processedRes, rawRes] = await Promise.allSettled([
      fetch('/trading/api/features/status'),
      fetch('/trading/api/db/tables?db_name=etf2_db_processed'),
      fetch('/trading/api/db/tables?db_name=etf2_db'),
    ]);

    if (statusRes.status === 'fulfilled' && statusRes.value.ok)
      setFeatureStatus(await statusRes.value.json());
    if (processedRes.status === 'fulfilled' && processedRes.value.ok)
      setProcessedDB(await processedRes.value.json());
    if (rawRes.status === 'fulfilled' && rawRes.value.ok)
      setRawDB(await rawRes.value.json());

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // 실행 중이면 5초마다 갱신
  const isRunning = featureStatus?.status === 'running' || featureStatus?.status === 'pending';
  useInterval(fetchAll, isRunning ? 5000 : 30000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={fetchAll} className="text-xs text-primary hover:underline">새로고침</button>
          {loading && <span className="text-xs text-muted-foreground">로딩 중...</span>}
        </div>
        <HelpTooltip title="피처 엔지니어링 가이드" items={HELP_ITEMS} />
      </div>

      <FeatureStatusCard status={featureStatus} />

      <div className="grid gap-6 lg:grid-cols-2">
        <FeatureDBOverview
          title="etf2_db (원본 데이터)"
          overview={rawDB}
          description="TradingView 스크래핑 원본. _D(101) + _1h(101) = 202개 테이블 수집 대상."
        />
        <FeatureDBOverview
          title="etf2_db_processed (피처 데이터)"
          overview={processedDB}
          description="85개 피처가 계산된 ML 학습용 DB. 101종목 전부 처리되면 건강도 100%."
          isProcessedDB
          featureCompleted={featureStatus?.status === 'completed'}
          featureProgress={featureStatus?.progress}
          featureTotal={featureStatus?.total || 101}
        />
      </div>

      <FeatureColumns />
    </div>
  );
}
