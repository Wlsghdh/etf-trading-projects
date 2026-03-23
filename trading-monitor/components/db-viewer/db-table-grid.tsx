'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DBTableInfo } from '@/lib/types';

interface DBTableGridProps {
  tables: DBTableInfo[];
  onSelectTable: (tableName: string) => void;
  selectedTable: string | null;
}

type ViewMode = 'grid' | 'table';
type FilterTF = 'all' | 'D' | 'W' | 'M' | '1h' | '10m' | '12M';

function isRecentlyUpdated(latestDate: string | null): boolean {
  if (!latestDate) return false;
  const latest = new Date(latestDate);
  const now = new Date();
  const diffHours = (now.getTime() - latest.getTime()) / (1000 * 60 * 60);
  return diffHours < 24; // 24시간 이내 업데이트된 테이블
}

export function DBTableGrid({ tables, onSelectTable, selectedTable }: DBTableGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterTF, setFilterTF] = useState<FilterTF>('all');

  const filteredTables = filterTF === 'all' ? tables : tables.filter(t => t.timeframe === filterTF);

  return (
    <Card className="shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">테이블 현황 ({filteredTables.length})</CardTitle>
          <div className="flex rounded border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1 text-xs ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              그리드
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 text-xs ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              테이블
            </button>
          </div>
        </div>
        {/* Timeframe filter - separate row */}
        <div className="flex rounded border border-border overflow-hidden w-fit">
          {(['all', 'D', 'W', 'M', '1h', '10m', '12M'] as FilterTF[]).map(tf => (
            <button
              key={tf}
              onClick={() => setFilterTF(tf)}
              className={`px-2.5 py-1 text-xs transition-colors ${
                filterTF === tf
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tf === 'all' ? '전체' : tf}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
            {filteredTables.map(table => (
              <button
                key={table.tableName}
                onClick={() => onSelectTable(table.tableName)}
                className={`rounded-md px-2 py-1.5 text-center transition-colors cursor-pointer ${
                  selectedTable === table.tableName
                    ? 'ring-2 ring-primary bg-primary/20'
                    : isRecentlyUpdated(table.latestDate)
                    ? 'bg-green-500/10 border-2 border-white/40 hover:bg-green-500/20'
                    : table.isUpToDate
                    ? 'bg-green-500/10 border border-green-500/20 hover:bg-green-500/20'
                    : 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/20'
                }`}
                title={`${table.tableName}\n행: ${table.rowCount}\n최신: ${table.latestDate}`}
              >
                <span className="text-[10px] font-mono font-medium block truncate">
                  {table.symbol}
                </span>
                <span className="text-[9px] text-muted-foreground">{table.timeframe}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-2 font-medium text-muted-foreground">테이블</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground text-right">행 수</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground">최신 데이터</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground">상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredTables.map(table => (
                  <tr
                    key={table.tableName}
                    onClick={() => onSelectTable(table.tableName)}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${
                      selectedTable === table.tableName
                        ? 'bg-primary/10'
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="py-1.5 px-2 font-mono text-xs">{table.tableName}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{table.rowCount.toLocaleString()}</td>
                    <td className="py-1.5 px-2 font-mono text-xs">{table.latestDate}</td>
                    <td className="py-1.5 px-2">
                      <Badge variant={table.isUpToDate ? 'default' : 'destructive'} className="text-[10px]">
                        {table.isUpToDate ? '최신' : '지연'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
