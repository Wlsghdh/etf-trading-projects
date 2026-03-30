# PROGRESS.md - ETF 자동매매 프로젝트 진행 상황

> 최종 업데이트: 2026-03-12

---

## 현재 상태 요약

| 구성 요소 | 상태 | 설명 |
|-----------|------|------|
| 데이터 스크래핑 | ✅ 완료 | TradingView → etf2_db (Docker API + 모니터링) |
| 피처 처리 | ✅ 완료 | etf2_db → etf2_db_processed (85개 피처) |
| 분류 모델 (랭킹) | ✅ 완료 | LightGBM LambdaRank, 학습 완료 |
| 회귀 모델 (가격예측) | ⚠️ 인프라 완료 | XGBoost Regression, **학습만 하면 됨** |
| ML API 서비스 | ✅ 완료 | FastAPI (포트 8000) |
| 스크래퍼 API 서비스 | ✅ 완료 | FastAPI (포트 8001) |
| 트레이딩 서비스 | ⚠️ 부분 완료 | FastAPI (포트 8002), **KIS API 키 필요** |
| 모니터링 대시보드 | ✅ 완료 | trading-monitor (포트 3002) |
| 스크래핑 모니터링 | ✅ 완료 | auto-monitoring |
| 웹 대시보드 | ✅ 완료 | web-dashboard |
| Docker 인프라 | ✅ 완료 | 7개 서비스, Nginx 리버스 프록시 |
| 자동화 스케줄링 | ✅ 완료 | cron + run.py 오케스트레이터 |
| KIS API 연동 | ❌ 미설정 | 한국투자증권 API 키 등록 필요 |

---

## 완료된 작업 ✅

### 데이터 파이프라인
- [x] TradingView Playwright 스크래퍼 (Docker API)
- [x] OHLCV 데이터 → MySQL etf2_db 업로드 (~500 테이블)
- [x] 피처 엔지니어링 (85개 피처 → etf2_db_processed)
- [x] 배당금/분할 데이터 (yfinance)
- [x] 데이터 품질 검증 (validate_data.py)

### ML 모델
- [x] LightGBM LambdaRank 분류 모델 (종목 랭킹)
  - 2-fold Rolling CV 앙상블
  - 85개 피처, NDCG 최적화
  - 모델 경로: `ml-service/data/models/ahnlab_lgbm/current/`
- [x] XGBoost 회귀 모델 인프라 구축
  - 학습 스크립트: `scripts/train_regressor.py`
  - 모델 로더: `XGBRegressorEnsemble` in model_loader.py
  - API 엔드포인트: `GET /api/predictions/forecast/{symbol}/price`
  - 모델 경로: `ml-service/data/models/price_regressor/current/`

### API 서비스
- [x] ml-service (포트 8000)
  - `POST /api/predictions/ranking` — 전체 종목 랭킹
  - `GET /api/predictions/forecast/{symbol}/price` — 가격 예측
  - `GET /api/data/{symbol}` — OHLCV 데이터
- [x] scraper-service (포트 8001)
  - `POST /api/scrape` — 스크래핑 시작
  - `POST /api/features/process` — 피처 처리
- [x] trading-service (포트 8002)
  - `POST /api/trading/execute` — 매매 실행
  - `GET /api/trading/status` — 상태 조회

### 대시보드
- [x] trading-monitor: 포트폴리오, 캔들스틱 차트 (lightweight-charts), 예측 오버레이
- [x] auto-monitoring: 실시간 스크래핑 진행률
- [x] web-dashboard: 예측 결과, 팩트시트
- [x] 관리자 페이지: 터미널 스타일 로그 뷰어

### 인프라
- [x] Docker Compose (7개 서비스)
- [x] Nginx 리버스 프록시
- [x] SSH 터널 자동화
- [x] start.sh / stop.sh / status.sh

### 자동화
- [x] run.py 오케스트레이터 (paper/live 모드)
- [x] run-pipeline.sh (일일 파이프라인)
- [x] setup-cron.sh (cron 작업 설정)
- [x] 매일 22:00 UTC 자동 실행 (월~금)

---

## 진행 중 / 남은 작업 ⚠️

