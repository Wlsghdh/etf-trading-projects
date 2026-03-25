'use client';

import { useState, useEffect, useCallback } from 'react';
import { DBStatsOverview } from '@/components/db-viewer/db-stats-overview';
import { DBTableGrid } from '@/components/db-viewer/db-table-grid';
import { DBTableDetail } from '@/components/db-viewer/db-table-detail';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DBOverview } from '@/lib/types';

const DB_HELP_ITEMS = [
  { color: 'bg-green-500/30 border border-green-500/50', label: '초록색 셀 (최신)', description: '5일 이내 데이터가 있는 테이블.' },
  { color: 'bg-red-500/30 border border-red-500/50', label: '빨간색 셀 (지연)', description: '5일 이상 데이터 없음.' },
  { label: 'etf2_db (원본)', description: 'TradingView에서 스크래핑한 OHLCV 원본 데이터.' },
  { label: 'etf2_db_processed (피처)', description: '85개 기술지표 피처가 계산된 ML 학습용 DB.' },
  { label: 'trading.db (SQLite)', description: '매매 기록, 주문 로그, 사이클, 스냅샷 저장.' },
];

type DBType = 'etf2_db' | 'etf2_db_processed' | 'sqlite';

interface SQLiteTable {
  tableName: string;
  rowCount: number;
  latestDate: string | null;
  columns: { name: string; type: string }[];
}

