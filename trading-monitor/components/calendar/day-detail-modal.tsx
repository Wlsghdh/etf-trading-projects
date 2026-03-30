'use client';

import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DailySummary } from '@/lib/types';

interface DayDetailModalProps {
  summary: DailySummary;
  onClose: () => void;
}

function formatUSD(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(ts: string) {
  if (!ts) return '';
  const d = new Date(ts);
  // UTC → KST (+9)
  d.setHours(d.getHours() + 9);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function DayDetailModal({ summary, onClose }: DayDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const buyTrades = summary.trades.filter(t => t.side === 'BUY');
  const sellTrades = summary.trades.filter(t => t.side === 'SELL');
  const totalBuyAmount = buyTrades.reduce((s, t) => s + t.price * t.quantity, 0);
  const totalSellAmount = sellTrades.reduce((s, t) => s + t.price * t.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto" onClick={onClose}>
      <div className="p-6 max-w-3xl mx-auto" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">
              {new Date(summary.date + 'T00:00:00').toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
              })}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">일일 매매 내역</p>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted">
            ESC 닫기
          </button>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase">매수</div>
              <div className="text-lg font-bold text-red-400">{summary.buyCount}건</div>
              <div className="text-xs text-muted-foreground tabular-nums">{formatUSD(totalBuyAmount)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase">매도</div>
              <div className="text-lg font-bold text-cyan-400">{summary.sellCount}건</div>
              <div className="text-xs text-muted-foreground tabular-nums">{formatUSD(totalSellAmount)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase">총 거래</div>
              <div className="text-lg font-bold">{summary.trades.length}건</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase">손익</div>
              <div className={`text-lg font-bold ${summary.totalProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {summary.totalProfitLoss >= 0 ? '+' : ''}{formatUSD(summary.totalProfitLoss)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 매수 내역 */}
        {buyTrades.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Badge variant="default" className="text-xs">매수</Badge>
              {buyTrades.length}건
            </h3>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">종목</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">수량</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">매수가</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">매수금액</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">시간</th>
                  </tr>
                </thead>
                <tbody>
                  {buyTrades.map((t) => (
                    <tr key={t.id} className="border-t border-border/50">
                      <td className="py-2 px-3 font-mono font-medium">{t.etfCode}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{t.quantity}주</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatUSD(t.price)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatUSD(t.price * t.quantity)}</td>
                      <td className="py-2 px-3 text-right text-xs text-muted-foreground">{formatTime(t.executedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 매도 내역 */}
        {sellTrades.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Badge variant="destructive" className="text-xs">매도</Badge>
              {sellTrades.length}건
            </h3>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">종목</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">수량</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">매도가</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">손익</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">수익률</th>
                  </tr>
                </thead>
                <tbody>
                  {sellTrades.map((t) => {
                    const pnl = t.profitLoss || 0;
                    const isUp = pnl >= 0;
                    return (
                      <tr key={t.id} className="border-t border-border/50">
                        <td className="py-2 px-3 font-mono font-medium">{t.etfCode}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{t.quantity}주</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatUSD(t.price)}</td>
                        <td className={`py-2 px-3 text-right tabular-nums font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                          {isUp ? '+' : ''}{formatUSD(pnl)}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                          {isUp ? '+' : ''}{(t.profitLossPercent || 0).toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {summary.trades.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            이 날 매매 내역이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
