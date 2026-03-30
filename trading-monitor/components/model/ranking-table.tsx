'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SymbolDetailModal } from './symbol-detail-modal';

interface RankingItem {
  symbol: string;
  rank: number;
  score: number;
  direction: string;
  weight: number;
  current_close: number;
}

interface RankingTableProps {
  rankings: RankingItem[];
  loading: boolean;
}

export function RankingTable({ rankings, loading }: RankingTableProps) {
  const [showAll, setShowAll] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<RankingItem | null>(null);
  const displayed = showAll ? rankings : rankings.slice(0, 20);

  if (loading) {
    return <Card className="shadow-sm"><CardContent className="pt-6 h-40 animate-pulse" /></Card>;
  }

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">종목 랭킹 (최신 예측)</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{rankings.length}종목</Badge>
            {rankings.length > 20 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-primary hover:underline"
              >
                {showAll ? '상위 20개만' : '전체 보기'}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {rankings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">예측 데이터 없음</p>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-2 w-12 font-medium text-muted-foreground">#</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">종목</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground text-right">점수</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground text-right">현재가</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">방향</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((item) => (
                    <tr
                      key={item.symbol}
                      onClick={() => setSelectedSymbol(item)}
                      className="border-b border-border/30 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="py-1.5 px-2 text-muted-foreground tabular-nums">{item.rank}</td>
                      <td className="py-1.5 px-2 font-mono font-medium text-primary">{item.symbol}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        <span className={item.score > 0 ? 'text-green-500' : 'text-red-500'}>
                          {item.score.toFixed(4)}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">${item.current_close.toFixed(2)}</td>
                      <td className="py-1.5 px-2">
                        <Badge
                          variant={item.direction === 'BUY' ? 'default' : 'destructive'}
                          className="text-[10px]"
                        >
                          {item.direction}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSymbol && (
        <SymbolDetailModal
          symbol={selectedSymbol.symbol}
          currentPrice={selectedSymbol.current_close}
          score={selectedSymbol.score}
          rank={selectedSymbol.rank}
          direction={selectedSymbol.direction}
          onClose={() => setSelectedSymbol(null)}
        />
      )}
    </>
  );
}
