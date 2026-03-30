'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FeatureGroup {
  name: string;
  color: string;
  features: string[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    name: '가격 기반',
    color: 'bg-blue-500',
    features: ['open', 'high', 'low', 'close', 'volume', 'returns_1d', 'returns_5d', 'returns_20d', 'log_returns'],
  },
  {
    name: '기술지표 (모멘텀)',
    color: 'bg-green-500',
    features: ['rsi_14', 'rsi_28', 'macd', 'macd_signal', 'macd_hist', 'stoch_k', 'stoch_d', 'williams_r', 'cci_20', 'roc_10', 'roc_20'],
  },
  {
    name: '기술지표 (추세)',
    color: 'bg-purple-500',
    features: ['sma_5', 'sma_10', 'sma_20', 'sma_50', 'sma_200', 'ema_12', 'ema_26', 'adx_14', 'di_plus', 'di_minus', 'aroon_up', 'aroon_down'],
  },
  {
    name: '기술지표 (변동성)',
    color: 'bg-orange-500',
    features: ['bb_upper', 'bb_middle', 'bb_lower', 'bb_width', 'bb_pctb', 'atr_14', 'volatility_20', 'volatility_60'],
  },
  {
    name: '기술지표 (거래량)',
    color: 'bg-cyan-500',
    features: ['obv', 'vwap', 'volume_sma_20', 'volume_ratio', 'mfi_14'],
  },
  {
    name: '거시경제',
    color: 'bg-yellow-500',
    features: ['vix', 'dxy', 'us10y', 'us2y', 'yield_spread', 'crude_oil', 'gold', 'sp500_returns'],
  },
  {
    name: 'Z-score / 랭크',
    color: 'bg-pink-500',
    features: ['close_zscore', 'volume_zscore', 'rsi_zscore', 'returns_rank', 'volume_rank', 'volatility_rank', 'momentum_rank'],
  },
];

export function FeatureColumns() {
  const [expanded, setExpanded] = useState(false);
  const totalFeatures = FEATURE_GROUPS.reduce((sum, g) => sum + g.features.length, 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">피처 컬럼 구성 ({totalFeatures}개)</CardTitle>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? '접기' : '펼치기'}
        </button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_GROUPS.map(group => (
            <div key={group.name} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`h-2.5 w-2.5 rounded-full ${group.color}`} />
                <span className="text-sm font-medium">{group.name}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">{group.features.length}</Badge>
              </div>
              {expanded && (
                <div className="flex flex-wrap gap-1">
                  {group.features.map(f => (
                    <span key={f} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
