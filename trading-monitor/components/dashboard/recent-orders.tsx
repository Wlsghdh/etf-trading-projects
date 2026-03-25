'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SymbolDetailModal } from '@/components/model/symbol-detail-modal';
import type { Order } from '@/lib/types';

interface RecentOrdersProps {
  orders: Order[];
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<{
    symbol: string; price: number; score: number; rank: number; direction: string;
  } | null>(null);

  const handleOrderClick = (order: Order) => {
    setSelectedSymbol({
      symbol: order.etfCode,
      price: order.price,
      score: 0,
      rank: 0,
      direction: order.side === 'BUY' ? 'BUY' : 'SELL',
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

      {selectedSymbol && (
        <SymbolDetailModal
          symbol={selectedSymbol.symbol}
          currentPrice={selectedSymbol.price}
          score={selectedSymbol.score}
          rank={selectedSymbol.rank}
          direction={selectedSymbol.direction}
          onClose={() => setSelectedSymbol(null)}
        />
      )}
    </>
  );
}
