'use client';

import { useScraperStatus } from '@/hooks/use-scraper-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CronJob {
  name: string;
  schedule: string;
  scheduleKST: string;
  description: string;
  active: boolean;
}

const CRON_JOBS: CronJob[] = [
  {
    name: '전체 파이프라인',
    schedule: '0 6 * * 1-5',
    scheduleKST: '매일 06:00 KST (월~금)',
    description: '스크래핑 → 피처 엔지니어링 → ML 예측',
    active: true,
  },
];

function buildPipelineSteps(totalSymbols?: number) {
  const totalLabel = totalSymbols ? `${totalSymbols}종목` : '전체 종목';
  return [
    {
      time: '05:00',
      label: '미국장 마감',
      type: 'event' as const,
      detail: '서머타임 기준 (동절기 06:00)',
    },
    {
      time: '06:00',
      label: '데이터 수집 시작',
      type: 'cron' as const,
      detail: `${totalLabel} × 4 타임프레임, TradingView 스크래핑`,
    },
  {
    time: '~07:00',
    label: '피처 엔지니어링',
    type: 'auto' as const,
    detail: '85개 기술지표 계산 → etf2_db_processed',
  },
  {
    time: '~07:30',
    label: 'ML 예측',
    type: 'auto' as const,
    detail: 'LightGBM LambdaRank → 상위 100종목 랭킹',
  },
  {
    time: '22:30',
    label: '미국장 개장',
    type: 'event' as const,
    detail: '서머타임 기준 (동절기 23:30)',
  },
];
}

const TYPE_COLORS = {
  cron: 'bg-blue-500',
  auto: 'bg-green-500',
  event: 'bg-muted-foreground',
};

export function ScrapingSchedule() {
  const { data: status } = useScraperStatus();
  const totalSymbols = status?.totalSymbols ?? status?.configuredTotal;
  const PIPELINE_STEPS = buildPipelineSteps(totalSymbols);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">수집 스케줄</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cron 설정 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cron 자동화</p>
          {CRON_JOBS.map(job => (
            <div key={job.name} className="rounded-md border border-border p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{job.name}</span>
                <Badge variant={job.active ? 'default' : 'secondary'} className="text-[10px]">
                  {job.active ? '활성' : '비활성'}
                </Badge>
              </div>
              <p className="text-xs font-mono text-muted-foreground">{job.schedule}</p>
              <p className="text-xs text-muted-foreground">{job.scheduleKST}</p>
              <p className="text-xs text-muted-foreground">{job.description}</p>
            </div>
          ))}
        </div>

        {/* 타임라인 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">일일 타임라인 (KST)</p>
          <div className="space-y-0">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex flex-col items-center">
                  <div className={`h-2 w-2 rounded-full ${TYPE_COLORS[step.type]} shrink-0 mt-1.5`} />
                  {i < PIPELINE_STEPS.length - 1 && <div className="w-px flex-1 bg-border my-0.5 min-h-[20px]" />}
                </div>
                <div className="pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold">{step.time}</span>
                    <span className="text-xs font-medium">{step.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 범례 */}
        <div className="flex gap-3 pt-1 border-t border-border">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-[10px] text-muted-foreground">Cron</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-[10px] text-muted-foreground">자동</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">이벤트</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
