# 랩미팅 발표 자료 - 2026년 4월 15일

> **프로젝트**: AI ETF Trading Pipeline
> **발표자**: 정재호
> **기간**: 2026년 4월 7일 ~ 4월 14일 (1주간 진행 사항)

---

## 목차

1. [데이터 수집 현황](#1-데이터-수집-현황)
2. [데이터 품질 이슈 발견 및 해결](#2-데이터-품질-이슈-발견-및-해결)
3. [멀티AI 개발 현황](#3-멀티ai-개발-현황)
4. [펀더멘탈 데이터 수집 전략](#4-펀더멘탈-데이터-수집-전략)
5. [커뮤니티 기능 개발](#5-커뮤니티-기능-개발)
6. [매매전략 페이지](#6-매매전략-페이지)
7. [향후 계획 (Action Items)](#7-향후-계획-action-items)
8. [교수님께 질문사항](#8-교수님께-질문사항)
9. [AI 프롬프트 전략](#9-ai-프롬프트-전략)

---

## 1. 데이터 수집 현황

### 수집 대상

- **전체 심볼**: 1,000개 (S&P 500 전체 + 추가 중대형주 + 주요 ETF)
- **데이터 소스**: TradingView (Playwright 기반 자동 스크래핑)
- **심볼 설정 파일**: `scraper-service/config/symbols.yaml` (v2.0, 2026-04-04 업데이트)

### 수집 성공률

| 항목 | 수치 |
|------|------|
| 수집 성공 | **885 / 1,000** (88.5%) |
| 에러 종목 | **~103개** |
| 소요 시간 | **~12시간** |

### 에러 종목 원인 분석

- **ETF 종목**: TradingView에서 ETF 차트 로딩 시 버튼 셀렉터가 일반 주식과 다름
- **일부 개별주**: TradingView UI 변경으로 인한 셀렉터 불일치
- **근본 원인**: Playwright CSS 셀렉터가 TradingView 업데이트에 취약

### 수집 주기 및 자동화

| 항목 | 설정 |
|------|------|
| 수집 주기 | **매일 06:00 KST** (미국 정규장 마감 후) |
| 실행 요일 | **월~금** |
| 자동화 방식 | **Cron + Docker API** |
| 모니터링 | 실시간 대시보드 (`ahnbi2.suwon.ac.kr/monitor`) |

### 4개 타임프레임

| 타임프레임 | TradingView 설정 | 데이터 간격 | 용도 |
|------------|------------------|-------------|------|
| **1Y** (12달) | 일봉 (D) | 1일 | ML 학습, 장기 추세 |
| **1M** (1달) | 30분봉 | 30분 | 중기 패턴 |
| **5D** (5일) | 5분봉 | 5분 | 단기 패턴 |
| **1D** (1일) | 1분봉 | 1분 | 초단기, 실시간 분석 |

---

## 2. 데이터 품질 이슈 발견 및 해결

### 발견 배경

`etf_63_pred` DB 구축 작업 중 (종목별 10년치 평균 3개월 수익률 계산), 소스 데이터(`etf2_db`, `etf2_db_processed`)에 여러 층위의 오염이 발견됨.

**핵심 증거**: 101 종목 `target_3m` 계산 시 66개 종목의 최대값이 +500% 초과 (최대 +1,163,700%)

### 발견된 7가지 문제

| # | 문제 | 심각도 | 해결 상태 |
|---|------|--------|-----------|
| 1 | **일봉 테이블에 intraday 데이터 섞임** | 높음 | 해결 완료 |
| 2 | **다른 종목 데이터가 같은 테이블에 혼입** | 매우 높음 | 해결 완료 |
| 3 | **주식 분할(split) 보정 미적용** | 높음 | 해결 완료 |
| 4 | **target_3m 계산이 행(row) 기반** | 중간 | 해결 완료 |
| 5 | **PK 제약 부재 (time만 PK)** | 높음 | 해결 완료 |
| 6 | **피처 시프트/타겟 계산 순서 (look-ahead 우려)** | 낮음 | 확인 완료 (의도된 설계) |
| 7 | **검증 스크립트 커버리지 부족** | 중간 | 강화 필요 |

### 문제 상세

#### 문제 1: intraday 데이터 섞임

- `AAPL_D` 테이블: 고유 날짜 4,089일인데 총 10,088행 (2.47배 중복)
- 하루 78행이 들어간 날도 29일 존재 (5분 간격 데이터가 일봉으로 라벨링)
- **원인**: `get_table_name()`에서 `"12달": "D"` 하드코딩, 다운로드 파일의 실제 timeframe 검증 없음

#### 문제 2: 종목 혼입

- `CSCO_D`: close 범위가 $0.07 ~ $1,170 (실제 CSCO는 $20~$65)
- `ABBV_D`: close 범위가 $0.226 ~ $3,635.50 (실제 ABBV는 $50~$180)
- **원인**: Playwright 스크래핑 시 이전 종목 세션 데이터가 다음 종목 테이블에 혼입

#### 문제 3: split 미보정

- `yfinance_provider.py`에서 `auto_adjust=False` 설정 (원본 가격 사용)
- 코드베이스 어디에도 수동 split 보정 로직 없음
- AAPL, NVDA, TSLA 등 다중 분할 종목에서 수익률 계산 시 수천 배 왜곡

### 해결 완료 사항

| 해결 내용 | 커밋 | 영향 범위 |
|-----------|------|-----------|
| **PK를 복합키로 변경** | `0c55a81` | `(symbol, timeframe, time)` 복합 PK |
| **기존 테이블 PK 마이그레이션** | `5da148b` | **3,460개 테이블** 전체 적용 |
| **이상치 데이터 삭제** | `e0571f4` | **357,371행** 제거 |
| **주식 분할 보정 적용** | `5da148b` | split 보정 로직 추가 |
| **데이터 품질 검증 강화** | `c221e74` | 스크래퍼 안정성 개선 |

### 남은 과제

- [ ] 기존 오염 데이터 완전 정리 (일부 종목 재수집 필요 여부 판단)
- [ ] `validate_data.py` 강화: intraday 섞임 감지, 가격대 이상치 자동 탐지
- [ ] 에러 종목 103개 해결 (ETF 셀렉터 수정)

---

## 3. 멀티AI 개발 현황

### 3x3 AI 분석 그리드

| 카테고리 \ AI | ChatGPT (GPT-4) | Gemini (2.5 Flash) | Claude (3.5 Sonnet) |
|---------------|-----------------|-------------------|---------------------|
| **Technical** | RSI/MACD 기반 매매 신호 | 차트 패턴 인식 | 기술적 지표 종합 분석 |
| **Fundamental** | 재무제표 분석 | 밸류에이션 평가 | 펀더멘탈 종합 판단 |
| **Market** | 매크로 환경 분석 | 섹터 로테이션 | 시장 심리 분석 |

- 각 AI가 독립적으로 분석 후, 의견 종합하여 최종 투자 판단
- 의견 일치도(Consensus)를 점수화하여 신뢰도 표시

### TradingView 위젯 통합

| 위젯 | 용도 | 위치 |
|------|------|------|
| **Advanced Chart** | Technical 분석용 인터랙티브 차트 | Technical 탭 |
| **Technical Analysis** | RSI, MACD 등 기술 지표 요약 | Technical 탭 |
| **Financials** | 재무제표, 손익계산서 | Fundamental 탭 |
| **Mini Overview** | 종목 요약 정보 | 상단 패널 |

- 관련 커밋: `42c8d57` (카테고리별 TradingView 차트 추가), `b6830f3` (탭 선택 기능)

### 마켓 데이터 패널

실시간 시장 지표를 스파크라인 차트와 함께 표시:

| 지표 | 심볼 | 설명 |
|------|------|------|
| S&P 500 | SPY | 미국 대형주 벤치마크 |
| NASDAQ | QQQ | 기술주 중심 |
| DOW | DIA | 다우존스 산업평균 |
| VIX | ^VIX | 공포지수 (변동성) |
| USD/KRW | USDKRW=X | 원/달러 환율 |
| Gold | GLD | 안전자산 |
| BTC | BTC-USD | 비트코인 |
| Crude Oil | USO | 원유 |
| Dollar Index | UUP | 달러 강세 지표 |

- 관련 커밋: `cf77d85` (마켓 데이터 확장), `cb5d4de` (스파크라인 차트)

### 뉴스 티커 통합

- 실시간 금융 뉴스 피드 표시
- 종목 관련 뉴스 자동 필터링

### KIS 실계좌 연동

| 기능 | 데이터 소스 | 상태 |
|------|-------------|------|
| 포트폴리오 | KIS API 보유종목 | 완료 |
| 잔고 | KIS API 현금 + 보유종목 평가금 | 완료 |
| 보유종목 | KIS API 실시간 조회 | 완료 |

- 관련 커밋: `5b8aa1f` (포트폴리오 KIS 전용), `9ac24f2` (잔고 API 정확한 총자산)
- **원칙**: 모든 금융 데이터는 KIS API 실데이터만 사용 (더미 데이터 절대 금지)

---

## 4. 펀더멘탈 데이터 수집 전략

### 단계별 접근

| 단계 | 데이터 소스 | 비용 | 대상 | 시기 |
|------|-------------|------|------|------|
| **1단계** | yfinance | 무료 | 1,000종목 | 즉시 시작 |
| **2단계** | Financial Modeling Prep (FMP) | $29/월 | 1,000종목 | yfinance 한계 도달 시 |

### 1단계: yfinance (무료)

**장점**:
- 즉시 사용 가능, API 키 불필요
- PER, PBR, ROE 등 주요 지표 제공
- 분기별 재무제표 (income statement, balance sheet, cash flow)

**한계**:
- Rate limiting (과도한 요청 시 차단)
- 일부 종목 데이터 누락 가능
- 실시간성 부족 (15~20분 지연)

**대응 전략**: 요청 간 딜레이 (0.5~1초), 배치 처리, 캐싱

### 2단계: FMP 전환 검토

**전환 조건**:
- yfinance rate limit이 1,000종목 일일 수집에 지장을 줄 때
- 실시간 데이터 필요 시
- 더 풍부한 지표 (ESG, Insider Trading 등) 필요 시

### 수집 항목 (18개 지표)

#### 시장 지표 (매일 수집)

| 지표 | 설명 | yfinance 필드 |
|------|------|---------------|
| PER | 주가수익비율 | `trailingPE` |
| Forward PER | 미래 주가수익비율 | `forwardPE` |
| PBR | 주가순자산비율 | `priceToBook` |
| PSR | 주가매출비율 | `priceToSalesTrailing12Months` |
| EV/EBITDA | 기업가치/EBITDA | `enterpriseToEbitda` |
| 배당수익률 | Dividend Yield | `dividendYield` |
| 시가총액 | Market Cap | `marketCap` |

#### 재무 지표 (매주 수집)

| 지표 | 설명 | 산출 방법 |
|------|------|-----------|
| ROE | 자기자본수익률 | `returnOnEquity` |
| ROA | 총자산수익률 | `returnOnAssets` |
| 매출성장률 | Revenue Growth | `revenueGrowth` |
| 이익성장률 | Earnings Growth | `earningsGrowth` |
| 영업이익률 | Operating Margin | `operatingMargins` |
| 순이익률 | Profit Margin | `profitMargins` |

#### 재무제표 지표 (분기별 수집)

| 지표 | 설명 | 산출 방법 |
|------|------|-----------|
| 부채비율 | Debt to Equity | `debtToEquity` |
| 유동비율 | Current Ratio | `currentRatio` |
| 잉여현금흐름 | Free Cash Flow | `freeCashflow` |
| 총부채 | Total Debt | `totalDebt` |
| 현금 및 현금성자산 | Total Cash | `totalCash` |

### 수집 주기

| 주기 | 대상 지표 | 이유 |
|------|-----------|------|
| **매일** | PER, PBR, PSR, 배당수익률, 시가총액, EV/EBITDA, Forward PER | 주가 변동에 따라 매일 변동 |
| **매주** | ROE, ROA, 매출성장률, 이익성장률, 영업이익률, 순이익률 | 분기 실적 기반이라 큰 변동 없음 |
| **분기별** | 부채비율, 유동비율, 잉여현금흐름, 총부채, 현금 | 재무제표 발표 주기에 맞춤 |

### MySQL 저장 구조

#### `fundamental_daily` 테이블

```sql
CREATE TABLE fundamental_daily (
    symbol VARCHAR(10),
    date DATE,
    per DECIMAL(10,4),
    forward_per DECIMAL(10,4),
    pbr DECIMAL(10,4),
    psr DECIMAL(10,4),
    ev_ebitda DECIMAL(10,4),
    dividend_yield DECIMAL(10,6),
    market_cap BIGINT,
    PRIMARY KEY (symbol, date)
);
```

#### `fundamental_quarterly` 테이블

```sql
CREATE TABLE fundamental_quarterly (
    symbol VARCHAR(10),
    fiscal_quarter VARCHAR(10),  -- e.g., '2026Q1'
    roe DECIMAL(10,4),
    roa DECIMAL(10,4),
    revenue_growth DECIMAL(10,4),
    earnings_growth DECIMAL(10,4),
    operating_margin DECIMAL(10,4),
    profit_margin DECIMAL(10,4),
    debt_to_equity DECIMAL(10,4),
    current_ratio DECIMAL(10,4),
    free_cash_flow BIGINT,
    total_debt BIGINT,
    total_cash BIGINT,
    PRIMARY KEY (symbol, fiscal_quarter)
);
```

### 1,000종목 대응 전략

| 방식 | 설정 | 예상 소요 시간 |
|------|------|----------------|
| yfinance + 딜레이 (0.5초) | `time.sleep(0.5)` per symbol | ~8분 (일일 지표) |
| yfinance + 딜레이 (1.0초) | `time.sleep(1.0)` per symbol | ~17분 (일일 지표) |
| FMP API (한계 시 전환) | API 키 기반, rate limit 별도 | ~3분 (일일 지표) |

### API 연결 경로

```
scraper-service/
└── app/
    └── services/
        └── fundamental_service.py   ← 신규 생성 필요
```

**구현 계획**:
1. `FundamentalService` 클래스 생성
2. yfinance Ticker 객체로 지표 수집
3. MySQL `fundamental_daily` / `fundamental_quarterly` 테이블에 UPSERT
4. Cron 연동: 매일 07:00 KST (기술 데이터 수집 직후)
5. ML 피처 파이프라인에 펀더멘탈 피처 추가

### 구체적 실행 일정

| 주차 | 작업 | 담당 | 산출물 |
|------|------|------|--------|
| 4/14~4/18 | yfinance fundamental_service.py 구현 | 정재호 | 서비스 코드 + 단위 테스트 |
| 4/14~4/18 | MySQL fundamental_daily/quarterly 테이블 생성 | 정재호 | DDL + 초기 데이터 |
| 4/21~4/25 | 1000종목 일괄 수집 테스트 + Cron 연동 | 정재호 | 수집 로그 + 에러율 보고 |
| 4/21~4/25 | 멀티AI Fundamental 패널에 실데이터 연동 | 정재호 | 실시간 PER/ROE/성장률 표시 |
| 4/28~5/02 | ML 피처 파이프라인에 펀더멘탈 피처 추가 | 정재호 | pipeline.py 수정 + 재학습 |
| 5월 이후 | FMP 전환 검토 (yfinance 한계 평가) | TBD | 비용/성능 비교 보고서 |

### 교수님께 확인 필요 사항

1. **데이터 소스**: yfinance 무료로 시작 → FMP $29/월 전환 승인 필요 시점은?
2. **수집 범위**: 1000종목 전부 vs 보유 가능 종목만 (ML top-100)?
3. **회사 성장률 그래프**: 분기별 매출/순이익 추이를 멀티AI에 표시할 예정. 추가로 보여줄 지표가 있는지?
4. **AI 프롬프트**: 펀더멘탈 데이터를 AI에 넣을 때 raw 숫자 vs 해석(예: "PER 15 = 저평가") 중 어느 방식이 좋은지?

---

## 5. 커뮤니티 기능 개발

### 구현 완료 기능 (커밋: `f238266`)

| 기능 | 설명 | 상태 |
|------|------|------|
| **정렬** | 최신순 / 인기순 / 댓글순 | 완료 |
| **추천/비추천** | 게시글 및 댓글에 추천/비추천 버튼 | 완료 |
| **대댓글** | 댓글에 대한 답글 (1레벨 중첩) | 완료 |
| **@멘션** | `@닉네임` 태그로 사용자 알림 | 완료 |
| **닉네임** | 사용자 식별용 닉네임 시스템 | 완료 |
| **신고** | 부적절한 게시글/댓글 신고 기능 | 완료 |
| **종목 태그** | 게시글에 관련 종목 태그 부착 | 완료 |

### 추가 개발 예정

- [ ] 실시간 알림 (WebSocket)
- [ ] 인기 게시글 하이라이트
- [ ] 종목별 토론 게시판
- [ ] 사용자 프로필 페이지

---

## 6. 매매전략 페이지

### 구현 완료 (커밋: `72ce660`)

#### 5-Way 시나리오 예측

| 시나리오 | 예상 변동 | 설명 |
|----------|-----------|------|
| **급등** | +10% 이상 | 강력한 매수 시그널, 호재 이벤트 |
| **상승** | +2% ~ +10% | 완만한 상승 추세 |
| **보합** | -2% ~ +2% | 횡보, 관망 |
| **하락** | -10% ~ -2% | 완만한 하락 추세 |
| **급락** | -10% 이하 | 강력한 매도 시그널, 악재 이벤트 |

- 각 시나리오별 확률을 AI가 산출
- LightGBM 랭킹 모델 + AI 분석 종합

#### 가상 매매 (페이퍼 트레이딩)

- 가상 자금으로 실제 시장 데이터 기반 모의 투자
- 매수/매도 주문 시뮬레이션
- 수익률 추적 및 성과 분석
- 실제 매매 전 전략 검증 용도

#### 매매 복기

- 과거 매매 기록 타임라인 조회
- 매매 시점의 AI 분석 결과 재확인
- 수익/손실 원인 분석
- 전략 개선 포인트 도출

---

## 7. 향후 계획 (Action Items)

### 이번 주 (4/15 ~ 4/21) - 최우선

| 우선순위 | 작업 | 담당 | 예상 기간 |
|----------|------|------|-----------|
| **P0** | `fundamental_service.py` 신규 생성 + yfinance 연동 | 재호 | 2일 |
| **P0** | `fundamental_daily` / `fundamental_quarterly` MySQL 테이블 생성 | 재호 | 0.5일 |
| **P0** | 펀더멘탈 데이터 1,000종목 초기 수집 테스트 | 재호 | 1일 |
| **P1** | 에러 종목 103개 ETF 셀렉터 수정 | 성문 | 2일 |
| **P1** | `validate_data.py` 강화 (intraday 섞임 감지, 가격 이상치) | 인혁 | 1일 |

### 다음 주 (4/22 ~ 4/28)

| 우선순위 | 작업 | 담당 | 예상 기간 |
|----------|------|------|-----------|
| **P1** | 멀티AI Fundamental 프롬프트에 실제 펀더멘탈 데이터 연동 | 재호 | 2일 |
| **P1** | ML 피처 파이프라인에 펀더멘탈 피처 추가 (18개) | 재호/인혁 | 3일 |
| **P2** | 커뮤니티 실시간 알림 (WebSocket) | - | 2일 |
| **P2** | 매매전략 페이퍼 트레이딩 백엔드 API | - | 3일 |

### 중기 계획 (5월)

| 작업 | 설명 |
|------|------|
| FMP 전환 평가 | yfinance 한계 도달 여부 판단 후 결정 |
| ML 모델 재학습 | 펀더멘탈 피처 추가 후 LightGBM 재학습 |
| 국내 주식 데이터 수집 | KRX 종목 데이터 파이프라인 구축 |
| 스크리닝 기능 | 종목 필터링 (PER, ROE, 시가총액 등 조건 검색) |

---

## 8. 교수님께 질문사항

### Q1. 펀더멘탈 데이터 소스

> yfinance (무료)로 시작해서 1,000종목 수집을 진행해도 괜찮을까요?
> 아니면 처음부터 FMP ($29/월)로 결제해서 안정적으로 가는 게 나을까요?

- yfinance: 무료, rate limit 주의, 일부 데이터 누락 가능
- FMP: $29/월, 안정적, 더 풍부한 지표, API 키 기반

### Q2. 데이터 품질

> 기존 DB의 오염 데이터 (intraday 섞임, 종목 혼입)에 대해 전체 재수집이 필요할까요?
> 이상치 제거 (357,371행 삭제 + PK 마이그레이션 완료)만으로 충분할까요?

- 현재: 이상치 삭제 + PK 복합키 변경으로 향후 오염 방지 완료
- 고민: 기존 데이터 중 일부는 여전히 split 미보정 상태일 수 있음

### Q3. ML 모델 재학습 주기

> 펀더멘탈 피처 (18개) 추가 시 재학습 주기를 현재 월 1회에서 주 1회로 변경해야 할까요?

- 현재: 매월 1일 새벽 3시 자동 학습 (Cron)
- 제안: 펀더멘탈은 분기별 변동이 크므로 월 1회 유지하되, 분기 실적 발표 직후 임시 재학습

### Q4. 국내 주식 데이터

> 국내 주식 (KRX) 데이터 수집을 언제부터 시작할까요?

- 현재 인프라는 미국 주식 중심
- 국내 주식 추가 시: 데이터 소스 (KRX OpenAPI / pykrx), DB 구조 확장 필요

### Q5. 스크리닝 기준

> 종목 스크리닝(필터링) 기준을 교수님이 정해주실까요?
> 자체적으로 일반적인 기준 (PER < 20, ROE > 10% 등)으로 먼저 구현해도 될까요?

- 필터링 항목: PER, PBR, ROE, 시가총액, 배당수익률, 부채비율 등
- UI: 슬라이더 + 범위 입력 방식

---

## 9. AI 프롬프트 전략

### 펀더멘탈 데이터의 AI 프롬프트 통합 방안

현재 멀티AI 시스템은 3개 카테고리 (Technical / Fundamental / Market)로 각 AI에 프롬프트를 전달합니다. 펀더멘탈 데이터 수집 후, 각 카테고리의 프롬프트에 실제 데이터를 주입합니다.

### Technical 프롬프트 (기존 유지 + 강화)

```
당신은 기술적 분석 전문가입니다.

[종목]: {symbol} ({company_name})
[현재가]: ${current_price}
[기간]: 최근 6개월

[기술 지표]
- RSI(14): {rsi_14} (과매수: >70, 과매도: <30)
- MACD: {macd} / Signal: {signal} / Histogram: {histogram}
- 이동평균: MA20={ma20}, MA50={ma50}, MA200={ma200}
- 볼린저밴드: Upper={bb_upper}, Middle={bb_middle}, Lower={bb_lower}
- 거래량: {volume} (20일 평균 대비 {volume_ratio}%)

[차트 패턴]
- 추세: {trend_direction} (상승/하락/횡보)
- 지지선: ${support_level}
- 저항선: ${resistance_level}

위 지표를 종합하여 향후 1주일 / 1개월 / 3개월 전망을 분석해주세요.
매수/매도/관망 중 하나를 추천하고, 근거를 구체적으로 설명해주세요.
```

### Fundamental 프롬프트 (신규 - 펀더멘탈 데이터 연동)

```
당신은 펀더멘탈 분석 전문가입니다.

[종목]: {symbol} ({company_name})
[섹터]: {sector}
[시가총액]: ${market_cap}

[밸류에이션]
- PER: {per} (섹터 평균: {sector_avg_per})
- Forward PER: {forward_per}
- PBR: {pbr}
- PSR: {psr}
- EV/EBITDA: {ev_ebitda}

[수익성]
- ROE: {roe}% (최근 4분기)
- ROA: {roa}%
- 영업이익률: {operating_margin}%
- 순이익률: {profit_margin}%
- 매출성장률: {revenue_growth}% (YoY)
- 이익성장률: {earnings_growth}% (YoY)

[재무 건전성]
- 부채비율: {debt_to_equity}%
- 유동비율: {current_ratio}
- 잉여현금흐름: ${free_cash_flow}
- 총부채: ${total_debt}
- 보유현금: ${total_cash}
- 배당수익률: {dividend_yield}%

이 종목의 재무 건전성과 성장 잠재력을 분석해주세요.
동종 업종 대비 밸류에이션이 적정한지 평가하고,
장기 투자 관점에서의 매력도를 1~10점으로 평가해주세요.
```

### Market 프롬프트 (기존 + 매크로 데이터 강화)

```
당신은 거시경제 및 시장 환경 분석 전문가입니다.

[종목]: {symbol} ({company_name})
[섹터]: {sector}

[글로벌 시장 현황]
- S&P 500: {sp500_price} ({sp500_change}%)
- NASDAQ: {nasdaq_price} ({nasdaq_change}%)
- VIX (공포지수): {vix} ({vix_level}: 안정/주의/경고/공포)
- Dollar Index: {dxy}
- 미 국채 10년물 금리: {us10y}%

[환율 및 원자재]
- USD/KRW: {usdkrw}원
- Gold: ${gold_price} ({gold_change}%)
- Crude Oil: ${oil_price} ({oil_change}%)
- BTC: ${btc_price} ({btc_change}%)

[섹터 영향 분석]
- {sector} 섹터 ETF 수익률: {sector_etf_return}% (1주)
- 금리 민감도: {interest_rate_sensitivity}
- 환율 영향: {fx_impact}

위 거시경제 환경이 {symbol} 종목에 미치는 영향을 분석해주세요.
현재 시장 상황에서 이 종목이 유리한지/불리한지 판단하고,
리스크 요인과 기회 요인을 각각 3가지씩 제시해주세요.
```

### 프롬프트 통합 흐름

```
사용자가 종목 선택 (e.g., NVDA)
        │
        ├─── Technical AI ──→ 기술 지표 데이터 주입 ──→ ChatGPT / Gemini / Claude
        │
        ├─── Fundamental AI ──→ 펀더멘탈 데이터 주입 ──→ ChatGPT / Gemini / Claude
        │
        └─── Market AI ──→ 매크로 데이터 주입 ──→ ChatGPT / Gemini / Claude
                                                          │
                                                    9개 분석 결과
                                                          │
                                                    종합 투자 판단
                                                    (Consensus Score)
```

---

## 참고: 프로젝트 기술 스택

| 영역 | 기술 |
|------|------|
| **프론트엔드** | Next.js 16 + TypeScript + shadcn/ui + Recharts + Tailwind CSS |
| **백엔드** | FastAPI (Python) |
| **ML 모델** | LightGBM LambdaRank (85개 피처, 2-fold rolling CV) |
| **데이터 수집** | Playwright (TradingView), yfinance |
| **데이터베이스** | MySQL (etf2_db, ~500 테이블) + SQLite (predictions.db) |
| **인프라** | Docker Compose, SSH 터널, Cron 자동화 |
| **모니터링** | 실시간 스크래핑 대시보드 (Next.js) |
| **실계좌 연동** | 한국투자증권 KIS API |
