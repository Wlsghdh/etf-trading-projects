import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export async function POST() {
  try {
    const res = await fetch(`${ML_URL}/api/predictions/ranking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120000), // 예측은 오래 걸릴 수 있음
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ success: true, total_symbols: data.total_symbols, model_name: data.model_name });
    }
    const text = await res.text();
    return NextResponse.json({ success: false, message: text }, { status: res.status });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'ml-service 연결 실패' }, { status: 502 });
  }
}
