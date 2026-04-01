# AI ETF 자동매매 시스템 — 프로젝트 종합 가이드

작성일: 2026-04-01
작성자: 주진호 (PM)
대상: 전체 팀원 (특히 양진우 - DevOps)

---

## 1. 프로젝트 파일 구조

```
etf-trading-project/
│
├── docker-compose.yml          # Docker 서비스 정의 (7개 컨테이너)
├── run.py                      # Python 자동화 오케스트레이터 (APScheduler)
├── start.sh                    # 서비스 시작 (SSH 터널 + Docker)
├── stop.sh                     # 서비스 중지
├── status.sh                   # 전체 상태 확인
│
├── ml-service/                 # [포트 8000] ML 예측 서비스 (FastAPI)
│   ├── Dockerfile.serving
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py             # FastAPI 진입점
│   │   ├── database.py         # DB 연결 (SQLite + MySQL)
│   │   ├── routers/
│   │   │   └── predictions.py  # 예측 API (/api/predictions/ranking)
│   │   └── services/
│   │       ├── ml_model.py     # SimplePredictor (MVP)
│   │       ├── model_loader.py # 모델 로더 (LightGBM, XGBoost)
│   │       └── prediction_service.py  # 예측 비즈니스 로직
│   ├── ml/
│   │   ├── features/pipeline.py       # 피처 엔지니어링 (85개 피처)
│   │   └── models/                    # 모델 아키텍처
│   ├── scripts/
│   │   ├── train_ahnlab.py    # LightGBM LambdaRank 학습 (완료)
│   │   └── train_regressor.py # XGBoost 회귀 학습 (미실행)
│   └── data/
│       ├── predictions.db     # 예측 결과 SQLite
│       └── models/
│           └── ahnlab_lgbm/current/   # 학습된 모델 파일
│               ├── ahnlab_lgbm_fold0.txt
│               ├── ahnlab_lgbm_fold1.txt
│               └── metadata.json
│
├── trading-service/            # [포트 8002] 자동매매 서비스 (FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env                    # KIS API 키 (GitHub에 올리지 않음!)
│   ├── app/
│   │   ├── main.py             # FastAPI + APScheduler (매일 22:30 매매)
│   │   ├── config.py           # 설정 (order_type=limit, 63일 사이클 등)
│   │   ├── database.py         # SQLite 연결 + 마이그레이션
│   │   ├── models.py           # DB 모델 (TradingCycle, DailyPurchase, OrderLog, TradingLog)
│   │   ├── schemas.py          # API 응답 스키마
│   │   ├── routers/
│   │   │   ├── trading.py      # 매매 제어 API (/api/trading/*)
│   │   │   ├── history.py      # 주문 내역 + 로그 API
│   │   │   └── health.py       # 헬스체크
│   │   └── services/
│   │       ├── kis_client.py       # KIS 증권 API 래퍼 (주문, 잔고, 현재가)
│   │       ├── trade_executor.py   # 매매 실행 (FIFO, 지정가, 이월)
│   │       ├── capital_manager.py  # 자금 배분 (70% 전략 + 30% 고정)
│   │       ├── cycle_manager.py    # 63일 사이클 관리
│   │       ├── ranking_client.py   # ML 서비스 랭킹 조회
│   │       └── holiday_calendar.py # NYSE 휴장일 체크
│   └── data/
│       └── trading.db          # 매매 기록 SQLite
│
├── scraper-service/            # [포트 8001] 데이터 수집 서비스 (FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── cookies.json            # TradingView 인증 쿠키
│   ├── app/
│   │   ├── main.py             # FastAPI 진입점
│   │   ├── config.py           # 설정
│   │   ├── routers/
│   │   │   ├── jobs.py         # 스크래핑 작업 API (/api/scraper/jobs/*)
│   │   │   └── features.py    # 피처 처리 API (/api/scraper/features/*)
│   │   ├── services/
│   │   │   ├── scraper.py      # TradingView Playwright 스크래퍼 (핵심)
│   │   │   ├── db_service.py   # MySQL 업로드
│   │   │   └── db_log_handler.py  # DB 로그 핸들러
│   │   └── models/
│   │       └── task_info.py    # 작업 상태 관리 (task_info.json)
│   ├── downloads/              # 다운로드된 CSV 파일
│   └── logs/                   # 스크래핑 로그
│
├── web-dashboard/              # [포트 3000] 투자자용 웹사이트 (Next.js)
│   ├── Dockerfile
│   ├── app/
│   │   └── (dashboard)/
│   │       ├── dashboard/page.tsx    # 메인 대시보드
│   │       ├── predictions/page.tsx  # 예측 결과 (실시간 API)
│   │       ├── portfolio/page.tsx    # 포트폴리오 (실데이터)
│   │       ├── returns/page.tsx      # 수익률 분석 (실데이터)
│   │       ├── factsheet/page.tsx    # 팩트시트
│   │       └── trading/page.tsx      # 매매 현황
│   └── lib/
│       ├── api.ts              # ML 서비스 API 연동
│       └── trading-api.ts      # Trading 서비스 API 연동
│
├── trading-monitor/            # [포트 3002] 매매 모니터링 대시보드 (Next.js)
│   ├── Dockerfile
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx            # 메인 대시보드
│   │   │   ├── scraping/page.tsx   # 데이터 수집 현황
│   │   │   ├── preprocessing/     # 피처 처리 현황
│   │   │   ├── model/page.tsx     # ML 모니터링
│   │   │   ├── pipeline/page.tsx  # 파이프라인 상태
│   │   │   ├── portfolio/page.tsx # 포트폴리오
│   │   │   ├── order-logs/page.tsx # KIS 주문 로그 + 실시간 터미널
│   │   │   ├── calendar/page.tsx  # 매매 달력
│   │   │   ├── db-viewer/page.tsx # DB 뷰어
│   │   │   └── settings/page.tsx  # 설정
│   │   └── api/trading/           # BFF API 라우트
│   ├── components/
│   │   ├── dashboard/             # 대시보드 위젯
│   │   └── layout/                # 사이드바, 헤더
│   └── lib/
│       ├── constants.ts           # API 엔드포인트, 갱신 주기
│       └── types.ts               # 타입 정의
│
├── auto-monitoring/            # 스크래핑 진행 모니터링 (Next.js)
│   ├── Dockerfile
│   └── app/                    # 실시간 스크래핑 상태 표시
│
├── nginx/                      # 리버스 프록시
│   └── nginx.conf              # URL 라우팅 규칙
│
├── scripts/                    # 자동화 스크립트
│   ├── run-pipeline.sh         # 전체 파이프라인 실행 (핵심, ~950줄)
│   ├── setup-cron.sh           # cron 작업 설정
│   ├── check-services.sh       # 서비스 헬스체크
│   ├── execute-trading.sh      # 수동 매매 실행
│   ├── start-tunnel.sh         # SSH 터널 시작
│   ├── train-monthly.sh        # 월간 모델 재학습
│   ├── train-yearly.sh         # 연간 모델 재학습
│   └── update-returns.sh       # 수익률 업데이트
│
├── etf-model/                  # ML 모델 연구/실험 (아카이브)
│   └── submissions/            # 제출 CSV 파일
│
├── docx/                       # 문서
│   ├── Goal.md                 # 최종 목표 (6대 기능)
│   └── rule/                   # 팀원별 역할 정의
│       ├── pm_leader.md
│       ├── choi_inhoon_regression.md
│       ├── lim_daeyoon_scenario.md
│       ├── park_sungmoon_scraper.md
│       └── yang_jinwoo_community.md
│
├── CLAUDE.md                   # AI 어시스턴트 프로젝트 가이드
├── 문제점.md                    # 현재 알려진 이슈 목록
├── strategy.md                 # 기술 전략 문서
└── PROGRESS.md                 # 진행 상황
```

