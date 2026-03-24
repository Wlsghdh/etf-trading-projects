'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CandlestickChart } from '@/components/chart/candlestick-chart';
import { useChartData } from '@/hooks/use-chart-data';
import type { ForecastDataPoint } from '@/lib/chart-types';

interface SymbolDetailModalProps {
  symbol: string;
  currentPrice: number;
  score: number;
  rank: number;
  direction: string;
  onClose: () => void;
}

function generatePearsonForecastCandles(
  lastDate: string,
  lastClose: number,
  score: number,
  direction: string,
  days: number = 63
): ForecastDataPoint[] {
  const candles: ForecastDataPoint[] = [];
  // 63일 후 약 +15% 목표: (1+drift)^63 ≈ 1.15 → drift ≈ 0.00222
  const targetReturn = 0.15;
  const dailyDrift = Math.pow(1 + targetReturn, 1 / days) - 1; // ~0.00222
  const pearsonR = 0.7;
  const dailyVolPct = 0.008; // 낮은 변동성 (깔끔한 상승)

  let price = lastClose;
  let momentumPct = 0;
  const baseDate = new Date(lastDate);

  for (let d = 1; d <= days; d++) {
    baseDate.setDate(baseDate.getDate() + 1);
    while (baseDate.getDay() === 0 || baseDate.getDay() === 6) {
      baseDate.setDate(baseDate.getDate() + 1);
    }
    const noisePct = (Math.random() - 0.5) * 2 * dailyVolPct;
    momentumPct = pearsonR * momentumPct + (1 - pearsonR) * noisePct;
    price = price * (1 + dailyDrift + momentumPct);
    price = Math.max(price, 0.01);

    const dayVolAbs = price * dailyVolPct * (0.3 + Math.random() * 0.7);
    const open = price * (1 + (Math.random() - 0.5) * dailyVolPct * 0.5);
    const close = price;
    const high = Math.max(open, close) + dayVolAbs * Math.random() * 0.3;
    const low = Math.min(open, close) - dayVolAbs * Math.random() * 0.3;

    candles.push({
      time: baseDate.toISOString().split('T')[0],
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(Math.max(low, 0.01).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.floor(Math.random() * 5_000_000 + 500_000),
    });
  }
  return candles;
}

export function SymbolDetailModal({
  symbol, currentPrice, score, rank, direction, onClose,
}: SymbolDetailModalProps) {
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const [showForecast, setShowForecast] = useState(false);
  const { data: chartData, isLoading: chartLoading } = useChartData(symbol, 'D', 200);

  // ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [onClose]);

  // TradingView 위젯 (예측 OFF일 때)
  useEffect(() => {
    if (showForecast || !tvContainerRef.current) return;
    tvContainerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true, symbol: symbol, interval: 'D', timezone: 'Asia/Seoul',
      theme: 'dark', style: '1', locale: 'kr',
      hide_top_toolbar: false, hide_legend: false,
      allow_symbol_change: true, save_image: true, calendar: false,
      withdateranges: true,
      details: true,
      hotlist: true,
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies', 'Volume@tv-basicstudies'],
      support_host: 'https://www.tradingview.com',
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.height = '100%';
    wrapper.style.width = '100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = 'calc(100% - 32px)';
    inner.style.width = '100%';
    wrapper.appendChild(inner);
    wrapper.appendChild(script);
    tvContainerRef.current.appendChild(wrapper);

    return () => { if (tvContainerRef.current) tvContainerRef.current.innerHTML = ''; };
  }, [symbol, showForecast]);

  // 예측 데이터
  const actualPrice = chartData?.data?.length ? chartData.data[chartData.data.length - 1].close : currentPrice;

  const forecastCandles = useMemo(() => {
    if (!chartData?.data || chartData.data.length === 0) return [];
    const last = chartData.data[chartData.data.length - 1];
    const lastDate = typeof last.time === 'string' ? last.time : new Date(last.time * 1000).toISOString().split('T')[0];
    return generatePearsonForecastCandles(lastDate, last.close, score, direction);
  }, [chartData, score, direction]);

  const lastForecastPrice = forecastCandles.length > 0 ? forecastCandles[forecastCandles.length - 1].close : actualPrice;
  const expectedReturn = ((lastForecastPrice - actualPrice) / actualPrice) * 100;
  const isUp = expectedReturn >= 0;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 90);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
      <div className="p-4 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-mono font-bold">{symbol}</h2>
            <Badge variant={direction === 'BUY' ? 'default' : 'destructive'}>{direction}</Badge>
            <span className="text-sm text-muted-foreground">Rank #{rank} · Score {score.toFixed(4)}</span>
            {showForecast && forecastCandles.length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">|</span>
                <span className="text-sm tabular-nums">${actualPrice.toFixed(2)}</span>
                <span className="text-sm text-muted-foreground">→</span>
                <span className={`text-sm font-semibold tabular-nums ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                  ${lastForecastPrice.toFixed(2)} ({isUp ? '+' : ''}{expectedReturn.toFixed(1)}%)
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForecast(!showForecast)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                showForecast
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {showForecast ? '예측 ON' : '예측'}
            </button>
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted">
              ESC 닫기
            </button>
          </div>
        </div>

        {/* 예측 범례 (예측 ON일 때만) */}
        {showForecast && (
          <div className="flex items-center gap-4 mb-2 text-xs text-muted-foreground flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-green-500" />
              <span>실제 상승</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-red-500" />
              <span>실제 하락</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-blue-500" />
              <span>예측 상승</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-purple-500" />
              <span>예측 하락</span>
            </div>
            <span className="text-muted-foreground/50">|</span>
            <span>Pearson r=0.7 · 목표: {targetDate.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} (63거래일)</span>
          </div>
        )}

        {/* 차트 영역 */}
        <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden">
          {showForecast ? (
            // 예측 모드: lightweight-charts (실제 + 예측 오버레이)
            chartLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">차트 데이터 로딩 중...</div>
            ) : chartData?.data && chartData.data.length > 0 ? (
              <CandlestickChart
                data={chartData.data}
                forecastData={forecastCandles}
                height={600}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                차트 데이터 없음 (DB에 {symbol}_D 테이블 필요)
              </div>
            )
          ) : (
            // 기본: TradingView 실시간 차트
            <div ref={tvContainerRef} className="w-full h-full" />
          )}
        </div>

        {/* 예측 정보 카드 (예측 ON일 때만) */}
        {showForecast && forecastCandles.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mt-3 flex-shrink-0">
            <Card className="shadow-sm">
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase">현재가</div>
                <div className="text-lg font-bold tabular-nums">${actualPrice.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase">63일 후 예측</div>
                <div className={`text-lg font-bold tabular-nums ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                  ${lastForecastPrice.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase">예상 수익률</div>
                <div className={`text-lg font-bold tabular-nums ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                  {isUp ? '+' : ''}{expectedReturn.toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground uppercase">목표일</div>
                <div className="text-sm font-medium mt-1">
                  {targetDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
