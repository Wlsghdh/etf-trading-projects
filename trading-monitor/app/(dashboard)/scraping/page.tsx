'use client';

import { useState } from 'react';
import { JobStatusCard } from '@/components/admin/job-status-card';
import { LogViewer } from '@/components/admin/log-viewer';
import { LogFilters } from '@/components/admin/log-filters';
import { ScrapingSchedule } from '@/components/scraping/scraping-schedule';
import { ScrapingStats } from '@/components/scraping/scraping-stats';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { useScraperStatus } from '@/hooks/use-scraper-status';
import { useScraperLogs } from '@/hooks/use-scraper-logs';
import type { LogLevel, LogFilter } from '@/lib/chart-types';

const SCRAPING_HELP_ITEMS = [
  {
    color: 'bg-blue-500',
    label: '수집 중 (파란색)',
    description: '현재 스크래핑이 실행 중. 심볼별로 4개 타임프레임(1Y, 1M, 5D, 1D) 데이터를 TradingView에서 다운로드.',
  },
  {
    color: 'bg-green-500',
    label: '완료 (초록색)',
    description: 'symbols.yaml에 정의된 전체 종목 수집 완료. 에러 없이 정상 종료.',
  },
  {
    color: 'bg-red-500',
    label: '에러 (빨간색)',
    description: '수집 중 오류 발생. 로그에서 상세 원인 확인 가능.',
  },
  {
    color: 'bg-muted-foreground',
    label: '대기 (회색)',
    description: '현재 수집 작업 없음. 다음 cron 실행을 기다리는 중.',
  },
  {
    label: '진행률',
    description: '완료된 심볼 수 / 전체 심볼 수. 각 심볼은 4개 타임프레임 처리 후 완료로 카운트.',
  },
  {
    label: '에러 심볼',
    description: '스크래핑 실패한 종목 수. TradingView 응답 지연, 네트워크 오류, 상장폐지 등이 원인.',
  },
  {
    label: '로그 레벨',
    description: 'DEBUG=디버그, INFO=정상 진행, WARNING=주의(재시도 등), ERROR=실패(수동 확인 필요).',
  },
  {
    label: 'Cron 자동화',
    description: '매일 06:00 KST(월~금) 자동 실행. 미국장 마감(05:00 KST) 후 1시간 뒤.',
  },
];

export default function ScrapingPage() {
  const [logFilter, setLogFilter] = useState<LogFilter>({
    level: 'ALL',
    symbol: '',
    limit: 200,
    autoRefresh: true,
  });
  const [actionLoading, setActionLoading] = useState(false);

  const { data: scraperStatus, isLoading: scraperLoading } = useScraperStatus();
  const { data: scraperLogs, isLoading: logsLoading } = useScraperLogs(
    logFilter.level as LogLevel | 'ALL',
    logFilter.symbol,
    logFilter.limit,
    logFilter.autoRefresh,
  );

  const logs = scraperLogs?.logs ?? [];
  const errorCount = logs.filter(l => l.level === 'ERROR').length;
  const warningCount = logs.filter(l => l.level === 'WARNING').length;
  const infoCount = logs.filter(l => l.level === 'INFO').length;

  return (
    <div className="space-y-6">
      {/* 상단 통계 + 시작/중지 + 도움말 */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <ScrapingStats
            status={scraperStatus}
            errorCount={errorCount}
            warningCount={warningCount}
            infoCount={infoCount}
            totalLogs={logs.length}
          />
        </div>
        <div className="ml-4 mt-1 flex items-center gap-2">
          <button
            onClick={async () => {
              setActionLoading(true);
              try { await fetch('/trading/api/scraper/start', { method: 'POST' }); } catch {}
              setActionLoading(false);
            }}
            disabled={actionLoading || scraperStatus?.status === 'running'}
            className="px-3 py-1.5 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white transition-colors disabled:opacity-50"
          >
            {scraperStatus?.status === 'running' ? '수집 중...' : 'Start'}
          </button>
          <button
            onClick={async () => {
              setActionLoading(true);
              try { await fetch('/trading/api/scraper/stop', { method: 'POST' }); } catch {}
              setActionLoading(false);
            }}
            disabled={actionLoading || scraperStatus?.status !== 'running'}
            className="px-3 py-1.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-30"
          >
            Stop
          </button>
          <HelpTooltip title="데이터 수집 가이드" items={SCRAPING_HELP_ITEMS} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 작업 상태 + 스케줄 */}
        <div className="space-y-6">
          <JobStatusCard status={scraperStatus} isLoading={scraperLoading} />
          <ScrapingSchedule />
        </div>

        {/* 실시간 로그 */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">실시간 수집 로그</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-red-400">{errorCount} errors</span>
              <span className="text-yellow-400">{warningCount} warnings</span>
              <span className="text-green-400">{infoCount} info</span>
            </div>
          </div>
          <LogFilters filters={logFilter} onFiltersChange={setLogFilter} />
          <LogViewer logs={logs} isLoading={logsLoading} />
        </div>
      </div>
    </div>
  );
}
