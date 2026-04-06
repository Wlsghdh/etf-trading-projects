// 멀티 AI 융합 플랫폼 API
// KIS API (trading-service) + ML 서비스 실데이터 전용 - 더미 데이터 없음

// ── API Base URLs ──

function getMlApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://ml-service:8000'
  }
  const port = window.location.port
  const hostname = window.location.hostname
  if (port === '3000' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return 'http://localhost:8000'
  }
  return ''
}

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

const ML_API = getMlApiBaseUrl()
const TRADING_API = getTradingApiBaseUrl()

// ── Types: KIS 잔고/보유종목 ──

export interface KISHoldingItem {
  code: string
  name: string
  quantity: number
  avg_price: number       // 매수 평균가
  current_price: number   // 현재가
  pnl_rate: number        // 수익률 (%)
  exchange_code: string
}

export interface KISBalance {
  available_cash_usd: number
  total_evaluation_usd: number
  available_cash_krw: number
  total_evaluation_krw: number
  exchange_rate: number
  holdings: KISHoldingItem[]
  kis_connected: boolean
  error?: string
}

// ── Types: ML 서비스 ──

export interface StockDataItem {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  rsi: number | null
  macd: number | null
}

export interface StockDataResponse {
  symbol: string
  timeframe: string
  count: number
  data: StockDataItem[]
}

export interface RankingItem {
  symbol: string
  rank: number
  score: number
  direction: string
  weight: number
  current_close: number | null
}

export interface RankingResponse {
  prediction_date: string
  timeframe: string
  total_symbols: number
  model_name: string
  rankings: RankingItem[]
}

export interface SymbolListResponse {
  symbols: string[]
  count: number
}

// ── Types: 포트폴리오 (trading-service DB) ──

export interface PurchaseItem {
  id: number
  cycle_id: number
  trading_day_number: number
  purchase_date: string
  etf_code: string
  quantity: number
  price: number           // 매수가
  total_amount: number
  sold: boolean
  sold_date: string | null
  sold_price: number | null
  sell_pnl: number | null
}

export interface PortfolioResponse {
  cycle_id: number | null
  holdings: PurchaseItem[]
  total_invested: number
  total_count: number
}

// ── Types: 종합 분석 결과 ──

export interface StockAnalysis {
  symbol: string
  // KIS 실시간 데이터
  kisConnected: boolean
  currentPrice: number
  avgBuyPrice: number | null      // 매수 평균가 (보유 중이면)
  holdingQty: number | null       // 보유 수량
  pnlRate: number | null          // 수익률 (%)
  // DB 기반 시장 데이터
  priceChange1d: number
  priceChange5d: number
  priceChange20d: number
  rsi: number | null
  macd: number | null
  volume: number
  avgVolume: number
  high52w: number
  low52w: number
  // ML 랭킹 분석
  rank: number | null
  totalSymbols: number | null
  direction: string | null
  score: number | null
  weight: number | null
  modelName: string | null
  predictionDate: string | null
  // KIS 잔고 요약
  availableCash: number | null
  totalEvaluation: number | null
}

// ── AI 모델 ──

export type AIModel = "chatgpt" | "gemini" | "claude" | "multiai"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  model: AIModel
  timestamp: Date
  analysisData?: StockAnalysis
}

// ── API 호출 함수 ──

// 심볼 목록 (ML 서비스)
export async function fetchSymbols(): Promise<string[]> {
  const response = await fetch(`${ML_API}/api/data/symbols`, { cache: "no-store" })
  if (!response.ok) throw new Error(`ML API error: ${response.status}`)
  const data: SymbolListResponse = await response.json()
  return data.symbols
}

// 종목 차트 데이터 (ML 서비스 DB)
export async function fetchStockData(symbol: string, limit: number = 100): Promise<StockDataResponse> {
  const response = await fetch(
    `${ML_API}/api/data/${symbol}?timeframe=D&limit=${limit}`,
    { cache: "no-store" }
  )
  if (!response.ok) throw new Error(`ML API error: ${response.status}`)
  return response.json()
}

