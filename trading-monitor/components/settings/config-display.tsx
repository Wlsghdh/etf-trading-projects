'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { TradingConfig } from '@/lib/types';

interface ConfigDisplayProps {
  config: TradingConfig;
}

export function ConfigDisplay({ config }: ConfigDisplayProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">현재 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">매매 모드</span>
          <Badge variant={config.mode === 'live' ? 'default' : 'secondary'}>
            {config.mode === 'live' ? '실투자' : '모의투자'}
          </Badge>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-medium">사이클 설정</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">단기 사이클</div>
            <div className="font-medium text-right">{config.shortCycleDays}일</div>
            <div className="text-muted-foreground">장기 사이클</div>
            <div className="font-medium text-right">{config.longCycleDays}일</div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-medium">투자 비율</h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">AI 선정 종목</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${config.strategyRatio.activeAI}%` }} />
                </div>
                <span className="font-medium w-8 text-right">{config.strategyRatio.activeAI}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">벤치마크 ETF</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${config.strategyRatio.benchmark}%` }} />
                </div>
                <span className="font-medium w-8 text-right">{config.strategyRatio.benchmark}%</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-medium">기타 설정</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">자본금</div>
            <div className="font-medium text-right">${config.capital.toLocaleString()}</div>
            <div className="text-muted-foreground">최대 보유</div>
            <div className="font-medium text-right">{config.maxHoldings}종목</div>
            <div className="text-muted-foreground">리밸런싱 시간</div>
            <div className="font-medium text-right">{config.rebalanceTime} KST</div>
            <div className="text-muted-foreground">벤치마크</div>
            <div className="font-medium text-right">{config.benchmarkETF}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
