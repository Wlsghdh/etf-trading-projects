# ETF 자동매매 시스템 - 실행 가이드라인

## 목차
1. [빠른 시작](#1-빠른-시작)
2. [사전 준비](#2-사전-준비)
3. [실행 방법](#3-실행-방법)
4. [스케줄 & 매매 로직](#4-스케줄--매매-로직)
5. [서비스 구성](#5-서비스-구성)
6. [모니터링](#6-모니터링)
7. [수동 실행](#7-수동-실행)
8. [로그 확인](#8-로그-확인)
9. [환경변수 설정](#9-환경변수-설정)
10. [모의투자 ↔ 실투자 전환](#10-모의투자--실투자-전환)
11. [트러블슈팅](#11-트러블슈팅)
12. [주요 파일 경로](#12-주요-파일-경로)

---

## 1. 빠른 시작

```bash
# 1단계: KIS API 키 세팅 (최초 1회)
cp trading-service/.env.example trading-service/.env
vi trading-service/.env   # KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT_NUMBER 입력

# 2단계: 실행
python run.py             # 끝. 자동으로 전부 처리됨.
```

`run.py`가 자동으로 수행하는 것:
- SSH 터널 확인/시작
- Docker 서비스 전체 기동
- 헬스체크 (ml-service, scraper-service, trading-service)
- ML 모델 없으면 최초 학습
- 스케줄러 시작 (예측/매매/재학습)

---

## 2. 사전 준비

### 2-1. 한국투자증권 API 키 발급

1. [한국투자증권 OpenAPI 포탈](https://apiportal.koreainvestment.com/) 접속
2. 회원가입 → 모의투자 계좌 개설
3. API 신청 → **APP KEY**, **APP SECRET** 발급
4. 계좌번호 확인 (형식: `XXXXXXXX-XX`)

### 2-2. `.env` 파일 생성

```bash
cp trading-service/.env.example trading-service/.env
```

필수 항목만 수정:
```env
KIS_APP_KEY=발급받은_앱키
KIS_APP_SECRET=발급받은_시크릿키
KIS_ACCOUNT_NUMBER=12345678-01
TRADING_MODE=paper
```

### 2-3. 필요 패키지

```bash
pip install requests apscheduler
```

### 2-4. SSH 키 설정 (원격 DB 접근용)

```bash
# 비밀번호 없이 접속 가능하도록 설정 (최초 1회)
ssh-keygen -t ed25519
ssh-copy-id ahnbi2@ahnbi2.suwon.ac.kr
```

---

## 3. 실행 방법

### 기본 실행 (모의투자)
```bash
python run.py
```

### 실투자 모드
```bash
python run.py --mode live
# "LIVE" 입력 확인 후 실행
```

### 실행 시 출력 예시
```
═══════════════════════════════════════════
  ETF 자동매매 시스템 v1.0
  모드: 모의투자 (paper)
═══════════════════════════════════════════
[✓] SSH 터널 확인
[✓] Docker 서비스 시작
[✓] ml-service (port 8000) 정상
[✓] scraper-service (port 8001) 정상
[✓] trading-service (port 8002) 정상
[✓] ML 모델 확인 완료

📅 스케줄:
  • 매일 06:00 KST - 데이터 수집 + 예측
  • 매일 08:30 KST - 자동매매 (trading-service 내장)
  • 매월 1일 03:00 KST - 모델 재학습

⏳ 스케줄러 실행중... (Ctrl+C로 종료)
```

### 종료
- `Ctrl+C` 또는 `kill` 시그널로 정상 종료

---

## 4. 스케줄 & 매매 로직

### 일일 스케줄

| 시간 (KST) | 작업 | 담당 | 소요 |
|------------|------|------|------|
| **06:00** | 데이터 스크래핑 + 피처처리 + ML 예측 | run.py (APScheduler) | 15~60분 |
| **08:30** | 자동매매 실행 (매수/매도) | trading-service (내장 스케줄러) | 수분 |

### 월간 스케줄

| 시간 (KST) | 작업 | 담당 |
|------------|------|------|
| **매월 1일 03:00** | ML 모델 재학습 | run.py (APScheduler) |

### 매매 사이클 (63일 FIFO)

```
Day 1~63:  매수 구간
           → ML 랭킹 상위 ETF 매수 (매일 08:30)
           → 전략자금(70%) 기반 분배

Day 64+:   매도+재매수 순환
           → 63거래일 전 매수 종목 FIFO 매도
           → 매도 대금으로 새 랭킹 상위 ETF 재매수
```

### 휴장일 처리
- KRX(한국거래소) 캘린더 기반 자동 판별
- **주말 + 공휴일(설날, 추석, 개천절 등)**: 매매 자동 스킵
- 예측 파이프라인은 매일 실행 (데이터 축적 목적)

---

## 5. 서비스 구성

| 서비스 | 포트 | 컨테이너명 | 역할 |
|--------|------|-----------|------|
| **ml-service** | 8000 | etf-ml-service | ML 예측, 랭킹 API |
| **scraper-service** | 8001 | etf-scraper-service | TradingView 데이터 스크래핑 |
| **trading-service** | 8002 | etf-trading-service | KIS API 매매 실행 |
| **web-dashboard** | 3000 | etf-web-dashboard | 포트폴리오 대시보드 |
| **auto-monitoring** | - | etf-auto-monitoring | 스크래핑 모니터링 |
| **trading-monitor** | 3002 | etf-trading-monitor | 매매 모니터링 대시보드 |
| **nginx** | 80 | etf-nginx | 리버스 프록시 |

### 접속 URL

| 페이지 | URL |
|--------|-----|
| 웹 대시보드 | http://localhost:3000 |
| 매매 모니터링 | http://localhost:3002/trading |
| 스크래핑 모니터링 | http://localhost/monitor |
| ML API 문서 | http://localhost:8000/docs |
| Trading API 문서 | http://localhost:8002/docs |

---

## 6. 모니터링

### Trading Monitor (http://localhost:3002/trading)

| 페이지 | 내용 |
|--------|------|
| **대시보드** | D-Day 인디케이터, KPI 카드, 자동매매 상태, 최근 주문 |
| **달력** | 월별 매수/매도 건수, 손익 표시, 날짜별 상세 |
| **포트폴리오** | 보유 종목, 수량, 매수가, D-day, 손익률 |
| **설정** | 서비스 헬스체크, 현재 설정값 |

### 연결 상태 표시
- 헤더에 **Live** (초록) / **Demo** (노란) 표시
- trading-service 연결 시 실데이터, 미연결 시 더미데이터

---

## 7. 수동 실행

### 예측 파이프라인 수동 실행
```bash
# 1. 스크래핑
curl -X POST http://localhost/api/scraper/jobs/full

# 2. 피처 처리
curl -X POST http://localhost/api/scraper/features/process \
  -H "Content-Type: application/json" \
  -d '{"include_macro": true, "shift_features": true}'

# 3. ML 랭킹 예측
curl -X POST http://localhost/api/predictions/ranking
```

### 매매 수동 실행
```bash
curl -X POST http://localhost:8002/api/trading/execute
```

### 모델 수동 학습
```bash
docker exec etf-ml-service python scripts/train_ahnlab.py
```

### 서비스 상태 확인
```bash
./status.sh
# 또는
curl http://localhost:8000/health   # ml-service
curl http://localhost:8001/health   # scraper-service
curl http://localhost:8002/health   # trading-service
```

---

## 8. 로그 확인

### 로그 파일 위치

| 로그 | 경로 | 용도 |
|------|------|------|
| 오케스트레이터 | `logs/orchestrator-YYYYMMDD.log` | run.py 실행 로그 |
| 예측 | `logs/predict-YYYYMMDD.log` | 일일 예측 상세 |
| 학습 | `logs/train-YYYYMM.log` | 월간 학습 결과 |
| Cron | `logs/cron.log` | Cron 실행 요약 |

### 실시간 로그 보기
```bash
# 오케스트레이터 로그
tail -f logs/orchestrator-*.log

# Docker 서비스 로그
docker compose logs -f trading-service    # 매매 로그
docker compose logs -f ml-service         # ML 서비스
docker compose logs -f scraper-service    # 스크래핑
docker compose logs -f --tail 50          # 전체 최근 50줄
```

---

## 9. 환경변수 설정

### 필수 (반드시 설정)

| 변수 | 설명 | 예시 |
|------|------|------|
| `KIS_APP_KEY` | 한투 API 앱키 | `PSabcdef1234...` |
| `KIS_APP_SECRET` | 한투 API 시크릿 | `a1b2c3d4e5f6...` |
| `KIS_ACCOUNT_NUMBER` | 계좌번호 | `50123456-01` |

### 선택 (기본값 있음)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `TRADING_MODE` | `paper` | `paper` (모의) / `live` (실투자) |
| `KIS_LIVE_CONFIRMATION` | `false` | 실투자 안전장치 |
| `STRATEGY_RATIO` | `0.7` | 전략자금 비율 (70%) |
| `FIXED_RATIO` | `0.3` | 고정편입 비율 (30%) |
| `TOP_N_ETFS` | `100` | 매수 종목 수 |
| `CYCLE_TRADING_DAYS` | `63` | 순환 주기 (거래일) |
| `ORDER_TYPE` | `market` | `market` (시장가) / `limit` (지정가) |
| `TRADE_HOUR_KST` | `8` | 매매 시간 (시) |
| `TRADE_MINUTE_KST` | `30` | 매매 시간 (분) |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

---

## 10. 모의투자 ↔ 실투자 전환

### 모의투자 (기본)
```env
# trading-service/.env
TRADING_MODE=paper
KIS_LIVE_CONFIRMATION=false
```
```bash
python run.py              # 또는 python run.py --mode paper
```

### 실투자 전환
```env
# trading-service/.env
TRADING_MODE=live
KIS_LIVE_CONFIRMATION=true   # 반드시 true
```
```bash
python run.py --mode live
# "LIVE" 입력 확인 필요
```

> **주의**: `TRADING_MODE=live`만으로는 부족합니다. `KIS_LIVE_CONFIRMATION=true`도 반드시 설정해야 합니다. 이중 안전장치입니다.

### API 서버 차이

| 모드 | KIS API 서버 |
|------|-------------|
| 모의투자 | `openapivts.koreainvestment.com:29443` |
| 실투자 | `openapi.koreainvestment.com:9443` |

---

## 11. 트러블슈팅

### SSH 터널 연결 실패
```
에러: "SSH 터널이 없습니다" 또는 타임아웃
해결:
  1. ssh ahnbi2@ahnbi2.suwon.ac.kr "echo OK"  # 수동 테스트
  2. ssh-copy-id ahnbi2@ahnbi2.suwon.ac.kr     # 비밀번호 없이 접속 설정
  3. python run.py                              # 재실행
```

### Docker 서비스 시작 실패
```
에러: "Docker 데몬에 연결할 수 없습니다"
해결:
  1. sudo systemctl start docker
  2. sudo usermod -aG docker $USER && newgrp docker
  3. python run.py
```

### ML 모델 학습 실패
```
에러: "ML 모델이 없습니다" + 학습 실패
해결:
  1. docker logs etf-ml-service | tail -50      # 에러 확인
  2. docker exec etf-ml-service python scripts/train_ahnlab.py  # 수동 재시도
  3. etf2_db_processed DB에 데이터 있는지 확인
```

### KIS API 인증 실패
```
에러: "KIS API authentication failed"
해결:
  1. trading-service/.env 파일 확인
  2. APP KEY/SECRET 유효기간 확인 (한투 포탈)
  3. 계좌번호 형식 확인 (XXXXXXXX-XX)
  4. docker compose restart trading-service
```

### 서비스 헬스체크 타임아웃
```
에러: "일부 서비스가 응답하지 않습니다"
해결:
  1. docker compose ps                          # 컨테이너 상태 확인
  2. docker compose logs --tail 50 [서비스명]    # 에러 로그 확인
  3. docker compose restart [서비스명]            # 재시작
  4. docker compose down && docker compose up -d # 전체 재시작
```

### 포트 충돌
```
에러: "Address already in use"
해결:
  lsof -i :8002    # 해당 포트 사용 프로세스 확인
  kill -9 [PID]    # 종료
  docker compose down && python run.py  # 재시작
```

---

## 12. 주요 파일 경로

```
etf-trading-project/
├── run.py                          # 통합 실행 스크립트 (이것만 실행!)
├── start.sh                        # Docker 서비스 시작
├── stop.sh                         # Docker 서비스 중지
├── status.sh                       # 상태 확인
├── docker-compose.yml              # 서비스 정의
│
├── trading-service/                # 매매 서비스
│   ├── .env                        # ⭐ KIS API 키 설정 (직접 생성)
│   ├── .env.example                # 설정 템플릿
│   ├── app/
│   │   ├── config.py               # 전략 파라미터
│   │   ├── main.py                 # APScheduler (08:30 매매)
│   │   └── services/
│   │       ├── kis_client.py       # 한투 API 래퍼
│   │       ├── trade_executor.py   # 매매 실행 로직
│   │       ├── cycle_manager.py    # 63일 FIFO 사이클
│   │       └── holiday_calendar.py # KRX 휴장일 판별
│   └── data/trading.db             # 매매 이력 DB (자동생성)
│
├── ml-service/                     # ML 서비스
│   ├── data/
│   │   ├── models/ahnlab_lgbm/     # 학습된 모델
│   │   └── predictions.db          # 예측 결과 DB
│   └── scripts/train_ahnlab.py     # 모델 학습 스크립트
│
├── scraper-service/                # 데이터 스크래핑
├── trading-monitor/                # 매매 모니터링 대시보드
├── auto-monitoring/                # 스크래핑 모니터링
├── web-dashboard/                  # 웹 대시보드
│
├── scripts/
│   ├── setup-cron.sh               # Cron 등록
│   ├── run-pipeline.sh             # 예측 파이프라인
│   ├── train-monthly.sh            # 월간 재학습
│   └── train-yearly.sh             # 연간 재학습
│
└── logs/                           # 로그 디렉토리
    ├── orchestrator-YYYYMMDD.log
    ├── predict-YYYYMMDD.log
    └── train-YYYYMM.log
```

---

## 요약: 전체 흐름

```
python run.py
    │
    ├─ 사전 점검 (SSH, Docker, .env)
    ├─ docker compose up -d (전체 서비스)
    ├─ 헬스체크 통과 대기
    ├─ ML 모델 확인 (없으면 자동 학습)
    │
    └─ 스케줄러 시작
         │
         ├─ 매일 06:00 KST ──→ 스크래핑 → 피처처리 → ML 예측
         ├─ 매일 08:30 KST ──→ 자동매매 (Day 1~63: 매수 / Day 64+: 매도+재매수)
         ├─ 매월 1일 03:00 ──→ 모델 재학습
         │
         └─ 주말/공휴일 ────→ 매매 자동 스킵 (KRX 캘린더)
```
