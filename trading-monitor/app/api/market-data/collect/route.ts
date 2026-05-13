import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get('target_date') || '';
    const url = `${SCRAPER_URL}/market-data/collect${targetDate ? `?target_date=${targetDate}` : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'scraper-service 연결 실패' },
      { status: 502 }
    );
  }
}
