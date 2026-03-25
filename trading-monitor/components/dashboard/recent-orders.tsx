'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PriceChartPanel } from '@/components/chart/price-chart-panel';
import type { Order } from '@/lib/types';
import type { Holding } from '@/lib/types';

interface RecentOrdersProps {
  orders: Order[];
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  const handleOrderClick = (order: Order) => {
    // Create a Holding-like object from Order for the chart panel
    setSelectedHolding({
      etfCode: order.etfCode,
      etfName: order.etfName,
      quantity: order.quantity,
      buyPrice: order.price,
      currentPrice: order.price,
      buyDate: order.timestamp.split('T')[0],
      dDay: 0,
      profitLoss: 0,
      profitLossPercent: 0,
    });
  };

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">최근 주문 10건</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px]">
            <div className="space-y-3">
              {orders.slice(0, 10).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-md border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleOrderClick(order)}
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={order.side === 'BUY' ? 'default' : 'destructive'}
                      className="w-12 justify-center text-xs"
                    >
                      {order.side === 'BUY' ? '매수' : '매도'}
                    </Badge>
                    <div>
                      <div className="text-sm font-medium">{order.etfName}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.etfCode} · {order.quantity}주 · ${order.price.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={
                        order.status === 'success'
                          ? 'secondary'
                          : order.status === 'failed'
                          ? 'destructive'
                          : 'outline'
                      }
                      className="text-xs"
                    >
                      {order.status === 'success'
                        ? '성공'
                        : order.status === 'failed'
                        ? '실패'
                        : '대기'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.timestamp).toLocaleString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <PriceChartPanel
        holding={selectedHolding}
        onClose={() => setSelectedHolding(null)}
      />
    </>
  );
}
