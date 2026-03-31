import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

function toKST(utc: string): string {
  if (!utc) return '';
  const d = new Date(utc);
  d.setHours(d.getHours() + 9);
  return d.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const pageSize = searchParams.get('page_size') || '100';
    const status = searchParams.get('status') || '';

    const params = new URLSearchParams({ page, page_size: pageSize });
    if (status) params.append('status', status);

    const res = await fetch(
      `${TRADING_SERVICE_URL}/api/trading/orders?${params.toString()}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) throw new Error('orders fetch failed');

    const data = await res.json();
    const orders = (data.orders || []).map((o: Record<string, unknown>) => ({
      id: o.id,
      cycleId: o.cycle_id,
      orderType: o.order_type,
      etfCode: o.etf_code,
      quantity: o.quantity,
      price: o.price,
      limitPrice: o.limit_price,
      orderId: o.order_id,
      status: o.status,
      errorMessage: o.error_message,
      retryCount: o.retry_count,
      createdAt: toKST((o.created_at as string) || ''),
    }));

    return NextResponse.json({
      orders,
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.page_size || 100,
    });
  } catch (error) {
    console.log('[BFF] order-logs: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ orders: [], total: 0, page: 1, pageSize: 100 });
  }
}
