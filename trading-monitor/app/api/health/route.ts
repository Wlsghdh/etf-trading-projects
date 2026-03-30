import { NextResponse } from 'next/server';
import type { HealthCheckResponse, ServiceStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SERVICES = [
  { name: 'trading-service', url: process.env.TRADING_SERVICE_URL || 'http://localhost:8002' },
  { name: 'ml-service', url: process.env.ML_SERVICE_URL || 'http://localhost:8000' },
  { name: 'scraper-service', url: process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001' },
];

async function checkHealth(url: string): Promise<{ status: ServiceStatus; responseTime?: number }> {
  const start = Date.now();
  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const responseTime = Date.now() - start;
    return {
      status: response.ok ? 'healthy' : 'unhealthy',
      responseTime,
    };
  } catch {
    return { status: 'unhealthy' };
  }
}

export async function GET() {
  const results = await Promise.all(
    SERVICES.map(async (service) => {
      const { status, responseTime } = await checkHealth(service.url);
      console.log(`[BFF] health/${service.name}: ${status}${responseTime !== undefined ? ` (${responseTime}ms)` : ''}`);
      return {
        name: service.name,
        status,
        url: service.url,
        lastChecked: new Date().toISOString(),
        responseTime,
      };
    })
  );

  const response: HealthCheckResponse = { services: results };
  return NextResponse.json(response);
}
