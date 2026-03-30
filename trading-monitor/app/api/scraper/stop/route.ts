import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

export async function POST() {
  try {
    const res = await fetch(`${SCRAPER_URL}/api/scraper/jobs/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ success: true, ...data });
    }
    const text = await res.text();
    return NextResponse.json({ success: false, message: text }, { status: res.status });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'scraper-service 연결 실패' }, { status: 502 });
  }
}