---

## 2. Docker 서비스 구조

### 2-1. 컨테이너 목록

```
┌─────────────────────────────────────────────────────────┐
│                    nginx (포트 80)                        │
│              모든 외부 요청의 진입점                       │
├──────────┬──────────┬──────────┬─────────────────────────┤
│          │          │          │                         │
│  web-     trading-  auto-     scraper-                  │
│  dashboard monitor  monitoring service                  │
│  (3000)   (3002)    (3000)    (8001)                    │
│          │                    │                         │
│      trading-service      ml-service                    │
│      (8002)               (8000)                        │
│          │                    │                         │
│      trading.db           predictions.db                │
│      (SQLite)             (SQLite)                      │
│                               │                         │
│                        MySQL etf2_db                    │
│                      (원격 포트 5100)                    │
└─────────────────────────────────────────────────────────┘
```

### 2-2. Nginx 라우팅

```
외부 URL                          →  내부 서비스
─────────────────────────────────────────────────
ahnbi2.suwon.ac.kr/               →  web-dashboard (3000)
ahnbi2.suwon.ac.kr/trading/       →  trading-monitor (3002)
ahnbi2.suwon.ac.kr/monitor/       →  auto-monitoring (3000)
ahnbi2.suwon.ac.kr/api/           →  ml-service (8000)
ahnbi2.suwon.ac.kr/api/scraper/   →  scraper-service (8001)
```

