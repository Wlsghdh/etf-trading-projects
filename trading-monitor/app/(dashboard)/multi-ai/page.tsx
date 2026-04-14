'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiBrain02Icon,
  SentIcon,
  Search01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import Markdown from 'react-markdown';
import { useTheme } from '@/hooks/use-theme';

// ── Types ──

interface StockDataItem {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi: number | null;
  macd: number | null;
}

interface RankingItem {
  symbol: string;
  rank: number;
  score: number;
  direction: string;
  weight: number;
  current_close: number | null;
}

interface KISHolding {
  code: string;
  name: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  pnl_rate: number;
}

interface KISBalance {
  available_cash_usd: number;
  total_evaluation_usd: number;
  holdings: KISHolding[];
  kis_connected: boolean;
  error?: string;
}

interface PurchaseItem {
  etf_code: string;
  quantity: number;
  price: number;
  total_amount: number;
  sold: boolean;
}

interface StockAnalysis {
  symbol: string;
  kisConnected: boolean;
  currentPrice: number;
  avgBuyPrice: number | null;
  holdingQty: number | null;
  pnlRate: number | null;
  priceChange1d: number;
  priceChange5d: number;
  priceChange20d: number;
  rsi: number | null;
  macd: number | null;
  volume: number;
  avgVolume: number;
  high52w: number;
  low52w: number;
  rank: number | null;
  totalSymbols: number | null;
  direction: string | null;
  score: number | null;
  weight: number | null;
  modelName: string | null;
  predictionDate: string | null;
  availableCash: number | null;
}

// 3x3 그리드 셀 응답
interface GridResponse {
  technical: { gpt: string; gemini: string; claude: string };
  fundamental: { gpt: string; gemini: string; claude: string };
  market: { gpt: string; gemini: string; claude: string };
}

// ── API ──

const API_PREFIX = '/trading/api';

