'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type Time,
  type CandlestickData,
} from 'lightweight-charts';
import type { OHLCVDataPoint, ForecastDataPoint } from '@/lib/chart-types';
import type { PredictionOverlayData } from '@/lib/prediction-utils';

interface CandlestickChartProps {
  data: OHLCVDataPoint[];
  forecastData?: ForecastDataPoint[];
  predictionOverlay?: PredictionOverlayData;
  height?: number;
}

export function CandlestickChart({ data, forecastData, predictionOverlay, height = 400 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.6)',
        fontSize: 11,
        fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(255, 255, 255, 0.15)', labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(255, 255, 255, 0.15)', labelBackgroundColor: '#1e293b' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Build combined candle data: actual (green/red) + forecast (blue/purple)
    const actualCandles: CandlestickData<Time>[] = data.map((d) => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const forecastCandles: CandlestickData<Time>[] = forecastData
      ? forecastData.map((d) => ({
          time: d.time as Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          color: d.close >= d.open ? '#3b82f6' : '#a855f7',
          borderColor: d.close >= d.open ? '#3b82f6' : '#a855f7',
          wickColor: d.close >= d.open ? '#3b82f680' : '#a855f780',
        }))
      : [];

    // Main candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    candleSeries.setData([...actualCandles, ...forecastCandles]);

    // Volume series (actual data only)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    volumeSeries.setData(
      data.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      }))
    );

    // === Prediction Overlay: Historical pattern candles + lines ===
    if (predictionOverlay?.historical) {
      for (const pattern of predictionOverlay.historical) {
          // Candlestick series for this pattern (semi-transparent)
          if (pattern.candles.length > 0) {
            const patternCandles = chart.addSeries(CandlestickSeries, {
              upColor: pattern.candleUpColor,
              downColor: pattern.candleDownColor,
              borderUpColor: pattern.candleUpColor,
              borderDownColor: pattern.candleDownColor,
              wickUpColor: pattern.wickColor,
              wickDownColor: pattern.wickColor,
              priceLineVisible: false,
              lastValueVisible: false,
            });
            patternCandles.setData(
              pattern.candles.map((c) => ({
                time: c.time as Time,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
              }))
            );
          }

          // Close-price line overlay
          const histLine = chart.addSeries(LineSeries, {
            color: pattern.lineColor,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
          });
          histLine.setData(pattern.path.map((p) => ({ time: p.time as Time, value: p.value })));
        }
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, forecastData, predictionOverlay, height]);

  return <div ref={containerRef} className="w-full" />;
}
