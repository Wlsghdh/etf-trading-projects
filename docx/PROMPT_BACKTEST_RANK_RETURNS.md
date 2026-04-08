# 모델 예측 순위별 실제 수익률 백테스트 프롬프트

## 목표

우리 LambdaRank 모델이 매일 매긴 1등~N등에 대해, **과거 데이터에서 각 순위의 실제 3개월 수익률이 평균 몇 %였는지** 통계를 내는 시스템을 만들어라.

핵심 질문: **"모델이 1등으로 뽑은 종목은 실제로 평균 몇 % 올랐는가?"**

### 중요 맥락

- **현재**: 101개 종목만 수집/예측 중
- **향후**: 1000개 종목으로 확대 예정
- 종목 수가 늘어나면 매번 전체를 다시 계산하기엔 시간이 너무 오래 걸림
- 따라서 **백테스트 결과를 SQLite DB에 저장**해서, 한 번 계산하면 다음부터는 DB 조회만으로 통계를 뽑을 수 있게 해야 한다

### 현재 시스템의 문제점

이 백테스트 작업을 해야 하는 이유이자, 현재 시스템에 없는 것들:

1. **모델 성과 검증 수단이 없다**
   - 모델이 매일 1등~101등을 매기지만, 그 결과가 실제로 맞았는지 확인하는 시스템이 없음
   - "우리 모델이 1등으로 뽑은 종목이 평균 몇 % 올랐는가?"에 대한 답이 없음
   - 교수님/투자자에게 모델 성과를 보여줄 근거 자료가 없음

2. **예측 이력이 축적되지 않는다**
   - 현재 일일 예측(predict_ranking)은 실행할 때마다 최신 1회분만 SQLite에 저장
   - 과거에 모델이 어떤 순위를 매겼는지 히스토리가 쌓이지 않음
   - 시간이 지나면 과거 예측 결과를 복원할 수 없음

3. **모델 재학습 후 비교가 불가능하다**
   - 새 모델을 학습해도 "이전 모델 대비 좋아졌는지" 비교할 데이터가 없음
   - model_version별 성과 비교 시스템이 없음

4. **종목 확대 시 전체 재작업 필요**
   - 현재 101종목 → 1000종목으로 확대하면 **데이터 수집, 피처 처리, 모델 재학습, 백테스트 전부 다시 해야 함**
   - 모델은 "101개 중 누가 1등인가"를 배웠기 때문에, 1000개가 되면 새 종목 899개에 대해 아는 게 없음
   - 재학습 없이 예측만 돌리면 순위가 의미 없음
   - 백테스트 결과를 DB에 저장해놓으면, 101종목 시절/1000종목 시절 성과를 비교 가능

5. **백테스트 계산 비용이 크다**
   - 101종목 × 2500일 = 25만 건 예측 → 현재는 수 분
   - 1000종목 × 2500일 = 250만 건 예측 → 수십 분 ~ 수 시간
   - 매번 처음부터 다시 계산할 수 없으므로, SQLite에 저장하고 증분 업데이트해야 함

---

## 최종 결과물 예시

### 리포트 출력 예시

