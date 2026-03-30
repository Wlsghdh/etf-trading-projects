---
name: verify-ml-service
description: ml-service/ 하위 파일(서비스, 라우터, 모델, 스키마, 학습 스크립트)을 변경한 후 이 스킬을 실행하여 구조 일관성을 검증하라. PR 전 ml-service 관련 변경사항 검증 시에도 반드시 사용하라.
disable-model-invocation: true
---

# ML Service 구조 검증

## Purpose

ml-service의 핵심 구성요소가 올바르게 연결되어 있는지 검증합니다:

1. **모델 로더 일관성** — AhnLab 앙상블 모델 로딩 구조가 올바른지
2. **API 엔드포인트 구조** — 랭킹 API가 올바르게 선언되고 연결되어 있는지
3. **DB 연결** — processed DB (etf2_db_processed) 연결이 설정되어 있는지
4. **스키마-모델 동기화** — Pydantic 스키마와 SQLAlchemy 모델이 일치하는지
5. **피처 컬럼 일관성** — processed_data_service와 학습 스크립트의 피처 목록이 동기화되어 있는지

## When to Run

- ml-service의 서비스, 라우터, 모델, 스키마 파일을 변경한 후
- 모델 로더나 학습 스크립트를 수정한 후
- DB 연결 설정을 변경한 후
- PR 전 ml-service 관련 변경사항 검증 시

## Related Files

| File | Purpose |
|------|---------|
| `ml-service/app/config.py` | 앱 설정 (processed_db_url, default_model) |
| `ml-service/app/database.py` | DB 엔진 (processed_engine, get_processed_db) |
| `ml-service/app/models.py` | SQLAlchemy ORM (rank, score 필드) |
| `ml-service/app/schemas.py` | Pydantic 스키마 (RankingResponse, RankingItem) |
| `ml-service/app/main.py` | FastAPI 진입점, 라우터 등록 |
| `ml-service/app/routers/predictions.py` | /ranking 엔드포인트, 모델 관리 API |
| `ml-service/app/services/prediction_service.py` | AhnLab 랭킹 예측 서비스 |
| `ml-service/app/services/processed_data_service.py` | 피처 DB 서비스 (ALL_FEATURE_COLS) |
| `ml-service/app/services/model_loader.py` | AhnLab 앙상블 로더 (BoosterWrapper) |
| `ml-service/scripts/train_ahnlab.py` | 모델 학습 스크립트 |
| `ml-service/pyproject.toml` | Poetry 의존성 (main: lightgbm, research: xgboost 등) |
| `ml-service/poetry.lock` | Lock 파일 (의존성 고정) |
| `ml-service/Dockerfile.serving` | 프로덕션 Dockerfile (poetry install) |
| `ml-service/Dockerfile.research` | 학습 Dockerfile (poetry install --with research) |

## Workflow

### Step 1: poetry 의존성 구조 확인

**파일:** `ml-service/pyproject.toml`

**검사 1a:** main 그룹에 lightgbm과 scikit-learn이 있는지 확인합니다.

```bash
grep -n "lightgbm\|scikit-learn" ml-service/pyproject.toml
```

**PASS:** `lightgbm = "^4.1.0"` 및 `scikit-learn = "^1.3.2"` 패턴이 `[tool.poetry.dependencies]` 섹션에 존재
**FAIL:** 패키지 누락 또는 주석 처리됨

**검사 1b:** research 그룹에 학습용 패키지가 분리되어 있는지 확인합니다.

```bash
grep -A 20 "\[tool.poetry.group.research.dependencies\]" ml-service/pyproject.toml | grep -E "xgboost|catboost|tabpfn|pandas-ta"
```

**PASS:** xgboost, catboost, tabpfn, pandas-ta가 research 그룹에 있음
**FAIL:** research 그룹 누락 또는 패키지가 main에 섞여 있음

**검사 1c:** poetry.lock이 존재하는지 확인합니다.