### 2-3. Docker 네트워크

모든 컨테이너는 `etf-trading-project_etf-network` (bridge) 네트워크에 연결.
컨테이너 간 통신은 컨테이너 이름으로:
```
http://etf-ml-service:8000
http://etf-trading-service:8002
http://etf-scraper-service:8001
```

---

## 3. 데이터베이스 구조

### 3-1. MySQL (원격 서버)

```
접속: host.docker.internal:3306 (Docker에서)
      → SSH 터널 → 원격 서버 포트 5100

[etf2_db] — 원본 주가 데이터 (~600개 테이블)
├── AAPL_D       (일봉)
├── AAPL_30m     (30분봉)
├── AAPL_5m      (5분봉)
├── AAPL_1m      (1분봉)
├── NVDA_D, NVDA_30m, ...
└── ... (101종목 × 4타임프레임)

컬럼: time, symbol, timeframe, open, high, low, close, volume, rsi, macd

[etf2_db_processed] — 피처 가공 데이터
└── 85개 피처 (기술지표 + 거시경제 + Z-score + 랭크)
```

### 3-2. SQLite (로컬)

```
[ml-service/data/predictions.db]
└── 예측 결과 저장

[trading-service/data/trading.db]
├── trading_cycles      # 63일 사이클 관리
├── daily_purchases     # FIFO 매수 기록 (매수일, 종목, 가격, 수량, 매도 여부)
├── order_logs          # KIS 주문 로그 (성공/실패/대기/미체결)
├── trading_logs        # 서비스 로그 (웹 모니터링용)
└── daily_snapshots     # 일일 포트폴리오 스냅샷
```

---

## 4. 자동화 파이프라인 — 전체 흐름

### 4-1. 파이프라인 시작 방법 (3가지)

```
방법 1: Python 오케스트레이터 (추천)
$ python run.py --mode paper
→ APScheduler가 매일 06:00에 파이프라인 자동 실행

방법 2: 셸 스크립트 수동 실행
$ ./scripts/run-pipeline.sh
→ 즉시 파이프라인 1회 실행

방법 3: Cron 스케줄링
$ ./scripts/setup-cron.sh
→ 매일 07:00 (평일)에 run-pipeline.sh 자동 실행
```

### 4-2. 파이프라인 실행 순서 (run-pipeline.sh)