export default function DBViewerPage() {
  const [activeDB, setActiveDB] = useState<DBType>('etf2_db');
  const [data, setData] = useState<DBOverview | null>(null);
  const [sqliteData, setSqliteData] = useState<{ tables: SQLiteTable[]; totalTables: number } | null>(null);
  const [sqliteTableData, setSqliteTableData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [sqlitePage, setSqlitePage] = useState(0);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      if (activeDB === 'sqlite') {
        const res = await fetch('/trading/api/trading/sqlite/tables');
        if (res.ok) setSqliteData(await res.json());
        setData(null);
      } else {
        const res = await fetch(`/trading/api/db/tables?db_name=${activeDB}`);
        if (res.ok) setData(await res.json());
        setSqliteData(null);
      }
    } catch (e) {
      console.error('Failed to fetch tables:', e);
    } finally {
      setLoading(false);
    }
  }, [activeDB]);

  useEffect(() => {
    fetchTables();
    // activeDB 변경 시에만 선택 초기화 (SQLite 내부 클릭은 영향 없음)
    return () => {
      setSelectedTable(null);
      setSqliteTableData(null);
    };
  }, [activeDB]); // fetchTables 대신 activeDB 직접 의존

  // SQLite 테이블 데이터 조회
  async function fetchSqliteTableData(tableName: string, page: number = 0) {
    try {
      const res = await fetch(`/trading/api/trading/sqlite/tables/${tableName}/data?limit=30&offset=${page * 30}`);
      if (res.ok) setSqliteTableData(await res.json());
    } catch { /* silent */ }
  }

  const filteredTables = data?.tables.filter(t =>
    filter ? t.symbol.toLowerCase().includes(filter.toLowerCase()) ||
             t.tableName.toLowerCase().includes(filter.toLowerCase()) : true
  ) ?? [];

  return (
    <div className="space-y-6">
      {/* 상단 컨트롤 */}
      <div className="flex items-center gap-4">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['etf2_db', 'etf2_db_processed', 'sqlite'] as DBType[]).map(db => (
            <button
              key={db}
              onClick={() => setActiveDB(db)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeDB === db
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {db === 'etf2_db' ? 'etf2_db (원본)' : db === 'etf2_db_processed' ? 'etf2_db_processed (피처)' : 'trading.db (SQLite)'}
            </button>
          ))}
        </div>

        {activeDB !== 'sqlite' && (
          <input
            type="text"
            placeholder="종목 검색 (AAPL, NVDA...)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        <button onClick={fetchTables} className="text-xs text-primary hover:underline">새로고침</button>
        {loading && <span className="text-xs text-muted-foreground">로딩 중...</span>}
        <div className="ml-auto">
          <HelpTooltip title="DB 뷰어 가이드" items={DB_HELP_ITEMS} />
        </div>
      </div>

      {/* MySQL DB */}
      {activeDB !== 'sqlite' && data && (
        <>
          <DBStatsOverview overview={data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <DBTableGrid
              tables={filteredTables}
              onSelectTable={setSelectedTable}
              selectedTable={selectedTable}
            />
            {selectedTable && (
              <DBTableDetail
                tableName={selectedTable}
                dbName={activeDB}
                onClose={() => setSelectedTable(null)}
              />
            )}
          </div>
        </>
      )}

      {/* SQLite DB */}
      {activeDB === 'sqlite' && sqliteData && (
        <div className="space-y-4">
          {/* SQLite 요약 */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">데이터베이스</p>
                <p className="text-lg font-bold font-mono">trading.db</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">테이블 수</p>
                <p className="text-2xl font-bold">{sqliteData.totalTables}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">총 행 수</p>
                <p className="text-2xl font-bold">
                  {sqliteData.tables.reduce((s, t) => s + t.rowCount, 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* SQLite 테이블 목록 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">테이블 ({sqliteData.totalTables})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sqliteData.tables.map(t => (
                  <button
                    key={t.tableName}
                    onClick={() => { setSelectedTable(t.tableName); setSqlitePage(0); fetchSqliteTableData(t.tableName, 0); }}
                    className={`w-full text-left rounded-md border p-3 transition-colors ${
                      selectedTable === t.tableName ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-sm">{t.tableName}</span>
                      <span className="text-xs text-muted-foreground">{t.rowCount.toLocaleString()}행</span>
                    </div>
                    {t.latestDate && (
                      <div className="text-xs text-muted-foreground mt-1">최신: {t.latestDate}</div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.columns.slice(0, 5).map(c => (
                        <span key={c.name} className="text-[9px] bg-muted px-1 rounded font-mono">{c.name}</span>
                      ))}
                      {t.columns.length > 5 && <span className="text-[9px] text-muted-foreground">+{t.columns.length - 5}</span>}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* SQLite 테이블 데이터 */}
            {selectedTable && sqliteTableData && (
              <Card className="shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-base font-mono">{selectedTable}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(sqliteTableData as Record<string, unknown>).total?.toLocaleString()}행 · trading.db
                    </p>
                  </div>
                  <button onClick={() => { setSelectedTable(null); setSqliteTableData(null); }} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto max-h-[500px] border border-border rounded">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          {((sqliteTableData as Record<string, unknown>).columns as Array<{name: string}>)?.map((col: {name: string}) => (
                            <th key={col.name} className="py-1.5 px-2 text-left font-medium whitespace-nowrap">{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {((sqliteTableData as Record<string, unknown>).rows as Array<Record<string, unknown>>)?.map((row: Record<string, unknown>, i: number) => (
                          <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                            {((sqliteTableData as Record<string, unknown>).columns as Array<{name: string}>)?.map((col: {name: string}) => (
                              <td key={col.name} className="py-1 px-2 whitespace-nowrap font-mono tabular-nums">
                                {row[col.name] != null ? String(row[col.name]).substring(0, 50) : <span className="text-muted-foreground">NULL</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* 페이지네이션 */}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted-foreground">
                      {sqlitePage * 30 + 1} - {Math.min((sqlitePage + 1) * 30, (sqliteTableData as Record<string, unknown>).total as number)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { const p = Math.max(0, sqlitePage - 1); setSqlitePage(p); fetchSqliteTableData(selectedTable, p); }}
                        disabled={sqlitePage === 0}
                        className="px-2 py-1 text-xs rounded border border-border disabled:opacity-30 hover:bg-muted"
                      >이전</button>
                      <button
                        onClick={() => { const p = sqlitePage + 1; setSqlitePage(p); fetchSqliteTableData(selectedTable, p); }}
                        className="px-2 py-1 text-xs rounded border border-border hover:bg-muted"
                      >다음</button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
