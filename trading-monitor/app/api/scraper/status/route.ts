import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

function toKST(utcTimestamp: unknown): string | undefined {
  if (!utcTimestamp || typeof utcTimestamp !== 'string') return undefined;
  const date = new Date(utcTimestamp);
  date.setHours(date.getHours() + 9);
  return date.toISOString();
}

function normalizeStatus(data: Record<string, unknown>) {
  const progress = data.progress as Record<string, unknown> | undefined;

  return {
    status: data.status || 'idle',
    currentSymbol: data.current_symbol || progress?.current_symbol || undefined,
    progress: progress?.total
      ? Math.round(((progress.current as number) / (progress.total as number)) * 100)
      : undefined,
    totalSymbols: progress?.total || undefined,
    completedSymbols: progress?.current || undefined,
    errorSymbols: progress?.errors || [],
    startedAt: toKST(data.start_time),
    completedAt: toKST(data.end_time),
    message: data.message || undefined,
  };
}

const EMPTY_STATUS = {
  status: 'idle',
  currentSymbol: undefined,
  progress: undefined,
  totalSymbols: undefined,
  completedSymbols: undefined,
  errorSymbols: [],
  startedAt: undefined,
  completedAt: undefined,
  message: '서비스 연결 대기',
};

export async function GET() {
  try {
    const response = await fetch(`${SCRAPER_SERVICE_URL}/api/scraper/jobs/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      console.log('[BFF] scraper/status: 실서비스 데이터 사용');
      return NextResponse.json(normalizeStatus(data));
    }
    throw new Error(`Scraper service responded with ${response.status}`);
  } catch (error) {
    console.log('[BFF] scraper/status: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(EMPTY_STATUS);
  }
}
