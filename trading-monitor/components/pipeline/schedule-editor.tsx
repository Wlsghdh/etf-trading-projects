'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ScheduleConfig } from '@/lib/types';

interface ScheduleEditorProps {
  schedule: ScheduleConfig;
  onSave: (schedule: ScheduleConfig) => void;
}

const scheduleLabels: Record<keyof ScheduleConfig, string> = {
  scraping: '데이터 수집',
  featureEngineering: '피처 엔지니어링',
  prediction: 'ML 예측',
  tradeDecision: '매매 결정',
  kisOrder: 'KIS 예약주문',
  monthlyRetrain: '월간 재학습 (매월 1일)',
};

export function ScheduleEditor({ schedule, onSave }: ScheduleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ScheduleConfig>(schedule);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">스케줄 설정</CardTitle>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline"
          >
            편집
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setDraft(schedule); }}
              className="text-xs text-muted-foreground hover:underline"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="text-xs text-primary hover:underline font-medium"
            >
              저장
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {saved && (
          <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2">
            <p className="text-xs text-green-500">스케줄이 저장되었습니다. 다음 실행부터 적용됩니다.</p>
          </div>
        )}

        {(Object.keys(scheduleLabels) as (keyof ScheduleConfig)[]).map((key) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{scheduleLabels[key]}</span>
            {editing ? (
              <input
                type="time"
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
              />
            ) : (
              <span className="text-sm font-mono font-medium">{schedule[key]} KST</span>
            )}
          </div>
        ))}

        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            * 스케줄 변경 시 서버의 cron/APScheduler 설정이 함께 업데이트됩니다.
            월~금 미국장 운영일에만 실행됩니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
