import type {
  TradingStatus,
  PortfolioResponse,
  Holding,
  Order,
  TradeHistory,
  DailySummary,
  HealthCheckResponse,
  TradingConfig,
  PipelineStatus,
  PipelineStep,
  ScheduleConfig,
  DBOverview,
  DBTableInfo,
  DeveloperConfig,
} from './types';

// ─── 미국 주식 유니버스 (상위 종목) ───

const US_STOCKS = [
  { code: 'AAPL', name: 'Apple Inc.' },
  { code: 'MSFT', name: 'Microsoft Corp.' },
  { code: 'NVDA', name: 'NVIDIA Corp.' },
  { code: 'GOOGL', name: 'Alphabet Inc.' },
  { code: 'AMZN', name: 'Amazon.com Inc.' },
  { code: 'META', name: 'Meta Platforms' },
  { code: 'TSLA', name: 'Tesla Inc.' },
  { code: 'AVGO', name: 'Broadcom Inc.' },
  { code: 'JPM', name: 'JPMorgan Chase' },
  { code: 'LLY', name: 'Eli Lilly & Co.' },
  { code: 'V', name: 'Visa Inc.' },
  { code: 'UNH', name: 'UnitedHealth Group' },
  { code: 'MA', name: 'Mastercard Inc.' },
  { code: 'COST', name: 'Costco Wholesale' },
  { code: 'HD', name: 'Home Depot Inc.' },
  { code: 'NFLX', name: 'Netflix Inc.' },
  { code: 'ADBE', name: 'Adobe Inc.' },
  { code: 'CRM', name: 'Salesforce Inc.' },
  { code: 'AMD', name: 'AMD Inc.' },
  { code: 'QCOM', name: 'Qualcomm Inc.' },
  { code: 'WMT', name: 'Walmart Inc.' },
  { code: 'BAC', name: 'Bank of America' },
  { code: 'XOM', name: 'Exxon Mobil' },
  { code: 'GS', name: 'Goldman Sachs' },
  { code: 'PG', name: 'Procter & Gamble' },
  { code: 'JNJ', name: 'Johnson & Johnson' },
  { code: 'MRK', name: 'Merck & Co.' },
  { code: 'ABBV', name: 'AbbVie Inc.' },
  { code: 'PFE', name: 'Pfizer Inc.' },
  { code: 'KO', name: 'Coca-Cola Co.' },
];

// 더미 보유 종목 (미국 주식 기반, 다양한 코호트)
function generateHoldings(): Holding[] {
  const holdings: Holding[] = [];
  const baseDate = new Date('2026-03-20');
  const prices: Record<string, number> = {
    AAPL: 198.5, MSFT: 442.8, NVDA: 875.2, GOOGL: 168.3, AMZN: 195.7,
    META: 612.4, TSLA: 285.6, AVGO: 1680.0, JPM: 248.9, LLY: 842.1,
    V: 315.2, UNH: 528.7, MA: 498.3, COST: 912.5, HD: 412.8,
    NFLX: 925.3, ADBE: 512.4, CRM: 328.7, AMD: 178.9, QCOM: 192.4,
  };

  const topStocks = US_STOCKS.slice(0, 20);
  topStocks.forEach((stock, i) => {
    const buyPrice = (prices[stock.code] || 200) * (0.95 + Math.random() * 0.05);
    const currentPrice = prices[stock.code] || 200;
    const quantity = Math.floor(500000 / buyPrice);
    const dDay = 63 - (i * 3 + Math.floor(Math.random() * 5));
    const buyDate = new Date(baseDate);
    buyDate.setDate(buyDate.getDate() - (63 - dDay));

    holdings.push({
      etfCode: stock.code,
      etfName: stock.name,
      quantity,
      buyPrice: Number(buyPrice.toFixed(2)),
      currentPrice,
      buyDate: buyDate.toISOString().split('T')[0],
      dDay: Math.max(1, dDay),
      profitLoss: Number(((currentPrice - buyPrice) * quantity).toFixed(2)),
      profitLossPercent: Number((((currentPrice - buyPrice) / buyPrice) * 100).toFixed(2)),
    });
  });

  return holdings;
}

const DUMMY_HOLDINGS = generateHoldings();

