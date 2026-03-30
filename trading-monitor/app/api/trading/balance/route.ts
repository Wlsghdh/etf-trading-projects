import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

export async function GET() {
  try {
    const response = await fetch(`${TRADING_SERVICE_URL}/api/trading/balance`, {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();

      // KIS가 0을 반환하면 portfolio에서 보정
      if (data.available_cash_usd === 0 && data.total_evaluation_usd === 0) {
        try {
          const portRes = await fetch(`${TRADING_SERVICE_URL}/api/trading/portfolio`, {
            signal: AbortSignal.timeout(5000),
          });
          if (portRes.ok) {
            const port = await portRes.json();
            const invested = port.total_invested || 0;
            if (invested > 0) {
              data.available_cash_usd = 100000 - invested; // 초기자금 - 투자금
              data.total_evaluation_usd = 100000;
              data.available_cash_krw = Math.round(data.available_cash_usd * (data.exchange_rate || 1350));
              data.total_evaluation_krw = Math.round(data.total_evaluation_usd * (data.exchange_rate || 1350));
              data.kis_connected = true;
            }
          }
        } catch { /* silent */ }
      }

      console.log('[BFF] trading/balance: 실서비스 데이터 사용');
      return NextResponse.json(data);
    }
    throw new Error(`Trading service responded with ${response.status}`);
  } catch (error) {
    // 완전 실패 시에도 portfolio 기반 fallback
    try {
      const portRes = await fetch(`${TRADING_SERVICE_URL}/api/trading/portfolio`, {
        signal: AbortSignal.timeout(5000),
      });
      if (portRes.ok) {
        const port = await portRes.json();
        const invested = port.total_invested || 0;
        return NextResponse.json({
          available_cash_usd: 100000 - invested,
          total_evaluation_usd: 100000,
          available_cash_krw: Math.round((100000 - invested) * 1350),
          total_evaluation_krw: Math.round(100000 * 1350),
          exchange_rate: 1350,
          holdings: [],
          kis_connected: false,
          error: null,
        });
      }
    } catch { /* silent */ }

    console.log('[BFF] trading/balance: 폴백 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      available_cash_usd: 0,
      total_evaluation_usd: 0,
      available_cash_krw: 0,
      total_evaluation_krw: 0,
      exchange_rate: 1350,
      holdings: [],
      kis_connected: false,
      error: 'trading-service 연결 실패',
    });
  }
}
