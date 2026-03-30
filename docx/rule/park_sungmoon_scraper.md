# 박성문 - 데이터 수집 & 버그 수정

## 담당자
- **이름**: 박성문
- **역할**: 데이터 엔지니어 (스크래핑 + 버그 수정)

---

## 담당 기능

| # | 기능 | 설명 |
|---|------|------|
| 3 | 데이터 수집 | TradingView 스크래핑, 1000종목 확장, 병렬화 |
| - | 버그 수정 | 타임프레임 매핑, 진행률 카운터, 수집 스케줄 |
| - | 피처 파이프라인 | 수집 데이터 → 피처 엔지니어링 연동 |

---

## 담당 브랜치

```
fix/scraper-bugfix           # 기존 버그 수정
feat/scraper-optimization    # 1000종목 확장 + 병렬화
```

---

## 담당 파일/폴더 (이 파일만 수정)

```
scraper-service/
├── app/
│   ├── services/scraper.py                        # 스크래퍼 메인 로직
│   ├── services/data_processor.py                 # 데이터 처리
│   ├── features/                                  # 피처 엔지니어링
│   │   ├── data_providers/mysql_provider.py       # DB 연동
│   │   └── pipeline/                              # 피처 파이프라인
│   └── routers/jobs.py                            # 작업 관리 API
├── tradingview_playwright_scraper_upload.py        # Playwright 스크래퍼
├── config/                                        # 종목 리스트, 설정
└── downloads/                                     # 다운로드 CSV
```

> **주의**: 위 파일/폴더 외의 기존 파일은 수정하지 않는다. 수정이 필요하면 PM에게 요청.
> **특히**: `docker-compose.yml`, `requirements.txt` 등 공통 파일은 PM만 수정.

---

## 긴급 버그 수정 (Sprint 0)

### 버그 1: 타임프레임 매핑 오류 (P0)
- **파일**: `scraper-service/app/services/scraper.py:441-449`
- **문제**: TradingView 드롭다운 텍스트 → DB 테이블 매핑이 잘못됨
  ```
  현재 (버그):
  "12달" → "D"    ← 월봉인데 일봉 테이블에 저장
  "1달"  → "D"    ← 월봉인데 일봉 테이블에 저장
  "1주"  → "D"    ← 주봉인데 일봉 테이블에 저장
  "1일"  → "1h"   ← 일봉인데 1시간봉 테이블에 저장

  올바른 매핑:
  "12달" → "1M"   (월봉)
  "1달"  → "1M"   (월봉)
  "1주"  → "1W"   (주봉)
  "1일"  → "D"    (일봉)
  "1시간" → "1h"  (1시간봉)
  ```
- **영향**: _D 테이블에 주봉/월봉 데이터가 덮어쓰기되어 일봉 데이터 손상

### 버그 2: 진행률 카운터 (P1)
- **파일**: `scraper-service/app/routers/jobs.py`
- **문제**: `task_info.json`의 완료 카운터가 0/101로 표시
- **현재 임시 수정**: DB 기반 카운터 fallback 적용됨
- **근본 수정 필요**: `task_info.json` 업데이트 로직 수정

### 버그 3: MySQL 연결 (P1)
- **파일**: `scraper-service/app/features/data_providers/mysql_provider.py`
- **문제**: Docker 내부에서 localhost로 MySQL 접속 시도 → 실패
- **수정**: `DB_URL` 환경변수 또는 `172.17.0.1` 사용 (수정 완료, 확인 필요)

---

## 1000종목 확장 계획

### 종목 리스트 확장
```
현재: 101종목 (미국 대형주 위주)
목표: 1000+종목

확장 대상:
├── S&P 500 구성종목 (~500)
├── NASDAQ 100 구성종목 (~100, 중복 제외)
├── 주요 ETF (~50: SPY, QQQ, IWM, GLD 등)
├── 중형주 (~200: Russell 2000 상위)
└── 섹터 대표주 (~150)
```

### 병렬 수집 구현
```
현재: Playwright 1개 → 순차 수집 → 101종목 ~1시간
목표: Playwright 5개 → 병렬 수집 → 1000종목 ~2시간

구현:
├── 종목을 200개씩 5그룹으로 분배
├── 각 그룹마다 Playwright 인스턴스 1개
├── asyncio 또는 multiprocessing 사용
└── 에러 발생 시 해당 종목만 재시도
```

### 수집 스케줄 최적화
| 주기 | 수집 대상 | 이유 |
|------|-----------|------|
| 매일 07:00 KST | _D (일봉) | 매일 예측에 필요 |
| 매일 07:00 KST | _1h (1시간봉) | 단기 지표 계산용 |
| 매주 토요일 04:00 KST | _1W (주봉) | 주간 트렌드, 매일 필요 없음 |
| 매월 1일 04:00 KST | _1M (월봉) | 장기 트렌드, 매일 필요 없음 |

---

## 기술 스택

| 기술 | 용도 |
|------|------|
| Python | 스크래퍼 로직 |
| Playwright | TradingView 브라우저 자동화 |
| asyncio / multiprocessing | 병렬 수집 |
| MySQL (SQLAlchemy) | 데이터 저장 |
| FastAPI | 작업 관리 API |

---

## Sprint별 작업 계획

### Sprint 0 (즉시)
- [ ] 타임프레임 매핑 버그 수정 (P0)
- [ ] 수정 후 테스트: 각 테이블에 올바른 데이터 저장 확인
- [ ] 진행률 카운터 근본 수정

### Sprint 1 (Week 1-2)
- [ ] 1000종목 리스트 확정 (CSV 파일 또는 config)
- [ ] 병렬 수집 프로토타입 (2워커로 테스트)
- [ ] 수집 스케줄 분리 (일봉 매일, 주봉/월봉 주1회)
- [ ] 에러 핸들링 + 재시도 로직

### Sprint 2 (Week 3-4)
- [ ] 5워커 병렬 수집 완성
- [ ] 1000종목 전체 수집 테스트
- [ ] 수집 모니터링 대시보드 연동 확인
- [ ] 성능 측정 (수집 시간, 에러율)

### Sprint 3 (Week 5-6)
- [ ] 수집 안정화 (에러율 < 1%)
- [ ] 자동 재수집 (실패 종목)
- [ ] 피처 파이프라인 연동 테스트 (1000종목)

### Sprint 4 (Week 7-8)
- [ ] 버그 수정
- [ ] 문서화 (수집 프로세스, 종목 관리)

---

## Git 작업 흐름 (매일)

```bash
# 아침 - 버그 수정 브랜치
git checkout fix/scraper-bugfix
git pull origin develop

# 작업 후
git add scraper-service/app/services/scraper.py
git commit -m "fix: 타임프레임 매핑 12달→1M, 1주→1W 수정"
git push origin fix/scraper-bugfix

# GitHub 웹에서 PR 생성 (base: develop)
```

---

## 참고: 데이터 수집 이해 필수 사항

### 언제 데이터를 수집해야 하는가?
- **미국 시장 마감**: 매일 06:00 KST (동절기) / 05:00 KST (하절기)
- **수집 시작**: 마감 후 1시간 뒤 → **07:00 KST**
- **이유**: TradingView에 최종 데이터가 반영되는 데 약 30분~1시간 소요
- **주말/공휴일**: 수집해도 새 데이터 없음 → 스킵 로직 필요

### 데이터 흐름
```
TradingView → Playwright 스크래핑 → CSV 다운로드 → MySQL 업로드
    → 피처 엔지니어링 (etf2_db_processed) → ML 예측 → 자동 매매
```
