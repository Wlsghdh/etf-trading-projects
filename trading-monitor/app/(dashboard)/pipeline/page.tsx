'use client';

import { useState, useEffect, useCallback } from 'react';
import { PipelineTimeline } from '@/components/pipeline/pipeline-timeline';
import { PipelineOverview } from '@/components/pipeline/pipeline-overview';
import { ScheduleEditor } from '@/components/pipeline/schedule-editor';
import type { PipelineStatus, PipelineStep, ScheduleConfig } from '@/lib/types';

function buildDefaultSchedule(): ScheduleConfig {
  return {
    scraping: '07:00',
    featureEngineering: '자동',
    prediction: '자동',
    tradeDecision: '자동',
    kisOrder: '23:30',
    monthlyRetrain: '03:00 (매월 1일)',
  };
}

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);

  const fetchPipelineStatus = useCallback(async () => {
    const steps: PipelineStep[] = [
      { id: 'scraping', name: '데이터 수집', description: 'TradingView 스크래핑 (101종목)', scheduledTime: '07:00', status: 'idle', lastRunAt: null, lastRunDuration: null, lastRunMessage: null, nextRunAt: null },
      { id: 'feature', name: '피처 처리', description: '85개 피처 엔지니어링', scheduledTime: '수집 후', status: 'idle', lastRunAt: null, lastRunDuration: null, lastRunMessage: null, nextRunAt: null },
      { id: 'prediction', name: 'ML 예측', description: 'LightGBM 랭킹 예측', scheduledTime: '정제 후', status: 'idle', lastRunAt: null, lastRunDuration: null, lastRunMessage: null, nextRunAt: null },
      { id: 'trading', name: '매매 실행', description: 'KIS API 자동 주문', scheduledTime: '23:30', status: 'idle', lastRunAt: null, lastRunDuration: null, lastRunMessage: null, nextRunAt: null },
    ];

    try {
      const [scrapRes, featRes, rankRes, autoRes, statusRes] = await Promise.allSettled([
        fetch('/trading/api/scraper/status'),
        fetch('/trading/api/features/status'),
        fetch('/trading/api/ml/ranking'),
        fetch('/trading/api/trading/automation'),
        fetch('/trading/api/trading/status'),
      ]);

      // 스크래핑
      if (scrapRes.status === 'fulfilled' && scrapRes.value.ok) {
        const d = await scrapRes.value.json();
        const current = d.completedSymbols || d.progress?.current || 0;
        const total = d.totalSymbols || d.progress?.total || 101;
        steps[0].status = d.status === 'running' ? 'running' : current > 0 ? 'completed' : 'idle';
        steps[0].lastRunMessage = current > 0 ? `${current}/${total} 종목 완료` : null;
        steps[0].lastRunAt = d.completedAt || d.startedAt || null;
      }

      // 피처
      if (featRes.status === 'fulfilled' && featRes.value.ok) {
        const d = await featRes.value.json();
        steps[1].status = d.status === 'running' ? 'running' : d.status === 'completed' ? 'completed' : 'idle';
        steps[1].lastRunMessage = d.message || null;
      }

      // ML 예측
      if (rankRes.status === 'fulfilled' && rankRes.value.ok) {
        const d = await rankRes.value.json();
        if (d.prediction_date) {
          steps[2].status = 'completed';
          steps[2].lastRunAt = d.prediction_date;
          steps[2].lastRunMessage = `${d.total_symbols}종목 · ${d.model_name}`;
        }
      }

      // 매매
      if (autoRes.status === 'fulfilled' && autoRes.value.ok) {
        const d = await autoRes.value.json();
        steps[3].status = d.enabled ? 'running' : 'idle';
        steps[3].lastRunMessage = d.enabled ? `활성 (${d.scheduler_time})` : '비활성';
        steps[3].scheduledTime = d.scheduler_time || '22:30';
      }

      // 매매 상태에서 오늘 매수 건수 반영
      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const d = await statusRes.value.json();
        if (d.todayBuyCount > 0 || d.todaySellCount > 0) {
          steps[3].status = 'completed';
          steps[3].lastRunMessage = `매수 ${d.todayBuyCount}건 · 매도 ${d.todaySellCount}건 완료`;
          steps[3].lastRunAt = d.automationStatus?.lastRun || null;
        }
      }
    } catch { /* silent */ }

    const anyRunning = steps.some(s => s.status === 'running');
    const lastCompleted = steps.filter(s => s.lastRunAt).sort((a, b) => (b.lastRunAt || '').localeCompare(a.lastRunAt || ''))[0];

    setPipeline({
      isRunning: anyRunning,
      currentStep: steps.find(s => s.status === 'running')?.id || null,
      steps,
      lastFullRunAt: lastCompleted?.lastRunAt || null,
      lastFullRunSuccess: steps.filter(s => s.id !== 'trading').every(s => s.status === 'completed'),
    });
  }, []);

  useEffect(() => {
    setSchedule(buildDefaultSchedule());
    fetchPipelineStatus();
    const interval = setInterval(fetchPipelineStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchPipelineStatus]);

  if (!pipeline || !schedule) return null;

  return (
    <div className="space-y-6">
      <PipelineOverview pipeline={pipeline} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineTimeline steps={pipeline.steps} />
        </div>
        <div>
          <ScheduleEditor schedule={schedule} onSave={setSchedule} />
        </div>
      </div>
    </div>
  );
}
