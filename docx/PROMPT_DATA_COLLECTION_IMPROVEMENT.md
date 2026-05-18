# 데이터 수집 종목 확대 및 알고리즘 개선 프롬프트

> **이 문서의 목적**: 이 프로젝트를 처음 보는 개발자가 프로젝트를 완전히 이해하고, 데이터 수집 확대 및 ML 알고리즘 개선 작업을 수행할 수 있도록 작성된 종합 가이드입니다.

---

## 1. 프로젝트 전체 그림

### 1-1. 무엇을 하는 프로젝트인가?

미국 주식(ETF 대상 후보) 데이터를 매일 수집하고, LightGBM 랭킹 모델로 **"다음 3개월 동안 가장 많이 오를 종목 순위"**를 예측하는 시스템이다. 예측 결과를 바탕으로 ETF 포트폴리오를 구성한다.

### 1-2. 전체 데이터 파이프라인 흐름

```
[1단계: 데이터 수집]
TradingView (Playwright 스크래핑)
  → CSV 다운로드 (OHLCV: 시가, 고가, 저가, 종가, 거래량)
  → MySQL (etf2_db) 업로드

yfinance (배당/분할 데이터)
  → corporate_dividends, corporate_splits 테이블

FRED API (매크로 경제 지표)
  → VIX, 금리, CPI, 실업률, 유가, 환율 등

[2단계: 피처 처리]
etf2_db (원본 OHLCV)
  → process_features.py (96개 기술적 지표 계산)
  → etf2_db_processed (피처 + 타겟 저장)

[3단계: 모델 학습 (월 1회)]
etf2_db_processed
  → train_ahnlab.py (LightGBM LambdaRank 학습)
  → 모델 파일 저장 (ml-service/data/models/)

[4단계: 일일 예측 (매일)]
etf2_db_processed (최신 피처)
  → 학습된 모델로 전 종목 순위 예측
  → predictions.db (SQLite) 저장
  → FastAPI 엔드포인트로 결과 제공

[5단계: 시각화]
Next.js 웹 대시보드
  → FastAPI API 호출
  → 예측 순위, 포트폴리오, 수익률 표시
```

### 1-3. 아키텍처 다이어그램

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Production Server (Docker Compose)                │
│                                                                      │
│  ┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐  │
│  │ web-dashboard    │     │ ml-service        │     │ scraper-     │  │
│  │ (Next.js :3000)  │────▶│ (FastAPI :8000)   │     │ service      │  │
│  │                  │     │                   │     │ (FastAPI     │  │
│  │ - 예측 결과      │     │ - 예측 API        │     │  :8001)      │  │
│  │ - 포트폴리오     │     │ - 모델 관리       │     │              │  │
│  │ - 수익률 분석    │     │ - SQLite(예측)    │     │ - TradingView│  │
│  └─────────────────┘     └────────┬─────────┘     │   스크래핑    │  │
│                                    │                │ - DB 업로드   │  │
│                                    │                └──────┬───────┘  │
│                                    │                       │          │
│                          ┌─────────▼───────────────────────▼───────┐  │
│                          │         MySQL (Port 3306)               │  │
│                          │  ┌───────────────┐ ┌─────────────────┐  │  │
│                          │  │ etf2_db       │ │ etf2_db_        │  │  │
│                          │  │ (원본 OHLCV)  │ │ processed       │  │  │
│                          │  │ ~500 테이블   │ │ (피처+타겟)     │  │  │
│                          │  └───────────────┘ └─────────────────┘  │  │
│                          └─────────────────────────────────────────┘  │
│                                    ▲                                  │
│                                    │ SSH 터널 (3306 → 원격서버:5100) │
└────────────────────────────────────┼──────────────────────────────────┘
                                     │
                            ┌────────▼────────┐
                            │ 원격 MySQL 서버  │
                            │ (ahnbi2.suwon.  │
                            │  ac.kr:5100)    │
                            └─────────────────┘
```

### 1-4. 기술 스택

| 영역 | 기술 | 버전 |
|------|------|------|
| 스크래핑 | Playwright (Python) | ^1.40.0 |
| ML 모델 | LightGBM (LambdaRank) | ^4.1.0 |
| 백엔드 API | FastAPI | ^0.104.1 |
| ORM | SQLAlchemy | ^2.0.23 |
| 원본 DB | MySQL (PyMySQL) | - |
| 예측 저장 | SQLite | - |
| 피처 계산 | pandas-ta | >=0.3.14b0 |
| 매크로 데이터 | fredapi | >=0.5.0 |
| 배당/분할 | yfinance | ^0.2.28 |
| 웹 대시보드 | Next.js 16 + TypeScript | - |
| 컨테이너 | Docker Compose | - |

---

## 2. 현재 데이터 수집 시스템 상세

### 2-1. 수집 종목 (101개)

종목 리스트는 **두 파일에 하드코딩**되어 있다:

**파일 1: `scraper-service/scripts/tradingview_playwright_scraper_upload.py` (라인 91~117)**
**파일 2: `scraper-service/app/services/scraper.py` (라인 66~115)**

```python
# 두 파일 모두 동일한 리스트
STOCK_LIST = [
    # Technology (30개)
    "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "META", "AVGO", "ADBE",
    "CRM", "CSCO", "ORCL", "AMD", "INTC", "QCOM", "TXN", "NOW",
    "INTU", "AMAT", "ADI", "LRCX", "KLAC", "MU", "PANW", "CRWD",
    "ANET", "PLTR", "APP", "IBM", "HOOD", "IBKR",
    # Communication Services (4개)
    "AMZN", "TSLA", "NFLX", "T",
    # Consumer (9개)
    "WMT", "HD", "COST", "MCD", "LOW", "TJX", "BKNG", "PEP", "KO",
    # Financials (15개)
    "BRK.B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK",
    "SCHW", "AXP", "C", "SPGI", "COF", "BX",
    # Healthcare (14개)
    "UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT",
    "DHR", "AMGN", "ISRG", "GILD", "BSX", "SYK",
    # Industrials (12개)
    "CAT", "GE", "HON", "UNP", "BA", "RTX", "LMT", "DE",
    "ETN", "PLD", "MDT", "MMM",
    # Energy (3개)
    "XOM", "CVX", "COP",
    # Consumer Staples (3개)
    "PG", "PM", "LIN",
    # Utilities & Others (11개)
    "NEE", "CEG", "DIS", "VZ", "TMUS", "UBER", "GEV", "PGR",
    "WELL", "APH", "ACN",
]
```

**거래소 매핑** (`scraper-service/app/services/scraper.py` 라인 95~115):
```python
# TradingView에서 심볼 검색 시 거래소 프리픽스가 필요함
# NYSE 종목은 "NYSE:JPM" 형태로, 나머지는 "NASDAQ:AAPL" 형태로 검색
NYSE_SYMBOLS = {
    "BRK.B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK",
    "SCHW", "AXP", "C", "SPGI", "COF", "BX",  # Financials
    "UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT",
    "DHR", "AMGN", "ISRG", "GILD", "BSX", "SYK",  # Healthcare
    "CAT", "GE", "HON", "UNP", "BA", "RTX", "LMT", "DE",
    "ETN", "PLD", "MDT", "MMM",  # Industrials
    "XOM", "CVX", "COP",  # Energy
    "PG", "PM", "LIN",  # Consumer Staples
    "NEE", "CEG", "WMT", "HD", "COST", "MCD", "LOW", "TJX",
    "BKNG", "DIS", "VZ", "WELL", "ACN", "T"
}
# 이 세트에 없으면 NASDAQ으로 간주
```

**섹터 불균형 문제:**
| 섹터 | 현재 종목 수 | 비율 |
|------|------------|------|
| Technology | 30 | 29.7% |
| Financials | 15 | 14.9% |
| Healthcare | 14 | 13.9% |
| Industrials | 12 | 11.9% |
| Utilities & Others | 11 | 10.9% |
| Consumer | 9 | 8.9% |
| Communication | 4 | 4.0% |
| Energy | 3 | 3.0% |
| Consumer Staples | 3 | 3.0% |

### 2-2. 스크래핑 동작 방식

두 가지 스크래퍼가 존재하며 동일한 로직이다:

| 구분 | Docker API (권장) | 레거시 호스트 |
|------|-------------------|--------------|
| 파일 | `app/services/scraper.py` | `scripts/tradingview_playwright_scraper_upload.py` |
| 실행 | `curl -X POST http://localhost:8001/api/scrape` | `poetry run python scripts/...` |
| 모니터링 연동 | O (task_info.json 생성) | X |
| SSH 터널 | 불필요 (Docker 네트워크) | 수동 설정 필요 |

