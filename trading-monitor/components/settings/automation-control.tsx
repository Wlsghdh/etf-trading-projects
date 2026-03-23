'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PipelineStep {
  id: string;
  label: string;
  description: string;
  schedule: string;
  startUrl: string;
  stopUrl?: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  message: string;
  progress?: string;
  logs: string[];
  logsLoading: boolean;
}

export function AutomationControl() {
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: 'scraping', label: '데이터 수집', description: 'TradingView 스크래핑 (101종목)', schedule: '매일 07:00 KST', startUrl: '/trading/api/scraper/start', stopUrl: '/trading/api/scraper/stop', status: 'idle', message: '대기 중', logs: [], logsLoading: false },
    { id: 'features', label: '데이터 정제', description: '85개 피처 엔지니어링', schedule: '수집 완료 후 자동', startUrl: '/trading/api/features/start', status: 'idle', message: '대기 중', logs: [], logsLoading: false },
    { id: 'prediction', label: 'ML 예측', description: 'LightGBM 랭킹 예측', schedule: '정제 완료 후 자동', startUrl: '/trading/api/ml/predict', status: 'idle', message: '대기 중', logs: [], logsLoading: false },
    { id: 'trading', label: '매매 실행', description: 'KIS API 자동 주문', schedule: '23:30 KST (APScheduler)', startUrl: '/trading/api/trading/automation', status: 'idle', message: '대기 중', logs: [], logsLoading: false },
  ]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const fetchStatuses = useCallback(async () => {
    try {
      const [scrapRes, featRes, autoRes] = await Promise.allSettled([
        fetch('/trading/api/scraper/status'),
        fetch('/trading/api/features/status'),
        fetch('/trading/api/trading/automation'),
      ]);

      if (scrapRes.status === 'fulfilled' && scrapRes.value.ok) {
        scrapRes.value.json().then(data => {
          const current = data.completedSymbols || data.progress?.current || 0;
          const total = data.totalSymbols || data.progress?.total || 101;
          setSteps(p => p.map(s => s.id === 'scraping' ? {
            ...s,
            status: mapStatus(data.status),
            message: data.status === 'running' ? `${current}/${total} 진행 중` : current > 0 ? `${current}/${total} 완료` : '대기 중',
            progress: `${current}/${total}`,
          } : s));
        });
      }

      if (featRes.status === 'fulfilled' && featRes.value.ok) {
        featRes.value.json().then(data => {
          setSteps(p => p.map(s => s.id === 'features' ? {
            ...s,
            status: mapStatus(data.status),
            message: data.status === 'running' ? `${data.progress || 0}/${data.total || 101} 처리 중` : data.status === 'completed' ? '정제 완료' : data.message || '대기 중',
          } : s));
        });
      }

      if (autoRes.status === 'fulfilled' && autoRes.value.ok) {
        autoRes.value.json().then(data => {
          setTradingEnabled(data.enabled);
          setSteps(p => p.map(s => s.id === 'trading' ? {
            ...s,
            status: data.enabled ? 'running' : 'idle',
            message: data.enabled ? `활성 (${data.scheduler_time})` : '비활성',
          } : s));
        });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  // 로그 가져오기
  async function fetchLogs(stepId: string) {
    setSteps(p => p.map(s => s.id === stepId ? { ...s, logsLoading: true } : s));
    let logs: string[] = [];

    try {
      if (stepId === 'scraping') {
        const res = await fetch('/trading/api/scraper/logs?limit=15');
        if (res.ok) {
          const data = await res.json();
          logs = (data.logs || []).map((l: Record<string, unknown>) => {
            const ts = (l.timestamp as string || '').split('T')[1]?.substring(0, 8) || '';
            return `[${ts}] [${l.level}] ${l.message}`;
          });
        }
      } else if (stepId === 'features') {
        const res = await fetch('/trading/api/features/status');
        if (res.ok) {
          const data = await res.json();
          logs = [
            `상태: ${data.status || 'idle'}`,
            `진행: ${data.progress || 0}/${data.total || 101}`,
            data.message ? `메시지: ${data.message}` : '',
          ].filter(Boolean);
        }
      } else if (stepId === 'prediction') {
        const res = await fetch('/trading/api/ml/ranking');
        if (res.ok) {
          const data = await res.json();
          const date = data.prediction_date ? new Date(data.prediction_date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
          logs = [
            `마지막 예측: ${date}`,
            `모델: ${data.model_name || '-'} v${data.model_version || '-'}`,
            `종목 수: ${data.total_symbols || 0}`,
            data.rankings?.length > 0 ? `1위: ${data.rankings[0].symbol} (score: ${data.rankings[0].score.toFixed(4)})` : '',
            data.rankings?.length > 1 ? `2위: ${data.rankings[1].symbol} (score: ${data.rankings[1].score.toFixed(4)})` : '',
            data.rankings?.length > 2 ? `3위: ${data.rankings[2].symbol} (score: ${data.rankings[2].score.toFixed(4)})` : '',
          ].filter(Boolean);
        }
      } else if (stepId === 'trading') {
        const [autoRes, balRes, statusRes] = await Promise.allSettled([
          fetch('/trading/api/trading/automation'),
          fetch('/trading/api/trading/balance'),
          fetch('/trading/api/trading/status'),
        ]);
        if (autoRes.status === 'fulfilled' && autoRes.value.ok) {
          const d = await autoRes.value.json();
          logs.push(`자동매매: ${d.enabled ? 'ON' : 'OFF'} (${d.trading_mode})`);
          logs.push(`매매 방식: ${d.fractional_mode ? '소수점' : '정수'}`);
          logs.push(`예약 시간: ${d.scheduler_time}`);
        }
        if (balRes.status === 'fulfilled' && balRes.value.ok) {
          const d = await balRes.value.json();
          logs.push(`주문 가능: $${(d.available_cash_usd || 0).toLocaleString()}`);
          logs.push(`KIS 연결: ${d.kis_connected ? '정상' : '실패'}`);
        }
        if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
          const d = await statusRes.value.json();
          logs.push(`보유 종목: ${d.holdingsCount || 0}개`);
          logs.push(`거래일: ${d.automationStatus?.message || '-'}`);
        }
      }
    } catch { /* silent */ }

    setSteps(p => p.map(s => s.id === stepId ? { ...s, logs, logsLoading: false } : s));
  }

  function toggleExpand(stepId: string) {
    if (expandedStep === stepId) {
      setExpandedStep(null);
    } else {
      setExpandedStep(stepId);
      fetchLogs(stepId);
    }
  }

  async function handleStart(step: PipelineStep) {
    setLoading(prev => ({ ...prev, [step.id]: true }));
    try {
      if (step.id === 'trading') {
        await fetch(step.startUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, fractional_mode: false }) });
      } else {
        await fetch(step.startUrl, { method: 'POST' });
      }
      await fetchStatuses();
    } catch { /* */ } finally {
      setLoading(prev => ({ ...prev, [step.id]: false }));
    }
  }

  async function handleStop(step: PipelineStep) {
    setLoading(prev => ({ ...prev, [step.id]: true }));
    try {
      if (step.id === 'trading') {
        await fetch(step.startUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
      } else if (step.stopUrl) {
        await fetch(step.stopUrl, { method: 'POST' });
      }
      await fetchStatuses();
    } catch { /* */ } finally {
      setLoading(prev => ({ ...prev, [step.id]: false }));
    }
  }

  async function handleRunAll() {
    for (const step of steps.filter(s => s.id !== 'trading')) {
      setLoading(prev => ({ ...prev, [step.id]: true }));
      try { await fetch(step.startUrl, { method: 'POST' }); } catch { /* */ }
      finally { setLoading(prev => ({ ...prev, [step.id]: false })); }
    }
    await fetchStatuses();
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          파이프라인 관리
          <Badge variant="outline" className="text-[10px]">자동화</Badge>
        </CardTitle>
        <button onClick={handleRunAll} className="text-xs bg-cyan-600 text-white rounded px-3 py-1.5 hover:bg-cyan-700 transition-colors">
          전체 실행 (수집→정제→예측)
        </button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={step.id} className="rounded-md border border-border overflow-hidden">
              {/* Step row */}
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => toggleExpand(step.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground font-mono w-4">{idx + 1}</span>
                  <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                    step.status === 'running' ? 'bg-blue-500 animate-pulse'
                    : step.status === 'completed' ? 'bg-green-500'
                    : step.status === 'error' ? 'bg-red-500'
                    : 'bg-zinc-600'
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{step.label}</span>
                    <span className="text-[10px] text-muted-foreground">{step.description}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{step.schedule}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className={`text-[10px] font-medium ${
                      step.status === 'running' ? 'text-blue-400'
                      : step.status === 'completed' ? 'text-green-400'
                      : step.status === 'error' ? 'text-red-400'
                      : 'text-zinc-500'
                    }`}>{step.message}</span>
                  </div>
                </div>

                {/* Expand indicator */}
                <span className={`text-xs text-muted-foreground transition-transform ${expandedStep === step.id ? 'rotate-90' : ''}`}>▶</span>

                {/* Controls */}
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleStart(step)}
                    disabled={loading[step.id] || step.status === 'running'}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      step.status === 'running' ? 'bg-blue-600/20 text-blue-400 cursor-default' : 'bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white'
                    } disabled:opacity-50`}
                  >
                    {loading[step.id] ? '...' : step.status === 'running' ? '실행 중' : 'Start'}
                  </button>
                  {(step.stopUrl || step.id === 'trading') && (
                    <button
                      onClick={() => handleStop(step)}
                      disabled={loading[step.id] || (step.status !== 'running' && !(step.id === 'trading' && tradingEnabled))}
                      className="px-2.5 py-1 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-30"
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded logs */}
              {expandedStep === step.id && (
                <div className="border-t border-border bg-zinc-950/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {step.id === 'scraping' ? '최근 로그' : '상태 정보'}
                    </span>
                    <button
                      onClick={() => fetchLogs(step.id)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      새로고침
                    </button>
                  </div>
                  {step.logsLoading ? (
                    <div className="text-xs text-muted-foreground py-2">로딩 중...</div>
                  ) : step.logs.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">데이터 없음</div>
                  ) : (
                    <div className="space-y-0.5 max-h-48 overflow-y-auto font-mono">
                      {step.logs.map((log, i) => (
                        <div key={i} className={`text-[11px] leading-relaxed ${
                          log.includes('[ERROR]') ? 'text-red-400'
                          : log.includes('[WARNING]') ? 'text-yellow-400'
                          : 'text-zinc-400'
                        }`}>
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function mapStatus(s: string): 'idle' | 'running' | 'completed' | 'error' {
  switch (s) {
    case 'running': case 'pending': return 'running';
    case 'completed': return 'completed';
    case 'failed': case 'error': case 'stopped': return 'error';
    default: return 'idle';
  }
}
