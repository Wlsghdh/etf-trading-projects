import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

const EMPTY_PORTFOLIO = {
  totalInvestment: 0, totalCurrentValue: 0,
  totalProfitLoss: 0, totalProfitLossPercent: 0, holdings: [],
};

/**
 * 포트폴리오 API - KIS 실계좌 데이터만 사용
 *
 * 데이터 소스:
 * 1. /api/trading/balance → 보유종목 (code, avg_price, current_price, quantity, pnl_rate)
 * 2. 총액/수익률은 보유종목에서 직접 계산 (달러 기준)
 *
 * DB fallback 제거 - 모든 데이터는 KIS에서 가져옴
 */
export async function GET() {
  try {
    // KIS balance API에서 실제 보유종목 가져오기
    const balRes = await fetch(`${TRADING_SERVICE_URL}/api/trading/balance`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!balRes.ok) {
      console.log('[BFF] trading/portfolio: KIS 연결 실패');
      return NextResponse.json(EMPTY_PORTFOLIO);
    }

    const balData = await balRes.json();
    const kisHoldings = balData.holdings || [];

    if (kisHoldings.length === 0) {
      console.log('[BFF] trading/portfolio: KIS 보유종목 없음');
      return NextResponse.json(EMPTY_PORTFOLIO);
    }

    // 보유종목 변환
    let totalInvestment = 0;
    let totalCurrentValue = 0;

    const holdings = kisHoldings.map((h: Record<string, unknown>) => {
      const etfCode = (h.code as string) || '';
      const quantity = (h.quantity as number) || 0;
      const avgPrice = (h.avg_price as number) || 0;
      const currentPrice = (h.current_price as number) || 0;
      const pnlRate = (h.pnl_rate as number) || 0;

      const buyTotal = avgPrice * quantity;
      const evalTotal = currentPrice * quantity;
      const profitLoss = evalTotal - buyTotal;

      totalInvestment += buyTotal;
      totalCurrentValue += evalTotal;

      return {
        etfCode,
        etfName: (h.name as string) || etfCode,
        quantity,
        buyPrice: Number(avgPrice.toFixed(2)),
        currentPrice: Number(currentPrice.toFixed(2)),
        buyDate: '',
        dDay: 0,
        profitLoss: Number(profitLoss.toFixed(2)),
        profitLossPercent: Number(pnlRate.toFixed(2)),
        exchangeCode: (h.exchange_code as string) || '',
      };
    });

    const totalProfitLoss = totalCurrentValue - totalInvestment;
    const totalProfitLossPercent = totalInvestment > 0
      ? (totalProfitLoss / totalInvestment) * 100
      : 0;

    console.log(`[BFF] trading/portfolio: KIS ${holdings.length}개 종목, 수익률 ${totalProfitLossPercent.toFixed(2)}%`);

    return NextResponse.json({
      totalInvestment: Number(totalInvestment.toFixed(2)),
      totalCurrentValue: Number(totalCurrentValue.toFixed(2)),
      totalProfitLoss: Number(totalProfitLoss.toFixed(2)),
      totalProfitLossPercent: Number(totalProfitLossPercent.toFixed(2)),
      holdings,
    });
  } catch (error) {
    console.log('[BFF] trading/portfolio: 오류 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(EMPTY_PORTFOLIO);
  }
}
