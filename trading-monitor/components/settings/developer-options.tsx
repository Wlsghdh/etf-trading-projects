'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { API_ENDPOINTS } from '@/lib/constants';
import type { DeveloperConfig } from '@/lib/types';

interface DeveloperOptionsProps {
  config: DeveloperConfig;
  onUpdate: (config: DeveloperConfig) => void;
}

export function DeveloperOptions({ config, onUpdate }: DeveloperOptionsProps) {
  const [saved, setSaved] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const update = (partial: Partial<DeveloperConfig>) => {
    onUpdate({ ...config, ...partial });
  };

  const handleSave = async () => {
    try {
      await fetch(API_ENDPOINTS.AUTOMATION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.automationEnabled,
          fractional_mode: false,
        }),
      });
    } catch {
      // silent
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = async () => {
    if (!confirm('사이클을 리셋하시겠습니까?\n모든 활성 사이클이 종료됩니다.')) return;
    setResetLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.RESET, { method: 'POST' });
      const data = await res.json();
      setResetMsg(data.message);
      setTimeout(() => setResetMsg(null), 5000);
    } catch {
      setResetMsg('리셋 실패');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          개발자 설정
          <Badge variant="outline" className="text-[10px]">Dev Mode</Badge>
        </CardTitle>
        <button
          onClick={handleSave}
          className="text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:bg-primary/90 transition-colors"
        >
          {saved ? '저장됨!' : '설정 저장'}
        </button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Column 1: 매매 설정 */}
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
              매매 설정
            </h4>

            {/* 자동매매 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">자동매매</span>
                <p className="text-xs text-muted-foreground">APScheduler 자동 실행</p>
              </div>
              <button
                onClick={() => update({ automationEnabled: !config.automationEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.automationEnabled ? 'bg-green-500' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    config.automationEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* 매매 모드 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">매매 모드</span>
                <p className="text-xs text-muted-foreground">paper / live</p>
              </div>
              <div className="flex rounded border border-border overflow-hidden">
                <button
                  onClick={() => update({ tradingMode: 'paper' })}
                  className={`px-3 py-1 text-xs transition-colors ${
                    config.tradingMode === 'paper'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  모의투자
                </button>
                <button
                  onClick={() => update({ tradingMode: 'live' })}
                  className={`px-3 py-1 text-xs transition-colors ${
                    config.tradingMode === 'live'
                      ? 'bg-red-600 text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  실투자
                </button>
              </div>
            </div>

            {/* 매매 방식 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">매매 방식</span>
                <p className="text-xs text-muted-foreground">소수점 미지원</p>
              </div>
              <Badge variant="secondary" className="text-xs">정수 매매</Badge>
            </div>

            {/* 벤치마크 ETF */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">고정 ETF</span>
              <select
                value={config.benchmarkETF}
                onChange={(e) => update({ benchmarkETF: e.target.value })}
                className="rounded border border-input bg-background px-2 py-1 text-sm"
              >
                <option value="QQQ">QQQ</option>
                <option value="SPY">SPY</option>
                <option value="IWM">IWM</option>
                <option value="VTI">VTI</option>
              </select>
            </div>
          </div>

          {/* Column 2: 포트폴리오 파라미터 */}
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
              포트폴리오 파라미터
            </h4>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">AI 전략 비율</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={50}
                  max={90}
                  value={config.activeRatio}
                  onChange={(e) => update({
                    activeRatio: Number(e.target.value),
                    benchmarkRatio: 100 - Number(e.target.value),
                  })}
                  className="w-20 accent-primary"
                />
                <span className="text-sm font-medium tabular-nums w-10 text-right">{config.activeRatio}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">고정 ETF 비율</span>
              <span className="text-sm font-medium tabular-nums">{config.benchmarkRatio}%</span>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">FIFO 사이클</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={config.cycleDays}
                  onChange={(e) => update({ cycleDays: Number(e.target.value) })}
                  className="w-16 rounded border border-input bg-background px-2 py-1 text-sm text-right tabular-nums"
                />
                <span className="text-xs text-muted-foreground">거래일</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">투자 자본금</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">$</span>
                <input
                  type="number"
                  value={config.capital}
                  onChange={(e) => update({ capital: Number(e.target.value) })}
                  className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">최대 보유 종목</span>
              <input
                type="number"
                value={config.maxHoldings}
                onChange={(e) => update({ maxHoldings: Number(e.target.value) })}
                className="w-16 rounded border border-input bg-background px-2 py-1 text-sm text-right tabular-nums"
              />
            </div>
          </div>

          {/* Column 3: 시스템 관리 */}
          <div className="space-y-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
              시스템 관리
            </h4>

            {/* 스케줄 */}
            <div className="space-y-2">
              <span className="text-sm font-medium">자동화 스케줄</span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">데이터 수집</span>
                  <span className="font-medium tabular-nums">{config.schedule.scraping} KST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">피처 처리</span>
                  <span className="font-medium tabular-nums">{config.schedule.featureEngineering} KST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">예측</span>
                  <span className="font-medium tabular-nums">{config.schedule.prediction} KST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">KIS 주문</span>
                  <span className="font-medium tabular-nums">{config.schedule.kisOrder} KST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">월간 재학습</span>
                  <span className="font-medium tabular-nums">{config.schedule.monthlyRetrain} (매월 1일)</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* 사이클 리셋 */}
            <div className="space-y-2">
              <span className="text-sm font-medium">사이클 관리</span>
              <button
                onClick={handleReset}
                disabled={resetLoading}
                className="w-full rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-900/50 transition-colors disabled:opacity-50"
              >
                {resetLoading ? '리셋 중...' : '사이클 리셋'}
              </button>
              <p className="text-[10px] text-muted-foreground">
                활성 사이클을 종료합니다. KIS 모의투자 잔고 리셋은 한국투자증권 사이트에서 진행하세요.
              </p>
              {resetMsg && (
                <div className="text-xs text-yellow-400 bg-yellow-500/10 rounded px-2 py-1.5">
                  {resetMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
