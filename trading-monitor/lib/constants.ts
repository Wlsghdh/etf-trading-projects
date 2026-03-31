// API endpoints (basePath /trading applied automatically)
export const API_ENDPOINTS = {
  TRADING_STATUS: '/trading/api/trading/status',
  PORTFOLIO: '/trading/api/trading/portfolio',
  HISTORY: '/trading/api/trading/history',
  ORDERS: '/trading/api/trading/orders',
  AUTOMATION: '/trading/api/trading/automation',
  BALANCE: '/trading/api/trading/balance',
  RESET: '/trading/api/trading/reset',
  HEALTH: '/trading/api/health',
  CHART_DATA: '/trading/api/data',       // + /{symbol}?timeframe=D&limit=100
  FORECAST: '/trading/api/predictions/forecast', // + /{symbol}?days=30
  ORDER_LOGS: '/trading/api/trading/order-logs',
  TRADING_LOGS: '/trading/api/trading/trading-logs',
  SCRAPER_LOGS: '/trading/api/scraper/logs',
  SCRAPER_STATUS: '/trading/api/scraper/status',
  DB_TABLES: '/trading/api/db/tables',   // + ?db_name=etf2_db
  DB_TABLE_DATA: '/trading/api/db/tables', // + /{tableName}/data?db_name=etf2_db
} as const;

// Refresh intervals (milliseconds)
export const REFRESH_INTERVALS = {
  STATUS: 10000,     // 10 seconds
  PORTFOLIO: 30000,  // 30 seconds
  ORDERS: 10000,     // 10 seconds
  HISTORY: 60000,    // 1 minute
  HEALTH: 30000,     // 30 seconds
  SCRAPER_LOGS: 5000,  // 5 seconds
  SCRAPER_STATUS: 10000, // 10 seconds
} as const;

// Trading service backend URL
export const TRADING_SERVICE_URL = process.env.TRADING_SERVICE_URL || 'http://localhost:8002';
export const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
export const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://localhost:8001';

// Navigation items
export const NAV_ITEMS = [
  { href: '/trading', label: '대시보드', icon: 'dashboard' },
  { href: '/trading/calendar', label: '달력', icon: 'calendar' },
  { href: '/trading/portfolio', label: '포트폴리오', icon: 'portfolio' },
  { href: '/trading/settings', label: '설정', icon: 'settings' },
] as const;