```
=== AhnLab LightGBM LambdaRank 백테스트 결과 ===
기간: 2023-01-01 ~ 2025-06-30 (약 625 거래일)
모델: ahnlab_lgbm (2-fold ensemble)
종목 수: 101

[순위별 평균 3개월(63일) 수익률]
│ 순위     │ 평균 수익률 │ 중앙값  │ 승률(>0%) │ 표본 수 │
│ 1등      │ +12.3%     │ +10.1% │ 72.5%     │ 625     │
│ 2등      │ +11.8%     │ +9.8%  │ 71.2%     │ 625     │
│ 3등      │ +11.1%     │ +9.2%  │ 69.8%     │ 625     │
│ 5등      │ +10.2%     │ +8.5%  │ 68.1%     │ 625     │
│ 10등     │ +8.5%      │ +7.1%  │ 65.4%     │ 625     │
│ 50등     │ +2.1%      │ +1.5%  │ 52.3%     │ 625     │
│ 100등    │ -5.2%      │ -4.8%  │ 35.1%     │ 625     │
│ 101등    │ -7.8%      │ -6.9%  │ 30.4%     │ 625     │

[그룹별 평균 3개월 수익률]
│ 그룹          │ 평균 수익률 │ 승률   │ vs 전체평균 │
│ Top 5 (1~5등) │ +11.1%     │ 70.3%  │ +8.6%      │
│ Top 10        │ +9.8%      │ 67.8%  │ +7.3%      │
│ Top 20        │ +8.2%      │ 64.5%  │ +5.7%      │
│ 전체 평균     │ +2.5%      │ 53.1%  │  0.0%      │
│ Bottom 10     │ -5.8%      │ 33.2%  │ -8.3%      │
│ Long-Short    │ +15.6%     │        │            │
│ (Top10-Bot10) │            │        │            │

[연도별 성과]
│ 연도 │ Top5 수익률 │ 전체 평균 │ Top5 - 전체 │
│ 2023 │ +14.2%      │ +3.1%    │ +11.1%      │
│ 2024 │ +9.8%       │ +2.0%    │ +7.8%       │
│ 2025 │ +8.5%       │ +1.8%    │ +6.7%       │
```

---

## 시스템 설계: SQLite에 저장하여 재사용

### 왜 SQLite에 저장해야 하는가

```
현재 (101종목):
  매 거래일 101개 × 약 625일 = 63,125건 예측
  → 계산 시간: 수 분

향후 (1000종목):
  매 거래일 1000개 × 약 625일 = 625,000건 예측
  → 계산 시간: 수십 분 ~ 수 시간

해결책:
  한 번 계산한 결과를 SQLite에 저장
  → 다음부터는 SELECT만 하면 됨 (1초)
  → 새 날짜가 추가되면 그 날짜만 추가 계산 (증분 업데이트)
```

### SQLite 테이블 설계

기존 `ml-service/data/predictions.db` SQLite 파일에 새 테이블을 추가하거나, 별도 `ml-service/data/backtest.db`를 만들어라. (판단은 구현자에게 맡김)

```sql
-- 1. 일별 순위별 예측 결과 (핵심 테이블)
CREATE TABLE backtest_daily_ranks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    backtest_date   DATE NOT NULL,        -- 예측 실행 날짜
    rank            INTEGER NOT NULL,     -- 모델이 매긴 순위 (1등~N등)
    ticker          VARCHAR(20) NOT NULL, -- 종목 코드
    score           REAL NOT NULL,        -- 모델 원시 점수
    actual_return   REAL,                 -- 실제 63일 후 수익률 (NULL이면 아직 모름)
    current_close   REAL,                 -- 예측일의 종가
    model_name      VARCHAR(50) DEFAULT 'ahnlab_lgbm',
    model_version   VARCHAR(50),          -- 모델 버전 (v20260401 등)
    n_symbols       INTEGER,              -- 그 날 전체 종목 수
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(backtest_date, rank, model_name)  -- 같은 날 같은 모델이면 순위 중복 불가
);

CREATE INDEX idx_backtest_date ON backtest_daily_ranks(backtest_date);
CREATE INDEX idx_backtest_rank ON backtest_daily_ranks(rank);
CREATE INDEX idx_backtest_ticker ON backtest_daily_ranks(ticker);
CREATE INDEX idx_backtest_model ON backtest_daily_ranks(model_name);

-- 2. 백테스트 실행 메타데이터
CREATE TABLE backtest_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    model_name      VARCHAR(50) NOT NULL,
    model_version   VARCHAR(50),
    start_date      DATE NOT NULL,        -- 백테스트 시작일
    end_date        DATE NOT NULL,        -- 백테스트 종료일
    n_trading_days  INTEGER,              -- 거래일 수
    n_symbols       INTEGER,              -- 종목 수
    status          VARCHAR(20) DEFAULT 'completed',  -- running/completed/failed
    note            TEXT
);
```

