# 최인훈 - 회귀 예측 & 설명가능성

## 담당자
- **이름**: 최인훈
- **역할**: ML 엔지니어 (가격 예측 & 설명가능성)

---

## 담당 기능

| # | 기능 | 설명 |
|---|------|------|
| 2 | AI 매매 근거 분석 자동화 | 왜 이 종목을 추천했는지 투명하게 설명 |
| - | 63일 회귀 예측 | 63거래일 후 가격/수익률 예측 (현재 랭킹 → 가격 예측 추가) |
| - | LLM 뉴스 연동 | 종목별 뉴스 크롤링 + LLM 요약 + 감성 분석 |

---

## 담당 브랜치

```
feat/price-regression
```

---

## 담당 파일/폴더 (이 파일만 수정)

```
ml-service/app/services/regression_model.py        # 신규 - 회귀 예측 모델
ml-service/app/services/explainability.py           # 신규 - SHAP 설명가능성
ml-service/app/services/news_analyzer.py            # 신규 - 뉴스 크롤링 + LLM 분석
ml-service/app/routers/explainability.py            # 신규 - 설명가능성 API
ml-service/app/routers/news.py                      # 신규 - 뉴스 API
trading-monitor/components/explainability/          # 신규 폴더 - 설명가능성 UI
trading-monitor/app/api/explainability/             # 신규 폴더 - BFF API
trading-monitor/app/api/news/                       # 신규 폴더 - 뉴스 BFF API
```

> **주의**: 위 파일/폴더 외의 기존 파일은 수정하지 않는다. 수정이 필요하면 PM에게 요청.

---

## 기능 상세

### 1. 설명가능성 (Explainability)

**현재 문제**: ML 모델이 "AAPL이 1위"라고 하지만, 왜인지 설명 불가

**목표**: 각 종목의 예측 근거를 자동으로 제시

```
예시 출력:
┌──────────────────────────────────────────────┐
│ AAPL 매수 추천 근거                            │
│                                              │
│ 1. RSI(14) = 28.5 → 과매도 구간 진입 (기여도 +32%)  │
│ 2. MACD 골든크로스 발생 (기여도 +25%)              │
│ 3. 거래량 20일 평균 대비 180% 급증 (기여도 +18%)    │
│ 4. 섹터(Tech) 전체 상승 추세 (기여도 +12%)         │
│ 5. 달러 약세 전환 (기여도 +8%)                    │
│                                              │
│ [워터폴 차트로 시각화]                           │
└──────────────────────────────────────────────┘
```

**구현 방법**:
1. **SHAP (SHapley Additive exPlanations)**: 각 피처의 기여도 계산
2. **Feature Importance**: LightGBM 내장 피처 중요도
3. **텍스트 생성**: 기여도 상위 5개 피처를 자연어로 변환
4. **워터폴 차트**: 피처별 기여도 시각화

### 2. 63일 회귀 예측

**현재**: LightGBM LambdaRank → 순위만 예측
**추가**: 회귀 모델로 실제 가격/수익률 예측

| 항목 | 내용 |
|------|------|
| 모델 | XGBoost 또는 CatBoost 회귀 |
| 타겟 | 63거래일 후 수익률 (%) |
| 입력 | 기존 85개 피처 동일 |
| 출력 | 예측 수익률 + 신뢰구간 (80%, 95%) |
| 검증 | 과거 6개월 백테스트 |

```
예시 출력:
AAPL: +12.3% (80% 신뢰구간: +5.1% ~ +19.5%)
NVDA: +18.7% (80% 신뢰구간: +8.2% ~ +29.1%)
```

### 3. LLM 뉴스 연동

| 단계 | 설명 |
|------|------|
| 크롤링 | Yahoo Finance, Google News에서 종목별 최신 뉴스 수집 |
| 요약 | LLM으로 뉴스 핵심 내용 요약 (3줄 이내) |
| 감성 분석 | 긍정/부정/중립 판단 + 점수 (-1.0 ~ +1.0) |
| 통합 | 매매 근거에 뉴스 감성 반영 |

```
예시 출력:
┌──────────────────────────────────────────────┐
│ AAPL 최신 뉴스                                │
│                                              │
│ 📰 "Apple, AI 기반 신규 서비스 발표 예정"         │
│    감성: 긍정 (+0.72)                          │
│    요약: Apple이 WWDC에서 새로운 AI 기능을        │
│          발표할 예정. 시장 기대감 상승.            │
│                                              │
│ 📰 "미중 관세 갈등 재점화"                       │
│    감성: 부정 (-0.45)                          │
│    요약: 중국 수출 제한 강화 가능성.               │
│          Apple 공급망 영향 우려.                 │
│                                              │
│ 종합 감성: 긍정 (+0.35)                         │
└──────────────────────────────────────────────┘
```

---

## API 엔드포인트 (구현해야 할 것)

```
# 설명가능성
GET  /api/explainability/{symbol}          # 종목별 예측 근거 (SHAP top-5)
GET  /api/explainability/ranking           # 전체 랭킹 근거
GET  /api/explainability/{symbol}/shap     # SHAP 상세 데이터
GET  /api/explainability/{symbol}/waterfall # 워터폴 차트 데이터

# 회귀 예측
GET  /api/regression/{symbol}              # 63일 수익률 예측 + 신뢰구간
GET  /api/regression/ranking               # 전체 회귀 예측 랭킹

# 뉴스
GET  /api/news/{symbol}                    # 종목별 뉴스 요약 + 감성
GET  /api/news/{symbol}/sentiment          # 감성 분석 히스토리
```

---

## 기술 스택

| 기술 | 용도 |
|------|------|
| Python | 백엔드 로직 |
| SHAP | 모델 설명가능성 |
| XGBoost / CatBoost | 회귀 예측 모델 |
| LLM API (Claude/GPT) | 뉴스 요약 + 감성 분석 |
| BeautifulSoup / feedparser | 뉴스 크롤링 |
| FastAPI | API 엔드포인트 |
| React + Recharts | 워터폴 차트, 뉴스 패널 UI |

---

## Sprint별 작업 계획

### Sprint 1 (Week 1-2)
- [ ] SHAP 라이브러리 연동 + 기존 LightGBM 모델에 적용
- [ ] 피처 중요도 → 자연어 변환 로직
- [ ] 회귀 모델 프로토타입 (XGBoost)
- [ ] 단위 테스트 작성

### Sprint 2 (Week 3-4)
- [ ] 63일 회귀 예측 모델 완성 + 신뢰구간 계산
- [ ] 뉴스 크롤링 구현 (Yahoo Finance, Google News)
- [ ] LLM 기반 뉴스 요약 + 감성 분석
- [ ] 설명가능성 API + 뉴스 API 구현

### Sprint 3 (Week 5-6)
- [ ] 워터폴 차트 UI 구현
- [ ] 뉴스 패널 UI 구현
- [ ] 매매 근거 통합 화면 (SHAP + 뉴스 + 예측)
- [ ] 백테스트 결과 보고서

### Sprint 4 (Week 7-8)
- [ ] 버그 수정
- [ ] 모델 정확도 개선
- [ ] 문서화

---

## Git 작업 흐름 (매일)

```bash
# 아침
git checkout feat/price-regression
git pull origin develop

# 작업 후
git add ml-service/app/services/explainability.py
git commit -m "feat: SHAP 기반 피처 기여도 분석 구현"
git push origin feat/price-regression

# GitHub 웹에서 PR 생성 (base: develop)
```
