# Trading Service 조사 보고서

## 1. trading-service는 뭘 하는 건가?

### 한줄 요약
**ML 모델이 매일 예측한 ETF 랭킹(Top 100)을 기반으로, KIS API를 통해 자동으로 매수/매도하는 서비스**

### 전체 흐름

```
매일 오전 8:30 KST (APScheduler 자동 실행)
    │
    ├─ 1. 오늘이 거래일인지 확인 (KRX 달력 기준, 공휴일/주말 제외)
    ├─ 2. KIS API로 계좌 잔고 조회
    ├─ 3. ml-service에서 오늘의 ETF 랭킹 Top 100 받아옴
    ├─ 4. [Day 64+] 63거래일 전 매수분을 FIFO로 매도
    ├─ 5. 가용 자금으로 랭킹 순 ETF 매수 (균등배분)
    └─ 6. 매매 내역 SQLite에 기록 (audit log)
```

### 핵심 개념: 63일 FIFO 순환 전략

| 기간 | 동작 | 설명 |
|------|------|------|
| Day 1~63 | 매수만 | 매일 Top 100 ETF를 균등 매수 (축적 구간) |
| Day 64~ | 매도 + 매수 | Day 1 매수분 매도 → 새로 매수 (순환 구간) |
| Day 65 | Day 2 매수분 매도 → 새로 매수 | |
| Day 66 | Day 3 매수분 매도 → 새로 매수 | ... |

### 기술 스택
- **Framework**: FastAPI (Python 3.12)
- **DB**: SQLite (거래 기록), MySQL (ML 데이터 - 원격)
- **스케줄러**: APScheduler + Cron fallback
- **포트**: 8002
- **컨테이너**: Docker

---

## 2. 왜 KIS API인가? 다른 API는 안 되나?

### 결론: KIS API가 현재로서는 최선의 선택이지만, 이베스트투자증권 REST API도 대안이 될 수 있다.

### 한국 증권사 API 비교표

| 항목 | 한국투자증권 (KIS) | 키움증권 | 이베스트투자증권 | 대신증권 |
|------|-------------------|---------|----------------|---------|
| **API 방식** | **REST API + WebSocket** | Windows COM (32bit) | **REST API (신규)** + COM | Windows COM |
| **OS 지원** | **Windows/Mac/Linux** | Windows만 | REST: 멀티OS / COM: Windows | Windows만 |
| **Docker/서버 배포** | **가능** | 불가능 | **가능 (REST)** | 불가능 |
| **AI/LLM 연동** | **공식 지원** | 미지원 | 미지원 | 미지원 |
| **모의투자** | 지원 | 지원 | 지원 | 지원 |
| **요청 제한** | 유량 제한 | 1초 5회 / 1시간 1000회 | 모의 1초 10건 | 15초 60건 |
| **생태계/문서화** | **매우 활발** | 활발 | 보통 | 보통 |
| **수수료** | 표준 | 표준 | **저렴** | 표준 |
| **MCP 서버** | **제공** | 미제공 | 미제공 | 미제공 |

### KIS API를 선택한 이유 (추정)

1. **REST API 제공**: 국내 최초(2022.04~). Docker 컨테이너, Linux 서버에서 동작 가능
2. **OS 제약 없음**: 이 프로젝트는 Docker Compose 기반 → Windows COM API(키움, 대신)는 사용 불가
3. **문서화 + 커뮤니티**: 공식 GitHub, Python 라이브러리(`python-kis`), 개발자 센터가 잘 갖춰져 있음
4. **모의투자 지원**: Paper trading 모드로 실제 돈 없이 테스트 가능
5. **AI/LLM 연동**: MCP 서버까지 제공하여 최신 AI 트렌드에 최적화

### 대안은 없나?

| 대안 | 가능 여부 | 비고 |
|------|----------|------|
| **이베스트투자증권 REST API** | **가능** | 수수료 저렴, 하지만 생태계/문서화가 KIS보다 약함 |
| 키움증권 Open API+ | **불가능** | Windows 32bit COM 전용 → Docker/Linux 불가 |
| 대신증권 CYBOS Plus | **불가능** | Windows COM 전용 |
| NH투자증권 | **미확인** | REST API 공식 미제공 |
| 해외 API (Alpaca 등) | **한국 ETF 불가** | 미국 주식만 지원 |

**결론**: Docker/Linux 환경에서 한국 ETF를 거래할 수 있는 REST API는 현실적으로 **KIS API**와 **이베스트투자증권 REST API** 두 가지뿐이며, 생태계와 문서화를 고려하면 KIS가 더 나은 선택이다.

