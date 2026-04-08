# 양진우용 Claude 프롬프트 예시 — 커뮤니티 서비스 생성

> 아래 프롬프트를 Claude Code에 **그대로 복붙**해서 사용하면 됩니다.
> 프로젝트 루트(`/home/jjh0709/git/etf-trading-project`)에서 실행하세요.

---

## 프롬프트 (복붙용)

```
커뮤니티 서비스(community-service)를 새로 만들어줘.
우리 프로젝트의 기존 서비스 구조를 그대로 따라야 해.

## 1. 프로젝트 컨텍스트

이 프로젝트는 ETF 자동매매 시스템이야. 현재 아래 서비스들이 Docker Compose로 돌아가고 있어:
- ml-service (FastAPI, 포트 8000) — ML 예측
- scraper-service (FastAPI, 포트 8001) — 데이터 스크래핑
- trading-service (FastAPI, 포트 8002) — 자동매매
- web-dashboard (Next.js, 포트 3000) — 투자자 대시보드
- trading-monitor (Next.js, 포트 3002) — 트레이딩 모니터
- auto-monitoring (Next.js, 포트 3000) — 스크래핑 모니터링
- nginx (포트 80) — 리버스 프록시

## 2. 커뮤니티 서비스 요구사항

### 기본 정보
- 경로: `community-service/` (프로젝트 루트 아래)
- 프레임워크: FastAPI (Python)
- 포트: 8003
- 컨테이너 이름: etf-community-service
- DB: SQLite (`community-service/data/community.db`)

### 기능 (CRUD)
1. **게시판 (Posts)**
   - 글 목록 조회 (GET /api/community/posts) — 페이지네이션
   - 글 상세 조회 (GET /api/community/posts/{post_id})
   - 글 작성 (POST /api/community/posts)
   - 글 수정 (PUT /api/community/posts/{post_id})
   - 글 삭제 (DELETE /api/community/posts/{post_id})

2. **댓글 (Comments)**
   - 댓글 목록 (GET /api/community/posts/{post_id}/comments)
   - 댓글 작성 (POST /api/community/posts/{post_id}/comments)
   - 댓글 삭제 (DELETE /api/community/comments/{comment_id})

3. **카테고리**
   - 자유게시판, 종목토론, 전략공유, 공지사항

### API 라우터 구조
```
community-service/app/routers/
├── health.py          # GET /health
├── posts.py           # 게시글 CRUD
└── comments.py        # 댓글 CRUD
```

## 3. 디렉토리 구조 (기존 trading-service 참고)

기존 `trading-service/`의 구조를 그대로 따라서 만들어줘:

```
community-service/
├── Dockerfile              # Python 3.12-slim, poetry, uvicorn
├── pyproject.toml          # 의존성: fastapi, uvicorn, sqlalchemy, pydantic
├── app/
│   ├── __init__.py
│   ├── main.py             # FastAPI 앱, CORS, 라우터 등록
│   ├── config.py           # 설정 (DB 경로, 포트 등)
│   ├── database.py         # SQLAlchemy 엔진, 세션, init_db()
│   ├── models.py           # SQLAlchemy 모델 (Post, Comment)
│   ├── schemas.py          # Pydantic 스키마
│   └── routers/
│       ├── __init__.py
│       ├── health.py
│       ├── posts.py
│       └── comments.py
└── data/                   # SQLite DB 저장 (볼륨 마운트)
```

## 4. Dockerfile (기존 trading-service 참고)

`trading-service/Dockerfile`을 참고해서 만들어줘:
- 베이스: `python:3.12-slim`
- 패키지 관리: poetry
- timezone: Asia/Seoul
- EXPOSE: 8003
- HEALTHCHECK: `curl -f http://localhost:8003/health || exit 1`
- CMD: `uvicorn app.main:app --host 0.0.0.0 --port 8003`

## 5. docker-compose.yml 수정

현재 `docker-compose.yml`에 community-service를 추가해줘:

```yaml
  community-service:
    build:
      context: ./community-service
      dockerfile: Dockerfile
    container_name: etf-community-service
    expose:
      - "8003"
    environment:
      - TZ=Asia/Seoul
    volumes:
      - ./community-service/data:/app/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8003/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    networks:
      - etf-network
```

## 6. nginx/nginx.conf 수정

nginx.conf에 커뮤니티 라우팅을 추가해줘:

```nginx
    upstream community-service {
        server community-service:8003;
    }

    # 기존 server 블록 안에 추가:
    location /api/community/ {
        proxy_pass http://community-service/api/community/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

주의: `/api/community/` 라우트는 기존 `/api/` (ml-service) 보다 **위에** 선언해야 해.

## 7. 참고할 기존 파일 경로

구조/패턴 참고용으로 이 파일들을 읽어봐:
- `trading-service/Dockerfile` — Dockerfile 패턴
- `trading-service/app/main.py` — FastAPI 앱 설정, CORS, lifespan
- `trading-service/app/config.py` — pydantic-settings 설정
- `trading-service/app/database.py` — SQLAlchemy 설정
- `trading-service/app/models.py` — SQLAlchemy 모델 예시
- `trading-service/app/schemas.py` — Pydantic 스키마 예시
- `trading-service/app/routers/health.py` — 헬스체크 패턴
- `trading-service/app/routers/trading.py` — CRUD 라우터 패턴
- `docker-compose.yml` — Docker 서비스 정의
- `nginx/nginx.conf` — 리버스 프록시 설정

## 8. 주의사항

- 기존 파일 절대 삭제하지 마
- `docker-compose.yml`은 community-service 블록만 추가해
- `nginx/nginx.conf`는 community upstream + location만 추가해
- main 브랜치에 직접 커밋하지 마. `feat/community-init` 브랜치에서 작업해
- .env 파일이나 비밀번호를 코드에 하드코딩하지 마
- 다 만들고 `docker compose build community-service`로 빌드 테스트해줘
```

---

## 사용 방법

1. 터미널에서 프로젝트 루트로 이동
   ```bash
   cd ~/git/etf-trading-project
   ```

2. 브랜치 생성
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/community-init
   ```

3. Claude Code 실행 후 위 프롬프트를 붙여넣기

4. 완료 후 확인
   ```bash
   docker compose build community-service
   docker compose up -d community-service
   curl http://localhost:8003/health
   ```

5. 커밋 & 푸시
   ```bash
   git add community-service/ docker-compose.yml nginx/nginx.conf
   git commit -m "feat: 커뮤니티 서비스 초기 구현 (게시판 CRUD)"
   git push origin feat/community-init
   ```

6. GitHub에서 PR 생성 (base: develop)
