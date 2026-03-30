'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CandlestickChart } from './candlestick-chart';
import { useChartData } from '@/hooks/use-chart-data';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TIMEFRAME_OPTIONS, type ChartTimeframe } from '@/lib/chart-types';
import type { Holding } from '@/lib/types';
import {
  type PredictionMode,
  type PredictionOverlayData,
  findSimilarPatterns,
} from '@/lib/prediction-utils';

interface PriceChartPanelProps {
  holding: Holding | null;
  onClose: () => void;
}

export function PriceChartPanel({ holding, onClose }: PriceChartPanelProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('D');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [predictionMode, setPredictionMode] = useState<PredictionMode>('off');
  const { data, isLoading } = useChartData(holding?.etfCode ?? null, timeframe);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
      }
    },
    [onClose, isFullscreen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (holding) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [holding]);

  // Compute prediction overlay: historical analogy, top 1 pattern only
  const predictionOverlay = useMemo<PredictionOverlayData | undefined>(() => {
    if (predictionMode === 'off' || !data?.data || data.data.length < 20 || timeframe !== 'D') {
      return undefined;
    }
    const historical = findSimilarPatterns(data.data, 15, 63, 1);
    return { historical };
  }, [predictionMode, data, timeframe]);

  if (!holding) return null;

  const isPositive = holding.profitLossPercent >= 0;
  const chartPoints = data?.data ?? [];
  const lastClose = chartPoints.length > 0 ? chartPoints[chartPoints.length - 1].close : 0;
  const prevClose = chartPoints.length > 1 ? chartPoints[chartPoints.length - 2].close : lastClose;
  const changePercent = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : 0;

  // Simple RSI
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < Math.min(chartPoints.length, 15); i++) {
    const diff = chartPoints[i].close - chartPoints[i - 1].close;
    if (diff > 0) gains.push(diff);
    else losses.push(Math.abs(diff));
  }
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / 14 : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / 14 : 1;
  const rsi = Math.round(100 - 100 / (1 + avgGain / avgLoss));

  const chartHeight = isFullscreen ? 600 : 400;
  const pattern = predictionOverlay?.historical?.[0];

  const PredictionButton = () => (
    <Button
      variant={predictionMode === 'pred' ? 'default' : 'outline'}
      size="xs"
      onClick={() => setPredictionMode((prev) => (prev === 'pred' ? 'off' : 'pred'))}
      disabled={timeframe !== 'D'}
      title={timeframe !== 'D' ? '일봉에서만 예측 가능' : '과거 유사 패턴 분석'}
      className="transition-all duration-200 active:scale-95"
    >
      예측
    </Button>
  );

  const ChartLegend = () => {
    if (predictionMode === 'off' || !pattern) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 text-xs text-muted-foreground"
      >
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-green-500" />
          <span>실제</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-4 rounded" style={{ backgroundColor: pattern.lineColor }} />
          <span>유사 패턴 (유사도 {(pattern.similarity * 100).toFixed(0)}%)</span>
        </div>
      </motion.div>
    );
  };

  const renderChart = (h: number) => (
    isLoading ? (
      <Skeleton className="w-full rounded-md" style={{ height: h }} />
    ) : data?.data ? (
      <CandlestickChart
        data={data.data}
        predictionOverlay={predictionOverlay}
        height={h}
      />
    ) : (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height: h }}>
        데이터를 불러올 수 없습니다
      </div>
    )
  );

  const IconBtn = ({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) => (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground
                 hover:bg-muted hover:text-foreground
                 active:scale-90 transition-all duration-150"
    >
      {children}
    </button>
  );

  const ExpandIcon = () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M2 6V4a2 2 0 012-2h2M10 2h2a2 2 0 012 2v2M2 10v2a2 2 0 002 2h2M10 14h2a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  const ShrinkIcon = () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M6 2H4a2 2 0 00-2 2v2M10 2h2a2 2 0 012 2v2M6 14H4a2 2 0 01-2-2v-2M10 14h2a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  const CloseIcon = () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );

  const PredictionInfoCard = () => {
    if (predictionMode === 'off') return null;
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <Card className="shadow-sm mt-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">예측</Badge>
                <span className="text-sm text-muted-foreground">
                  과거 유사 패턴 분석 (63일 투사)
                </span>
              </div>
              {pattern ? (
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: pattern.lineColor }} />
                    <span className="text-muted-foreground">
                      유사도 {(pattern.similarity * 100).toFixed(0)}%
                      → 63일 후{' '}
                      <span className={`font-medium tabular-nums ${
                        pattern.path[pattern.path.length - 1]?.value >= lastClose ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {pattern.path[pattern.path.length - 1]
                          ? `${((pattern.path[pattern.path.length - 1].value / lastClose - 1) * 100).toFixed(1)}%`
                          : '-'}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    최근 15일과 가장 유사한 과거 패턴을 찾아 이후 63일 가격을 현재가 기준으로 투사합니다.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  유사 패턴을 찾지 못했습니다. 더 많은 데이터가 필요합니다.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    );
  };

  // === FULLSCREEN ===
  if (isFullscreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] bg-background flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">{holding.etfName}</h2>
            <span className="font-mono text-sm text-muted-foreground">{holding.etfCode}</span>
            <span className="text-xl font-bold tabular-nums">{holding.currentPrice.toFixed(2)}</span>
            <span className={`text-sm font-medium tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}{holding.profitLossPercent}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PredictionButton />
            <IconBtn onClick={() => setIsFullscreen(false)} title="축소"><ShrinkIcon /></IconBtn>
            <IconBtn onClick={onClose}><CloseIcon /></IconBtn>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-2">
            <Tabs defaultValue={timeframe} onValueChange={(val) => setTimeframe(val as ChartTimeframe)}>
              <TabsList>
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <TabsTrigger key={opt.value} value={opt.value}>{opt.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ChartLegend />
          </div>

          <motion.div
            key={`${timeframe}-${predictionMode}`}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mt-4"
          >
            {renderChart(chartHeight)}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="grid grid-cols-4 gap-3 mt-4"
          >
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">RSI (14)</div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${rsi > 70 ? 'text-red-500' : rsi < 30 ? 'text-green-500' : 'text-foreground'}`}>{rsi}</div>
                <div className="mt-1 text-xs text-muted-foreground">{rsi > 70 ? '과매수' : rsi < 30 ? '과매도' : '중립'}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">전일 대비</div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">{lastClose.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">매수가</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{holding.buyPrice.toFixed(2)}</div>
                <div className="mt-1 text-xs text-muted-foreground">수량 {holding.quantity}주</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">평가손익</div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${holding.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {holding.profitLoss >= 0 ? '+' : ''}{holding.profitLoss.toFixed(2)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">D+{holding.dDay}</div>
              </CardContent>
            </Card>
          </motion.div>

          <PredictionInfoCard />
        </div>
      </motion.div>
    );
  }

  // === SLIDE PANEL ===
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[50vw]"
      >
        <div className="flex w-full flex-col overflow-y-auto bg-background border-l border-border shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">{holding.etfName}</h2>
                <span className="font-mono text-sm text-muted-foreground">{holding.etfCode}</span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-xl font-bold tabular-nums">{holding.currentPrice.toFixed(2)}</span>
                <span className={`text-sm font-medium tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{holding.profitLossPercent}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <PredictionButton />
              <IconBtn onClick={() => setIsFullscreen(true)} title="전체화면"><ExpandIcon /></IconBtn>
              <IconBtn onClick={onClose}><CloseIcon /></IconBtn>
            </div>
          </div>

          <div className="px-6 pt-4">
            <div className="flex items-center justify-between mb-2">
              <Tabs defaultValue="D" onValueChange={(val) => setTimeframe(val as ChartTimeframe)}>
                <TabsList>
                  {TIMEFRAME_OPTIONS.map((opt) => (
                    <TabsTrigger key={opt.value} value={opt.value}>{opt.label}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <ChartLegend />
            <motion.div
              key={`${timeframe}-${predictionMode}`}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="mt-2"
            >
              {renderChart(400)}
            </motion.div>
          </div>

          <div className="grid grid-cols-2 gap-3 px-6 py-4">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">RSI (14)</div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${rsi > 70 ? 'text-red-500' : rsi < 30 ? 'text-green-500' : 'text-foreground'}`}>{rsi}</div>
                <div className="mt-1 text-xs text-muted-foreground">{rsi > 70 ? '과매수' : rsi < 30 ? '과매도' : '중립'}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">전일 대비</div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">{lastClose.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="px-6 pb-4">
            <PredictionInfoCard />
          </div>
        </div>
      </motion.div>
    </>
  );
}
