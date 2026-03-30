---
name: verify-scraper-service
description: scraper-service/ 하위 파일(DB 서비스, 피처 파이프라인, API 엔드포인트, 스크래퍼)을 변경한 후 이 스킬을 실행하여 구조 일관성을 검증하라. PR 전 scraper-service 관련 변경사항 검증 시에도 반드시 사용하라.
disable-model-invocation: true
---

# Scraper Service 구조 검증

## Purpose

scraper-service의 핵심 구성요소가 올바르게 연결되어 있는지 검증합니다:

1. **DB 서비스 일관성** — db_service, processed_db_service가 올바르게 구성되어 있는지
2. **피처 파이프라인 구조** — AhnLab 피처 모듈(technical, engineered, cross_sectional, target)이 파이프라인에 연결되어 있는지
3. **API 엔드포인트** — FastAPI 라우터가 올바르게 등록되고 작동하는지
4. **스크래퍼 서비스** — TradingView 스크래퍼와 yfinance 서비스가 올바르게 구성되어 있는지
5. **설정 일관성** — config.py와 Docker/환경변수가 동기화되어 있는지

## When to Run

- scraper-service의 서비스, 라우터, 피처 파이프라인 파일을 변경한 후
- DB 서비스 또는 스크래퍼 로직을 수정한 후
- 피처 계산 모듈을 추가/변경한 후
- PR 전 scraper-service 관련 변경사항 검증 시

## Related Files

| File | Purpose |
|------|---------|
| `scraper-service/app/main.py` | FastAPI 진입점, 라우터 등록 |
| `scraper-service/app/config.py` | 앱 설정 |
| `scraper-service/app/routers/jobs.py` | 스크래핑 작업 API |
| `scraper-service/app/routers/health.py` | 헬스체크 라우터 |
| `scraper-service/app/services/db_service.py` | MySQL DB 서비스 (etf2_db) |
| `scraper-service/app/services/processed_db_service.py` | 전처리 DB 서비스 (etf2_db_processed) |
| `scraper-service/app/services/scraper.py` | TradingView 스크래퍼 |
| `scraper-service/app/services/yfinance_service.py` | yfinance 데이터 서비스 |
| `scraper-service/app/services/db_log_handler.py` | DB 로그 핸들러 |
| `scraper-service/app/features/pipeline.py` | 피처 파이프라인 오케스트레이터 |
| `scraper-service/app/features/ahnlab/constants.py` | AhnLab 피처 상수 정의 |
| `scraper-service/app/features/ahnlab/technical.py` | 기술 지표 피처 |
| `scraper-service/app/features/ahnlab/engineered.py` | 엔지니어링 피처 |
| `scraper-service/app/features/ahnlab/cross_sectional.py` | 횡단면 피처 (Z-score, Rank) |
| `scraper-service/app/features/ahnlab/target.py` | 타겟 변수 계산 |
| `scraper-service/app/features/data_providers/base.py` | 데이터 프로바이더 베이스 클래스 |
| `scraper-service/app/features/data_providers/mysql_provider.py` | MySQL 데이터 프로바이더 |
| `scraper-service/app/features/data_providers/yfinance_provider.py` | yfinance 데이터 프로바이더 |
| `scraper-service/Dockerfile` | Docker 빌드 설정 |
| `scraper-service/pyproject.toml` | 프로젝트 의존성 |

## Workflow

### Step 1: FastAPI 앱 구조 확인

**파일:** `scraper-service/app/main.py`

**검사 1a:** 라우터 등록이 올바른지 확인합니다.

```bash
grep -n "include_router\|router" scraper-service/app/main.py
```

**검사 1b:** 헬스체크 라우터가 등록되어 있는지 확인합니다.

```bash
grep -n "health" scraper-service/app/main.py
```

**PASS:** jobs, health 라우터가 모두 등록됨
**FAIL:** 라우터 등록 누락

### Step 2: DB 서비스 구조 확인

**파일:** `scraper-service/app/services/db_service.py`

**검사 2a:** DB 서비스가 MySQL 연결을 올바르게 설정하는지 확인합니다.

```bash
grep -n "class.*Service\|def.*upload\|def.*get\|engine\|create_engine" scraper-service/app/services/db_service.py
```

**파일:** `scraper-service/app/services/processed_db_service.py`

**검사 2b:** processed DB 서비스가 etf2_db_processed에 연결하는지 확인합니다.

```bash
grep -n "processed\|etf2_db_processed\|class.*Service" scraper-service/app/services/processed_db_service.py
```

**PASS:** 두 DB 서비스가 각각 올바른 DB에 연결
**FAIL:** DB URL 누락 또는 잘못된 DB 참조

### Step 3: 피처 파이프라인 모듈 연결 확인

**파일:** `scraper-service/app/features/pipeline.py`

**검사 3a:** 파이프라인이 모든 AhnLab 피처 모듈을 임포트하는지 확인합니다.

```bash
grep -n "from.*ahnlab\|import.*technical\|import.*engineered\|import.*cross_sectional\|import.*target" scraper-service/app/features/pipeline.py
```

**PASS:** technical, engineered, cross_sectional, target 모듈이 모두 임포트됨
**FAIL:** 누락된 피처 모듈이 있음

**검사 3b:** 데이터 프로바이더가 연결되어 있는지 확인합니다.

```bash
grep -n "from.*data_providers\|import.*provider\|Provider" scraper-service/app/features/pipeline.py
```

**PASS:** 최소 하나의 데이터 프로바이더가 임포트됨
**FAIL:** 데이터 프로바이더 연결 없음

### Step 4: AhnLab 피처 상수 확인

