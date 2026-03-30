import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

export async function POST() {
  try {
    const response = await fetch(`${TRADING_SERVICE_URL}/api/trading/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[BFF] trading/reset: 성공');
      return NextResponse.json(data);
    }
    throw new Error(`Trading service responded with ${response.status}`);
  } catch (error) {
    console.log('[BFF] trading/reset: 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { success: false, message: 'trading-service 연결 실패' },
      { status: 502 }
    );
  }
}
