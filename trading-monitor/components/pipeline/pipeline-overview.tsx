'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PipelineStatus } from '@/lib/types';

interface PipelineOverviewProps {
  pipeline: PipelineStatus;
}

export function PipelineOverview({ pipeline }: PipelineOverviewProps) {
  const completedSteps = pipeline.steps.filter(s => s.status === 'completed').length;
  const errorSteps = pipeline.steps.filter(s => s.status === 'error').length;
  const totalSteps = pipeline.steps.length;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">파이프라인 상태</p>
              <p className="text-2xl font-bold mt-1">
                {pipeline.isRunning ? '실행 중' : '대기'}
              </p>
            </div>
            <Badge variant={pipeline.isRunning ? 'default' : 'secondary'} className="h-8">
              {pipeline.isRunning ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Running
                </span>
              ) : (
                'Idle'
              )}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">오늘 완료</p>
          <p className="text-2xl font-bold mt-1">
            <span className="text-green-500">{completedSteps}</span>
            <span className="text-muted-foreground text-base"> / {totalSteps}</span>
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">에러</p>
          <p className="text-2xl font-bold mt-1">
            <span className={errorSteps > 0 ? 'text-red-500' : 'text-green-500'}>
              {errorSteps}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">마지막 전체 실행</p>
          <p className="text-lg font-bold mt-1">
            {pipeline.lastFullRunAt
              ? new Date(pipeline.lastFullRunAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              : '-'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pipeline.lastFullRunSuccess ? '성공' : '실패'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