```
┌──────────────────────────────────────────────────────────┐
│  STEP 0: 사전 점검                                        │
│  ├─ SSH 터널 확인/시작 (3306 → 원격 5100)                   │
│  ├─ Docker 컨테이너 상태 확인                               │
│  └─ 헬스체크 (30회 재시도, 2초 간격)                         │
│     curl http://localhost:8001/health (스크래퍼)             │
│     curl http://localhost:8000/health (ML)                  │
└──────────────────┬───────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 1: 데이터 스크래핑 (~90분)                            │
│                                                          │
│  API 호출:                                                │
│  POST http://localhost/api/scraper/jobs/full              │
│  → 백그라운드 작업 시작 (job_id 반환)                       │
│                                                          │
│  상태 폴링 (30초 간격, 최대 6시간):                         │
│  GET http://localhost/api/scraper/jobs/status             │
│  → "running" → 계속 대기                                   │
│  → "completed" 또는 "partial" → 다음 단계로                 │
│                                                          │
│  실제 동작:                                                │
│  - Playwright로 TradingView 차트 페이지 접속                │
│  - 101종목 × 4타임프레임 = ~400번 데이터 Export             │
│  - CSV 다운로드 → MySQL etf2_db에 업로드                    │
│  - 테이블: {SYMBOL}_D, {SYMBOL}_30m, {SYMBOL}_5m, {SYMBOL}_1m │
└──────────────────┬───────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 2: 데이터 검증 (현재 스킵)                            │
│  --skip-validation 플래그로 생략                            │
└──────────────────┬───────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 3: 피처 처리 (~40분)                                 │
│                                                          │
│  API 호출:                                                │
│  POST http://localhost/api/scraper/features/process       │
│  Body: {"include_macro": true, "shift_features": true}    │
│  → 백그라운드 작업 시작                                     │
│                                                          │
│  상태 폴링 (30초 간격):                                     │
│  GET http://localhost/api/scraper/features/status          │
│                                                          │
│  실제 동작:                                                │
│  - etf2_db에서 OHLCV 데이터 로드                            │
│  - 85개 피처 계산:                                         │
│    · 기술지표: RSI, MACD, Bollinger, ATR, OBV 등           │
│    · 거시경제: 인플레이션, 금리, VIX (FRED API)             │
│    · 엔지니어링: Z-score, 랭크, 시프트 피처                  │
│  - etf2_db_processed에 저장                                │
└──────────────────┬───────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 4: ML 랭킹 예측 (~1분)                               │
│                                                          │
│  API 호출:                                                │
│  POST http://localhost:8000/api/predictions/ranking        │
│  → 즉시 응답 (동기 처리)                                    │
│                                                          │
│  실제 동작:                                                │
│  - etf2_db_processed에서 최신 피처 로드                     │
│  - LightGBM LambdaRank 모델로 101종목 순위 예측             │
│  - 2-fold 앙상블 (fold0 + fold1 평균)                      │
│  - predictions.db에 결과 저장                               │
│                                                          │
│  응답:                                                    │
│  {                                                       │
│    "rankings": [                                         │
│      {"rank": 1, "symbol": "NVDA", "score": 0.95, "direction": "BUY"},  │
│      {"rank": 2, "symbol": "AAPL", "score": 0.91, ...},  │
│      ...                                                 │
│    ]                                                     │
│  }                                                       │
└──────────────────┬───────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────┐
│  파이프라인 완료                                           │
│  → 로그 저장: logs/pipeline-YYYYMMDD.log                  │
│  → 매매는 별도 스케줄러가 실행 (아래 참조)                    │
└──────────────────────────────────────────────────────────┘
```

### 4-3. 매매 실행 (파이프라인과 별도)

```
매매는 trading-service의 APScheduler가 독립 실행:
설정: trading-service/app/main.py
시간: 매일 22:30 KST (서머타임 시 22:30, 비서머타임 시 23:30)

┌──────────────────────────────────────────────────────────┐
│  자동매매 실행 (execute_daily_trading)                      │
│                                                          │
│  1. NYSE 거래일 확인                                       │
│     → 휴장일이면 스킵                                      │
│                                                          │
│  2. KIS API 잔고 조회                                      │
│     → 매수가능금액, 보유종목 확인                             │
│                                                          │
│  3. 사이클 확인 (63일 FIFO)                                 │
│     → 현재 거래일 번호 계산                                  │
│                                                          │
│  4. ML 랭킹 조회                                           │
│     GET http://ml-service:8000/api/predictions/ranking     │
│     → 상위 100개 종목 + 점수                                │
│                                                          │
│  5. FIFO 매도 (Day >= 64일 때)                              │
│     → 63일 전 매수 종목 전량 매도                             │
│     → KIS API sell_order() 호출                            │
│                                                          │
│  6. 미체결 이월 처리 (지정가 모드)                            │
│     → 전일 PENDING 주문 → UNFILLED로 변경                   │
│     → 미체결 금액을 오늘 예산에 추가                          │
│                                                          │
│  7. 예산 계산                                              │
│     일일 예산 = 초기자금($100,000) / 63 = $1,587            │
│     + 미체결 이월분                                        │
│     ├── 고정 30%: $476 → QQQ (현재 예산 부족으로 스킵)       │
│     └── 전략 70%: $1,111 → ML 랭킹 상위 종목                │
│                                                          │
│  8. 전일 종가 조회 (지정가 모드)                              │
│     → etf2_db에서 {SYMBOL}_D 최신 close 가격 조회           │
│                                                          │
│  9. 고정 ETF 매수 (30%)                                    │
│     → QQQ 지정가 주문 (전일 종가)                            │
│     → 주문 접수 시 PENDING 상태로 기록                       │
│                                                          │
│  10. 전략 매수 (70%)                                       │
│      → 랭킹 상위 종목부터 1주씩 지정가 매수                   │
│      → 예산 소진 시 중단 (보통 7~8건)                        │
│                                                          │
│  11. 매수 기록 저장                                        │
│      → daily_purchases 테이블                              │
│      → order_logs 테이블                                   │
│      → trading_logs 테이블 (웹 모니터링용)                   │
│                                                          │
│  12. 일일 스냅샷 저장                                       │
│      → daily_snapshots 테이블                              │
└──────────────────────────────────────────────────────────┘
```

