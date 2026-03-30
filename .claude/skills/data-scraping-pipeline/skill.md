---
name: data-scraping-pipeline
description: |
  사용자가 TradingView 스크래퍼 실행 방법, 데이터 파이프라인 아키텍처, DB 업로드
  설정/디버깅, 스크래핑 자동화 확장에 대해 질문하면 이 스킬을 호출하라.
  스크래퍼 관련 코드를 수정하거나 디버깅할 때도 이 스킬의 구조 정보를 참조하라.
  Triggers: TradingView scraper, data scraping, 주가 데이터, CSV 다운로드, DB 업로드,
  SSH tunnel, 자동화 파이프라인, Playwright, cron, scrape-daily.
---

# Data Scraping Pipeline

TradingView에서 주가 데이터를 자동으로 수집하여 MySQL 데이터베이스에 업로드하는 파이프라인.

## 아키텍처 개요

```
[TradingView] ──Playwright──▶ [CSV 다운로드] ──db_service──▶ [MySQL DB]
                                   │                            │
                                   ▼                            ▼
                            downloads/                    etf2_db (원격)
                            - NVDA_D.csv                  - NVDA_D 테이블
                            - AAPL_1h.csv                 - AAPL_1h 테이블
```

## 핵심 파일 구조

```
scraper-service/
├── tradingview_playwright_scraper_upload.py  # 메인 스크래퍼 (최종 버전)
├── db_service.py                              # DB 연결 및 업로드 서비스
├── cookies.json                               # TradingView 로그인 쿠키
├── pyproject.toml                             # Poetry 의존성
├── poetry.lock                                # 의존성 잠금 파일
├── downloads/                                 # CSV 다운로드 폴더
└── tradingview_data/                          # 데이터 저장 폴더
```

## 실행 가이드

### 1. 환경 설정

```bash
cd /Users/jeong-uchang/etf-trading-project/scraper-service

# 의존성 설치
poetry install
playwright install chromium

# 환경변수 설정 (.env 파일)
TRADINGVIEW_USERNAME=your_username
TRADINGVIEW_PASSWORD=your_password
UPLOAD_TO_DB=true
USE_EXISTING_TUNNEL=true
HEADLESS=true                     # 기본값: true (쿠키 없으면 자동으로 false 전환)
```

### 2. SSH 터널 (DB 업로드 시 필수)

```bash
# 터널 시작 (한 번만 실행)
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr

# 터널 확인
pgrep -f "ssh.*3306"
```

### 3. 스크래퍼 실행

```bash
# 기본 실행 (HEADLESS=true 권장)
HEADLESS=true poetry run python tradingview_playwright_scraper_upload.py

# Linux 서버 환경 (디스플레이 없는 환경)
xvfb-run --auto-servernum --server-args='-screen 0 1280x960x24' poetry run python tradingview_playwright_scraper_upload.py
```

### Headless 모드 관리

**기본 설정: HEADLESS=true**

| 상황 | HEADLESS 값 | 설명 |
|------|-------------|------|
| 일반 실행 (cron 자동화) | `true` | 브라우저 창 없이 백그라운드 실행 |
| 로그인 필요 (쿠키 없음/만료) | `false` | CAPTCHA 수동 해결을 위해 브라우저 표시 |
| 디버깅/UI 확인 | `false` | 브라우저 동작 시각적 확인 |

**자동 전환 로직 (코드에 내장됨):**
1. `HEADLESS=true` 설정 시, 쿠키가 없거나 만료되면 자동으로 `false`로 전환
2. 로그인 성공 후 쿠키가 저장되면 다음 실행부터 `true` 모드 사용 가능
3. 쿠키가 유효하면 자동으로 `true` 모드로 실행

**Linux 서버 필수 설정:**
```bash
# xvfb 설치 (Ubuntu/Debian)
sudo apt-get install xvfb

# xvfb-run으로 실행 (디스플레이 없는 서버에서 필수)
xvfb-run --auto-servernum --server-args='-screen 0 1280x960x24' \
  HEADLESS=true poetry run python tradingview_playwright_scraper_upload.py
```