// 최신 ML 랭킹
export async function fetchLatestRanking(): Promise<RankingResponse | null> {
  try {
    const response = await fetch(`${ML_API}/api/predictions/ranking/latest`, { cache: "no-store" })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

// KIS 잔고 조회 (trading-service 경유)
export async function fetchKISBalance(): Promise<KISBalance | null> {
  try {
    const response = await fetch(`${TRADING_API}/api/trading/balance`, { cache: "no-store" })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

// 보유 종목 (trading-service DB)
export async function fetchPortfolio(): Promise<PortfolioResponse | null> {
  try {
    const response = await fetch(`${TRADING_API}/api/trading/portfolio`, { cache: "no-store" })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

// ── 종합 분석 (KIS + ML 실데이터 결합) ──

export async function analyzeStock(symbol: string): Promise<StockAnalysis> {
  // 4가지 API를 병렬로 호출
  const [stockData, ranking, kisBalance, portfolio] = await Promise.all([
    fetchStockData(symbol, 260).catch(() => null),
    fetchLatestRanking().catch(() => null),
    fetchKISBalance().catch(() => null),
    fetchPortfolio().catch(() => null),
  ])

  const data = stockData?.data || []
  const latest = data.length > 0 ? data[data.length - 1] : null
  const prev1d = data.length > 1 ? data[data.length - 2] : null
  const prev5d = data.length > 5 ? data[data.length - 6] : null
  const prev20d = data.length > 20 ? data[data.length - 21] : null

  // 52주 고가/저가
  const recentData = data.slice(-252)
  const high52w = recentData.length > 0 ? Math.max(...recentData.map(d => d.high)) : 0
  const low52w = recentData.length > 0 ? Math.min(...recentData.map(d => d.low)) : 0

  // 20일 평균 거래량
  const recentVolumes = data.slice(-20).map(d => d.volume)
  const avgVolume = recentVolumes.length > 0
    ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
    : 0

  // ML 랭킹에서 해당 종목 찾기
  const rankingItem = ranking?.rankings.find(r => r.symbol === symbol)

  // KIS 잔고에서 해당 종목 보유 정보 찾기
  const kisHolding = kisBalance?.holdings.find(h => h.code === symbol)

  // trading-service DB에서 매수 기록 찾기
  const dbHoldings = portfolio?.holdings.filter(h => h.etf_code === symbol && !h.sold) || []
  const totalQtyFromDB = dbHoldings.reduce((sum, h) => sum + h.quantity, 0)
  const avgPriceFromDB = totalQtyFromDB > 0
    ? dbHoldings.reduce((sum, h) => sum + h.total_amount, 0) / totalQtyFromDB
    : null

  // 현재가: KIS 실시간 > ML DB 최신 종가
  const currentPrice = kisHolding?.current_price || latest?.close || rankingItem?.current_close || 0

  return {
    symbol,
    kisConnected: kisBalance?.kis_connected ?? false,
    currentPrice,
    avgBuyPrice: kisHolding?.avg_price ?? avgPriceFromDB,
    holdingQty: kisHolding?.quantity ?? (totalQtyFromDB > 0 ? totalQtyFromDB : null),
    pnlRate: kisHolding?.pnl_rate ?? null,
    priceChange1d: latest && prev1d ? ((latest.close - prev1d.close) / prev1d.close) * 100 : 0,
    priceChange5d: latest && prev5d ? ((latest.close - prev5d.close) / prev5d.close) * 100 : 0,
    priceChange20d: latest && prev20d ? ((latest.close - prev20d.close) / prev20d.close) * 100 : 0,
    rsi: latest?.rsi ?? null,
    macd: latest?.macd ?? null,
    volume: latest?.volume || 0,
    avgVolume,
    high52w,
    low52w,
    rank: rankingItem?.rank ?? null,
    totalSymbols: ranking?.total_symbols ?? null,
    direction: rankingItem?.direction ?? null,
    score: rankingItem?.score ?? null,
    weight: rankingItem?.weight ?? null,
    modelName: ranking?.model_name ?? null,
    predictionDate: ranking?.prediction_date ?? null,
    availableCash: kisBalance?.available_cash_usd ?? null,
    totalEvaluation: kisBalance?.total_evaluation_usd ?? null,
  }
}
