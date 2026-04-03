'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  FavouriteIcon,
  Search01Icon,
  Cancel01Icon,
  GridViewIcon,
} from '@hugeicons/core-free-icons';

// ── Types ──

interface SymbolInfo {
  symbol: string;
  favorited: boolean;
}

// ── LocalStorage ──

const FAVORITES_KEY = 'stock_favorites';

function loadFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFavorites(favs: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

// ── TradingView 거래소 매핑 ──
const TV_EXCHANGE: Record<string, string> = {
  QQQ: 'NASDAQ', TQQQ: 'NASDAQ', SQQQ: 'NASDAQ', AAPL: 'NASDAQ', MSFT: 'NASDAQ',
  NVDA: 'NASDAQ', GOOGL: 'NASDAQ', AMZN: 'NASDAQ', META: 'NASDAQ', TSLA: 'NASDAQ',
  AVGO: 'NASDAQ', COST: 'NASDAQ', NFLX: 'NASDAQ', ADBE: 'NASDAQ', AMD: 'NASDAQ',
  INTC: 'NASDAQ', CSCO: 'NASDAQ', QCOM: 'NASDAQ', INTU: 'NASDAQ', AMAT: 'NASDAQ',
  SOXX: 'NASDAQ', ADI: 'NASDAQ', APP: 'NASDAQ', CEG: 'NASDAQ', HOOD: 'NASDAQ',
  SPY: 'AMEX', VOO: 'AMEX', IVV: 'AMEX', DIA: 'AMEX', IWM: 'AMEX', VTI: 'AMEX',
  GLD: 'AMEX', SLV: 'AMEX', HYG: 'AMEX', LQD: 'AMEX', EEM: 'AMEX', ARKK: 'AMEX',
  XLF: 'AMEX', XLK: 'AMEX', XLE: 'AMEX', XLV: 'AMEX', SMH: 'AMEX', KWEB: 'AMEX',
  TLT: 'NASDAQ', JPM: 'NYSE', V: 'NYSE', JNJ: 'NYSE', WMT: 'NYSE', XOM: 'NYSE',
  PG: 'NYSE', UNH: 'NYSE', HD: 'NYSE', MA: 'NYSE', DIS: 'NYSE', WFC: 'NYSE',
};

// ── TradingView 미니 위젯 ──
function TVMiniWidget({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';

    const tvSymbol = TV_EXCHANGE[symbol] ? `${TV_EXCHANGE[symbol]}:${symbol}` : symbol;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: tvSymbol,
      width: '100%',
      height: '100%',
      locale: 'kr',
      dateRange: '3M',
      colorTheme: 'dark',
      isTransparent: true,
      autosize: true,
      largeChartUrl: '',
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.height = '100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    wrapper.appendChild(inner);
    wrapper.appendChild(script);
    ref.current.appendChild(wrapper);

    return () => { if (ref.current) ref.current.innerHTML = ''; };
  }, [symbol]);

  return <div ref={ref} className="h-full w-full" />;
}

// ── TradingView 풀 차트 (모달용) ──
function TVFullChart({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';

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
    ref.current.appendChild(wrapper);

    return () => { if (ref.current) ref.current.innerHTML = ''; };
  }, [symbol]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-mono font-bold">{symbol}</h2>
          <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted">
            ESC 닫기
          </button>
        </div>
        <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden">
          <div ref={ref} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}

// ── 종목 카드 ──
function StockCard({
  symbol,
  favorited,
  onToggleFav,
  onOpen,
}: {
  symbol: string;
  favorited: boolean;
  onToggleFav: (sym: string) => void;
  onOpen: (sym: string) => void;
}) {
  return (
    <Card size="sm" className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => onOpen(symbol)}>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono font-bold">{symbol}</span>
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(symbol); }}
            className={`transition-colors ${favorited ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
          >
            <HugeiconsIcon icon={FavouriteIcon} className="h-4 w-4" strokeWidth={favorited ? 3 : 2} />
          </button>
        </div>
        <div className="h-[120px] overflow-hidden rounded">
          <TVMiniWidget symbol={symbol} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── 메인 ──
export default function StocksPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFavorites(loadFavorites());
    fetch('/trading/api/ml/symbols', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setSymbols(d.symbols || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleFavorite = useCallback((sym: string) => {
    setFavorites(prev => {
      const next = prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym];
      saveFavorites(next);
      return next;
    });
  }, []);

  const filtered = (filter === 'favorites' ? favorites : symbols)
    .filter(s => !search || s.toUpperCase().includes(search.toUpperCase()));

  return (
    <>
      {openSymbol && <TVFullChart symbol={openSymbol} onClose={() => setOpenSymbol(null)} />}

      <div className="space-y-4">
        {/* 헤더 */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">종목 열람</h1>

          {/* 검색 */}
          <div className="relative ml-auto">
            <HugeiconsIcon icon={Search01Icon} className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="종목 검색..."
              className="w-48 rounded-md border border-border bg-background py-1.5 pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </div>

          {/* 필터 */}
          <div className="flex gap-1">
            <Button
              size="xs"
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
            >
              <HugeiconsIcon icon={GridViewIcon} className="mr-1 h-3 w-3" strokeWidth={2} />
              전체 ({symbols.length})
            </Button>
            <Button
              size="xs"
              variant={filter === 'favorites' ? 'default' : 'outline'}
              onClick={() => setFilter('favorites')}
            >
              <HugeiconsIcon icon={FavouriteIcon} className="mr-1 h-3 w-3" strokeWidth={2} />
              즐겨찾기 ({favorites.length})
            </Button>
          </div>
        </div>

        {/* 그리드 */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[180px]" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            {filter === 'favorites' ? (
              <>
                <HugeiconsIcon icon={FavouriteIcon} className="mx-auto mb-3 h-12 w-12 opacity-20" strokeWidth={1.5} />
                <p className="text-sm">즐겨찾기한 종목이 없습니다</p>
                <p className="mt-1 text-xs">종목 카드의 하트를 눌러 추가하세요</p>
              </>
            ) : (
              <>
                <HugeiconsIcon icon={Search01Icon} className="mx-auto mb-3 h-12 w-12 opacity-20" strokeWidth={1.5} />
                <p className="text-sm">검색 결과가 없습니다</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map(sym => (
              <StockCard
                key={sym}
                symbol={sym}
                favorited={favorites.includes(sym)}
                onToggleFav={toggleFavorite}
                onOpen={setOpenSymbol}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