// 더미 최근 주문 (미국 주식)
function generateOrders(): Order[] {
  const orders: Order[] = [];
  const now = new Date('2026-03-20T09:30:00');

  // 오늘 매수 주문
  const todayBuys = US_STOCKS.slice(0, 3);
  todayBuys.forEach((stock, i) => {
    const ts = new Date(now);
    ts.setMinutes(ts.getMinutes() + i * 2);
    orders.push({
      id: `ord-today-buy-${i}`,
      etfCode: stock.code,
      etfName: stock.name,
      side: 'BUY',
      quantity: Math.floor(Math.random() * 10 + 5),
      price: 150 + Math.random() * 700,
      status: 'success',
      timestamp: ts.toISOString(),
    });
  });

  // 오늘 매도 주문 (FIFO 만기)
  orders.push({
    id: 'ord-today-sell-0',
    etfCode: 'INTC',
    etfName: 'Intel Corp.',
    side: 'SELL',
    quantity: 25,
    price: 32.5,
    status: 'success',
    timestamp: new Date(now.getTime() + 5 * 60000).toISOString(),
    reason: 'FIFO 63일 만기 매도',
  });

  // 어제/그제 주문
  for (let d = 1; d <= 5; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const stock = US_STOCKS[d + 3];
    orders.push({
      id: `ord-${d}-buy`,
      etfCode: stock.code,
      etfName: stock.name,
      side: 'BUY',
      quantity: Math.floor(Math.random() * 15 + 5),
      price: 100 + Math.random() * 800,
      status: d === 3 ? 'failed' : 'success',
      timestamp: date.toISOString(),
      reason: d === 3 ? 'KIS API 일시 오류' : undefined,
    });
  }

  return orders;
}

// 더미 거래 히스토리
function createDummyHistory(): DailySummary[] {
  const summaries: DailySummary[] = [];
  const today = new Date('2026-03-20');

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const buyCount = Math.floor(Math.random() * 4) + 1;
    const sellCount = Math.floor(Math.random() * 3);

    const trades: TradeHistory[] = [];
    for (let j = 0; j < buyCount; j++) {
      const stock = US_STOCKS[(i + j) % US_STOCKS.length];
      trades.push({
        id: `trade-${i}-buy-${j}`,
        etfCode: stock.code,
        etfName: stock.name,
        side: 'BUY',
        quantity: Math.floor(Math.random() * 20 + 5),
        price: Number((100 + Math.random() * 800).toFixed(2)),
        executedAt: date.toISOString(),
      });
    }
    for (let j = 0; j < sellCount; j++) {
      const stock = US_STOCKS[(i + j + 5) % US_STOCKS.length];
      const pnl = Number((Math.random() * 2000 - 500).toFixed(2));
      trades.push({
        id: `trade-${i}-sell-${j}`,
        etfCode: stock.code,
        etfName: stock.name,
        side: 'SELL',
        quantity: Math.floor(Math.random() * 15 + 5),
        price: Number((100 + Math.random() * 800).toFixed(2)),
        executedAt: date.toISOString(),
        profitLoss: pnl,
        profitLossPercent: Number((pnl / (Math.random() * 5000 + 1000) * 100).toFixed(2)),
      });
    }

    summaries.push({
      date: date.toISOString().split('T')[0],
      buyCount,
      sellCount,
      totalProfitLoss: trades.reduce((sum, t) => sum + (t.profitLoss || 0), 0),
      trades,
    });
  }

  return summaries;
}

export function generateDummyTradingStatus(): TradingStatus {
  return {
    mode: 'paper',
    cycle: {
      currentDay: 27,
      totalDays: 63,
      cycleType: 'long',
      shortCycleDays: 15,
      longCycleDays: 63,
      startDate: '2026-02-10',
      nextRebalanceDate: '2026-05-05',
    },
    totalInvestment: 100000,     // $100,000
    holdingsCount: 20,
    todayBuyCount: 3,
    todaySellCount: 1,
    automationStatus: {
      lastRun: '2026-03-20T08:35:00',
      success: true,
      message: 'KIS 예약주문 3건 매수, 1건 매도 완료',
    },
    automationEnabled: false,
    fractionalMode: false,
  };
}

