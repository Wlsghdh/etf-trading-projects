# ETF Trading Pipeline

ETF 주식 데이터 수집, 분석, 예측을 위한 종합 데이터 파이프라인 시스템입니다.

## 개요

이 프로젝트는 머신러닝 모델을 활용하여 ETF 및 주식의 상대 순위를 예측하고, 자동화된 데이터 파이프라인을 통해 실시간으로 데이터를 수집 및 분석합니다.

### 주요 기능

- **데이터 수집**: TradingView에서 실시간 주식 데이터 스크래핑
- **특징 엔지니어링**: 85개 피처 (기술지표 + 거시경제 + 엔지니어링 + Z-score + 랭크)
- **ML 예측**: LightGBM LambdaRank 기반 전체 종목 상대 순위 예측
- **자동화**: Cron 기반 일일 예측, 월간 모델 재학습
- **모니터링**: 실시간 스크래핑 상태 대시보드

## 기술 스택

| 분야 | 기술 |
|------|------|
| 백엔드 | FastAPI (Python) |
| 프론트엔드 | Next.js 16, TypeScript, shadcn/ui |
| ML/DL | LightGBM, scikit-learn |
| 데이터베이스 | MySQL (원격), SQLite (로컬) |
| 인프라 | Docker, Docker Compose, Nginx |
| 자동화 | Bash, Cron |

## 시작하기

### 사전 요구사항

- Docker & Docker Compose v2
- Python 3.10+ (로컬 개발용)
- Node.js 18+ (로컬 개발용)
- SSH 접속 권한 (원격 DB 연결용)

### 1. 레포지토리 클론

```bash
git clone https://github.com/Ahn-Laboratory/etf-trading-project.git
cd etf-trading-project
```

### 2. 환경 변수 설정

각 서비스별 `.env` 파일을 설정합니다.

**scraper-service/.env**:
```bash
TRADINGVIEW_USERNAME=your_username
TRADINGVIEW_PASSWORD=your_password
```

### 3. SSH 터널 시작

원격 MySQL 데이터베이스에 접근하기 위해 SSH 터널이 필요합니다.

```bash
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr
```

### 4. 서비스 시작

**모든 서비스 시작**:
```bash
./start.sh
```

**특정 서비스만 시작**:
```bash
./start.sh web-dashboard    # 웹 대시보드만
./start.sh ml-service       # ML 서비스만
```

### 5. 서비스 접속

| 서비스 | 로컬 URL | 프로덕션 URL |
|--------|----------|--------------|
| 웹 대시보드 | http://localhost/ | http://ahnbi2.suwon.ac.kr/ |
| API 문서 | http://localhost/docs | http://ahnbi2.suwon.ac.kr/docs |
| 모니터링 | http://localhost/monitor | http://ahnbi2.suwon.ac.kr/monitor |

## 서비스 관리

### 서비스 중지

```bash
./stop.sh    # Docker 컨테이너 중지 (SSH 터널 유지)
```

### 상태 확인

```bash
./status.sh   # 서비스 상태 및 API 헬스체크
```

### Docker 명령어

```bash
docker compose up -d        # 컨테이너 시작
docker compose down         # 컨테이너 중지
docker compose logs -f      # 로그 확인
docker compose build        # 이미지 재빌드
docker compose ps           # 컨테이너 상태
```

## API 엔드포인트

### ml-service (포트 8000)

| Method | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/health` | 헬스체크 |
| GET | `/api/stocks` | 종목 목록 조회 |
| POST | `/api/predictions/ranking` | 전체 종목 랭킹 예측 |
| GET | `/api/predictions/ranking/latest` | 최신 랭킹 결과 |

### scraper-service (포트 8001)

| Method | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/jobs/full` | 전체 종목 스크래핑 시작 |
| POST | `/api/jobs/cancel` | 스크래핑 작업 취소 |
| GET | `/api/jobs/status` | 스크래핑 상태 조회 |
| POST | `/api/jobs/retry` | 실패한 종목 재시도 |

## 프로젝트 구조

```
etf-trading-project/
├── docker-compose.yml          # Docker Compose 설정
├── start.sh                    # 서비스 시작 스크립트
├── stop.sh                     # 서비스 중지 스크립트
├── status.sh                   # 상태 확인 스크립트
│
├── ml-service/                 # ML 예측 서비스
│   ├── app/
│   │   ├── main.py             # FastAPI 진입점
│   │   ├── routers/            # API 라우터
│   │   └── services/           # 비즈니스 로직
│   └── data/                   # SQLite DB, 모델 파일
│
├── web-dashboard/              # Next.js 대시보드
│   ├── app/                    # Next.js 페이지
│   ├── components/             # React 컴포넌트
│   └── lib/                    # API 연동
│
├── scraper-service/            # 스크래핑 서비스
│   ├── app/
│   │   ├── main.py             # FastAPI 진입점
│   │   └── services/           # 스크래핑 로직
│   └── scripts/                # 유틸리티 스크립트
│
├── auto-monitoring/            # 모니터링 대시보드
│   ├── app/                    # Next.js 페이지
│   └── lib/                    # 로그 파서
│
├── etf-model/                  # ML 모델 개발
│   └── src/                    # 모델, 피처, 파이프라인
│
├── scripts/                    # 자동화 스크립트
│   ├── predict-daily.sh        # 일일 예측
│   └── train-monthly.sh        # 월간 학습
│
└── nginx/                      # Nginx 설정
```

## 로컬 개발

### 웹 대시보드 개발

```bash
cd web-dashboard
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
```

### ML 모델 개발

```bash
cd etf-model
pip install -r requirements.txt
python src/pipeline.py              # 학습
```

### 스크래퍼 개발

```bash
cd scraper-service
poetry install
poetry run python app/main.py       # 로컬 실행
```

## 자동화

### Cron 설정

```bash
./scripts/setup-cron.sh
```

**설정된 작업**:
- 매일 오전 8시: 전체 종목 예측
- 매월 1일 새벽 3시: 모델 재학습

### 로그 위치

- `logs/cron.log` - cron 실행 요약
- `logs/predict-YYYYMMDD.log` - 일일 예측 상세
- `logs/train-YYYYMM.log` - 월간 학습 상세

## 트러블슈팅

### Docker 연결 실패

```bash
# Docker 데몬 확인
docker ps

# Colima/Docker Desktop 재시작 (macOS)
colima restart
```

### SSH 터널 연결 실패

```bash
# 터널 상태 확인
pgrep -f "ssh.*3306"

# 터널 재시작
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr
```

### 포트 충돌

```bash
# 포트 사용 프로세스 확인
lsof -ti:8000
lsof -ti:3000
```

### 스크래핑 작업 제어

```bash
# 스크래핑 시작
curl -X POST http://localhost:8001/api/jobs/full

# 스크래핑 취소
curl -X POST http://localhost:8001/api/jobs/cancel

# 상태 확인
curl http://localhost:8001/api/jobs/status

# 실패한 종목 재시도
curl -X POST http://localhost:8001/api/jobs/retry \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL", "NVDA"]}'
```

## 문서

- [인수인계 문서](./HANDOVER.md) - 상세 시스템 아키텍처 및 운영 가이드
- [CLAUDE.md](./CLAUDE.md) - 프로젝트 개발 가이드라인
- [Scraper Service 문서](./scraper-service/CLAUDE.md)

## 라이선스

Copyright © 2026 ETF Trading Project
