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

function getUser(): string {
  if (typeof document === 'undefined') return 'User';
  const match = document.cookie.match(/(^| )user-name=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : 'User';
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
  TLT: 'NASDAQ', JPM: 'NYSE', V: 'NYSE', JNJ: 'NYSE', WMT: 'NYSE', XOM: 'NYSE',
};

function getTVSymbol(sym: string) {
  const s = sym.toUpperCase();
  return TV_EXCHANGE[s] ? `${TV_EXCHANGE[s]}:${s}` : s;
}

// ── Types ──

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: string;
  symbol?: string;
  goodCount: number;
  badCount: number;
  goodUsers: string[];
  badUsers: string[];
}

// ── TradingView Widgets ──

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

// ── 뉴스 카드 (Good/Bad 투표) ──

function NewsCard({ item, user, onVote }: {
  item: NewsItem;
  user: string;
  onVote: (newsId: string, action: 'good' | 'bad') => void;
}) {
  const totalVotes = item.goodCount + item.badCount;
  const sentiment = totalVotes > 0
    ? (item.goodCount - item.badCount) / totalVotes
    : 0;

  const userVotedGood = item.goodUsers.includes(user);
  const userVotedBad = item.badUsers.includes(user);

  // Save 앱 스타일: 투표 없으면 중립, good 많으면 초록 배경+테두리, bad 많으면 빨간 배경+테두리
  let cardStyle = 'border-border/40 bg-card'; // 기본 (투표 없음)
  if (totalVotes > 0) {
    if (sentiment > 0) {
      // 호재 (Good 우세) - 초록
      cardStyle = 'border-green-500 bg-green-500/8 shadow-[0_0_8px_rgba(34,197,94,0.15)]';
    } else if (sentiment < 0) {
      // 악재 (Bad 우세) - 빨강
      cardStyle = 'border-red-500 bg-red-500/8 shadow-[0_0_8px_rgba(239,68,68,0.15)]';
    } else {
      // 동률 - 노랑
      cardStyle = 'border-yellow-500/60 bg-yellow-500/5';
    }
  }

  const timeAgo = (dateStr: string) => {
    const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    return `${d}일 전`;
  };

  return (
    <div className={`rounded-lg border-2 ${cardStyle} p-3 transition-all duration-300`}>
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:text-primary line-clamp-2 leading-snug"
          >
            {item.title}
          </a>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{item.source}</span>
            <span>&#183;</span>
            <span>{timeAgo(item.pubDate)}</span>
            {item.symbol && (
              <>
                <span>&#183;</span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">${item.symbol}</Badge>
              </>
            )}
          </div>
        </div>

        {/* 투표 버튼 */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={() => onVote(item.id, 'good')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
              userVotedGood
                ? 'bg-green-500/20 text-green-400'
                : 'bg-muted text-muted-foreground hover:bg-green-500/10 hover:text-green-400'
            }`}
          >
            <span>&#128077;</span>
            <span>{item.goodCount}</span>
          </button>
          <button
            onClick={() => onVote(item.id, 'bad')}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
              userVotedBad
                ? 'bg-red-500/20 text-red-400'
                : 'bg-muted text-muted-foreground hover:bg-red-500/10 hover:text-red-400'
            }`}
          >
            <span>&#128078;</span>
            <span>{item.badCount}</span>
          </button>
        </div>
      </div>

      {/* 감성 바 */}
      {totalVotes > 0 && (
        <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${(item.goodCount / totalVotes) * 100}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${(item.badCount / totalVotes) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── 뉴스 패널 (Top Stories) ──

function NewsPanel({ symbol, user }: { symbol?: string; user: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (symbol) params.set('symbol', symbol);
      else params.set('category', 'market');

      const res = await fetch(`/trading/api/news?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setNews(data.news || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    fetchNews();
    // 1시간마다 갱신
    const interval = setInterval(fetchNews, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const handleVote = async (newsId: string, action: 'good' | 'bad') => {
    // 즉시 UI 업데이트 (optimistic)
    setNews(prev => prev.map(item => {
      if (item.id !== newsId) return item;
      const newItem = { ...item };
      if (action === 'good') {
        if (item.goodUsers.includes(user)) {
          newItem.goodUsers = item.goodUsers.filter(u => u !== user);
          newItem.goodCount--;
        } else {
          if (item.badUsers.includes(user)) {
            newItem.badUsers = item.badUsers.filter(u => u !== user);
            newItem.badCount--;
          }
          newItem.goodUsers = [...item.goodUsers, user];
          newItem.goodCount++;
        }
      } else {
        if (item.badUsers.includes(user)) {
          newItem.badUsers = item.badUsers.filter(u => u !== user);
          newItem.badCount--;
        } else {
          if (item.goodUsers.includes(user)) {
            newItem.goodUsers = item.goodUsers.filter(u => u !== user);
            newItem.goodCount--;
          }
          newItem.badUsers = [...item.badUsers, user];
          newItem.badCount++;
        }
      }
      return newItem;
    }));

    // 서버 업데이트
    await fetch('/trading/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, newsId, user }),
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        뉴스를 불러올 수 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {news.map(item => (
        <NewsCard key={item.id} item={item} user={user} onVote={handleVote} />
      ))}
    </div>
  );
}

// ── 메인 ──
export default function StocksPage() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [user, setUser] = useState('User');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFavorites(loadFavorites());
    setUser(getUser());
  }, []);

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

  // ── 종목 상세 보기 ──
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

        {/* 뉴스 + 차트 2단 레이아웃 */}
        <div className="flex flex-1 min-h-0 gap-3">
          {/* 차트 (메인) */}
          <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden">
            <TVChart symbol={activeSymbol} />
          </div>

          {/* 관련 뉴스 (사이드) */}
          <Card size="sm" className="w-96 shrink-0 min-h-0 hidden xl:flex xl:flex-col">
            <CardHeader className="border-b py-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {activeSymbol} 관련 뉴스
                <Badge variant="outline" className="text-[10px]">1h 갱신</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-3">
              <NewsPanel symbol={activeSymbol} user={user} />
            </CardContent>
          </Card>
        </div>

        {/* 모바일/태블릿에서 뉴스 (하단) */}
        <div className="xl:hidden">
          <Card size="sm">
            <CardHeader className="border-b py-2">
              <CardTitle className="text-sm">{activeSymbol} 관련 뉴스</CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto p-3">
              <NewsPanel symbol={activeSymbol} user={user} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── 메인 (검색 + 뉴스) ──
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

      {/* 뉴스 + TradingView 타임라인 + 인기 종목 */}
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Top Stories (Good/Bad 투표) */}
        <Card size="sm" className="flex-1 min-h-0">
          <CardHeader className="border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              Top Stories
              <Badge variant="outline" className="text-[10px]">1h 갱신</Badge>
              <span className="ml-auto text-[10px] text-muted-foreground font-normal">
                &#128077; Good / &#128078; Bad 투표로 민심을 확인하세요
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-3rem)] overflow-y-auto p-3">
            <NewsPanel user={user} />
          </CardContent>
        </Card>

        {/* TradingView 뉴스 타임라인 */}
        <Card size="sm" className="flex-1 min-h-0 hidden lg:flex lg:flex-col">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">실시간 마켓 뉴스</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-3rem)] p-0">
            <TVTimeline />
          </CardContent>
        </Card>

        {/* 인기 종목 */}
        <Card size="sm" className="w-72 shrink-0 min-h-0 hidden xl:flex xl:flex-col">
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
