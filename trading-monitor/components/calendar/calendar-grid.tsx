'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { DailySummary } from '@/lib/types';

interface CalendarGridProps {
  year: number;
  month: number;
  dailySummaries: DailySummary[];
  onDateClick: (summary: DailySummary) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarGrid({
  year,
  month,
  dailySummaries,
  onDateClick,
}: CalendarGridProps) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const summaryMap = new Map(
    dailySummaries.map((s) => [s.date, s])
  );

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-lg border border-border">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="border-b border-r border-border p-2 h-24" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const summary = summaryMap.get(dateStr);
          const isToday =
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day;
          const dayOfWeek = new Date(year, month, day).getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          return (
            <div
              key={i}
              className={cn(
                'border-b border-r border-border p-2 h-24 cursor-pointer transition-colors hover:bg-accent/50',
                isToday && 'bg-accent/30',
                isWeekend && 'opacity-50'
              )}
              onClick={() => summary && onDateClick(summary)}
            >
              <div
                className={cn(
                  'text-xs font-medium',
                  isToday && 'text-primary font-bold',
                  dayOfWeek === 0 && 'text-red-500',
                  dayOfWeek === 6 && 'text-blue-500'
                )}
              >
                {day}
              </div>
              {summary && (
                <div className="mt-1 space-y-0.5">
                  {summary.buyCount > 0 && (
                    <div className="text-[10px] text-red-400">
                      매수 {summary.buyCount}건
                    </div>
                  )}
                  {summary.sellCount > 0 && (
                    <div className="text-[10px] text-blue-400">
                      매도 {summary.sellCount}건
                    </div>
                  )}
                  {summary.totalProfitLoss !== 0 && (
                    <div
                      className={cn(
                        'text-[10px] font-medium',
                        summary.totalProfitLoss > 0
                          ? 'text-green-500'
                          : 'text-red-500'
                      )}
                    >
                      {summary.totalProfitLoss > 0 ? '+' : ''}
                      {(summary.totalProfitLoss / 10000).toFixed(1)}만
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
