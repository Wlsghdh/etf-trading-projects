# 양진우 - Docker/Git 관리 + 커뮤니티 백엔드

## 담당자
- **이름**: 양진우
- **역할**: DevOps + 백엔드 개발 (PM 보조)

---

## 담당 기능

| # | 기능 | 설명 |
|---|------|------|
| - | Docker/인프라 관리 | PM과 함께 Docker, 서버, 배포 관리 |
| - | Git 관리 | 브랜치 관리, 충돌 해결 지원, CI/CD |
| 6 | 커뮤니티 백엔드 | AI 활용 전략 공유 커뮤니티 서비스 |
| 5 | 매매 복기 API | 매매 패턴 분석 + AI 복기 로직 (백엔드) |

---

## 담당 브랜치

```
feat/community-platform      # 커뮤니티 서비스 개발
feat/infra-improvement       # 인프라 개선 (Docker, CI/CD)
```

---

## 담당 파일/폴더 (이 파일만 수정)

```
# Docker/인프라 (PM과 협업 - PM 승인 후 수정)
docker-compose.yml                                 # PM과 공동 관리
nginx/                                             # 리버스 프록시 설정
scripts/                                           # 배포 스크립트

# 커뮤니티 서비스 (신규 Docker 컨테이너 - 단독 관리)
community-service/                                 # 신규 서비스 전체
├── Dockerfile
├── requirements.txt
├── app/
│   ├── main.py                                   # FastAPI 진입점
│   ├── database.py                               # DB 연결
│   ├── models/
│   │   ├── user.py                               # 사용자 모델
│   │   ├── post.py                               # 게시글 모델
│   │   ├── comment.py                            # 댓글 모델
│   │   └── strategy.py                           # 전략 모델
│   ├── routers/
│   │   ├── auth.py                               # 인증 (OAuth)
│   │   ├── posts.py                              # 게시판 CRUD
│   │   ├── comments.py                           # 댓글
│   │   ├── strategies.py                         # 전략 공유
│   │   └── users.py                              # 프로필
│   └── services/
│       ├── auth_service.py                       # 인증 로직
│       ├── post_service.py                       # 게시글 로직
│       └── strategy_service.py                   # 전략 로직
```

> **주의**: `docker-compose.yml`, `nginx/` 등 인프라 파일은 **PM 승인 후** 수정.
> 커뮤니티 서비스(`community-service/`)는 단독 관리 가능.

---

## DevOps 업무 상세

### 1. Docker 관리 (PM 보조)

| 업무 | 설명 |
|------|------|
| 컨테이너 모니터링 | 7개 컨테이너 상태 확인, 장애 대응 |
| 새 서비스 추가 | community-service 컨테이너 추가 |
| 볼륨/네트워크 관리 | 데이터 영속성, 서비스 간 통신 |
| 로그 관리 | Docker 로그 수집, 에러 추적 |

현재 Docker 컨테이너:
```
1. scraper-service   (데이터 수집)
2. ml-service        (ML 예측)
3. trading-service   (자동 매매)
4. trading-monitor   (모니터링 대시보드)
5. web-dashboard     (웹 대시보드)
6. auto-monitoring   (스크래핑 모니터)
7. nginx             (리버스 프록시)
8. community-service (신규 - 커뮤니티)   ← 양진우가 추가
```

### 2. Git 관리

| 업무 | 설명 |
|------|------|
| 팀원 브랜치 관리 | 브랜치 생성 도움, 충돌 해결 지원 |
| PR 사전 검토 | PM 리뷰 전 빌드/테스트 확인 |
| CI/CD 구축 | GitHub Actions 자동 빌드/테스트 (선택) |
| develop 관리 | develop 브랜치 안정성 유지 |

### 3. 서버 관리 (PM 보조)

| 업무 | 설명 |
|------|------|
| 배포 | develop → main 배포 보조 |
| SSH 터널 | MySQL 터널 모니터링 |
| 서버 모니터링 | 디스크, 메모리, CPU 확인 |
| 백업 | DB 백업, 모델 파일 백업 |

---

## 커뮤니티 서비스 상세

### 인증 시스템

| 방식 | 설명 |
|------|------|
| OAuth 2.0 | Google, Kakao 소셜 로그인 |
| JWT | 토큰 기반 인증 |
| 권한 | 일반 사용자, 인증 투자자, 관리자 |

### API 엔드포인트