async function fetchSymbols(): Promise<string[]> {
  const res = await fetch(`${API_PREFIX}/ml/symbols`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.symbols || [];
}

async function fetchStockData(symbol: string, limit = 260): Promise<StockDataItem[]> {
  const res = await fetch(`${API_PREFIX}/data/${symbol}?timeframe=D&limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

async function fetchRanking(): Promise<{ rankings: RankingItem[]; total_symbols: number; model_name: string; prediction_date: string } | null> {
  try {
    const res = await fetch(`${API_PREFIX}/ml/ranking`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function fetchBalance(): Promise<KISBalance | null> {
  try {
    const res = await fetch(`${API_PREFIX}/trading/balance`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function fetchPortfolio(): Promise<{ holdings: PurchaseItem[] } | null> {
  try {
    const res = await fetch(`${API_PREFIX}/trading/portfolio`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function analyzeStock(symbol: string): Promise<StockAnalysis> {
  const [stockDataArr, ranking, balance, portfolio] = await Promise.all([
    fetchStockData(symbol).catch(() => []),
    fetchRanking().catch(() => null),
    fetchBalance().catch(() => null),
    fetchPortfolio().catch(() => null),
  ]);

  const data = stockDataArr as StockDataItem[];
  const latest = data.length > 0 ? data[data.length - 1] : null;
  const prev1d = data.length > 1 ? data[data.length - 2] : null;
  const prev5d = data.length > 5 ? data[data.length - 6] : null;
  const prev20d = data.length > 20 ? data[data.length - 21] : null;

  const recentData = data.slice(-252);
  const high52w = recentData.length > 0 ? Math.max(...recentData.map(d => d.high)) : 0;
  const low52w = recentData.length > 0 ? Math.min(...recentData.map(d => d.low)) : 0;

  const vols = data.slice(-20).map(d => d.volume);
  const avgVolume = vols.length > 0 ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;

  const rankItem = ranking?.rankings.find(r => r.symbol === symbol);
  const kisHolding = balance?.holdings.find(h => h.code === symbol);
  const dbHoldings = (portfolio?.holdings || []).filter(h => h.etf_code === symbol && !h.sold);
  const totalQty = dbHoldings.reduce((s, h) => s + h.quantity, 0);
  const avgPrice = totalQty > 0 ? dbHoldings.reduce((s, h) => s + h.total_amount, 0) / totalQty : null;
  const currentPrice = kisHolding?.current_price || latest?.close || rankItem?.current_close || 0;

  return {
    symbol,
    kisConnected: balance?.kis_connected ?? false,
    currentPrice,
    avgBuyPrice: kisHolding?.avg_price ?? avgPrice,
    holdingQty: kisHolding?.quantity ?? (totalQty > 0 ? totalQty : null),
    pnlRate: kisHolding?.pnl_rate ?? null,
    priceChange1d: latest && prev1d ? ((latest.close - prev1d.close) / prev1d.close) * 100 : 0,
    priceChange5d: latest && prev5d ? ((latest.close - prev5d.close) / prev5d.close) * 100 : 0,
    priceChange20d: latest && prev20d ? ((latest.close - prev20d.close) / prev20d.close) * 100 : 0,
    rsi: latest?.rsi ?? null,
    macd: latest?.macd ?? null,
    volume: latest?.volume || 0,
    avgVolume,
    high52w,
    low52w,
    rank: rankItem?.rank ?? null,
    totalSymbols: ranking?.total_symbols ?? null,
    direction: rankItem?.direction ?? null,
    score: rankItem?.score ?? null,
    weight: rankItem?.weight ?? null,
    modelName: ranking?.model_name ?? null,
    predictionDate: ranking?.prediction_date ?? null,
    availableCash: balance?.available_cash_usd ?? null,
  };
}

// ── AI 응답 생성 ──

function generateGridResponses(a: StockAnalysis, ragEnabled: boolean): GridResponse {
  const p = a.currentPrice;
  const dir = a.direction ?? 'N/A';
  const rk = a.rank ?? '?';
  const tot = a.totalSymbols ?? '?';

  return {
    technical: {
      gpt: `${a.symbol} 기술적 분석:\n\n**추세**: 1D ${pf(a.priceChange1d)}% | 5D ${pf(a.priceChange5d)}% | 20D ${pf(a.priceChange20d)}%\n\n**기술 지표**:\n- RSI(14): ${a.rsi?.toFixed(1) ?? 'N/A'} ${a.rsi ? (a.rsi < 30 ? '→ 과매도' : a.rsi > 70 ? '→ 과매수' : '→ 중립') : ''}\n- MACD: ${a.macd?.toFixed(4) ?? 'N/A'} ${a.macd ? (a.macd > 0 ? '→ 상승 모멘텀' : '→ 하락 모멘텀') : ''}\n\n**거래량**: ${fmtVol(a.volume)} (20일 평균 ${fmtVol(a.avgVolume)})${a.volume > a.avgVolume * 1.5 ? ' ⚠ 과열' : ''}`,
      gemini: `${a.symbol} 모멘텀 분석:\n\n**단기** (1D): ${pf(a.priceChange1d)}%\n**중기** (5D): ${pf(a.priceChange5d)}%\n**장기** (20D): ${pf(a.priceChange20d)}%\n\n${a.priceChange1d > 0 && a.priceChange5d > 0 && a.priceChange20d > 0 ? '전 구간 상승 → 강한 상승 트렌드' : a.priceChange1d < 0 && a.priceChange5d < 0 ? '단중기 하락 → 약세 전환 주의' : '혼합 시그널 → 관망'}\n\nRSI ${a.rsi?.toFixed(0) ?? '?'} | MACD ${a.macd?.toFixed(3) ?? '?'}`,
      claude: `${a.symbol} 차트 패턴:\n\n**추세**: ${a.priceChange20d > 0 ? '상승' : '하락'} (20D ${pf(a.priceChange20d)}%)\n**단기**: ${a.priceChange1d > 0 ? '강세' : '약세'} (${pf(a.priceChange1d)}%)\n\n- RSI ${a.rsi?.toFixed(0) ?? '?'}/100 ${a.rsi && a.rsi < 30 ? '⚠ 과매도' : a.rsi && a.rsi > 70 ? '⚠ 과매수' : ''}\n- MACD ${a.macd && a.macd > 0 ? '양전환' : '음전환'}\n- Vol ${a.volume > a.avgVolume * 1.2 ? '증가' : '감소'}`,
    },
    fundamental: {
      gpt: `${a.symbol} 밸류에이션:\n\n**현재가**: $${p.toFixed(2)}\n**52주 범위**: $${a.low52w.toFixed(0)} ~ $${a.high52w.toFixed(0)}\n고점 대비 ${((1 - p / (a.high52w || 1)) * 100).toFixed(1)}% 하락\n\n**ML 랭킹**: ${rk}위/${tot}개 (${dir})\n\n${a.holdingQty ? `**보유**: ${a.holdingQty}주 @ $${a.avgBuyPrice?.toFixed(2)}\n수익률: ${a.pnlRate?.toFixed(1) ?? 'N/A'}%` : '미보유'}`,
      gemini: `${a.symbol} 가치 분석:\n\n**시가**: $${p.toFixed(2)}\n**52주 H/L**: $${a.high52w.toFixed(0)} / $${a.low52w.toFixed(0)}\n${p > (a.high52w + a.low52w) / 2 ? '52주 중간가 이상 → 상승 추세' : '52주 중간가 이하 → 조정 구간'}\n\n${a.availableCash ? `투자 가능: $${a.availableCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ''}`,
      claude: `${a.symbol} 포지션:\n\n$${p.toFixed(2)} (${a.priceChange1d >= 0 ? '+' : ''}${a.priceChange1d.toFixed(2)}% 전일비)\n\n52주 레인지:\n$${a.low52w.toFixed(0)} [${'█'.repeat(Math.round(((p - a.low52w) / ((a.high52w || 1) - a.low52w)) * 10))}${'░'.repeat(10 - Math.round(((p - a.low52w) / ((a.high52w || 1) - a.low52w)) * 10))}] $${a.high52w.toFixed(0)}\n\n${a.holdingQty ? `포지션: ${a.holdingQty}주 / ${a.pnlRate?.toFixed(1) ?? '0'}%` : '포지션 없음'}`,
    },
    market: {
      gpt: `${a.symbol} 시장 환경:\n\n현재 시장이 ${a.symbol}에 미치는 영향 분석 중...\n\n**종목 데이터**: $${p.toFixed(2)} (1D ${pf(a.priceChange1d)}%)\n**ML 방향**: ${dir} (${rk}/${tot}위)\n\n[환율/VIX/금리 데이터 패널 참조]`,
      gemini: `${a.symbol} 거시 영향:\n\n**가격**: $${p.toFixed(2)}\n**추세**: 20D ${pf(a.priceChange20d)}%\n\n시장 지표(VIX/금리/환율)가 이 종목에 미치는 영향 분석 필요\n\n${ragEnabled ? '[RAG 모드: 시장 데이터 연동 분석]' : ''}`,
      claude: `${a.symbol} 매크로 분석:\n\n$${p.toFixed(2)} | ${dir}\n\n거시경제 환경:\n- 금리/환율 동향이 이 종목 섹터에 미치는 영향\n- VIX 기반 시장 심리 분석\n- 뉴스 기반 투자 심리\n\n[시장 데이터 패널 참조]`,
    },
  };
}

function pf(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`; }
function fmtVol(v: number) { return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`; }

// ── 시장 데이터 패널 ──
interface MarketData {
  exchangeRate: { usdKrw: number; change: number } | null;
  vix: { value: number; change: number; label: string; sparkline?: number[] } | null;
  gold: { price: number; change: number; sparkline?: number[] } | null;
  bitcoin: { price: number; change: number; sparkline?: number[] } | null;
  crudeOil: { price: number; change: number; sparkline?: number[] } | null;
  dollarIndex: { price: number; change: number; sparkline?: number[] } | null;
  rates: { fedRate: number | null; treasury10y: number | null };
  indices: {
    sp500: { value?: number; price?: number; change: number; sparkline?: number[] } | null;
    nasdaq: { value?: number; price?: number; change: number; sparkline?: number[] } | null;
    dow: { value?: number; price?: number; change: number; sparkline?: number[] } | null;
  };
}

// 미니 스파크라인 차트 (SVG)
function Sparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');
  // 그라데이션 영역
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const isUp = data[data.length - 1] >= data[0];
  const strokeColor = color || (isUp ? '#22c55e' : '#ef4444');
  const fillColor = isUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';

  return (
    <svg width={width} height={height} className="mt-0.5">
      <polygon points={areaPoints} fill={fillColor} />
      <polyline points={points} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

function MarketDataPanel({ data }: { data: MarketData | null }) {
  if (!data) return null;

  const items: { label: string; value: string; sub: string; color: string; sparkline?: number[] }[] = [];

  if (data.indices.sp500) items.push({
    label: 'S&P 500',
    value: ((data.indices.sp500 as any).value ?? (data.indices.sp500 as any).price ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    sub: `${pf(data.indices.sp500.change)}%`,
    color: data.indices.sp500.change >= 0 ? 'text-green-500' : 'text-red-500',
    sparkline: data.indices.sp500.sparkline,
  });
  if (data.indices.nasdaq) items.push({
    label: 'NASDAQ',
    value: ((data.indices.nasdaq as any).value ?? (data.indices.nasdaq as any).price ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    sub: `${pf(data.indices.nasdaq.change)}%`,
    color: data.indices.nasdaq.change >= 0 ? 'text-green-500' : 'text-red-500',
    sparkline: data.indices.nasdaq.sparkline,
  });
  if (data.vix) items.push({
    label: `VIX (${data.vix.label})`,
    value: data.vix.value.toFixed(1),
    sub: `${pf(data.vix.change)}%`,
    color: data.vix.value > 30 ? 'text-red-500' : data.vix.value > 20 ? 'text-amber-500' : 'text-green-500',
    sparkline: data.vix.sparkline,
  });
  if (data.exchangeRate) items.push({
    label: 'USD/KRW',
    value: `${data.exchangeRate.usdKrw.toFixed(0)}`,
    sub: 'won',
    color: 'text-blue-500',
  });
  if (data.gold) items.push({
    label: 'Gold',
    value: `$${data.gold.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    sub: `${pf(data.gold.change)}%`,
    color: data.gold.change >= 0 ? 'text-amber-500' : 'text-red-500',
    sparkline: data.gold.sparkline,
  });
  if (data.rates.fedRate !== null) items.push({
    label: 'Fed Rate',
    value: `${data.rates.fedRate.toFixed(2)}%`,
    sub: 'FOMC',
    color: 'text-purple-500',
  });
  if (data.rates.treasury10y !== null) items.push({
    label: '10Y Treasury',
    value: `${data.rates.treasury10y.toFixed(2)}%`,
    sub: 'yield',
    color: 'text-cyan-500',
  });
  if (data.indices.dow) items.push({
    label: 'DOW',
    value: ((data.indices.dow as any).value ?? (data.indices.dow as any).price ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
    sub: `${pf(data.indices.dow.change)}%`,
    color: data.indices.dow.change >= 0 ? 'text-green-500' : 'text-red-500',
    sparkline: data.indices.dow.sparkline,
  });
  if (data.bitcoin) items.push({
    label: 'Bitcoin',
    value: `$${data.bitcoin.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    sub: `${pf(data.bitcoin.change)}%`,
    color: data.bitcoin.change >= 0 ? 'text-orange-400' : 'text-red-500',
    sparkline: data.bitcoin.sparkline,
  });
  if (data.crudeOil) items.push({
    label: 'Crude Oil',
    value: `$${data.crudeOil.price.toFixed(2)}`,
    sub: `${pf(data.crudeOil.change)}%`,
    color: data.crudeOil.change >= 0 ? 'text-green-500' : 'text-red-500',
    sparkline: data.crudeOil.sparkline,
  });
  if (data.dollarIndex) items.push({
    label: 'Dollar Index',
    value: data.dollarIndex.price.toFixed(2),
    sub: `${pf(data.dollarIndex.change)}%`,
    color: data.dollarIndex.change >= 0 ? 'text-green-500' : 'text-red-500',
    sparkline: data.dollarIndex.sparkline,
  });

  return (
    <div className="grid grid-cols-4 lg:grid-cols-11 gap-2 mb-3">
      {items.map(item => (
        <div key={item.label} className="rounded-lg border border-border bg-card p-2 text-center flex flex-col items-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider truncate w-full">{item.label}</div>
          <div className={`text-sm font-bold font-mono ${item.color}`}>{item.value}</div>
          {item.sparkline && item.sparkline.length > 2 && (
            <Sparkline data={item.sparkline} color={item.color.includes('green') ? '#22c55e' : item.color.includes('red') ? '#ef4444' : item.color.includes('amber') ? '#f59e0b' : item.color.includes('orange') ? '#fb923c' : item.color.includes('blue') ? '#3b82f6' : item.color.includes('purple') ? '#a855f7' : item.color.includes('cyan') ? '#06b6d4' : '#6b7280'} />
          )}
          <div className={`text-[10px] ${item.color} opacity-80`}>{item.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── 뉴스 티커 ──
function NewsTicker({ items }: { items: NewsItem[] }) {
  if (!items.length) return null;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    return `${Math.floor(hrs / 24)}일 전`;
  };

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 mb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">최신 뉴스</span>
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
      </div>
      <div className="space-y-1">
        {items.slice(0, 5).map((item) => (
          <a
            key={item.id}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-baseline gap-2 group hover:bg-muted/30 rounded px-1 py-0.5 -mx-1 transition-colors"
          >
            <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right">{timeAgo(item.pubDate)}</span>
            <span className="text-xs text-foreground/90 group-hover:text-foreground truncate">{item.title}</span>
            <span className="text-[9px] text-muted-foreground/60 shrink-0">{item.source}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── 카테고리별 TradingView 위젯 ──

function TVTechnicalAnalysis({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  useEffect(() => {
    if (!ref.current || !symbol) return;
    ref.current.innerHTML = '';
    const tvSym = TV_EXCHANGE_MAP[symbol] ? `${TV_EXCHANGE_MAP[symbol]}:${symbol}` : symbol;
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      interval: '1D', width: '100%', isTransparent: true, height: '100%',
      symbol: tvSym, showIntervalTabs: true, displayMode: 'single',
      locale: 'kr', colorTheme: theme,
    });
    const w = document.createElement('div');
    w.className = 'tradingview-widget-container';
    w.style.cssText = 'height:100%;width:100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.cssText = 'height:100%;width:100%';
    w.appendChild(inner); w.appendChild(script);
    ref.current.appendChild(w);
    return () => { if (ref.current) ref.current.innerHTML = ''; };
  }, [symbol, theme]);
  return <div ref={ref} className="w-full h-full min-h-[280px]" />;
}

// 범용 TradingView 위젯 (심볼 탭 선택 가능)
function TVWidgetWithTabs({ tabs, widgetType, defaultTab }: {
  tabs: { label: string; symbol: string }[];
  widgetType: 'financials' | 'mini-overview' | 'advanced-chart';
  defaultTab?: number;
}) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? 0);
  const ref = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const currentSymbol = tabs[activeTab]?.symbol || tabs[0]?.symbol;

  useEffect(() => {
    if (!ref.current || !currentSymbol) return;
    ref.current.innerHTML = '';

    const script = document.createElement('script');
    let config: Record<string, unknown>;

    if (widgetType === 'financials') {
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
      config = {
        isTransparent: true, largeChartUrl: '', displayMode: 'regular',
        width: '100%', height: '100%', symbol: currentSymbol,
        colorTheme: theme, locale: 'kr',
      };
    } else if (widgetType === 'mini-overview') {
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
      config = {
        symbol: currentSymbol, width: '100%', height: '100%', locale: 'kr',
        dateRange: '3M', colorTheme: theme, isTransparent: true,
        autosize: true, largeChartUrl: '',
      };
    } else {
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      config = {
        autosize: true, symbol: currentSymbol, interval: 'D', timezone: 'Asia/Seoul',
        theme, style: '1', locale: 'kr', hide_top_toolbar: true,
        allow_symbol_change: false, save_image: false, calendar: false,
        studies: ['RSI@tv-basicstudies'],
      };
    }

    script.async = true;
    script.innerHTML = JSON.stringify(config);
    const w = document.createElement('div');
    w.className = 'tradingview-widget-container';
    w.style.cssText = 'height:100%;width:100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.cssText = 'height:calc(100% - 32px);width:100%';
    w.appendChild(inner); w.appendChild(script);
    ref.current.appendChild(w);
    return () => { if (ref.current) ref.current.innerHTML = ''; };
  }, [currentSymbol, theme, widgetType]);

  return (
    <div className="flex flex-col h-full">
      {/* 탭 선택 */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-border/50 overflow-x-auto shrink-0">
        {tabs.map((tab, i) => (
          <button key={tab.symbol} onClick={() => setActiveTab(i)}
            className={`px-2 py-0.5 text-[10px] rounded transition-colors whitespace-nowrap ${
              activeTab === i
                ? 'bg-primary/20 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>
      <div ref={ref} className="flex-1 min-h-[260px]" />
    </div>
  );
}

// Fundamental 차트: 종목 재무제표 + 비교 종목
function TVFinancials({ symbol }: { symbol: string }) {
  const tvSym = TV_EXCHANGE_MAP[symbol] ? `${TV_EXCHANGE_MAP[symbol]}:${symbol}` : symbol;
  const tabs = [
    { label: symbol, symbol: tvSym },
    { label: 'S&P 500', symbol: 'AMEX:SPY' },
    { label: 'NASDAQ', symbol: 'NASDAQ:QQQ' },
    { label: 'Apple', symbol: 'NASDAQ:AAPL' },
    { label: 'Microsoft', symbol: 'NASDAQ:MSFT' },
  ];
  return <TVWidgetWithTabs tabs={tabs} widgetType="financials" />;
}

// Market 차트: 주요 지수/원자재 미니차트
function TVMiniOverview({ symbol }: { symbol: string }) {
  const tvSym = TV_EXCHANGE_MAP[symbol] ? `${TV_EXCHANGE_MAP[symbol]}:${symbol}` : symbol;
  const tabs = [
    { label: symbol, symbol: tvSym },
    { label: 'S&P 500', symbol: 'FOREXCOM:SPXUSD' },
    { label: 'NASDAQ', symbol: 'FOREXCOM:NSXUSD' },
    { label: 'DOW', symbol: 'FOREXCOM:DJI' },
    { label: 'VIX', symbol: 'TVC:VIX' },
    { label: 'Gold', symbol: 'COMEX:GC1!' },
    { label: 'Oil', symbol: 'NYMEX:CL1!' },
    { label: 'USD/KRW', symbol: 'FX_IDC:USDKRW' },
    { label: 'BTC', symbol: 'BITSTAMP:BTCUSD' },
    { label: '10Y Bond', symbol: 'TVC:US10Y' },
  ];
  return <TVWidgetWithTabs tabs={tabs} widgetType="mini-overview" />;
}

const TV_EXCHANGE_MAP: Record<string, string> = {
  QQQ: 'NASDAQ', TQQQ: 'NASDAQ', AAPL: 'NASDAQ', MSFT: 'NASDAQ', NVDA: 'NASDAQ',
  GOOGL: 'NASDAQ', AMZN: 'NASDAQ', META: 'NASDAQ', TSLA: 'NASDAQ',
  AVGO: 'NASDAQ', COST: 'NASDAQ', NFLX: 'NASDAQ', ADBE: 'NASDAQ', AMD: 'NASDAQ',
  INTC: 'NASDAQ', SOXX: 'NASDAQ', HOOD: 'NASDAQ',
  SPY: 'AMEX', VOO: 'AMEX', DIA: 'AMEX', IWM: 'AMEX', GLD: 'AMEX', ARKK: 'AMEX',
  TLT: 'NASDAQ', JPM: 'NYSE', V: 'NYSE', WMT: 'NYSE', XOM: 'NYSE',
  GILD: 'NASDAQ', CSCO: 'NASDAQ', HON: 'NASDAQ', UBER: 'NYSE',
};

// ── TradingView 메인 차트 ──
const TV_EXCHANGE: Record<string, string> = {
  QQQ: 'NASDAQ', TQQQ: 'NASDAQ', AAPL: 'NASDAQ', MSFT: 'NASDAQ', NVDA: 'NASDAQ',
  GOOGL: 'NASDAQ', AMZN: 'NASDAQ', META: 'NASDAQ', TSLA: 'NASDAQ',
  AVGO: 'NASDAQ', COST: 'NASDAQ', NFLX: 'NASDAQ', ADBE: 'NASDAQ', AMD: 'NASDAQ',
  INTC: 'NASDAQ', SOXX: 'NASDAQ', HOOD: 'NASDAQ',
  SPY: 'AMEX', VOO: 'AMEX', DIA: 'AMEX', IWM: 'AMEX', GLD: 'AMEX', ARKK: 'AMEX',
  TLT: 'NASDAQ', JPM: 'NYSE', V: 'NYSE', WMT: 'NYSE', XOM: 'NYSE',
};

function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  useEffect(() => {
    if (!ref.current || !symbol) return;
    ref.current.innerHTML = '';
    const tvSym = TV_EXCHANGE[symbol] ? `${TV_EXCHANGE[symbol]}:${symbol}` : symbol;
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true, symbol: tvSym, interval: 'D', timezone: 'Asia/Seoul',
      theme, style: '1', locale: 'kr', hide_top_toolbar: false,
      allow_symbol_change: true, save_image: false, calendar: false,
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
    });
    const w = document.createElement('div');
    w.className = 'tradingview-widget-container';
    w.style.cssText = 'height:100%;width:100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.cssText = 'height:calc(100% - 32px);width:100%';
    w.appendChild(inner);
    w.appendChild(script);
    ref.current.appendChild(w);
    return () => { if (ref.current) ref.current.innerHTML = ''; };
  }, [symbol, theme]);
  return <div ref={ref} className="w-full h-full" />;
}

// ── AI 칼럼 셀 ──
const AI_COLS = [
  { id: 'gpt', name: 'ChatGPT', color: 'text-green-400', borderColor: 'border-green-500/30', bgColor: 'bg-green-500/5', dotColor: 'bg-green-500' },
  { id: 'gemini', name: 'Gemini', color: 'text-blue-400', borderColor: 'border-blue-500/30', bgColor: 'bg-blue-500/5', dotColor: 'bg-blue-500' },
  { id: 'claude', name: 'Claude', color: 'text-orange-400', borderColor: 'border-orange-500/30', bgColor: 'bg-orange-500/5', dotColor: 'bg-orange-500' },
] as const;

const ROW_LABELS = [
  { key: 'technical' as const, label: 'Technical' },
  { key: 'fundamental' as const, label: 'Fundamental' },
  { key: 'market' as const, label: 'Market' },
];

function AICell({ text, aiId, loading }: { text: string; aiId: string; loading: boolean }) {
  const col = AI_COLS.find(c => c.id === aiId)!;
  if (loading) {
    return (
      <div className={`rounded-lg border ${col.borderColor} ${col.bgColor} p-3 h-full relative overflow-hidden`}>
        {/* Shimmer 효과 */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <div className="space-y-2">
          <div className="h-2 w-3/4 rounded bg-muted/40 animate-pulse" />
          <div className="h-2 w-full rounded bg-muted/40 animate-pulse" style={{ animationDelay: '100ms' }} />
          <div className="h-2 w-5/6 rounded bg-muted/40 animate-pulse" style={{ animationDelay: '200ms' }} />
          <div className="h-2 w-2/3 rounded bg-muted/40 animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <div className={`h-1.5 w-1.5 animate-bounce rounded-full ${col.dotColor}`} style={{ animationDelay: '0ms' }} />
          <div className={`h-1.5 w-1.5 animate-bounce rounded-full ${col.dotColor}`} style={{ animationDelay: '150ms' }} />
          <div className={`h-1.5 w-1.5 animate-bounce rounded-full ${col.dotColor}`} style={{ animationDelay: '300ms' }} />
        </div>
        <p className={`text-center text-[10px] mt-1 ${col.color} font-medium`}>분석 중...</p>
      </div>
    );
  }
  if (!text) {
    return (
      <div className={`rounded-lg border border-border/30 bg-card p-3 h-full flex items-center justify-center`}>
        <span className="text-xs text-muted-foreground/40">분석 대기중</span>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border ${col.borderColor} ${col.bgColor} p-3 h-full overflow-auto`}>
      <div className="prose prose-xs prose-invert max-w-none
        prose-headings:text-xs prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1
        prose-p:text-xs prose-p:leading-relaxed prose-p:my-1
        prose-li:text-xs prose-li:my-0
        prose-strong:text-foreground
        prose-ul:my-1 prose-ol:my-1
        prose-hr:my-2 prose-hr:border-border/30
        text-foreground/90">
        <Markdown>{text}</Markdown>
      </div>
    </div>
  );
}

// ── 쿠키 헬퍼 ──
function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}

// ── AI API 호출 ──
async function callAI(model: 'chatgpt' | 'gemini' | 'claude', message: string, symbol: string, context: string, userId: number, sessionId: string): Promise<string> {
  const res = await fetch('/trading/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, message, symbol, analysisContext: context, userId, sessionId }),
  });
  if (!res.ok) return `[${model}] 요청 실패 (${res.status})`;
  const data = await res.json();
  return data.response || '응답 없음';
}

// ── 메인 ──
export default function MultiAIPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [balance, setBalance] = useState<KISBalance | null>(null);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [grid, setGrid] = useState<GridResponse | null>(null);
  const [analysisSymbol, setAnalysisSymbol] = useState('');
  const [activeAI, setActiveAI] = useState<'all' | 'gpt' | 'gemini' | 'claude'>('all');
  const [chartHeight, setChartHeight] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  // 세션 ID 초기화 (클라이언트 전용, HTTP에서도 동작)
  useEffect(() => {
    setSessionId(Date.now().toString(36) + Math.random().toString(36).slice(2));
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setChartFullscreen(false); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // 초기 로드 + 30초 KIS 갱신 + Market 데이터
  useEffect(() => {
    Promise.all([fetchSymbols(), fetchBalance()])
      .then(([s, b]) => {
        setSymbols(s);
        setBalance(b);
        if (s.length > 0) setSelected(s[0]);
      })
      .catch(() => {});
    // Market 데이터 (5분마다 갱신)
    const loadMarket = () => fetch(`${API_PREFIX}/market/overview`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMarketData(d); })
      .catch(() => {});
    loadMarket();
    // 뉴스 데이터 (10분마다 갱신)
    const loadNews = () => fetch(`${API_PREFIX}/news?category=market`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.news) setNewsItems(d.news); })
      .catch(() => {});
    loadNews();
    const iv = setInterval(async () => {
      try { const b = await fetchBalance(); if (b) setBalance(b); } catch {}
    }, 30000);
    const mv = setInterval(loadMarket, 300000);
    const nv = setInterval(loadNews, 600000);
    return () => { clearInterval(iv); clearInterval(mv); clearInterval(nv); };
  }, []);

  // 차트 리사이즈 핸들러
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientY - resizeRef.current.startY;
      setChartHeight(Math.max(200, Math.min(600, resizeRef.current.startH + delta)));
    };
    const onMouseUp = () => { resizeRef.current = null; setIsResizing(false); };
    if (isResizing) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
  }, [isResizing]);

  // 종목 검색
  const handleSearch = () => {
    const sym = search.trim().toUpperCase();
    if (sym) { setSelected(sym); setSearch(''); }
  };

  // 분석 실행 (3 AI 동시)
  const runAnalysis = useCallback(async (ticker?: string, userMessage?: string) => {
    const sym = ticker || selected;
    if (!sym || analyzing) return;
    setAnalyzing(true);
    setAnalysisSymbol(sym);
    setGrid(null);
    if (sym !== selected) setSelected(sym);

    const userId = parseInt(getCookie('user-id') || '1');

    // 1단계: 로컬 데이터로 즉시 표시 (빠른 응답)
    let analysis: StockAnalysis | null = null;
    try {
      analysis = await analyzeStock(sym);
      const localResponses = generateGridResponses(analysis, ragEnabled);
      setGrid(localResponses);
    } catch {
      try {
        const [ranking, bal] = await Promise.all([fetchRanking().catch(() => null), fetchBalance().catch(() => null)]);
        const rankItem = ranking?.rankings.find(r => r.symbol === sym);
        analysis = {
          symbol: sym, kisConnected: bal?.kis_connected ?? false, currentPrice: rankItem?.current_close ?? 0,
          avgBuyPrice: null, holdingQty: null, pnlRate: null,
          priceChange1d: 0, priceChange5d: 0, priceChange20d: 0,
          rsi: null, macd: null, volume: 0, avgVolume: 0, high52w: 0, low52w: 0,
          rank: rankItem?.rank ?? null, totalSymbols: ranking?.total_symbols ?? null,
          direction: rankItem?.direction ?? null, score: rankItem?.score ?? null,
          weight: rankItem?.weight ?? null, modelName: ranking?.model_name ?? null,
          predictionDate: ranking?.prediction_date ?? null, availableCash: bal?.available_cash_usd ?? null,
        };
        setGrid(generateGridResponses(analysis, ragEnabled));
      } catch {}
    }

    // 2단계: 실제 AI API 호출 - 카테고리별로 다른 컨텍스트 + 명확한 프롬프트
    const baseInfo = analysis ? `종목: ${sym}\n현재가: $${analysis.currentPrice.toFixed(2)}` : `종목: ${sym}`;

    // 카테고리별 데이터 컨텍스트 (각각 다른 데이터만 보내서 답이 섞이지 않게)
    const technicalContext = analysis ? [
      baseInfo,
      `1일 변동: ${pf(analysis.priceChange1d)}%`,
      `5일 변동: ${pf(analysis.priceChange5d)}%`,
      `20일 변동: ${pf(analysis.priceChange20d)}%`,
      analysis.rsi !== null ? `RSI(14): ${analysis.rsi?.toFixed(1)}` : '',
      analysis.macd !== null ? `MACD: ${analysis.macd?.toFixed(4)}` : '',
      analysis.volume > 0 ? `거래량: ${(analysis.volume/1e6).toFixed(1)}M (20일 평균: ${(analysis.avgVolume/1e6).toFixed(1)}M)` : '',
      analysis.rank ? `ML 랭킹: ${analysis.rank}위/${analysis.totalSymbols}개 (${analysis.direction})` : '',
    ].filter(Boolean).join('\n') : baseInfo;

    const fundContext = analysis ? [
      baseInfo,
      `52주 최고가: $${analysis.high52w.toFixed(2)}`,
      `52주 최저가: $${analysis.low52w.toFixed(2)}`,
      analysis.high52w > 0 ? `52주 고점 대비: ${((analysis.currentPrice / analysis.high52w - 1) * 100).toFixed(1)}%` : '',
      analysis.holdingQty ? `보유: ${analysis.holdingQty}주, 평균 매수가: $${analysis.avgBuyPrice?.toFixed(2)}, 손익률: ${analysis.pnlRate?.toFixed(2)}%` : '미보유 종목',
      analysis.availableCash ? `투자 가능 현금: $${analysis.availableCash.toLocaleString(undefined,{maximumFractionDigits:0})}` : '',
    ].filter(Boolean).join('\n') : baseInfo;

    const marketContext = analysis ? [
      baseInfo,
      `1일 변동: ${pf(analysis.priceChange1d)}%`,
      `20일 변동: ${pf(analysis.priceChange20d)}%`,
      analysis.rank ? `ML 방향: ${analysis.direction}` : '',
    ].filter(Boolean).join('\n') : baseInfo;

    const userPrompt = userMessage || '';

    const categoryPrompts = {
      technical: `${sym} 종목의 기술적 분석(Technical Analysis)을 해주세요.

다음 항목을 포함해 답변하세요:
1. **차트 분석**: RSI ${analysis?.rsi?.toFixed(0) || 'N/A'} / MACD ${analysis?.macd?.toFixed(3) || 'N/A'} 기반 과매수/과매도/모멘텀 판단
2. **추세 판단**: 단기(1D ${pf(analysis?.priceChange1d ?? 0)}%) / 중기(5D ${pf(analysis?.priceChange5d ?? 0)}%) / 장기(20D ${pf(analysis?.priceChange20d ?? 0)}%) 흐름 해석
3. **실적/리포트**: 최근 분기 실적(EPS/매출) 추이와 증권사 목표가 컨센서스 (알고 있다면)
4. **투자 의견**: 기술적 관점에서 매수/관망/매도

한국어로 5-6문장, Markdown 사용.${userPrompt ? '\n\n사용자 질문: ' + userPrompt : ''}`,

      fundamental: `${sym} 종목의 펀더멘털 분석(Fundamental Analysis)을 해주세요.

다음 항목을 포함해 답변하세요:
1. **밸류에이션**: PER/PBR/ROE 등 주요 지표 (알고 있다면)
2. **재무 건전성**: 매출/영업이익 추이, 부채비율
3. **52주 레인지**: $${analysis?.low52w.toFixed(0) ?? '?'} ~ $${analysis?.high52w.toFixed(0) ?? '?'} 내 현재 위치 ($${analysis?.currentPrice.toFixed(2) ?? '?'})
4. **동종업계 비교**: 같은 섹터 대비 저평가/고평가 판단

기술적 지표(RSI, MACD) 언급하지 마세요. 한국어로 5-6문장, Markdown 사용.${userPrompt ? '\n\n사용자 질문: ' + userPrompt : ''}`,

      market: `${sym} 종목에 대한 시장 환경 분석(Market Analysis)을 해주세요.

다음 항목을 반드시 포함해 답변하세요:
1. **환율**: 현재 USD/KRW 환율 동향이 이 종목(미국 주식)에 미치는 영향
2. **금리/연준**: 미국 기준금리 방향, 최근 FOMC 결정이 이 섹터에 미치는 영향
3. **공포지수(VIX)**: 현재 시장 심리 (탐욕/공포) 상태
4. **금/원자재**: 금 가격, 원자재 동향이 이 종목에 미치는 영향 (해당 시)
5. **뉴스/이벤트**: 이 종목 관련 최근 뉴스나 예정된 이벤트

개별 종목 기술지표 분석은 하지 마세요. 거시경제 관점에서만. 한국어로 5-6문장, Markdown 사용.${userPrompt ? '\n\n사용자 질문: ' + userPrompt : ''}`,
    };

    const cells: { ai: 'chatgpt' | 'gemini' | 'claude'; key: 'technical' | 'fundamental' | 'market'; ctx: string; prompt: string }[] = [];
    for (const ai of ['chatgpt', 'gemini', 'claude'] as const) {
      cells.push({ ai, key: 'technical', ctx: technicalContext, prompt: categoryPrompts.technical });
      cells.push({ ai, key: 'fundamental', ctx: fundContext, prompt: categoryPrompts.fundamental });
      cells.push({ ai, key: 'market', ctx: marketContext, prompt: categoryPrompts.market });
    }

    // 각 셀마다 고유한 cellSessionId (히스토리 안 섞임)
    const promises = cells.map(({ ai, key, ctx, prompt }) =>
      callAI(ai, prompt, sym, ctx, userId, `${sessionId}-${ai}-${key}`)
        .then(resp => ({ ai, key, resp }))
        .catch(() => ({ ai, key, resp: '응답 실패' }))
    );

    // 결과가 하나씩 올 때마다 그리드 업데이트
    const results = await Promise.allSettled(promises);
    const newGrid: GridResponse = {
      technical: { gpt: '', gemini: '', claude: '' },
      fundamental: { gpt: '', gemini: '', claude: '' },
      market: { gpt: '', gemini: '', claude: '' },
    };

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { ai, key, resp } = r.value;
        const aiKey = ai === 'chatgpt' ? 'gpt' : ai;
        newGrid[key][aiKey as 'gpt' | 'gemini' | 'claude'] = resp;
      }
    }
    setGrid(newGrid);
    setAnalyzing(false);
  }, [selected, analyzing, ragEnabled, sessionId]);

  // 채팅 입력 처리
  const send = useCallback(() => {
    const text = input.trim();
    if (!text || analyzing) return;
    setInput('');
    // 종목 감지
    const patterns = [/([A-Za-z]{1,5})\s*분석/, /([A-Za-z]{1,5})\s*어때/, /([A-Za-z]{1,5})\s*전망/, /^([A-Za-z]{1,5})$/];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) { runAnalysis(m[1].toUpperCase()); return; }
    }
    // 종목 못 찾으면 현재 선택된 종목으로
    if (selected) runAnalysis(selected);
  }, [input, analyzing, selected, runAnalysis]);

  // 차트 전체화면
  if (chartFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="font-mono font-bold text-sm">{selected}</span>
          <button onClick={() => setChartFullscreen(false)}
            className="px-3 py-1 text-xs rounded bg-muted hover:bg-muted/80">
            닫기 (ESC)
          </button>
        </div>
        <div className="flex-1"><TradingViewChart symbol={selected} /></div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3 overflow-auto">
      {/* ── 상단: 차트 + 검색/KIS ── */}
      <div className="flex gap-3 shrink-0" style={{ height: chartHeight }}>
        <Card size="sm" className="flex-1 min-h-0 relative group">
          <CardContent className="h-full p-0">
            <div className="h-full rounded-lg overflow-hidden">
              <TradingViewChart symbol={selected} />
            </div>
            {/* 전체화면 버튼 */}
            <button
              onClick={() => setChartFullscreen(true)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[10px] rounded bg-black/60 text-white hover:bg-black/80"
            >
              전체화면
            </button>
          </CardContent>
        </Card>

        <Card size="sm" className="w-56 shrink-0 hidden lg:block">
          <CardContent className="space-y-3 text-xs">
            {/* 종목 검색 */}
            <div>
              <label className="mb-1 block font-medium text-muted-foreground">종목 검색</label>
              <div className="relative">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="AAPL, NVDA..."
                  className="w-full rounded border border-border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary/50"
                />
                <HugeiconsIcon icon={Search01Icon} className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
              </div>
            </div>

            {/* KIS 잔고 */}
            <div className="border-t border-border pt-2 space-y-1">
              <div className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${balance?.kis_connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={balance?.kis_connected ? 'text-green-500 font-medium' : 'text-red-500'}>
                  {balance?.kis_connected ? 'KIS Live' : 'KIS 미연결'}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">30s</span>
              </div>
              {balance?.kis_connected && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">현금</span><span className="font-mono">${balance.available_cash_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">평가</span><span className="font-mono">${balance.total_evaluation_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">보유</span><span className="font-mono">{balance.holdings.length}개</span></div>
                </>
              )}
            </div>

            {/* RAG 토글 */}
            <div className="border-t border-border pt-2">
              <button
                onClick={() => setRagEnabled(!ragEnabled)}
                className={`w-full rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                  ragEnabled
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <HugeiconsIcon icon={AiBrain02Icon} className="inline h-3 w-3 mr-1" strokeWidth={2} />
                RAG in my Portfolio
              </button>
              {ragEnabled && (
                <p className="mt-1 text-[10px] text-purple-400">ML 예측 근거 + SHAP 분석 활성화</p>
              )}
            </div>

          </CardContent>
        </Card>
      </div>

      {/* 리사이즈 핸들 */}
      <div
        className={`h-1.5 shrink-0 cursor-row-resize rounded-full mx-auto w-16 transition-colors ${isResizing ? 'bg-primary' : 'bg-muted-foreground/20 hover:bg-muted-foreground/40'}`}
        onMouseDown={e => { resizeRef.current = { startY: e.clientY, startH: chartHeight }; setIsResizing(true); e.preventDefault(); }}
      />

      {/* ── 시장 데이터 패널 ── */}
      <MarketDataPanel data={marketData} />

      {/* ── 뉴스 티커 ── */}
      <NewsTicker items={newsItems} />

      {/* ── 차트 3열: Advanced Chart / Financials / Mini Overview ── */}
      {analysisSymbol && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 shrink-0">
          <Card size="sm" className="overflow-hidden">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Advanced Chart</CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[300px]">
              <TradingViewChart symbol={analysisSymbol} />
            </CardContent>
          </Card>
          <Card size="sm" className="overflow-hidden">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Financials</CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[300px]">
              <TVFinancials symbol={analysisSymbol} />
            </CardContent>
          </Card>
          <Card size="sm" className="overflow-hidden">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Market Overview</CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[300px]">
              <TVMiniOverview symbol={analysisSymbol} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 3x3 그리드 ── */}
      <div className="shrink-0">
          {/* AI 선택 탭 */}
          <div className="flex items-center gap-2 mb-3">
            {analysisSymbol && (
              <Badge variant="outline" className="text-xs font-mono mr-2">{analysisSymbol}</Badge>
            )}
            {[
              { id: 'all' as const, label: 'ALL', color: 'bg-white/10 text-white' },
              ...AI_COLS.map(c => ({ id: c.id as 'gpt' | 'gemini' | 'claude', label: c.name, color: `${c.bgColor} ${c.color}` })),
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveAI(tab.id)}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  activeAI === tab.id
                    ? `${tab.color} border border-current font-semibold`
                    : 'text-muted-foreground hover:text-foreground'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* 헤더 행: AI 이름 */}
          {(() => {
            const visibleCols = activeAI === 'all' ? AI_COLS : AI_COLS.filter(c => c.id === activeAI);
            const gridCols = activeAI === 'all' ? 'grid-cols-[80px_1fr_1fr_1fr]' : 'grid-cols-[80px_1fr]';
            return (
              <>
                <div className={`grid ${gridCols} gap-2 mb-2`}>
                  <div />
                  {visibleCols.map(col => (
                    <div key={col.id} className="flex items-center justify-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${col.dotColor}`} />
                      <span className={`text-sm font-semibold ${col.color}`}>{col.name}</span>
                    </div>
                  ))}
                </div>

                {/* 3행: 각 행에 AI 응답 */}
                {ROW_LABELS.map(row => (
                  <div key={row.key} className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{row.label}</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>
                    <div className={`grid ${activeAI === 'all' ? 'grid-cols-3' : 'grid-cols-1'} gap-2`}>
                      {visibleCols.map(col => (
                        <AICell
                          key={col.id}
                          aiId={col.id}
                          text={grid?.[row.key]?.[col.id as 'gpt' | 'gemini' | 'claude'] ?? ''}
                          loading={analyzing}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            );
          })()}

          {/* 분석 전 안내 */}
          {!grid && !analyzing && (
            <div className="py-8 text-center text-muted-foreground">
              <HugeiconsIcon icon={AiBrain02Icon} className="mx-auto mb-3 h-10 w-10 opacity-20" strokeWidth={1.5} />
              <p className="text-sm">종목을 입력하면 3개 AI가 동시에 분석합니다</p>
              <p className="text-xs mt-1">Technical / Fundamental / Market 각각 분석</p>
            </div>
          )}
      </div>

      {/* ── 하단: 채팅 입력 ── */}
      <div className="shrink-0 border-t border-border pt-2 pb-1">
        <div className="flex gap-2 items-center">
          {/* 모바일 RAG 토글 */}
          <button
            onClick={() => setRagEnabled(!ragEnabled)}
            className={`lg:hidden shrink-0 rounded-md px-2 py-2 text-xs ${
              ragEnabled ? 'bg-purple-600 text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            RAG
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`${selected || '종목'} 분석해줘... (3개 AI 동시 응답)`}
            disabled={analyzing}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
          <Button onClick={send} disabled={!input.trim() || analyzing} size="icon">
            <HugeiconsIcon icon={SentIcon} className="h-4 w-4" strokeWidth={2} />
          </Button>
        </div>
      </div>
    </div>
  );
}