### 사용 시나리오

```
[시나리오 1: 최초 실행]
$ python scripts/backtest_rank_returns.py

→ etf2_db_processed에서 전 종목 히스토리 로드
→ 모든 거래일에 대해 모델 예측 → 순위 → 실제 수익률
→ 결과를 backtest_daily_ranks 테이블에 INSERT
→ 통계 집계 → 리포트 출력
→ 소요시간: 5~10분

[시나리오 2: 다음날 실행 (증분 업데이트)]
$ python scripts/backtest_rank_returns.py

→ backtest_daily_ranks에서 마지막 날짜 확인
→ 그 이후 새 날짜만 추가 계산
→ 소요시간: 수 초

[시나리오 3: 통계만 보고 싶을 때]
$ python scripts/backtest_rank_returns.py --stats-only

→ DB에서 SELECT만 수행 → 통계 집계 → 리포트 출력
→ 예측 계산 안 함
→ 소요시간: 1초

[시나리오 4: 모델을 새로 학습한 후]
$ python scripts/backtest_rank_returns.py --force-recalc

→ 기존 결과 삭제 후 전체 재계산
→ 새 모델 버전으로 갱신

[시나리오 5: 종목이 1000개로 늘어난 후]
$ python scripts/backtest_rank_returns.py

→ 이전 101종목 결과는 DB에 그대로 보존
→ 새 기간(종목 추가 이후)만 1000종목으로 계산
→ n_symbols 컬럼으로 시기 구분 가능
```

---

## 데이터 위치 & 접속 정보

### 데이터베이스 3개

```
1. MySQL: etf2_db (원본 OHLCV)
   - 접속: mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_db
   - Docker 외부: SSH 터널 필요 (ssh -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr)
   - 테이블: {SYMBOL}_D, {SYMBOL}_30m, {SYMBOL}_5m, {SYMBOL}_1m (약 500개)
   - 컬럼: time, symbol, timeframe, open, high, low, close, volume, rsi, macd
   - 용도: 이 작업에서는 직접 사용하지 않음

2. MySQL: etf2_db_processed (피처 + 타겟) ★ 이 작업의 데이터 소스
   - 접속: mysql+pymysql://ahnbi2:bigdata@host.docker.internal:3306/etf2_db_processed
   - Docker 외부: 위와 동일한 SSH 터널
   - 테이블: {SYMBOL}_D (약 101개, 종목당 1개)
   - 컬럼: time, symbol, timeframe, 95개 피처, target_3m, target_date, processed_at
   - 데이터 범위: 약 2010년 ~ 현재 (종목마다 다름)
   - 행 수: 종목당 약 2,500~3,500행 (거래일)
   - 용도: 피처 로드 + 실제 수익률(target_3m) 확인

3. SQLite: predictions.db (예측 결과 저장) ★ 백테스트 결과 저장 위치
   - 경로: ml-service/data/predictions.db
   - 기존 테이블: predictions, etf_monthly_snapshots, etf_compositions
   - 새로 추가: backtest_daily_ranks, backtest_runs
   - 용도: 백테스트 결과 영구 저장
```

### DB 접속 방법 (코드에서)

```python
# etf2_db_processed 접속 (기존 코드 참고: train_ahnlab.py:118-127)
import os
from sqlalchemy import create_engine

def get_processed_db_url():
    url = os.getenv("PROCESSED_DB_URL")
    if url:
        return url
    host = os.getenv("MYSQL_HOST", "host.docker.internal")
    port = os.getenv("MYSQL_PORT", "3306")
    user = os.getenv("MYSQL_USER", "ahnbi2")
    password = os.getenv("MYSQL_PASSWORD", "bigdata")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/etf2_db_processed"

processed_engine = create_engine(get_processed_db_url(), pool_pre_ping=True)

# SQLite 접속 (백테스트 결과 저장용)
local_db_path = os.getenv("LOCAL_DB_PATH", "data/predictions.db")
local_engine = create_engine(f"sqlite:///{local_db_path}")
```

