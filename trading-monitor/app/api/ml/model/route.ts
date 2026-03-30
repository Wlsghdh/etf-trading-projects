import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/api/predictions/models/current`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
    throw new Error(`${response.status}`);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch model info' }, { status: 500 });
  }
}
