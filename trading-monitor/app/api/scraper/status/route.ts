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

function normalizeStatus(data: Record<string, unknown>, configuredTotal?: number) {
  const progress = data.progress as Record<string, unknown> | undefined;
  const runningTotal = progress?.total as number | undefined;
  const status = (data.status as string) || 'idle';
  const isRunning = status === 'running';

  // 실행 중일 땐 진행 중인 job의 total, 그 외(idle/completed/error)에는
  // 항상 symbols.yaml의 최신 configuredTotal을 우선 사용한다.
  // (마지막 완료 job의 stale total 대신 다음 실행 예정 종목 수를 노출)
  const totalSymbols = isRunning
    ? runningTotal
    : (configuredTotal ?? runningTotal);

  return {
    status,
    currentSymbol: data.current_symbol || progress?.current_symbol || undefined,
    progress: runningTotal
      ? Math.round(((progress!.current as number) / runningTotal) * 100)
      : undefined,
    totalSymbols,
    completedSymbols: progress?.current || undefined,
    errorSymbols: progress?.errors || [],
    startedAt: toKST(data.start_time),
    completedAt: toKST(data.end_time),
    message: data.message || undefined,
    configuredTotal,
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
  configuredTotal: undefined as number | undefined,
};

/**
 * symbols.yaml 기반 설정 종목 수 조회 (실패 시 undefined).
 * 응답 캐시는 하지 않지만 실패해도 status 응답을 막지 않도록 짧은 timeout 적용.
 */
async function fetchConfiguredTotal(): Promise<number | undefined> {
  try {
    const res = await fetch(
      `${SCRAPER_SERVICE_URL}/api/scraper/jobs/symbols/configured`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    return typeof data.count === 'number' ? data.count : undefined;
  } catch {
    return undefined;
  }
}

export async function GET() {
  // status와 configured count를 병렬 조회
  const [statusResult, configuredTotal] = await Promise.all([
    fetch(`${SCRAPER_SERVICE_URL}/api/scraper/jobs/status`, {
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      console.log(
        '[BFF] scraper/status: 연결 실패 -',
        err instanceof Error ? err.message : 'unknown'
      );
      return null;
    }),
    fetchConfiguredTotal(),
  ]);

  if (statusResult && statusResult.ok) {
    try {
      const data = await statusResult.json();
      return NextResponse.json(normalizeStatus(data, configuredTotal));
    } catch (err) {
      console.log(
        '[BFF] scraper/status: 파싱 실패 -',
        err instanceof Error ? err.message : 'unknown'
      );
    }
  }

  // status는 실패했지만 configured는 성공한 경우 — yaml 기반 빈 상태로 응답
  return NextResponse.json({ ...EMPTY_STATUS, configuredTotal });
}
