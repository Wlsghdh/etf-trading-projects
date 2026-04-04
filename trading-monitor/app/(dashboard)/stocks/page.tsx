'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  FavouriteIcon,
  Search01Icon,
  Cancel01Icon,
  ArrowLeft02Icon,
} from '@hugeicons/core-free-icons';

// ── LocalStorage ──

const FAVORITES_KEY = 'stock_favorites';

function loadFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
}
function saveFavorites(favs: string[]) { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs)); }

// ── TradingView 거래소 매핑 ──
const TV_EXCHANGE: Record<string, string> = {
  QQQ: 'NASDAQ', TQQQ: 'NASDAQ', SQQQ: 'NASDAQ', AAPL: 'NASDAQ', MSFT: 'NASDAQ',
  NVDA: 'NASDAQ', GOOGL: 'NASDAQ', AMZN: 'NASDAQ', META: 'NASDAQ', TSLA: 'NASDAQ',
  AVGO: 'NASDAQ', COST: 'NASDAQ', NFLX: 'NASDAQ', ADBE: 'NASDAQ', AMD: 'NASDAQ',
  INTC: 'NASDAQ', CSCO: 'NASDAQ', QCOM: 'NASDAQ', INTU: 'NASDAQ', AMAT: 'NASDAQ',
  SOXX: 'NASDAQ', ADI: 'NASDAQ', APP: 'NASDAQ', CEG: 'NASDAQ', HOOD: 'NASDAQ',
  SPY: 'AMEX', VOO: 'AMEX', IVV: 'AMEX', DIA: 'AMEX', IWM: 'AMEX', VTI: 'AMEX',
  GLD: 'AMEX', SLV: 'AMEX', HYG: 'AMEX', LQD: 'AMEX', EEM: 'AMEX', ARKK: 'AMEX',
  TLT: 'NASDAQ', JPM: 'NYSE', V: 'NYSE', JNJ: 'NYSE', WMT: 'NYSE', XOM: 'NYSE',
};

function getTVSymbol(sym: string) {
  const s = sym.toUpperCase();
  return TV_EXCHANGE[s] ? `${TV_EXCHANGE[s]}:${s}` : s;
}

// ── TradingView 뉴스 타임라인 위젯 ──
function TVTimeline() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      feedMode: 'market',
      market: 'stock',
      isTransparent: true,
      displayMode: 'regular',
      width: '100%',
      height: '100%',
      colorTheme: 'dark',
      locale: 'en',
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.height = '100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    wrapper.appendChild(inner);
    wrapper.appendChild(script);
    ref.current.appendChild(wrapper);

    return () => { if (ref.current) ref.current.innerHTML = ''; };
  }, []);

  return <div ref={ref} className="h-full w-full" />;
}

// ── TradingView Hotlists 위젯 ──
function TVHotlists() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-hotlists.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: 'dark',
      dateRange: '1M',
      exchange: 'US',
      showSymbolLogo: true,
      isTransparent: true,
      width: '100%',
      height: '100%',
      locale: 'en',
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.height = '100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    wrapper.appendChild(inner);
    wrapper.appendChild(script);
    ref.current.appendChild(wrapper);

    return () => { if (ref.current) ref.current.innerHTML = ''; };
  }, []);

  return <div ref={ref} className="h-full w-full" />;
}

// ── TradingView Advanced Chart (종목 상세) ──
function TVChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: getTVSymbol(symbol),
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

  return <div ref={ref} className="h-full w-full" />;
}

// ── TradingView Symbol Info ──
function TVSymbolInfo({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: getTVSymbol(symbol),
      width: '100%',
      isTransparent: true,
      colorTheme: 'dark',
      locale: 'en',
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.width = '100%';
    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    wrapper.appendChild(inner);
    wrapper.appendChild(script);
    ref.current.appendChild(wrapper);

    return () => { if (ref.current) ref.current.innerHTML = ''; };
  }, [symbol]);

  return <div ref={ref} className="w-full" />;
}

// ── 메인 ──
export default function StocksPage() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setFavorites(loadFavorites()); }, []);

  const toggleFav = useCallback((sym: string) => {
    setFavorites(prev => {
      const next = prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym];
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleSearch = () => {
    const sym = search.trim().toUpperCase();
    if (sym) setActiveSymbol(sym);
  };

  // 종목 상세 보기
  if (activeSymbol) {
    const isFav = favorites.includes(activeSymbol);
    return (
      <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setActiveSymbol(null)}>
            <HugeiconsIcon icon={ArrowLeft02Icon} className="mr-1 h-4 w-4" strokeWidth={2} />
            돌아가기
          </Button>
          <span className="text-lg font-mono font-bold">{activeSymbol}</span>
          <button
            onClick={() => toggleFav(activeSymbol)}
            className={`transition-colors ${isFav ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
          >
            <HugeiconsIcon icon={FavouriteIcon} className="h-5 w-5" strokeWidth={isFav ? 3 : 2} />
          </button>
          <Badge variant={isFav ? 'default' : 'outline'} className="text-xs">
            {isFav ? '즐겨찾기됨' : '즐겨찾기 추가'}
          </Badge>
        </div>

        {/* Symbol Info */}
        <TVSymbolInfo symbol={activeSymbol} />

        {/* 차트 */}
        <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden">
          <TVChart symbol={activeSymbol} />
        </div>
      </div>
    );
  }

  // 메인 (검색 + 뉴스)
  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      {/* 검색 바 */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">종목 열람</h1>
        <div className="relative ml-auto flex-1 max-w-md">
          <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="종목 검색 (예: AAPL, NVDA, QQQ)"
            className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
        </div>
        <Button size="sm" onClick={handleSearch} disabled={!search.trim()}>
          검색
        </Button>
        <Button
          size="sm"
          variant={showFavorites ? 'default' : 'outline'}
          onClick={() => setShowFavorites(!showFavorites)}
          className={showFavorites ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
        >
          <HugeiconsIcon icon={FavouriteIcon} className="mr-1 h-3.5 w-3.5" strokeWidth={showFavorites ? 3 : 2} />
          관심종목 ({favorites.length})
        </Button>
      </div>

      {/* 관심종목 패널 */}
      {showFavorites && (
        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <HugeiconsIcon icon={FavouriteIcon} className="h-4 w-4 text-red-500" strokeWidth={3} />
              관심종목
            </CardTitle>
          </CardHeader>
          <CardContent>
            {favorites.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                종목 검색 후 하트를 눌러 관심종목을 추가하세요
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {favorites.map(sym => (
                  <Button
                    key={sym}
                    variant="outline"
                    size="sm"
                    onClick={() => { setActiveSymbol(sym); setShowFavorites(false); }}
                    className="gap-1.5"
                  >
                    <span className="font-mono font-bold">{sym}</span>
                    <button
                      onClick={e => { e.stopPropagation(); toggleFav(sym); }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 뉴스 + 인기 종목 */}
      <div className="flex flex-1 min-h-0 gap-4">
        {/* 뉴스 타임라인 */}
        <Card size="sm" className="flex-1 min-h-0">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">주식 뉴스</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-3rem)] p-0">
            <TVTimeline />
          </CardContent>
        </Card>

        {/* 인기 종목 */}
        <Card size="sm" className="w-80 shrink-0 min-h-0 hidden lg:flex lg:flex-col">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">인기 종목</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-3rem)] p-0">
            <TVHotlists />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
