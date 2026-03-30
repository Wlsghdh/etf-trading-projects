'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScraperLog, LogLevel } from '@/lib/chart-types';

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: 'text-gray-500',
  INFO: 'text-green-400',
  WARNING: 'text-yellow-400',
  ERROR: 'text-red-400',
};

const LEVEL_BG: Record<LogLevel, string> = {
  DEBUG: '',
  INFO: '',
  WARNING: '',
  ERROR: 'bg-red-500/5',
};

interface LogViewerProps {
  logs: ScraperLog[];
  isLoading: boolean;
}

export function LogViewer({ logs, isLoading }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isNearBottom);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {/* Terminal header */}
      <div className="flex items-center justify-between bg-[#161b22] px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <div className="h-3 w-3 rounded-full bg-yellow-500" />
            <div className="h-3 w-3 rounded-full bg-green-500" />
          </div>
          <span className="ml-2 text-xs text-gray-400 font-mono">
            scraper-service logs
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{logs.length}건</span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs px-2 py-0.5 rounded font-mono ${
              autoScroll
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {autoScroll ? 'AUTO' : 'PAUSED'}
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-[500px] overflow-y-auto bg-[#0d1117] p-3 font-mono text-xs"
      >
        {isLoading && logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            로그 로딩중...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            표시할 로그가 없습니다
          </div>
        ) : (
          <div className="space-y-0">
            {[...logs].reverse().map((log) => (
              <div
                key={log.id}
                className={`flex gap-2 py-0.5 ${LEVEL_BG[log.level]}`}
              >
                <span className="text-gray-600 shrink-0">
                  [{formatTime(log.timestamp)}]
                </span>
                <span className={`shrink-0 w-16 ${LEVEL_COLORS[log.level]}`}>
                  [{log.level.padEnd(7)}]
                </span>
                {log.symbol && (
                  <span className="text-blue-400 shrink-0">
                    [{log.symbol}/{log.timeframe}]
                  </span>
                )}
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  }) + ' ' + date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
