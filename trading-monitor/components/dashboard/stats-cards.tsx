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
  const [calcInput, setCalcInput] = useState('');
  const [calcMode, setCalcMode] = useState<'usd_to_krw' | 'krw_to_usd'>('usd_to_krw');

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
            {exchangeRate > 0 && (
              <p className={`text-xs ${isPnlPositive ? 'text-green-400/70' : 'text-red-400/70'}`}>
                ≈ {isPnlPositive ? '+' : ''}{formatKRW(pnl * exchangeRate)}
              </p>
            )}
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

        {/* 환율 계산기 */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">환율 계산기</CardTitle>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${kisConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-muted-foreground">
                {exchangeRate > 0 ? `₩${exchangeRate.toLocaleString()}/USD` : '-'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setCalcMode(m => m === 'usd_to_krw' ? 'krw_to_usd' : 'usd_to_krw'); setCalcInput(''); }}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs font-mono bg-muted text-foreground hover:bg-accent transition-colors"
              >
                {calcMode === 'usd_to_krw' ? 'USD→KRW' : 'KRW→USD'}
              </button>
              <input
                type="number"
                value={calcInput}
                onChange={e => setCalcInput(e.target.value)}
                placeholder={calcMode === 'usd_to_krw' ? 'USD' : 'KRW'}
                className="w-full rounded bg-background border border-border px-2 py-1 text-xs font-mono tabular-nums text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div className="text-right text-sm font-semibold tabular-nums">
              {calcInput && exchangeRate > 0
                ? calcMode === 'usd_to_krw'
                  ? formatKRW(parseFloat(calcInput) * exchangeRate)
                  : formatUSD(parseFloat(calcInput) / exchangeRate)
                : <span className="text-muted-foreground text-xs">금액을 입력하세요</span>
              }
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                KIS {kisConnected ? '연결' : '미연결'} · {status.mode === 'paper' ? '모의' : '실투자'}
              </span>
              <button
                onClick={handleReset}
                disabled={resetLoading}
                className="rounded border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              >
                {resetLoading ? '...' : '리셋'}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {resetMessage && (
        <div className="rounded-md bg-muted border border-border px-4 py-2 text-sm text-foreground">
          {resetMessage}
        </div>
      )}
    </div>
  );
}