**로그인 워크플로우:**
```bash
# Step 1: 로그인이 필요하면 HEADLESS=false로 실행 (CAPTCHA 수동 해결)
HEADLESS=false poetry run python tradingview_playwright_scraper_upload.py

# Step 2: 로그인 성공 후 cookies.json 생성됨

# Step 3: 이후부터는 HEADLESS=true로 자동화 실행
HEADLESS=true poetry run python tradingview_playwright_scraper_upload.py
# 또는 Linux 서버:
xvfb-run --auto-servernum --server-args='-screen 0 1280x960x24' \
  HEADLESS=true poetry run python tradingview_playwright_scraper_upload.py
```

## 주요 설정

### TIME_PERIODS (시간대 설정)

```python
TIME_PERIODS = [
    {"name": "12달", "button_text": "1Y", "interval": "1 날"},   # Daily 데이터
    {"name": "1달", "button_text": "1M", "interval": "30 분"},   # 30분 데이터
    {"name": "1주", "button_text": "5D", "interval": "5 분"},    # 5분 데이터
    {"name": "1일", "button_text": "1D", "interval": "1 분"},    # 1분 데이터
]
```

### STOCK_LIST (종목 리스트)

```python
STOCK_LIST = [
    "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", ...
]
```

## 데이터 플로우

1. **로그인**: `cookies.json` 사용 (없으면 자동 로그인)
2. **심볼 검색**: `#header-toolbar-symbol-search` 클릭 → 종목 입력
3. **시간대 변경**: 버튼 클릭 (1Y, 1M, 5D, 1D)
4. **CSV 다운로드**: `차트 데이터 다운로드` 메뉴
5. **DB 업로드**: `db_service.upload_csv()` 호출

## DB 테이블 구조

```sql
CREATE TABLE `{symbol}_{timeframe}` (
    `time` DATETIME NOT NULL PRIMARY KEY,
    `symbol` VARCHAR(32) NOT NULL,
    `timeframe` VARCHAR(16) NOT NULL,
    `open` DOUBLE,
    `high` DOUBLE,
    `low` DOUBLE,
    `close` DOUBLE,
    `volume` BIGINT,
    `rsi` DOUBLE,
    `macd` DOUBLE
)
```

## 트러블슈팅

### 로그인 실패
- `cookies.json` 삭제 후 재실행
- CAPTCHA 발생 시 수동 해결 필요 (`HEADLESS=false`로 실행)

### DB 연결 실패
- SSH 터널 확인: `pgrep -f "ssh.*3306"`
- 터널 재시작: `ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr`

### 요소 찾기 실패
- TradingView UI 변경 가능성
- `HEADLESS=false`로 실행하여 UI 확인

### Linux 디스플레이 에러
**증상:** `Cannot open display` 또는 `no display environment variable` 에러

**해결:**
```bash
# xvfb 설치
sudo apt-get install xvfb

# xvfb-run으로 실행
xvfb-run --auto-servernum --server-args='-screen 0 1280x960x24' \
  poetry run python tradingview_playwright_scraper_upload.py
```

**xvfb-run 옵션 설명:**
- `--auto-servernum`: 사용 가능한 서버 번호 자동 선택
- `--server-args='-screen 0 1280x960x24'`: 가상 화면 해상도 설정 (1280x960, 24bit 색상)

## 자동화 파이프라인

### 구현된 자동화 스크립트

```
scripts/
├── scrape-daily.sh       # 일일 데이터 수집 자동화
├── validate_data.py      # 데이터 품질 검증
└── setup-cron.sh         # cron 작업 설정
```

### scrape-daily.sh - 일일 스크래핑 자동화

미국 정규장 마감 후 자동으로 TradingView 데이터를 수집하는 완전 자동화 스크립트.

**위치:** `/home/ahnbi2/etf-trading-project/scripts/scrape-daily.sh`

