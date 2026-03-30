'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PipelineStep, PipelineStepStatus } from '@/lib/types';

interface PipelineTimelineProps {
  steps: PipelineStep[];
}

const statusConfig: Record<PipelineStepStatus, { label: string; color: string; bg: string }> = {
  idle: { label: '대기', color: 'text-muted-foreground', bg: 'bg-muted' },
  running: { label: '실행 중', color: 'text-blue-500', bg: 'bg-blue-500' },
  completed: { label: '완료', color: 'text-green-500', bg: 'bg-green-500' },
  error: { label: '에러', color: 'text-red-500', bg: 'bg-red-500' },
  scheduled: { label: '예정', color: 'text-yellow-500', bg: 'bg-yellow-500' },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}분 ${sec}초` : `${min}분`;
}

export function PipelineTimeline({ steps }: PipelineTimelineProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">파이프라인 단계</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {steps.map((step, index) => {
          const config = statusConfig[step.status];
          const isLast = index === steps.length - 1;

          return (
            <div key={step.id} className="flex gap-4">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className={`h-3 w-3 rounded-full ${config.bg} ${step.status === 'running' ? 'animate-pulse' : ''} shrink-0 mt-1.5`} />
                {!isLast && <div className="w-px flex-1 bg-border my-1" />}
              </div>

              {/* Content */}
              <div className={`flex-1 pb-6 ${isLast ? 'pb-0' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{step.name}</h4>
                      <Badge variant="outline" className={`text-xs ${config.color}`}>
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {step.scheduledTime} KST
                  </span>
                </div>

                {step.lastRunMessage && (
                  <div className="mt-2 rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-xs">{step.lastRunMessage}</p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {step.lastRunAt && (
                        <span>
                          실행: {new Date(step.lastRunAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {step.lastRunDuration !== null && (
                        <span>소요: {formatDuration(step.lastRunDuration)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
