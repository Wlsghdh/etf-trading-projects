'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PortfolioResponse } from '@/lib/types';

interface PortfolioSummaryProps {
  portfolio: PortfolioResponse;
}

function formatUSD(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PortfolioSummary({ portfolio }: PortfolioSummaryProps) {
  const [showAll, setShowAll] = useState(false);
  const isPositive = portfolio.totalProfitLoss >= 0;
  const hasHoldings = portfolio.holdings.length > 0;

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              포트폴리오 요약
              {hasHoldings && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {portfolio.holdings.length}종목
                </span>
              )}
            </CardTitle>
            {hasHoldings && (
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-primary hover:underline"
              >
                전체 보기
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">총 투자금</span>
            <span className="text-sm font-medium tabular-nums">
              {formatUSD(portfolio.totalInvestment)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">현재 평가</span>
            <span className="text-sm font-medium tabular-nums">
              {formatUSD(portfolio.totalCurrentValue)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">총 손익</span>
            <span
              className={`text-sm font-semibold tabular-nums ${
                isPositive ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {isPositive ? '+' : ''}
              {formatUSD(portfolio.totalProfitLoss)} (
              {isPositive ? '+' : ''}
              {portfolio.totalProfitLossPercent.toFixed(2)}%)
            </span>
          </div>
          {hasHoldings && (
            <div className="border-t border-border pt-3 space-y-1.5">
              {portfolio.holdings.slice(0, 5).map((h) => (
                <div key={h.etfCode} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium w-12">{h.etfCode}</span>
                    <span className="text-muted-foreground">{h.quantity}주 @ {formatUSD(h.buyPrice)}</span>
                  </div>
                  <span
                    className={`font-medium tabular-nums ${
                      h.profitLossPercent >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {h.profitLossPercent >= 0 ? '+' : ''}
                    {h.profitLossPercent.toFixed(2)}%
                  </span>
                </div>
              ))}
              {portfolio.holdings.length > 5 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="text-[10px] text-primary hover:underline w-full text-center"
                >
                  외 {portfolio.holdings.length - 5}종목 더 보기
                </button>
              )}
            </div>
          )}
          {!hasHoldings && (
            <div className="text-xs text-muted-foreground text-center py-2">
              보유 종목 없음
            </div>
          )}
        </CardContent>
      </Card>

      {/* 전체 보기 모달 */}
      {showAll && (
        <PortfolioFullView
          portfolio={portfolio}
          onClose={() => setShowAll(false)}
        />
      )}
    </>
  );
}

function PortfolioFullView({ portfolio, onClose }: { portfolio: PortfolioResponse; onClose: () => void }) {
  const isPositive = portfolio.totalProfitLoss >= 0;

  // ESC 닫기
  if (typeof window !== 'undefined') {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    setTimeout(() => window.removeEventListener('keydown', handler), 0);
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
      <div className="p-6 max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">포트폴리오 상세</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {portfolio.holdings.length}종목 · 총 투자 {formatUSD(portfolio.totalInvestment)} ·
              <span className={isPositive ? ' text-green-400' : ' text-red-400'}>
                {' '}{isPositive ? '+' : ''}{formatUSD(portfolio.totalProfitLoss)} ({isPositive ? '+' : ''}{portfolio.totalProfitLossPercent.toFixed(2)}%)
              </span>
            </p>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted">
            ESC 닫기
          </button>
        </div>

        {/* 종목 리스트 */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">종목</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">수량</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">매수가</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">현재가</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">손익</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">수익률</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">매수일</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">D+</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.holdings.map((h, i) => {
                const pnl = h.profitLoss;
                const pnlPct = h.profitLossPercent;
                const isUp = pnl >= 0;
                return (
                  <tr key={h.etfCode} className={`border-t border-border/50 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                    <td className="py-2.5 px-4 font-mono font-medium">{h.etfCode}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{h.quantity}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">{formatUSD(h.buyPrice)}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {h.currentPrice !== h.buyPrice ? formatUSD(h.currentPrice) : <span className="text-muted-foreground">장 마감</span>}
                    </td>
                    <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                      {h.currentPrice !== h.buyPrice ? `${isUp ? '+' : ''}${formatUSD(pnl)}` : '-'}
                    </td>
                    <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                      {h.currentPrice !== h.buyPrice ? `${isUp ? '+' : ''}${pnlPct.toFixed(2)}%` : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">{h.buyDate}</td>
                    <td className="py-2.5 px-4 text-right text-xs text-muted-foreground">D+{h.dDay}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">총 투자금</div>
            <div className="text-lg font-bold tabular-nums">{formatUSD(portfolio.totalInvestment)}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">현재 평가</div>
            <div className="text-lg font-bold tabular-nums">{formatUSD(portfolio.totalCurrentValue)}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">총 손익</div>
            <div className={`text-lg font-bold tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}{formatUSD(portfolio.totalProfitLoss)}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">수익률</div>
            <div className={`text-lg font-bold tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}{portfolio.totalProfitLossPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-4">
          현재가는 미국 장 시간(22:30~05:00 KST)에만 실시간 조회됩니다. 장 마감 시 매수가로 표시됩니다.
        </p>
      </div>
    </div>
  );
}