### 4-4. 일일 타임라인

```
시간 (KST)    이벤트                        서비스              트리거
─────────────────────────────────────────────────────────────────────
06:00 또는    파이프라인 시작                  run.py             APScheduler
07:00         (cron 사용 시 07:00)            run-pipeline.sh    cron

07:00~08:30   스크래핑 진행 (101종목)          scraper-service    API 호출
              └ TradingView → MySQL

08:30~09:10   피처 처리 (85개 피처)            scraper-service    API 호출
              └ etf2_db → etf2_db_processed

09:10~09:11   ML 랭킹 예측                   ml-service         API 호출
              └ 101종목 순위 결정

22:30         자동매매 실행                   trading-service    APScheduler
              └ FIFO 매도 + 지정가 매수
              └ KIS API 주문

매 6시간      헬스체크                        check-services.sh  cron
매주 일요일    수익률 업데이트                  update-returns.sh  cron
매년 1/1      모델 재학습                     train-yearly.sh    cron
```

---

## 5. Cron 설정 상세

```bash
# scripts/setup-cron.sh가 설치하는 4개 작업:

# 1. 매일 파이프라인 (평일 07:00)
0 7 * * 1-5  /path/scripts/run-pipeline.sh --skip-validation

# 2. 헬스체크 (6시간마다)
0 */6 * * *  /path/scripts/check-services.sh

# 3. 수익률 업데이트 (일요일 11:00)
0 11 * * 0   /path/scripts/update-returns.sh

# 4. 연간 재학습 (1월 1일 12:00)
0 12 1 1 *   /path/scripts/train-yearly.sh
```

---

## 6. API 엔드포인트 전체 목록

### ML 서비스 (포트 8000)

```
GET  /health                              # 헬스체크
GET  /api/data/symbols                    # 종목 목록
GET  /api/data/{symbol}                   # OHLCV 데이터
POST /api/predictions/ranking             # ML 랭킹 예측 (핵심)
GET  /api/predictions/ranking/latest      # 최신 랭킹 결과
POST /api/predictions/{symbol}            # 단일 종목 예측
GET  /api/predictions                     # 저장된 예측 조회
```

### 스크래퍼 서비스 (포트 8001)

```
GET  /health                              # 헬스체크
POST /api/scraper/jobs/full               # 전체 스크래핑 시작
GET  /api/scraper/jobs/status             # 스크래핑 상태
POST /api/scraper/jobs/retry              # 실패 종목 재시도
GET  /api/scraper/jobs/logs               # 스크래핑 로그
POST /api/scraper/features/process        # 피처 처리 시작
GET  /api/scraper/features/status         # 피처 처리 상태
```

### 트레이딩 서비스 (포트 8002)

```
GET  /health                              # 헬스체크
GET  /api/trading/status                  # 사이클 상태
GET  /api/trading/portfolio               # 보유 종목
POST /api/trading/execute                 # 수동 매매 실행
GET  /api/trading/balance                 # KIS 잔고
GET  /api/trading/orders                  # 주문 로그
GET  /api/trading/history                 # 거래 내역
GET  /api/trading/logs                    # 서비스 로그
GET  /api/trading/snapshots               # 일일 스냅샷
GET  /api/trading/prices                  # 최신 종가
GET  /api/trading/automation              # 자동매매 상태
POST /api/trading/automation              # 자동매매 제어
POST /api/trading/cycle/new               # 새 사이클 시작
POST /api/trading/reset                   # 사이클 리셋
```

---

## 7. 에러 처리 & 트러블슈팅

### 파이프라인 에러 처리

