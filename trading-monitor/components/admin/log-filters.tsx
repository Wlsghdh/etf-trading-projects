'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LogFilter, LogLevel } from '@/lib/chart-types';

const LOG_LEVELS: (LogLevel | 'ALL')[] = ['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR'];

const LEVEL_COLORS: Record<string, string> = {
  ALL: '',
  DEBUG: 'bg-gray-500/20 text-gray-400',
  INFO: 'bg-green-500/20 text-green-400',
  WARNING: 'bg-yellow-500/20 text-yellow-400',
  ERROR: 'bg-red-500/20 text-red-400',
};

const LIMIT_OPTIONS = [50, 100, 200, 500];

interface LogFiltersProps {
  filters: LogFilter;
  onFiltersChange: (filters: LogFilter) => void;
}

export function LogFilters({ filters, onFiltersChange }: LogFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Level filter */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">레벨</span>
        {LOG_LEVELS.map((level) => (
          <button
            key={level}
            onClick={() => onFiltersChange({ ...filters, level })}
            className="outline-none"
          >
            <Badge
              variant={filters.level === level ? 'default' : 'outline'}
              className={`cursor-pointer text-xs ${
                filters.level === level ? '' : LEVEL_COLORS[level]
              }`}
            >
              {level}
            </Badge>
          </button>
        ))}
      </div>

      {/* Symbol filter */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">심볼</span>
        <input
          type="text"
          value={filters.symbol}
          onChange={(e) =>
            onFiltersChange({ ...filters, symbol: e.target.value })
          }
          placeholder="예: 069500"
          className="h-7 w-28 rounded-md border border-border bg-background px-2 text-xs font-mono focus:border-ring focus:outline-none"
        />
      </div>

      {/* Limit select */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">건수</span>
        <select
          value={filters.limit}
          onChange={(e) =>
            onFiltersChange({ ...filters, limit: Number(e.target.value) })
          }
          className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:border-ring focus:outline-none"
        >
          {LIMIT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}건
            </option>
          ))}
        </select>
      </div>

      {/* Auto refresh toggle */}
      <Button
        variant={filters.autoRefresh ? 'default' : 'outline'}
        size="xs"
        onClick={() =>
          onFiltersChange({ ...filters, autoRefresh: !filters.autoRefresh })
        }
      >
        {filters.autoRefresh ? '자동갱신 ON' : '자동갱신 OFF'}
      </Button>
    </div>
  );
}
