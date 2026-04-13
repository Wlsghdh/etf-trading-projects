import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

/**
 * 잔고 API - KIS 데이터 그대로 전달 + 보유종목 기반 손익 계산
 *
 * - 주문가능: KIS available_cash_usd 그대로 (실제 현금)
 * - 총자산: 현금 + 보유종목 평가금
 * - 손익: 보유종목 기준 계산
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

    // KIS에서 주는 실제 현금
    const cashUsd = data.available_cash_usd ?? 0;

    // 보유종목 기반 금액
    const totalBuyUsd = holdings.reduce((s: number, h: Record<string, number>) =>
      s + (h.avg_price || 0) * (h.quantity || 0), 0);
    const holdingsEvalUsd = holdings.reduce((s: number, h: Record<string, number>) =>
      s + (h.current_price || 0) * (h.quantity || 0), 0);

    // 총자산 = 현금 + 보유종목 평가
    const totalAssetUsd = cashUsd + holdingsEvalUsd;
    const profitLossUsd = holdingsEvalUsd - totalBuyUsd;
    const profitLossPct = totalBuyUsd > 0 ? (profitLossUsd / totalBuyUsd) * 100 : 0;

    console.log(`[BFF] trading/balance: KIS 현금 $${cashUsd.toFixed(0)} + 종목 $${holdingsEvalUsd.toFixed(0)} = 총 $${totalAssetUsd.toFixed(0)}`);

    return NextResponse.json({
      available_cash_usd: Number(cashUsd.toFixed(2)),
      total_evaluation_usd: Number(totalAssetUsd.toFixed(2)),
      total_buy_usd: Number(totalBuyUsd.toFixed(2)),
      holdings_evaluation_usd: Number(holdingsEvalUsd.toFixed(2)),
      available_cash_krw: Math.round(cashUsd * exchangeRate),
      total_evaluation_krw: Math.round(totalAssetUsd * exchangeRate),
      exchange_rate: exchangeRate,
      holdings,
      kis_connected: data.kis_connected ?? true,
      profit_loss_usd: Number(profitLossUsd.toFixed(2)),
      profit_loss_percent: Number(profitLossPct.toFixed(2)),
      error: null,
    });
  } catch (error) {
    console.log('[BFF] trading/balance: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      available_cash_usd: 0,
      total_evaluation_usd: 0,
      total_buy_usd: 0,
      holdings_evaluation_usd: 0,
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