```
스크래핑 실패:
  status="error" BUT progress > 0
  → 성공으로 간주 (일부 데이터라도 수집됨)
  → 실패 종목만 retry: POST /api/scraper/jobs/retry

피처 처리 실패:
  → FRED API key 확인 (docker-compose.yml:57)
  → include_macro: false로 재시도 가능

ML 예측 실패:
  → 모델 파일 존재 확인: ml-service/data/models/ahnlab_lgbm/current/
  → etf2_db_processed 최신 여부 확인

매매 실패:
  → 개별 주문 실패는 다른 주문에 영향 없음
  → 최대 3회 재시도 (1초, 3초, 9초 간격)
  → 모든 실패는 order_logs + trading_logs에 기록
```

### 자주 발생하는 문제

```
1. SSH 터널 끊김
   증상: MySQL 연결 실패
   확인: pgrep -f "ssh.*3306"
   해결: ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr

2. 컨테이너 OOM (메모리 부족)
   증상: 컨테이너 자동 재시작
   확인: docker logs [컨테이너명]
   해결: docker restart [컨테이너명]

3. 디스크 꽉 참
   증상: Docker 빌드/실행 실패
   확인: df -h
   해결: docker system prune -a

4. KIS API 토큰 만료
   증상: 401/403 에러
   해결: 자동 갱신됨 (24시간). 계속 실패 시 컨테이너 재시작

5. TradingView 쿠키 만료
   증상: 스크래핑 전체 실패
   해결: cookies.json 업데이트 필요 (수동)
```

---

## 8. 환경변수 & 비밀키

### docker-compose.yml (공개)
```
REMOTE_DB_URL=mysql+pymysql://ahnbi2:bigdata@172.17.0.1:3306/etf2_db
FRED_API_KEY=9caba366c8bc71e8fea23b45a34651a5
DEFAULT_MODEL=ahnlab_lgbm
```

### trading-service/.env (비공개, .gitignore)
```
KIS_APP_KEY=발급받은키
KIS_APP_SECRET=발급받은시크릿
KIS_ACCOUNT_NUMBER=50174429-01
TRADING_MODE=paper
```

---

## 9. Docker 명령어 치트시트

```bash
# 상태 확인
docker ps                                    # 전체 컨테이너
docker logs -f etf-trading-service           # 실시간 로그
docker logs --tail 100 etf-scraper-service   # 최근 100줄

# 헬스체크
curl http://localhost:8000/health   # ML
curl http://localhost:8001/health   # 스크래퍼
curl http://localhost:8002/health   # 트레이딩

# 서비스 재시작
docker restart etf-trading-service
docker restart etf-ml-service

# 코드 변경 후 재배포
docker build -t etf-trading-service ./trading-service
docker stop etf-trading-service && docker rm etf-trading-service
docker run -d --name etf-trading-service \
  --network etf-trading-project_etf-network \
  -p 8002:8002 --env-file trading-service/.env \
  -e TZ=Asia/Seoul \
  -v "$(pwd)/trading-service/data:/app/data" \
  --restart unless-stopped \
  etf-trading-service:latest

# 정리
docker system prune -a              # 미사용 이미지/컨테이너 삭제
docker volume prune                 # 미사용 볼륨 삭제
```

---

## 10. Git 브랜치 전략

```
main ← 안정 버전 (PM만 머지)
  │
develop ← 개발 통합 (PR → PM 승인 → 머지)
  │
  ├── feat/community-init        ← 양진우
  ├── feat/monte-carlo           ← 임대윤
  ├── feat/shap-explainability   ← 최인훈
  └── fix/feature-processing     ← 박성문

작업 흐름:
1. git checkout develop && git pull
2. git checkout -b feat/내-브랜치
3. 작업 + 커밋 (feat:, fix:, docs: 접두사)
4. git push origin feat/내-브랜치
5. GitHub에서 PR 생성 (base: develop)
6. PM(주진호) 리뷰 → 머지
```

---

## 11. 절대 금지 규칙

- docker-compose.yml 직접 수정 금지 (PM 승인 후 PR)
- .env 파일 GitHub push 금지
- git push --force 금지
- main 브랜치 직접 커밋 금지
- 프로덕션 데이터(logs/, data/, downloads/) 삭제 금지
- SSH 터널/Docker 컨테이너 무단 중지 금지
- DB 테이블 DROP/TRUNCATE 금지