**스크래핑 프로세스 (실제 코드 기반):**

```python
# 1. 브라우저 시작 + 쿠키 로드
async def start(self):
    self.playwright = await async_playwright().start()
    self.browser = await self.playwright.chromium.launch(
        headless=self.headless,
        args=["--disable-blink-features=AutomationControlled",
              "--no-sandbox", "--disable-dev-shm-usage"]
    )
    self.context = await self.browser.new_context(
        viewport={"width": 1920, "height": 1080},
        user_agent="Mozilla/5.0 ...",
        accept_downloads=True,
    )
    # 이전 세션 쿠키 로드 (로그인 유지)
    if COOKIES_FILE.exists():
        cookies = json.load(open(COOKIES_FILE))
        await self.context.add_cookies(cookies)

# 2. TradingView 로그인 (최초 1회, 이후 쿠키로 유지)
async def login(self, username, password):
    await self.page.goto("https://kr.tradingview.com/accounts/signin/")
    await self.page.click('button:has-text("이메일")')
    await self.page.fill('input[name="id_username"]', username)
    await self.page.fill('input[name="id_password"]', password)
    await self.page.click('button:has-text("로그인")')
    # CAPTCHA가 나오면 수동으로 풀어야 함 (120초 타임아웃)
    await self.page.wait_for_url(lambda url: "chart" in url, timeout=120000)
    await self.save_cookies()

# 3. 심볼 검색 및 선택
async def search_and_select_symbol(self, symbol):
    symbol_btn = self.page.locator("#header-toolbar-symbol-search")
    await symbol_btn.click()
    search_input = self.page.get_by_placeholder("심볼, ISIN 또는 CUSIP").first
    await search_input.fill(symbol)
    # 검색 결과에서 첫 번째 항목 클릭
    nasdaq_result = self.page.locator('[data-role="list-item"]').first
    await nasdaq_result.click()

# 4. 차트 기간 변경 (4개 타임프레임 순회)
TIME_PERIODS = [
    {"name": "12달", "button_text": "1Y", "interval": "1 날"},   # Daily
    {"name": "1달",  "button_text": "1M", "interval": "30 분"},  # 30min
    {"name": "1주",  "button_text": "5D", "interval": "5 분"},   # 5min
    {"name": "1일",  "button_text": "1D", "interval": "1 분"},   # 1min
]

async def change_time_period(self, button_text):
    period_button = self.page.locator(f'button:has-text("{button_text}")').first
    await period_button.click()
    await asyncio.sleep(2)  # 차트 로딩 대기

# 5. CSV 다운로드
async def export_chart_data(self, output_filename=None):
    # TradingView UI에서 "차트 데이터 다운로드" 메뉴 클릭
    download_option = self.page.get_by_role("row", name="차트 데이터 다운로드")
    await download_option.click()
    async with self.page.expect_download(timeout=30000) as download_info:
        download_btn = self.page.get_by_role("button", name="다운로드")
        await download_btn.click()
    download = await download_info.value
    save_path = DOWNLOAD_DIR / (output_filename or download.suggested_filename)
    await download.save_as(save_path)
    return save_path

# 6. 전체 종목 순회 (메인 루프)
async def process_all_stocks(self, stock_list=None):
    if stock_list is None:
        stock_list = STOCK_LIST  # 101개
    for i, symbol in enumerate(stock_list):
        # 심볼 선택
        await self.search_and_select_symbol(symbol)
        # 4개 타임프레임 각각 수집
        for period in TIME_PERIODS:
            await self.change_time_period(period["button_text"])
            csv_path = await self.export_chart_data(f"{symbol}_{period['name']}.csv")
            if csv_path and self.upload_to_db:
                self.db_service.upload_csv(csv_path, symbol, timeframe_code)
        # 배당/분할 데이터 수집 (yfinance)
        if self.fetch_corporate_actions:
            await self.fetch_and_upload_corporate_actions(symbol)
        await asyncio.sleep(2)  # Rate limiting
```

### 2-3. DB 업로드 & 테이블 구조

**파일: `scraper-service/app/services/db_service.py`**

```python
# DB 연결
DB_URL = "mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_db"
```