```bash
ls -la ml-service/poetry.lock
```

**PASS:** poetry.lock 파일 존재
**FAIL:** poetry.lock 없음 (poetry lock 실행 필요)

**파일:** `ml-service/Dockerfile.serving`

**검사 1d:** Dockerfile이 poetry를 사용하는지 확인합니다.

```bash
grep -n "poetry install\|poetry config\|COPY.*pyproject.toml\|COPY.*poetry.lock" ml-service/Dockerfile.serving
```

**PASS:** `poetry install --only main` 패턴 존재, pip install 미사용
**FAIL:** `pip install -r requirements*.txt` 사용 중 (레거시)

### Step 2: processed DB 연결 설정 확인

**파일:** `ml-service/app/config.py`

**검사 2a:** `processed_db_url` 설정이 존재하는지 확인합니다.

```bash
grep -n "processed_db_url" ml-service/app/config.py
```

**검사 2b:** `default_model`이 `ahnlab_lgbm`으로 설정되어 있는지 확인합니다.

```bash
grep -n "default_model" ml-service/app/config.py
```

**PASS:** `processed_db_url`이 `etf2_db_processed` 포함, `default_model = "ahnlab_lgbm"`
**FAIL:** 설정 누락 또는 다른 값

**파일:** `ml-service/app/database.py`

**검사 2c:** `processed_engine`과 `get_processed_db`가 존재하는지 확인합니다.

```bash
grep -n "processed_engine\|get_processed_db\|ProcessedSessionLocal" ml-service/app/database.py
```

**PASS:** 세 심볼이 모두 존재
**FAIL:** 누락된 심볼이 있음

### Step 3: SQLAlchemy 모델의 rank/score 필드 확인

**파일:** `ml-service/app/models.py`

**검사:** Prediction 모델에 `rank`와 `score` 컬럼이 정의되어 있는지 확인합니다.

```bash
grep -n "rank\|score" ml-service/app/models.py
```

**PASS:** `rank = Column(Integer` 및 `score = Column(Float` 패턴 존재
**FAIL:** rank 또는 score 컬럼 누락

### Step 4: Pydantic 스키마 RankingResponse 확인

**파일:** `ml-service/app/schemas.py`

**검사 4a:** `RankingItem`과 `RankingResponse` 클래스가 정의되어 있는지 확인합니다.

```bash
grep -n "class RankingItem\|class RankingResponse" ml-service/app/schemas.py
```

**검사 4b:** PredictionResponse에 `rank`와 `score` 필드가 있는지 확인합니다.

```bash
grep -n "rank\|score" ml-service/app/schemas.py
```

**PASS:** RankingItem, RankingResponse 클래스 존재, PredictionResponse에 rank/score 포함
**FAIL:** 클래스 또는 필드 누락

### Step 5: 라우터 엔드포인트 구조 확인

**파일:** `ml-service/app/routers/predictions.py`

**검사 5a:** `/ranking` 엔드포인트가 `/{symbol}` 보다 먼저 선언되어 있는지 확인합니다.

```bash
grep -n "def predict_ranking\|def predict_single\|def predict_batch" ml-service/app/routers/predictions.py
```

**PASS:** `predict_ranking`의 라인 번호 < `predict_single`의 라인 번호
**FAIL:** `predict_single`이 먼저 선언됨 (경로 충돌 발생)

**검사 5b:** `get_prediction_service`가 `get_processed_db`를 의존성으로 사용하는지 확인합니다.

```bash
grep -n "get_processed_db\|get_remote_db" ml-service/app/routers/predictions.py
```

**PASS:** `get_processed_db` 사용, `get_remote_db` 미사용
**FAIL:** `get_remote_db` 사용 중이면 구버전 연결

### Step 6: PredictionService 구조 확인

**파일:** `ml-service/app/services/prediction_service.py`

**검사 6a:** `predict_ranking` 메서드가 존재하는지 확인합니다.

