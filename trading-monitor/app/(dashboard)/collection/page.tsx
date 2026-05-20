'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface RecentJob {
  jobId: string;
  startTime: string;
  endTime: string | null;
  status: string;
  logCount: number;
  errorCount: number;
}

interface CollectorStatus {
  id: string;
  name: string;
  source: string;
  description: string;
  status: string;
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

interface CollectionResponse {
  collectors: CollectorStatus[];
  updatedAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    running: { label: '수집 중', className: 'bg-blue-500 text-white hover:bg-blue-600' },
    completed: { label: '완료', className: 'bg-green-500 text-white hover:bg-green-600' },
    partial: { label: '부분완료', className: 'bg-yellow-500 text-white hover:bg-yellow-600' },
    error: { label: '에러', className: 'bg-red-500 text-white hover:bg-red-600' },
    idle: { label: '대기', className: 'bg-muted text-muted-foreground' },
    planned: { label: '미구현', className: 'bg-purple-500/20 text-purple-500 border border-purple-500/30' },
    unknown: { label: '연결 실패', className: 'bg-muted text-muted-foreground' },
  };
  const v = variants[status] || variants.unknown;
  return <Badge className={v.className}>{v.label}</Badge>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  return d.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SummaryCards({ collectors }: { collectors: CollectorStatus[] }) {
  const running = collectors.filter((c) => c.status === 'running').length;
  const totalSuccess = collectors.reduce((sum, c) => sum + (c.successRate || 0), 0);
  const avgRate = collectors.length > 0 ? Math.round(totalSuccess / collectors.length) : 0;
  const totalErrors = collectors.reduce((sum, c) => sum + (c.errorCount || 0), 0);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>수집기 총 수</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{collectors.length}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>현재 실행 중</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-500">{running}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>평균 성공률</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">{avgRate}%</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>총 에러</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-500">{totalErrors}</div>
        </CardContent>
      </Card>
    </div>
  );
}

function CollectorMatrix({ collectors }: { collectors: CollectorStatus[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>수집기 현황</CardTitle>
        <CardDescription>모든 데이터 수집 시스템 상태 매트릭스</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">수집기</TableHead>
              <TableHead>데이터 소스</TableHead>
              <TableHead className="text-center">상태</TableHead>
              <TableHead className="text-center">진행</TableHead>
              <TableHead className="text-center">성공률</TableHead>
              <TableHead className="text-center">에러</TableHead>
              <TableHead>마지막 실행</TableHead>
              <TableHead>소요 시간</TableHead>
              <TableHead>현재 작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {collectors.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.description}</div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.source}</TableCell>
                <TableCell className="text-center">
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-center">
                  {c.totalItems ? (
                    <div className="space-y-1">
                      <div className="text-sm">
                        {c.successCount ?? 0}/{c.totalItems}
                      </div>
                      <Progress
                        value={
                          c.totalItems > 0
                            ? ((c.successCount ?? 0) / c.totalItems) * 100
                            : 0
                        }
                        className="h-1.5"
                      />
                    </div>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {c.successRate !== null ? (
                    <span
                      className={
                        c.successRate >= 90
                          ? 'font-semibold text-green-500'
                          : c.successRate >= 70
                            ? 'font-semibold text-yellow-500'
                            : 'font-semibold text-red-500'
                      }
                    >
                      {c.successRate}%
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {c.errorCount !== null && c.errorCount > 0 ? (
                    <span className="font-semibold text-red-500">{c.errorCount}</span>
                  ) : c.errorCount === 0 ? (
                    <span className="text-green-500">0</span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-sm">{formatDate(c.lastRun)}</TableCell>
                <TableCell className="text-sm">{c.duration || '-'}</TableCell>
                <TableCell className="text-sm font-mono">
                  {c.status === 'running' && c.currentItem ? (
                    <span className="text-blue-500">{c.currentItem}</span>
                  ) : (
                    '-'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RecentJobsTable({ collectors }: { collectors: CollectorStatus[] }) {
  // Flatten all recent jobs with collector info
  const allJobs = collectors.flatMap((c) =>
    c.recentJobs.map((j) => ({
      ...j,
      collectorName: c.name,
      collectorId: c.id,
    }))
  );

  // Sort by start time descending
  allJobs.sort((a, b) => {
    const ta = new Date(a.startTime).getTime();
    const tb = new Date(b.startTime).getTime();
    return tb - ta;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>최근 수집 이력</CardTitle>
        <CardDescription>모든 수집기의 최근 작업 로그</CardDescription>
      </CardHeader>
      <CardContent>
        {allJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">수집 이력이 없습니다.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>수집기</TableHead>
                <TableHead>Job ID</TableHead>
                <TableHead>시작 시간</TableHead>
                <TableHead>종료 시간</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead className="text-center">로그 수</TableHead>
                <TableHead className="text-center">에러</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allJobs.slice(0, 15).map((j, idx) => (
                <TableRow key={`${j.collectorId}-${j.jobId}-${idx}`}>
                  <TableCell className="font-medium">{j.collectorName}</TableCell>
                  <TableCell className="font-mono text-xs">{j.jobId}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(j.startTime)}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(j.endTime)}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={j.errorCount > 0 ? 'partial' : j.status} />
                  </TableCell>
                  <TableCell className="text-center text-sm">{j.logCount}</TableCell>
                  <TableCell className="text-center">
                    {j.errorCount > 0 ? (
                      <span className="font-semibold text-red-500">{j.errorCount}</span>
                    ) : (
                      <span className="text-green-500">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function CollectionPage() {
  const [data, setData] = useState<CollectionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/trading/api/collection/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // 15초 간격 새로고침
    return () => clearInterval(interval);
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">데이터 수집 창고</h1>
        <Card>
          <CardContent className="py-8 text-center text-red-500">
            수집 상태를 불러올 수 없습니다: {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  const collectors = data?.collectors || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">데이터 수집 창고</h1>
          <p className="text-sm text-muted-foreground">
            모든 데이터 수집 시스템의 상태와 성공률을 한눈에 확인합니다.
          </p>
        </div>
        {data?.updatedAt && (
          <span className="text-xs text-muted-foreground">
            마지막 업데이트: {formatDate(data.updatedAt)}
          </span>
        )}
      </div>

      <SummaryCards collectors={collectors} />
      <CollectorMatrix collectors={collectors} />
      <RecentJobsTable collectors={collectors} />
    </div>
  );
}
