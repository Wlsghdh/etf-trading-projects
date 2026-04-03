'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiChat02Icon,
  AiBrain02Icon,
  ArrowUp02Icon,
  ArrowDown02Icon,
  SentIcon,
  Wallet03Icon,
  ChartLineData02Icon,
  Analytics02Icon,
} from '@hugeicons/core-free-icons';

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
  exchange_code: string;
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
  purchase_date: string;
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

type AIModel = 'chatgpt' | 'gemini' | 'claude' | 'multiai';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model: AIModel;
  timestamp: Date;
  analysisData?: StockAnalysis;
}

// ── API ──

const API_PREFIX = '/trading/api';

async function fetchSymbols(): Promise<string[]> {
  const res = await fetch(`${API_PREFIX}/ml/symbols`, { cache: 'no-store' });
  if (!res.ok) throw new Error('symbols fetch failed');
  const data = await res.json();
  return data.symbols || [];
}

async function fetchStockData(symbol: string, limit = 100): Promise<StockDataItem[]> {
  const res = await fetch(`${API_PREFIX}/data/${symbol}?timeframe=D&limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('stock data fetch failed');
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
    fetchStockData(symbol, 260).catch(() => []),
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

// ── TradingView 위젯 차트 ──
const TV_EXCHANGE: Record<string, string> = {
  QQQ: 'NASDAQ', TQQQ: 'NASDAQ', AAPL: 'NASDAQ', MSFT: 'NASDAQ', NVDA: 'NASDAQ',
  GOOGL: 'NASDAQ', GOOG: 'NASDAQ', AMZN: 'NASDAQ', META: 'NASDAQ', TSLA: 'NASDAQ',
  AVGO: 'NASDAQ', COST: 'NASDAQ', NFLX: 'NASDAQ', ADBE: 'NASDAQ', AMD: 'NASDAQ',
  INTC: 'NASDAQ', CSCO: 'NASDAQ', QCOM: 'NASDAQ', INTU: 'NASDAQ', AMAT: 'NASDAQ',
  LRCX: 'NASDAQ', KLAC: 'NASDAQ', CRWD: 'NASDAQ', PANW: 'NASDAQ', TXN: 'NASDAQ',
  HOOD: 'NASDAQ', SOXX: 'NASDAQ', ADI: 'NASDAQ', APP: 'NASDAQ', CEG: 'NASDAQ',
};

function TradingViewChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !symbol) return;
    containerRef.current.innerHTML = '';

    const tvSymbol = TV_EXCHANGE[symbol] ? `${TV_EXCHANGE[symbol]}:${symbol}` : symbol;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: 'D',
      timezone: 'Asia/Seoul',
      theme: 'dark',
      style: '1',
      locale: 'kr',
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
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
    containerRef.current.appendChild(wrapper);

    return () => { if (containerRef.current) containerRef.current.innerHTML = ''; };
  }, [symbol]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// ── 분석 카드 ──
function AnalysisCards({ analysis }: { analysis: StockAnalysis }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 my-3">
      {/* KIS 보유 현황 */}
      {analysis.holdingQty !== null && (
        <Card size="sm" className="border-green-500/20">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <HugeiconsIcon icon={Wallet03Icon} className="h-4 w-4 text-green-500" strokeWidth={2} />
              KIS 보유 현황
              <span className={`ml-auto h-2 w-2 rounded-full ${analysis.kisConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="보유 수량" value={`${analysis.holdingQty}주`} />
            <Row label="매수 평균가" value={`$${analysis.avgBuyPrice?.toFixed(2) ?? 'N/A'}`} />
            <Row label="현재가" value={`$${analysis.currentPrice.toFixed(2)}`} bold />
            {analysis.pnlRate !== null && (
              <Row
                label="수익률"
                value={`${analysis.pnlRate >= 0 ? '+' : ''}${analysis.pnlRate.toFixed(2)}%`}
                color={analysis.pnlRate >= 0 ? 'text-green-500' : 'text-red-500'}
                bold
              />
            )}
            <Row
              label="평가금액"
              value={`$${(analysis.currentPrice * (analysis.holdingQty ?? 0)).toFixed(2)}`}
            />
          </CardContent>
        </Card>
      )}

      {/* 시장 동향 */}
      <Card size="sm" className="border-blue-500/20">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <HugeiconsIcon icon={ChartLineData02Icon} className="h-4 w-4 text-blue-500" strokeWidth={2} />
            최근 시장 동향
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <Row label="현재가" value={`$${analysis.currentPrice.toFixed(2)}`} bold />
          <Row label="1일 변동" value={`${fmt(analysis.priceChange1d)}%`} color={pnlColor(analysis.priceChange1d)} />
          <Row label="5일 변동" value={`${fmt(analysis.priceChange5d)}%`} color={pnlColor(analysis.priceChange5d)} />
          <Row label="20일 변동" value={`${fmt(analysis.priceChange20d)}%`} color={pnlColor(analysis.priceChange20d)} />
          <Row
            label="RSI (14)"
            value={analysis.rsi?.toFixed(1) ?? 'N/A'}
            color={analysis.rsi !== null ? (analysis.rsi < 30 ? 'text-green-500' : analysis.rsi > 70 ? 'text-red-500' : '') : ''}
          />
          <Row
            label="MACD"
            value={analysis.macd?.toFixed(4) ?? 'N/A'}
            color={analysis.macd !== null ? (analysis.macd > 0 ? 'text-green-500' : 'text-red-500') : ''}
          />
          <Row label="52주 범위" value={`$${analysis.low52w.toFixed(0)} ~ $${analysis.high52w.toFixed(0)}`} />
          <Row label="거래량" value={`${(analysis.volume / 1e6).toFixed(1)}M (avg ${(analysis.avgVolume / 1e6).toFixed(1)}M)`} />
        </CardContent>
      </Card>

      {/* ML 분석 */}
      <Card size="sm" className="border-purple-500/20">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <HugeiconsIcon icon={AiBrain02Icon} className="h-4 w-4 text-purple-500" strokeWidth={2} />
            ML 분석 결과
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {analysis.rank !== null ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">예측 방향</span>
                <Badge
                  variant={analysis.direction === 'BUY' ? 'default' : analysis.direction === 'SELL' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {analysis.direction}
                </Badge>
              </div>
              <Row label="종목 순위" value={`${analysis.rank}위 / ${analysis.totalSymbols}개`} bold />
              <Row label="모델 스코어" value={analysis.score?.toFixed(4) ?? 'N/A'} />
              <Row
                label="가중치"
                value={analysis.weight !== null ? `${analysis.weight > 0 ? '+' : ''}${analysis.weight.toFixed(3)}` : 'N/A'}
                color={pnlColor(analysis.weight ?? 0)}
              />
              <Row label="모델" value={analysis.modelName ?? 'N/A'} />
              <Row label="예측일" value={analysis.predictionDate ? new Date(analysis.predictionDate).toLocaleDateString('ko-KR') : 'N/A'} />
              <div className="mt-2 rounded bg-muted p-2 text-xs text-muted-foreground">
                LightGBM LambdaRank 85개 피쳐 (기술지표 + 거시경제 + Z-score + 랭크)
              </div>
            </>
          ) : (
            <div className="py-6 text-center text-muted-foreground">
              <HugeiconsIcon icon={AiBrain02Icon} className="mx-auto mb-2 h-8 w-8 opacity-30" strokeWidth={1.5} />
              <p className="text-sm">ML 랭킹 데이터 없음</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── 헬퍼 ──
function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${color ?? ''} ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

function fmt(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

function pnlColor(n: number) {
  return n > 0 ? 'text-green-500' : n < 0 ? 'text-red-500' : '';
}

// ── AI 모델 설정 ──
const AI_MODELS: { id: AIModel; name: string; color: string }[] = [
  { id: 'chatgpt', name: 'ChatGPT', color: 'bg-green-600 hover:bg-green-700' },
  { id: 'gemini', name: 'Gemini', color: 'bg-blue-600 hover:bg-blue-700' },
  { id: 'claude', name: 'Claude', color: 'bg-orange-600 hover:bg-orange-700' },
  { id: 'multiai', name: 'Multi AI', color: 'bg-purple-600 hover:bg-purple-700' },
];

// ── 분석 요청 감지 ──
function detectTicker(text: string): string | null {
  const patterns = [
    /([A-Za-z]{1,5})\s*분석/,
    /분석.*?([A-Za-z]{1,5})/,
    /([A-Za-z]{1,5})\s*어때/,
    /([A-Za-z]{1,5})\s*전망/,
    /analyze\s+([A-Za-z]{1,5})/i,
    /^([A-Za-z]{1,5})$/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function generateResponse(a: StockAnalysis, model: AIModel): string {
  const prefix: Record<AIModel, string> = {
    chatgpt: `[ChatGPT] ${a.symbol} 분석 결과입니다.\n\n`,
    gemini: `[Gemini] ${a.symbol} 분석을 진행했습니다.\n\n`,
    claude: `[Claude] ${a.symbol} 리포트입니다.\n\n`,
    multiai: `[Multi AI] ${a.symbol} 종합 분석입니다.\n\n`,
  };

  let r = prefix[model];

  if (a.holdingQty !== null) {
    r += `보유: ${a.holdingQty}주 (매수가 $${a.avgBuyPrice?.toFixed(2) ?? 'N/A'})`;
    if (a.pnlRate !== null) r += ` | 수익률 ${a.pnlRate >= 0 ? '+' : ''}${a.pnlRate.toFixed(2)}%`;
    r += '\n\n';
  }

  r += `현재 $${a.currentPrice.toFixed(2)} | 전일 ${fmt(a.priceChange1d)}%\n`;
  r += `RSI ${a.rsi?.toFixed(1) ?? 'N/A'} | MACD ${a.macd?.toFixed(4) ?? 'N/A'}\n`;

  if (a.rank !== null) {
    r += `\nML 순위: ${a.rank}/${a.totalSymbols} (${a.direction})\n`;
  }

  r += '\n아래 카드에서 상세 확인하세요.';
  return r;
}

// ── 메인 ──
export default function MultiAIPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [model, setModel] = useState<AIModel>('multiai');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [balance, setBalance] = useState<KISBalance | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([fetchSymbols(), fetchBalance()])
      .then(([s, b]) => {
        setSymbols(s);
        setBalance(b);
        if (s.length > 0) setSelected(s[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || analyzing) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      model,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    const ticker = detectTicker(text);
    if (ticker) {
      setAnalyzing(true);
      if (symbols.includes(ticker)) setSelected(ticker);

      try {
        const analysis = await analyzeStock(ticker);
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: generateResponse(analysis, model),
            model,
            timestamp: new Date(),
            analysisData: analysis,
          },
        ]);
      } catch {
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `${ticker} 분석 중 오류. 서비스 상태를 확인해주세요.`,
            model,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setAnalyzing(false);
      }
    } else {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `"AAPL 분석해줘" 또는 "NVDA 어때?" 형식으로 입력해주세요.\n\n현재 선택: ${selected || '없음'}`,
          model,
          timestamp: new Date(),
        },
      ]);
    }
  }, [input, analyzing, model, selected, symbols]);

  const modelInfo = AI_MODELS.find(m => m.id === model)!;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      {/* 상단 */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* TradingView 차트 (좌측 넓게) */}
        <Card size="sm" className="flex-1 min-h-[350px]">
          <CardContent className="h-full p-0">
            <div className="h-full min-h-[330px] rounded-lg overflow-hidden">
              <TradingViewChart symbol={selected} />
            </div>
          </CardContent>
        </Card>

        {/* AI 선택 + KIS 잔고 (우측 컴팩트) */}
        <Card size="sm" className="lg:w-52 shrink-0">
          <CardContent className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">AI 모델</label>
              <div className="grid grid-cols-2 gap-1.5">
                {AI_MODELS.map(m => (
                  <Button
                    key={m.id}
                    variant={model === m.id ? 'default' : 'outline'}
                    size="xs"
                    className={model === m.id ? `${m.color} text-white` : ''}
                    onClick={() => setModel(m.id)}
                  >
                    {m.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1 border-t border-border pt-2 text-xs">
              <div className="flex items-center gap-1 mb-1">
                <span className={`h-2 w-2 rounded-full ${balance?.kis_connected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={balance?.kis_connected ? 'text-green-500' : 'text-red-500'}>
                  {balance?.kis_connected ? 'KIS 연결' : 'KIS 미연결'}
                </span>
              </div>
              {balance?.kis_connected && (
                <>
                  <Row label="현금" value={`$${balance.available_cash_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                  <Row label="평가" value={`$${balance.total_evaluation_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                  <Row label="종목" value={`${balance.holdings.length}개`} />
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 채팅 */}
      <Card size="sm" className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <HugeiconsIcon icon={AiChat02Icon} className="h-4 w-4" strokeWidth={2} />
              AI 분석 채팅
            </span>
            <Badge variant="secondary" className="text-xs">{modelInfo.name}</Badge>
          </CardTitle>
        </CardHeader>

        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <HugeiconsIcon icon={AiChat02Icon} className="mx-auto mb-3 h-12 w-12 opacity-20" strokeWidth={1.5} />
                <p className="text-sm font-medium">멀티 AI 분석 플랫폼</p>
                <p className="mt-1 text-xs">KIS 실계좌 + ML 모델 기반 종목 분석</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['AAPL 분석해줘', 'NVDA 어때?', 'QQQ 전망'].map(ex => (
                    <Button
                      key={ex}
                      variant="outline"
                      size="xs"
                      onClick={() => { setInput(ex); inputRef.current?.focus(); }}
                    >
                      {ex}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const mi = AI_MODELS.find(m => m.id === msg.model);
              return (
                <div key={msg.id} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs text-white ${
                      isUser ? 'bg-gray-500' : mi?.color.split(' ')[0] ?? 'bg-gray-500'
                    }`}
                  >
                    {isUser ? 'U' : mi?.name[0]}
                  </div>
                  <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
                    {!isUser && <span className="ml-1 text-xs text-muted-foreground">{mi?.name}</span>}
                    <div className={`rounded-lg px-3 py-2 text-sm ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.analysisData && <AnalysisCards analysis={msg.analysisData} />}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            {analyzing && (
              <div className="flex gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs text-white ${modelInfo.color.split(' ')[0]}`}>
                  {modelInfo.name[0]}
                </div>
                <div className="flex gap-1 rounded-lg bg-muted px-3 py-2">
                  {[0, 150, 300].map(d => (
                    <div key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        {/* 입력 */}
        <div className="border-t p-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`${selected || '종목'} 분석해줘...`}
              disabled={analyzing}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
            <Button onClick={send} disabled={!input.trim() || analyzing} size="icon">
              <HugeiconsIcon icon={SentIcon} className="h-4 w-4" strokeWidth={2} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
