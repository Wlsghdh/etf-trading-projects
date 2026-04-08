'use client';

import { useEffect, useState } from 'react';
import { useTradingStatus } from '@/hooks/use-trading-status';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useOrders } from '@/hooks/use-orders';
import { CycleIndicator } from '@/components/dashboard/cycle-indicator';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { AutomationStatus } from '@/components/dashboard/automation-status';
import { RecentOrders } from '@/components/dashboard/recent-orders';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}

export default function DashboardPage() {
  const [role, setRole] = useState('');
  useEffect(() => { setRole(getCookie('user-role')); }, []);

  const { data: status, isLoading: statusLoading } = useTradingStatus();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: orders, isLoading: ordersLoading } = useOrders();

  // 일반 유저: KIS 데이터 없으므로 빈 대시보드
  if (role && role !== 'admin') {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: '주문 가능', value: '-' },
            { label: '총 자산', value: '-' },
            { label: '누적 수익률', value: '-' },
            { label: '오늘 매수/매도', value: '0 / 0' },
          ].map((stat, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="text-2xl font-bold text-muted-foreground/50">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-sm">KIS 계좌가 연결되지 않은 계정입니다.</p>
            <p className="text-xs mt-1">멀티AI, 종목열람, 커뮤니티를 이용해보세요.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (statusLoading || portfolioLoading || ordersLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!status || !portfolio || !orders) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <CycleIndicator cycle={status.cycle} />
      </div>
      <StatsCards status={status} />
      <div className="grid gap-4 lg:grid-cols-3">
        <AutomationStatus status={status} onRefetch={async () => {}} />
        <PortfolioSummary portfolio={portfolio} />
        <RecentOrders orders={orders} />
      </div>
    </div>
  );
}
