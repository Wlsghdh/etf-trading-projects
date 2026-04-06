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

export async function GET() {
  try {
    // orders + purchases 둘 다 가져와서 가격 보정
    const [ordersRes, portRes] = await Promise.all([
      fetch(`${TRADING_SERVICE_URL}/api/trading/orders`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${TRADING_SERVICE_URL}/api/trading/portfolio`, { signal: AbortSignal.timeout(5000) }),
    ]);

    if (!ordersRes.ok) throw new Error('orders fetch failed');

    const ordersData = await ordersRes.json();
    const orders = ordersData.orders || [];

    // purchases에서 가격 매핑 만들기
    const purchasePrices: Record<string, number> = {};
    if (portRes.ok) {
      const portData = await portRes.json();
      for (const p of portData.holdings || []) {
        if (p.etf_code && p.price > 0) {
          purchasePrices[p.etf_code] = p.price;
        }
      }
    }

    // DB 최신 종가도 조회 (추가 fallback)
    let dbPrices: Record<string, number> = {};
    try {
      const pricesRes = await fetch(`${TRADING_SERVICE_URL}/api/trading/prices`, { signal: AbortSignal.timeout(3000) });
      if (pricesRes.ok) dbPrices = await pricesRes.json();
    } catch { /* ignore */ }

    const result = orders.map((o: Record<string, unknown>) => {
      const etfCode = (o.etf_code as string) || '';
      let price = (o.price as number) || 0;
      const limitPrice = (o.limit_price as number) || 0;

      // price가 0이면 다단계 fallback
      if (price <= 0) {
        if (limitPrice > 0) price = limitPrice;
        else if (purchasePrices[etfCode]) price = purchasePrices[etfCode];
        else if (dbPrices[etfCode]) price = dbPrices[etfCode];
      }

      return {
        id: String(o.id || ''),
        etfCode,
        etfName: etfCode,
        side: ((o.order_type as string) || '').includes('SELL') ? 'SELL' : 'BUY',
        quantity: (o.quantity as number) || 0,
        price,
        status: ((o.status as string) || '').toLowerCase() === 'success' ? 'success' : 'failed',
        timestamp: toKST((o.created_at as string) || ''),
        reason: (o.error_message as string) || undefined,
      };
    });

    console.log('[BFF] trading/orders: 실서비스 데이터 사용');
    return NextResponse.json(result);
  } catch (error) {
    console.log('[BFF] trading/orders: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json([]);
  }
}
