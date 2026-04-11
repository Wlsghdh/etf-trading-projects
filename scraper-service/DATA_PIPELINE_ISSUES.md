# 데이터 파이프라인 문제점 보고서

> 작성일: 2026-04-11
> 작성자: cih0210
> 목적: `etf_63_pred` DB 구축 작업 중 발견한 `etf2_db` / `etf2_db_processed` 데이터 오염 이슈를 정리
> 상태: 선배 피드백 대기

---

## 0. 요약

종목별 10년치 평균 3개월 수익률(`target_3m`)을 계산해서 `etf_63_pred` DB에 저장하려던 중, 소스 데이터(`etf2_db`, `etf2_db_processed`)에 여러 층위의 오염이 발견되어 정상적인 집계가 불가능함.

- `{SYMBOL}_D` 테이블이 **일봉이 아닌 intraday 데이터를 섞어서 담고 있음**
- 같은 테이블에 **다른 가격대의 값**(원래 종목 가격과 무관한 값)이 섞여 있음
- 주식 분할(split) 보정이 파이프라인 어디에도 적용되지 않음
- 결과적으로 101종목 중 **66개 종목의 `target_3m` 최대값이 +500% 초과** (최대 +1,163,700%)

아래 번호별로 증거 + 관련 파일 경로를 정리함.

---

## 1. `{SYMBOL}_D` 테이블에 intraday 데이터가 섞여 있음

### 증거 (직접 MySQL 조회)

`AAPL_D` (etf2_db_processed) 2026-01-26 하루:

| time                | timeframe | close   |
|---------------------|-----------|---------|
| 2026-01-26 14:30    | D         | 247.97  |
| 2026-01-26 14:35    | D         | 251.19  |
| 2026-01-26 14:40    | D         | 252.60  |
| 2026-01-26 14:45    | D         | 252.72  |
| ... (총 78행)       | D         | ...     |

- `AAPL_D` 전체: **고유 날짜 4,089일**, **총 행수 10,088행** (2.47배 중복)
- 하루당 행수 분포: 1행/일 3,141일, 13행/일 138일, **78행/일 29일**, 82행/일 1일
- `timeframe` 컬럼은 모두 `'D'`로 라벨링되어 있음에도 실제로는 5분 간격 데이터

### 관련 파일

| 파일 | 라인 | 설명 |
|------|------|------|
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/app/services/db_service.py` | 104–128 | `get_table_name()`에서 `"12달": "D"` 하드코딩 매핑. 다운로드 파일이 실제로 일봉인지 검증 없음 |
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/app/services/db_service.py` | 144–168 | `create_table_if_not_exists()` - PRIMARY KEY가 `time` 만. 심볼/타임프레임 복합 유니크 제약 없음 → 같은 time에 다른 timeframe 값이 들어오면 감지 불가 |
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/scripts/tradingview_playwright_scraper_upload.py` | 전체 | TradingView CSV 다운로드 → DB upsert. 다운로드된 CSV의 timeframe 검증 없음 |
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/app/services/processed_db_service.py` | 137 | 가공 DB 테이블도 PRIMARY KEY가 `time` 만 |

---

## 2. 같은 테이블에 **완전히 다른 가격대**의 값이 섞임 (더 심각)

### 증거: `CSCO_D` (etf2_db)

```
CSCO_D 전체: 10,791행
  close 최소: 0.07118100
  close 최대: 1,170.26
  close 평균: 85.10
```

- 실제 CSCO 주가 범위: **약 $20 ~ $65** (2010~2025)
- 그런데 테이블 안에 **$0.07** 부터 **$1,170** 까지 들어있음 (16,000배 차이)

2024-01-02 하루 안의 샘플:

| time                 | close  |
|----------------------|--------|
| 2024-01-02 00:00     | 50.51  ← 정상 CSCO 일봉 |
| 2024-01-02 14:30     | 861.98 ← CSCO일 수 없음 |
| 2024-01-02 17:00     | 861.00 ← CSCO일 수 없음 |

- `close > 500` 인 행: **752행** (기간: 2022-02-24 ~ 2024-08-07)
- `close 40~70` 인 정상 CSCO 행: 2,316행
- 하루 안에서 max/min close 비율이 2배 초과하는 날: **333일**
- `symbol` 컬럼은 모두 `'CSCO'` → 삽입 경로가 잘못된 것이지, 라벨이 잘못된 것은 아님

`ABBV_D` 도 유사: close 범위가 **0.226 ~ 3,635.50** (실제 ABBV는 $50~$180 범위)

### 의미

정상적인 CSCO 데이터에 **다른 종목의 데이터가 같은 테이블에 잘못 insert**된 것으로 보임. 다음 경로 중 하나가 원인으로 추정됨:

1. 스크래퍼가 종목별로 CSV를 다운로드할 때 **이전 종목의 세션 데이터가 다음 종목 테이블에 들어감**
2. Playwright 브라우저 컨텍스트/쿠키 공유 버그로 심볼 파라미터가 헛돌아감
3. 파일명 매칭 버그로 종목과 테이블 매핑이 어긋남