**OHLCV 테이블 스키마 (종목당 1~4개 테이블):**
```sql
-- 테이블 이름: {SYMBOL}_{TIMEFRAME} (예: AAPL_D, NVDA_30m, MSFT_5m)
-- 총 약 500개 테이블 (101 종목 × 4 타임프레임 + 기타)
CREATE TABLE `{symbol}_{timeframe}` (
    `time`      DATETIME     NOT NULL PRIMARY KEY,
    `symbol`    VARCHAR(32)  NOT NULL,
    `timeframe` VARCHAR(16)  NOT NULL,
    `open`      DOUBLE,
    `high`      DOUBLE,
    `low`       DOUBLE,
    `close`     DOUBLE,
    `volume`    BIGINT,
    `rsi`       DOUBLE,      -- TradingView에서 계산된 RSI (있을 때만)
    `macd`      DOUBLE       -- TradingView에서 계산된 MACD (있을 때만)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**배당금 테이블:**
```sql
CREATE TABLE IF NOT EXISTS `corporate_dividends` (
    `symbol`           VARCHAR(32)   NOT NULL,
    `ex_date`          DATE          NOT NULL,
    `amount`           DECIMAL(12,6) NOT NULL,
    `declaration_date`  DATE,
    `record_date`      DATE,
    `payment_date`     DATE,
    `created_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`symbol`, `ex_date`),
    INDEX `idx_ex_date` (`ex_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**주식 분할 테이블:**
```sql
CREATE TABLE IF NOT EXISTS `corporate_splits` (
    `symbol`       VARCHAR(32)   NOT NULL,
    `ex_date`      DATE          NOT NULL,
    `split_ratio`  DECIMAL(10,6) NOT NULL,
    `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`symbol`, `ex_date`),
    INDEX `idx_ex_date` (`ex_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**스크래핑 로그 테이블:**
```sql
CREATE TABLE IF NOT EXISTS scraping_logs (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_id     VARCHAR(50) NOT NULL,
    timestamp  DATETIME(3) NOT NULL,
    level      ENUM('DEBUG','INFO','WARNING','ERROR','CRITICAL') NOT NULL,
    symbol     VARCHAR(20),
    timeframe  VARCHAR(10),
    message    TEXT NOT NULL,
    extra_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job_id (job_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_level (level),
    INDEX idx_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**UPSERT 로직 (중복 시 덮어쓰기):**
```python
insert_sql = text(f"""
    INSERT INTO `{table_name}`
    (`time`, `symbol`, `timeframe`, `open`, `high`, `low`, `close`, `volume`, `rsi`, `macd`)
    VALUES (:time, :symbol, :timeframe, :open, :high, :low, :close, :volume, :rsi, :macd)
    ON DUPLICATE KEY UPDATE
        `open` = VALUES(`open`), `high` = VALUES(`high`),
        `low` = VALUES(`low`),   `close` = VALUES(`close`),
        `volume` = VALUES(`volume`), `rsi` = VALUES(`rsi`), `macd` = VALUES(`macd`)
""")
```

**CSV 파싱 처리:**
```python
def parse_tradingview_csv(self, csv_path):
    df = pd.read_csv(csv_path)
    df.columns = [c.strip().lower() for c in df.columns]
    # TradingView CSV 컬럼: time, open, high, low, close, (volume)
    df["time"] = pd.to_datetime(df["time"])
    if "volume" not in df.columns:
        df["volume"] = 0
    df["volume"] = df["volume"].fillna(0).astype(int)
    return df.sort_values("time").dropna(subset=["time"])
```

### 2-4. 타임프레임 코드 매핑

```python
# _get_timeframe_code() 메서드
def _get_timeframe_code(self, period_name):
    mapping = {
        "12달": "D",    # 1년치 일봉 → Daily
        "1달": "D",     # 1개월치 일봉 (실제로는 D)
        "1주": "D",     # 1주치 (실제로는 D)
        "1일": "1h",    # 1일치 → 시간봉
    }
    return mapping.get(period_name, "D")
```

> **주의**: 수집 설정(TIME_PERIODS)에는 "30분", "5분", "1분"으로 표시되지만, 실제 DB에 저장될 때는 위 매핑을 따른다. 이 부분에 불일치가 있을 수 있다.

---

## 3. 피처 엔지니어링 시스템 상세

### 3-1. 피처 처리 파이프라인

**파일: `scraper-service/scripts/process_features.py`**

```bash
# 실행 방법
cd scraper-service
poetry run python scripts/process_features.py                           # 전체 종목
poetry run python scripts/process_features.py --symbols AAPL NVDA       # 특정 종목
poetry run python scripts/process_features.py --start-date 2015-01-01   # 시작일 지정
poetry run python scripts/process_features.py --no-macro                # 매크로 피처 제외
poetry run python scripts/process_features.py --no-shift                # 피처 시프트 안 함
poetry run python scripts/process_features.py --dry-run                 # DB 저장 안 함
```

**처리 흐름:**
```
etf2_db의 {SYMBOL}_D 테이블 (원본 OHLCV)
  │
  ▼
MySQLProvider.load() → pandas DataFrame
  │
  ▼
FeaturePipeline.create_panel()
  ├── 기술적 지표 계산 (pandas-ta: RSI, MACD, BB, ADX 등)
  ├── 수익률 계산 (1d, 5d, 10d, 20d, 30d, 63d)
  ├── 변동성 계산 (20d, 63d 롤링 표준편차)
  ├── 가격 비율 (SMA/EMA 대비 현재가)
  ├── 매크로 지표 병합 (FRED API: VIX, 금리, CPI 등)
  ├── Z-score 정규화 (날짜별 크로스섹션)
  ├── 퍼센타일 랭크 (날짜별 크로스섹션)
  ├── 타겟 변수 생성 (63일 선행 수익률)
  └── 피처 1일 시프트 (미래 데이터 누출 방지)
  │
  ▼
etf2_db_processed의 {SYMBOL}_D 테이블 (피처 + 타겟)
```

### 3-2. 전체 피처 목록 (97개)

**파일: `ml-service/ml/features/ahnlab/constants.py`**

#### 기본 피처 (BASE_FEATURE_COLS: 59개)

```python
# ===== 가격/거래량 (7개) =====
"open", "high", "low", "close", "volume", "dividends", "stock_splits"

# ===== 수익률 (4개) =====
"ret_1d",      # 1일 수익률
"ret_5d",      # 5일(1주) 수익률
"ret_20d",     # 20일(1개월) 수익률
"ret_63d",     # 63일(3개월) 수익률

# ===== MACD (3개) =====
"macd",        # MACD 라인
"macd_signal", # 시그널 라인
"macd_hist",   # MACD 히스토그램

# ===== RSI (2개) =====
"rsi_14",      # 14일 RSI
"rsi_28",      # 28일 RSI

# ===== 볼린저 밴드 (5개) =====
"bb_upper", "bb_middle", "bb_lower",
"bb_width",    # 밴드 폭 (변동성)
"bb_position", # 밴드 내 현재가 위치 (0~1)

# ===== ATR (1개) =====
"atr_14",      # 14일 Average True Range

# ===== OBV (1개) =====
"obv",         # On-Balance Volume

# ===== 이동평균 - EMA (4개) =====
"ema_10", "ema_20", "ema_50", "ema_200"

# ===== 이동평균 - SMA (3개) =====
"sma_10", "sma_20", "sma_50"

# ===== 오실레이터 (6개) =====
"stoch_k",     # 스토캐스틱 %K
"stoch_d",     # 스토캐스틱 %D
"adx",         # Average Directional Index (추세 강도)
"cci",         # Commodity Channel Index
"willr",       # Williams %R
"mfi",         # Money Flow Index

# ===== 거래량 지표 (3개) =====
"vwap",        # Volume Weighted Average Price
"volume_sma_20", # 20일 거래량 이동평균
"volume_ratio",  # 현재 거래량 / 20일 평균

# ===== 매크로 경제 (10개, FRED API) =====
"vix",              # 변동성 지수
"fed_funds_rate",   # 연방기금금리
"unemployment_rate",# 실업률
"cpi",              # 소비자물가지수
"treasury_10y",     # 10년 국채 수익률
"treasury_2y",      # 2년 국채 수익률
"yield_curve",      # 장단기 스프레드 (10y - 2y)
"oil_price",        # WTI 원유가격
"usd_eur",          # 달러/유로 환율
"high_yield_spread" # 하이일드 스프레드 (신용 위험)
```

#### 엔지니어링 피처 (ENGINEERED_FEATURE_COLS: 26개)

```python
# ===== 추가 수익률 (2개) =====
"ret_10d", "ret_30d"

# ===== 변동성 (2개) =====
"vol_20d",     # 20일 롤링 변동성 (수익률의 표준편차)
"vol_63d",     # 63일 롤링 변동성

# ===== 가격 비율 (7개) =====
"price_to_sma_50",     # 현재가 / SMA50 (단기 추세)
"price_to_ema_200",    # 현재가 / EMA200 (장기 추세)
"price_to_ema_10",     # 현재가 / EMA10
"price_to_ema_50",     # 현재가 / EMA50
"close_to_high_20d",   # 현재가 / 20일 최고가
"close_to_high_63d",   # 현재가 / 63일 최고가
"close_to_high_126d",  # 현재가 / 126일 최고가
"close_to_high_52w",   # 현재가 / 52주 최고가 (인기 지표)

# ===== 모멘텀 (3개) =====
"ret_5d_20d_ratio",    # 단기/중기 수익률 비율
"momentum_strength",   # 복합 모멘텀 강도
"trend_acceleration",  # 추세 가속도

# ===== 거래량 (4개) =====
"volume_trend",        # 거래량 추세
"volume_surge",        # 거래량 급증 정도
"ret_vol_ratio_20d",   # 수익률/변동성 비율 (20일)
"ret_vol_ratio_63d",   # 수익률/변동성 비율 (63일)

# ===== 추가 EMA (4개) =====
"ema_5", "ema_100",
"ema_cross_short",     # 단기 EMA 크로스 (EMA5 vs EMA20)
"ema_cross_long",      # 장기 EMA 크로스 (EMA50 vs EMA200)
"ema_slope_20",        # EMA20 기울기 (추세 방향)
```

#### Z-Score 정규화 피처 (7개)

```python
# 날짜별 크로스섹션에서 z-score 정규화
# 해당 날짜의 전 종목 중에서 상대적 위치를 표준화
ZS_BASE_COLS = [
    "vol_63d",           # 장기 변동성의 상대적 크기
    "volume_sma_20",     # 거래량의 상대적 크기
    "obv",               # OBV의 상대적 크기
    "vwap",              # VWAP의 상대적 크기
    "ema_200",           # 장기 EMA의 상대적 크기
    "price_to_ema_200",  # 장기 추세 이탈도
    "close_to_high_52w"  # 52주 고점 대비 위치
]
# 생성 피처: vol_63d_zs, volume_sma_20_zs, obv_zs, vwap_zs,
#           ema_200_zs, price_to_ema_200_zs, close_to_high_52w_zs
```

#### 퍼센타일 랭크 피처 (5개)

```python
# 날짜별 크로스섹션에서 퍼센타일 랭크 (0~1)
RANK_BASE_COLS = [
    "ret_20d",           # 1개월 수익률 순위
    "ret_63d",           # 3개월 수익률 순위
    "vol_20d",           # 단기 변동성 순위
    "momentum_strength", # 모멘텀 강도 순위
    "volume_surge"       # 거래량 급증 순위
]
# 생성 피처: ret_20d_rank, ret_63d_rank, vol_20d_rank,
#           momentum_strength_rank, volume_surge_rank
```

### 3-3. Processed DB 테이블 스키마

**파일: `scraper-service/app/services/processed_db_service.py`**

```sql
-- 데이터베이스: etf2_db_processed
-- 테이블 이름: {SYMBOL}_D (예: AAPL_D, NVDA_D)
CREATE TABLE `{symbol}_D` (
    `time`         DATETIME    NOT NULL PRIMARY KEY,
    `symbol`       VARCHAR(32) NOT NULL,
    `timeframe`    VARCHAR(16) NOT NULL,

    -- 원본 OHLCV (7개)
    `open` DOUBLE, `high` DOUBLE, `low` DOUBLE, `close` DOUBLE,
    `volume` BIGINT, `dividends` DOUBLE, `stock_splits` DOUBLE,

    -- 97개 피처 컬럼 (모두 DOUBLE 타입)
    `ret_1d` DOUBLE, `ret_5d` DOUBLE, ... (나머지 피처들)

    -- 타겟 변수
    `target_3m`    DOUBLE,     -- 63일 후 수익률 (학습 타겟)
    `target_date`  DATETIME,   -- 타겟 날짜

    -- 메타데이터
    `processed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 4. ML 모델 시스템 상세

### 4-1. 모델 아키텍처: AhnLab LightGBM LambdaRank

**파일: `ml-service/ml/models/ahnlab_lgbm.py` (717줄)**

**핵심 개념:**
- **LambdaRank**: 수익률 자체를 예측하는 게 아니라, "어떤 종목이 다른 종목보다 더 좋을지" **상대 순위**를 학습
- **NDCG@100**: 상위 100개 종목의 순위 품질을 평가하는 지표
- **2-Fold Rolling CV**: 시계열 특성을 고려한 교차 검증

**하이퍼파라미터 (고정값):**
```python
LGB_PARAMS = {
    "objective": "lambdarank",     # 순위 학습
    "metric": "ndcg",              # NDCG로 평가
    "label_gain": [0, 1, 2, ..., 142],  # 50개 relevance 레벨의 gain 값
    "learning_rate": 0.05,
    "max_depth": -1,               # 깊이 제한 없음
    "num_leaves": 45,
    "min_child_samples": 60,       # 리프 노드 최소 샘플
    "subsample": 0.7,              # 행 샘플링
    "subsample_freq": 5,           # 5 라운드마다 리샘플링
    "colsample_bytree": 0.65,      # 피처 샘플링 (65%)
    "min_split_gain": 0.00,
    "reg_alpha": 0.8,              # L1 정규화
    "reg_lambda": 1.2,             # L2 정규화
    "verbosity": 1,
}

NUM_BOOST_ROUND = 5000          # 최대 부스팅 라운드
EARLY_STOPPING_ROUNDS = 150     # 조기 종료 (150라운드 개선 없으면)
TARGET_HORIZON = 63             # 63 거래일 (약 3개월) 선행 수익률
TOP_K = 100                     # 상위 100개 종목 선택
VALIDATION_DAYS = 90            # 검증 기간 90일
MIN_HISTORY_DAYS = 126          # 최소 6개월 히스토리 필요
RELEVANCE_BINS = 50             # 수익률을 50개 구간으로 나눔
SEED = 42
```

### 4-2. 타겟 변수 생성

```python
def add_relevance_labels(df, target_col="target_3m", n_bins=50):
    """
    연속 수익률 → 이산 relevance 레이블 변환

    - 각 날짜별로 전 종목의 3개월 선행 수익률을 50개 구간으로 나눔
    - 가장 높은 수익률 → relevance 49 (가장 중요)
    - 가장 낮은 수익률 → relevance 0
    - LambdaRank는 이 relevance를 이용해 순위를 학습
    """
    df["relevance"] = df.groupby("date")[target_col].transform(
        lambda x: pd.qcut(x, q=n_bins, labels=False, duplicates="drop")
    )
    return df
```

### 4-3. 학습 프로세스

**파일: `ml-service/scripts/train_ahnlab.py` (420줄)**

```python
def main():
    # 1. 처리된 DB에서 전 종목 패널 데이터 로드
    panel = load_panel_from_db()
    # panel 형태: [date, ticker, open, high, ..., 97개 피처, target_3m]

    # 2. 피처를 1일 시프트 (미래 데이터 누출 방지)
    #    → "오늘의 피처"로 "내일 이후의 수익률"을 예측하도록
    panel = shift_features_for_prediction(panel)

    # 3. 2-Fold Rolling CV 설정
    pred_year = 2026  # 예측 대상 연도
    folds = [
        # Fold 0: 2023년 검증, 2022년 이전 학습
        {"train_end": "2022-12-31", "valid_start": "2023-01-01", "valid_end": "2023-12-31"},
        # Fold 1: 2025년 검증, 2024년 이전 학습
        {"train_end": "2024-12-31", "valid_start": "2025-01-01", "valid_end": "2025-12-31"},
    ]

    # 4. 각 Fold별 모델 학습
    models = []
    for i, fold in enumerate(folds):
        # 학습 데이터 준비
        train_df = prepare_window(panel, start=train_start, end=fold["train_end"])
        valid_df = prepare_window(panel, start=fold["valid_start"], end=fold["valid_end"])

        # LambdaRank는 "그룹" 개념이 필요
        # 같은 날짜의 종목들이 하나의 그룹 → 그룹 내에서 순위를 학습
        train_groups = train_df.groupby("date").size().values  # [101, 101, 101, ...]
        valid_groups = valid_df.groupby("date").size().values

        # LGBMRanker 학습
        ranker = lgb.LGBMRanker(**LGB_PARAMS)
        ranker.fit(
            X_train, y_train,
            group=train_groups,
            eval_set=[(X_valid, y_valid)],
            eval_group=[valid_groups],
            callbacks=[lgb.early_stopping(150), lgb.log_evaluation(100)]
        )
        models.append(ranker)

    # 5. 모델 저장
    # ml-service/data/models/ahnlab_lgbm/v20260401/
    #   ├── ahnlab_lgbm_fold0.txt  (부스터 모델)
    #   ├── ahnlab_lgbm_fold1.txt  (부스터 모델)
    #   └── metadata.json
    for i, model in enumerate(models):
        model.booster_.save_model(f"ahnlab_lgbm_fold{i}.txt")

    # current 심링크 업데이트
    # current → v20260401/
```

### 4-4. 예측 프로세스

**파일: `ml-service/app/services/prediction_service.py` (377줄)**

```python
def predict_ranking(self, timeframe="D"):
    """전 종목 순위 예측 (매일 실행)"""

    # 1. 전 종목의 최신 피처 로드 (etf2_db_processed)
    features_df = self.data_service.get_all_latest_features(timeframe)
    # features_df: [symbol, date, 97개 피처 컬럼, close]

    # 2. 모델 입력 피처 추출
    X = features_df[[c for c in ALL_FEATURE_COLS if c in features_df.columns]]

    # 3. 앙상블 예측 (2개 fold 모델 평균)
    scores = model.predict(X)
    # predict() 내부:
    #   preds = (fold0.predict(X) + fold1.predict(X)) / 2

    # 4. 점수 기반 순위 매기기
    features_df["score"] = scores
    features_df = features_df.sort_values("score", ascending=False)
    features_df["rank"] = range(1, len(features_df) + 1)

    # 5. 방향 및 가중치 계산
    n = len(features_df)
    for _, row in features_df.iterrows():
        rank = row["rank"]
        # 선형 가중치: 1위 = +1.0, 꼴찌 = -1.0
        weight = 1.0 - 2.0 * (rank - 1) / (n - 1)
        direction = "BUY" if weight > 0.1 else ("SELL" if weight < -0.1 else "HOLD")

    # 6. SQLite에 저장 + API 응답 반환
    return {
        "prediction_date": "2026-04-01",
        "total_symbols": 101,
        "model_name": "ahnlab_lgbm",
        "rankings": [
            {"rank": 1, "symbol": "NVDA", "score": 0.85, "direction": "BUY", "weight": 1.0},
            {"rank": 2, "symbol": "AAPL", "score": 0.82, "direction": "BUY", "weight": 0.98},
            ...
        ]
    }
```

### 4-5. 등록된 모델 목록

**파일: `ml-service/ml/models/factory.py` (303줄)**

현재 코드베이스에 이미 등록되어 있지만 **학습되지 않은** 모델들:

| 모델 | 클래스 | 설명 | 상태 |
|------|--------|------|------|
| `ahnlab_lgbm` | AhnLabLGBMRankingModel | **현재 주력 모델** (LambdaRank) | **학습 완료** |
| `lightgbm` | ETFRankingModel | LightGBM 회귀 | 미학습 |
| `lightgbm_lambdarank` | ETFRankingModel | LambdaRank (구버전) | 미학습 |
| `xgboost` | XGBRankingModel | XGBoost (max_depth=8, lr=0.005) | 미학습 |
| `catboost` | CatBoostRankingModel | CatBoost (depth=4, iter=500) | 미학습 |
| `random_forest` | RandomForestRankingModel | RF (n=1500, depth=15) | 미학습 |
| `extra_trees` | ExtraTreesRankingModel | ExtraTrees (n=500, depth=15) | 미학습 |
| `ridge` | RidgeRankingModel | Ridge 회귀 (alpha=1.0) | 미학습 |
| `lasso` | LassoRankingModel | Lasso (alpha=0.01) | 미학습 |
| `elasticnet` | ElasticNetRankingModel | ElasticNet | 미학습 |
| `svr` | SVRRankingModel | SVR (C=1.0) | 미학습 |
| `ensemble` | EnsembleRankingModel | 다중 모델 앙상블 (rank_avg) | 미학습 |
| `tabpfn` | TabPFNRankingModel | TabPFN (few-shot) | 미학습 |

### 4-6. 자동화 스크립트

**일일 예측 (`scripts/predict-daily.sh`):**
```bash
# cron: 0 22 * * 1-5 (월~금 22:00 UTC = 미국 장 마감 후)
# 1. SSH 터널 확인/시작
# 2. Docker 서비스 확인/시작
# 3. 헬스체크 (최대 30회 재시도)
# 4. POST /api/predictions/ranking 호출
# 5. 결과 로깅 (logs/predict-YYYYMMDD.log)
```

**월간 학습 (`scripts/train-monthly.sh`):**
```bash
# cron: 0 3 1 * * (매월 1일 03:00)
# 1. SSH 터널 확인/시작
# 2. Docker 서비스 확인/시작
# 3. 이전 달 예측 정확도 분석
# 4. docker exec etf-ml-service python scripts/train_ahnlab.py
# 5. 결과 로깅 (logs/train-YYYYMM.log)
```

### 4-7. 예측 결과 저장 (SQLite ORM)

**파일: `ml-service/app/models.py`**

```python
class Prediction(Base):
    __tablename__ = "predictions"

    id                = Column(Integer, primary_key=True)
    symbol            = Column(String(20), index=True)
    prediction_date   = Column(DateTime)       # 예측 실행일
    target_date       = Column(DateTime)       # 예측 대상일 (63일 후)
    current_close     = Column(Float)          # 현재 종가
    predicted_close   = Column(Float)          # 예측 종가
    predicted_direction = Column(String(10))   # BUY/SELL/HOLD
    confidence        = Column(Float)          # 신뢰도
    rsi_value         = Column(Float)
    macd_value        = Column(Float)
    rank              = Column(Integer)        # 순위 (1 = 최고)
    score             = Column(Float)          # 모델 원시 점수
    actual_close      = Column(Float)          # 실제 종가 (나중에 업데이트)
    actual_return     = Column(Float)          # 실제 수익률
    is_correct        = Column(Boolean)        # 예측 적중 여부
    model_name        = Column(String(50), default="ahnlab_lgbm")
    created_at        = Column(DateTime, default=datetime.utcnow)
```

---

## 5. 데이터 품질 검증

**파일: `scripts/validate_data.py`**

현재 5가지 검증만 수행:

| 검증 항목 | 기준 | 통과 조건 |
|-----------|------|-----------|
| 테이블 존재 | - | 테이블이 DB에 존재 |
| 최신 데이터 | 어제 또는 오늘 | `latest_date >= today - 1` |
| NULL 비율 | 5% 이하 | `null_count / total_rows <= 0.05` |
| 중복 타임스탬프 | 0건 | `GROUP BY time HAVING COUNT(*) > 1` 결과 없음 |
| 가격 이상치 | 0 이하 가격, 50% 급변 | `close > 0 AND change < 50%` |

```bash
# 실행 방법
cd scraper-service
poetry run python ../scripts/validate_data.py

# 결과 → logs/validation_YYYYMMDD_HHMMSS.json
```

---

## 6. 인프라 & 연결 정보

### 6-1. Docker Compose 서비스

```yaml
# docker-compose.yml 핵심 설정

ml-service:        # FastAPI ML 서비스 (포트 8000)
  environment:
    - REMOTE_DB_URL=mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db
    - PROCESSED_DB_URL=mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db_processed
    - LOCAL_DB_PATH=/app/data/predictions.db
    - DEFAULT_MODEL=ahnlab_lgbm

scraper-service:   # 스크래퍼 서비스 (포트 8001)
  environment:
    - DB_URL=mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db
    - FRED_API_KEY=9caba366c8bc71e8fea23b45a34651a5
    - HEADLESS=true
    - MAX_RETRIES=3
  extra_hosts:
    - "host.docker.internal:172.17.0.1"  # Docker에서 호스트 MySQL 접근
  volumes:
    - ./scraper-service/logs:/app/logs
    - ./scraper-service/downloads:/app/downloads
    - ./scraper-service/cookies.json:/app/cookies.json:ro

web-dashboard:     # Next.js 대시보드 (포트 3000)
```

### 6-2. DB 연결 구조 (3개 DB)

```
┌─────────────────────────────────────────────────┐
│ ml-service (FastAPI)                             │
│                                                   │
│  remote_engine ──────▶ MySQL: etf2_db            │
│  (원본 OHLCV 조회)     (101종목 × 4 타임프레임)  │
│                                                   │
│  processed_engine ──▶ MySQL: etf2_db_processed   │
│  (피처 + 타겟 조회)    (101종목, 97개 피처)       │
│                                                   │
│  local_engine ──────▶ SQLite: predictions.db     │
│  (예측 결과 저장)      (일일 예측 기록)           │
└─────────────────────────────────────────────────┘
```

### 6-3. SSH 터널

```bash
# 호스트에서 SSH 터널 시작 (Docker 서비스 시작 전 필수)
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3

# Docker 컨테이너는 172.17.0.1:3306으로 호스트의 터널에 접근
# 172.17.0.1 = Docker 브릿지 네트워크의 호스트 게이트웨이
```

---

## 7. 현재 알려진 문제점 & 한계

### 데이터 수집
1. **종목 하드코딩**: 종목 추가/제거 시 코드 2곳 동시 수정 필요
2. **섹터 불균형**: Technology 30개 vs Energy 3개
3. **단일 데이터 소스**: TradingView UI 변경 시 전체 스크래퍼 중단
4. **CAPTCHA**: 첫 로그인 시 수동 해결 필요 (자동화 불가)
5. **재시작 불가**: 중간 실패 시 101개 전체를 처음부터 다시 수집
6. **ETF/인덱스 미수집**: SPY, QQQ 같은 벤치마크 ETF가 없음

### 피처 엔지니어링
7. **인트라데이 미사용**: 1h/30m/5m/1m 데이터를 수집하지만 모델에 안 씀
8. **종목 간 관계 없음**: 개별 종목 피처만, 섹터 상대강도/시장 베타 없음
9. **매크로 지연**: FRED 데이터가 실시간이 아닌 지연 발표 (CPI는 월 1회)

### ML 모델
10. **파라미터 고정**: 하이퍼파라미터 튜닝 없이 고정값 사용
11. **2-fold만**: CV fold가 2개뿐이라 앙상블 안정성 낮음
12. **단일 타겟**: 63일 수익률만. 단기(5일, 20일) 예측 불가
13. **단일 모델**: LightGBM만 사용. XGBoost/CatBoost 코드는 있지만 미학습
14. **성능 모니터링 없음**: 예측 vs 실제 비교 추적 시스템 없음
15. **Concept drift 감지 없음**: 모델 성능 저하 자동 감지 불가

### 데이터 품질
16. **기초적 검증만**: NULL 비율, 중복, 가격 이상치만 체크
17. **결측 날짜 미검출**: 거래일인데 데이터가 빠진 경우 감지 안 됨
18. **크로스 검증 없음**: TradingView vs yfinance 데이터 불일치 미검증

---

## 8. 개선 작업 요구사항

### Task 1: 종목 리스트 외부 설정 분리

**목표**: 하드코딩된 종목 리스트를 설정 파일로 분리하여 코드 수정 없이 종목 관리 가능하게 한다.

**수정 대상 파일:**
- `scraper-service/scripts/tradingview_playwright_scraper_upload.py` (라인 91~117)
- `scraper-service/app/services/scraper.py` (라인 66~115)

**구현 방향:**
```yaml
# 새로 만들 파일: scraper-service/config/symbols.yaml
metadata:
  version: "2.0"
  updated: "2026-04-01"
  total_symbols: 101

sectors:
  Technology:
    - { symbol: AAPL, exchange: NASDAQ }
    - { symbol: MSFT, exchange: NASDAQ }
    - { symbol: NVDA, exchange: NASDAQ }
    # ...

  Financials:
    - { symbol: JPM, exchange: NYSE }
    - { symbol: V, exchange: NYSE }
    # ...

  # ETF (새로 추가)
  ETF:
    - { symbol: SPY, exchange: NYSE }
    - { symbol: QQQ, exchange: NASDAQ }
    # ...
```

```python
# 새로 만들 파일: scraper-service/config/symbol_loader.py
import yaml

def load_symbols(config_path="config/symbols.yaml"):
    with open(config_path) as f:
        config = yaml.safe_load(f)

    stock_list = []
    nyse_symbols = set()
    sector_map = {}

    for sector, symbols in config["sectors"].items():
        for item in symbols:
            stock_list.append(item["symbol"])
            if item["exchange"] == "NYSE":
                nyse_symbols.add(item["symbol"])
            sector_map[item["symbol"]] = sector

    return stock_list, nyse_symbols, sector_map
```

**기존 코드 변경:**
```python
# Before (두 파일 모두)
STOCK_LIST = ["AAPL", "MSFT", ...]
NYSE_SYMBOLS = {"BRK.B", "JPM", ...}

# After
from config.symbol_loader import load_symbols
STOCK_LIST, NYSE_SYMBOLS, SECTOR_MAP = load_symbols()
```

---

### Task 2: 종목 확대 (101개 → 200~300개)

**추가 후보:**

| 카테고리 | 추가 종목 예시 | 수량 |
|----------|---------------|------|
| S&P 500 추가 | AIG, BIIB, CDNS, CME, DXCM, ENPH, FSLR, GRMN... | ~100개 |
| 섹터 ETF | SPY, QQQ, IWM, XLK, XLF, XLV, XLE, XLI, XLP, XLU, XLB | 11개 |
| 매크로 프록시 | GLD(금), TLT(채권), USO(원유), UUP(달러), VXX(변동성) | 5개 |
| 벤치마크 | DIA(다우), MDY(미드캡), IJR(스몰캡) | 3개 |

**주의사항:**
- 현재 101개에 약 2시간 소요 → 300개면 약 6시간
- 배치 처리 옵션 필요: `--batch-size 50 --batch-delay 60`
- Rate limiting: 종목 간 딜레이(`asyncio.sleep(2)`)를 설정 파일로 조정 가능하게

---

### Task 3: 체크포인트/재개 기능

**현재 문제**: 50번째 종목에서 실패하면 1번부터 다시 시작

**구현 방향:**
```python
# process_all_stocks() 수정
CHECKPOINT_FILE = "logs/scrape_checkpoint.json"

async def process_all_stocks(self, stock_list=None, resume=True):
    completed = set()
    if resume and Path(CHECKPOINT_FILE).exists():
        checkpoint = json.load(open(CHECKPOINT_FILE))
        completed = set(checkpoint.get("completed_symbols", []))
        logger.info(f"Resuming: {len(completed)} already done")

    for symbol in stock_list:
        if symbol in completed:
            logger.info(f"Skipping {symbol} (already completed)")
            continue

        try:
            await self.process_single_stock(symbol)
            completed.add(symbol)
            # 체크포인트 저장
            json.dump({
                "completed_symbols": list(completed),
                "last_completed": symbol,
                "timestamp": datetime.now().isoformat()
            }, open(CHECKPOINT_FILE, "w"))
        except Exception as e:
            logger.error(f"Failed: {symbol}: {e}")
            # 실패해도 계속 진행

# 실패 종목만 재수집
async def retry_failed(self):
    checkpoint = json.load(open(CHECKPOINT_FILE))
    all_symbols = set(STOCK_LIST)
    completed = set(checkpoint["completed_symbols"])
    failed = all_symbols - completed
    await self.process_all_stocks(list(failed), resume=False)
```

---

### Task 4: 인트라데이 피처 활용

**현재**: Daily(D) 피처 97개만 사용. 1h/30m/5m 데이터 미사용.

**추가 피처 후보 (Daily에 병합):**

```python
# 1h 데이터에서 계산하여 Daily에 병합
NEW_INTRADAY_FEATURES = [
    "intraday_range",       # 일중 (max(high) - min(low)) / close
    "closing_strength",     # (close - low) / (high - low), 0=저점 마감, 1=고점 마감
    "morning_volume_ratio", # 전반 거래량 / 총 거래량 (기관 매매 프록시)
    "intraday_volatility",  # 1h 수익률의 표준편차
    "gap_size",             # 시가 - 전일 종가 (갭 크기)
    "gap_fill_ratio",       # 갭이 장중에 얼마나 채워졌는지
]
```

**구현 위치:**
- `scraper-service/scripts/process_features.py`에서 1h 데이터 로드 → 일별 집계
- `ml-service/ml/features/ahnlab/constants.py`에 새 피처 추가
- `ml-service/ml/models/ahnlab_lgbm.py`는 ALL_FEATURE_COLS를 자동으로 읽으므로 수정 불필요

---

### Task 5: 종목 간 상관관계 피처

```python
NEW_CROSS_SECTIONAL_FEATURES = [
    "sector_relative_return_20d",  # 종목 20일 수익률 - 섹터 평균
    "market_beta_90d",             # SPY 대비 90일 롤링 베타
    "sector_momentum_rank",        # 섹터 내 모멘텀 순위
    "correlation_to_spy_60d",      # SPY와의 60일 상관계수
]
```

**전제 조건**: SPY 데이터 수집 필요 (Task 2의 ETF 추가)

---

### Task 6: 하이퍼파라미터 최적화

```python
# 현재: 고정값
# 개선: Optuna 자동 탐색

import optuna

def objective(trial):
    params = {
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
        "num_leaves": trial.suggest_int("num_leaves", 20, 80),
        "min_child_samples": trial.suggest_int("min_child_samples", 20, 100),
        "subsample": trial.suggest_float("subsample", 0.5, 0.9),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.4, 0.8),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.01, 2.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 0.01, 2.0),
    }
    # 2-fold CV로 NDCG 평가
    ndcg = train_and_evaluate(params)
    return ndcg

study = optuna.create_study(direction="maximize")
study.optimize(objective, n_trials=100)
```

**구현 위치:** `ml-service/scripts/` 에 `tune_ahnlab.py` 새 파일 생성

---

### Task 7: 앙상블 고도화

**방향 1: Fold 수 확대 (2 → 5)**
```python
# 현재: 2-fold
folds = [
    {"valid": "2023"},  # fold 0
    {"valid": "2025"},  # fold 1
]

# 개선: 5-fold
folds = [
    {"valid": "2021"},
    {"valid": "2022"},
    {"valid": "2023"},
    {"valid": "2024"},
    {"valid": "2025"},
]
# 최종 예측 = 5개 fold 모델의 가중 평균
```

**방향 2: 다중 모델 스태킹**
```python
# factory.py에 이미 등록된 모델 활용
models_to_ensemble = ["ahnlab_lgbm", "xgboost", "catboost"]

# 각 모델 학습 → 예측 점수를 평균 또는 rank averaging
final_score = (lgbm_rank + xgb_rank + catboost_rank) / 3
```

---

### Task 8: 데이터 품질 강화

```python
# validate_data.py에 추가할 검증 항목

# 1. 결측 거래일 검출
def check_missing_trading_days(table_name):
    """미국 증시 거래일인데 데이터가 없는 날 찾기"""
    # NYSE 거래일 캘린더와 비교

# 2. TradingView vs yfinance 크로스 검증
def cross_validate_source(symbol):
    """두 소스의 종가 차이가 1% 이상이면 경고"""
    tv_close = query_tradingview(symbol, date)
    yf_close = yfinance.download(symbol)["Close"]
    diff = abs(tv_close - yf_close) / tv_close
    if diff > 0.01:
        alert(f"{symbol}: {diff:.2%} discrepancy")

# 3. 시계열 연속성 검증
def check_time_continuity(table_name):
    """비정상적인 갭 (3일 이상 연속 빈 날) 감지"""
```

---

## 9. 프로젝트 디렉토리 구조 (상세)

```
etf-trading-project/
│
├── docker-compose.yml              # 서비스 정의 (ml-service, scraper, web-dashboard)
├── start.sh / stop.sh / status.sh  # 서비스 관리 스크립트
├── CLAUDE.md                       # 프로젝트 종합 가이드
│
├── scraper-service/                ★ 데이터 수집 (주 작업 영역 1)
│   ├── app/
│   │   ├── main.py                 # FastAPI 진입점 (:8001)
│   │   ├── config.py               # 설정 (DB URL, 로그 경로 등)
│   │   ├── models/
│   │   │   └── task_info.py        # 스크래핑 작업 상태 모델
│   │   ├── routers/
│   │   │   ├── health.py           # /health 엔드포인트
│   │   │   └── jobs.py             # /api/scrape 엔드포인트
│   │   └── services/
│   │       ├── scraper.py          # ★ Docker API 스크래퍼 (종목 리스트, 스크래핑 로직)
│   │       ├── db_service.py       # ★ DB 업로드 (테이블 생성, UPSERT, CSV 파싱)
│   │       ├── yfinance_service.py # 배당금/분할 데이터 (yfinance)
│   │       └── processed_db_service.py  # ★ Processed DB 업로드
│   ├── scripts/
│   │   ├── tradingview_playwright_scraper_upload.py  # ★ 레거시 호스트 스크래퍼
│   │   ├── db_service_host.py      # SSH 터널 버전 DB 서비스
│   │   └── process_features.py     # ★ 피처 계산 파이프라인
│   ├── sql/
│   │   └── create_scraping_logs_table.sql  # 로그 테이블 스키마
│   ├── downloads/                  # CSV 다운로드 임시 저장
│   ├── logs/                       # 스크래핑 로그 + task_info.json
│   ├── cookies.json                # TradingView 세션 쿠키
│   ├── .env.example                # 환경 변수 템플릿
│   └── pyproject.toml              # Python 의존성
│
├── ml-service/                     ★ ML 모델 (주 작업 영역 2)
│   ├── app/
│   │   ├── main.py                 # FastAPI 진입점 (:8000)
│   │   ├── database.py             # ★ 3개 DB 연결 설정
│   │   ├── models.py               # ★ ORM 모델 (Prediction, ETFSnapshot 등)
│   │   ├── routers/
│   │   │   ├── predictions.py      # ★ 예측 API (/ranking, /batch, /{symbol})
│   │   │   └── stocks.py           # 종목 조회 API
│   │   └── services/
│   │       ├── prediction_service.py  # ★ 예측 비즈니스 로직
│   │       └── data_service.py     # 데이터 로드 서비스
│   ├── ml/
│   │   ├── models/
│   │   │   ├── ahnlab_lgbm.py      # ★ 주력 모델 (AhnLab LambdaRank, 717줄)
│   │   │   ├── factory.py          # ★ 모델 팩토리 (13개 모델 등록)
│   │   │   ├── base.py             # 모델 베이스 클래스
│   │   │   ├── xgb_ranking.py      # XGBoost 랭킹 모델
│   │   │   ├── catboost_ranking.py # CatBoost 랭킹 모델
│   │   │   └── ensemble.py         # 앙상블 모델
│   │   └── features/
│   │       └── ahnlab/
│   │           └── constants.py    # ★ 97개 피처 정의 + 하이퍼파라미터
│   ├── scripts/
│   │   └── train_ahnlab.py         # ★ 학습 스크립트 (420줄)
│   ├── data/
│   │   ├── predictions.db          # SQLite (예측 결과)
│   │   └── models/
│   │       └── ahnlab_lgbm/
│   │           └── current/        # 현재 활성 모델 (심링크)
│   │               ├── ahnlab_lgbm_fold0.txt
│   │               ├── ahnlab_lgbm_fold1.txt
│   │               └── metadata.json
│   └── pyproject.toml              # Python 의존성
│
├── web-dashboard/                  # Next.js 웹 대시보드
│   ├── app/
│   │   ├── page.tsx                # 메인 대시보드
│   │   ├── predictions/page.tsx    # 예측 결과 (API 연동)
│   │   ├── portfolio/page.tsx      # 포트폴리오
│   │   └── returns/page.tsx        # 수익률 분석
│   └── lib/
│       ├── api.ts                  # FastAPI 연동 함수
│       └── data.ts                 # 더미 데이터
│
├── auto-monitoring/                # 스크래핑 모니터링 대시보드
│
├── scripts/                        # 자동화 스크립트
│   ├── predict-daily.sh            # 일일 예측 (cron)
│   ├── train-monthly.sh            # 월간 학습 (cron)
│   ├── setup-cron.sh               # cron 설정
│   └── validate_data.py            # 데이터 품질 검증
│
└── logs/                           # 실행 로그
    ├── predict-YYYYMMDD.log
    ├── train-YYYYMM.log
    └── validation_YYYYMMDD.json
```

---

## 10. 작업 우선순위

| 순서 | 태스크 | 난이도 | 임팩트 | 예상 작업량 |
|------|--------|--------|--------|------------|
| **1** | 종목 리스트 외부 설정 분리 (Task 1) | 낮음 | 높음 | 2~3시간 |
| **2** | 체크포인트/재개 기능 (Task 3) | 중간 | 높음 | 4~6시간 |
| **3** | 종목 확대 200~300개 (Task 2) | 낮음 | 높음 | 2~4시간 (리서치 포함) |
| **4** | 하이퍼파라미터 최적화 (Task 6) | 중간 | 중간 | 6~8시간 |
| **5** | 인트라데이 피처 활용 (Task 4) | 중간 | 중간 | 8~12시간 |
| **6** | 앙상블 고도화 (Task 7) | 중간 | 중간 | 8~12시간 |
| **7** | 데이터 품질 강화 (Task 8) | 중간 | 중간 | 4~6시간 |
| **8** | 종목간 상관관계 피처 (Task 5) | 높음 | 중간 | 12~16시간 |

**추천 진행 순서**: Task 1 → 2 → 3 (데이터 인프라 먼저) → Task 6 → 7 (모델 개선) → Task 4 → 5 → 8 (피처 확장)

---

## 11. 절대 금지 사항

- `ml-service/data/models/` 하위 학습된 모델 파일(.txt, .json) **삭제 금지**
- `cookies.json`, `.env` 파일 **삭제 금지**
- DB 테이블 `DROP TABLE`, `TRUNCATE`, `DELETE FROM` (WHERE 없이) **실행 금지**
- 프로덕션 Docker 컨테이너 `docker-compose down`, `docker stop` **사용자 확인 없이 실행 금지**
- SSH 터널 `pkill -f "ssh.*3306"` **사용자 확인 없이 실행 금지**
- `git push --force` **절대 금지**, 항상 feature 브랜치에서 작업
- `main` 브랜치에 직접 커밋 **금지**
- API 키/비밀번호를 코드, 커밋 메시지, 로그에 평문으로 **포함 금지**

---

*이 프롬프트는 프로젝트 현재 상태(2026-04-01) 기준으로 작성되었습니다.*
*프로젝트 Git 리포지토리의 CLAUDE.md에도 추가 컨텍스트가 있으니 참고하세요.*
