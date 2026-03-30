# AI ETF 자동매매 시스템

AI 기반 ETF 종목 선정 및 자동매매를 위한 풀스택 파이프라인 시스템입니다.
데이터 수집부터 ML 예측, KIS API 자동 주문, 실시간 모니터링까지 전 과정을 자동화합니다.

## 시스템 구성

```
┌─────────────────────────────────────────────────────────────┐
│                    매일 07:00 KST (cron)                     │
└─────────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   [데이터 수집]      [피처 처리]         [ML 예측]
   TradingView       85개 피처 생성      LightGBM 랭킹
   101종목 스크래핑    etf2_db_processed   Top 100 선정
         │                  │                  │
         └──────────────────┼──────────────────┘
                            ▼
                   [자동매매 실행] 23:30 KST
                   KIS API 해외주식 주문
                   63일 FIFO 순환매매
                            │
                            ▼
                   [모니터링 대시보드]
                   실시간 포트폴리오 · 차트 · 로그
```

## 서비스 아키텍처

| 서비스 | 포트 | 설명 |
|--------|------|------|
| **ml-service** | 8000 | ML 예측 API (LightGBM LambdaRank) |
| **scraper-service** | 8001 | TradingView 데이터 수집 + 피처 엔지니어링 |
| **trading-service** | 8002 | KIS API 자동매매 (63일 FIFO) |
| **trading-monitor** | 3002 | 모니터링 대시보드 (Next.js) |
| **web-dashboard** | 3000 | 메인 웹 대시보드 |
| **auto-monitoring** | - | 스크래핑 모니터링 |
| **nginx** | 80 | 리버스 프록시 |

## 기술 스택

| 분야 | 기술 |
|------|------|
| 백엔드 | FastAPI (Python 3.12) |
| 프론트엔드 | Next.js 16, TypeScript, shadcn/ui, Tailwind CSS |
| ML | LightGBM LambdaRank, 85개 피처, 2-fold Rolling CV |
| 자동매매 | KIS API (한국투자증권 해외주식), APScheduler |
| 차트 | TradingView Widget, lightweight-charts |
| 데이터베이스 | MySQL (원격 etf2_db), SQLite (로컬) |
| 인프라 | Docker Compose, Nginx, Cron |

## 빠른 시작

### 1. 서비스 시작

```bash
# SSH 터널 + Docker 서비스 전체 시작
./start.sh

# 또는 Docker만
docker-compose up -d
```

### 2. KIS API 설정 (자동매매용)

```bash
# trading-service/.env 편집
cp trading-service/.env.example trading-service/.env
vim trading-service/.env

# 필수 설정:
# KIS_APP_KEY=your_app_key
# KIS_APP_SECRET=your_app_secret
# KIS_ACCOUNT_NUMBER=XXXXXXXX-XX
# TRADING_MODE=paper
```

### 3. Cron 자동화 설정

```bash
./scripts/setup-cron.sh
```

### 4. 접속

| 서비스 | URL |
|--------|-----|
| 모니터링 대시보드 | http://localhost:3002/trading |
| 메인 대시보드 | http://localhost |
| Trading API Docs | http://localhost:8002/docs |
| ML API Docs | http://localhost/docs |

> 모니터링 대시보드 로그인: `ahnbi2` / `bigdata`

## 자동화 파이프라인

### 일일 스케줄 (KST)

| 시간 | 작업 | 실행 |
|------|------|------|
| 07:00 | 데이터 수집 (101종목 스크래핑) | cron → `run-pipeline.sh` |
| ~09:00 | 피처 처리 (85개 피처 생성) | 파이프라인 자동 |
| ~09:30 | ML 예측 (LightGBM 랭킹) | 파이프라인 자동 |
| 23:30 | 자동매매 실행 (KIS API 주문) | APScheduler |

### 주간/월간

