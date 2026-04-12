import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://ml-service:8000';

async function getLatestPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  if (symbols.length === 0) return prices;

  // 1. trading-service /api/trading/prices 한방에 모두 조회 (DB 최신 종가)
  try {
    const symParam = symbols.join(',');
    const priceRes = await fetch(
      `${TRADING_SERVICE_URL}/api/trading/prices?symbols=${encodeURIComponent(symParam)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (priceRes.ok) {
      const priceData = await priceRes.json();
      for (const [sym, price] of Object.entries(priceData)) {
        if (typeof price === 'number' && price > 0) {
          prices[sym] = price;
        }
      }
    }
  } catch { /* silent */ }

  // 2. KIS 보유종목 현재가 (장중이면 더 정확) - 우선순위 높음
  try {
    const balRes = await fetch(`${TRADING_SERVICE_URL}/api/trading/balance`, {
      signal: AbortSignal.timeout(5000),
    });
    if (balRes.ok) {
      const balData = await balRes.json();
      for (const h of balData.holdings || []) {
        if (h.current_price > 0) {
          prices[h.code] = h.current_price;  // KIS 우선
        }
      }
    }
  } catch { /* silent */ }

  // 3. 누락된 종목은 ML service DB에서 직접 조회 (fallback)
  const missing = symbols.filter(s => !(s in prices));
  if (missing.length > 0) {
    await Promise.all(missing.map(async sym => {
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
    }));
  }

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
    let buyPrice = (h.price as number) || 0;
    const quantity = (h.quantity as number) || 0;

    const currentPrice = prices[etfCode] || buyPrice;

    // 매수가 이상치 보정: 매수가와 현재가의 차이가 3배 이상이면
    // DB의 split 미보정 가격으로 매수된 것이므로, 현재가 기준으로 보정
    if (buyPrice > 0 && currentPrice > 0) {
      const ratio = currentPrice / buyPrice;
      if (ratio > 3 || ratio < 0.33) {
        // 가장 가까운 split 비율로 보정 (2:1, 3:1, 4:1, 5:1, 10:1 등)
        const commonSplits = [2, 3, 4, 5, 7, 8, 10, 15, 20];
        let bestSplit = 1;
        let bestDiff = Infinity;
        for (const s of commonSplits) {
          // 매수가 * split = 현재가에 가까운지
          const diff1 = Math.abs(buyPrice * s - currentPrice);
          if (diff1 < bestDiff) { bestDiff = diff1; bestSplit = s; }
          // 현재가 / split = 매수가에 가까운지 (역분할)
          const diff2 = Math.abs(currentPrice / s - buyPrice);
          if (diff2 < bestDiff) { bestDiff = diff2; bestSplit = 1 / s; }
        }
        // 보정된 매수가가 현재가의 ±50% 이내인지 확인
        const adjustedBuy = buyPrice * (bestSplit > 1 ? bestSplit : 1 / bestSplit);
        if (Math.abs(adjustedBuy - currentPrice) / currentPrice < 0.5) {
          buyPrice = Number(adjustedBuy.toFixed(2));
        }
      }
    }

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