**주요 기능:**
1. SSH 터널 자동 확인 및 시작
2. Poetry 환경 자동 설정 및 검증
3. Headless 모드로 브라우저 실행 (서버 환경)
4. 상세 로그 기록 및 실행 시간 측정
5. 성공/실패 상태 자동 리포트

**실행 환경 변수:**
```bash
export HEADLESS=true              # Headless 모드 활성화
export PATH="/usr/local/bin:..."  # cron 환경용 PATH
```

**Linux 서버 실행 (xvfb 필수):**
```bash
# 수동 실행
xvfb-run --auto-servernum --server-args='-screen 0 1280x960x24' \
  HEADLESS=true poetry run python tradingview_playwright_scraper_upload.py

# cron에서 실행 시 스크립트 내부에 xvfb-run 포함
```

**로그 출력:**
```
logs/scraper-YYYYMMDD.log

예시:
========================================
📊 일일 스크래핑 시작: Thu Jan 30 22:00:01 UTC 2026
========================================
✅ SSH 터널 이미 실행 중
🚀 스크래퍼 실행 중...
Headless 모드: true
...
✅ 스크래핑 성공 (소요시간: 342초)
완료 시간: Thu Jan 30 22:05:43 UTC 2026
```

**수동 실행:**
```bash
./scripts/scrape-daily.sh

# 로그 실시간 확인
tail -f logs/scraper-$(date +%Y%m%d).log
```

### validate_data.py - 데이터 품질 검증

MySQL 데이터베이스의 모든 종목 테이블을 자동으로 검증하는 Python 스크립트.

**위치:** `/home/ahnbi2/etf-trading-project/scripts/validate_data.py`

**검증 항목:**

| 검증 항목 | 설명 | 임계값 |
|----------|------|--------|
| 테이블 존재 | 종목별 테이블 생성 여부 | - |
| 최신 데이터 | 오늘/어제 데이터 존재 여부 | 1일 이내 |
| NULL 값 비율 | open, high, low, close, volume | 5% 이하 |
| 중복 타임스탬프 | 동일 시간 중복 데이터 | 0건 |
| 가격 이상치 | 0 이하 가격, 50% 이상 급변 | 0건 |

**실행:**
```bash
cd /home/ahnbi2/etf-trading-project/scraper-service
poetry run python ../scripts/validate_data.py
```

**결과 형식:**
```json
{
  "timestamp": "2026-01-30T15:30:00",
  "summary": {
    "total_tables": 60,
    "passed": 58,
    "failed": 2,
    "errors": 0,
    "pass_rate": 0.967,
    "fail_rate": 0.033,
    "error_rate": 0.0
  },
  "failed_tables": ["NVDA_1h", "AAPL_D"],
  "tables": {
    "NVDA_D": {
      "exists": true,
      "row_count": 252,
      "status": "PASSED",
      "checks": {
        "recent_data": {
          "passed": true,
          "latest_date": "2026-01-29",
          "days_old": 1
        },
        "null_values": {
          "passed": true,
          "null_counts": { ... }
        },
        "duplicates": {
          "passed": true,
          "duplicate_count": 0
        },
        "price_anomalies": {
          "passed": true,
          "invalid_prices": 0,
          "extreme_changes": 0
        }
      }
    }
  }
}
```

**검증 결과 저장:**
- 위치: `logs/validation_YYYYMMDD_HHMMSS.json`
- Exit Code: 0 (성공), 1 (실패/에러)

**결과 조회:**
```bash
# 최근 검증 결과 요약
ls -lt logs/validation_*.json | head -1 | xargs cat | jq '.summary'

# 실패한 테이블 목록
ls -lt logs/validation_*.json | head -1 | xargs cat | jq '.failed_tables'
```

### Cron 설정

**자동 설정 (권장):**
```bash
./scripts/setup-cron.sh
```

**수동 설정:**
```bash
crontab -e

# 매일 오전 7시 (한국시간) = 22:00 UTC (미국 정규장 마감 후)
# 월~금요일에만 실행
0 22 * * 1-5 /home/ahnbi2/etf-trading-project/scripts/scrape-daily.sh
```

