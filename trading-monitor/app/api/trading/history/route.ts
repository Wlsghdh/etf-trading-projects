import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

/**
 * 매매 내역 API - KIS 실제 체결 기록 + 보유종목 손익
 *
 * 데이터 소스:
 * 1. /api/trading/orders → 실제 체결된(SUCCESS) 주문만
 * 2. /api/trading/balance → 보유종목 현재가/손익
 */
export async function GET() {
  try {
    const [balRes] = await Promise.all([
      fetch(`${TRADING_SERVICE_URL}/api/trading/balance`, { signal: AbortSignal.timeout(5000) }),
    ]);

    // 전체 주문을 페이지별로 가져오기 (최대 10페이지)
    let allOrders: Record<string, unknown>[] = [];
    for (let page = 1; page <= 10; page++) {
      try {
        const res = await fetch(
          `${TRADING_SERVICE_URL}/api/trading/orders?page=${page}&page_size=50`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) break;
        const data = await res.json();
        const orders = data.orders || [];
        if (orders.length === 0) break;
        allOrders = allOrders.concat(orders);
        if (allOrders.length >= (data.total || 0)) break;
      } catch { break; }
    }
    const ordersOk = allOrders.length > 0;

    // KIS 보유종목 현재가
    const kisPrices: Record<string, { currentPrice: number; avgPrice: number; pnlRate: number; quantity: number }> = {};
    if (balRes.ok) {
      const balData = await balRes.json();
      for (const h of balData.holdings || []) {
        kisPrices[h.code] = {
          currentPrice: h.current_price,
          avgPrice: h.avg_price,
          pnlRate: h.pnl_rate || 0,
          quantity: h.quantity,
        };
      }
    }

    const byDate: Record<string, { buys: number; sells: number; trades: Array<Record<string, unknown>> }> = {};

    // SUCCESS 주문만 사용
    if (ordersOk) {
      for (const o of allOrders) {
        if (o.status !== 'SUCCESS') continue;

        const createdAt = String(o.created_at ?? '');
        const date = createdAt.split('T')[0];
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { buys: 0, sells: 0, trades: [] };

        const orderType = String(o.order_type ?? '');
        const isBuy = orderType.includes('BUY');
        if (isBuy) byDate[date].buys++;
        else byDate[date].sells++;

        const etfCode = String(o.etf_code ?? '');
        const kisData = kisPrices[etfCode];
        const quantity = Number(o.quantity || 0);
        // 체결가 우선, 없으면 지정가, 없으면 KIS 평균매수가
        const price = Number(o.price ?? 0) || Number(o.limit_price ?? 0) || (kisData?.avgPrice || 0);

        // 미실현 손익: KIS 현재가 vs 매수가
        let profitLoss = 0;
        let profitLossPercent = 0;
        let currentPrice = 0;

        if (isBuy && kisData) {
          currentPrice = kisData.currentPrice;
          profitLoss = (currentPrice - (kisData.avgPrice || Number(price))) * Number(quantity);
          profitLossPercent = kisData.pnlRate;
        } else if (!isBuy && price > 0) {
          // 매도: 체결가 기준
          profitLoss = 0; // 매도 손익은 별도 계산 필요
        }

        byDate[date].trades.push({
          id: String(o.id ?? ''),
          etfCode,
          etfName: etfCode,
          side: isBuy ? 'BUY' : 'SELL',
          quantity,
          price: Number((price).toFixed(2)),
          currentPrice: currentPrice > 0 ? Number(currentPrice.toFixed(2)) : undefined,
          executedAt: createdAt,
          profitLoss: Number(profitLoss.toFixed(2)),
          profitLossPercent: Number(profitLossPercent.toFixed(2)),
          orderId: String(o.order_id ?? ''),
        });
      }
    }

    const summaries = Object.entries(byDate)
      .map(([date, { buys, sells, trades }]) => ({
        date,
        buyCount: buys,
        sellCount: sells,
        totalProfitLoss: Number(trades.reduce((sum, t) => sum + ((t.profitLoss as number) || 0), 0).toFixed(2)),
        trades,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    console.log(`[BFF] trading/history: ${summaries.length}일, SUCCESS 주문만 (KIS ${Object.keys(kisPrices).length}종목 손익)`);
    return NextResponse.json(summaries);
  } catch (error) {
    console.log('[BFF] trading/history: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json([]);
  }
}