| 주기 | 작업 |
|------|------|
| 매주 일요일 02:00 | 수익률 업데이트 |
| 매년 1/1 03:00 | 모델 재학습 |
| 6시간마다 | 서비스 헬스체크 |

### 수동 실행

```bash
# 전체 파이프라인 (수집→정제→예측)
./scripts/run-pipeline.sh

# 파이프라인 + 즉시 매매 실행
./scripts/run-pipeline.sh --execute-trading

# 매매만 실행
./scripts/execute-trading.sh

# 매매 상태 확인
./scripts/execute-trading.sh --status

# 서비스 헬스체크
./scripts/check-services.sh
```

## 매매 전략

- **63거래일 FIFO 순환매매**
- 일일 예산 = 총 자금 / 63
- **70%**: ML 랭킹 상위 종목 1주씩 매수 (예산 내)
- **30%**: 고정 ETF (QQQ) 매수
- Day 64부터: Day 1 매수분 자동 매도 → 재매수
- **정수 매매** (1주 단위, 소수점 미지원)

## 모니터링 대시보드

| 페이지 | 기능 |
|--------|------|
| 대시보드 | 포트폴리오 요약, KIS 잔고(USD/KRW), 자동매매 제어 |
| 데이터 수집 | 스크래핑 Start/Stop, 실시간 로그 |
| 데이터 전처리 | 피처 엔지니어링 상태, DB 건강도 |
| ML 모니터링 | 랭킹 테이블, 종목 클릭→TradingView 차트+63일 예측 |
| 파이프라인 | 전체 파이프라인 상태 |
| 포트폴리오 | 보유 종목, 손익 |
| 달력 | 일별 매매 내역 |
| DB 뷰어 | 500+ 테이블 그리드, 원본보기, 시각화 |
| 설정 | 파이프라인 Start/Stop, KIS API 상태, 개발자 옵션 |

## 프로젝트 구조

```
etf-trading-project/
├── ml-service/              # ML 예측 서비스 (FastAPI)
├── scraper-service/         # 데이터 수집 + 피처 처리 (FastAPI)
├── trading-service/         # 자동매매 서비스 (FastAPI + KIS API)
├── trading-monitor/         # 모니터링 대시보드 (Next.js)
├── web-dashboard/           # 메인 대시보드 (Next.js)
├── auto-monitoring/         # 스크래핑 모니터링
├── nginx/                   # 리버스 프록시 설정
├── scripts/                 # 자동화 스크립트
│   ├── run-pipeline.sh      # 전체 파이프라인
│   ├── execute-trading.sh   # 수동 매매 실행
│   ├── check-services.sh    # 서비스 헬스체크
│   └── setup-cron.sh        # cron 설정
├── docker-compose.yml       # Docker 서비스 정의
├── start.sh                 # 전체 시작
├── stop.sh                  # 전체 중지
└── status.sh                # 상태 확인
```

## 환경 변수

### trading-service/.env

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `KIS_APP_KEY` | 한국투자증권 API Key | - |
| `KIS_APP_SECRET` | 한국투자증권 API Secret | - |
| `KIS_ACCOUNT_NUMBER` | 계좌번호 (XXXXXXXX-XX) | - |
| `TRADING_MODE` | paper (모의) / live (실투자) | paper |
| `STRATEGY_RATIO` | AI 전략 비율 | 0.7 |
| `FIXED_RATIO` | 고정 ETF 비율 | 0.3 |
| `FIXED_ETF_CODES` | 고정 ETF 목록 | ["QQQ"] |
| `TRADE_HOUR_KST` | 매매 실행 시간 (시) | 23 |
| `TRADE_MINUTE_KST` | 매매 실행 시간 (분) | 30 |

## 로그

모든 로그는 **KST(한국 서울 시간)**으로 표시됩니다.

```
logs/
├── pipeline-YYYYMMDD.log    # 파이프라인 실행 로그
├── trading-YYYYMMDD.log     # 매매 실행 로그
└── cron.log                 # cron 실행 요약
```
