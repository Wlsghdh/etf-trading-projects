import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

/**
 * 종목 목록 조회 BFF
 *
 * 우선순위:
 *   1. scraper-service /api/scraper/jobs/symbols/configured (symbols.yaml, 약 1000개)
 *   2. ml-service /api/data/symbols (DB 테이블 기준, fallback)
 *
 * scraper-service 응답을 표준화하여 { count, symbols, items, sectors, source } 형식으로 반환.
 */
export async function GET() {
  // 1차: scraper-service (yaml 기반 1000개 종목)
  try {
    const response = await fetch(
      `${SCRAPER_SERVICE_URL}/api/scraper/jobs/symbols/configured`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        count: data.count ?? data.symbols?.length ?? 0,
        symbols: data.symbols ?? [],
        items: data.items ?? [],
        sectors: data.sectors ?? {},
        source: data.source ?? 'symbols.yaml',
      });
    }
    console.log(`[BFF] scraper symbols 비정상 응답: ${response.status}, ml-service fallback 시도`);
  } catch (error) {
    console.log(
      '[BFF] scraper symbols 호출 실패:',
      error instanceof Error ? error.message : 'unknown'
    );
  }

  // 2차: ml-service (DB 테이블 기반 fallback)
  try {
    const response = await fetch(`${ML_SERVICE_URL}/api/data/symbols`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        count: data.count ?? data.symbols?.length ?? 0,
        symbols: data.symbols ?? [],
        items: [],
        sectors: {},
        source: 'ml-service-db',
      });
    }
    throw new Error(`ML service responded with ${response.status}`);
  } catch (error) {
    console.log(
      '[BFF] ml/symbols: 모든 소스 실패 -',
      error instanceof Error ? error.message : 'unknown'
    );
    return NextResponse.json(
      { error: 'Failed to fetch symbols', symbols: [], items: [], sectors: {}, count: 0 },
      { status: 502 }
    );
  }
}
