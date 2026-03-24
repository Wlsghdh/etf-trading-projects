import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

export async function GET() {
  try {
    // purchases(매수 기록) + orders(주문 로그) 둘 다 가져오기
    const [histRes, ordersRes] = await Promise.all([
      fetch(`${TRADING_SERVICE_URL}/api/trading/history?page_size=200`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${TRADING_SERVICE_URL}/api/trading/orders?page_size=200`, { signal: AbortSignal.timeout(5000) }),
    ]);

    // 날짜별로 그룹핑
    const byDate: Record<string, { buys: number; sells: number; trades: Array<Record<string, unknown>> }> = {};

    // orders에서 성공한 주문만 (trading-service 원본 응답: {orders: [...]})
    if (ordersRes.ok) {
      const ordersData = await ordersRes.json();
      const ordersList = ordersData.orders || ordersData || [];
      for (const o of ordersList) {
        if (o.status !== 'SUCCESS') continue;
        const date = (o.created_at || '').split('T')[0];
        if (!date) continue;

        if (!byDate[date]) byDate[date] = { buys: 0, sells: 0, trades: [] };

        const isBuy = (o.order_type || '').includes('BUY');
        if (isBuy) byDate[date].buys++;
        else byDate[date].sells++;

        byDate[date].trades.push({
          id: String(o.id || ''),
          etfCode: o.etf_code || '',
          etfName: o.etf_code || '',
          side: isBuy ? 'BUY' : 'SELL',
          quantity: o.quantity || 0,
          price: o.price || 0,
          executedAt: o.created_at || '',
          profitLoss: undefined,
          profitLossPercent: undefined,
        });
      }
    }

    // purchases에서 매도된 것 추가 (FIFO 매도 기록)
    if (histRes.ok) {
      const histData = await histRes.json();
      for (const p of histData.purchases || []) {
        if (!p.sold || !p.sold_date) continue;
        const date = p.sold_date;
        if (!byDate[date]) byDate[date] = { buys: 0, sells: 0, trades: [] };
        byDate[date].sells++;
        byDate[date].trades.push({
          id: String(p.id || ''),
          etfCode: p.etf_code || '',
          etfName: p.etf_code || '',
          side: 'SELL',
          quantity: p.quantity || 0,
          price: p.sold_price || p.price || 0,
          executedAt: p.sold_date || '',
          profitLoss: p.sell_pnl || 0,
          profitLossPercent: p.price > 0 ? ((p.sell_pnl || 0) / (p.price * p.quantity)) * 100 : 0,
        });
      }
    }

    // DailySummary 배열로 변환
    const summaries = Object.entries(byDate)
      .map(([date, { buys, sells, trades }]) => ({
        date,
        buyCount: buys,
        sellCount: sells,
        totalProfitLoss: trades.reduce((sum, t) => sum + ((t.profitLoss as number) || 0), 0),
        trades,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    console.log(`[BFF] trading/history: ${summaries.length}일, byDate=${Object.keys(byDate).join(',')}`);
    return NextResponse.json(summaries);
  } catch (error) {
    console.log('[BFF] trading/history: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json([]);
  }
}
