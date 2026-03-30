'use client';

import type { CycleInfo } from '@/lib/types';

interface CycleIndicatorProps {
  cycle: CycleInfo;
}

export function CycleIndicator({ cycle }: CycleIndicatorProps) {
  const percentage = (cycle.currentDay / cycle.totalDays) * 100;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const remaining = cycle.totalDays - cycle.currentDay;

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-32 w-32">
        <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/50"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-primary transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">D-{remaining}</span>
          <span className="text-xs text-muted-foreground">
            {cycle.cycleType === 'short' ? '단기' : '장기'}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm">
          <span className="text-muted-foreground">사이클: </span>
          <span className="font-medium">
            {cycle.currentDay}일 / {cycle.totalDays}일
          </span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">시작일: </span>
          <span className="font-medium">{cycle.startDate}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">다음 리밸런싱: </span>
          <span className="font-medium">{cycle.nextRebalanceDate}</span>
        </div>
      </div>
    </div>
  );
}
