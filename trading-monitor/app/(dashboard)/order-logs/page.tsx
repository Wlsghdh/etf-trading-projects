'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

// --- 로그 뷰어 타입 ---
interface TradingLogEntry {
  id: number;
  level: string;
  message: string;
  symbol: string | null;
  order_type: string | null;
  timestamp: string;
}

type LogLevelFilter = 'ALL' | 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-gray-500',
  INFO: 'text-green-400',
  WARNING: 'text-yellow-400',
  ERROR: 'text-red-400',
};

const LEVEL_BG: Record<string, string> = {
  ERROR: 'bg-red-500/5',
};

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

// --- 로그 뷰어 컴포넌트 ---
function TradingLogViewer() {
  const [logs, setLogs] = useState<TradingLogEntry[]>([]);
  const [logLevel, setLogLevel] = useState<LogLevelFilter>('ALL');
  const [logLimit, setLogLimit] = useState(200);
  const [autoScroll, setAutoScroll] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(logLimit) });
      if (logLevel !== 'ALL') params.append('level', logLevel);
      const res = await fetch(`${API_ENDPOINTS.TRADING_LOGS}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch { /* ignore */ }
  }, [logLevel, logLimit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useInterval(fetchLogs, autoRefresh ? 5000 : null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}:${ss}`;
  };

  const levelFilters: LogLevelFilter[] = ['ALL', 'INFO', 'WARNING', 'ERROR'];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Trading Service 실시간 로그
          </CardTitle>
          <div className="flex items-center gap-2">
            {levelFilters.map(l => (
              <button
                key={l}
                onClick={() => setLogLevel(l)}
                className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                  logLevel === l
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {l}
              </button>
            ))}
            <select
              value={logLimit}
              onChange={e => setLogLimit(Number(e.target.value))}
              className="text-xs bg-muted rounded px-1.5 py-0.5 border-0"
            >
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2 py-0.5 text-xs rounded-md font-mono ${
                autoRefresh
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {autoRefresh ? 'LIVE' : 'PAUSED'}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-hidden rounded-b-lg border-t border-border">
          {/* Terminal header */}
          <div className="flex items-center justify-between bg-[#161b22] px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
              </div>
              <span className="ml-2 text-xs text-gray-400 font-mono">
                trading-service logs
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{logs.length}건</span>
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-xs px-2 py-0.5 rounded font-mono ${
                  autoScroll
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {autoScroll ? 'AUTO' : 'SCROLL'}
              </button>
            </div>
          </div>
          {/* Log content */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="h-[400px] overflow-y-auto bg-[#0d1117] p-3 font-mono text-xs"
          >
            {logs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-500">
                표시할 로그가 없습니다
              </div>
            ) : (
              <div className="space-y-0">
                {[...logs].reverse().map(log => (
                  <div
                    key={log.id}
                    className={`flex gap-2 py-0.5 ${LEVEL_BG[log.level] || ''}`}
                  >
                    <span className="text-gray-600 shrink-0">
                      [{formatTime(log.timestamp)}]
                    </span>
                    <span className={`shrink-0 w-16 ${LEVEL_COLORS[log.level] || 'text-gray-300'}`}>
                      [{log.level?.padEnd(7)}]
                    </span>
                    {log.symbol && (
                      <span className="text-blue-400 shrink-0">
                        [{log.symbol}]
                      </span>
                    )}
                    <span className="text-gray-300">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

      {/* 실시간 로그 뷰어 */}
      <TradingLogViewer />

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
