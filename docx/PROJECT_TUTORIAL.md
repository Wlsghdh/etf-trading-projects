# AI ETF 프로젝트 — 기초 개념 튜토리얼

작성일: 2026-04-01
대상: 개발 기초 개념부터 이해하고 싶은 팀원

> 이 문서는 우리 프로젝트에서 쓰이는 기술들을 **"왜 필요한지"**부터 설명합니다.
> 코드를 외우는 게 아니라, 전체 그림을 이해하는 게 목적입니다.

---

## 목차

1. [FastAPI가 뭐야?](#1-fastapi가-뭐야)
2. [Docker가 뭐야?](#2-docker가-뭐야)
3. [포트(Port)가 뭐고 왜 필요해?](#3-포트port가-뭐고-왜-필요해)
4. [라우팅(Routing)이 뭐야?](#4-라우팅routing이-뭐야)
5. [Nginx가 뭐고 왜 필요해?](#5-nginx가-뭐고-왜-필요해)
6. [Docker 네트워크가 뭐야?](#6-docker-네트워크가-뭐야)
7. [GET이랑 POST가 뭔 차이야?](#7-get이랑-post가-뭔-차이야)
8. [헬스체크(Health Check)가 뭐야?](#8-헬스체크health-check가-뭐야)
9. [API로 원하는 결과를 어떻게 가져와?](#9-api로-원하는-결과를-어떻게-가져와)
10. [오케스트레이터가 뭐야?](#10-오케스트레이터가-뭐야)
11. [자동화는 Cron 기반이야?](#11-자동화는-cron-기반이야)
12. [Docker 재시작하면 자동화에 어떤 영향?](#12-docker-재시작하면-자동화에-어떤-영향)
13. [Git은 어떻게 관리해?](#13-git은-어떻게-관리해)

---

## 1. FastAPI가 뭐야?

### 한 줄 설명
**Python으로 만드는 웹 서버.** 다른 프로그램이 우리한테 데이터를 요청하면 응답해주는 역할.

### 비유
식당의 **주문 창구**라고 생각하면 됨.

```
손님(프론트엔드)이 "메뉴 주세요" 하면
주문 창구(FastAPI)가 요청을 받아서
주방(비즈니스 로직)에서 처리하고
음식(데이터)을 돌려줌
```

### 우리 프로젝트에서 어떻게 쓰여?

3개 서비스가 각각 FastAPI로 만들어져 있음:

```
ml-service         → "예측 결과 줘" 라고 하면 ML 모델 돌려서 응답
scraper-service    → "스크래핑 시작해" 라고 하면 데이터 수집 시작
trading-service    → "매매 실행해" 라고 하면 KIS API로 주문
```

### 실제 코드 (trading-service/app/main.py)

```python
from fastapi import FastAPI

app = FastAPI(title="ETF Trading Service")

@app.get("/health")          # ← 이 URL로 요청이 오면
def health_check():           # ← 이 함수가 실행되고
    return {"status": "ok"}   # ← 이 데이터를 돌려줌
```

`@app.get("/health")`의 의미:
- `@app` → 이 FastAPI 앱에
- `.get` → GET 방식 요청이
- `("/health")` → /health 라는 URL로 들어오면
- 아래 함수를 실행해라

---

## 2. Docker가 뭐야?

### 한 줄 설명
**프로그램을 "상자"에 넣어서 어디서든 똑같이 실행되게 해주는 도구.**

### 왜 필요해?

내 컴퓨터에서는 돌아가는데 서버에서 안 돌아가는 경우가 많음.
- "나는 Python 3.12인데 서버는 3.8이라 안 돼"
- "나는 이 라이브러리가 설치됐는데 서버에는 없어"

Docker를 쓰면 **Python, 라이브러리, 설정 파일 전부 하나의 상자(컨테이너)에 담아서**
내 컴퓨터든, 서버든, 다른 사람 컴퓨터든 **똑같이 실행됨.**

### 비유
```
일반 배포 = 요리 재료만 보내고 "알아서 만들어" → 환경마다 결과가 다름
Docker    = 완성된 도시락을 보냄               → 어디서 열어도 같은 음식
```

### 우리 프로젝트의 Docker 상자 7개

```
상자 1: etf-ml-service         ← Python + LightGBM + FastAPI
상자 2: etf-trading-service    ← Python + KIS API + FastAPI
상자 3: etf-scraper-service    ← Python + Playwright + FastAPI
상자 4: etf-web-dashboard      ← Node.js + Next.js
상자 5: etf-trading-monitor    ← Node.js + Next.js
상자 6: etf-auto-monitoring    ← Node.js + Next.js
상자 7: etf-nginx              ← Nginx (웹 서버)
```

각 상자는 **독립적으로 실행**됨. ml-service가 죽어도 trading-service는 계속 돌아감.

### Docker 명령어

```bash
docker ps                          # 현재 돌아가는 상자(컨테이너) 목록
docker logs etf-trading-service    # 특정 상자의 로그 보기
docker restart etf-trading-service # 상자 재시작
docker stop etf-trading-service    # 상자 중지
docker build -t etf-trading-service ./trading-service  # 새 상자 만들기
```

---

## 3. 포트(Port)가 뭐고 왜 필요해?

### 한 줄 설명
**하나의 컴퓨터(서버)에서 여러 서비스를 동시에 돌리기 위한 "문 번호".**

### 비유
아파트에 비유하면:
```
아파트 주소 = 서버 IP (ahnbi2.suwon.ac.kr)
101호       = 포트 8000 (ML 서비스)
102호       = 포트 8001 (스크래퍼)
103호       = 포트 8002 (트레이딩)
104호       = 포트 3000 (웹 대시보드)
105호       = 포트 3002 (트레이딩 모니터)
```

같은 서버에 7개 서비스가 돌아가고 있으니, **포트 번호로 구분**하는 것.

### 우리 프로젝트 포트 배정

```
포트 80    → nginx (외부에서 접속하는 대문)
포트 8000  → ml-service (ML 예측)
포트 8001  → scraper-service (데이터 수집)
포트 8002  → trading-service (자동매매)
포트 3000  → web-dashboard (투자자 웹사이트)
포트 3002  → trading-monitor (모니터링 대시보드)
```

### 실제 요청 예시

```bash
curl http://localhost:8000/health    # ML 서비스한테 "살아있어?" 물어보기
curl http://localhost:8002/health    # 트레이딩 서비스한테 물어보기
```

`localhost` = 이 컴퓨터 자기 자신
`8000` = ML 서비스의 문 번호
`/health` = "살아있니?" 라는 질문

---

## 4. 라우팅(Routing)이 뭐야?

### 한 줄 설명
**"이 URL로 요청이 오면, 이 코드를 실행해라"라고 연결해주는 것.**

### 비유
전화 교환대:
```
내선 101번 → 영업부 연결
내선 102번 → 개발팀 연결
내선 103번 → 인사팀 연결
```

웹에서도 마찬가지:
```
/health         → health_check() 함수 실행
/api/trading/status    → get_status() 함수 실행
/api/trading/portfolio → get_portfolio() 함수 실행
```

### 실제 코드 (trading-service/app/routers/trading.py)

```python
router = APIRouter(prefix="/api/trading")

@router.get("/status")              # GET /api/trading/status → 이 함수
def get_status():
    return {"mode": "paper", "day": 15}

@router.get("/portfolio")           # GET /api/trading/portfolio → 이 함수
def get_portfolio():
    return {"holdings": [...]}

@router.post("/execute")            # POST /api/trading/execute → 이 함수
async def manual_execute():
    result = await execute_daily_trading()
    return result
```

### 라우팅이 포트를 가지는 이유

라우팅 자체가 포트를 갖는 게 아니라, **FastAPI 서버가 특정 포트에서 실행**되고
그 서버 안에서 라우팅이 URL을 분배하는 것:

```
포트 8002 (trading-service 서버)
  ├── /health            → 헬스체크
  ├── /api/trading/status    → 상태 조회
  ├── /api/trading/portfolio → 포트폴리오
  └── /api/trading/execute   → 매매 실행

포트 8000 (ml-service 서버)
  ├── /health            → 헬스체크
  └── /api/predictions/ranking → ML 예측
```

---

## 5. Nginx가 뭐고 왜 필요해?

### 한 줄 설명
**외부에서 들어오는 요청을 내부 서비스로 전달해주는 "안내 데스크".**

### 왜 필요해?

사용자가 `ahnbi2.suwon.ac.kr`에 접속할 때,
7개 서비스 중 어디로 보내야 하는지 누군가가 판단해야 함.

**Nginx 없이:**
```
사용자: ahnbi2.suwon.ac.kr:8000   ← ML 서비스
사용자: ahnbi2.suwon.ac.kr:8002   ← 트레이딩
사용자: ahnbi2.suwon.ac.kr:3000   ← 웹 대시보드
→ 사용자가 포트 번호를 외워야 함 (불편)
```

**Nginx 있으면:**
```
사용자: ahnbi2.suwon.ac.kr/            → 웹 대시보드 (3000)
사용자: ahnbi2.suwon.ac.kr/trading/    → 트레이딩 모니터 (3002)
사용자: ahnbi2.suwon.ac.kr/api/        → ML 서비스 (8000)
→ 사용자는 포트 번호 몰라도 됨
```

### 동작 방식

```
외부 사용자 (브라우저)
     │
     ▼
  Nginx (포트 80)
     │ URL을 보고 판단:
     ├── "/" 로 시작 → web-dashboard (포트 3000)으로 전달
     ├── "/trading/" → trading-monitor (포트 3002)으로 전달
     ├── "/monitor/" → auto-monitoring (포트 3000)으로 전달
     └── "/api/" → ml-service (포트 8000)으로 전달
```

이걸 **리버스 프록시(Reverse Proxy)**라고 부름.
설정 파일: `nginx/nginx.conf`

---

## 6. Docker 네트워크가 뭐야?

### 한 줄 설명
**Docker 컨테이너(상자)들끼리 서로 통신할 수 있게 해주는 가상 네트워크.**

### 왜 필요해?

Docker 컨테이너는 기본적으로 **서로 격리**되어 있음.
trading-service가 ml-service한테 "랭킹 줘"라고 하려면 서로 연결되어 있어야 함.

### 비유
```
Docker 네트워크 없이 = 각자 다른 건물에 있어서 전화번호를 모름
Docker 네트워크 있으면 = 같은 사무실 안에 있어서 이름만 부르면 됨
```

### 우리 프로젝트

모든 컨테이너가 `etf-trading-project_etf-network`라는 하나의 네트워크에 연결됨.

```python
# trading-service에서 ml-service를 호출할 때:
# localhost:8000 (X) → 다른 컨테이너는 localhost가 아님
# etf-ml-service:8000 (O) → 컨테이너 이름으로 호출

url = "http://etf-ml-service:8000/api/predictions/ranking"
response = await client.post(url)
```

**규칙: Docker 네트워크 안에서는 컨테이너 이름이 곧 주소**

```
http://etf-ml-service:8000        ← ML 서비스
http://etf-trading-service:8002   ← 트레이딩 서비스
http://etf-scraper-service:8001   ← 스크래퍼 서비스
```

---

## 7. GET이랑 POST가 뭔 차이야?

### 한 줄 설명
**GET = 데이터 가져오기 (읽기), POST = 데이터 보내기 (쓰기/실행)**

### 비유
```
GET  = 도서관에서 책 빌리기      → "이 책 좀 줘" (가져오기만)
POST = 도서관에 책 기증하기      → "이 책 받아줘" (뭔가를 보냄)
```

### 실제 사용

```
GET  /api/trading/status       → "현재 상태 알려줘" (데이터 조회)
GET  /api/trading/portfolio    → "보유 종목 보여줘" (데이터 조회)
GET  /health                   → "살아있어?" (상태 확인)

POST /api/trading/execute      → "매매 실행해!" (동작 실행)
POST /api/scraper/jobs/full    → "스크래핑 시작해!" (작업 시작)
POST /api/predictions/ranking  → "예측 돌려줘!" (계산 실행)
```

### 규칙
- **GET**: 서버 상태를 바꾸지 않음. 같은 요청 여러 번 해도 결과 같음.
- **POST**: 서버 상태를 바꿈. 매매 실행, 작업 시작 등.

### curl 명령어로 직접 해보기

```bash
# GET 요청 (데이터 조회)
curl http://localhost:8002/api/trading/status

# POST 요청 (매매 실행)
curl -X POST http://localhost:8002/api/trading/execute
```

---

## 8. 헬스체크(Health Check)가 뭐야?

### 한 줄 설명
**"이 서비스 살아있어?" 확인하는 것.** 심장박동 체크 같은 거.

### 왜 필요해?

7개 서비스 중 하나라도 죽으면 전체 파이프라인이 멈출 수 있음.
정기적으로 "너 살아있어?"라고 물어보고, 대답 없으면 문제가 있는 것.

### 실제 코드 (trading-service/app/routers/health.py)

```python
@router.get("/health")
def health_check():
    return {
        "status": "ok",           # 살아있음
        "trading_mode": "paper",  # 모의투자 모드
        "db": "ok",               # DB 연결 정상
        "timestamp": "2026-04-01T10:00:00"
    }
```

### 요청과 응답

```bash
# 요청
curl http://localhost:8002/health

# 응답 (정상)
{
  "status": "ok",
  "trading_mode": "paper",
  "db": "ok",
  "timestamp": "2026-04-01T10:00:00+09:00"
}

# 응답 없음 (서비스 죽음)
curl: (7) Failed to connect to localhost port 8002
```

### Docker 자체 헬스체크

Docker도 자동으로 헬스체크를 함 (30초마다):

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8002/health || exit 1
```

의미: 30초마다 /health를 호출해서 응답이 없으면 **unhealthy** 상태로 표시.
`docker ps`에서 `(healthy)` 또는 `(unhealthy)`로 확인 가능.

---

## 9. API로 원하는 결과를 어떻게 가져와?

### 전체 흐름

```
1. 사용자가 웹 브라우저에서 "예측 결과" 페이지 클릭
2. 프론트엔드(Next.js)가 백엔드(FastAPI)에 요청을 보냄
3. 백엔드가 DB에서 데이터를 가져오거나 계산을 실행함
4. 결과를 JSON 형태로 프론트엔드에 돌려줌
5. 프론트엔드가 받은 데이터를 화면에 그림
```

### 구체적 예시: ML 랭킹 예측

```
[프론트엔드: web-dashboard]
     │
     │ POST http://ml-service:8000/api/predictions/ranking
     │ Body: {"limit": 100}
     ▼
[백엔드: ml-service]
     │
     │ 1. etf2_db_processed에서 최신 피처 데이터 로드
     │ 2. LightGBM 모델에 입력
     │ 3. 101종목 점수 계산
     │ 4. 점수 순으로 정렬 → 랭킹
     ▼
[응답: JSON]
{
  "rankings": [
    {"rank": 1, "symbol": "NVDA", "score": 0.95, "direction": "BUY"},
    {"rank": 2, "symbol": "AAPL", "score": 0.91, "direction": "BUY"},
    {"rank": 3, "symbol": "MSFT", "score": 0.88, "direction": "BUY"},
    ...
  ]
}
     │
     ▼
[프론트엔드]
     → 테이블로 표시: 1위 NVDA, 2위 AAPL, 3위 MSFT...
```

### 구체적 예시: 포트폴리오 조회

```
[프론트엔드: trading-monitor]
     │
     │ GET http://trading-service:8002/api/trading/portfolio
     ▼
[백엔드: trading-service]
     │
     │ 1. SQLite(trading.db)에서 daily_purchases 테이블 조회
     │ 2. sold=False인 것만 필터 (아직 안 판 종목)
     │ 3. 종목별 수량, 가격 계산
     ▼
[응답: JSON]
{
  "holdings": [
    {"etf_code": "NVDA", "quantity": 1, "price": 850.00, "total_amount": 850.00},
    {"etf_code": "AAPL", "quantity": 2, "price": 178.50, "total_amount": 357.00},
    ...
  ],
  "total_invested": 3500.00,
  "total_count": 15
}
     │
     ▼
[프론트엔드]
     → 보유 종목 목록 표시
```

---

## 10. 오케스트레이터가 뭐야?

### 한 줄 설명
**여러 작업을 순서대로 실행하고 관리해주는 "지휘자".**

### 비유
```
오케스트라 지휘자:
  1. 바이올린 시작 → 2. 첼로 들어와 → 3. 트럼펫 → 4. 마무리

우리 오케스트레이터:
  1. 스크래핑 시작 → 2. 피처 처리 → 3. ML 예측 → 4. 매매
```

### 우리 프로젝트의 오케스트레이터

`run.py` (Python)와 `scripts/run-pipeline.sh` (Bash) 두 개가 있음.
둘 다 같은 일을 하는데 방식이 다름:

```
[run.py] — Python APScheduler
  매일 06:00에 자동으로:
  1. 스크래핑 API 호출 → 완료될 때까지 대기
  2. 피처 처리 API 호출 → 완료될 때까지 대기
  3. ML 예측 API 호출 → 결과 받기
  (매매는 trading-service가 별도로 22:30에 실행)

[run-pipeline.sh] — Bash 스크립트
  수동으로 실행하거나 cron이 실행:
  같은 순서로 API를 호출하고 상태를 폴링(반복 확인)
```

### 핵심 포인트

오케스트레이터는 **직접 스크래핑/예측/매매를 하지 않음.**
각 서비스에 "시작해"라고 API를 호출하고, "끝났어?"라고 반복 확인만 함.

```
오케스트레이터: "스크래핑 시작해" → POST /api/scraper/jobs/full
                30초 후: "끝났어?" → GET /api/scraper/jobs/status → "running"
                30초 후: "끝났어?" → GET /api/scraper/jobs/status → "running"
                30초 후: "끝났어?" → GET /api/scraper/jobs/status → "completed"
                "다음 단계!"
```

이 "끝났어?" 반복 확인을 **폴링(Polling)**이라고 부름.

---

## 11. 자동화는 Cron 기반이야?

### 정답: 둘 다 쓸 수 있음

**현재 서버에서는 2가지가 동시에 돌아감:**

```
1. trading-service 내부 APScheduler
   → 매일 22:30 KST에 매매 자동 실행
   → Docker 컨테이너가 살아있으면 항상 동작
   → 설정: trading-service/app/main.py

2. Cron (선택사항)
   → 매일 07:00에 파이프라인 실행
   → scripts/setup-cron.sh로 설정
   → 서버의 cron 데몬이 관리
```

### Cron이 뭐야?

리눅스의 **예약 실행 도구.** "매일 7시에 이 명령어 실행해"를 설정.

```bash
# crontab 형식: 분 시 일 월 요일 명령어
0 7 * * 1-5 /path/scripts/run-pipeline.sh

# 해석:
# 0분 7시 매일(*) 매월(*) 월~금(1-5) 에 run-pipeline.sh 실행
```

### APScheduler가 뭐야?

Python 라이브러리. 코드 안에서 "몇 시에 이 함수 실행"을 설정.

```python
# trading-service/app/main.py
scheduler.add_job(
    execute_daily_trading,           # 이 함수를
    CronTrigger(hour=22, minute=30), # 매일 22:30에 실행
)
```

### 차이점

```ㄴㄴ
Cron:
  - 서버 OS가 관리 (Docker 밖)
  - 컨테이너가 죽어도 설정은 남아있음
  - 설정: crontab -e

APScheduler:
  - Python 코드 안에서 관리 (Docker 안)
  - 컨테이너가 죽으면 같이 죽음
  - 컨테이너 재시작하면 자동 복구
  - 설정: main.py 코드
```

---

## 12. Docker 재시작하면 자동화에 어떤 영향?

### 서비스별 영향

```
docker restart etf-trading-service
→ APScheduler가 재시작됨
→ 다음 22:30 매매는 정상 실행
→ 현재 실행 중인 매매가 있었다면 중단됨
→ trading.db 데이터는 유지됨 (볼륨 마운트)

docker restart etf-scraper-service
→ 진행 중인 스크래핑이 있었다면 중단됨
→ 이미 수집된 데이터는 MySQL에 저장되어 있어서 안 날아감
→ 다음 파이프라인에서 처음부터 다시 수집

docker restart etf-ml-service
→ 진행 중인 예측이 있었다면 중단됨
→ 모델 파일은 유지됨 (볼륨 마운트)
→ 다음 요청 시 정상 응답
```

### 중요: 볼륨 마운트

```yaml
# docker-compose.yml
volumes:
  - ./trading-service/data:/app/data    # 호스트 ↔ 컨테이너 폴더 연결
```

이 설정 덕분에 컨테이너를 삭제하고 다시 만들어도 **데이터는 보존됨.**
`trading.db`, `predictions.db`, 모델 파일 등은 호스트(서버)에 저장되어 있음.

### 전체 재시작 시나리오

```
상황: 서버가 재부팅됨

1. Docker 자동 시작 (restart: unless-stopped 설정)
2. 7개 컨테이너 자동 시작
3. trading-service의 APScheduler 자동 시작 → 22:30 매매 예약
4. Cron도 자동 복구 → 07:00 파이프라인 예약
5. 데이터 전부 보존 (볼륨 마운트)

결론: 서버 재부팅해도 자동으로 복구됨
```

---

## 13. Git은 어떻게 관리해?

### Git이 뭐야?

**코드 버전 관리 도구.** 누가 언제 뭘 바꿨는지 기록하고, 여러 사람이 동시에 작업할 수 있게 해줌.

### 핵심 개념

```
Repository (저장소) = 프로젝트 전체 폴더
Branch (브랜치)    = 작업 공간 (원본을 건드리지 않고 따로 작업)
Commit (커밋)      = 저장 포인트 ("여기까지 완료")
Push (푸시)        = 내 작업을 GitHub에 올리기
Pull (풀)          = GitHub에서 최신 코드 가져오기
PR (Pull Request)  = "내 작업 검토해주세요" 요청
Merge (머지)       = 검토 후 원본에 합치기
```

### 우리 브랜치 구조

```
main (안정 버전 — 서버에서 실행되는 코드)
  │
  └── develop (개발 통합 — 모든 PR이 여기로)
        │
        ├── feat/community-init    (양진우의 작업 공간)
        ├── feat/monte-carlo       (임대윤의 작업 공간)
        ├── feat/shap-explain      (최인훈의 작업 공간)
        └── fix/scraper-bugfix     (박성문의 작업 공간)
```

### 매일 하는 Git 작업 흐름

```bash
# 1. 아침에 최신 코드 가져오기
git checkout develop
git pull origin develop

# 2. 내 작업 브랜치로 이동 (처음이면 생성)
git checkout -b feat/community-init    # 처음 만들 때
git checkout feat/community-init       # 이미 있으면

# 3. 코드 작업...

# 4. 변경 사항 확인
git status                     # 뭐가 바뀌었는지 확인
git diff                       # 바뀐 내용 상세 보기

# 5. 커밋 (저장)
git add community-service/app/routers/posts.py   # 변경 파일 선택
git commit -m "feat: 게시판 CRUD API 구현"       # 메시지와 함께 저장

# 6. GitHub에 올리기
git push origin feat/community-init

# 7. GitHub 웹에서 PR 생성
#    base: develop ← compare: feat/community-init
#    PM(주진호)이 리뷰 후 머지
```

### 커밋 메시지 규칙

```
feat: 새 기능 추가        예) feat: 게시판 CRUD API 구현
fix: 버그 수정            예) fix: 로그인 토큰 만료 오류 수정
docs: 문서 변경           예) docs: API 사용법 추가
refactor: 코드 정리       예) refactor: 중복 코드 함수로 분리
```

### 충돌(Conflict)이 발생하면?

두 사람이 같은 파일의 같은 부분을 수정하면 충돌 발생.

```bash
git pull origin develop
# CONFLICT (content): Merge conflict in app/main.py

# 파일을 열면 이렇게 보임:
<<<<<<< HEAD
내가 수정한 코드
=======
다른 사람이 수정한 코드
>>>>>>> develop

# 둘 중 하나를 선택하거나 합쳐서 수정한 뒤:
git add app/main.py
git commit -m "fix: merge conflict 해결"
```

**어렵면 양진우(DevOps)나 PM(주진호)에게 도움 요청.**

### 절대 하지 말 것

```
git push --force              ← 다른 사람 코드 날아감
git push origin main          ← main은 PM만 관리
git checkout . 또는 git reset --hard   ← 내 변경사항 전부 삭제
```

---

## 요약: 전체 시스템 한눈에

```
[외부 사용자]
     │ ahnbi2.suwon.ac.kr 접속
     ▼
[Nginx] (포트 80, 리버스 프록시)
     │ URL 보고 판단
     ├── / → [web-dashboard] (Next.js, 포트 3000)
     ├── /trading/ → [trading-monitor] (Next.js, 포트 3002)
     └── /api/ → [ml-service] (FastAPI, 포트 8000)

[자동화]
     │
     ├── [Cron] 매일 07:00 → run-pipeline.sh 실행
     │     ├── POST /api/scraper/jobs/full (스크래핑 시작)
     │     ├── POST /api/scraper/features/process (피처 처리)
     │     └── POST /api/predictions/ranking (ML 예측)
     │
     └── [APScheduler] 매일 22:30 → execute_daily_trading() 실행
           ├── KIS API로 FIFO 매도
           ├── ML 랭킹 조회
           └── KIS API로 지정가 매수

[데이터 흐름]
     TradingView → scraper-service → MySQL(etf2_db)
                                         ↓
                                    피처 처리 (85개)
                                         ↓
                                    etf2_db_processed
                                         ↓
                                    ml-service (LightGBM)
                                         ↓
                                    predictions.db (랭킹 결과)
                                         ↓
                                    trading-service (KIS 주문)
                                         ↓
                                    trading.db (주문 기록)
```
