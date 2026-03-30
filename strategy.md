# ETF 자동매매 전략 및 파이프라인 가이드

## 현재 상태 요약

| 구성 요소 | 상태 | 설명 |
|-----------|------|------|
| 데이터 스크래핑 | ✅ 완료 | TradingView → etf2_db (Docker API) |
| 피처 처리 | ✅ 완료 | etf2_db → etf2_db_processed (85개 피처) |
| 분류 모델 | ✅ 완료 | LightGBM LambdaRank (종목 랭킹) |
| 회귀 모델 | ⚠️ 인프라 완료 | 63일 뒤 가격 예측 (학습만 하면 됨) |
| 자동 매매 | ⚠️ 부분 | trading-service 코드 있음, KIS 인증 필요 |
| 모니터링 대시보드 | ✅ 완료 | trading-monitor (포트 3002) |

---

## 1. 지금 당장 해야 할 순서

### Step 1: SSH 터널 + Docker 서비스 기동
```bash
cd /home/jjh0709/git/etf-trading-project

# SSH 터널 시작 (MySQL 5100포트 → 로컬 3306)
ssh -f -N -L 0.0.0.0:3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr \
    -o ServerAliveInterval=60 -o ServerAliveCountMax=3

# Docker 서비스 전체 시작
docker compose up -d
```

### Step 2: 데이터 스크래핑 실행
```bash
# 스크래핑 시작 (Docker API - 모니터링 연동됨)
curl -X POST http://localhost:8001/api/scrape

# 진행 상황 확인
curl http://localhost:8001/api/jobs/status

# 완료 후 피처 처리
curl -X POST http://localhost:8001/api/features/process

# 피처 처리 상태 확인
curl http://localhost:8001/api/features/status
```

### Step 3: 분류 모델 학습 (최초 1회 또는 월 1회)
```bash
# Docker 컨테이너 안에서 실행
docker exec -it etf-ml-service python scripts/train_ahnlab.py --pred-year 2025

# 또는 직접 실행 (SSH 터널 연결 상태에서)
cd ml-service
python scripts/train_ahnlab.py --pred-year 2025
```

### Step 4: 랭킹 예측 실행
```bash
# 전체 종목 랭킹 예측
curl -X POST http://localhost:8000/api/predictions/ranking

# 결과 조회
curl http://localhost:8000/api/predictions/ranking/latest
```

### Step 5: 회귀 모델 학습 (인프라 완료, 학습만 필요)
```bash
# Docker 컨테이너 안에서 실행
docker exec -it etf-ml-service python scripts/train_regressor.py --pred-year 2025

# 또는 직접 실행 (SSH 터널 연결 상태에서)
cd ml-service
python scripts/train_regressor.py --pred-year 2025

# 학습 완료 후 가격 예측 API
curl http://localhost:8000/api/predictions/forecast/AAPL/price
```

### Step 6: 자동 스케줄링 (run.py)
```bash
python run.py --mode paper    # 모의투자
python run.py --mode live     # 실투자 (KIS 인증 필요)
```

---

## 2. 전체 파이프라인 흐름

```
[TradingView] → scraper-service → [etf2_db] → features → [etf2_db_processed]
                                                              ↓
                                                    ┌─── 분류 모델 (LambdaRank)
                                                    │       → 종목 랭킹 (Top 100)
                                                    │
                                                    └─── 회귀 모델 (미구현)
                                                            → 63일 뒤 가격 예측
                                                              ↓
                                                    trading-service → KIS API → 매매 실행
                                                              ↓
                                                    trading-monitor → 시각화/모니터링
```

---

## 3. 모델 정의

### 3-1. 분류 모델 (AhnLab LightGBM LambdaRank) ✅

| 항목 | 값 |
|------|-----|
| **목적** | 63일(3개월) 뒤 가장 많이 오를 종목 100개 랭킹 |
| **알고리즘** | LightGBM LambdaRank (NDCG 최적화) |
| **피처 수** | 85개 (기술지표 + 거시경제 + 엔지니어링 + Z-score + Rank) |
| **타겟** | `relevance` (3개월 수익률 → 50분위 quantile bin) |
| **학습 방식** | 2-fold Rolling CV 앙상블 |
| **입력 DB** | `etf2_db_processed` |
| **출력 형식** | JSON (symbol, rank, score, direction, weight) |