```
# 인증
POST   /api/auth/login              # 소셜 로그인
POST   /api/auth/refresh            # 토큰 갱신
POST   /api/auth/logout             # 로그아웃

# 게시판
POST   /api/posts                   # 게시글 작성
GET    /api/posts                   # 목록 조회 (페이징, 정렬)
GET    /api/posts/{id}              # 상세 조회
PUT    /api/posts/{id}              # 수정
DELETE /api/posts/{id}              # 삭제
POST   /api/posts/{id}/like         # 좋아요
POST   /api/posts/{id}/bookmark     # 북마크

# 댓글
POST   /api/posts/{id}/comments     # 댓글 작성
GET    /api/posts/{id}/comments     # 댓글 목록
POST   /api/comments/{id}/replies   # 대댓글
DELETE /api/comments/{id}           # 삭제

# 전략 공유
POST   /api/strategies                    # 전략 공유
GET    /api/strategies                    # 전략 목록
GET    /api/strategies/{id}               # 전략 상세
GET    /api/strategies/{id}/performance   # 전략 성과
POST   /api/strategies/{id}/follow        # 전략 팔로우

# 사용자
GET    /api/users/{id}              # 프로필 조회
PUT    /api/users/{id}              # 프로필 수정
GET    /api/users/{id}/strategies   # 내 전략 목록

# 매매 복기 API
GET    /api/review/patterns/{user_id}       # 매매 패턴 분석
GET    /api/review/report/{user_id}/monthly # 월간 리포트
POST   /api/review/chat                     # AI 복기 대화
```

### DB 스키마

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    nickname VARCHAR(50),
    provider VARCHAR(20),
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(200),
    content TEXT,
    category VARCHAR(50),
    likes_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE comments (
    id INTEGER PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id),
    user_id INTEGER REFERENCES users(id),
    parent_id INTEGER REFERENCES comments(id),
    content TEXT,
    created_at TIMESTAMP
);

CREATE TABLE strategies (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(200),
    description TEXT,
    backtest_result JSON,
    return_rate FLOAT,
    followers_count INTEGER DEFAULT 0,
    created_at TIMESTAMP
);
```

---

## 기술 스택

| 기술 | 용도 |
|------|------|
| Docker / Docker Compose | 컨테이너 관리 |
| Nginx | 리버스 프록시 |
| GitHub Actions (선택) | CI/CD |
| Python + FastAPI | 커뮤니티 백엔드 |
| SQLite 또는 PostgreSQL | 커뮤니티 DB |
| OAuth 2.0 + JWT | 인증 |
| SQLAlchemy | ORM |
| LLM API | AI 복기 대화 |

---

## Sprint별 작업 계획

### Sprint 1 (Week 1-2)
- [ ] Docker 환경 점검 + 신규 컨테이너(community-service) 추가
- [ ] GitHub Actions 기본 CI 설정 (빌드 확인)
- [ ] community-service 프로젝트 초기 구조 생성
- [ ] DB 스키마 설계 + 마이그레이션
- [ ] OAuth 인증 (Google 우선)

### Sprint 2 (Week 3-4)
- [ ] 게시판 CRUD API
- [ ] 댓글/대댓글 API
- [ ] 전략 공유 API
- [ ] 매매 패턴 분석 API

### Sprint 3 (Week 5-6)
- [ ] AI 복기 대화 API (LLM 연동)
- [ ] 좋아요, 북마크, 팔로우
- [ ] 페이징, 정렬, 검색
- [ ] 통합 테스트

### Sprint 4 (Week 7-8)
- [ ] 버그 수정 + 성능 최적화
- [ ] 배포 자동화
- [ ] API 문서화 (Swagger)

---

## Git 작업 흐름 (매일)

```bash
# 커뮤니티 개발
git checkout feat/community-platform
git pull origin develop
# 작업 후
git add community-service/app/routers/posts.py
git commit -m "feat: 게시판 CRUD API 구현"
git push origin feat/community-platform

# 인프라 개선 (PM 승인 후)
git checkout feat/infra-improvement
git pull origin develop
# 작업 후
git add docker-compose.yml
git commit -m "feat: community-service 컨테이너 추가"
git push origin feat/infra-improvement

# GitHub 웹에서 PR 생성 (base: develop)
```

---

## PM과 협업 포인트

| 항목 | PM | 양진우 |
|------|-----|--------|
| docker-compose.yml | 최종 승인 | 수정 제안 + PR |
| 서버 배포 | 최종 실행 | 배포 스크립트 작성 |
| PR 리뷰 | 최종 머지 | 사전 검토 (빌드/테스트) |
| 팀원 Git 지원 | - | 충돌 해결, 브랜치 관리 도움 |
