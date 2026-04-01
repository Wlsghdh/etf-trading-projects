'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PortfolioResponse, DailySummary } from '@/lib/types';
import { API_ENDPOINTS } from '@/lib/constants';

interface PortfolioSummaryProps {
  portfolio: PortfolioResponse;
}

function formatUSD(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatKRW(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`;
  if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}

export function PortfolioSummary({ portfolio }: PortfolioSummaryProps) {
  const [showAll, setShowAll] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(0);
  const isPositive = portfolio.totalProfitLoss >= 0;
  const hasHoldings = portfolio.holdings.length > 0;

  useEffect(() => {
    fetch(API_ENDPOINTS.BALANCE)
      .then(r => r.json())
      .then(d => setExchangeRate(d.exchange_rate || 0))
      .catch(() => {});
  }, []);

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              포트폴리오 요약
              {hasHoldings && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {portfolio.holdings.length}종목
                </span>
              )}
            </CardTitle>
            {hasHoldings && (
              <button onClick={() => setShowAll(true)} className="text-xs text-primary hover:underline">
                전체 보기
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">총 투자금</span>
            <div className="text-right">
              <span className="text-sm font-medium tabular-nums">{formatUSD(portfolio.totalInvestment)}</span>
              {exchangeRate > 0 && (
                <div className="text-[10px] text-muted-foreground">≈ {formatKRW(portfolio.totalInvestment * exchangeRate)}</div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">현재 평가</span>
            <div className="text-right">
              <span className="text-sm font-medium tabular-nums">{formatUSD(portfolio.totalCurrentValue)}</span>
              {exchangeRate > 0 && (
                <div className="text-[10px] text-muted-foreground">≈ {formatKRW(portfolio.totalCurrentValue * exchangeRate)}</div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">총 손익</span>
            <div className="text-right">
              <span className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}{formatUSD(portfolio.totalProfitLoss)} ({isPositive ? '+' : ''}{portfolio.totalProfitLossPercent.toFixed(2)}%)
              </span>
              {exchangeRate > 0 && (
                <div className={`text-[10px] ${isPositive ? 'text-green-500/70' : 'text-red-500/70'}`}>
                  ≈ {isPositive ? '+' : ''}{formatKRW(portfolio.totalProfitLoss * exchangeRate)}
                </div>
              )}
            </div>
          </div>
          {hasHoldings && (
            <div className="border-t border-border pt-3 space-y-1.5">
              {portfolio.holdings.slice(0, 5).map((h) => (
                <div key={h.etfCode} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium w-12">{h.etfCode}</span>
                    <span className="text-muted-foreground">{h.quantity}주 @ {formatUSD(h.buyPrice)}</span>
                  </div>
                  <span className={`font-medium tabular-nums ${h.profitLossPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {h.profitLossPercent >= 0 ? '+' : ''}{h.profitLossPercent.toFixed(2)}%
                  </span>
                </div>
              ))}
              {portfolio.holdings.length > 5 && (
                <button onClick={() => setShowAll(true)} className="text-[10px] text-primary hover:underline w-full text-center">
                  외 {portfolio.holdings.length - 5}종목 더 보기
                </button>
              )}
            </div>
          )}
          {!hasHoldings && (
            <div className="text-xs text-muted-foreground text-center py-2">보유 종목 없음</div>
          )}
        </CardContent>
      </Card>

      {showAll && <PortfolioFullView portfolio={portfolio} onClose={() => setShowAll(false)} />}
    </>
  );
}

/* ─── 전체 보기 모달 (날짜 필터 포함) ─── */

