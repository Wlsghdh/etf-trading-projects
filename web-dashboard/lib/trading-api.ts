// Trading Service API Client
// trading-service (port 8002) 연동

function getTradingApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.TRADING_SERVICE_URL || 'http://trading-service:8002'
  }

  const port = window.location.port
  const hostname = window.location.hostname

  if (port === '3000' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return 'http://localhost:8002'
  }

  return ''
}

const TRADING_API_BASE = getTradingApiBaseUrl()

// Types
export interface CycleStatus {
  id: number
  cycle_start_date: string
  current_day_number: number
  initial_capital: number
  strategy_capital: number
  fixed_capital: number
  trading_mode: string
  is_active: boolean
  created_at: string | null
  updated_at: string | null
}

export interface TradingStatus {
  cycle: CycleStatus | null
  trading_mode: string
  is_trading_day: boolean
  next_trading_day: string | null
  total_holdings: number
  total_invested: number
}

export interface PurchaseItem {
  id: number
  cycle_id: number
  trading_day_number: number
  purchase_date: string
  etf_code: string
  quantity: number
  price: number
  total_amount: number
  sold: boolean
  sold_date: string | null
  sold_price: number | null
  sell_pnl: number | null
  created_at: string | null
}

export interface Portfolio {
  cycle_id: number | null
  holdings: PurchaseItem[]
  total_invested: number
  total_count: number
}

export interface OrderLogItem {
  id: number
  cycle_id: number | null
  order_type: string
  etf_code: string
  quantity: number
  price: number | null
  order_id: string | null
  status: string
  error_message: string | null
  retry_count: number
  created_at: string | null
}

export interface OrderLogResponse {
  total: number
  page: number
  page_size: number
  orders: OrderLogItem[]
}

export interface HistoryResponse {
  total: number
  page: number
  page_size: number
  purchases: PurchaseItem[]
}

export interface TradingHealth {
  status: string
  trading_mode: string
  db: string
  timestamp: string
}

// API Functions
export async function fetchTradingStatus(): Promise<TradingStatus> {
  const response = await fetch(`${TRADING_API_BASE}/api/trading/status`, {
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Trading API error: ${response.status}`)
  return response.json()
}

export async function fetchPortfolio(): Promise<Portfolio> {
  const response = await fetch(`${TRADING_API_BASE}/api/trading/portfolio`, {
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Trading API error: ${response.status}`)
  return response.json()
}

export async function fetchTradingHistory(page = 1, pageSize = 50): Promise<HistoryResponse> {
  const response = await fetch(
    `${TRADING_API_BASE}/api/trading/history?page=${page}&page_size=${pageSize}`,
    { cache: "no-store" }
  )
  if (!response.ok) throw new Error(`Trading API error: ${response.status}`)
  return response.json()
}

export async function fetchOrderLog(page = 1, pageSize = 50): Promise<OrderLogResponse> {
  const response = await fetch(
    `${TRADING_API_BASE}/api/trading/orders?page=${page}&page_size=${pageSize}`,
    { cache: "no-store" }
  )
  if (!response.ok) throw new Error(`Trading API error: ${response.status}`)
  return response.json()
}

export async function checkTradingHealth(): Promise<TradingHealth> {
  try {
    const response = await fetch(`${TRADING_API_BASE}/health`, {
      cache: "no-store",
    })
    return response.json()
  } catch {
    return {
      status: "error",
      trading_mode: "unknown",
      db: "unknown",
      timestamp: new Date().toISOString(),
    }
  }
}

export async function executeManualTrade(): Promise<{
  success: boolean
  message: string
  day_number: number
  sold_count: number
  bought_count: number
}> {
  const response = await fetch(`${TRADING_API_BASE}/api/trading/execute`, {
    method: "POST",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Trading API error: ${response.status}`)
  return response.json()
}
