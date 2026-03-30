'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PredictionItem {
  id: number;
  symbol: string;
  prediction_date: string;
  target_date: string;
  current_close: number;
  predicted_close: number;
  predicted_direction: string;
  confidence: number;
  actual_close: number | null;
  actual_return: number | null;
  is_correct: boolean | null;
  days_elapsed: number;
}

interface PredictionHistoryProps {
  predictions: PredictionItem[];
  totalCount: number;
  loading: boolean;
}

export function PredictionHistory({ predictions, totalCount, loading }: PredictionHistoryProps) {
  if (loading) {
    return <Card className="shadow-sm"><CardContent className="pt-6 h-40 animate-pulse" /></Card>;
  }

  const withResult = predictions.filter(p => p.actual_close !== null);
  const correct = withResult.filter(p => p.is_correct);
  const accuracy = withResult.length > 0 ? (correct.length / withResult.length * 100).toFixed(1) : null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">예측 히스토리</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">총 {totalCount}건</Badge>
          {accuracy !== null && (
            <Badge variant="default" className="text-xs">
              적중률 {accuracy}% ({correct.length}/{withResult.length})
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {predictions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">예측 히스토리 없음</p>
        ) : (
          <div className="overflow-auto max-h-[400px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border text-left">
                  <th className="py-2 px-2 font-medium text-muted-foreground">종목</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground">예측일</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground text-right">현재가</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground text-right">예측가</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground">방향</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground text-right">신뢰도</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground text-right">실제</th>
                  <th className="py-2 px-2 font-medium text-muted-foreground">적중</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((p) => {
                  const expectedReturn = ((p.predicted_close - p.current_close) / p.current_close * 100);
                  return (
                    <tr key={p.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-1.5 px-2 font-mono font-medium">{p.symbol}</td>
                      <td className="py-1.5 px-2 text-xs text-muted-foreground">
                        {new Date(p.prediction_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">${p.current_close.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        <span className={expectedReturn >= 0 ? 'text-green-500' : 'text-red-500'}>
                          ${p.predicted_close.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-1.5 px-2">
                        <Badge
                          variant={p.predicted_direction === 'UP' ? 'default' : 'destructive'}
                          className="text-[10px]"
                        >
                          {p.predicted_direction}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{(p.confidence * 100).toFixed(0)}%</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {p.actual_return !== null
                          ? <span className={p.actual_return >= 0 ? 'text-green-500' : 'text-red-500'}>
                              {p.actual_return >= 0 ? '+' : ''}{p.actual_return.toFixed(2)}%
                            </span>
                          : <span className="text-muted-foreground">D-{p.days_elapsed}</span>
                        }
                      </td>
                      <td className="py-1.5 px-2">
                        {p.is_correct !== null ? (
                          <span className={p.is_correct ? 'text-green-500' : 'text-red-500'}>
                            {p.is_correct ? 'O' : 'X'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
