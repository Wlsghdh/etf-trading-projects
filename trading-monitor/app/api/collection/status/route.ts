import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

interface CollectorStatus {
  id: string;
  name: string;
  source: string;
  description: string;
  status: 'running' | 'completed' | 'error' | 'idle' | 'partial' | 'unknown' | 'planned';
  lastRun: string | null;
  lastSuccess: string | null;
  totalItems: number | null;
  successCount: number | null;
  errorCount: number | null;
  successRate: number | null;
  currentItem: string | null;
  duration: string | null;
  recentJobs: RecentJob[];
}

interface RecentJob {
  jobId: string;
  startTime: string;
  endTime: string | null;
  status: string;
  logCount: number;
  errorCount: number;
}

function calcDuration(start: string, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diffMs = e - s;
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

async function fetchScraperStatus(): Promise<CollectorStatus> {
  const base: CollectorStatus = {
    id: 'tradingview-scraper',
    name: 'TradingView Scraper',
    source: 'TradingView',
    description: '1000종목 OHLCV (1D/5D/1M/1Y)',
    status: 'unknown',
    lastRun: null,
    lastSuccess: null,
    totalItems: null,
    successCount: null,
    errorCount: null,
    successRate: null,
    currentItem: null,
    duration: null,
    recentJobs: [],
  };

  try {
    // Current status
    const [statusRes, jobsRes, configRes] = await Promise.all([
      fetch(`${SCRAPER_URL}/jobs/status`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${SCRAPER_URL}/jobs/jobs?limit=5`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${SCRAPER_URL}/jobs/symbols/configured`, { signal: AbortSignal.timeout(5000) }),
    ]);

    if (statusRes.ok) {
      const data = await statusRes.json();
      const progress = data.progress || {};
      base.status = data.status || 'idle';
      base.currentItem = data.current_symbol || null;
      base.totalItems = progress.total || null;
      base.errorCount = (progress.errors || []).length;
      base.lastRun = data.start_time || null;
      base.duration = calcDuration(data.start_time, data.end_time);

      // Calculate success: completed symbols = total processed - errors
      const processed = progress.current || 0;
      base.successCount = Math.max(0, processed - (base.errorCount ?? 0));
      if (processed > 0 && base.successCount !== null) {
        base.successRate = Math.round((base.successCount / processed) * 100);
      }
    }

    if (configRes.ok) {
      const config = await configRes.json();
      base.totalItems = config.count || base.totalItems;
    }

    if (jobsRes.ok) {
      const jobsData = await jobsRes.json();
      base.recentJobs = (jobsData.jobs || []).map((j: Record<string, unknown>) => ({
        jobId: j.job_id as string,
        startTime: j.start_time as string,
        endTime: j.end_time as string | null,
        status: (j.error_count as number) > 0 ? 'partial' : 'completed',
        logCount: j.log_count as number,
        errorCount: j.error_count as number,
      }));

      // Find last successful job
      const successJob = base.recentJobs.find((j) => j.errorCount === 0);
      if (successJob) base.lastSuccess = successJob.startTime;
    }
  } catch {
    base.status = 'unknown';
  }

  return base;
}

async function fetchMarketDataStatus(): Promise<CollectorStatus> {
  const base: CollectorStatus = {
    id: 'market-data',
    name: 'Market Data',
    source: 'Yahoo Finance + FRED + Exchange Rates',
    description: 'VIX, 금리, 유가, 환율 등 11개 지표',
    status: 'unknown',
    lastRun: null,
    lastSuccess: null,
    totalItems: 11,
    successCount: null,
    errorCount: null,
    successRate: null,
    currentItem: null,
    duration: null,
    recentJobs: [],
  };

  try {
    const [statusRes, logsRes] = await Promise.all([
      fetch(`${SCRAPER_URL}/market-data/status`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${SCRAPER_URL}/market-data/logs?limit=5`, { signal: AbortSignal.timeout(5000) }),
    ]);

    if (statusRes.ok) {
      const data = await statusRes.json();
      base.status = data.status || 'idle';
    }

    if (logsRes.ok) {
      const logsData = await logsRes.json();
      const logs = logsData.logs || [];

      base.recentJobs = logs.map((l: Record<string, unknown>) => ({
        jobId: l.job_id as string,
        startTime: l.started_at as string,
        endTime: l.finished_at as string | null,
        status: l.status as string,
        logCount: (l.total_metrics as number) || 0,
        errorCount: (l.fail_count as number) || 0,
      }));

      if (logs.length > 0) {
        const latest = logs[0];
        base.lastRun = latest.started_at;
        base.successCount = latest.success_count || 0;
        base.errorCount = latest.fail_count || 0;
        base.totalItems = latest.total_metrics || 11;
        base.duration = calcDuration(latest.started_at, latest.finished_at);
        if (base.totalItems && base.totalItems > 0 && base.successCount !== null) {
          base.successRate = Math.round((base.successCount / base.totalItems) * 100);
        }
        if (latest.status === 'completed' && (base.errorCount ?? 0) === 0) {
          base.lastSuccess = latest.started_at;
        }
      }
    }
  } catch {
    base.status = 'unknown';
  }

  return base;
}

async function fetchFeatureStatus(): Promise<CollectorStatus> {
  const base: CollectorStatus = {
    id: 'feature-pipeline',
    name: 'Feature Pipeline',
    source: 'MySQL + YFinance + FRED',
    description: '85개 기술지표 + 거시경제 피처 생성',
    status: 'unknown',
    lastRun: null,
    lastSuccess: null,
    totalItems: null,
    successCount: null,
    errorCount: null,
    successRate: null,
    currentItem: null,
    duration: null,
    recentJobs: [],
  };

  try {
    const statusRes = await fetch(`${SCRAPER_URL}/features/status`, {
      signal: AbortSignal.timeout(5000),
    });

    if (statusRes.ok) {
      const data = await statusRes.json();
      base.status = data.status || 'idle';
      base.totalItems = data.total || null;
      base.successCount = data.progress || null;
      if (base.totalItems && base.totalItems > 0 && base.successCount !== null) {
        base.successRate = Math.round((base.successCount / base.totalItems) * 100);
      }
    }
  } catch {
    base.status = 'unknown';
  }

  return base;
}

async function fetchEdgarStatus(): Promise<CollectorStatus> {
  const base: CollectorStatus = {
    id: 'sec-edgar',
    name: 'SEC Edgar (전자공시)',
    source: 'SEC EDGAR API (edgartools)',
    description: '10-K, 10-Q 미국 공시 데이터',
    status: 'unknown',
    lastRun: null,
    lastSuccess: null,
    totalItems: null,
    successCount: null,
    errorCount: null,
    successRate: null,
    currentItem: null,
    duration: null,
    recentJobs: [],
  };

  try {
    const [statusRes, logsRes] = await Promise.all([
      fetch(`${SCRAPER_URL}/edgar/status`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${SCRAPER_URL}/edgar/logs?limit=5`, { signal: AbortSignal.timeout(5000) }),
    ]);

    if (statusRes.ok) {
      const data = await statusRes.json();
      base.status = data.status || 'idle';
      base.currentItem = data.current_symbol || null;
      base.totalItems = data.total || null;
      base.successCount = data.progress ? data.progress - (data.errors?.length || 0) : null;
      base.errorCount = data.errors?.length || 0;
      if (data.total && data.total > 0 && base.successCount !== null) {
        base.successRate = Math.round((base.successCount / data.total) * 100);
      }
    }

    if (logsRes.ok) {
      const logsData = await logsRes.json();
      base.recentJobs = (logsData.logs || []).map((l: Record<string, unknown>) => ({
        jobId: l.job_id as string,
        startTime: l.started_at as string,
        endTime: l.finished_at as string | null,
        status: l.status as string,
        logCount: (l.success_count as number) + (l.fail_count as number) || 0,
        errorCount: (l.fail_count as number) || 0,
      }));
      if (logsData.logs?.length > 0) {
        base.lastRun = logsData.logs[0].started_at;
      }
    }
  } catch {
    base.status = 'idle';
  }

  return base;
}

function createPlannedCollector(
  id: string,
  name: string,
  source: string,
  description: string
): CollectorStatus {
  return {
    id,
    name,
    source,
    description,
    status: 'planned',
    lastRun: null,
    lastSuccess: null,
    totalItems: null,
    successCount: null,
    errorCount: null,
    successRate: null,
    currentItem: null,
    duration: null,
    recentJobs: [],
  };
}

export async function GET() {
  try {
    const [scraper, marketData, features] = await Promise.all([
      fetchScraperStatus(),
      fetchMarketDataStatus(),
      fetchFeatureStatus(),
    ]);

    // B. SEC Edgar (해외 전자공시) - 실서비스 연동
    const secEdgar = await fetchEdgarStatus();

    // C. 뉴스 수집 - 구현 중
    const newsCollector = createPlannedCollector(
      'news-collector',
      'News Collector (뉴스)',
      'News API / Web Scraping',
      '종목별 관련 기사 수집 및 중복 제거 (구현 중)'
    );

    return NextResponse.json({
      collectors: [scraper, marketData, features, secEdgar, newsCollector],
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch collection status' },
      { status: 500 }
    );
  }
}