### 모델 파일 위치

```
ml-service/data/models/ahnlab_lgbm/
├── current → v20260401/              (심링크, 현재 활성 모델)
├── v20260401/
│   ├── ahnlab_lgbm_fold0.txt         (LightGBM Booster, Fold 0)
│   ├── ahnlab_lgbm_fold1.txt         (LightGBM Booster, Fold 1)
│   └── metadata.json                 (학습 메타데이터)
└── versions.json                     (버전 히스토리)
```

```python
# 모델 로드 방법 (ahnlab_lgbm.py:682-705 참고)
from ml.models.ahnlab_lgbm import AhnLabLGBMRankingModel

model = AhnLabLGBMRankingModel()
model.load(
    path="data/models/ahnlab_lgbm/current/ahnlab_lgbm",  # fold0.txt, fold1.txt 자동 로드
    n_folds=2
)
# 이제 model.predict(X) 사용 가능
```

### 피처 목록 (95개)

```python
# 전체 피처 정의: ml-service/ml/features/ahnlab/constants.py
from ml.features.ahnlab.constants import ALL_FEATURE_COLS
# len(ALL_FEATURE_COLS) = 95
# BASE(59) + ENGINEERED(24) + Z_SCORE(7) + RANK(5)
```

---

## 프로젝트 구조 & 관련 파일

루트: `etf-trading-project/`

### 읽어야 할 핵심 파일

```
ml-service/
├── ml/
│   ├── models/
│   │   └── ahnlab_lgbm.py              ★ 모델 클래스 (predict, load 메서드)
│   ├── features/
│   │   └── ahnlab/
│   │       └── constants.py            ★ 95개 피처 목록 (ALL_FEATURE_COLS)
│   └── utils/
│       └── evaluation.py               ★ 기존 평가 유틸 (참고용)
├── scripts/
│   └── train_ahnlab.py                 ★ DB에서 패널 데이터 로드하는 방법 (load_panel_from_db)
├── app/
│   ├── models.py                       ★ 기존 ORM 모델 (Prediction 등)
│   ├── database.py                     ★ DB 엔진/세션 설정
│   └── services/
│       ├── prediction_service.py       ★ predict_ranking 로직 참고
│       ├── processed_data_service.py   ★ etf2_db_processed에서 피처 로드
│       └── model_loader.py             ★ 모델 파일 로딩
└── data/
    ├── predictions.db                  ★ SQLite (백테스트 결과 여기에 저장)
    └── models/
        └── ahnlab_lgbm/
            └── current/                ★ 학습된 모델 파일
```

### 새로 만들 파일

```
ml-service/scripts/backtest_rank_returns.py    ← 메인 스크립트 (예측 + 저장 + 통계)
```

---

## 구현 상세

### 전체 흐름

```
backtest_rank_returns.py 실행
  │
  ├── [1] SQLite에서 기존 백테스트 결과 확인
  │     → 마지막으로 계산한 날짜 확인
  │     → 이미 전부 있으면 --stats-only와 동일
  │
  ├── [2] etf2_db_processed에서 패널 데이터 로드
  │     → train_ahnlab.py의 load_panel_from_db() 재사용/참고
  │     → 피처 1일 시프트 적용
  │
  ├── [3] 학습된 모델 로드
  │     → data/models/ahnlab_lgbm/current/ 에서 fold 파일 로드
  │
  ├── [4] 날짜별 예측 루프 (증분: 새 날짜만)
  │     → 각 거래일마다:
  │        - 그 날의 종목 피처 추출
  │        - model.predict(X) → 점수
  │        - 점수 정렬 → 순위
  │        - 실제 수익률(target_3m) 매칭
  │        - SQLite에 INSERT
  │
  ├── [5] 통계 집계 (SQLite에서 SELECT)
  │     → 순위별 평균/중앙값/승률
  │     → 그룹별 (Top5, Top10, Top20, Bottom10, Long-Short)
  │     → 연도별
  │
  └── [6] 리포트 출력
        → 터미널 출력
        → CSV/JSON 파일 저장
```