export function generateDummyPortfolio(): PortfolioResponse {
  const holdings = DUMMY_HOLDINGS;
  const totalInvestment = holdings.reduce((sum, h) => sum + h.buyPrice * h.quantity, 0);
  const totalCurrentValue = holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0);
  const totalProfitLoss = totalCurrentValue - totalInvestment;

  return {
    totalInvestment: Number(totalInvestment.toFixed(2)),
    totalCurrentValue: Number(totalCurrentValue.toFixed(2)),
    totalProfitLoss: Number(totalProfitLoss.toFixed(2)),
    totalProfitLossPercent: Number(((totalProfitLoss / totalInvestment) * 100).toFixed(2)),
    holdings,
  };
}

export function generateDummyOrders(): Order[] {
  return generateOrders();
}

export function generateDummyHistory(): DailySummary[] {
  return createDummyHistory();
}

export function generateDummyHealthCheck(): HealthCheckResponse {
  return {
    services: [
      {
        name: 'trading-service',
        status: 'healthy',
        url: 'http://trading-service:8002',
        lastChecked: new Date().toISOString(),
        responseTime: 45,
      },
      {
        name: 'ml-service',
        status: 'healthy',
        url: 'http://ml-service:8000',
        lastChecked: new Date().toISOString(),
        responseTime: 120,
      },
      {
        name: 'scraper-service',
        status: 'healthy',
        url: 'http://scraper-service:8001',
        lastChecked: new Date().toISOString(),
        responseTime: 89,
      },
      {
        name: 'kis-api',
        status: 'healthy',
        url: 'KIS OpenAPI',
        lastChecked: new Date().toISOString(),
        responseTime: 210,
      },
    ],
  };
}

export function generateDummyConfig(): TradingConfig {
  return {
    mode: 'paper',
    shortCycleDays: 15,
    longCycleDays: 63,
    strategyRatio: {
      activeAI: 70,
      benchmark: 30,
    },
    capital: 100000,
    maxHoldings: 100,
    rebalanceTime: '08:30',
    automationEnabled: true,
    benchmarkETF: 'QQQ',
  };
}

// ─── 파이프라인 더미 데이터 ───

export function generateDummyPipelineStatus(): PipelineStatus {
  const now = new Date('2026-03-20T09:00:00');
  const steps: PipelineStep[] = [
    {
      id: 'scraping',
      name: '데이터 수집',
      description: 'TradingView에서 101개 종목 × 6 타임프레임 스크래핑',
      scheduledTime: '06:00',
      status: 'completed',
      lastRunAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
      lastRunDuration: 1820,
      lastRunMessage: '101/101 종목 완료, 606 테이블 업데이트',
      nextRunAt: '2026-03-21T06:00:00',
    },
    {
      id: 'feature-engineering',
      name: '피처 엔지니어링',
      description: '85개 기술지표 + 거시경제 피처 계산 → etf2_db_processed',
      scheduledTime: '07:00',
      status: 'completed',
      lastRunAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
      lastRunDuration: 420,
      lastRunMessage: '101 종목 피처 처리 완료',
      nextRunAt: '2026-03-21T07:00:00',
    },
    {
      id: 'prediction',
      name: 'ML 예측',
      description: 'LightGBM LambdaRank 모델로 100일 후 수익률 상위 종목 랭킹',
      scheduledTime: '07:30',
      status: 'completed',
      lastRunAt: new Date(now.getTime() - 1.5 * 3600000).toISOString(),
      lastRunDuration: 180,
      lastRunMessage: 'Top 100 종목 랭킹 완료 (1위: NVDA, 2위: AVGO, 3위: META)',
      nextRunAt: '2026-03-21T07:30:00',
    },
    {
      id: 'trade-decision',
      name: '매매 결정',
      description: 'FIFO 기반 코호트 만기 매도 + 신규 매수 종목 결정',
      scheduledTime: '08:00',
      status: 'completed',
      lastRunAt: new Date(now.getTime() - 1 * 3600000).toISOString(),
      lastRunDuration: 15,
      lastRunMessage: '매수 3건 (AAPL, MSFT, NVDA), 매도 1건 (INTC) 결정',
      nextRunAt: '2026-03-21T08:00:00',
    },
    {
      id: 'kis-order',
      name: 'KIS 예약주문',
      description: 'KIS API를 통해 미국장 개장 전 예약주문 제출',
      scheduledTime: '08:30',
      status: 'completed',
      lastRunAt: new Date(now.getTime() - 0.5 * 3600000).toISOString(),
      lastRunDuration: 8,
      lastRunMessage: '예약주문 4건 제출 완료 (매수 3, 매도 1)',
      nextRunAt: '2026-03-21T08:30:00',
    },
    {
      id: 'settlement',
      name: '체결 확인',
      description: '장 마감 후 체결 결과 확인 및 DB 저장',
      scheduledTime: '16:30',
      status: 'scheduled',
      lastRunAt: '2026-03-19T16:30:00',
      lastRunDuration: 12,
      lastRunMessage: '전일 주문 4건 전량 체결 확인',
      nextRunAt: '2026-03-20T16:30:00',
    },
  ];

  return {
    isRunning: false,
    currentStep: null,
    steps,
    lastFullRunAt: new Date(now.getTime() - 0.5 * 3600000).toISOString(),
    lastFullRunSuccess: true,
  };
}

