import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collector = searchParams.get('collector') || 'scraper';
  const limit = searchParams.get('limit') || '50';
  const minLevel = searchParams.get('min_level') || 'INFO';

  try {
    let url = '';
    if (collector === 'tradingview-scraper') {
      url = `${SCRAPER_URL}/jobs/logs?limit=${limit}&min_level=${minLevel}`;
    } else if (collector === 'market-data') {
      url = `${SCRAPER_URL}/market-data/logs?limit=${limit}`;
    } else if (collector === 'sec-edgar') {
      url = `${SCRAPER_URL}/edgar/logs?limit=${limit}`;
    } else if (collector === 'feature-pipeline') {
      // Feature pipeline doesn't have a dedicated logs endpoint
      return NextResponse.json({ logs: [], count: 0 });
    } else {
      return NextResponse.json({ logs: [], count: 0 });
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { logs: [], count: 0, error: error instanceof Error ? error.message : 'unknown' },
      { status: 502 }
    );
  }
}
