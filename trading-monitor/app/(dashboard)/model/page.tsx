'use client';

import { useState, useEffect, useCallback } from 'react';
import { ModelInfoCard } from '@/components/model/model-info-card';
import { RankingTable } from '@/components/model/ranking-table';
import { PredictionHistory } from '@/components/model/prediction-history';
import { HelpTooltip } from '@/components/ui/help-tooltip';

const MODEL_HELP_ITEMS = [
  {
    label: 'LightGBM LambdaRank',
    description: '학습-to-랭크(Learning-to-Rank) 모델. 종목 간 상대적 순위를 예측하여 상위 종목을 선별.',
  },
  {
    label: '랭킹 점수 (Score)',
    description: '모델이 예측한 상대 순위 점수. 높을수록 100일(63거래일) 후 수익률이 높을 것으로 예상.',
  },
  {
    label: '85개 피처',
    description: '기술지표(RSI, MACD 등) + 거시경제 + Z-score + 랭크 피처. etf2_db_processed에서 계산.',
  },
  {
    label: '2-fold 앙상블',
    description: 'Rolling CV로 2개 fold 모델을 학습하고 평균 점수로 최종 랭킹 결정.',
  },
  {
    color: 'bg-green-500',
    label: 'BUY (매수)',
    description: '모델이 상위 랭킹으로 판단한 종목. 포트폴리오 편입 대상.',
  },
  {
    color: 'bg-red-500',
    label: 'SELL (매도)',
    description: '모델이 하위 랭킹으로 판단한 종목. FIFO 만기 시 우선 매도 대상.',
  },
  {
    label: '예측 날짜 / 목표 날짜',
    description: '예측일로부터 약 63거래일(100일) 후가 목표일. 목표일에 실제 수익률과 비교.',
  },
];

interface ModelInfo {
  name: string;
  model_type: string;
  description: string;
  version: string;
  trained_at: string;
  feature_count: number;
  file_path: string;
}

interface RankingData {
  prediction_date: string;
  total_symbols: number;
  model_name: string;
  model_version: string;
  rankings: {
    symbol: string;
    rank: number;
    score: number;
    direction: string;
    weight: number;
    current_close: number;
  }[];
}

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

export default function ModelPage() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [history, setHistory] = useState<PredictionItem[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [modelRes, rankingRes, historyRes] = await Promise.allSettled([
      fetch('/trading/api/ml/model'),
      fetch('/trading/api/ml/ranking'),
      fetch('/trading/api/ml/history?limit=50'),
    ]);

    if (modelRes.status === 'fulfilled' && modelRes.value.ok) {
      setModelInfo(await modelRes.value.json());
    }
    if (rankingRes.status === 'fulfilled' && rankingRes.value.ok) {
      setRanking(await rankingRes.value.json());
    }
    if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
      const data = await historyRes.value.json();
      setHistory(data.predictions || []);
      setHistoryCount(data.count || 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            마지막 예측: {ranking?.prediction_date
              ? new Date(ranking.prediction_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                + ' ' + new Date(ranking.prediction_date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) + ' KST'
              : '-'}
            {ranking ? ` · ${ranking.model_name} · ${ranking.total_symbols}종목` : ''}
          </h2>
          <button onClick={fetchAll} className="text-xs text-primary hover:underline">
            새로고침
          </button>
        </div>
        <HelpTooltip title="모델 모니터링 가이드" items={MODEL_HELP_ITEMS} />
      </div>

      {/* 모델 정보 */}
      <ModelInfoCard model={modelInfo} ranking={ranking} loading={loading} />

      {/* 랭킹 테이블 */}
      <RankingTable rankings={ranking?.rankings ?? []} loading={loading} />

      {/* 예측 히스토리 */}
      <PredictionHistory predictions={history} totalCount={historyCount} loading={loading} />
    </div>
  );
}