export function generateDummyScheduleConfig(): ScheduleConfig {
  return {
    scraping: '06:00',
    featureEngineering: '07:00',
    prediction: '07:30',
    tradeDecision: '08:00',
    kisOrder: '08:30',
    monthlyRetrain: '03:00',
  };
}

// ─── DB 뷰어 더미 데이터 ───

const SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'JPM', 'LLY',
  'V', 'UNH', 'MA', 'COST', 'HD', 'NFLX', 'ADBE', 'CRM', 'AMD', 'QCOM',
  'WMT', 'BAC', 'XOM', 'GS', 'PG', 'JNJ', 'MRK', 'ABBV', 'PFE', 'KO',
  'BRK.B', 'WFC', 'CSCO', 'ORCL', 'INTC', 'TXN', 'NOW', 'INTU', 'AMAT', 'ADI',
];
const TIMEFRAMES = ['D', 'W', 'M', '1h', '10m', '12M'];

export function generateDummyDBOverview(db: 'etf2_db' | 'etf2_db_processed' = 'etf2_db'): DBOverview {
  const tables: DBTableInfo[] = [];
  const today = new Date('2026-03-20');

  const symbols = db === 'etf2_db' ? SYMBOLS : SYMBOLS.slice(0, 30);
  const timeframes = db === 'etf2_db' ? TIMEFRAMES : ['D'];

  symbols.forEach(symbol => {
    timeframes.forEach(tf => {
      const isStale = Math.random() < 0.05; // 5% stale
      const latestDate = new Date(today);
      if (isStale) {
        latestDate.setDate(latestDate.getDate() - Math.floor(Math.random() * 10 + 3));
      } else {
        latestDate.setDate(latestDate.getDate() - Math.floor(Math.random() * 2));
      }

      const rowCounts: Record<string, number> = {
        'D': 252, 'W': 52, 'M': 12, '1h': 390, '10m': 2340, '12M': 252,
      };

      tables.push({
        tableName: `${symbol}_${tf}`,
        symbol,
        timeframe: tf,
        rowCount: rowCounts[tf] || 252 + Math.floor(Math.random() * 50),
        latestDate: latestDate.toISOString().split('T')[0],
        oldestDate: '2025-03-20',
        isUpToDate: !isStale,
      });
    });
  });

  const upToDate = tables.filter(t => t.isUpToDate).length;

  return {
    database: db,
    totalTables: tables.length,
    totalRows: tables.reduce((sum, t) => sum + t.rowCount, 0),
    upToDateTables: upToDate,
    staleTables: tables.length - upToDate,
    lastChecked: new Date().toISOString(),
    tables,
  };
}

// ─── 개발자 설정 더미 ───

export function generateDummyDeveloperConfig(): DeveloperConfig {
  return {
    automationEnabled: true,
    tradingMode: 'paper',
    maxHoldings: 100,
    activeRatio: 70,
    benchmarkRatio: 30,
    cycleDays: 63,
    capital: 100000,
    benchmarkETF: 'QQQ',
    kisApiConnected: true,
    schedule: generateDummyScheduleConfig(),
  };
}