**모델 파일 구조:**
```
ml-service/data/models/ahnlab_lgbm/
└── current/                          ← symlink to version directory
    ├── ahnlab_lgbm_fold0.txt         ← LightGBM Booster 모델 (텍스트)
    ├── ahnlab_lgbm_fold1.txt         ← LightGBM Booster 모델 (텍스트)
    └── metadata.json                 ← 버전, 학습일, 피처 수 등
```

**metadata.json 형식:**
```json
{
  "model_name": "ahnlab_lgbm",
  "version": "v2025_fold2",
  "created_at": "2025-03-12T...",
  "pred_year": 2025,
  "n_folds": 2,
  "n_features": 85,
  "feature_names": ["open", "high", "low", "close", ...],
  "training_metrics": {
    "fold_0_ndcg@10": 0.85,
    "fold_1_ndcg@10": 0.83
  }
}
```

**API 호출:**
```bash
# 랭킹 예측 (메인 엔드포인트)
POST http://localhost:8000/api/predictions/ranking
Content-Type: application/json
{ "timeframe": "D" }

# 응답
{
  "prediction_date": "2025-03-12",
  "total_symbols": 60,
  "model_name": "ahnlab_lgbm",
  "rankings": [
    { "symbol": "AAPL", "rank": 1, "score": 0.95, "direction": "BUY", "weight": 1.0 },
    { "symbol": "NVDA", "rank": 2, "score": 0.93, "direction": "BUY", "weight": 0.97 },
    ...
  ]
}
```

**direction 결정 기준:**
- BUY: 상위 20%
- HOLD: 중간 60%
- SELL: 하위 20%

---

### 3-2. 회귀 모델 (XGBoost Regression) ⚠️ 인프라 완료

| 항목 | 값 |
|------|-----|
| **목적** | 63일 뒤 수익률 예측 (단일 종목) |
| **알고리즘** | XGBoost Regression (reg:squarederror) |
| **피처 수** | 85개 (분류 모델과 동일) |
| **타겟** | `target_3m` (63일 forward return) |
| **학습 방식** | 2-fold Rolling CV 앙상블 |
| **입력 DB** | `etf2_db_processed` |
| **출력** | predicted_return, predicted_close |
| **활용** | 분류 모델 Top 100 종목에 대해 목표가 산출 |

**구현 파일 (✅ 완료):**

```
ml-service/
├── scripts/
│   └── train_regressor.py          ← 학습 스크립트 ✅
├── app/services/
│   ├── model_loader.py             ← XGBRegressorEnsemble 추가 ✅
│   └── prediction_service.py       ← predict_forecast() 추가 ✅
├── app/routers/
│   └── predictions.py              ← /forecast/{symbol}/price 엔드포인트 ✅
└── data/models/
    └── price_regressor/current/    ← 모델 학습 후 자동 생성
        ├── price_regressor_fold0.json  ← XGBoost Booster (JSON)
        ├── price_regressor_fold1.json  ← XGBoost Booster (JSON)
        └── metadata.json
```

**학습 명령어:**
```bash
python scripts/train_regressor.py --pred-year 2025
```

**metadata.json 형식:**
```json
{
  "model_name": "price_regressor",
  "version": "v20250312",
  "trained_at": "2025-03-12T...",
  "model_type": "xgboost_regressor",
  "target": "target_3m",
  "target_description": "63-day forward return",
  "n_features": 85,
  "n_folds": 2,
  "xgb_params": {
    "objective": "reg:squarederror",
    "max_depth": 8,
    "learning_rate": 0.01
  },
  "training_period": {
    "start": "2020-01-01",
    "end": "2025-01-01"
  }
}
```

**API 엔드포인트 (✅ 구현 완료):**
```bash
# 63일 가격 예측 (회귀 모델)
GET http://localhost:8000/api/predictions/forecast/AAPL/price

# 응답 형식
{
  "symbol": "AAPL",
  "current_close": 175.50,
  "predicted_return": 0.15,
  "predicted_close": 201.83,
  "forecast_days": 63,
  "model_name": "price_regressor",
  "model_version": "v20250312",
  "generated_at": "2025-03-12T..."
}

# 캔들스틱 예측 (더미 데이터, 회귀 모델 있으면 drift 반영)
GET http://localhost:8000/api/predictions/forecast/AAPL?days=90
```

**타겟 (target_3m):**
- `etf2_db_processed` 테이블에 이미 존재하는 `target_3m` 컬럼 사용
- 63일 forward return (수익률)

---

## 4. 피처 컬럼 정의 (85개)

### 4-1. 기본 피처 (45개) — `BASE_FEATURE_COLS`