`target_3m` 계산이 이 오염된 `close` 값들로 돌기 때문에 극단치가 나옴.

### 관련 파일

| 파일 | 설명 |
|------|------|
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/scripts/tradingview_playwright_scraper_upload.py` | Playwright 스크래핑 메인 로직 - 종목 루프, 다운로드, DB 업로드 |
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/app/services/scraper.py` | Docker API 스크래퍼 |
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/app/services/db_service.py` (145–200) | `upsert_dataframe` - 심볼 검증 없이 테이블명 기준으로만 insert |

---

## 3. 주식 분할(split) 보정이 적용되지 않음

### 증거

```sql
-- etf2_db에 corporate_splits / corporate_dividends 테이블을 찾았으나 존재하지 않음
SHOW TABLES LIKE 'corporate_splits';    -- 결과: 없음
SHOW TABLES LIKE 'corporate_dividends'; -- 결과: 없음
```

yfinance provider 소스:

```python
# ml-service/ml/features/data_providers/yfinance_provider.py:19
df = stock.history(start=start_date, end=end_date, auto_adjust=False)
```

- `auto_adjust=False` → **yfinance가 split/dividend를 자동 보정하지 않음**
- 동시에 코드베이스 어디에도 수동으로 split 보정을 적용하는 로직 없음
- `mysql_provider.py` 는 `df['dividends'] = 0.0`, `df['stock_splits'] = 0.0`로 명시적으로 0 주입 (라인 132–133)

### 의미

split 전 가격과 split 후 가격이 섞여 있는 상태에서 `pct_change()` 가 돌면 수십~수천 배 "수익률"이 기록됨. 특히 2010년 이후 여러 차례 분할한 종목(AAPL, NVDA, TSLA 등)에서 치명적.

### 관련 파일

| 파일 | 라인 | 설명 |
|------|------|------|
| `/project/2026winter/cih0210/etf-trading-project/ml-service/ml/features/data_providers/yfinance_provider.py` | 19 | `auto_adjust=False` - 원본 가격 사용 |
| `/project/2026winter/cih0210/etf-trading-project/ml-service/ml/features/data_providers/mysql_provider.py` | 132–133 | 분할/배당 컬럼을 0으로 채움 |
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/app/services/yfinance_service.py` | 전체 | 분할/배당 수집은 되지만 저장/적용되는 경로가 없음 |

---

## 4. `target_3m` 계산이 행(row) 기반이라 intraday 섞였을 때 의미가 깨짐

### 증거

```python
# ml-service/ml/features/pipeline.py:247-252
panel['target_3m'] = panel.groupby('ticker')['close'].transform(
    lambda x: x.pct_change(self.target_horizon).shift(-self.target_horizon)
)
panel['target_date'] = panel.groupby('ticker')['date'].shift(-self.target_horizon)
```

- **수식 자체는 수학적으로 맞음**: `pct_change(n).shift(-n)` = 미래 n-행 수익률
- 테스트 검증:
  ```
  close=[100,105,110,108,112,115,120], horizon=3
  → [0.08, 0.067, 0.045, 0.111, nan, nan, nan]
  → 0번째 값은 (108-100)/100 = 0.08 ✓
  ```
- **문제**: "n-행"은 "n-일"이 아님. AAPL_D처럼 하루에 78행이 섞여 있으면 63행 후는 **실제로는 1일도 안 되는 미래**. 의미상 "3개월 수익률"이 아니라 "약 1일 수익률" 또는 엉뚱한 값.

### 관련 파일

| 파일 | 라인 | 설명 |
|------|------|------|
| `/project/2026winter/cih0210/etf-trading-project/ml-service/ml/features/pipeline.py` | 245–254 | `_add_target` - row 기반 shift. 날짜 기반 조인으로 바꿔야 함 |
| `/project/2026winter/cih0210/etf-trading-project/ml-service/ml/features/returns.py` | 143 | 별도 구현 `close.shift(-target_horizon) / close - 1`. 동일한 문제(row 기반) |

---

## 5. 데이터 중복 방지 / 무결성 제약이 없음

### 증거

```sql
-- scraper-service/app/services/db_service.py:162
PRIMARY KEY (`time`)

-- scraper-service/app/services/processed_db_service.py:137
PRIMARY KEY (`time`)
```

- 테이블 구조는 `(time, symbol, timeframe, open, high, low, close, ...)` 인데
- PRIMARY KEY 가 `time` 만
- 즉 같은 시각에 timeframe이 달라도, symbol이 달라도 **이전 값이 덮어써짐** (또는 그대로 insert되면 duplicate error)
- 적어도 `PRIMARY KEY (symbol, timeframe, time)` 가 되어야 무결성 보장 가능

### 관련 파일

| 파일 | 라인 |
|------|------|
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/app/services/db_service.py` | 150–168 |
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/app/services/processed_db_service.py` | 120–145 |

---

## 6. 피처 시프트와 타겟 계산 순서 (잠재적 look-ahead 우려)

### 증거

