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

    // 주문 로그 + KIS 잔고(현재가) + 포트폴리오(매수가) 병렬 조회
    const [ordersRes, balanceRes, portRes, pricesRes] = await Promise.all([
      fetch(
        `${TRADING_SERVICE_URL}/api/trading/orders?${params.toString()}`,
        { signal: AbortSignal.timeout(5000) }
      ),
      fetch(`${TRADING_SERVICE_URL}/api/trading/balance`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
      fetch(`${TRADING_SERVICE_URL}/api/trading/portfolio`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
      fetch(`${TRADING_SERVICE_URL}/api/trading/prices`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    ]);

    if (!ordersRes.ok) throw new Error('orders fetch failed');

    const data = await ordersRes.json();

    // KIS 잔고에서 현재가 매핑 (code → current_price)
    const kisCurrentPrices: Record<string, number> = {};
    if (balanceRes && balanceRes.ok) {
      try {
        const balData = await balanceRes.json();
        for (const h of balData.holdings || []) {
          if (h.code && h.current_price > 0) {
            kisCurrentPrices[h.code] = h.current_price;
          }
          // avg_price도 fallback으로 저장
          if (h.code && h.avg_price > 0 && !kisCurrentPrices[h.code]) {
            kisCurrentPrices[h.code] = h.avg_price;
          }
        }
      } catch { /* ignore */ }
    }

    // 포트폴리오에서 매수가 매핑 (etf_code → price)
    const purchasePrices: Record<string, number> = {};
    if (portRes && portRes.ok) {
      try {
        const portData = await portRes.json();
        for (const p of portData.holdings || []) {
          if (p.etf_code && p.price > 0) {
            purchasePrices[p.etf_code] = p.price;
          }
        }
      } catch { /* ignore */ }
    }

    // DB 최신 종가 매핑
    const dbPrices: Record<string, number> = {};
    if (pricesRes && pricesRes.ok) {
      try {
        const prData = await pricesRes.json();
        for (const [sym, price] of Object.entries(prData)) {
          if (typeof price === 'number' && price > 0) {
            dbPrices[sym] = price;
          }
        }
      } catch { /* ignore */ }
    }

    const orders = (data.orders || []).map((o: Record<string, unknown>) => {
      const etfCode = (o.etf_code as string) || '';
      let price = (o.price as number) || null;
      const limitPrice = (o.limit_price as number) || null;
      const orderStatus = (o.status as string) || '';

      // 체결가 보정: price가 0이거나 null인 경우 fallback
      let resolvedPrice = price;
      let priceSource: string | null = null;

      if (!resolvedPrice || resolvedPrice <= 0) {
        // 1순위: 지정가 (limit_price)
        if (limitPrice && limitPrice > 0) {
          resolvedPrice = limitPrice;
          priceSource = 'limit';
        }
        // 2순위: KIS 잔고의 현재가/평균매수가
        else if (kisCurrentPrices[etfCode]) {
          resolvedPrice = kisCurrentPrices[etfCode];
          priceSource = 'kis';
        }
        // 3순위: 포트폴리오 매수가
        else if (purchasePrices[etfCode]) {
          resolvedPrice = purchasePrices[etfCode];
          priceSource = 'portfolio';
        }
        // 4순위: DB 최신 종가
        else if (dbPrices[etfCode]) {
          resolvedPrice = dbPrices[etfCode];
          priceSource = 'db';
        }
      }

      return {
        id: o.id,
        cycleId: o.cycle_id,
        orderType: o.order_type,
        etfCode,
        quantity: o.quantity,
        price: resolvedPrice,
        originalPrice: price,
        limitPrice,
        priceSource,
        orderId: o.order_id,
        status: orderStatus,
        errorMessage: o.error_message,
        retryCount: o.retry_count,
        createdAt: toKST((o.created_at as string) || ''),
      };
    });

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
