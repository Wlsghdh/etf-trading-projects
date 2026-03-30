import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

export async function GET() {
  try {
    const response = await fetch(`${SCRAPER_SERVICE_URL}/api/scraper/features/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[BFF] features/status: 실서비스 데이터');
      return NextResponse.json(data);
    }
    throw new Error(`${response.status}`);
  } catch (error) {
    console.log('[BFF] features/status: 에러 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ status: 'idle', message: '', progress: 0, total: 0 });
  }
}