### 데이터 로드 (Step 2)

```python
# train_ahnlab.py:130-171 참고
def load_panel_from_db(engine) -> pd.DataFrame:
    """etf2_db_processed에서 전 종목 패널 데이터 로드"""

    # 1. 테이블 목록 조회
    tables = query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                   "WHERE TABLE_SCHEMA='etf2_db_processed' AND TABLE_NAME LIKE '%_D'")
    # → ['AAPL_D', 'MSFT_D', 'NVDA_D', ..., 'ACN_D']  (101개)

    # 2. 각 테이블에서 데이터 로드
    for table in tables:
        symbol = table.replace('_D', '')
        df = query(f"SELECT time, target_3m, {95개 피처} FROM {table} ORDER BY time")
        df["ticker"] = symbol

    # 3. 전체 합치기
    panel = pd.concat(all_dfs)
    # shape: 약 (250000, 98)  →  101종목 × ~2500일, 컬럼: date, ticker, target_3m, 95피처

    return panel
```

### 피처 시프트 (Step 2 이후)

```python
# 반드시 적용! 안 하면 미래 데이터 누출로 성과가 비현실적으로 좋게 나옴
grouped = panel.groupby("ticker")
for col in ALL_FEATURE_COLS:
    if col in panel.columns:
        panel[col] = grouped[col].shift(1)
# → 각 종목별로 피처를 1일 뒤로 밀어줌
# → "오늘의 피처"가 아니라 "어제의 피처"로 예측하게 됨
```

### 백테스트 루프 (Step 4)

```python
results = []
dates = sorted(panel["date"].unique())

# SQLite에서 이미 계산된 마지막 날짜 확인
last_calculated = query("SELECT MAX(backtest_date) FROM backtest_daily_ranks "
                        "WHERE model_name='ahnlab_lgbm'")

for date in dates:
    if date <= last_calculated:
        continue  # 이미 계산됨 → 스킵 (증분 업데이트)

    day_df = panel[panel["date"] == date].copy()

    # target_3m이 전부 NaN이면 스킵 (63일 후 수익률 미확정)
    if day_df["target_3m"].isna().all():
        continue

    # 피처 추출 → 모델 예측
    X = day_df[[c for c in ALL_FEATURE_COLS if c in day_df.columns]]
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0)
    scores = model.predict(X)

    # 점수 정렬 → 순위
    day_df["score"] = scores
    day_df = day_df.sort_values("score", ascending=False).reset_index(drop=True)
    day_df["rank"] = range(1, len(day_df) + 1)

    # SQLite에 저장
    for _, row in day_df.iterrows():
        insert_into_backtest_daily_ranks(
            backtest_date=date,
            rank=row["rank"],
            ticker=row["ticker"],
            score=row["score"],
            actual_return=row["target_3m"],  # NaN이면 NULL로 저장
            current_close=row.get("close"),
            model_name="ahnlab_lgbm",
            model_version=metadata["version"],
            n_symbols=len(day_df),
        )
```

### 통계 집계 (Step 5) — SQLite 쿼리

```sql
-- 순위별 평균 수익률
SELECT
    rank,
    AVG(actual_return) AS mean_return,
    COUNT(*) AS sample_count,
    SUM(CASE WHEN actual_return > 0 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS win_rate
FROM backtest_daily_ranks
WHERE actual_return IS NOT NULL
  AND model_name = 'ahnlab_lgbm'
GROUP BY rank
ORDER BY rank;

-- Top 5 평균
SELECT AVG(actual_return) FROM backtest_daily_ranks
WHERE rank <= 5 AND actual_return IS NOT NULL;

-- Bottom 10 평균
SELECT AVG(actual_return) FROM backtest_daily_ranks
WHERE rank >= (SELECT MAX(rank) - 9 FROM backtest_daily_ranks WHERE backtest_date = ...)
AND actual_return IS NOT NULL;

-- 연도별 Top5 성과
SELECT
    strftime('%Y', backtest_date) AS year,
    AVG(actual_return) AS top5_mean
FROM backtest_daily_ranks
WHERE rank <= 5 AND actual_return IS NOT NULL
GROUP BY year;
```

