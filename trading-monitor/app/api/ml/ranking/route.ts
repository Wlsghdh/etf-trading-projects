import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/api/predictions/ranking/latest`, {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[BFF] ml/ranking: 실서비스 데이터');
      return NextResponse.json(data);
    }
    throw new Error(`ML service responded with ${response.status}`);
  } catch (error) {
    console.log('[BFF] ml/ranking: 에러 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Failed to fetch ranking', rankings: [] }, { status: 500 });
  }
}
