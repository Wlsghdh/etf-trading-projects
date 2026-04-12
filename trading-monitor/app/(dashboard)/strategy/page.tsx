'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon,
  Calendar03Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
} from '@hugeicons/core-free-icons';
import { useTheme } from '@/hooks/use-theme';

// ── 시나리오 타입 ──

interface ScenarioPoint {
  date: string;
  price: number;
}

interface Scenario {
  name: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  drift: number;
  volatility: number;
  data: ScenarioPoint[];
  expectedReturn: number;
  mdd: number;
}

// ── 시나리오 생성 ──

function generateScenarios(
  symbol: string,
  startDate: string,
  startPrice: number,
  days: number = 63,
): Scenario[] {
  const configs = [
    { name: 'bullPlus', label: '급등', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/40', drift: 0.004, volatility: 0.015 },
    { name: 'bull', label: '상승', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/40', drift: 0.0015, volatility: 0.01 },
    { name: 'neutral', label: '보합', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/40', drift: 0, volatility: 0.008 },
    { name: 'bear', label: '하락', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/40', drift: -0.0015, volatility: 0.01 },
    { name: 'bearPlus', label: '급락', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/40', drift: -0.004, volatility: 0.02 },
  ];

  return configs.map(cfg => {
    const data: ScenarioPoint[] = [];
    let price = startPrice;
    let minPrice = startPrice;
    const base = new Date(startDate);

    for (let d = 0; d <= days; d++) {
      const date = new Date(base);
      date.setDate(date.getDate() + d);
      // 주말 스킵
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      if (d > 0) {
        const noise = (Math.random() - 0.5) * 2 * cfg.volatility;
        price = price * (1 + cfg.drift + noise);
        price = Math.max(price, 0.01);
      }
      minPrice = Math.min(minPrice, price);
      data.push({ date: date.toISOString().split('T')[0], price: Math.round(price * 100) / 100 });
    }

    const lastPrice = data.length > 0 ? data[data.length - 1].price : startPrice;
    const expectedReturn = ((lastPrice - startPrice) / startPrice) * 100;
    const mdd = ((minPrice - startPrice) / startPrice) * 100;

    return { ...cfg, data, expectedReturn, mdd };
  });
}

// ── 시나리오 차트 (SVG) ──

function ScenarioChart({ scenarios, startPrice }: { scenarios: Scenario[]; startPrice: number }) {
  const W = 800;
  const H = 320;
  const PAD = { top: 20, right: 20, bottom: 30, left: 60 };

  const allPrices = scenarios.flatMap(s => s.data.map(d => d.price));
  const minP = Math.min(...allPrices) * 0.98;
  const maxP = Math.max(...allPrices) * 1.02;
  const maxLen = Math.max(...scenarios.map(s => s.data.length));

  const scaleX = (i: number) => PAD.left + (i / (maxLen - 1)) * (W - PAD.left - PAD.right);
  const scaleY = (p: number) => PAD.top + ((maxP - p) / (maxP - minP)) * (H - PAD.top - PAD.bottom);

  const svgColors: Record<string, string> = {
    bullPlus: '#10b981', bull: '#22c55e', neutral: '#f59e0b', bear: '#f97316', bearPlus: '#ef4444',
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* Y축 그리드 */}
      {Array.from({ length: 5 }, (_, i) => {
        const p = minP + (i / 4) * (maxP - minP);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={scaleY(p)} x2={W - PAD.right} y2={scaleY(p)}
              stroke="currentColor" strokeOpacity={0.1} />
            <text x={PAD.left - 5} y={scaleY(p) + 4} textAnchor="end"
              className="fill-muted-foreground" fontSize={10}>
              ${p.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* 시작가 기준선 */}
      <line x1={PAD.left} y1={scaleY(startPrice)} x2={W - PAD.right} y2={scaleY(startPrice)}
        stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4,4" />

      {/* 시나리오 라인 */}
      {scenarios.map(scenario => {
        const points = scenario.data.map((d, i) => `${scaleX(i)},${scaleY(d.price)}`).join(' ');
        return (
          <polyline
            key={scenario.name}
            points={points}
            fill="none"
            stroke={svgColors[scenario.name]}
            strokeWidth={2}
            strokeOpacity={0.8}
          />
        );
      })}
    </svg>
  );
}

// ── 가상 매매 ──

interface VirtualHolding {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

interface VirtualTrade {
  timestamp: string;
  action: 'BUY' | 'SELL';
  symbol: string;
  quantity: number;
  price: number;
}

interface VirtualPortfolio {
  cash: number;
  initialCapital: number;
  holdings: VirtualHolding[];
  trades: VirtualTrade[];
}

const VIRTUAL_STORAGE_KEY = 'virtual_portfolio';

function loadPortfolio(): VirtualPortfolio {
  if (typeof window === 'undefined') return { cash: 10000, initialCapital: 10000, holdings: [], trades: [] };
  try {
    const raw = localStorage.getItem(VIRTUAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { cash: 10000, initialCapital: 10000, holdings: [], trades: [] };
}

function savePortfolio(p: VirtualPortfolio) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIRTUAL_STORAGE_KEY, JSON.stringify(p));
}

function VirtualTradingTab({ symbol }: { symbol: string }) {
  const [portfolio, setPortfolio] = useState<VirtualPortfolio>(loadPortfolio);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('');
  const [capitalInput, setCapitalInput] = useState('');
  const [loadingPrice, setLoadingPrice] = useState(false);

  // 현재 가격 가져오기
  const fetchPrice = useCallback(async () => {
    setLoadingPrice(true);
    try {
      const res = await fetch(`/trading/api/data/${symbol}?timeframe=D&limit=1`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const items = data.data || [];
        if (items.length > 0) setCurrentPrice(items[items.length - 1].close);
      }
    } catch { /* ignore */ }
    setLoadingPrice(false);
  }, [symbol]);

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  const updatePortfolio = (p: VirtualPortfolio) => {
    setPortfolio(p);
    savePortfolio(p);
  };

  const handleResetCapital = () => {
    const cap = parseFloat(capitalInput) || 10000;
    const p: VirtualPortfolio = { cash: cap, initialCapital: cap, holdings: [], trades: [] };
    updatePortfolio(p);
    setCapitalInput('');
  };

  const handleTrade = (action: 'BUY' | 'SELL') => {
    if (!currentPrice || !quantity) return;
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return;

    const p = { ...portfolio, holdings: [...portfolio.holdings], trades: [...portfolio.trades] };
    const totalCost = currentPrice * qty;

    if (action === 'BUY') {
      if (totalCost > p.cash) return; // 잔고 부족
      p.cash -= totalCost;
      const existing = p.holdings.find(h => h.symbol === symbol);
      if (existing) {
        const newQty = existing.quantity + qty;
        existing.avgPrice = (existing.avgPrice * existing.quantity + totalCost) / newQty;
        existing.quantity = newQty;
      } else {
        p.holdings.push({ symbol, quantity: qty, avgPrice: currentPrice });
      }
    } else {
      const existing = p.holdings.find(h => h.symbol === symbol);
      if (!existing || existing.quantity < qty) return; // 보유 부족
      p.cash += totalCost;
      existing.quantity -= qty;
      if (existing.quantity === 0) {
        p.holdings = p.holdings.filter(h => h.symbol !== symbol);
      }
    }

    p.trades.push({
      timestamp: new Date().toISOString(),
      action,
      symbol,
      quantity: qty,
      price: currentPrice,
    });

    updatePortfolio(p);
    setQuantity('');
  };

  // 포트폴리오 가치 계산
  const holdingsValue = portfolio.holdings.reduce((sum, h) => {
    const price = h.symbol === symbol && currentPrice ? currentPrice : h.avgPrice;
    return sum + h.quantity * price;
  }, 0);
  const totalValue = portfolio.cash + holdingsValue;
  const returnPct = portfolio.initialCapital > 0
    ? ((totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100
    : 0;

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* 좌: 매매 패널 */}
      <div className="w-80 shrink-0 space-y-3 overflow-y-auto">
        {/* 초기 자본 설정 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">초기 자본 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                value={capitalInput}
                onChange={e => setCapitalInput(e.target.value)}
                placeholder="10000"
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Button variant="outline" size="sm" onClick={handleResetCapital}>
                초기화
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">포트폴리오를 리셋하고 새 자본으로 시작합니다</p>
          </CardContent>
        </Card>

        {/* 현재가 + 주문 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {symbol} 주문
              {loadingPrice && <span className="text-[10px] text-muted-foreground">가격 로딩...</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">현재가</span>
              <span className="font-mono font-bold text-base">
                {currentPrice ? `$${currentPrice.toFixed(2)}` : '-'}
              </span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">수량</label>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 mt-1"
              />
              {currentPrice && quantity && parseInt(quantity) > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  예상 금액: ${(currentPrice * parseInt(quantity)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1"
                onClick={() => handleTrade('BUY')}
                disabled={!currentPrice || !quantity}
              >
                <HugeiconsIcon icon={ArrowUp01Icon} className="h-3.5 w-3.5" strokeWidth={2} />
                매수
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1"
                variant="destructive"
                onClick={() => handleTrade('SELL')}
                disabled={!currentPrice || !quantity}
              >
                <HugeiconsIcon icon={ArrowDown01Icon} className="h-3.5 w-3.5" strokeWidth={2} />
                매도
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              잔고: ${portfolio.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        {/* 포트폴리오 요약 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">포트폴리오 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">초기 자본</span>
                <div className="font-mono font-semibold">${portfolio.initialCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div>
                <span className="text-muted-foreground">현금</span>
                <div className="font-mono font-semibold">${portfolio.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div>
                <span className="text-muted-foreground">보유 주식 가치</span>
                <div className="font-mono font-semibold">${holdingsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div>
                <span className="text-muted-foreground">총 자산</span>
                <div className="font-mono font-bold">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">수익률</span>
              <Badge variant={returnPct >= 0 ? 'default' : 'destructive'} className="text-xs font-mono">
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 우: 보유 종목 + 거래 이력 */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {/* 보유 종목 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">보유 종목</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolio.holdings.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">보유 종목이 없습니다</p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-6 gap-2 text-[10px] text-muted-foreground uppercase px-2 pb-1 border-b border-border">
                  <span>종목</span>
                  <span className="text-right">수량</span>
                  <span className="text-right">평균가</span>
                  <span className="text-right">현재가</span>
                  <span className="text-right">평가액</span>
                  <span className="text-right">손익</span>
                </div>
                {portfolio.holdings.map(h => {
                  const curP = h.symbol === symbol && currentPrice ? currentPrice : h.avgPrice;
                  const value = h.quantity * curP;
                  const pnl = (curP - h.avgPrice) * h.quantity;
                  const pnlPct = ((curP - h.avgPrice) / h.avgPrice) * 100;
                  return (
                    <div key={h.symbol} className="grid grid-cols-6 gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/50">
                      <span className="font-mono font-bold">{h.symbol}</span>
                      <span className="text-right">{h.quantity}</span>
                      <span className="text-right font-mono">${h.avgPrice.toFixed(2)}</span>
                      <span className="text-right font-mono">${curP.toFixed(2)}</span>
                      <span className="text-right font-mono">${value.toFixed(2)}</span>
                      <span className={`text-right font-mono ${pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 거래 이력 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">거래 이력</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolio.trades.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">거래 이력이 없습니다</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1">
                {[...portfolio.trades].reverse().map((t, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-xs">
                    <Badge variant={t.action === 'SELL' ? 'destructive' : 'default'} className="text-[9px] w-10 justify-center">
                      {t.action}
                    </Badge>
                    <span className="font-mono font-bold w-14">{t.symbol}</span>
                    <span className="text-muted-foreground">{t.quantity}주</span>
                    <span className="font-mono">${t.price.toFixed(2)}</span>
                    <span className="font-mono text-muted-foreground ml-auto">
                      ${(t.price * t.quantity).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground text-[10px] w-28 text-right">
                      {new Date(t.timestamp).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── 매매 복기 ──

interface OrderLog {
  id: number;
  cycle_id: number;
  order_type: string;
  etf_code: string;
  quantity: number;
  price: number;
  status: string;
  created_at: string;
}

function TradeReviewTab() {
  const [orders, setOrders] = useState<OrderLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/trading/api/trading/orders?page_size=200')
      .then(r => r.json())
      .then(d => setOrders(d.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const successOrders = orders.filter(o => o.status === 'SUCCESS');
  const totalBuy = successOrders.filter(o => o.order_type?.includes('BUY')).reduce((s, o) => s + (o.price || 0) * o.quantity, 0);
  const totalSell = successOrders.filter(o => o.order_type?.includes('SELL')).reduce((s, o) => s + (o.price || 0) * o.quantity, 0);

  if (loading) return <div className="py-12 text-center text-muted-foreground text-sm">로딩 중...</div>;
  if (orders.length === 0) return <div className="py-12 text-center text-muted-foreground text-sm">매매 이력이 없습니다</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-[10px] text-muted-foreground uppercase">총 주문</div>
            <div className="text-xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-[10px] text-muted-foreground uppercase">매수 금액</div>
            <div className="text-xl font-bold text-green-600 dark:text-green-400">
              ${totalBuy.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-[10px] text-muted-foreground uppercase">매도 금액</div>
            <div className="text-xl font-bold text-red-600 dark:text-red-400">
              ${totalSell.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-1">
        {orders.slice(0, 100).map(o => (
          <div key={o.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-xs">
            <Badge variant={o.order_type?.includes('SELL') ? 'destructive' : 'default'} className="text-[9px] w-10 justify-center">
              {o.order_type?.includes('SELL') ? 'SELL' : 'BUY'}
            </Badge>
            <span className="font-mono font-bold w-14">{o.etf_code}</span>
            <span className="text-muted-foreground">{o.quantity}주</span>
            <span className="font-mono">{o.price ? `$${o.price.toFixed(2)}` : '-'}</span>
            <Badge variant={o.status === 'SUCCESS' ? 'default' : 'outline'} className="text-[9px] ml-auto">
              {o.status}
            </Badge>
            <span className="text-muted-foreground text-[10px] w-24 text-right">
              {o.created_at ? new Date(o.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TradingView 차트 (스냅샷) ──

function TVChartSnapshot({ symbol, theme }: { symbol: string; theme: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !symbol) return;
    ref.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true, symbol, interval: 'D', timezone: 'Asia/Seoul',
      theme, style: '1', locale: 'kr', hide_top_toolbar: false,
      allow_symbol_change: false, save_image: false, calendar: false,
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

// ── 메인 ──

type Tab = 'scenario' | 'review' | 'virtual';

export default function StrategyPage() {
  const [symbol, setSymbol] = useState('AAPL');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [startPrice, setStartPrice] = useState(0);
  const [tab, setTab] = useState<Tab>('scenario');
  const theme = useTheme();

  const runScenario = useCallback(async () => {
    // 시작 가격 가져오기
    try {
      const res = await fetch(`/trading/api/data/${symbol}?timeframe=D&limit=260`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const items = data.data || [];
        // startDate에 가장 가까운 가격 찾기
        const target = items.find((d: { time: string }) => d.time?.slice(0, 10) >= startDate);
        const price = target?.close || items[items.length - 1]?.close || 100;
        setStartPrice(price);
        setScenarios(generateScenarios(symbol, startDate, price, 63));
      } else {
        setStartPrice(100);
        setScenarios(generateScenarios(symbol, startDate, 100, 63));
      }
    } catch {
      setStartPrice(100);
      setScenarios(generateScenarios(symbol, startDate, 100, 63));
    }
  }, [symbol, startDate]);

  const handleSearch = () => {
    const sym = search.trim().toUpperCase();
    if (sym) { setSymbol(sym); setSearch(''); setScenarios(null); }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4 overflow-auto">
      {/* 상단: 종목 + 날짜 + 예측 */}
      <div className="flex items-end gap-3 shrink-0">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">종목</label>
          <div className="flex gap-1">
            <div className="relative">
              <HugeiconsIcon icon={Search01Icon} className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                placeholder={symbol}
                className="w-32 rounded-md border border-border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleSearch}>
              <span className="font-mono font-bold">{symbol}</span>
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">기준 날짜</label>
          <div className="relative">
            <HugeiconsIcon icon={Calendar03Icon} className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setScenarios(null); }}
              className="rounded-md border border-border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
        <Button onClick={runScenario} className="gap-1.5">
          <HugeiconsIcon icon={ArrowUp01Icon} className="h-4 w-4" strokeWidth={2} />
          예측 시나리오 생성
        </Button>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 shrink-0">
        {([
          { id: 'scenario' as Tab, label: '시나리오 예측' },
          { id: 'review' as Tab, label: '매매 복기' },
          { id: 'virtual' as Tab, label: '가상 매매' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-xs rounded-md transition-colors ${
              tab === t.id
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'scenario' ? (
        <div className="flex flex-1 min-h-0 gap-4">
          {/* 좌: TradingView 실제 차트 */}
          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {symbol} 실제 차트
                <Badge variant="outline" className="text-[10px]">TradingView</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-3rem)] p-0">
              <TVChartSnapshot symbol={symbol} theme={theme} />
            </CardContent>
          </Card>

          {/* 우: 시나리오 결과 */}
          <div className="w-96 xl:w-[480px] shrink-0 space-y-3 overflow-y-auto">
            {!scenarios ? (
              <Card className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <HugeiconsIcon icon={ArrowUp01Icon} className="mx-auto mb-3 h-10 w-10 opacity-20" strokeWidth={1.5} />
                  <p className="text-sm">종목 + 날짜 선택 후</p>
                  <p className="text-sm font-semibold mt-1">"예측 시나리오 생성" 클릭</p>
                </div>
              </Card>
            ) : (
              <>
                {/* 시나리오 차트 */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      5-Way 시나리오 ({startDate} ~ {scenarios[0]?.data[scenarios[0].data.length - 1]?.date})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    <ScenarioChart scenarios={scenarios} startPrice={startPrice} />
                  </CardContent>
                </Card>

                {/* 시나리오 카드 */}
                {scenarios.map(s => (
                  <Card key={s.name} className={`border ${s.borderColor} ${s.bgColor}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HugeiconsIcon
                            icon={s.drift >= 0 ? ArrowUp01Icon : ArrowDown01Icon}
                            className={`h-4 w-4 ${s.color}`}
                            strokeWidth={2}
                          />
                          <span className={`text-sm font-bold ${s.color}`}>{s.label}</span>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${s.color}`}>
                          {s.expectedReturn >= 0 ? '+' : ''}{s.expectedReturn.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-muted-foreground">시작가</span>
                          <div className="font-mono font-semibold">${startPrice.toFixed(2)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">예상 종가</span>
                          <div className={`font-mono font-semibold ${s.color}`}>
                            ${s.data.length > 0 ? s.data[s.data.length - 1].price.toFixed(2) : '-'}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">MDD</span>
                          <div className="font-mono font-semibold text-red-600 dark:text-red-400">
                            {s.mdd.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        </div>
      ) : tab === 'review' ? (
        <TradeReviewTab />
      ) : (
        <VirtualTradingTab symbol={symbol} />
      )}
    </div>
  );
}