### 참고 링크
- [KIS Developers 개발자 센터](https://apiportal.koreainvestment.com/intro)
- [KIS Open Trading API GitHub](https://github.com/koreainvestment/open-trading-api)
- [python-kis 커뮤니티 라이브러리](https://github.com/Soju06/python-kis)
- [증권사 별 Open API 차이](https://mg.jnomy.com/whatis-diff-stock-open-api)
- [증권사 API 장단점 비교 - 퀀티랩](https://blog.quantylab.com/htsapi.html)
- [대한민국 금융투자회사 API 목록 - 위키백과](https://ko.wikipedia.org/wiki/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD%EC%9D%98_%EA%B8%88%EC%9C%B5%ED%88%AC%EC%9E%90%ED%9A%8C%EC%82%AC_%EC%88%98%EC%88%98%EB%A3%8C_%EB%B0%8F_API_%EB%AA%A9%EB%A1%9D)

---

## 3. 63일이 맞는가?

### 결론: 63일은 맞다. 이 숫자는 ML 모델의 타겟과 정확히 일치한다.

### 근거 1: ML 모델의 타겟 변수가 63일

`docs/AHNLAB_MODEL_DATA_SUMMARY.md`에 명시되어 있음:

```
Target: 63-day forward return (regression) → Relevance labels (ranking)
target_3m = close[t+63] / close[t] - 1  (63-day forward return)
TARGET_HORIZON = 63 days
```

ML 모델이 **"63거래일 후 수익률이 가장 높을 종목"**을 예측하도록 학습되었으므로,
trading-service의 매수 보유 기간도 63거래일로 맞추는 것이 논리적으로 맞다.

### 근거 2: 63거래일 ≈ 3개월 (분기)

| 단위 | 거래일 수 |
|------|----------|
| 1주 | ~5일 |
| 1개월 | ~21일 |
| **3개월 (분기)** | **~63일** |
| 6개월 | ~126일 |
| 1년 | ~252일 |

63거래일은 금융에서 **3개월(1분기)**을 의미하는 표준적인 기간이다.

### 근거 3: 모멘텀 전략의 학술적 근거

학술 문헌에서 3~12개월 모멘텀 전략은 가장 널리 검증된 투자 전략 중 하나:
- Jegadeesh & Titman (1993): 3~12개월 모멘텀 효과 최초 발견
- **63일, 126일, 252일**은 기술적 분석과 모멘텀 전략에서 표준적으로 사용되는 기간

### 근거 4: 코드에서의 설정

`trading-service/app/config.py`:
```python
cycle_trading_days: int = 63  # 순환 주기 (거래일)
```

`docs/AHNLAB_MODEL_DATA_SUMMARY.md`:
```
TARGET_HORIZON | 63 days | Forward return period
```

**ML 모델의 예측 기간과 매매 보유 기간이 모두 63거래일로 일치** → 설계가 일관됨

### 참고 링크
- [Lookback Period in Trading - Optimal, Best](https://therobusttrader.com/lookback-period-in-trading-what-is-it-optimal-best/)
- [Momentum Factor Effect in Stocks - Quantpedia](https://quantpedia.com/strategies/momentum-factor-effect-in-stocks)
- [Jegadeesh & Titman (1993) - JSTOR](https://www.bauer.uh.edu/rsusmel/phd/jegadeesh-titman93.pdf)
- [Time Series Momentum - ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0304405X11002613)

---

## 4. ETF 구매 비율 3:7이 맞는가?

### 결론: 코드상 3:7 (30% 고정 / 70% 전략)이 맞지만, 현재 고정 ETF 목록이 비어있어 사실상 100% 전략 자금으로 운용된다.

### 코드에서의 설정

`trading-service/app/config.py`:
```python
strategy_ratio: float = 0.7   # 전략 자금 비율 (ML 랭킹 기반 매매)
fixed_ratio: float = 0.3      # 고정 편입 비율 (안정자산)
fixed_etf_codes: list[str] = []  # ← 비어있음!
```

### 의도된 설계

| 구분 | 비율 | 용도 | 현재 상태 |
|------|------|------|----------|
| 전략 자금 | 70% | ML 랭킹 Top 100 ETF 매수 | **동작 중** |
| 고정 자금 | 30% | 안정적인 ETF 고정 보유 (예: S&P500, 채권 ETF 등) | **미설정 (비어있음)** |

### 3:7 비율의 근거

이 비율은 일반적인 자산배분 전략에서 흔히 사용되는 비율:

1. **핵심/위성(Core/Satellite) 전략**: 전체 자산의 60~80%를 안정적 핵심 자산에, 20~40%를 공격적 위성 자산에 배분. 이 프로젝트는 반대로 적용 (공격적 70% / 안정적 30%)
2. **위험 성향**: 공격적(70:30) / 중립적(60:40) / 보수적(50:50)으로 조정 가능
3. **환경변수로 조정 가능**: `.env` 파일에서 `STRATEGY_RATIO=0.7`, `FIXED_RATIO=0.3` 변경 가능

### 주의 사항

- `fixed_etf_codes`가 비어있으므로 현재는 30% 고정 자금이 실제로 사용되지 않는 상태
- 고정 ETF를 설정하려면 `.env`에 `FIXED_ETF_CODES=069500,305540` 등을 추가해야 함
- 비율은 투자 성향에 따라 자유롭게 조정 가능 (예: 5:5, 6:4 등)

### 참고 링크
- [ETF 투자 전략 가이드: 자산배분 방법](https://stock1.brokdam.com/etf-%ED%88%AC%EC%9E%90-%EC%A0%84%EB%9E%B5-%EA%B0%80%EC%9D%B4%EB%93%9C-%EC%B4%88%EB%B3%B4%EB%B6%80%ED%84%B0-%EA%B3%A0%EC%88%98%EA%B9%8C%EC%A7%80-%EC%9E%90%EC%82%B0%EB%B0%B0%EB%B6%84-%EB%B0%A9%EB%B2%95/)
- [현명한 ETF투자: 핵심/위성 전략](https://www.kcie.or.kr/mobile/guide/3/18/web_view?series_idx=&content_idx=621)
- [레이달리오처럼 투자하기 - 토스피드](https://toss.im/tossfeed/article/asset-allocation-etf)

---

## 5. 자동화 방법

### 현재 구현된 자동화

#### 5.1 APScheduler (주 스케줄러)

`trading-service/app/main.py`에서 FastAPI 시작 시 자동 등록:

```python
# 매일 오전 8:30 KST 자동 실행
scheduler.add_job(
    execute_daily_trading,
    "cron",
    hour=settings.trade_hour_kst,    # 기본값: 8
    minute=settings.trade_minute_kst, # 기본값: 30
    timezone="Asia/Seoul",
)
```

#### 5.2 Cron Fallback (보조 스케줄러)

`trading-service/scripts/trade-daily.sh`:
```bash
curl -X POST http://localhost:8002/api/trading/execute
```
APScheduler가 실패할 경우를 대비한 cron job

#### 5.3 수동 실행

```bash
# API 호출로 즉시 매매 실행
curl -X POST http://localhost:8002/api/trading/execute

# 새 사이클 강제 시작
curl -X POST http://localhost:8002/api/trading/cycle/new
```

### 상위 프로젝트의 자동화 (전체 파이프라인)

`scripts/setup-cron.sh`에 설정된 작업들:

| 시간 | 작업 | 스크립트 |
|------|------|---------|
| 매일 오전 8시 | 전체 종목 ML 예측 | `predict-daily.sh` |
| 매일 오전 8:30 | ETF 자동매매 실행 | APScheduler (trading-service) |
| 매월 1일 새벽 3시 | ML 모델 재학습 | `train-monthly.sh` |

### 배포 자동화

```bash
# Docker Compose로 전체 서비스 시작
./start.sh

# trading-service만 빌드 & 시작
docker compose up -d --build trading-service

# 상태 확인
./status.sh
```

### 전체 데이터 흐름 (자동화 파이프라인)

```
[매일 자동]
오전 8:00  → Cron 실행 → predict-daily.sh → ML 예측 (Top 100 랭킹 생성)
오전 8:30  → APScheduler → trading-service → execute_daily_trading()
              ├─ KRX 거래일 확인
              ├─ KIS API 잔고 조회
              ├─ ml-service 랭킹 조회
              ├─ FIFO 매도 (Day 64+)
              ├─ 랭킹 기반 매수
              └─ SQLite 기록

[매월 자동]
매월 1일 새벽 3시 → 모델 재학습 → 최신 데이터로 LightGBM 갱신
```

---

## 6. 종합 정리

### Q&A 요약

| 질문 | 답변 |
|------|------|
| **이게 뭘 하는 건가?** | ML 예측 기반 ETF 자동매매 서비스. 매일 Top 100 ETF를 자동 매수/매도 |
| **왜 KIS API인가?** | Docker/Linux에서 동작하는 REST API 제공 증권사가 KIS와 이베스트뿐. KIS가 생태계/문서화 우위 |
| **다른 API 안 되나?** | 이베스트투자증권 REST API는 대안 가능. 키움/대신은 Windows COM 전용이라 불가 |
| **63일이 맞나?** | 맞음. ML 모델 타겟(63일 forward return)과 일치. 금융에서 63거래일=3개월(분기) |
| **3:7 비율이 맞나?** | 코드상 맞지만, 고정 ETF 목록이 비어있어 사실상 100% 전략 자금으로 운용 중 |
| **자동화 방법은?** | APScheduler(매일 8:30) + Cron fallback + Docker Compose |

### 추가 고려사항

1. **fixed_etf_codes 설정 필요**: 30% 고정 자금을 실제로 활용하려면 안정적 ETF 코드를 설정해야 함
2. **라이브 전환 주의**: `TRADING_MODE=live` + `KIS_LIVE_CONFIRMATION=true`로 변경 시 실제 돈으로 거래됨
3. **모의투자 API 주소**: `https://openapivts.koreainvestment.com:29443` (기본값)
4. **실투자 API 주소**: `https://openapi.koreainvestment.com:9443` (라이브 전환 시)
