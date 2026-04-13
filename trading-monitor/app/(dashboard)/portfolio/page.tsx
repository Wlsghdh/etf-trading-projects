'use client';

import { useEffect, useState } from 'react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsTable } from '@/components/portfolio/holdings-table';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : '';
}

interface PresentBalance {
  success: boolean;
  total_purchase_amount: number;
  total_evaluation_amount: number;
  total_profit_loss: number;
  profit_loss_rate: number;
  total_deposit: number;
  withdrawable_amount: number;
  usd_buy_amount: number;
  usd_eval_amount: number;
  usd_deposit: number;
  foreign_total_krw: number;
  exchange_rate: number;
  holdings: Array<{
    code: string;
    name: string;
    quantity: number;
    avg_price: number;
    current_price: number;
    evaluation: number;
    purchase_amount: number;
    profit_loss: number;
    profit_loss_rate: number;
    exchange_code: string;
  }>;
  error?: string;
}

export default function PortfolioPage() {
  const { data: portfolio, isLoading: dbLoading } = usePortfolio();
  const [kisBalance, setKisBalance] = useState<PresentBalance | null>(null);
  const [kisLoading, setKisLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // KIS 실시간 잔고 조회 + 30초마다 갱신
  // present-balance(총액) + balance(보유종목) 두 API를 결합
  useEffect(() => {
    const fetchKIS = async () => {
      try {
        const [presRes, balRes] = await Promise.all([
          fetch('/trading/api/trading/present-balance').catch(() => null),
          fetch('/trading/api/trading/balance').catch(() => null),
        ]);

        let result: PresentBalance | null = null;

        // present-balance에서 총액 가져오기
        if (presRes?.ok) {
          result = await presRes.json();
        }

        // balance에서 보유종목 가져오기 (더 정확)
        if (balRes?.ok) {
          const balData = await balRes.json();
          const balHoldings = (balData.holdings || []).map((h: Record<string, unknown>) => ({
            code: h.code as string,
            name: (h.name as string) || (h.code as string),
            quantity: h.quantity as number,
            avg_price: h.avg_price as number,
            current_price: h.current_price as number,
            evaluation: ((h.current_price as number) || 0) * ((h.quantity as number) || 0),
            purchase_amount: ((h.avg_price as number) || 0) * ((h.quantity as number) || 0),
            profit_loss: (((h.current_price as number) || 0) - ((h.avg_price as number) || 0)) * ((h.quantity as number) || 0),
            profit_loss_rate: h.pnl_rate as number || 0,
            exchange_code: (h.exchange_code as string) || '',
          }));

          if (balHoldings.length > 0) {
            if (!result) {
              result = {
                success: true, total_purchase_amount: 0, total_evaluation_amount: 0,
                total_profit_loss: 0, profit_loss_rate: 0, total_deposit: 0,
                withdrawable_amount: 0, usd_buy_amount: 0, usd_eval_amount: 0,
                usd_deposit: 0, foreign_total_krw: 0, exchange_rate: 0, holdings: [],
              };
            }
            result.holdings = balHoldings;
            // 보유종목 기반으로 총액 재계산
            const totalBuy = balHoldings.reduce((s: number, h: { purchase_amount: number }) => s + h.purchase_amount, 0);
            const totalEval = balHoldings.reduce((s: number, h: { evaluation: number }) => s + h.evaluation, 0);
            if (totalBuy > 0 && (result.total_purchase_amount === 0 || result.holdings.length > 0)) {
              result.usd_buy_amount = totalBuy;
              result.usd_eval_amount = totalEval;
              result.total_profit_loss = totalEval - totalBuy;
              result.profit_loss_rate = totalBuy > 0 ? ((totalEval - totalBuy) / totalBuy) * 100 : 0;
            }
          }
        }

        if (result) {
          setKisBalance(result);
          setLastSync(new Date());
        }
      } catch { /* ignore */ }
      setKisLoading(false);
    };
    fetchKIS();
    const iv = setInterval(fetchKIS, 30000);
    return () => clearInterval(iv);
  }, []);

  // 일반 유저: KIS 없음
  if (typeof document !== 'undefined' && getCookie('user-role') !== 'admin') {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">KIS 계좌가 연결되지 않은 계정입니다.</p>
          <p className="text-xs mt-1">관리자에게 문의하세요.</p>
        </div>
      </div>
    );
  }

  if (dbLoading || kisLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // KIS API 우선, 실패 시 DB fallback
  const useKIS = kisBalance?.success ?? false;

  const totalInvestment = useKIS
    ? kisBalance!.total_purchase_amount || kisBalance!.usd_buy_amount
    : portfolio?.totalInvestment ?? 0;

  const totalCurrentValue = useKIS
    ? kisBalance!.total_evaluation_amount || kisBalance!.usd_eval_amount
    : portfolio?.totalCurrentValue ?? 0;

  const totalProfitLoss = useKIS
    ? kisBalance!.total_profit_loss
    : portfolio?.totalProfitLoss ?? 0;

  const totalProfitLossPercent = useKIS
    ? kisBalance!.profit_loss_rate
    : portfolio?.totalProfitLossPercent ?? 0;

  const holdingsCount = useKIS
    ? kisBalance!.holdings.length
    : portfolio?.holdings.length ?? 0;

  // 보유 종목: KIS 우선, 없으면 DB
  const displayHoldings = useKIS && kisBalance!.holdings.length > 0
    ? kisBalance!.holdings.map(h => ({
        etfCode: h.code,
        etfName: h.name || h.code,
        quantity: h.quantity,
        buyPrice: h.avg_price,
        currentPrice: h.current_price,
        buyDate: '',
        dDay: 0,
        profitLoss: h.profit_loss,
        profitLossPercent: h.profit_loss_rate,
      }))
    : portfolio?.holdings ?? [];

  const isPositive = totalProfitLoss >= 0;
  const dbHoldingsCount = portfolio?.holdings.length ?? 0;
  const showSyncWarning = useKIS && holdingsCount === 0 && dbHoldingsCount > 0;

  return (
    <div className="space-y-6">
      {/* KIS 동기화 상태 */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {useKIS ? (
            <>
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-500 font-medium">KIS Live</span>
              <span className="text-muted-foreground">실시간 손익</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-amber-500 font-medium">DB 추정</span>
              <span className="text-muted-foreground">{kisBalance?.error || 'KIS 연결 실패'}</span>
            </>
          )}
        </div>
        {lastSync && (
          <span className="text-muted-foreground">
            마지막 갱신: {lastSync.toLocaleTimeString('ko-KR')} (30초 자동)
          </span>
        )}
      </div>

      {/* 동기화 경고 */}
      {showSyncWarning && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <span className="text-amber-500 text-sm">⚠️</span>
              <div className="text-xs">
                <p className="font-semibold text-amber-500">DB와 KIS 계좌가 동기화되지 않음</p>
                <p className="text-muted-foreground mt-0.5">
                  DB에 {dbHoldingsCount}개 매수 기록이 있지만 실제 KIS 계좌는 비어있습니다.
                  KIS 모의계좌가 리셋되었을 가능성이 있습니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 투자금
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              <span className="text-base text-muted-foreground mr-1">$</span>
              {totalInvestment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              현재 평가금액
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              <span className="text-base text-muted-foreground mr-1">$</span>
              {totalCurrentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              <NumberTicker value={holdingsCount} /> 종목 보유
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 손익
              {useKIS && <Badge variant="outline" className="ml-2 text-[9px]">KIS</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-semibold ${
                isPositive ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {isPositive ? '+' : ''}
              <span className="text-base mr-1">$</span>
              {totalProfitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-2 text-sm">
                ({isPositive ? '+' : ''}
                {totalProfitLossPercent.toFixed(2)}%)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            보유 종목
            <Badge variant="outline" className="text-[10px]">
              {useKIS ? `KIS ${holdingsCount}개` : `DB ${holdingsCount}개`}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {displayHoldings.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              보유 종목이 없습니다
            </div>
          ) : (
            <HoldingsTable holdings={displayHoldings} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
