import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = searchParams.get('days') || '30';
    const res = await fetch(`${SCRAPER_URL}/market-data/data?days=${days}`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'scraper-service 연결 실패' },
      { status: 502 }
    );
  }
}