```python
# pipeline.py:247-252 (target 계산)
panel['target_3m'] = panel.groupby('ticker')['close'].transform(
    lambda x: x.pct_change(self.target_horizon).shift(-self.target_horizon)
)

# pipeline.py:256-275 (feature shift)
def _shift_features(self, panel):
    ...
    for col in feature_cols:
        panel[col] = panel.groupby('ticker')[col].shift(1)
```

- 타겟은 현재 시점 `close`를 기준으로 계산됨
- 피처는 `shift(1)` 로 한 칸 뒤로 밀림 (과거 값 사용 → look-ahead 방지)
- 결과: 행 `t`에서 피처는 `t-1` 시점 값, 타겟은 `t` 시점 `close`로 계산된 값
- **이건 의도된 구조일 수도** 있음 (피처=t-1 기준, 타겟=t→t+63 수익률) 하지만 주석/의도 문서 없음

### 관련 파일

| 파일 | 라인 |
|------|------|
| `/project/2026winter/cih0210/etf-trading-project/ml-service/ml/features/pipeline.py` | 245–275 |

---

## 7. 검증 스크립트 존재 여부

- `/project/2026winter/cih0210/etf-trading-project/scraper-service/scripts/validate_data.py` 가 README(`scraper-service/CLAUDE.md`)에 언급되어 있으나, **위 1~2번 이슈는 감지하지 못하고 있음**
- 해당 스크립트가 `(symbol, timeframe, time)` 유니크성 검증, intraday 섞임 감지, 가격 이상치 감지 등을 돌리는지 확인 필요

### 관련 파일

| 파일 | 설명 |
|------|------|
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/scripts/validate_data.py` | 검증 스크립트 - 실제 동작 확인 필요 |
| `/project/2026winter/cih0210/etf-trading-project/scraper-service/CLAUDE.md` | 검증 항목 목록 (중복 타임스탬프 검사, 가격 이상치 탐지 등 포함됨) - 실제로 돌아가는지? |

---

## 8. 관찰된 결과 (실제 계산 시)

`scripts/backtest_rank_returns.py` 로 101 종목 `target_3m` 평균 계산 시:

```
전체 평균 수익률: +166.76%
[Top 10]
   1 | NOW      | +9269.48% | 중앙값  +0.37% |  표본 7793
   2 | PG       |  +836.72% | 중앙값  +0.14% |  표본 8806
   3 | ISRG     |  +525.61% | 중앙값  +0.56% |  표본 7802
   ...
```

- **중앙값은 0.x% 로 정상** → 대다수 값은 현실적이지만 소수의 극단치(수천~수만)가 평균을 왜곡
- 표본 수가 종목당 7,000~9,000 (15년치면 약 4,000이어야 함) → 섹션 1의 중복 문제 재확인
- **이 결과는 의미 없음** → 데이터 수정 전에는 `etf_63_pred` 에 저장할 수 없음

### 현재 상태

- `backtest_rank_returns.py` 는 브랜치 `feat/backtest-avg-returns` 에 작성됨 (아직 commit/push 하지 않음)
- `etf_63_pred` DB는 생성했으나 오염된 데이터가 담겨 있는 상태
- 파이프라인 수정 후 `--force-recalc` 로 재계산 가능하도록 설계됨

---

## 9. 선배님께 여쭤볼 점

1. **1번 (intraday 섞임)**: 스크래퍼의 timeframe 매핑/검증 수정이 필요한데, 박성문 선배(scraper 담당)에게 전달해야 할까요? 아니면 제가 임시로 `DISTINCT DATE(time)` 기반으로 스크립트에서 우회할까요?

2. **2번 (다른 종목 데이터 섞임)**: CSCO_D에 $861 close가 들어간 현상 — 스크래퍼 로직 자체 버그로 보입니다. 원인 디버깅부터 해야 할지, 일단 이상치 필터만 해놓고 진행할지 의견 부탁드립니다.

3. **3번 (split 미보정)**: `yfinance_service.py` 에 분할 데이터 수집 로직은 있는데, 실제 OHLCV에 적용되는 경로가 없어 보입니다. 이 부분은 애초에 구현 계획에 없던 건가요?

4. **4번 (row 기반 shift)**: 1번이 해결되면 자연스럽게 해결되지만, 안전하게 날짜 기반 조인으로 바꾸는 게 낫지 않을까요?

5. **5번 (PK 제약)**: `ALTER TABLE` 은 프로덕션 DB라 조심스러운데, 새로 만드는 테이블(`etf_63_pred`)부터는 `PRIMARY KEY (ticker)` 로 제대로 걸어두면 될까요?

6. **6번 (shift 순서)**: 현재 구현이 의도된 건지, 타겟도 피처 시프트에 맞춰 재조정해야 하는지 확인 부탁드립니다.

---

## 10. 참고 - 우리가 건드리지 않은 것

- **MySQL 데이터는 수정/삭제하지 않았음** (조회만)
- **기존 브랜치 / 기존 파일을 덮어쓰지 않았음**
- `feat/backtest-avg-returns` 브랜치는 아직 push 하지 않음
- `etf_63_pred` DB는 우리가 새로 만들었음 (CREATE DATABASE IF NOT EXISTS) - 오염 데이터 담김, 재생성 가능