**파일:** `scraper-service/app/features/ahnlab/constants.py`

**검사:** 피처 상수 파일에 주요 피처 그룹이 정의되어 있는지 확인합니다.

```bash
grep -n "BASE_FEATURE_COLS\|ENGINEERED_FEATURE_COLS\|ZS_FEATURE_COLS\|RANK_FEATURE_COLS\|ALL_FEATURE_COLS" scraper-service/app/features/ahnlab/constants.py
```

**PASS:** 최소 ALL_FEATURE_COLS가 정의됨
**FAIL:** 피처 상수 누락

### Step 5: AhnLab 피처 모듈 존재 확인

**검사:** 각 피처 모듈 파일이 존재하고 주요 함수/클래스가 정의되어 있는지 확인합니다.

```bash
grep -rn "def.*features\|def.*compute\|def.*calculate\|class.*Feature" scraper-service/app/features/ahnlab/technical.py scraper-service/app/features/ahnlab/engineered.py scraper-service/app/features/ahnlab/cross_sectional.py scraper-service/app/features/ahnlab/target.py
```

**PASS:** 각 모듈에 피처 계산 함수/클래스가 존재
**FAIL:** 빈 모듈이거나 피처 함수 없음

### Step 6: 스크래퍼/yfinance 서비스 확인

**파일:** `scraper-service/app/services/scraper.py`

**검사 6a:** 스크래퍼에 주요 메서드가 있는지 확인합니다.

```bash
grep -n "def.*scrape\|def.*download\|class.*Scraper" scraper-service/app/services/scraper.py
```

**파일:** `scraper-service/app/services/yfinance_service.py`

**검사 6b:** yfinance 서비스가 존재하고 데이터 조회 기능이 있는지 확인합니다.

```bash
grep -n "def.*fetch\|def.*get\|def.*download\|class.*Service\|yfinance\|yf" scraper-service/app/services/yfinance_service.py
```

**PASS:** 스크래퍼와 yfinance 서비스에 핵심 메서드 존재
**FAIL:** 핵심 메서드 누락

### Step 7: jobs 라우터 엔드포인트 확인

**파일:** `scraper-service/app/routers/jobs.py`

**검사:** 스크래핑 작업 관련 엔드포인트가 정의되어 있는지 확인합니다.

```bash
grep -n "@router\.\(get\|post\|put\|delete\)" scraper-service/app/routers/jobs.py
```

**PASS:** 최소 1개 이상의 엔드포인트 정의됨
**FAIL:** 엔드포인트 없음

### Step 8: Dockerfile 및 의존성 확인

**파일:** `scraper-service/Dockerfile`

**검사 8a:** Dockerfile이 존재하고 Python 앱을 올바르게 실행하는지 확인합니다.

```bash
grep -n "FROM\|COPY\|RUN\|CMD\|ENTRYPOINT" scraper-service/Dockerfile
```

**파일:** `scraper-service/pyproject.toml`

**검사 8b:** pyproject.toml에 핵심 의존성이 정의되어 있는지 확인합니다.

```bash
grep -n "fastapi\|sqlalchemy\|playwright\|yfinance\|pandas" scraper-service/pyproject.toml
```

**PASS:** Dockerfile과 의존성 파일이 올바르게 구성됨
**FAIL:** 핵심 의존성 누락 또는 Dockerfile 구성 오류

### Step 9: 데이터 프로바이더 구조 확인

**파일:** `scraper-service/app/features/data_providers/base.py`

**검사:** 데이터 프로바이더 베이스 클래스가 올바르게 정의되어 있는지 확인합니다.

```bash
grep -n "class.*Provider\|class.*Base\|def.*get_data\|def.*fetch" scraper-service/app/features/data_providers/base.py scraper-service/app/features/data_providers/mysql_provider.py scraper-service/app/features/data_providers/yfinance_provider.py
```

**PASS:** 베이스 클래스와 최소 1개 구현체가 존재
**FAIL:** 베이스 클래스 누락 또는 구현체 없음

## Output Format

```markdown
## Scraper Service 검증 결과

| # | 검사 항목 | 상태 | 상세 |
|---|----------|------|------|
| 1 | FastAPI 앱 구조 | PASS/FAIL | ... |
| 2 | DB 서비스 구조 | PASS/FAIL | ... |
| 3 | 피처 파이프라인 연결 | PASS/FAIL | ... |
| 4 | AhnLab 피처 상수 | PASS/FAIL | ... |
| 5 | 피처 모듈 존재 | PASS/FAIL | ... |
| 6 | 스크래퍼/yfinance 서비스 | PASS/FAIL | ... |
| 7 | jobs 라우터 엔드포인트 | PASS/FAIL | ... |
| 8 | Dockerfile/의존성 | PASS/FAIL | ... |
| 9 | 데이터 프로바이더 | PASS/FAIL | ... |
```

## Exceptions

다음은 **위반이 아닙니다**:

1. **Playwright 브라우저 미설치** — Docker 빌드 시 Playwright 브라우저가 설치되지만, 로컬 개발 환경에서는 수동 설치가 필요할 수 있음. `playwright install` 미실행 상태는 정상
2. **scraper-service/scripts/ 디렉토리** — 호스트 전용 스크립트(db_service_host.py, tradingview_playwright_scraper_upload.py)는 Docker 컨테이너 내부 코드와 별개이므로 import 불일치 허용
3. **빈 __init__.py 파일** — 패키지 구조용 빈 초기화 파일은 의도된 것
4. **macro.py 존재** — 매크로 경제 피처 모듈이 파이프라인에 연결되지 않아도 향후 확장용으로 존재 가능
