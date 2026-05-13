'use client';

import { useState, useEffect, useCallback } from 'react';

interface CollectionLog {
  job_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  total_metrics: number;
  success_count: number;
  fail_count: number;
  error_details: string | null;
}

interface MetricData {
  value: number;
  change_pct: number | null;
  extra_label: string | null;
  source: string;
}

interface DayData {
  date: string;
  metrics: Record<string, MetricData>;
}

const METRIC_LABELS: Record<string, { label: string; unit: string; emoji: string }> = {
  sp500: { label: 'S&P 500', unit: '', emoji: '📈' },
  nasdaq: { label: 'NASDAQ', unit: '', emoji: '📊' },
  dow: { label: 'DOW', unit: '', emoji: '📉' },
  vix: { label: 'VIX', unit: '', emoji: '😱' },
  gold: { label: 'Gold', unit: '$', emoji: '🥇' },
  bitcoin: { label: 'Bitcoin', unit: '$', emoji: '₿' },
  crude_oil: { label: 'Crude Oil', unit: '$', emoji: '🛢️' },
  dollar_index: { label: 'Dollar Index', unit: '', emoji: '💵' },
  fed_rate: { label: 'Fed Rate', unit: '%', emoji: '🏦' },
  treasury_10y: { label: '10Y Treasury', unit: '%', emoji: '📜' },
  usd_krw: { label: 'USD/KRW', unit: '₩', emoji: '🇰🇷' },
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  partial: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  running: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  idle: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

export default function MarketDataPage() {
  const [logs, setLogs] = useState<CollectionLog[]>([]);
  const [data, setData] = useState<DayData[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState('');

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/trading/api/market-data/collection-logs?limit=20');
      const json = await res.json();
      setLogs(json.logs || []);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/trading/api/market-data/history?days=30');
      const json = await res.json();
      setData(json.data || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchData();
    const interval = setInterval(() => {
      fetchLogs();
      fetchData();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchLogs, fetchData]);

  const handleCollect = async () => {
    setCollecting(true);
    setMessage('');
    try {
      const res = await fetch('/trading/api/market-data/collect', { method: 'POST' });
      const json = await res.json();
      setMessage(`수집 시작: ${json.target_date || json.message || 'OK'}`);
      setTimeout(() => {
        fetchLogs();
        fetchData();
      }, 5000);
    } catch (e) {
      setMessage(`오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      setCollecting(false);
    }
  };

  const formatValue = (metric: string, value: number) => {
    const info = METRIC_LABELS[metric];
    if (!info) return value.toLocaleString();
    if (info.unit === '$') return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    if (info.unit === '%') return `${value.toFixed(2)}%`;
    if (info.unit === '₩') return `₩${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">시장 데이터 수집</h1>
          <p className="text-sm text-muted-foreground mt-1">
            환율, 지수, 원자재, 금리 등 시장 데이터를 매일 수집하여 DB에 저장합니다
          </p>
        </div>
        <button
          onClick={handleCollect}
          disabled={collecting}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
        >
          {collecting ? '수집 중...' : '지금 수집'}
        </button>
      </div>

      {message && (
        <div className="px-4 py-2 bg-blue-500/10 text-blue-600 border border-blue-500/20 rounded-lg text-sm">
          {message}
        </div>
      )}

      {/* Latest Data Grid */}
      {data.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">최신 시장 데이터 ({data[0].date})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(data[0].metrics).map(([metric, d]) => {
              const info = METRIC_LABELS[metric] || { label: metric, unit: '', emoji: '' };
              const isPositive = (d.change_pct ?? 0) > 0;
              const isNegative = (d.change_pct ?? 0) < 0;
              return (
                <div
                  key={metric}
                  className="p-4 rounded-xl border bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{info.emoji}</span>
                    <span className="text-xs text-muted-foreground font-medium">{info.label}</span>
                  </div>
                  <div className="text-xl font-bold">{formatValue(metric, d.value)}</div>
                  {d.change_pct != null && (
                    <div
                      className={`text-xs font-medium mt-1 ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-muted-foreground'}`}
                    >
                      {isPositive ? '+' : ''}
                      {d.change_pct.toFixed(2)}%
                    </div>
                  )}
                  {d.extra_label && (
                    <div className="text-xs text-muted-foreground mt-0.5">{d.extra_label}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historical Table */}
      {data.length > 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">히스토리 (최근 {data.length}일)</h2>
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">날짜</th>
                  {Object.keys(METRIC_LABELS).map((m) => (
                    <th key={m} className="text-right p-3 font-medium whitespace-nowrap">
                      {METRIC_LABELS[m].emoji} {METRIC_LABELS[m].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((day) => (
                  <tr key={day.date} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium whitespace-nowrap">{day.date}</td>
                    {Object.keys(METRIC_LABELS).map((m) => {
                      const d = day.metrics[m];
                      if (!d) return <td key={m} className="p-3 text-right text-muted-foreground">-</td>;
                      const isPos = (d.change_pct ?? 0) > 0;
                      const isNeg = (d.change_pct ?? 0) < 0;
                      return (
                        <td key={m} className="p-3 text-right">
                          <div>{formatValue(m, d.value)}</div>
                          {d.change_pct != null && (
                            <div
                              className={`text-xs ${isPos ? 'text-green-600' : isNeg ? 'text-red-600' : 'text-muted-foreground'}`}
                            >
                              {isPos ? '+' : ''}
                              {d.change_pct.toFixed(2)}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Collection Logs */}
      <div>
        <h2 className="text-lg font-semibold mb-3">수집 로그</h2>
        {logs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground border rounded-xl">
            수집 기록이 없습니다. &quot;지금 수집&quot; 버튼을 눌러 첫 수집을 시작하세요.
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.job_id}
                className={`flex items-center justify-between p-4 rounded-xl border ${STATUS_COLORS[log.status] || STATUS_COLORS.idle}`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                      log.status === 'completed'
                        ? 'bg-green-600 text-white'
                        : log.status === 'partial'
                        ? 'bg-yellow-600 text-white'
                        : log.status === 'failed'
                        ? 'bg-red-600 text-white'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {log.status}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{log.started_at}</div>
                    {log.finished_at && (
                      <div className="text-xs text-muted-foreground">
                        완료: {log.finished_at}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600 font-medium">{log.success_count} 성공</span>
                  {log.fail_count > 0 && (
                    <span className="text-red-600 font-medium">{log.fail_count} 실패</span>
                  )}
                  {log.error_details && (
                    <span className="text-xs text-red-500 max-w-[200px] truncate" title={log.error_details}>
                      {log.error_details}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
