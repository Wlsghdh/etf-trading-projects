'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FeatureStatus {
  status: string;
  message: string;
  progress: number;
  total: number;
}

interface FeatureStatusCardProps {
  status: FeatureStatus | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; badge: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  idle: { label: '대기', color: 'bg-muted-foreground', badge: 'outline' },
  pending: { label: '준비 중', color: 'bg-yellow-500', badge: 'secondary' },
  running: { label: '실행 중', color: 'bg-blue-500 animate-pulse', badge: 'default' },
  completed: { label: '완료', color: 'bg-green-500', badge: 'secondary' },
  failed: { label: '실패', color: 'bg-red-500', badge: 'destructive' },
};

export function FeatureStatusCard({ status }: FeatureStatusCardProps) {
  const s = status?.status || 'idle';
  const config = STATUS_MAP[s] || STATUS_MAP.idle;
  const progress = status?.total ? Math.round((status.progress / status.total) * 100) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">피처 엔지니어링 상태</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
            <span className="text-lg font-bold">{config.label}</span>
          </div>
          <Badge variant={config.badge} className="text-[10px] mt-1">{s}</Badge>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">진행률</p>
          <p className="text-2xl font-bold mt-1">
            {status?.progress || 0}
            <span className="text-base text-muted-foreground">/{status?.total || 0}</span>
          </p>
          {status?.total ? (
            <div className="h-1.5 w-full rounded-full bg-muted mt-2 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-sm md:col-span-2">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">메시지</p>
          <p className="text-sm mt-2 font-mono break-all">
            {status?.message || '작업 없음'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
