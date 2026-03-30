'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { API_ENDPOINTS } from '@/lib/constants';
import type { BalanceInfo } from '@/lib/types';

function formatUSD(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatKRW(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`;
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}

export function KisApiStatus() {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [automation, setAutomation] = useState<{
    enabled: boolean;
    fractional_mode: boolean;
    scheduler_time: string;
    trading_mode: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [balRes, autoRes] = await Promise.all([
        fetch(API_ENDPOINTS.BALANCE),
        fetch(API_ENDPOINTS.AUTOMATION),
      ]);
      if (balRes.ok) setBalance(await balRes.json());
      if (autoRes.ok) setAutomation(await autoRes.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const connected = balance?.kis_connected ?? false;
  const cashUsd = balance?.available_cash_usd ?? 0;
  const totalUsd = balance?.total_evaluation_usd ?? 0;
  const hasBalance = cashUsd > 0 || totalUsd > 0;

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          KIS API
          <Badge
            variant={connected ? 'default' : 'destructive'}
            className="text-[10px]"
          >
            {connected ? '연결됨' : '미연결'}
          </Badge>
        </CardTitle>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? '조회 중...' : '새로고침'}
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 연결 상태 */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${
              connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {connected ? '한국투자증권 OpenAPI 연결' : 'API 연결 실패'}
            </span>
          </div>
          {balance?.error && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
              {balance.error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">거래 모드</span>
            <span className="text-right font-medium">
              {automation?.trading_mode === 'live' ? (
                <span className="text-red-400">실투자</span>
              ) : (
                <span className="text-blue-400">모의투자</span>
              )}
            </span>
            <span className="text-muted-foreground">자동매매</span>
            <span className="text-right font-medium">
              {automation?.enabled ? (
                <span className="text-green-400">활성</span>
              ) : (
                <span className="text-zinc-500">비활성</span>
              )}
            </span>
            <span className="text-muted-foreground">매매 방식</span>
            <span className="text-right font-medium">
              {automation?.fractional_mode ? '소수점' : '정수 (1주 단위)'}
            </span>
            <span className="text-muted-foreground">예약 시간</span>
            <span className="text-right font-medium tabular-nums">
              {automation?.scheduler_time || '-'}
            </span>
          </div>
        </div>

        {/* 잔고 정보 */}
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            계좌 잔고
          </h4>
          {!hasBalance && connected && !loading && (
            <div className="text-xs text-yellow-400 bg-yellow-500/10 rounded px-2 py-1.5">
              잔고를 조회할 수 없습니다. 새로고침을 눌러주세요.
            </div>
          )}
          {hasBalance && (
            <div className="text-xs text-green-400 bg-green-500/10 rounded px-2 py-1.5">
              주문 가능: ${cashUsd.toLocaleString()} · 총 자산: ${totalUsd.toLocaleString()}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase">주문 가능</div>
              <div className="text-sm font-semibold tabular-nums">
                {formatUSD(balance?.available_cash_usd ?? 0)}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                ≈ {formatKRW(balance?.available_cash_krw ?? 0)}
              </div>
            </div>
            <div className="rounded-md border border-border p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase">총 평가</div>
              <div className="text-sm font-semibold tabular-nums">
                {formatUSD(balance?.total_evaluation_usd ?? 0)}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                ≈ {formatKRW(balance?.total_evaluation_krw ?? 0)}
              </div>
            </div>
          </div>
        </div>

        {/* 환율 */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">USD/KRW 환율</span>
          <span className="font-medium tabular-nums">
            ₩{(balance?.exchange_rate ?? 0).toLocaleString()}
          </span>
        </div>

        {/* 보유 종목 */}
        {(balance?.holdings?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              보유 종목 ({balance!.holdings.length})
            </h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {balance!.holdings.map((h) => (
                <div key={h.code} className="flex items-center justify-between text-xs rounded border border-border px-2 py-1.5">
                  <div>
                    <span className="font-medium">{h.code}</span>
                    <span className="text-muted-foreground ml-1">{h.quantity}주</span>
                  </div>
                  <div className="text-right">
                    <span className="tabular-nums">${h.current_price.toFixed(2)}</span>
                    <span className={`ml-1 ${h.pnl_rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {h.pnl_rate >= 0 ? '+' : ''}{h.pnl_rate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
