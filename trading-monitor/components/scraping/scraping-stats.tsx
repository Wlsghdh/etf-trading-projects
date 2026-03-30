'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ScraperJobStatus } from '@/lib/chart-types';

interface ScrapingStatsProps {
  status: ScraperJobStatus | null;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  totalLogs: number;
}

export function ScrapingStats({ status, errorCount, warningCount, infoCount, totalLogs }: ScrapingStatsProps) {
  const isRunning = status?.status === 'running';
  const isError = status?.status === 'error';
  const isCompleted = status?.status === 'completed';
  const progress = status?.progress ?? 0;
  const completed = status?.completedSymbols ?? 0;
  const total = status?.totalSymbols ?? 101;
  const errorSymbols = status?.errorSymbols?.length ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">수집 상태</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`h-2.5 w-2.5 rounded-full ${
              isRunning ? 'bg-blue-500 animate-pulse' :
              isError ? 'bg-red-500' :
              isCompleted ? 'bg-green-500' :
              'bg-muted-foreground'
            }`} />
            <span className="text-lg font-bold">
              {isRunning ? '수집 중' : isError ? '에러' : isCompleted ? '완료' : '대기'}
            </span>
          </div>
          {status?.currentSymbol && isRunning && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              현재: {status.currentSymbol}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">진행률</p>
          <p className="text-2xl font-bold mt-1">
            {completed}<span className="text-base text-muted-foreground">/{total}</span>
          </p>
          <div className="h-1.5 w-full rounded-full bg-muted mt-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">에러 심볼</p>
          <p className={`text-2xl font-bold mt-1 ${errorSymbols > 0 ? 'text-red-500' : 'text-green-500'}`}>
            {errorSymbols}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">로그 에러</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-red-500">{errorCount}</span>
            <Badge variant="outline" className="text-yellow-500 text-[10px]">{warningCount} warn</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">총 로그</p>
          <p className="text-2xl font-bold mt-1">{totalLogs}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status?.startedAt
              ? `시작: ${new Date(status.startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
              : '미시작'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
