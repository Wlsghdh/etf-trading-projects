import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

export async function GET() {
  try {
    const response = await fetch(`${TRADING_SERVICE_URL}/api/trading/automation`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[BFF] trading/automation: 실서비스 데이터 사용');
      return NextResponse.json(data);
    }
    throw new Error(`Trading service responded with ${response.status}`);
  } catch (error) {
    console.log('[BFF] trading/automation: 폴백 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      enabled: false,
      fractional_mode: false,
      scheduler_time: '23:30 KST',
      trading_mode: 'paper',
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${TRADING_SERVICE_URL}/api/trading/automation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[BFF] trading/automation POST: 성공');
      return NextResponse.json(data);
    }
    throw new Error(`Trading service responded with ${response.status}`);
  } catch (error) {
    console.log('[BFF] trading/automation POST: 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { success: false, message: 'trading-service 연결 실패' },
      { status: 502 }
    );
  }
}
