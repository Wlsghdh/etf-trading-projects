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
  DEBUG: 'text-neutral-500',
  INFO: 'text-amber-600',
  WARNING: 'text-amber-500',
  ERROR: 'text-red-500',
};

function getStatusBadge(status: string) {
  switch (status.toUpperCase()) {
    case 'SUCCESS':
      return <Badge className="bg-amber-900/30 text-amber-400 border border-amber-700/40 text-[10px] uppercase tracking-wider">Filled</Badge>;
    case 'FAILED':
      return <Badge className="bg-red-950/40 text-red-400 border border-red-800/40 text-[10px] uppercase tracking-wider">Failed</Badge>;
    case 'PENDING':
      return <Badge className="bg-amber-950/30 text-amber-300 border border-amber-700/30 text-[10px] uppercase tracking-wider">Pending</Badge>;
    case 'UNFILLED':
      return <Badge className="bg-neutral-900/50 text-neutral-400 border border-neutral-700/40 text-[10px] uppercase tracking-wider">Unfilled</Badge>;
    case 'CANCELLED':
      return <Badge className="bg-neutral-900/50 text-neutral-500 border border-neutral-700/30 text-[10px] uppercase tracking-wider">Cancelled</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

function getOrderTypeBadge(orderType: string) {
  if (orderType.includes('SELL')) {
    return <span className="font-mono text-xs font-semibold text-red-400">SELL</span>;
  }
  if (orderType === 'BUY_FIXED') {
    return <span className="font-mono text-xs font-semibold text-amber-400">BUY<sup className="text-[8px] text-amber-600">F</sup></span>;
  }
  return <span className="font-mono text-xs font-semibold text-emerald-400">BUY</span>;
}

function formatDateTime(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${month}.${day} ${hour}:${min}`;
}

// --- 로그 뷰어 ---
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
      if (res.ok) { const data = await res.json(); setLogs(data.logs || []); }
    } catch {}
  }, [logLevel, logLimit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useInterval(fetchLogs, autoRefresh ? 5000 : null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const fmtTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <Card className="border-amber-900/20 bg-neutral-950/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium tracking-wide text-amber-200/80">
            Trading Service Log
          </CardTitle>
          <div className="flex items-center gap-2">
            {(['ALL', 'INFO', 'WARNING', 'ERROR'] as LogLevelFilter[]).map(l => (
              <button key={l} onClick={() => setLogLevel(l)}
                className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
                  logLevel === l ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40' : 'text-neutral-500 hover:text-neutral-300'
                }`}>{l}</button>
            ))}
            <button onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded font-mono ${
                autoRefresh ? 'bg-amber-900/30 text-amber-400' : 'text-neutral-600'
              }`}>{autoRefresh ? 'LIVE' : 'PAUSED'}</button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t border-amber-900/20">
          <div ref={containerRef} onScroll={handleScroll}
            className="h-[300px] overflow-y-auto bg-neutral-950 p-3 font-mono text-[11px]">
            {logs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-neutral-600">No logs</div>
            ) : (
              <div className="space-y-0">
                {[...logs].reverse().map(log => (
                  <div key={log.id} className={`flex gap-2 py-px ${log.level === 'ERROR' ? 'bg-red-950/20' : ''}`}>
                    <span className="text-neutral-700 shrink-0">{fmtTime(log.timestamp)}</span>
                    <span className={`shrink-0 w-14 ${LEVEL_COLORS[log.level] || 'text-neutral-500'}`}>{log.level}</span>
                    {log.symbol && <span className="text-amber-700 shrink-0">[{log.symbol}]</span>}
                    <span className="text-neutral-400">{log.message}</span>
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

function formatKRW(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만`;
  return `${v.toLocaleString()}원`;
}

