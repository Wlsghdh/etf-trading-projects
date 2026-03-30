'use client';

import { useTradingStatus } from '@/hooks/use-trading-status';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useOrders } from '@/hooks/use-orders';
import { CycleIndicator } from '@/components/dashboard/cycle-indicator';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { AutomationStatus } from '@/components/dashboard/automation-status';
import { RecentOrders } from '@/components/dashboard/recent-orders';
import { PortfolioSummary } from '@/components/dashboard/portfolio-summary';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { data: status, isLoading: statusLoading } = useTradingStatus();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: orders, isLoading: ordersLoading } = useOrders();

  if (statusLoading || portfolioLoading || ordersLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
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
        <AutomationStatus status={status} onRefetch={async () => { /* refetch on next interval */ }} />
        <PortfolioSummary portfolio={portfolio} />
        <RecentOrders orders={orders} />
      </div>
    </div>
  );
}