| 카테고리 | 컬럼명 | 설명 |
|----------|--------|------|
| **가격** | `open, high, low, close, volume` | OHLCV |
| **배당** | `dividends, stock_splits` | 배당금, 액면분할 |
| **수익률** | `ret_1d, ret_5d, ret_20d, ret_63d` | N일 로그 수익률 |
| **MACD** | `macd, macd_signal, macd_hist` | MACD 지표 |
| **RSI** | `rsi_14, rsi_28` | 상대강도지수 |
| **Bollinger** | `bb_upper, bb_middle, bb_lower, bb_width, bb_position` | 볼린저 밴드 |
| **변동성** | `atr_14` | Average True Range |
| **거래량** | `obv, volume_sma_20, volume_ratio` | OBV, 이동평균 |
| **EMA** | `ema_10, ema_20, ema_50, ema_200` | 지수이동평균 |
| **SMA** | `sma_10, sma_20, sma_50` | 단순이동평균 |
| **기타 지표** | `stoch_k, stoch_d, adx, cci, willr, mfi, vwap` | 보조지표 |
| **거시경제** | `vix, fed_funds_rate, unemployment_rate, cpi` | 거시경제 |
| **금리** | `treasury_10y, treasury_2y, yield_curve` | 국채 금리 |
| **원자재** | `oil_price, usd_eur, high_yield_spread` | 유가, 환율 |

### 4-2. 엔지니어링 피처 (23개) — `ENGINEERED_FEATURE_COLS`

| 컬럼명 | 설명 |
|--------|------|
| `ret_10d, ret_30d` | 추가 수익률 윈도우 |
| `vol_20d, vol_63d` | 20일/63일 변동성 |
| `price_to_sma_50, price_to_ema_200` | 이동평균 대비 가격 비율 |
| `volume_trend` | 거래량 추세 |
| `close_to_high_52w` | 52주 고점 대비 |
| `ret_5d_20d_ratio` | 단기/중기 수익률 비율 |
| `momentum_strength` | 모멘텀 강도 |
| `volume_surge` | 거래량 급증 |
| `ret_vol_ratio_20d, ret_vol_ratio_63d` | 수익률/변동성 비율 |
| `trend_acceleration` | 추세 가속도 |
| `close_to_high_20d, close_to_high_63d, close_to_high_126d` | N일 고점 대비 |
| `ema_5, ema_100` | 추가 EMA |
| `price_to_ema_10, price_to_ema_50` | EMA 대비 가격 |
| `ema_cross_short, ema_cross_long` | EMA 크로스 |
| `ema_slope_20` | EMA 기울기 |

### 4-3. Z-Score 피처 (7개) — `ZS_FEATURE_COLS`

`vol_63d_zs, volume_sma_20_zs, obv_zs, vwap_zs, ema_200_zs, price_to_ema_200_zs, close_to_high_52w_zs`

### 4-4. Rank 피처 (5개) — `RANK_FEATURE_COLS`

`ret_20d_rank, ret_63d_rank, vol_20d_rank, momentum_strength_rank, volume_surge_rank`

---

## 5. 데이터베이스 구조

### etf2_db (원시 데이터)
```
호스트: ahnbi2.suwon.ac.kr:5100 (SSH 터널 → localhost:3306)
인증: ahnbi2:bigdata
테이블: ~500개 (SYMBOL_TIMEFRAME 패턴)
  - 예: AAPL_D, NVDA_1h, 069500_D
컬럼: symbol, timeframe, time, open, high, low, close, volume
```

### etf2_db_processed (피처 데이터)
```
호스트: 동일 (ahnbi2.suwon.ac.kr:5100)
인증: 동일
테이블: SYMBOL_D 패턴 (일봉만)
  - 예: AAPL_D, NVDA_D, 069500_D
컬럼: time + 85개 피처 컬럼 + target_3m, target_6m, target_12m
```

### predictions.db (SQLite, 로컬)
```
경로: ml-service/data/predictions.db
테이블: predictions, etf_monthly_snapshot, etf_composition
용도: 예측 결과 저장 및 이력 관리
```

### trading.db (SQLite, 로컬)
```
경로: trading-service/data/trading.db
용도: 매매 기록, 포트폴리오 상태
```

---

## 6. 서비스 포트 및 API

| 서비스 | 포트 | 역할 | 헬스체크 |
|--------|------|------|----------|
| ml-service | 8000 | 모델 로딩, 예측, 데이터 조회 | `GET /health` |
| scraper-service | 8001 | 스크래핑, 피처 처리 | `GET /health` |
| trading-service | 8002 | 자동매매 (KIS API) | `GET /health` |
| trading-monitor | 3002 | BFF + 대시보드 | `GET /api/health` |
| nginx | 80 | 리버스 프록시 | — |

