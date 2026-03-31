'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { API_ENDPOINTS } from '@/lib/constants';
import { KISOrderLog } from '@/lib/types';
import { useInterval } from '@/hooks/use-interval';

type StatusFilter = 'ALL' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNFILLED';

function getStatusBadge(status: string) {
  switch (status.toUpperCase()) {
    case 'SUCCESS':
      return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">체결</Badge>;
    case 'FAILED':
      return <Badge variant="destructive">실패</Badge>;
    case 'PENDING':
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">대기중</Badge>;
    case 'UNFILLED':
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">미체결</Badge>;
    case 'CANCELLED':
      return <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20">취소</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getOrderTypeBadge(orderType: string) {
  if (orderType.includes('SELL')) {
    return <Badge variant="destructive" className="bg-red-500/10 text-red-400 border-red-500/20">SELL</Badge>;
  }
  if (orderType === 'BUY_FIXED') {
    return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">BUY (QQQ)</Badge>;
  }
  return <Badge className="bg-green-500/10 text-green-400 border-green-500/20">BUY</Badge>;
}

function formatDateTime(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${month}/${day} ${hour}:${min}:${sec}`;
}

export default function OrderLogsPage() {
  const [orders, setOrders] = useState<KISOrderLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await fetch(`${API_ENDPOINTS.ORDER_LOGS}?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch {
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    fetchOrders();
  }, [fetchOrders]);

  useInterval(fetchOrders, 10000);

  // 통계 계산
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter(o => o.createdAt.slice(0, 10) === todayStr);
  const successCount = todayOrders.filter(o => o.status === 'SUCCESS').length;
  const failedCount = todayOrders.filter(o => o.status === 'FAILED').length;
  const pendingCount = todayOrders.filter(o => o.status === 'PENDING').length;
  const unfilledCount = todayOrders.filter(o => o.status === 'UNFILLED').length;

  const totalPages = Math.ceil(total / pageSize);
  const filterOptions: StatusFilter[] = ['ALL', 'SUCCESS', 'FAILED', 'PENDING', 'UNFILLED'];

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">오늘 체결</div>
            <div className="text-2xl font-bold text-green-500">{successCount}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">오늘 실패</div>
            <div className="text-2xl font-bold text-red-500">{failedCount}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">대기중 (지정가)</div>
            <div className="text-2xl font-bold text-yellow-500">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">미체결 이월</div>
            <div className="text-2xl font-bold text-orange-500">{unfilledCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 + 테이블 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              KIS 주문 로그 ({total}건)
            </CardTitle>
            <div className="flex items-center gap-1">
              {filterOptions.map(f => (
                <button
                  key={f}
                  onClick={() => { setStatusFilter(f); setPage(1); }}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    statusFilter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {f === 'ALL' ? '전체' : f}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              로딩 중...
            </div>
          ) : orders.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              주문 로그가 없습니다
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">ID</TableHead>
                      <TableHead className="w-[80px]">유형</TableHead>
                      <TableHead className="w-[80px]">종목</TableHead>
                      <TableHead className="w-[60px] text-right">수량</TableHead>
                      <TableHead className="w-[90px] text-right">지정가</TableHead>
                      <TableHead className="w-[90px] text-right">체결가</TableHead>
                      <TableHead className="w-[80px]">상태</TableHead>
                      <TableHead className="w-[90px]">KIS 주문번호</TableHead>
                      <TableHead className="w-[120px]">시간</TableHead>
                      <TableHead>비고</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map(order => (
                      <TableRow key={order.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {order.id}
                        </TableCell>
                        <TableCell>{getOrderTypeBadge(order.orderType)}</TableCell>
                        <TableCell className="font-mono font-semibold text-sm">
                          {order.etfCode}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {order.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {order.limitPrice != null ? `$${order.limitPrice.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {order.price != null ? `$${order.price.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {order.orderId || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDateTime(order.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {order.errorMessage || (order.retryCount > 0 ? `재시도 ${order.retryCount}회` : '')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <span className="text-xs text-muted-foreground">
                    {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} / {total}건
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 disabled:opacity-50"
                    >
                      이전
                    </button>
                    <span className="px-2 text-xs text-muted-foreground">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 disabled:opacity-50"
                    >
                      다음
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
