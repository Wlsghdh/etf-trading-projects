import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';

export async function GET() {
  try {
    const res = await fetch(`${TRADING_SERVICE_URL}/api/trading/sqlite/tables`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return NextResponse.json(await res.json());
    throw new Error(`${res.status}`);
  } catch {
    return NextResponse.json({ database: 'trading.db', tables: [], totalTables: 0 });
  }
}
