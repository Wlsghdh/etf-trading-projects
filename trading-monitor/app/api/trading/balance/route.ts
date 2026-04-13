import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

/**
 * 잔고 API - KIS 실계좌 보유종목 기반으로 정확한 수치 계산
 *
 * 모의계좌의 가상 자금(29억 등)이 아닌,
 * 실제 보유종목의 매입/평가금을 기준으로 표시
 */
export async function GET() {
  try {
    const response = await fetch(`${TRADING_SERVICE_URL}/api/trading/balance`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`status ${response.status}`);

    const data = await response.json();
    const holdings = data.holdings || [];
    const exchangeRate = data.exchange_rate || 1350;

    // 보유종목 기반으로 실제 금액 계산
    const totalBuyUsd = holdings.reduce((s: number, h: Record<string, number>) =>
      s + (h.avg_price || 0) * (h.quantity || 0), 0);
    const totalEvalUsd = holdings.reduce((s: number, h: Record<string, number>) =>
      s + (h.current_price || 0) * (h.quantity || 0), 0);

    console.log(`[BFF] trading/balance: 실서비스 데이터 사용 (${holdings.length}종목, $${totalEvalUsd.toFixed(0)})`);

    return NextResponse.json({
      // 보유종목 기반 실제 금액
      available_cash_usd: Number((totalEvalUsd - totalBuyUsd).toFixed(2)),
      total_evaluation_usd: Number(totalEvalUsd.toFixed(2)),
      total_buy_usd: Number(totalBuyUsd.toFixed(2)),
      available_cash_krw: Math.round((totalEvalUsd - totalBuyUsd) * exchangeRate),
      total_evaluation_krw: Math.round(totalEvalUsd * exchangeRate),
      exchange_rate: exchangeRate,
      holdings,
      kis_connected: data.kis_connected ?? true,
      profit_loss_usd: Number((totalEvalUsd - totalBuyUsd).toFixed(2)),
      profit_loss_percent: totalBuyUsd > 0
        ? Number(((totalEvalUsd - totalBuyUsd) / totalBuyUsd * 100).toFixed(2))
        : 0,
      error: null,
    });
  } catch (error) {
    console.log('[BFF] trading/balance: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      available_cash_usd: 0,
      total_evaluation_usd: 0,
      total_buy_usd: 0,
      available_cash_krw: 0,
      total_evaluation_krw: 0,
      exchange_rate: 1350,
      holdings: [],
      kis_connected: false,
      profit_loss_usd: 0,
      profit_loss_percent: 0,
      error: 'KIS 연결 실패',
    });
  }
}
