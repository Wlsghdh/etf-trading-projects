'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PortfolioResponse } from '@/lib/types';

interface PortfolioSummaryProps {
  portfolio: PortfolioResponse;
}

function formatUSD(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PortfolioSummary({ portfolio }: PortfolioSummaryProps) {
  const isPositive = portfolio.totalProfitLoss >= 0;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          포트폴리오 요약
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {portfolio.holdings.length}종목
          </span>
        </CardTitle>
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
        {portfolio.holdings.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="space-y-1.5">
              {portfolio.holdings.slice(0, 5).map((h) => (
                <div key={h.etfCode} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{h.etfCode}</span>
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
                <div className="text-[10px] text-muted-foreground text-center">
                  외 {portfolio.holdings.length - 5}종목
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
