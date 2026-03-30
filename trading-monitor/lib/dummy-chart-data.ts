import type {
  OHLCVDataPoint,
  ChartDataResponse,
  ChartTimeframe,
  ForecastResponse,
  ScraperLog,
  ScraperLogsResponse,
  ScraperJobStatus,
  LogLevel,
} from './chart-types';

// 더미 OHLCV 데이터 생성
export function generateDummyChartData(
  symbol: string,
  timeframe: ChartTimeframe = 'D',
  limit: number = 100
): ChartDataResponse {
  const data: OHLCVDataPoint[] = [];
  const now = new Date('2026-03-08');
  let basePrice = getBasePrice(symbol);

  for (let i = limit - 1; i >= 0; i--) {
    const date = new Date(now);

    if (timeframe === 'D') {
      date.setDate(date.getDate() - i);
    } else if (timeframe === 'W') {
      date.setDate(date.getDate() - i * 7);
    } else if (timeframe === 'M') {
      date.setMonth(date.getMonth() - i);
    } else if (timeframe === '1h') {
      date.setHours(date.getHours() - i);
    } else if (timeframe === '10m') {
      date.setMinutes(date.getMinutes() - i * 10);
    }

    const change = (Math.random() - 0.48) * basePrice * 0.03;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + Math.random() * basePrice * 0.01;
    const low = Math.min(open, close) - Math.random() * basePrice * 0.01;
    const volume = Math.floor(Math.random() * 500000 + 100000);

    // lightweight-charts: daily+ uses 'YYYY-MM-DD', intraday uses Unix timestamp (seconds)
    const isIntraday = timeframe === '10m' || timeframe === '1h';
    const time = isIntraday
      ? Math.floor(date.getTime() / 1000)
      : date.toISOString().split('T')[0];

    data.push({
      time,
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      volume,
    });

    basePrice = close;
  }

  return { symbol, timeframe, data };
}

function getBasePrice(symbol: string): number {
  const prices: Record<string, number> = {
    '069500': 35200,
    '229200': 12800,
    '102110': 36500,
    '252670': 2850,
    '114800': 5120,
  };
  return prices[symbol] || 30000;
}

// 더미 예측 캔들 데이터 생성
export function generateDummyForecast(
  symbol: string,
  days: number = 30,
  currentPrice?: number
): ForecastResponse {
  const basePrice = currentPrice || getBasePrice(symbol);
  const data = [];
  const startDate = new Date('2026-03-09'); // 내일부터

  let price = basePrice;
  // 살짝 상승 트렌드 (예측이니까)
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // 주말 스킵
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const trend = 0.001; // 일 0.1% 상승 추세
    const noise = (Math.random() - 0.5) * basePrice * 0.02;
    const change = price * trend + noise;

    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * basePrice * 0.008;
    const low = Math.min(open, close) - Math.random() * basePrice * 0.008;
    const volume = Math.floor(Math.random() * 300000 + 50000);

    data.push({
      time: date.toISOString().split('T')[0],
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      volume,
    });

    price = close;
  }

  return {
    symbol,
    current_price: basePrice,
    forecast_days: days,
    data,
    generated_at: new Date().toISOString(),
  };
}

// 더미 스크래퍼 로그 생성
const LOG_MESSAGES: Record<LogLevel, string[]> = {
  DEBUG: [
    'DB 연결 확인 완료',
    '심볼 목록 로드 완료',
    '캐시 초기화',
    '세션 시작',
  ],
  INFO: [
    '데이터 다운로드 완료',
    'DB 업로드 성공',
    '스크래핑 시작',
    '스크래핑 완료',
    '피처 계산 완료',
  ],
  WARNING: [
    '데이터 누락 감지 - 재시도',
    '응답 지연 (>5s)',
    '볼륨 데이터 0건',
    '이전 데이터와 동일',
  ],
  ERROR: [
    '다운로드 실패 - 타임아웃',
    'DB 연결 실패',
    '파싱 에러 - 잘못된 형식',
    'API 요청 거부 (429)',
  ],
};

const SYMBOLS = ['069500', '229200', '102110', '252670', '114800', '005930', '000660', '035420'];
const TIMEFRAMES = ['D', '1h', '10m'];

export function generateDummyScraperLogs(
  level?: LogLevel | 'ALL',
  symbol?: string,
  limit: number = 100
): ScraperLogsResponse {
  const logs: ScraperLog[] = [];
  const now = new Date('2026-03-08T14:30:00');

  for (let i = 0; i < limit; i++) {
    const timestamp = new Date(now);
    timestamp.setSeconds(timestamp.getSeconds() - i * 3);

    const logLevel = getRandomLogLevel();
    const logSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const logTimeframe = TIMEFRAMES[Math.floor(Math.random() * TIMEFRAMES.length)];
    const messages = LOG_MESSAGES[logLevel];

    if (level && level !== 'ALL' && logLevel !== level) continue;
    if (symbol && logSymbol !== symbol) continue;

    logs.push({
      id: `log-${i}`,
      timestamp: timestamp.toISOString(),
      level: logLevel,
      symbol: logSymbol,
      timeframe: logTimeframe,
      message: messages[Math.floor(Math.random() * messages.length)],
    });
  }

  return { logs: logs.slice(0, limit), total: logs.length };
}

function getRandomLogLevel(): LogLevel {
  const rand = Math.random();
  if (rand < 0.1) return 'ERROR';
  if (rand < 0.25) return 'WARNING';
  if (rand < 0.85) return 'INFO';
  return 'DEBUG';
}

// 더미 스크래퍼 상태 생성
export function generateDummyScraperStatus(): ScraperJobStatus {
  return {
    status: 'running',
    currentSymbol: '102110',
    progress: 65,
    totalSymbols: 150,
    completedSymbols: 97,
    errorSymbols: ['035420', '000660'],
    startedAt: '2026-03-08T09:00:00',
    message: '데이터 스크래핑 진행중...',
  };
}
