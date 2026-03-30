"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Calendar,
  CircleDollarSign,
  Clock,
  Package,
  Play,
  RefreshCw,
  Server,
  ShoppingCart,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchTradingStatus,
  fetchPortfolio,
  fetchOrderLog,
  checkTradingHealth,
  type TradingStatus,
  type Portfolio,
  type OrderLogItem,
  type TradingHealth,
} from "@/lib/trading-api"

export default function TradingPage() {
  const [status, setStatus] = useState<TradingStatus | null>(null)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [orders, setOrders] = useState<OrderLogItem[]>([])
  const [health, setHealth] = useState<TradingHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusData, portfolioData, orderData, healthData] = await Promise.all([
        fetchTradingStatus(),
        fetchPortfolio(),
        fetchOrderLog(1, 20),
        checkTradingHealth(),
      ])
      setStatus(statusData)
      setPortfolio(portfolioData)
      setOrders(orderData.orders)
      setHealth(healthData)
      setLastRefresh(new Date())
    } catch (err) {
      setError("Trading Service에 연결할 수 없습니다. 서비스가 실행 중인지 확인하세요.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  if (loading && !status) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">자동매매</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">자동매매</h2>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            재시도
          </Button>
        </div>
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Server className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="font-semibold text-lg">Trading Service 연결 실패</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
              <Button onClick={loadData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                다시 시도
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const cycle = status?.cycle
  const cycleProgress = cycle ? Math.round((cycle.current_day_number / 63) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">자동매매</h2>
          <p className="text-sm text-muted-foreground">
            마지막 갱신: {lastRefresh.toLocaleTimeString("ko-KR")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* Service Status Bar */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${health?.status === "ok" ? "bg-green-500" : "bg-red-500"}`} />
          <span>Trading Service</span>
        </div>
        <Badge variant="outline">
          {status?.trading_mode === "paper" ? "모의투자" : "실전투자"}
        </Badge>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={status?.is_trading_day ? "text-green-500" : "text-muted-foreground"}>
            {status?.is_trading_day ? "거래일" : `휴장 (다음: ${status?.next_trading_day || "확인 불가"})`}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">사이클 진행</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {cycle ? (
              <>
                <div className="text-2xl font-bold">Day {cycle.current_day_number} / 63</div>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-primary transition-all"
                    style={{ width: `${cycleProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  시작일: {cycle.cycle_start_date}
                </p>
              </>
            ) : (
              <div className="text-muted-foreground">활성 사이클 없음</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">초기 자본금</CardTitle>
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${cycle?.initial_capital.toLocaleString() || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              전략: ${cycle?.strategy_capital.toLocaleString() || "0"} / 고정: ${cycle?.fixed_capital.toLocaleString() || "0"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">보유 종목</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.total_holdings || 0}개</div>
            <p className="text-xs text-muted-foreground">
              투자금액: ${status?.total_invested.toLocaleString() || "0"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">일일 예산</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${cycle ? (cycle.initial_capital / 63).toFixed(2) : "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              전체 자본 / 63 거래일
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Holdings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              보유 종목
            </CardTitle>
            <CardDescription>
              {portfolio?.total_count || 0}개 종목 보유 중
            </CardDescription>
          </CardHeader>
          <CardContent>
            {portfolio && portfolio.holdings.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {portfolio.holdings.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div>
                      <div className="font-semibold text-sm">{h.etf_code}</div>
                      <div className="text-xs text-muted-foreground">
                        Day {h.trading_day_number} · {h.purchase_date}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {h.quantity.toFixed(4)}주 × ${h.price.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${h.total_amount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Package className="h-8 w-8" />
                <p className="text-sm">보유 종목이 없습니다</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              최근 주문
            </CardTitle>
            <CardDescription>
              최근 주문 로그 (최대 20건)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orders.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {orders.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {o.order_type === "BUY" ? (
                        <ArrowUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDown className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <div className="font-semibold text-sm">{o.etf_code}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.created_at ? new Date(o.created_at).toLocaleString("ko-KR") : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">
                        {o.quantity.toFixed(4)}주
                        {o.price ? ` @ $${o.price.toFixed(2)}` : ""}
                      </div>
                      <Badge
                        variant={o.status === "FILLED" ? "default" : o.status === "FAILED" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {o.status === "FILLED" ? "체결" : o.status === "FAILED" ? "실패" : o.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Clock className="h-8 w-8" />
                <p className="text-sm">주문 내역이 없습니다</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
