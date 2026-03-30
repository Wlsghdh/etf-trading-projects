'use client';

import { useState } from 'react';
import { LogViewer } from '@/components/admin/log-viewer';
import { LogFilters } from '@/components/admin/log-filters';
import { JobStatusCard } from '@/components/admin/job-status-card';
import { useScraperLogs } from '@/hooks/use-scraper-logs';
import { useScraperStatus } from '@/hooks/use-scraper-status';
import type { LogFilter } from '@/lib/chart-types';

export default function AdminPage() {
  const [filters, setFilters] = useState<LogFilter>({
    level: 'ALL',
    symbol: '',
    limit: 100,
    autoRefresh: true,
  });

  const { data: logsData, isLoading: logsLoading } = useScraperLogs(
    filters.level,
    filters.symbol,
    filters.limit,
    filters.autoRefresh
  );

  const { data: statusData, isLoading: statusLoading } = useScraperStatus();

  return (
    <div className="space-y-6">
      {/* Job Status */}
      <JobStatusCard status={statusData} isLoading={statusLoading} />

      {/* Log Filters */}
      <LogFilters filters={filters} onFiltersChange={setFilters} />

      {/* Log Viewer */}
      <LogViewer logs={logsData?.logs ?? []} isLoading={logsLoading} />
    </div>
  );
}
