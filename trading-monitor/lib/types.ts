// 매매 상태
export type TradingMode = 'paper' | 'live';
export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'success' | 'failed' | 'pending';
export type ServiceStatus = 'healthy' | 'unhealthy' | 'unknown';

// 사이클 정보
export interface CycleInfo {
  currentDay: number;
  totalDays: number;
  cycleType: 'short' | 'long';
  shortCycleDays: number;
  longCycleDays: number;
  startDate: string;
  nextRebalanceDate: string;
}

// 포트폴리오 보유 종목
export interface Holding {
  etfCode: string;
  etfName: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  buyDate: string;
  dDay: number;
  profitLoss: number;
  profitLossPercent: number;
}

// 주문 로그
export interface Order {
  id: string;
  etfCode: string;
  etfName: string;
  side: OrderSide;
  quantity: number;
  price: number;
  status: OrderStatus;
  timestamp: string;
  reason?: string;
}

// 매매 내역 (히스토리)
export interface TradeHistory {
  id: string;
  etfCode: string;
  etfName: string;
  side: OrderSide;
  quantity: number;
  price: number;
  executedAt: string;
  profitLoss?: number;
  profitLossPercent?: number;
}

// 일별 거래 요약
export interface DailySummary {
  date: string;
  buyCount: number;
  sellCount: number;
  totalProfitLoss: number;
  trades: TradeHistory[];
}

// 트레이딩 상태
export interface TradingStatus {
  mode: TradingMode;
  cycle: CycleInfo;
  totalInvestment: number;
  holdingsCount: number;
  todayBuyCount: number;
  todaySellCount: number;
  automationStatus: {
    lastRun: string | null;
    success: boolean;
    message: string;
  };
  automationEnabled: boolean;
  fractionalMode: boolean;
}

// 자동매매 제어
export interface AutomationControl {
  enabled: boolean;
  fractionalMode: boolean;
  schedulerTime: string;
  tradingMode: TradingMode;
}

// 잔고 정보
export interface BalanceInfo {
  available_cash_usd: number;
  total_evaluation_usd: number;
  available_cash_krw: number;
  total_evaluation_krw: number;
  exchange_rate: number;
  holdings: {
    code: string;
    name: string;
    quantity: number;
    avg_price: number;
    current_price: number;
    pnl_rate: number;
    exchange_code: string;
  }[];
  kis_connected: boolean;
  error: string | null;
}

// 포트폴리오 응답
export interface PortfolioResponse {
  totalInvestment: number;
  totalCurrentValue: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  holdings: Holding[];
}

// 헬스체크 응답
export interface HealthCheckResponse {
  services: {
    name: string;
    status: ServiceStatus;
    url: string;
    lastChecked: string;
    responseTime?: number;
  }[];
}

// 트레이딩 설정
export interface TradingConfig {
  mode: TradingMode;
  shortCycleDays: number;
  longCycleDays: number;
  strategyRatio: {
    activeAI: number;    // AI 선정 종목 비율 (70%)
    benchmark: number;   // 벤치마크 ETF 비율 (30%)
  };
  capital: number;
  maxHoldings: number;
  rebalanceTime: string;
  automationEnabled: boolean;
  benchmarkETF: string;
}

// ─── 파이프라인 관련 타입 ───

export type PipelineStepStatus = 'idle' | 'running' | 'completed' | 'error' | 'scheduled';

export interface PipelineStep {
  id: string;
  name: string;
  description: string;
  scheduledTime: string;        // KST "HH:MM" 형식
  status: PipelineStepStatus;
  lastRunAt: string | null;
  lastRunDuration: number | null; // seconds
  lastRunMessage: string | null;
  nextRunAt: string | null;
}

export interface PipelineStatus {
  isRunning: boolean;
  currentStep: string | null;
  steps: PipelineStep[];
  lastFullRunAt: string | null;
  lastFullRunSuccess: boolean;
}

// ─── 스케줄 설정 ───

export interface ScheduleConfig {
  scraping: string;           // "06:00"
  featureEngineering: string; // "07:00"
  prediction: string;         // "07:30"
  tradeDecision: string;      // "08:00"
  kisOrder: string;           // "08:30"
  monthlyRetrain: string;     // "03:00" (매월 1일)
}

// ─── DB 뷰어 관련 타입 ───

export interface DBTableInfo {
  tableName: string;
  symbol: string;
  timeframe: string;
  rowCount: number;
  latestDate: string | null;
  oldestDate: string | null;
  isUpToDate: boolean;        // 최근 2일 이내 데이터 있으면 true
}

export interface DBOverview {
  database: string;
  totalTables: number;
  totalRows: number;
  upToDateTables: number;
  staleTables: number;
  lastChecked: string;
  tables: DBTableInfo[];
}

// ─── 개발자 옵션 ───

export interface DeveloperConfig {
  automationEnabled: boolean;
  tradingMode: TradingMode;
  maxHoldings: number;
  activeRatio: number;       // 0-100 (AI 종목 비율 %)
  benchmarkRatio: number;    // 0-100 (벤치마크 ETF 비율 %)
  cycleDays: number;         // 63 거래일 기본
  capital: number;
  benchmarkETF: string;
  kisApiConnected: boolean;
  schedule: ScheduleConfig;
}