---

## 기존 코드 활용

### 이미 있는 것 (재사용 가능)

| 파일 | 함수/클래스 | 용도 |
|------|------------|------|
| `scripts/train_ahnlab.py` | `load_panel_from_db()` | ★ 패널 데이터 로드 (그대로 사용 가능) |
| `scripts/train_ahnlab.py` | `get_db_url()` | DB URL 생성 |
| `ml/models/ahnlab_lgbm.py` | `AhnLabLGBMRankingModel.load()` | 모델 로드 |
| `ml/models/ahnlab_lgbm.py` | `AhnLabLGBMRankingModel.predict()` | 앙상블 예측 |
| `ml/features/ahnlab/constants.py` | `ALL_FEATURE_COLS` | 95개 피처 목록 |
| `ml/utils/evaluation.py` | `backtest_strategy()` | 참고용 (Top-100 백테스트) |
| `ml/utils/evaluation.py` | `calculate_actual_top100()` | 참고용 (실제 Top-100 계산) |
| `app/database.py` | DB 엔진 설정 | SQLite 엔진 생성 방법 참고 |

### 새로 만들어야 하는 것

| 기능 | 설명 |
|------|------|
| **SQLite 테이블 생성** | backtest_daily_ranks, backtest_runs |
| **증분 업데이트 로직** | 마지막 계산일 이후만 추가 계산 |
| **순위별 수익률 집계** | 1등~N등 각각의 평균/중앙값/승률/표준편차 |
| **그룹별 집계** | Top 5/10/20, Bottom 10, Long-Short, 전체 평균 |
| **연도별 집계** | 연도×그룹 크로스탭 |
| **리포트 출력** | 터미널 테이블 + CSV + JSON |
| **CLI 옵션** | --stats-only, --force-recalc, --start-date, --end-date |

---

## CLI 인터페이스

```bash
python scripts/backtest_rank_returns.py [옵션]

옵션:
  --stats-only          DB에서 통계만 조회 (예측 계산 안 함)
  --force-recalc        기존 결과 삭제 후 전체 재계산
  --start-date DATE     백테스트 시작일 (기본: 데이터 최초일)
  --end-date DATE       백테스트 종료일 (기본: target_3m 있는 마지막 날)
  --output DIR          결과 저장 디렉토리 (기본: ml-service/results/)
  --model-name NAME     모델 이름 (기본: ahnlab_lgbm)
```

---

## 실행 방법

```bash
# Docker 컨테이너 내부에서
docker exec -it etf-ml-service python scripts/backtest_rank_returns.py

# 로컬에서 (SSH 터널 필요: ssh -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr)
cd ml-service
python scripts/backtest_rank_returns.py

# 통계만 빠르게 보기
python scripts/backtest_rank_returns.py --stats-only

# 전체 재계산 (모델 재학습 후)
python scripts/backtest_rank_returns.py --force-recalc
```

---

## 출력 파일

```
ml-service/results/
├── backtest_rank_returns.csv     ← 순위별 통계 (스프레드시트용)
├── backtest_rank_returns.json    ← 전체 결과 (프로그래밍용)
└── backtest_summary.txt          ← 사람이 읽는 요약 리포트

ml-service/data/
└── predictions.db                ← SQLite (backtest_daily_ranks 테이블 추가됨)
    또는 backtest.db              ← 별도 SQLite 파일 (구현자 판단)
```

---

## 주의사항

### 피처 1일 시프트 필수

백테스트 시 반드시 피처를 1일 시프트해야 한다. 안 하면 "오늘의 정보로 오늘을 예측"하는 꼴이 되어 성과가 비현실적으로 좋게 나온다.

