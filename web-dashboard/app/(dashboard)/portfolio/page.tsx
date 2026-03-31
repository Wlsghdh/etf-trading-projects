"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchPortfolio, type Portfolio } from "@/lib/trading-api"
import { fetchPredictions, type Prediction } from "@/lib/api"
import { portfolio as dummyPortfolio, predictions as dummyPredictions } from "@/lib/data"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Pie, PieChart as RechartsPie, Cell } from "recharts"

const COLORS = [
  "var(--chart-pie-1)",
  "var(--chart-pie-2)",
  "var(--chart-pie-3)",
  "var(--chart-pie-4)",
  "var(--chart-pie-5)",
]

interface HoldingDisplay {
  symbol: string
  name: string
  quantity: number
  avgPrice: number
  currentPrice: number
  totalValue: number
  profit: number
  profitPercent: number
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<HoldingDisplay[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [usingRealData, setUsingRealData] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        // 예측 데이터 로드
        try {
          const preds = await fetchPredictions()
          setPredictions(preds)
        } catch {
          setPredictions(dummyPredictions)
        }

        // 포트폴리오 실데이터 로드
        try {
          const portfolioData = await fetchPortfolio()
          if (portfolioData.holdings.length > 0) {
            // 종목별 그룹핑
            const grouped: Record<string, { totalAmount: number; quantity: number; prices: number[] }> = {}
            for (const h of portfolioData.holdings) {
              if (!grouped[h.etf_code]) grouped[h.etf_code] = { totalAmount: 0, quantity: 0, prices: [] }
              grouped[h.etf_code].totalAmount += h.total_amount
              grouped[h.etf_code].quantity += h.quantity
              grouped[h.etf_code].prices.push(h.price)
            }

            const display: HoldingDisplay[] = Object.entries(grouped).map(([symbol, data]) => {
              const avgPrice = data.totalAmount / data.quantity
              return {
                symbol,
                name: symbol,
                quantity: data.quantity,
                avgPrice,
                currentPrice: avgPrice, // 현재가는 별도 조회 필요
                totalValue: data.totalAmount,
                profit: 0,
                profitPercent: 0,
              }
            }).sort((a, b) => b.totalValue - a.totalValue)

            setHoldings(display)
            setUsingRealData(true)
          }
        } catch {
          // 실데이터 실패 → 더미 폴백
        }
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // 폴백
  const portfolio = holdings.length > 0 ? holdings : dummyPortfolio

  const totalValue = portfolio.reduce((sum, item) => sum + item.totalValue, 0)
  const totalProfit = portfolio.reduce((sum, item) => sum + item.profit, 0)
  const totalCost = portfolio.reduce((sum, item) => sum + item.avgPrice * item.quantity, 0)
  const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

  const profitableCount = portfolio.filter(p => p.profit > 0).length
  const lossCount = portfolio.filter(p => p.profit <= 0).length

  const pieData = portfolio.slice(0, 10).map((item, index) => ({
    name: item.symbol,
    value: item.totalValue,
    fill: COLORS[index % COLORS.length],
  }))

  const chartConfig = {
    value: { label: "가치" },
    ...Object.fromEntries(
      portfolio.slice(0, 10).map((item, index) => [
        item.symbol,
        { label: item.symbol, color: COLORS[index % COLORS.length] },
      ])
    ),
  } satisfies ChartConfig

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">포트폴리오</h2>
        <p className="text-muted-foreground">
          {usingRealData ? "실시간 보유 종목 현황 (Trading Service 연동)" : "보유 종목 현황 및 자산 배분 (데모 데이터)"}
        </p>
      </div>

      {!usingRealData && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Trading 서비스 연결 불가 - 데모 데이터 표시 중</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">총 자산</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">{portfolio.length}개 종목 보유</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">총 수익</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
              {totalProfit >= 0 ? "+" : ""}${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className={`text-xs ${totalReturn >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
              {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(2)}% 수익률
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-profit-positive" />
              수익 종목
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-profit-positive">{profitableCount}</div>
            <p className="text-xs text-muted-foreground">
              전체의 {portfolio.length > 0 ? ((profitableCount / portfolio.length) * 100).toFixed(0) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-profit-negative" />
              손실 종목
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-profit-negative">{lossCount}</div>
            <p className="text-xs text-muted-foreground">
              전체의 {portfolio.length > 0 ? ((lossCount / portfolio.length) * 100).toFixed(0) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* 자산 배분 차트 */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>자산 배분</CardTitle>
            <CardDescription>종목별 비중 (상위 10개)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px]">
              <RechartsPie>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                />
              </RechartsPie>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* 보유 종목 테이블 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>보유 종목 상세</CardTitle>
            <CardDescription>종목별 수익 현황</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목</TableHead>
                  <TableHead className="text-right">수량</TableHead>
                  <TableHead className="text-right">평균단가</TableHead>
                  <TableHead className="text-right">평가금액</TableHead>
                  <TableHead className="text-right">수익</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolio.map((item) => {
                  const prediction = predictions.find(p => p.symbol === item.symbol)
                  return (
                    <TableRow key={item.symbol}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium">{item.symbol}</div>
                            <div className="text-xs text-muted-foreground">{item.name}</div>
                          </div>
                          {prediction && (
                            <Badge
                              variant={
                                prediction.signal === "BUY" ? "default" :
                                  prediction.signal === "SELL" ? "destructive" : "secondary"
                              }
                              className={`text-xs ${prediction.signal === "BUY" ? "bg-signal-buy" : ""}`}
                            >
                              {prediction.signal === "BUY" ? "매수" :
                                prediction.signal === "SELL" ? "매도" : "관망"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">${item.avgPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${item.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.profit !== 0 ? (
                          <>
                            <div className={`flex items-center justify-end gap-1 ${item.profit >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
                              {item.profit >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              <span className="font-medium">
                                {item.profit >= 0 ? "+" : ""}{item.profitPercent.toFixed(2)}%
                              </span>
                            </div>
                            <div className={`text-xs ${item.profit >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
                              {item.profit >= 0 ? "+" : ""}${item.profit.toLocaleString()}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
