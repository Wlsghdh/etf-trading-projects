'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DBOverview } from '@/lib/types';

interface FeatureDBOverviewProps {
  title: string;
  overview: DBOverview | null;
  description: string;
  isProcessedDB?: boolean;
  featureCompleted?: boolean;
  featureProgress?: number;
  featureTotal?: number;
}

export function FeatureDBOverview({ title, overview, description, isProcessedDB, featureCompleted, featureProgress, featureTotal }: FeatureDBOverviewProps) {
  if (!overview) {
    return (
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">로딩 중...</p></CardContent>
      </Card>
    );
  }

  // ML 모델용 건강도: processed DB는 피처 처리 완료 여부 기준
  let healthPercent: number;
  let healthLabel: string;

  if (isProcessedDB) {
    // etf2_db_processed: 피처 처리 완료 수 / 전체 101
    const total = featureTotal || overview.totalTables || 101;
    const completed = featureCompleted ? (featureProgress || total) : overview.upToDateTables;
    healthPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    healthLabel = `${completed}/${total} 종목 처리 완료`;
  } else {
    // etf2_db: _D와 _1h만 기준 (실제 수집 대상)
    // 607개 중 _D(101) + _1h(101) = 202개만 수집 대상
    const collectTarget = Math.min(overview.totalTables, 202);
    healthPercent = collectTarget > 0 ? Math.round((overview.upToDateTables / collectTarget) * 100) : 0;
    healthLabel = `${overview.upToDateTables}/${collectTarget} 테이블 최신`;
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">테이블</p>
            <p className="text-xl font-bold">{overview.totalTables.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">총 행 수</p>
            <p className="text-xl font-bold">{overview.totalRows.toLocaleString()}</p>
          </div>
          {isProcessedDB ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">피처 처리</p>
                <p className="text-xl font-bold text-green-500">
                  {featureProgress || overview.upToDateTables}/{featureTotal || overview.totalTables}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">상태</p>
                <p className={`text-xl font-bold ${featureCompleted ? 'text-green-500' : 'text-yellow-500'}`}>
                  {featureCompleted ? '완료' : '대기'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs text-muted-foreground">최신 (수집됨)</p>
                <p className="text-xl font-bold text-green-500">{overview.upToDateTables}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">지연</p>
                <p className="text-xl font-bold text-red-500">{overview.staleTables}</p>
              </div>
            </>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">건강도</span>
            <span className={`font-bold ${healthPercent >= 90 ? 'text-green-500' : healthPercent >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
              {healthPercent}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${healthPercent >= 90 ? 'bg-green-500' : healthPercent >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${healthPercent}%` }}
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">{healthLabel}</p>
        </div>
      </CardContent>
    </Card>
  );
}
