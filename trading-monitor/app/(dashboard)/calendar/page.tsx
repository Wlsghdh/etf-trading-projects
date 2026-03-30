'use client';

import { useState } from 'react';
import { useHistory } from '@/hooks/use-history';
import { CalendarGrid } from '@/components/calendar/calendar-grid';
import { DayDetailModal } from '@/components/calendar/day-detail-modal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DailySummary } from '@/lib/types';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<DailySummary | null>(null);
  const { data: history, isLoading } = useHistory();

  const handlePrevMonth = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" onClick={handlePrevMonth}>
            <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            {year}년 {month + 1}월
          </h2>
          <Button variant="outline" size="icon-sm" onClick={handleNextMonth}>
            <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setYear(today.getFullYear());
            setMonth(today.getMonth());
          }}
        >
          오늘
        </Button>
      </div>

      <CalendarGrid
        year={year}
        month={month}
        dailySummaries={history || []}
        onDateClick={setSelectedDay}
      />

      {selectedDay && (
        <DayDetailModal
          summary={selectedDay}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
