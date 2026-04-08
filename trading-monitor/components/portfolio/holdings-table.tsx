'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PriceChartPanel } from '@/components/chart/price-chart-panel';
import type { Holding } from '@/lib/types';

interface HoldingsTableProps {
  holdings: Holding[];
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ETF 코드</TableHead>
            <TableHead>종목명</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">매수가</TableHead>
            <TableHead className="text-right">현재가</TableHead>
            <TableHead>매수일</TableHead>
            <TableHead className="text-right">D-Day</TableHead>
            <TableHead className="text-right">손익</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((holding) => {
            const isPositive = holding.profitLossPercent >= 0;
            return (
              <TableRow
                key={holding.etfCode}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedHolding(holding)}
              >
                <TableCell className="font-mono text-xs">
                  {holding.etfCode}
                </TableCell>
                <TableCell className="font-medium">{holding.etfName}</TableCell>
                <TableCell className="text-right font-mono">{holding.quantity}</TableCell>
                <TableCell className="text-right font-mono">
                  ${holding.buyPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${holding.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{holding.buyDate}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="text-xs">
                    D+{holding.dDay}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`font-medium font-mono ${
                      isPositive ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {isPositive ? '+' : ''}${holding.profitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="ml-1 text-xs">
                      ({isPositive ? '+' : ''}
                      {holding.profitLossPercent.toFixed(2)}%)
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <PriceChartPanel
        holding={selectedHolding}
        onClose={() => setSelectedHolding(null)}
      />
    </>
  );
}
