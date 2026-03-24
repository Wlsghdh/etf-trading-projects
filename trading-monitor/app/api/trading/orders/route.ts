import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

function toKST(utc: string): string {
  if (!utc) return '';
  const d = new Date(utc);
  d.setHours(d.getHours() + 9);
  return d.toISOString();
}

function transformOrders(raw: Record<string, unknown>) {
  const orders = (raw.orders as Array<Record<string, unknown>>) || [];

  return orders.map((o) => ({
    id: String(o.id || ''),
    etfCode: (o.etf_code as string) || '',
    etfName: (o.etf_code as string) || '',
    side: ((o.order_type as string) || '').includes('SELL') ? 'SELL' : 'BUY',
    quantity: (o.quantity as number) || 0,
    price: (o.price as number) || 0,
    status: ((o.status as string) || '').toLowerCase() === 'success' ? 'success' : 'failed',
    timestamp: toKST((o.created_at as string) || ''),
    reason: (o.error_message as string) || undefined,
  }));
}

export async function GET() {
  try {
    const response = await fetch(`${TRADING_SERVICE_URL}/api/trading/orders`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[BFF] trading/orders: 실서비스 데이터 사용');
      return NextResponse.json(transformOrders(data));
    }
    throw new Error(`Trading service responded with ${response.status}`);
  } catch (error) {
    console.log('[BFF] trading/orders: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json([]);
  }
}
