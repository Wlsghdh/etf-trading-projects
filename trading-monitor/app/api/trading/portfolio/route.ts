import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://ml-service:8000';

async function getLatestPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  // 1. ML service DB tables API에서 각 종목 최신 종가 조회
  for (const sym of symbols.slice(0, 20)) {  // 최대 20종목
    try {
      const res = await fetch(
        `${ML_SERVICE_URL}/api/db/tables/${sym}_D/data?db_name=etf2_db&limit=1&offset=0`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (res.ok) {
        const data = await res.json();
        const rows = data.rows || [];
        if (rows.length > 0) {
          const close = parseFloat(rows[0].close || '0');
          if (close > 0) prices[sym] = close;
        }
      }
    } catch { /* silent */ }
  }

  // 2. KIS 보유종목 현재가 (장중이면 우선)
  try {
    const balRes = await fetch(`${TRADING_SERVICE_URL}/api/trading/balance`, {
      signal: AbortSignal.timeout(5000),
    });
    if (balRes.ok) {
      const balData = await balRes.json();
      for (const h of balData.holdings || []) {
        if (h.current_price > 0) {
          prices[h.code] = h.current_price;
        }
      }
    }
  } catch { /* silent */ }

  return prices;
}

async function transformPortfolio(raw: Record<string, unknown>) {
  const holdings = (raw.holdings as Array<Record<string, unknown>>) || [];
  const totalInvested = (raw.total_invested as number) || 0;

  // 보유 종목 심볼 추출
  const symbols = holdings.map(h => (h.etf_code as string) || '').filter(Boolean);

  // 최신 종가 조회
  const prices = await getLatestPrices(symbols);

  let totalCurrentValue = 0;

  const transformedHoldings = holdings.map((h) => {
    const etfCode = (h.etf_code as string) || '';
    const buyPrice = (h.price as number) || 0;
    const quantity = (h.quantity as number) || 0;

    const currentPrice = prices[etfCode] || buyPrice;
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
  totalInvestment: 0, totalCurrentValue: 0,
  totalProfitLoss: 0, totalProfitLossPercent: 0, holdings: [],
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
