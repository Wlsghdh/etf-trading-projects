"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Briefcase, LineChart, TrendingUp, DollarSign, AlertCircle, FileText, ChevronRight } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchPredictions, checkHealth, fetchLatestFactsheet, type Prediction, type MonthlyFactsheet } from "@/lib/api"
import { fetchPortfolio, fetchSnapshots, type Portfolio, type SnapshotData } from "@/lib/trading-api"
import { SNOWBALLING_ETF } from "@/lib/types/snowballing-etf"
import { Button } from "@/components/ui/button"
import { portfolio as dummyPortfolio, returns as dummyReturns } from "@/lib/data"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Area, AreaChart, XAxis, YAxis } from "recharts"

const chartConfig = {
  portfolioValue: {
    label: "포트폴리오 가치",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

interface HoldingDisplay {
  symbol: string
  name: string
  totalValue: number
  profit: number
  profitPercent: number
}

export default function DashboardPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [apiStatus, setApiStatus] = useState<"ok" | "error" | "loading">("loading")
  const [latestFactsheet, setLatestFactsheet] = useState<MonthlyFactsheet | null>(null)
  const [holdings, setHoldings] = useState<HoldingDisplay[]>([])
  const [totalInvested, setTotalInvested] = useState(0)
  const [holdingsCount, setHoldingsCount] = useState(0)
  const [chartData, setChartData] = useState<{ date: string; portfolioValue: number }[]>([])
  const [usingRealData, setUsingRealData] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [predictionsData, health] = await Promise.all([
          fetchPredictions(),
          checkHealth(),
        ])
        setPredictions(predictionsData)
        setApiStatus(health.status === "unhealthy" ? "error" : "ok")

        try {
          const factsheet = await fetchLatestFactsheet()
          setLatestFactsheet(factsheet)
        } catch { /* 팩트시트 없을 수 있음 */ }

        // 실데이터 로드 시도
        try {
          const [portfolioData, snapshots] = await Promise.all([
            fetchPortfolio(),
            fetchSnapshots(7),
          ])

          if (portfolioData.holdings.length > 0) {
            // 종목별 그룹핑 (같은 종목 여러 번 매수 가능)
            const grouped: Record<string, { totalAmount: number; quantity: number }> = {}
            for (const h of portfolioData.holdings) {
              if (!grouped[h.etf_code]) grouped[h.etf_code] = { totalAmount: 0, quantity: 0 }
              grouped[h.etf_code].totalAmount += h.total_amount
              grouped[h.etf_code].quantity += h.quantity
            }
            const displayHoldings: HoldingDisplay[] = Object.entries(grouped)
              .map(([symbol, data]) => ({
                symbol,
                name: symbol,
                totalValue: data.totalAmount,
                profit: 0,
                profitPercent: 0,
              }))
              .sort((a, b) => b.totalValue - a.totalValue)
              .slice(0, 5)

            setHoldings(displayHoldings)
            setTotalInvested(portfolioData.total_invested)
            setHoldingsCount(portfolioData.total_count)
            setUsingRealData(true)
          }

          if (snapshots.length > 0) {
            const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
            setChartData(sorted.map(s => ({
              date: s.date,
              portfolioValue: s.total_invested,
            })))
          }
        } catch {
          // 실데이터 실패 → 더미 폴백
        }
      } catch {
        setApiStatus("error")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // 폴백: 실데이터 없으면 더미 사용
  const displayHoldings = holdings.length > 0 ? holdings : dummyPortfolio.slice(0, 5).map(p => ({
    symbol: p.symbol, name: p.name, totalValue: p.totalValue, profit: p.profit, profitPercent: p.profitPercent,
  }))
  const displayChart = chartData.length > 0 ? chartData : dummyReturns.slice(-7).map(r => ({
    date: r.date, portfolioValue: r.portfolioValue,
  }))
  const displayTotalValue = usingRealData ? totalInvested : dummyPortfolio.reduce((s, i) => s + i.totalValue, 0)
  const displayTotalProfit = usingRealData ? 0 : dummyPortfolio.reduce((s, i) => s + i.profit, 0)
  const displayCount = usingRealData ? holdingsCount : dummyPortfolio.length

  const topPredictions = predictions.slice(0, 5)
  const summary = {
    buySignals: predictions.filter((p) => p.signal === "BUY").length,
    sellSignals: predictions.filter((p) => p.signal === "SELL").length,
    holdSignals: predictions.filter((p) => p.signal === "HOLD").length,
  }

  return (
    <div className="space-y-6">
      {apiStatus === "error" && (
        <Card className="border-warning-border bg-warning-bg">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-warning-text">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">원격 DB 연결 오류 - 로컬 데이터로 표시 중</span>
            </div>
          </CardContent>
        </Card>
      )}

      {!usingRealData && !loading && (
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 포트폴리오 가치</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brand-primary">
              ${displayTotalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {!usingRealData && (
              <p className="text-xs text-muted-foreground">데모 데이터</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 수익</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${displayTotalProfit >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
              {displayTotalProfit >= 0 ? "+" : ""}${displayTotalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">전체 보유 종목 기준</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">보유 종목</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayCount}</div>
            <p className="text-xs text-muted-foreground">
              {usingRealData ? "실시간 보유 현황" : "데모 데이터"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘의 시그널</CardTitle>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <div className="flex gap-2">
                <Badge variant="default" className="bg-signal-buy">매수 {summary.buySignals}</Badge>
                <Badge variant="destructive" className="bg-signal-sell">매도 {summary.sellSignals}</Badge>
                <Badge variant="secondary" className="bg-signal-hold text-white">관망 {summary.holdSignals}</Badge>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {loading ? "로딩 중..." : `총 ${predictions.length}개 종목 분석`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Snowballing AI ETF 요약 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {SNOWBALLING_ETF.name}
          </CardTitle>
          <CardDescription>AI 예측 기반 월별 팩트시트 요약</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm">{SNOWBALLING_ETF.description}</p>
              {latestFactsheet ? (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    최신 기준: {latestFactsheet.year}년 {latestFactsheet.month}월
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span>
                    Top 종목: {latestFactsheet.compositions.slice(0, 3).map(c => c.ticker).join(", ")}
                    {latestFactsheet.compositions.length > 3 && " ..."}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  팩트시트 데이터가 아직 생성되지 않았습니다.
                </p>
              )}
            </div>
            <Link href="/factsheet">
              <Button variant="outline" size="sm">
                자세히 보기
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* 포트폴리오 차트 */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>포트폴리오 추이</CardTitle>
            <CardDescription>
              {usingRealData ? "일일 스냅샷 기반 투자금 추이" : "최근 7일 포트폴리오 가치 변동 (데모)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <AreaChart data={displayChart}>
                <defs>
                  <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-portfolioValue)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-portfolioValue)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => value.slice(5)}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="portfolioValue"
                  stroke="var(--color-portfolioValue)"
                  fill="url(#fillValue)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* 최근 예측 결과 */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>최근 예측 시그널</CardTitle>
            <CardDescription>RSI/MACD 기반 매매 신호 (실시간)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {topPredictions.map((prediction) => (
                  <div key={prediction.symbol} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-semibold">{prediction.symbol}</div>
                      <Badge
                        variant={
                          prediction.signal === "BUY" ? "default" :
                            prediction.signal === "SELL" ? "destructive" : "secondary"
                        }
                        className={
                          prediction.signal === "BUY" ? "bg-signal-buy" :
                            prediction.signal === "SELL" ? "bg-signal-sell" :
                              "bg-signal-hold text-white"
                        }
                      >
                        {prediction.signal === "BUY" ? "매수" : prediction.signal === "SELL" ? "매도" : "관망"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">신뢰도</span>
                      <span className="font-medium">{prediction.confidence}%</span>
                      {prediction.predictedChange >= 0 ? (
                        <ArrowUp className="h-4 w-4 text-profit-positive" />
                      ) : (
                        <ArrowDown className="h-4 w-4 text-profit-negative" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 보유 종목 현황 */}
      <Card>
        <CardHeader>
          <CardTitle>보유 종목 현황</CardTitle>
          <CardDescription>
            {usingRealData ? "실시간 보유 종목 (Trading Service 연동)" : "현재 포트폴리오 상위 종목 (데모 데이터)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {displayHoldings.map((item) => (
              <div key={item.symbol} className="flex items-center justify-between border-b pb-3 last:border-0">
                <div>
                  <div className="font-semibold">{item.symbol}</div>
                  <div className="text-sm text-muted-foreground">{item.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">${item.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  {item.profit !== 0 && (
                    <div className={`text-sm ${item.profit >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
                      {item.profit >= 0 ? "+" : ""}{item.profitPercent.toFixed(2)}% ({item.profit >= 0 ? "+" : ""}${item.profit.toLocaleString()})
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
