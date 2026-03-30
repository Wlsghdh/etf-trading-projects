'use client';

import { usePortfolio } from '@/hooks/use-portfolio';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsTable } from '@/components/portfolio/holdings-table';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Skeleton } from '@/components/ui/skeleton';

export default function PortfolioPage() {
  const { data: portfolio, isLoading } = usePortfolio();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!portfolio) return null;

  const isPositive = portfolio.totalProfitLoss >= 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 투자금
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {(portfolio.totalInvestment / 10000).toLocaleString()}
              <span className="text-base text-muted-foreground">만원</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              보유 종목 수
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              <NumberTicker value={portfolio.holdings.length} />
              <span className="text-base text-muted-foreground">개</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 손익
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-semibold ${
                isPositive ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {isPositive ? '+' : ''}
              {portfolio.totalProfitLoss.toLocaleString()}
              <span className="text-base">원</span>
              <span className="ml-2 text-sm">
                ({isPositive ? '+' : ''}
                {portfolio.totalProfitLossPercent}%)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">보유 종목</CardTitle>
        </CardHeader>
        <CardContent>
          <HoldingsTable holdings={portfolio.holdings} />
        </CardContent>
      </Card>
    </div>
  );
}
