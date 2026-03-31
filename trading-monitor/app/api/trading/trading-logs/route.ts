import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

function toKST(utc: string): string {
  if (!utc) return '';
  const d = new Date(utc);
  d.setHours(d.getHours() + 9);
  return d.toISOString();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get('level') || '';
  const symbol = searchParams.get('symbol') || '';
  const limit = searchParams.get('limit') || '200';

  try {
    const params = new URLSearchParams({ limit });
    if (level && level !== 'ALL') params.append('level', level);
    if (symbol) params.append('symbol', symbol);

    const res = await fetch(
      `${TRADING_SERVICE_URL}/api/trading/logs?${params.toString()}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) throw new Error(`Trading service responded with ${res.status}`);

    const data = await res.json();
    const logs = (data.logs || []).map((log: Record<string, unknown>) => ({
      ...log,
      timestamp: toKST((log.timestamp as string) || ''),
    }));

    return NextResponse.json({ logs, count: data.count || logs.length });
  } catch (error) {
    console.log('[BFF] trading/logs: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ logs: [], count: 0 });
  }
}
