import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

async function transformPortfolio(raw: Record<string, unknown>) {
  const holdings = (raw.holdings as Array<Record<string, unknown>>) || [];
  const totalInvested = (raw.total_invested as number) || 0;

  // KIS 잔고에서 실제 보유종목 현재가 가져오기
  let kisHoldings: Record<string, { currentPrice: number; pnlRate: number }> = {};
  try {
    const balRes = await fetch(`${TRADING_SERVICE_URL}/api/trading/balance`, {
      signal: AbortSignal.timeout(5000),
    });
    if (balRes.ok) {
      const balData = await balRes.json();
      for (const h of balData.holdings || []) {
        kisHoldings[h.code] = {
          currentPrice: h.current_price || 0,
          pnlRate: h.pnl_rate || 0,
        };
      }
    }
  } catch { /* silent */ }

  let totalCurrentValue = 0;

  const transformedHoldings = holdings.map((h) => {
    const etfCode = (h.etf_code as string) || '';
    const buyPrice = (h.price as number) || 0;
    const quantity = (h.quantity as number) || 0;

    // KIS에서 현재가를 가져왔으면 사용, 아니면 매수가 그대로
    const kisInfo = kisHoldings[etfCode];
    const currentPrice = kisInfo?.currentPrice || buyPrice;
    const profitLoss = (currentPrice - buyPrice) * quantity;
    const profitLossPercent = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;

    totalCurrentValue += currentPrice * quantity;

    return {
      etfCode,
      etfName: etfCode,
      quantity,
      buyPrice: Number(buyPrice.toFixed(2)),
      currentPrice: Number(currentPrice.toFixed(2)),
      buyDate: (h.purchase_date as string) || '',
      dDay: (h.trading_day_number as number) || 0,
      profitLoss: Number(profitLoss.toFixed(2)),
      profitLossPercent: Number(profitLossPercent.toFixed(2)),
    };
  });

  const totalProfitLoss = totalCurrentValue - totalInvested;
  const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

  return {
    totalInvestment: Number(totalInvested.toFixed(2)),
    totalCurrentValue: Number(totalCurrentValue.toFixed(2)),
    totalProfitLoss: Number(totalProfitLoss.toFixed(2)),
    totalProfitLossPercent: Number(totalProfitLossPercent.toFixed(2)),
    holdings: transformedHoldings,
  };
}

const EMPTY_PORTFOLIO = {
  totalInvestment: 0,
  totalCurrentValue: 0,
  totalProfitLoss: 0,
  totalProfitLossPercent: 0,
  holdings: [],
};

export async function GET() {
  try {
    const response = await fetch(`${TRADING_SERVICE_URL}/api/trading/portfolio`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[BFF] trading/portfolio: 실서비스 데이터 사용');
      return NextResponse.json(await transformPortfolio(data));
    }
    throw new Error(`Trading service responded with ${response.status}`);
  } catch (error) {
    console.log('[BFF] trading/portfolio: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(EMPTY_PORTFOLIO);
  }
}
