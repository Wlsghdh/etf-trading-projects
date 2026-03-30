import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get('limit') || '20';

  try {
    const response = await fetch(`${ML_SERVICE_URL}/api/predictions/history?limit=${limit}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
    throw new Error(`${response.status}`);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch history', predictions: [], count: 0 }, { status: 500 });
  }
}