### ml-service API (핵심)

```bash
# 데이터 조회
GET  /api/data/{symbol}?timeframe=D&limit=100

# 분류 모델 예측 (랭킹)
POST /api/predictions/ranking
GET  /api/predictions/ranking/latest

# 회귀 모델 예측 (가격) — 구현 필요
GET  /api/predictions/forecast/{symbol}?days=63

# 모델 관리
GET  /api/models
GET  /api/models/current
POST /api/models/{model_name}/load
```

### scraper-service API

```bash
# 스크래핑
POST /api/scrape              # 시작
GET  /api/jobs/status          # 진행 상태
POST /api/jobs/retry           # 실패 심볼 재시도

# 피처 처리
POST /api/features/process     # 시작
GET  /api/features/status      # 진행 상태
```

---

## 7. 자동화 스케줄 (run.py)

```
┌──────────────────────────────────────────────────────────────┐
│  매일 (월~금)                                                 │
│                                                              │
│  06:00 KST: scraper-service → 스크래핑 시작                   │
│            → 피처 처리 (etf2_db → etf2_db_processed)          │
│            → ml-service → 랭킹 예측                          │
│            → (회귀 모델 → 가격 예측) ← 구현 필요              │
│                                                              │
│  08:30 KST: trading-service → 자동매매 실행 (KIS API)         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  매월 1일                                                     │
│                                                              │
│  03:00 KST: 분류 모델 재학습 (train_ahnlab.py)                │
│            → (회귀 모델 재학습) ← 구현 필요                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. 회귀 모델 구현 로드맵

### Phase 1: 데이터 준비
1. `etf2_db_processed`에서 각 종목의 `close`를 63일 shift해서 타겟 생성
2. 학습/검증 분할 (시계열 분할: 학습 2020~2024, 검증 2024~2025)

### Phase 2: 모델 학습
1. `ml-service/scripts/train_regressor.py` 작성
2. XGBoost Regression으로 학습 (동일 85개 피처)
3. 모델 파일 저장: `ml-service/data/models/price_regressor/current/`

### Phase 3: API 구현
1. `ml-service/app/routers/predictions.py`에 forecast 엔드포인트 추가
2. 입력: symbol, days(=63)
3. 출력: predicted_price, predicted_return, confidence

### Phase 4: trading-monitor 연동
1. BFF 프록시 이미 존재: `app/api/predictions/forecast/[symbol]/route.ts`
2. 더미 데이터 대신 실제 ml-service 응답 사용
3. 차트 예측 오버레이가 실제 가격으로 교체됨

---

## 9. 통합 전략: 분류 + 회귀

```
분류 모델 (LambdaRank)
  ↓
Top 100 종목 선정 (direction=BUY, rank 1~100)
  ↓
회귀 모델 (XGBoost Regression)
  ↓
각 종목의 63일 후 목표가 산출
  ↓
목표 수익률 = (predicted_price - current_price) / current_price
  ↓
최종 포트폴리오 구성:
  - 목표 수익률 상위 N개 종목 선택
  - weight = rank 기반 + 수익률 기반 가중치
  - 매수 실행 (trading-service → KIS API)
```

---

## 10. 환경 파일

### .env (프로젝트 루트)
```env
# MySQL
REMOTE_DB_URL=mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_db
PROCESSED_DB_URL=mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_db_processed

# TradingView (scraper용)
TRADINGVIEW_USERNAME=your_username
TRADINGVIEW_PASSWORD=your_password

# KIS API (trading-service용)
KIS_APP_KEY=your_app_key
KIS_APP_SECRET=your_app_secret
KIS_ACCOUNT_NO=your_account_no
KIS_ACCOUNT_PRODUCT_CODE=01
```

---

## 11. 트러블슈팅

| 문제 | 해결 |
|------|------|
| SSH 터널 끊김 | `pgrep -f "ssh.*3306"` 확인 → `scripts/start-tunnel.sh` |
| Docker 서비스 안 뜸 | `docker compose up -d` → `docker compose logs -f` |
| 모델 파일 없음 | `python scripts/train_ahnlab.py` 실행 |
| 스크래핑 실패 | `curl -X POST http://localhost:8001/api/jobs/retry` |
| 피처 처리 실패 | `curl -X POST http://localhost:8001/api/features/process` |
| trading-monitor 더미 데이터 | 백엔드 서비스 기동 확인 → `curl http://localhost:8000/health` |
