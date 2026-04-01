"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, TrendingUp, TrendingDown, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchPortfolio, fetchSnapshots, type Portfolio, type SnapshotData } from "@/lib/trading-api"
import type { ReturnData } from "@/lib/data"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Area, AreaChart, Bar, BarChart, Line, LineChart, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts"

const chartConfig = {
  portfolioValue: {
    label: "포트폴리오 가치",
    color: "var(--chart-1)",
  },
  dailyReturn: {
    label: "일일 수익률",
    color: "var(--chart-2)",
  },
  cumulativeReturn: {
    label: "누적 수익률",
    color: "var(--chart-3)",
  },
  benchmark: {
    label: "QQQ (벤치마크)",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig

export default function ReturnsPage() {
  const [returnsData, setReturnsData] = useState<ReturnData[]>([])
  const [loading, setLoading] = useState(true)
  const [usingRealData, setUsingRealData] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const snapshots = await fetchSnapshots(30)
        if (snapshots.length > 1) {
          const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))

          // 스냅샷 → ReturnData 변환
          let cumReturn = 0
          const converted: ReturnData[] = sorted.map((s, i) => {
            const prevValue = i > 0 ? sorted[i - 1].total_invested : s.total_invested
            const dailyReturn = prevValue > 0 ? ((s.total_invested - prevValue) / prevValue) * 100 : 0
            cumReturn += dailyReturn
            return {
              date: s.date,
              portfolioValue: s.total_invested,
              dailyReturn: parseFloat(dailyReturn.toFixed(2)),
              cumulativeReturn: parseFloat(cumReturn.toFixed(2)),
              benchmarkReturn: 0,
              benchmarkCumulativeReturn: 0,
            }
          })

          setReturnsData(converted)
          setUsingRealData(true)
        }
      } catch {
        // 실패 시 더미 폴백
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const returns = returnsData

  if (!loading && returns.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">수익률 분석</h2>
          <p className="text-muted-foreground">포트폴리오 성과 및 수익률 추이</p>
        </div>
        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">아직 매매 데이터가 없습니다</p>
              <p className="text-sm mt-2">자동매매가 실행되면 수익률 데이터가 표시됩니다</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const latestReturn = returns[returns.length - 1] || { cumulativeReturn: 0, dailyReturn: 0, portfolioValue: 0, date: '', benchmarkReturn: 0, benchmarkCumulativeReturn: 0 }
  const previousReturn = returns[returns.length - 2] || latestReturn
  const avgDailyReturn = returns.reduce((sum, r) => sum + r.dailyReturn, 0) / returns.length
  const maxDailyReturn = Math.max(...returns.map(r => r.dailyReturn))
  const minDailyReturn = Math.min(...returns.map(r => r.dailyReturn))
  const positiveDays = returns.filter(r => r.dailyReturn > 0).length
  const negativeDays = returns.filter(r => r.dailyReturn <= 0).length
  const winRate = returns.length > 0 ? (positiveDays / returns.length) * 100 : 0

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
        <h2 className="text-2xl font-bold tracking-tight">수익률 분석</h2>
        <p className="text-muted-foreground">
          {usingRealData ? "실시간 포트폴리오 성과 (Trading Service 연동)" : "포트폴리오 성과 및 수익률 추이 (데모 데이터)"}
        </p>
      </div>

      {!usingRealData && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Trading 서비스 연결 불가 - 데모 데이터 표시 중. 매매 시작 후 실데이터가 표시됩니다.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">누적 수익률</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${latestReturn.cumulativeReturn >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
              {latestReturn.cumulativeReturn >= 0 ? "+" : ""}{latestReturn.cumulativeReturn.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">{returns.length}일 기준</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">일평균 수익률</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${avgDailyReturn >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
              {avgDailyReturn >= 0 ? "+" : ""}{avgDailyReturn.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              최대 +{maxDailyReturn.toFixed(2)}% / 최소 {minDailyReturn.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">승률</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {positiveDays}일 수익 / {negativeDays}일 손실
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">최근 수익률</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold flex items-center gap-1 ${latestReturn.dailyReturn >= 0 ? "text-profit-positive" : "text-profit-negative"}`}>
              {latestReturn.dailyReturn >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {latestReturn.dailyReturn >= 0 ? "+" : ""}{latestReturn.dailyReturn.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              전일 {previousReturn.dailyReturn >= 0 ? "+" : ""}{previousReturn.dailyReturn.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 차트 영역 */}
      <Tabs defaultValue="portfolio" className="space-y-4">
        <TabsList>
          <TabsTrigger value="portfolio">포트폴리오 가치</TabsTrigger>
          <TabsTrigger value="daily">일일 수익률</TabsTrigger>
          <TabsTrigger value="cumulative">누적 수익률</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio">
          <Card>
            <CardHeader>
              <CardTitle>포트폴리오 가치 추이</CardTitle>
              <CardDescription>최근 {returns.length}일 포트폴리오 가치 변동</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <AreaChart data={returns}>
                  <defs>
                    <linearGradient id="fillPortfolio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-portfolioValue)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-portfolioValue)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="portfolioValue" stroke="var(--color-portfolioValue)" fill="url(#fillPortfolio)" />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle>일일 수익률</CardTitle>
              <CardDescription>최근 {returns.length}일 일일 수익률 분포</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <BarChart data={returns}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(8)} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                  <ReferenceLine y={0} stroke="#666" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="dailyReturn" fill="var(--color-dailyReturn)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cumulative">
          <Card>
            <CardHeader>
              <CardTitle>누적 수익률</CardTitle>
              <CardDescription>포트폴리오 누적 수익률 추이</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <LineChart data={returns}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                  <ReferenceLine y={0} stroke="#666" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="cumulativeReturn" stroke="var(--color-cumulativeReturn)" name="포트폴리오" strokeWidth={3} dot={{ fill: "var(--color-cumulativeReturn)", r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