```python
grouped = panel.groupby("ticker")
for col in ALL_FEATURE_COLS:
    if col in panel.columns:
        panel[col] = grouped[col].shift(1)
```

### 학습/검증 기간 구분

현재 모델(pred_year=2026)의 학습/검증 기간:
- Fold 0: ~2022년 학습, 2023년 검증
- Fold 1: ~2024년 학습, 2025년 검증

리포트에서 이 기간을 구분 표시하면 좋다:
- "학습에 사용된 기간"의 성과 → 과적합 가능성
- "검증 기간"의 성과 → 좀 더 신뢰할 수 있음
- "둘 다 아닌 기간"의 성과 → 가장 신뢰할 수 있는 Out-of-Sample 성과

### 종목 수 변화 대비

현재는 101종목이지만 향후 1000종목으로 확대된다. `n_symbols` 컬럼을 저장해서 "101종목 시절의 1등"과 "1000종목 시절의 1등"을 구분할 수 있게 한다.

---

## 종목 확대 시 전체 파이프라인 재작업 필요 (참고)

이 백테스트 스크립트는 현재 101종목 기준으로 먼저 만들되, 향후 1000종목으로 확대되면 아래 순서로 전체 재작업이 필요하다. 백테스트 스크립트가 이 흐름에서 어디에 위치하는지 이해하고 설계해야 한다.

```
종목 확대 시 전체 순서:

1. 데이터 수집 확대     scraper-service: 101 → 1000종목 스크래핑
                       → etf2_db에 새 종목 테이블 생성

2. 피처 처리            process_features.py: 새 종목 피처 계산
                       → etf2_db_processed에 새 종목 테이블 생성

3. 모델 재학습 ★        train_ahnlab.py: 1000종목으로 재학습 필수
                       → "1000개 중 누가 1등인가" 새로 배움
                       → 새 모델 파일 저장 (v20260501 등)

4. 백테스트 재실행 ★    backtest_rank_returns.py --force-recalc
   (이 스크립트)        → 새 모델로 과거 전체 재계산
                       → SQLite에 새 결과 저장

5. 일일 예측            predict_ranking: 1000종목 순위 예측
```

재학습 없이 기존 모델(101종목 학습)에 1000종목을 넣으면 점수는 나오지만, 새 종목 899개에 대해 학습한 적이 없으므로 순위가 신뢰할 수 없다. **3번 없이 4, 5번만 하면 의미 없다.**

코드 자체는 종목 수에 의존하지 않으므로 수정 불필요:
```python
# load_panel_from_db() → 자동으로 *_D 테이블 전부 로드 (101개든 1000개든)
# groupby("date").size() → 자동으로 [1000, 1000, ...] 생성
# model.predict(X) → (1000, 95) 넣으면 (1000,) 나옴
```

달라지는 것은 **데이터 양과 계산 시간**뿐이다:

| 항목 | 101종목 (현재) | 1000종목 (향후) |
|------|---------------|----------------|
| 학습 데이터 | 250,000행 | 2,500,000행 |
| group 크기 | [101, 101, ...] | [1000, 1000, ...] |
| relevance | 구간당 ~2종목 | 구간당 ~20종목 |
| 백테스트 예측 | ~63,000건 | ~630,000건 |
| 학습 시간 | 수 분 | 수십 분 ~ 수 시간 |
| 백테스트 시간 | 수 분 | 수십 분 (→ SQLite 저장으로 해결) |

---

## 절대 금지 사항

- `ml-service/data/models/` 하위 모델 파일 삭제/수정 금지
- DB 테이블 DROP/TRUNCATE/DELETE (WHERE 없이) 금지
- 기존 `evaluation.py`, `prediction_service.py` 등 삭제 금지 (수정은 가능)
- `git push --force` 금지, feature 브랜치에서 작업
- `.env`, `cookies.json` 파일 삭제 금지

---

*이 프롬프트는 프로젝트 현재 상태(2026-04-02) 기준으로 작성되었습니다.*
*현재 101개 종목, 향후 1000개 종목으로 확대 예정입니다.*
