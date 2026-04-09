// OHLCV 데이터 포인트
export interface OHLCVDataPoint {
  time: string | number; // 'YYYY-MM-DD' for daily+ or Unix timestamp (seconds) for intraday
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 차트 데이터 응답
export interface ChartDataResponse {
  symbol: string;
  timeframe: string;
  data: OHLCVDataPoint[];
}

// 타임프레임 옵션
export type ChartTimeframe = '10m' | '1h' | 'D' | 'W' | 'M';

export interface TimeframeOption {
  value: ChartTimeframe;
  label: string;
}

export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { value: '10m', label: '10분' },
  { value: '1h', label: '1시간' },
  { value: 'D', label: '일봉' },
  { value: 'W', label: '주봉' },
  { value: 'M', label: '월봉' },
];

// 스크래퍼 로그
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export interface ScraperLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  symbol?: string;
  timeframe?: string;
  message: string;
  details?: string;
}

export interface ScraperLogsResponse {
  logs: ScraperLog[];
  total: number;
}

// 스크래퍼 작업 상태
export type JobStatus = 'idle' | 'running' | 'completed' | 'error';

export interface ScraperJobStatus {
  status: JobStatus;
  currentSymbol?: string;
  progress?: number;
  totalSymbols?: number;
  completedSymbols?: number;
  errorSymbols?: string[];
  startedAt?: string;
  completedAt?: string;
  message?: string;
  /** symbols.yaml에 설정된 전체 종목 수 (실행 중이 아니어도 항상 채워짐) */
  configuredTotal?: number;
}

// 예측 캔들 데이터
export interface ForecastDataPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ForecastResponse {
  symbol: string;
  current_price: number;
  forecast_days: number;
  data: ForecastDataPoint[];
  generated_at: string;
}

// 예측 정보
export interface PredictionInfo {
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  rank?: number;
  score?: number;
}

// 로그 필터
export interface LogFilter {
  level: LogLevel | 'ALL';
  symbol: string;
  limit: number;
  autoRefresh: boolean;
}