### 즉시 가능 (학습만 하면 됨)
- [ ] **회귀 모델 학습**: `python scripts/train_regressor.py --pred-year 2026`
  - 인프라 100% 완료, 학습 실행만 필요
  - 예상 소요: DB 데이터량에 따라 5~30분

### 설정 필요
- [ ] **KIS API 키 등록** (한국투자증권)
  - `.env` 파일에 설정:
    ```
    KIS_APP_KEY=your_app_key
    KIS_APP_SECRET=your_app_secret
    KIS_ACCOUNT_NUMBER=your_account_number
    ```
  - 모의투자(paper) 키와 실투자(live) 키 별도
  - 한국투자증권 개발자센터에서 발급

### 검증 필요
- [ ] 전체 파이프라인 end-to-end 테스트
  - 스크래핑 → 피처 처리 → 랭킹 예측 → 가격 예측 → 매매 실행
- [ ] Cron 자동화 실제 동작 확인
- [ ] 모의투자 모드 테스트

---

## 앞으로의 계획

### Phase 1: 모델 학습 + 테스트 (즉시)
1. SSH 터널 + Docker 서비스 기동
2. 회귀 모델 학습 실행
3. 전체 파이프라인 수동 테스트
4. 모니터링 대시보드에서 결과 확인

### Phase 2: KIS API 연동 (API 키 발급 후)
1. 한국투자증권 개발자센터에서 API 키 발급
2. `.env` 파일에 키 설정
3. 모의투자(paper) 모드로 테스트
4. 매매 실행 결과 확인

### Phase 3: 자동화 운영 시작
1. Cron 스케줄 활성화 (`./scripts/setup-cron.sh`)
2. 매일 자동 파이프라인: 스크래핑 → 피처 → 예측 → 매매
3. trading-monitor에서 실시간 모니터링
4. 일일/주간 성과 리포트

### Phase 4: 실투자 전환 (충분한 검증 후)
1. 모의투자 성과 분석 (최소 1~2주)
2. 실투자 API 키로 전환
3. 소액으로 시작, 점진적 증액
4. 리스크 관리 규칙 적용

---

## 서비스 접속 정보

| 서비스 | URL | 설명 |
|--------|-----|------|
| ML API | http://localhost:8000/docs | Swagger 문서 |
| Scraper API | http://localhost:8001/docs | 스크래핑 API |
| Trading API | http://localhost:8002/docs | 매매 API |
| Trading Monitor | http://localhost:3002/trading/ | 모니터링 대시보드 |
| Web Dashboard | http://localhost:3000/ | 웹 대시보드 |
| Auto-Monitoring | http://localhost/monitor | 스크래핑 모니터 |

---

## 주요 명령어

```bash
# 서비스 시작/중지
./start.sh                    # 전체 시작 (SSH 터널 + Docker)
./stop.sh                     # 전체 중지
./status.sh                   # 상태 확인

# 수동 파이프라인 실행
curl -X POST http://localhost:8001/api/scrape          # 스크래핑
curl -X POST http://localhost:8001/api/features/process # 피처 처리
curl -X POST http://localhost:8000/api/predictions/ranking  # 랭킹 예측

# 모델 학습
docker exec -it etf-ml-service python scripts/train_ahnlab.py --pred-year 2026
docker exec -it etf-ml-service python scripts/train_regressor.py --pred-year 2026

# 자동화
python run.py --mode paper    # 모의투자 모드
python run.py --mode live     # 실투자 모드
```

---

## 프로젝트 구조

```
etf-trading-project/
├── ml-service/            ← ML 모델 + API (포트 8000)
├── scraper-service/       ← 데이터 스크래핑 (포트 8001)
├── trading-service/       ← 자동 매매 (포트 8002)
├── trading-monitor/       ← 모니터링 대시보드 (포트 3002)
├── web-dashboard/         ← 웹 대시보드 (포트 3000)
├── auto-monitoring/       ← 스크래핑 모니터
├── scripts/               ← 자동화 스크립트
├── docker-compose.yml     ← Docker 서비스 정의
├── run.py                 ← 오케스트레이터
├── start.sh / stop.sh     ← 서비스 제어
├── strategy.md            ← 전략 상세 문서
└── PROGRESS.md            ← 이 파일
```
