import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const searchParams = request.nextUrl.searchParams;
  const days = parseInt(searchParams.get('days') || '30', 10);
  const currentPrice = searchParams.get('current_price');

  try {
    const url = new URL(`${ML_SERVICE_URL}/api/predictions/forecast/${symbol}`);
    url.searchParams.set('days', String(days));
    if (currentPrice) url.searchParams.set('current_price', currentPrice);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log(`[BFF] predictions/forecast/${symbol}: 실서비스 데이터 사용`);
      return NextResponse.json(data);
    }
    throw new Error(`ML service responded with ${response.status}`);
  } catch (error) {
    console.log(
      `[BFF] predictions/forecast/${symbol}: 연결 실패 -`,
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json(
      { error: 'ML 서비스 연결 실패', symbol, days },
      { status: 502 }
    );
  }
}
