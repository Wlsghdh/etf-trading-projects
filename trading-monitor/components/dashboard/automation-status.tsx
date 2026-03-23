'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TradingStatus } from '@/lib/types';

interface AutomationStatusProps {
  status: TradingStatus;
  onRefetch?: () => void;
}

function getNextScheduledTime(
  targetHour: number,
  targetMinute: number,
  targetDay?: number
): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKst = new Date(now.getTime() + kstOffset);

  if (targetDay !== undefined) {
    const next = new Date(nowKst);
    next.setUTCDate(targetDay);
    next.setUTCHours(targetHour, targetMinute, 0, 0);
    if (next.getTime() <= nowKst.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(targetDay);
    }
    const localNext = new Date(next.getTime() - kstOffset);
    return localNext.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    }) + ' 03:00 KST';
  }

  const next = new Date(nowKst);
  next.setUTCHours(targetHour, targetMinute, 0, 0);
  if (next.getTime() <= nowKst.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const localNext = new Date(next.getTime() - kstOffset);
  return localNext.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }) + ' KST';
}

export function AutomationStatus({ status, onRefetch }: AutomationStatusProps) {
  const { automationStatus } = status;
  const isSuccess = automationStatus.success;
  const [loading, setLoading] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(status.automationEnabled ?? false);
  const [fractionalMode, setFractionalMode] = useState(status.fractionalMode ?? false);
  const [dstEnabled, setDstEnabled] = useState(true); // 서머타임 기본 ON

  // 서머타임 상태 조회
  useState(() => {
    fetch('/trading/api/trading/automation').then(r => r.json()).then(d => {
      if (d.dst_enabled !== undefined) setDstEnabled(d.dst_enabled);
    }).catch(() => {});
  });

  const tradeHour = dstEnabled ? 22 : 23;
  const nextPrediction = getNextScheduledTime(7, 0);
  const nextTrading = getNextScheduledTime(tradeHour, 30);
  const nextRetraining = getNextScheduledTime(3, 0, 1);

  async function toggleAutomation(enabled: boolean, fractional?: boolean, dst?: boolean) {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { enabled };
      if (fractional !== undefined) body.fractional_mode = fractional;
      if (dst !== undefined) body.dst_enabled = dst;

      const res = await fetch('/trading/api/trading/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setAutomationEnabled(data.enabled);
        setFractionalMode(data.fractional_mode);
        if (data.dst_enabled !== undefined) setDstEnabled(data.dst_enabled);
        onRefetch?.();
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          자동매매 제어
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              automationEnabled ? 'bg-green-500 animate-pulse' : 'bg-zinc-400'
            }`}
          />
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {status.mode === 'live' ? '실투자' : '모의투자'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 시작/중지 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={() => toggleAutomation(true, fractionalMode)}
            disabled={loading || automationEnabled}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              automationEnabled
                ? 'bg-green-600 text-white cursor-default'
                : 'bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white'
            } disabled:opacity-50`}
          >
            {automationEnabled ? '실행 중' : '시작'}
          </button>
          <button
            onClick={() => toggleAutomation(false)}
            disabled={loading || !automationEnabled}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              !automationEnabled
                ? 'bg-zinc-700 text-zinc-400 cursor-default'
                : 'bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white'
            } disabled:opacity-50`}
          >
            중지
          </button>
        </div>

        {/* 매매 모드 선택 */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            매매 방식
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setFractionalMode(false);
                if (automationEnabled) toggleAutomation(true, false);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium border transition-colors ${
                !fractionalMode
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <div className="font-semibold">정수 매매</div>
              <div className="mt-0.5 text-[10px] opacity-70">예산 내 상위 N개 1주씩</div>
            </button>
            <button
              onClick={() => {
                setFractionalMode(true);
                if (automationEnabled) toggleAutomation(true, true);
              }}
              disabled
              className="flex-1 rounded-md px-3 py-2 text-xs font-medium border border-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed"
            >
              <div className="font-semibold">소수점 매매</div>
              <div className="mt-0.5 text-[10px] opacity-70">미지원 (준비 중)</div>
            </button>
          </div>
        </div>

        {/* 서머타임 토글 */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            서머타임 (미국 개장 시간)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setDstEnabled(true);
                toggleAutomation(automationEnabled, undefined, true);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium border transition-colors ${
                dstEnabled
                  ? 'border-yellow-500 bg-yellow-500/20 text-yellow-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <div className="font-semibold">ON (3월~11월)</div>
              <div className="mt-0.5 text-[10px] opacity-70">매매 22:30 KST</div>
            </button>
            <button
              onClick={() => {
                setDstEnabled(false);
                toggleAutomation(automationEnabled, undefined, false);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium border transition-colors ${
                !dstEnabled
                  ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <div className="font-semibold">OFF (11월~3월)</div>
              <div className="mt-0.5 text-[10px] opacity-70">매매 23:30 KST</div>
            </button>
          </div>
        </div>

        {/* 상태 정보 */}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">상태</span>
            <span
              className={`text-sm font-medium ${
                isSuccess ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {isSuccess ? '정상' : '오류'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">마지막 실행</span>
            <span className="text-sm font-medium">
              {automationStatus.lastRun
                ? new Date(automationStatus.lastRun).toLocaleTimeString('ko-KR')
                : '-'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">메시지</span>
            <span className="text-sm font-medium truncate max-w-[160px]">
              {automationStatus.message}
            </span>
          </div>
        </div>

        {/* 스케줄 */}
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            예정 스케줄
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">다음 예측</span>
            <span className="text-sm font-medium tabular-nums">{nextPrediction}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">다음 매매</span>
            <span className="text-sm font-medium tabular-nums">{nextTrading}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">다음 재학습</span>
            <span className="text-sm font-medium tabular-nums">{nextRetraining}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
