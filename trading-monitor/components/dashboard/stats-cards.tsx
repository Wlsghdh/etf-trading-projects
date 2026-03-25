'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Money03Icon,
  ChartLineData02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from '@hugeicons/core-free-icons';
import type { TradingStatus, BalanceInfo, PortfolioResponse } from '@/lib/types';
import { API_ENDPOINTS } from '@/lib/constants';

interface StatsCardsProps {
  status: TradingStatus;
}

function formatUSD(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatKRW(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`;
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}

export function StatsCards({ status }: StatsCardsProps) {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [balRes, portRes] = await Promise.all([
        fetch(API_ENDPOINTS.BALANCE),
        fetch(API_ENDPOINTS.PORTFOLIO),
      ]);
      if (balRes.ok) setBalance(await balRes.json());
      if (portRes.ok) setPortfolio(await portRes.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleReset() {
    if (!confirm('사이클을 리셋하시겠습니까?')) return;
    setResetLoading(true);
    setResetMessage(null);
    try {
      const res = await fetch(API_ENDPOINTS.RESET, { method: 'POST' });
      const data = await res.json();
      setResetMessage(data.message);
      fetchData();
    } catch { setResetMessage('리셋 실패'); }
    finally { setResetLoading(false); }
  }

  const cashUSD = balance?.available_cash_usd ?? 0;
  const cashKRW = balance?.available_cash_krw ?? 0;
  const totalUSD = balance?.total_evaluation_usd ?? 0;
  const totalKRW = balance?.total_evaluation_krw ?? 0;
  const exchangeRate = balance?.exchange_rate ?? 0;
  const kisConnected = balance?.kis_connected ?? false;

  const pnl = portfolio?.totalProfitLoss ?? 0;
  const pnlPct = portfolio?.totalProfitLossPercent ?? 0;
  const invested = portfolio?.totalInvestment ?? 0;
  const currentVal = portfolio?.totalCurrentValue ?? 0;
  const isPnlPositive = pnl >= 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* 주문 가능 */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">주문 가능</CardTitle>
            <HugeiconsIcon icon={Money03Icon} className="h-4 w-4 text-green-500" strokeWidth={2} />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-semibold">{formatUSD(cashUSD)}</div>
            <p className="text-xs text-muted-foreground">≈ {formatKRW(cashKRW)}</p>
          </CardContent>
        </Card>

        {/* 총 자산 */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 자산</CardTitle>
            <HugeiconsIcon icon={ChartLineData02Icon} className="h-4 w-4 text-blue-500" strokeWidth={2} />
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-semibold">{formatUSD(totalUSD)}</div>
            <p className="text-xs text-muted-foreground">≈ {formatKRW(totalKRW)}</p>
          </CardContent>
        </Card>

        {/* 누적 수익률 */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">누적 수익률</CardTitle>
            <span className={`text-xs font-medium ${isPnlPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPnlPositive ? '▲' : '▼'}
            </span>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className={`text-2xl font-semibold ${isPnlPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPnlPositive ? '+' : ''}{pnlPct.toFixed(2)}%
            </div>
            <p className={`text-xs ${isPnlPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPnlPositive ? '+' : ''}{formatUSD(pnl)}
            </p>
          </CardContent>
        </Card>

        {/* 매수/매도 */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">오늘 매수/매도</CardTitle>
            <div className="flex gap-1">
              <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4 text-red-500" strokeWidth={2} />
              <HugeiconsIcon icon={ArrowUp01Icon} className="h-4 w-4 text-cyan-500" strokeWidth={2} />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-semibold">
              <span className="text-red-400">{status.todayBuyCount}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-cyan-400">{status.todaySellCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">보유 {status.holdingsCount}종목</p>
          </CardContent>
        </Card>

        {/* 환율 + 관리 */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">환율 / 관리</CardTitle>
            <span className={`h-2 w-2 rounded-full ${kisConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-semibold tabular-nums">
                {exchangeRate > 0 ? `₩${exchangeRate.toLocaleString()}` : '-'}
              </span>
              <span className="text-xs text-muted-foreground">/USD</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>KIS {kisConnected ? '연결됨' : '미연결'}</span>
              <span>·</span>
              <span>{status.mode === 'paper' ? '모의' : '실투자'}</span>
            </div>
            <button
              onClick={handleReset}
              disabled={resetLoading}
              className="w-full mt-1 rounded-md border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
            >
              {resetLoading ? '리셋 중...' : '사이클 리셋'}
            </button>
          </CardContent>
        </Card>
      </div>

      {resetMessage && (
        <div className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
          {resetMessage}
        </div>
      )}
    </div>
  );
}