```bash
grep -n "def predict_ranking" ml-service/app/services/prediction_service.py
```

**검사 6b:** 구버전 simple 모델 코드가 제거되었는지 확인합니다.

```bash
grep -n "_predict_with_simple_model\|_extract_basic_features\|SimplePredictor" ml-service/app/services/prediction_service.py
```

**PASS:** `predict_ranking` 존재, simple 모델 관련 코드 없음
**FAIL:** simple 모델 코드 잔존 또는 `predict_ranking` 누락

### Step 7: 모델 로더 AhnLab 지원 확인

**파일:** `ml-service/app/services/model_loader.py`

**검사:** `_BoosterWrapper`, `AhnLabEnsemble`, `_load_ahnlab_model` 이 존재하는지 확인합니다.

```bash
grep -n "class _BoosterWrapper\|class AhnLabEnsemble\|def _load_ahnlab_model\|def _load_ahnlab_metadata" ml-service/app/services/model_loader.py
```

**PASS:** 네 심볼 모두 존재
**FAIL:** 누락된 심볼이 있음

### Step 8: 피처 컬럼 일관성 확인

**검사:** `processed_data_service.py`와 `train_ahnlab.py`의 ALL_FEATURE_COLS 개수가 동일한지 확인합니다.

```bash
grep -c "\"" ml-service/app/services/processed_data_service.py | head -1
grep -c "\"" ml-service/scripts/train_ahnlab.py | head -1
```

두 파일에서 `ALL_FEATURE_COLS` 리스트를 읽어 원소 개수를 비교합니다.

**PASS:** 두 파일의 피처 개수가 85개로 동일
**FAIL:** 피처 개수 불일치 — 동기화 필요

### Step 9: main.py 라우터 등록 확인

**파일:** `ml-service/app/main.py`

**검사:** predictions 라우터가 `/api/predictions` 프리픽스로 등록되어 있는지 확인합니다.

```bash
grep -n "predictions.router\|prefix.*predictions" ml-service/app/main.py
```

**PASS:** `include_router(predictions.router, prefix="/api/predictions")` 패턴 존재
**FAIL:** 라우터 등록 누락 또는 잘못된 프리픽스

## Output Format

```markdown
## ML Service 검증 결과

| # | 검사 항목 | 상태 | 상세 |
|---|----------|------|------|
| 1 | poetry 의존성 구조 | PASS/FAIL | ... |
| 2 | processed DB 연결 | PASS/FAIL | ... |
| 3 | rank/score 모델 필드 | PASS/FAIL | ... |
| 4 | RankingResponse 스키마 | PASS/FAIL | ... |
| 5 | 엔드포인트 순서 | PASS/FAIL | ... |
| 6 | PredictionService 구조 | PASS/FAIL | ... |
| 7 | 모델 로더 AhnLab 지원 | PASS/FAIL | ... |
| 8 | 피처 컬럼 일관성 | PASS/FAIL | ... |
| 9 | 라우터 등록 | PASS/FAIL | ... |
```

## Exceptions

다음은 **위반이 아닙니다**:

1. **모델 파일 부재** — `data/models/ahnlab_lgbm/` 디렉토리에 학습된 모델 파일(.txt)이 없는 것은 학습 전 상태이므로 정상. 서비스는 모델 없이도 시작 가능 (warning 로그 출력)
2. **dummy_data_service 사용** — `/history`, `/forecast` 엔드포인트가 더미 데이터 서비스를 사용하는 것은 의도된 동작 (아직 실제 데이터로 교체 전)
3. **data_service.py 존재** — `app/services/data_service.py`가 여전히 존재하는 것은 `/api/data` 라우터에서 사용하므로 정상 (predictions에서만 제거됨)
4. **predictions.db 부재** — SQLite 파일이 없는 것은 서비스 최초 시작 시 자동 생성되므로 정상
5. **requirements.txt 부재** — poetry로 마이그레이션된 후 pip 기반 requirements.txt가 없는 것은 정상
