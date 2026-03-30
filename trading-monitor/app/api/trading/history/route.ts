import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

export async function GET() {
  try {
    // purchases(매수 기록, 가격 있음) + orders(주문 로그, 매수/매도 구분)
    const [histRes, ordersRes] = await Promise.all([
      fetch(`${TRADING_SERVICE_URL}/api/trading/history?page_size=200`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${TRADING_SERVICE_URL}/api/trading/orders?page_size=200`, { signal: AbortSignal.timeout(5000) }),
    ]);

    const byDate: Record<string, { buys: number; sells: number; trades: Array<Record<string, unknown>> }> = {};

    // 1. purchases에서 매수 기록 (가격 있음)
    if (histRes.ok) {
      const histData = await histRes.json();
      for (const p of histData.purchases || []) {
        const date = (p.purchase_date || '').split('T')[0];
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { buys: 0, sells: 0, trades: [] };
        byDate[date].buys++;
        byDate[date].trades.push({
          id: String(p.id || ''),
          etfCode: p.etf_code || '',
          etfName: p.etf_code || '',
          side: 'BUY',
          quantity: p.quantity || 0,
          price: p.price || 0,
          executedAt: p.created_at || p.purchase_date || '',
          profitLoss: p.sell_pnl || undefined,
          profitLossPercent: undefined,
        });

        // 매도된 것도 추가
        if (p.sold && p.sold_date) {
          const soldDate = p.sold_date.split('T')[0];
          if (!byDate[soldDate]) byDate[soldDate] = { buys: 0, sells: 0, trades: [] };
          byDate[soldDate].sells++;
          const pnl = p.sell_pnl || 0;
          const pnlPct = p.price > 0 && p.quantity > 0 ? (pnl / (p.price * p.quantity)) * 100 : 0;
          byDate[soldDate].trades.push({
            id: `sell-${p.id}`,
            etfCode: p.etf_code || '',
            etfName: p.etf_code || '',
            side: 'SELL',
            quantity: p.quantity || 0,
            price: p.sold_price || 0,
            executedAt: p.sold_date || '',
            profitLoss: pnl,
            profitLossPercent: Number(pnlPct.toFixed(2)),
          });
        }
      }
    }

    // 2. purchases가 비어있으면 orders fallback
    if (Object.keys(byDate).length === 0 && ordersRes.ok) {
      const ordersData = await ordersRes.json();
      for (const o of ordersData.orders || []) {
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
        });
      }
    }

    const summaries = Object.entries(byDate)
      .map(([date, { buys, sells, trades }]) => ({
        date,
        buyCount: buys,
        sellCount: sells,
        totalProfitLoss: trades.reduce((sum, t) => sum + ((t.profitLoss as number) || 0), 0),
        trades,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    console.log(`[BFF] trading/history: ${summaries.length}일 매매 기록`);
    return NextResponse.json(summaries);
  } catch (error) {
    console.log('[BFF] trading/history: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json([]);
  }
}