export default function OrderLogsPage() {
  const [orders, setOrders] = useState<KISOrderLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [exchangeRate, setExchangeRate] = useState(0);
  const pageSize = 50;

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      const res = await fetch(`${API_ENDPOINTS.ORDER_LOGS}?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch { setOrders([]); }
    finally { setIsLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    fetchOrders();
    fetch(API_ENDPOINTS.BALANCE).then(r => r.json()).then(d => setExchangeRate(d.exchange_rate || 0)).catch(() => {});
  }, [fetchOrders]);

  useInterval(fetchOrders, 10000);

  // 통계
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter(o => o.createdAt.slice(0, 10) === todayStr);
  const successCount = todayOrders.filter(o => o.status === 'SUCCESS').length;
  const failedCount = todayOrders.filter(o => o.status === 'FAILED').length;
  const pendingCount = todayOrders.filter(o => o.status === 'PENDING').length;
  const unfilledCount = todayOrders.filter(o => o.status === 'UNFILLED').length;

  const todayTotalUSD = todayOrders
    .filter(o => o.status === 'SUCCESS')
    .reduce((sum, o) => sum + ((o.price || o.limitPrice || 0) * o.quantity), 0);

  const totalPages = Math.ceil(total / pageSize);
  const filterOptions: StatusFilter[] = ['ALL', 'SUCCESS', 'FAILED', 'PENDING', 'UNFILLED'];

  return (
    <div className="space-y-5">
      {/* 통계 카드 - 잭다니엘 스타일 */}
      <div className="grid gap-3 md:grid-cols-5">
        {[
          { label: 'Filled', value: successCount, color: 'text-amber-400', border: 'border-amber-900/30' },
          { label: 'Failed', value: failedCount, color: 'text-red-400', border: 'border-red-900/30' },
          { label: 'Pending', value: pendingCount, color: 'text-amber-300', border: 'border-amber-800/20' },
          { label: 'Unfilled', value: unfilledCount, color: 'text-neutral-400', border: 'border-neutral-800/30' },
          { label: 'Volume', value: null, color: 'text-amber-200', border: 'border-amber-900/20' },
        ].map((stat, i) => (
          <Card key={i} className={`${stat.border} bg-neutral-950/50`}>
            <CardContent className="pt-4 pb-3">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">{stat.label}</div>
              {stat.value !== null ? (
                <div className={`text-2xl font-light font-mono ${stat.color}`}>{stat.value}</div>
              ) : (
                <div>
                  <div className="text-lg font-light font-mono text-amber-200">
                    ${todayTotalUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                  {exchangeRate > 0 && (
                    <div className="text-[10px] text-neutral-600">{formatKRW(todayTotalUSD * exchangeRate)}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 실시간 로그 */}
      <TradingLogViewer />

      {/* 주문 테이블 */}
      <Card className="border-amber-900/20 bg-neutral-950/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-wide text-amber-200/80">
              Order History
              <span className="ml-2 text-[10px] text-neutral-600 font-normal">{total} orders</span>
            </CardTitle>
            <div className="flex items-center gap-1">
              {filterOptions.map(f => (
                <button key={f} onClick={() => { setStatusFilter(f); setPage(1); }}
                  className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
                    statusFilter === f
                      ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}>
                  {f === 'ALL' ? 'All' : f}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-neutral-600 text-sm">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-neutral-600 text-sm">No orders found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-amber-900/20 hover:bg-transparent">
                      <TableHead className="w-[50px] text-[10px] uppercase tracking-widest text-neutral-600">#</TableHead>
                      <TableHead className="w-[60px] text-[10px] uppercase tracking-widest text-neutral-600">Side</TableHead>
                      <TableHead className="w-[70px] text-[10px] uppercase tracking-widest text-neutral-600">Symbol</TableHead>
                      <TableHead className="w-[50px] text-right text-[10px] uppercase tracking-widest text-neutral-600">Qty</TableHead>
                      <TableHead className="w-[100px] text-right text-[10px] uppercase tracking-widest text-neutral-600">Price</TableHead>
                      <TableHead className="w-[80px] text-[10px] uppercase tracking-widest text-neutral-600">Status</TableHead>
                      <TableHead className="w-[100px] text-[10px] uppercase tracking-widest text-neutral-600">Time</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-widest text-neutral-600">Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map(order => {
                      const isFailed = order.status === 'FAILED';
                      const isSuccess = order.status === 'SUCCESS';
                      return (
                        <TableRow key={order.id}
                          className={`border-amber-900/10 transition-colors ${
                            isFailed ? 'bg-red-950/15 hover:bg-red-950/25' :
                            isSuccess ? 'hover:bg-amber-950/20' :
                            'hover:bg-neutral-900/50'
                          }`}>
                          <TableCell className="font-mono text-[11px] text-neutral-600">{order.id}</TableCell>
                          <TableCell>{getOrderTypeBadge(order.orderType)}</TableCell>
                          <TableCell className="font-mono font-semibold text-sm text-amber-100">{order.etfCode}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-neutral-300">{order.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {order.price != null && order.price > 0 ? (
                              <div>
                                <span className={isSuccess ? 'text-amber-200' : 'text-neutral-400'}>
                                  ${order.price.toFixed(2)}
                                </span>
                                {exchangeRate > 0 && (
                                  <div className="text-[10px] text-neutral-700">{formatKRW(order.price * exchangeRate)}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-neutral-700">-</span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell className="font-mono text-[11px] text-neutral-500">{formatDateTime(order.createdAt)}</TableCell>
                          <TableCell className="text-[11px] max-w-[250px] truncate">
                            {isFailed ? (
                              <span className="text-red-400/80">{order.errorMessage || 'Unknown error'}</span>
                            ) : order.retryCount > 0 ? (
                              <span className="text-amber-700">Retry x{order.retryCount}</span>
                            ) : order.orderId ? (
                              <span className="text-neutral-700 font-mono">{order.orderId}</span>
                            ) : ''}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-amber-900/10">
                  <span className="text-[11px] text-neutral-600 font-mono">
                    {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-3 py-1.5 text-[10px] uppercase tracking-wider rounded bg-neutral-900 text-neutral-400 hover:text-amber-300 disabled:opacity-30 transition-colors">
                      Prev
                    </button>
                    <span className="px-2 text-[11px] text-neutral-600 font-mono">{page}/{totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-3 py-1.5 text-[10px] uppercase tracking-wider rounded bg-neutral-900 text-neutral-400 hover:text-amber-300 disabled:opacity-30 transition-colors">
                      Next
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
