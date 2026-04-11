'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { ScraperJobStatus, JobStatus } from '@/lib/chart-types';

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  idle: { label: '대기', variant: 'outline' },
  running: { label: '실행중', variant: 'default' },
  completed: { label: '완료', variant: 'secondary' },
  partial: { label: '부분완료', variant: 'secondary' },
  error: { label: '에러', variant: 'destructive' },
};

interface JobStatusCardProps {
  status: ScraperJobStatus | null;
  isLoading: boolean;
}

export function JobStatusCard({ status, isLoading }: JobStatusCardProps) {
  if (isLoading || !status) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">스크래핑 작업 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">로딩중...</div>
        </CardContent>
      </Card>
    );
  }

  const config = STATUS_CONFIG[status.status] ?? { label: status.status, variant: 'outline' as const };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">스크래핑 작업 상태</CardTitle>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress */}
        {status.status === 'running' && status.progress != null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                진행률: {status.completedSymbols}/{status.totalSymbols}
              </span>
              <span className="font-mono">{status.progress}%</span>
            </div>
            <Progress value={status.progress} />
          </div>
        )}

        {/* Current symbol */}
        {status.currentSymbol && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">현재 심볼:</span>
            <span className="font-mono font-medium">{status.currentSymbol}</span>
          </div>
        )}

        {/* Error symbols */}
        {status.errorSymbols && status.errorSymbols.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs text-red-400">에러 심볼:</span>
            <div className="flex flex-wrap gap-1">
              {status.errorSymbols.map((sym) => (
                <Badge key={sym} variant="destructive" className="text-xs font-mono">
                  {sym}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Started at */}
        {status.startedAt && (
          <div className="text-xs text-muted-foreground">
            시작: {new Date(status.startedAt).toLocaleString('ko-KR')}
          </div>
        )}

        {/* Message */}
        {status.message && (
          <div className="text-xs text-muted-foreground">{status.message}</div>
        )}
      </CardContent>
    </Card>
  );
}
