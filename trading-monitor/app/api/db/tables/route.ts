import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

const EMPTY_OVERVIEW = {
  database: 'etf2_db',
  totalTables: 0,
  totalRows: 0,
  upToDateTables: 0,
  staleTables: 0,
  lastChecked: new Date().toISOString(),
  tables: [],
};

export async function GET(request: NextRequest) {
  const dbName = request.nextUrl.searchParams.get('db_name') || 'etf2_db';

  try {
    const response = await fetch(
      `${ML_SERVICE_URL}/api/db/tables?db_name=${dbName}`,
      { signal: AbortSignal.timeout(30000) }
    );
    if (response.ok) {
      const data = await response.json();
      console.log(`[BFF] db/tables: 실서비스 데이터 (${data.totalTables} tables)`);
      return NextResponse.json(data);
    }
    throw new Error(`ML service responded with ${response.status}`);
  } catch (error) {
    console.log('[BFF] db/tables: 연결 실패 -', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ ...EMPTY_OVERVIEW, database: dbName });
  }
}