function PortfolioFullView({ portfolio, onClose }: { portfolio: PortfolioResponse; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'holdings' | 'history'>('holdings');
  const [history, setHistory] = useState<DailySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const isPositive = portfolio.totalProfitLoss >= 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    fetch(API_ENDPOINTS.HISTORY)
      .then(r => r.json())
      .then(d => setHistory(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const selectedSummary = selectedDate ? history.find(h => h.date === selectedDate) : null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
      <div className="p-6 max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">포트폴리오 상세</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {portfolio.holdings.length}종목 · {formatUSD(portfolio.totalInvestment)} ·
              <span className={isPositive ? ' text-green-400' : ' text-red-400'}>
                {' '}{isPositive ? '+' : ''}{formatUSD(portfolio.totalProfitLoss)} ({isPositive ? '+' : ''}{portfolio.totalProfitLossPercent.toFixed(2)}%)
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded border border-border overflow-hidden">
              <button
                onClick={() => { setActiveTab('holdings'); setSelectedDate(null); }}
                className={`px-3 py-1.5 text-xs ${activeTab === 'holdings' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                보유 종목
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 text-xs ${activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                매매 내역
              </button>
            </div>
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted">
              ESC 닫기
            </button>
          </div>
        </div>

        {activeTab === 'holdings' ? (
          /* ── 보유 종목 탭 ── */
          <>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">종목</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">수량</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">매수가</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">현재가</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">손익</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">수익률</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">매수일</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">D+</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.holdings.map((h, i) => {
                    const isUp = h.profitLoss >= 0;
                    return (
                      <tr key={h.etfCode} className={`border-t border-border/50 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <td className="py-2.5 px-4 font-mono font-medium">{h.etfCode}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{h.quantity}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{formatUSD(h.buyPrice)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{formatUSD(h.currentPrice)}</td>
                        <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                          {isUp ? '+' : ''}{formatUSD(h.profitLoss)}
                        </td>
                        <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                          {isUp ? '+' : ''}{h.profitLossPercent.toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">{h.buyDate}</td>
                        <td className="py-2.5 px-4 text-right text-xs text-muted-foreground">D+{h.dDay}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">총 투자금</div>
                <div className="text-lg font-bold tabular-nums">{formatUSD(portfolio.totalInvestment)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">현재 평가</div>
                <div className="text-lg font-bold tabular-nums">{formatUSD(portfolio.totalCurrentValue)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">총 손익</div>
                <div className={`text-lg font-bold tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{formatUSD(portfolio.totalProfitLoss)}
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">수익률</div>
                <div className={`text-lg font-bold tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}{portfolio.totalProfitLossPercent.toFixed(2)}%
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-3">
              장중(22:30~05:00 KST): 실시간 현재가 · 장 외: 마지막 종가 기준
            </p>
          </>
        ) : (
          /* ── 매매 내역 탭 (날짜 필터) ── */
          <div className="grid gap-4 lg:grid-cols-3">
            {/* 날짜 목록 */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">매매 일자</h3>
              {history.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4">매매 내역 없음</div>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {history.map(h => (
                    <button
                      key={h.date}
                      onClick={() => setSelectedDate(h.date)}
                      className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                        selectedDate === h.date
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {new Date(h.date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                          {h.buyCount > 0 && <Badge variant="default" className="text-[10px]">매수 {h.buyCount}</Badge>}
                          {h.sellCount > 0 && <Badge variant="destructive" className="text-[10px]">매도 {h.sellCount}</Badge>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 선택된 날짜의 상세 */}
            <div className="lg:col-span-2">
              {selectedSummary ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">
                    {new Date(selectedSummary.date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                  </h3>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-[10px] text-muted-foreground">매수</div>
                      <div className="text-lg font-bold text-red-400">{selectedSummary.buyCount}건</div>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-[10px] text-muted-foreground">매도</div>
                      <div className="text-lg font-bold text-cyan-400">{selectedSummary.sellCount}건</div>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-[10px] text-muted-foreground">손익</div>
                      <div className={`text-lg font-bold ${selectedSummary.totalProfitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {selectedSummary.totalProfitLoss >= 0 ? '+' : ''}{formatUSD(selectedSummary.totalProfitLoss)}
                      </div>
                    </div>
                  </div>

                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">구분</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">종목</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">수량</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">가격</th>
                          <th className="text-right py-2 px-3 font-medium text-muted-foreground">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSummary.trades.map((t, i) => (
                          <tr key={t.id || i} className="border-t border-border/50">
                            <td className="py-2 px-3">
                              <Badge variant={t.side === 'BUY' ? 'default' : 'destructive'} className="text-[10px]">
                                {t.side === 'BUY' ? '매수' : '매도'}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-mono font-medium">{t.etfCode}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{t.quantity}주</td>
                            <td className="py-2 px-3 text-right tabular-nums">{formatUSD(t.price)}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{formatUSD(t.price * t.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                  왼쪽에서 날짜를 선택하세요
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
