'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ModelInfo {
  name: string;
  model_type: string;
  description: string;
  version: string;
  trained_at: string;
  feature_count: number;
}

interface RankingData {
  prediction_date: string;
  total_symbols: number;
  model_name: string;
  model_version: string;
}

interface ModelInfoCardProps {
  model: ModelInfo | null;
  ranking: RankingData | null;
  loading: boolean;
}

export function ModelInfoCard({ model, ranking, loading }: ModelInfoCardProps) {
  if (loading) {
    return <div className="grid gap-4 md:grid-cols-5">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="shadow-sm"><CardContent className="pt-6 h-20 animate-pulse bg-muted rounded" /></Card>
      ))}
    </div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">모델</p>
          <p className="text-lg font-bold mt-1">{model?.name || '-'}</p>
          <Badge variant="outline" className="text-[10px] mt-1">{model?.model_type || '-'}</Badge>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">버전</p>
          <p className="text-lg font-bold mt-1 font-mono">{model?.version || '-'}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {model?.trained_at ? new Date(model.trained_at).toLocaleDateString('ko-KR') : '-'}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">피처 수</p>
          <p className="text-2xl font-bold mt-1">{model?.feature_count || 0}</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">예측 종목</p>
          <p className="text-2xl font-bold mt-1">{ranking?.total_symbols || 0}</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">마지막 예측</p>
          <p className="text-lg font-bold mt-1">
            {ranking?.prediction_date
              ? new Date(ranking.prediction_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
              : '-'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {ranking?.prediction_date
              ? new Date(ranking.prediction_date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) + ' KST'
              : ''}
          </p>
          {ranking && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {ranking.model_name} v{ranking.model_version}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
