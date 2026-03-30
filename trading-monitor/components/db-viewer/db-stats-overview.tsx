'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { DBOverview } from '@/lib/types';

interface DBStatsOverviewProps {
  overview: DBOverview;
}

export function DBStatsOverview({ overview }: DBStatsOverviewProps) {
  const [showHelp, setShowHelp] = useState(false);
  const healthPercent = overview.totalTables > 0
    ? Math.round((overview.upToDateTables / overview.totalTables) * 100)
    : 0;

  return (
    <div className="space-y-2">
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">데이터베이스</p>
            <p className="text-lg font-bold mt-1 font-mono">{overview.database}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">테이블 수</p>
            <p className="text-2xl font-bold mt-1">{overview.totalTables.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">총 행 수</p>
            <p className="text-2xl font-bold mt-1">{overview.totalRows.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">최신 / 지연</p>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-green-500">{overview.upToDateTables}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-2xl font-bold text-red-500">{overview.staleTables}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">데이터 건강도</p>
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ?
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-2xl font-bold ${healthPercent >= 90 ? 'text-green-500' : healthPercent >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
                {healthPercent}%
              </p>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${healthPercent >= 90 ? 'bg-green-500' : healthPercent >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${healthPercent}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 건강도 설명 */}
      {showHelp && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">데이터 건강도 & 색상 가이드</span>
            <button onClick={() => setShowHelp(false)} className="text-muted-foreground hover:text-foreground">닫기</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground">건강도 = (최신 테이블 / 전체 테이블) × 100</p>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-500" />
                <span><span className="font-medium">90% 이상</span> — 대부분 테이블이 최신. 정상 운영.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-yellow-500" />
                <span><span className="font-medium">70~89%</span> — 일부 테이블 지연. 스크래핑 확인 필요.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500" />
                <span><span className="font-medium">70% 미만</span> — 다수 테이블 지연. 스크래핑 장애 의심.</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground">테이블 셀 색상</p>
              <div className="flex items-center gap-2">
                <span className="h-3 w-6 rounded bg-green-500/20 border border-green-500/30" />
                <span><span className="font-medium text-green-400">초록색</span> — 3일 이내 데이터 있음 (최신)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-6 rounded bg-red-500/20 border border-red-500/30" />
                <span><span className="font-medium text-red-400">빨간색</span> — 3일 이상 데이터 없음 (지연/상장폐지)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-6 rounded bg-primary/20 border-2 border-primary/50" />
                <span><span className="font-medium text-primary">파란 테두리</span> — 현재 선택된 테이블</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