**Cron 작업 확인:**
```bash
# 현재 설정된 cron 목록
crontab -l

# cron 실행 로그 (시스템 로그)
grep CRON /var/log/syslog | tail -20
```

### 통합 파이프라인 워크플로우

```
┌─────────────────────────────────────────┐
│  Cron Trigger (매일 22:00 UTC)          │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  scrape-daily.sh                        │
│  ├─ SSH 터널 확인/시작                   │
│  ├─ Poetry 환경 설정                     │
│  └─ Playwright 스크래퍼 실행 (Headless)  │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  TradingView 데이터 수집                 │
│  ├─ 30개 종목 × 2개 시간대              │
│  ├─ CSV 다운로드                        │
│  └─ MySQL 자동 업로드                   │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  로그 기록                              │
│  └─ logs/scraper-YYYYMMDD.log          │
└─────────────────────────────────────────┘

(선택) 수동 데이터 검증:
┌─────────────────────────────────────────┐
│  validate_data.py                       │
│  ├─ 60개 테이블 품질 검증               │
│  ├─ 5가지 검증 항목 자동 체크           │
│  └─ JSON 리포트 생성                    │
└─────────────────────────────────────────┘
```

### 모니터링 및 디버깅

**로그 확인:**
```bash
# 오늘 스크래핑 로그 실시간 확인
tail -f logs/scraper-$(date +%Y%m%d).log

# 어제 로그 확인 (마지막 100줄)
tail -100 logs/scraper-$(date -d "yesterday" +%Y%m%d).log

# 최근 7일간 에러 검색
grep -i "error\|failed" logs/scraper-*.log | tail -50
```

**DB 데이터 확인:**
```bash
# Python에서 직접 확인
python3 << 'EOF'
from db_service import DatabaseService
db = DatabaseService()
db.connect()

# 테이블 존재 확인
print("NVDA_D exists:", db.table_exists('NVDA_D'))

# 최근 데이터 확인
cursor = db.connection.cursor()
cursor.execute("SELECT * FROM NVDA_D ORDER BY time DESC LIMIT 5")
for row in cursor.fetchall():
    print(row)
EOF
```

**SSH 터널 상태 확인:**
```bash
# 터널 프로세스 확인
pgrep -af "ssh.*3306:127.0.0.1:5100"

# 터널 재시작
pkill -f "ssh.*3306"
ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr
```

### 트러블슈팅

**스크래핑 실패 시:**
1. SSH 터널 확인: `pgrep -f "ssh.*3306"`
2. 로그 확인: `tail -100 logs/scraper-$(date +%Y%m%d).log`
3. Headless 모드 해제 (Linux):
   ```bash
   xvfb-run --auto-servernum --server-args='-screen 0 1280x960x24' \
     HEADLESS=false poetry run python tradingview_playwright_scraper_upload.py
   ```
4. 수동 실행으로 디버깅:
   ```bash
   cd scraper-service && \
   xvfb-run --auto-servernum --server-args='-screen 0 1280x960x24' \
     poetry run python tradingview_playwright_scraper_upload.py
   ```
5. 쿠키 재로그인 필요 시: `rm cookies.json` 후 `HEADLESS=false`로 실행

**데이터 검증 실패 시:**
1. 검증 결과 확인: `cat logs/validation_*.json | jq '.failed_tables'`
2. 실패 원인 분석: `cat logs/validation_*.json | jq '.tables["NVDA_D"]'`
3. 테이블 직접 확인: SQL 쿼리로 데이터 조회

**Cron 작업이 실행되지 않을 때:**
1. Cron 설정 확인: `crontab -l`
2. PATH 환경 변수 확인: 스크립트 상단 PATH 설정 검증
3. 시스템 로그 확인: `grep CRON /var/log/syslog`
4. 스크립트 실행 권한: `chmod +x scripts/scrape-daily.sh`

## 관련 문서

- **DB 연결**: `.claude/skills/db-ssh-tunneling/skill.md`
- **프로젝트 개요**: `.claude/skills/ai-etf-project/skill.md`
