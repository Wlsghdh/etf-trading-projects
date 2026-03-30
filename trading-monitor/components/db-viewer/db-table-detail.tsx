'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TableData {
  tableName: string;
  database: string;
  columns: { name: string; type: string }[];
  rows: Record<string, string | null>[];
  total: number;
  limit: number;
  offset: number;
}

interface DBTableDetailProps {
  tableName: string;
  dbName: string;
  onClose: () => void;
}

type DetailView = 'preview' | 'fullscreen' | 'chart';

export function DBTableDetail({ tableName, dbName, onClose }: DBTableDetailProps) {
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<DetailView>('preview');
  const [fullData, setFullData] = useState<TableData | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [selectedTF, setSelectedTF] = useState<string>('');
  const pageSize = 30;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/trading/api/db/tables/${tableName}/data?db_name=${dbName}&limit=${pageSize}&offset=${page * pageSize}`
      );
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch table data:', e);
    } finally {
      setLoading(false);
    }
  }, [tableName, dbName, page]);

  useEffect(() => {
    setPage(0);
    setView('preview');
    setFullData(null);
  }, [tableName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ESC to exit fullscreen
  useEffect(() => {
    if (view !== 'fullscreen' && view !== 'chart') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView('preview');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view]);

  // Parse symbol from tableName (e.g., "AAPL_D" → "AAPL")
  const baseSymbol = tableName.replace(/_[^_]+$/, '');
  const currentTF = tableName.split('_').pop() || '';
  const TIMEFRAMES = ['D', 'W', 'M', '1h', '10m', '12M'];

  const effectiveTF = selectedTF || currentTF;
  const effectiveTable = selectedTF ? `${baseSymbol}_${selectedTF}` : tableName;

  const fetchFullData = async (tfTable?: string) => {
    setFullLoading(true);
    try {
      const target = tfTable || effectiveTable;
      const res = await fetch(
        `/trading/api/db/tables/${target}/data?db_name=${dbName}&limit=500&offset=0`
      );
      if (res.ok) {
        setFullData(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch full data:', e);
    } finally {
      setFullLoading(false);
    }
  };

  const switchTimeframe = (tf: string) => {
    setSelectedTF(tf);
    fetchFullData(`${baseSymbol}_${tf}`);
  };

  const openFullscreen = () => {
    if (!fullData) fetchFullData();
    setView('fullscreen');
  };

  const openChart = () => {
    if (!fullData) fetchFullData();
    setView('chart');
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const displayData = view === 'preview' ? data : (fullData || data);

  // Fullscreen overlay
  if (view === 'fullscreen' || view === 'chart') {
    return (
      <>
        {/* Inline card placeholder */}
        <Card className="shadow-sm">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            전체화면 보기 중 — ESC로 닫기
          </CardContent>
        </Card>

        {/* Fullscreen overlay */}
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
          <div className="p-6 max-w-[95vw] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-background/95 py-2 z-10">
              <div>
                <h2 className="text-lg font-mono font-semibold">{effectiveTable}</h2>
                <p className="text-xs text-muted-foreground">
                  {displayData ? `${displayData.total.toLocaleString()}행 · ${displayData.columns.length}컬럼 · ${dbName}` : '로딩 중...'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Timeframe selector */}
                <div className="flex rounded border border-border overflow-hidden">
                  {TIMEFRAMES.map(tf => (
                    <button
                      key={tf}
                      onClick={() => switchTimeframe(tf)}
                      className={`px-2 py-1.5 text-xs transition-colors ${
                        effectiveTF === tf
                          ? 'bg-cyan-600 text-white'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
                {/* View toggle */}
                <div className="flex rounded border border-border overflow-hidden">
                  <button
                    onClick={() => setView('fullscreen')}
                    className={`px-3 py-1.5 text-xs ${view === 'fullscreen' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  >
                    원본 보기
                  </button>
                  <button
                    onClick={() => setView('chart')}
                    className={`px-3 py-1.5 text-xs ${view === 'chart' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  >
                    시각화
                  </button>
                </div>
                <button
                  onClick={() => { setView('preview'); setSelectedTF(''); }}
                  className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted"
                >
                  ESC 닫기
                </button>
              </div>
            </div>

            {fullLoading ? (
              <div className="text-center py-20 text-muted-foreground">데이터 로딩 중...</div>
            ) : view === 'chart' ? (
              <ChartView data={displayData} tableName={effectiveTable} />
            ) : (
              /* Raw table fullscreen */
              <div className="border border-border rounded overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted z-10">
                    <tr>
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground">#</th>
                      {displayData?.columns.map(col => (
                        <th key={col.name} className="py-2 px-2 text-left font-medium whitespace-nowrap">
                          <div className="font-mono">{col.name}</div>
                          <div className="text-[9px] text-muted-foreground font-normal">{col.type.split('(')[0]}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayData?.rows.map((row, i) => (
                      <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                        <td className="py-1 px-2 text-muted-foreground tabular-nums">{i + 1}</td>
                        {displayData.columns.map(col => (
                          <td key={col.name} className="py-1 px-2 whitespace-nowrap font-mono tabular-nums">
                            {row[col.name] ?? <span className="text-muted-foreground/50">NULL</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // Normal preview
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-mono">{tableName}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data ? `${data.total.toLocaleString()}행 · ${data.columns.length}컬럼 · ${dbName}` : '로딩 중...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openChart}
            className="px-2 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            시각화
          </button>
          <button
            onClick={openFullscreen}
            className="px-2 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            원본 보기
          </button>
          <button onClick={onClose} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            닫기
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <div className="text-sm text-muted-foreground py-8 text-center">데이터 로딩 중...</div>
        ) : data?.rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">데이터 없음</div>
        ) : data ? (
          <>
            {/* Column tags */}
            <div className="mb-3 flex flex-wrap gap-1">
              {data.columns.map(col => (
                <span
                  key={col.name}
                  className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono"
                  title={col.type}
                >
                  {col.name}
                  <span className="ml-1 text-muted-foreground">{col.type.split('(')[0]}</span>
                </span>
              ))}
            </div>

            {/* Data table */}
            <div className="overflow-auto max-h-[400px] border border-border rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {data.columns.map(col => (
                      <th key={col.name} className="py-1.5 px-2 text-left font-medium whitespace-nowrap">
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                      {data.columns.map(col => (
                        <td key={col.name} className="py-1 px-2 whitespace-nowrap font-mono tabular-nums">
                          {row[col.name] ?? <span className="text-muted-foreground">NULL</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.total)} / {data.total.toLocaleString()}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 text-xs rounded border border-border disabled:opacity-30 hover:bg-muted"
                >
                  이전
                </button>
                <span className="px-2 py-1 text-xs text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2 py-1 text-xs rounded border border-border disabled:opacity-30 hover:bg-muted"
                >
                  다음
                </button>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ─── Chart View (SVG line chart) ─── */
function ChartView({ data, tableName }: { data: TableData | null; tableName: string }) {
  if (!data || data.rows.length === 0) {
    return <div className="text-center py-20 text-muted-foreground">차트 데이터 없음</div>;
  }

  // Find close/price column
  const closeCol = data.columns.find(c => c.name === 'close')?.name
    || data.columns.find(c => c.name === 'Close')?.name
    || data.columns.find(c => c.name.toLowerCase().includes('close'))?.name;
  const timeCol = data.columns.find(c => c.name === 'time')?.name
    || data.columns.find(c => c.name === 'date')?.name
    || data.columns.find(c => c.name === 'Date')?.name
    || data.columns[0]?.name;

  if (!closeCol) {
    return <div className="text-center py-20 text-muted-foreground">close 컬럼을 찾을 수 없습니다</div>;
  }

  // Parse data (reverse for chronological order)
  const points = data.rows
    .map(row => ({
      time: (row[timeCol!] || '') as string,
      close: parseFloat(row[closeCol] || '0'),
    }))
    .filter(p => !isNaN(p.close) && p.close > 0)
    .reverse();

  if (points.length < 2) {
    return <div className="text-center py-20 text-muted-foreground">차트를 그리기에 데이터가 부족합니다</div>;
  }

  const closes = points.map(p => p.close);
  const minVal = Math.min(...closes);
  const maxVal = Math.max(...closes);
  const range = maxVal - minVal || 1;

  const W = 900;
  const H = 400;
  const PAD = { top: 20, right: 60, bottom: 40, left: 10 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const pathPoints = points.map((p, i) => {
    const x = PAD.left + (i / (points.length - 1)) * chartW;
    const y = PAD.top + chartH - ((p.close - minVal) / range) * chartH;
    return `${x},${y}`;
  });
  const pathD = `M ${pathPoints.join(' L ')}`;

  // Price change
  const first = closes[0];
  const last = closes[closes.length - 1];
  const change = ((last - first) / first) * 100;
  const isUp = change >= 0;

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (range * i) / 4;
    const y = PAD.top + chartH - (i / 4) * chartH;
    return { val, y };
  });

  // X-axis labels (show first, middle, last dates)
  const xLabels = [
    { label: points[0].time.split(' ')[0], x: PAD.left },
    { label: points[Math.floor(points.length / 2)].time.split(' ')[0], x: PAD.left + chartW / 2 },
    { label: points[points.length - 1].time.split(' ')[0], x: PAD.left + chartW },
  ];

  const symbol = tableName.split('_')[0];

  return (
    <div className="space-y-4">
      {/* Chart header */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold font-mono">{symbol}</span>
        <span className="text-lg font-semibold tabular-nums">${last.toFixed(2)}</span>
        <span className={`text-sm font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{change.toFixed(2)}%
        </span>
        <span className="text-xs text-muted-foreground">{points.length}개 데이터</span>
      </div>

      {/* SVG Chart */}
      <div className="border border-border rounded-lg p-4 bg-muted/10">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={PAD.left} y1={tick.y} x2={PAD.left + chartW} y2={tick.y}
                stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4,4"
              />
              <text
                x={PAD.left + chartW + 5} y={tick.y + 4}
                fill="currentColor" fillOpacity={0.4} fontSize={10} fontFamily="monospace"
              >
                ${tick.val.toFixed(2)}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xLabels.map((lbl, i) => (
            <text
              key={i}
              x={lbl.x} y={H - 10}
              fill="currentColor" fillOpacity={0.4} fontSize={10}
              textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            >
              {lbl.label}
            </text>
          ))}

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke={isUp ? '#22c55e' : '#ef4444'}
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Gradient fill */}
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0.15} />
              <stop offset="100%" stopColor={isUp ? '#22c55e' : '#ef4444'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={`${pathD} L ${PAD.left + chartW},${PAD.top + chartH} L ${PAD.left},${PAD.top + chartH} Z`}
            fill="url(#chartGrad)"
          />
        </svg>
      </div>
    </div>
  );
}
