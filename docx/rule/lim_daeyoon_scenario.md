# 임대윤 - 시나리오 전략 & 중간 그래프 예측

## 담당자
- **이름**: 임대윤
- **역할**: ML 엔지니어 (시나리오 & LLM 그래프)

---

## 담당 기능

| # | 기능 | 설명 |
|---|------|------|
| 4 | AI 주가 시나리오 전략 수립 | 5단계 시나리오별 가격 차트 + 대응 전략 제시 |
| - | 중간 경로 그래프 예측 | 오늘 → 63일 뒤 사이의 가격 경로를 LLM으로 생성 |

---

## 담당 브랜치

```
feat/scenario-strategy
```

---

## 담당 파일/폴더 (이 파일만 수정)

```
ml-service/app/services/scenario_predictor.py     # 신규 - 시나리오 엔진
ml-service/app/services/llm_graph_generator.py     # 신규 - LLM 중간 경로 생성
ml-service/app/services/monte_carlo.py             # 신규 - Monte Carlo 시뮬레이션
ml-service/app/routers/scenarios.py                # 신규 - 시나리오 API
trading-monitor/components/scenario/               # 신규 폴더 - 시나리오 UI
trading-monitor/app/api/scenarios/                 # 신규 폴더 - BFF API
```

> **주의**: 위 파일/폴더 외의 기존 파일은 수정하지 않는다. 수정이 필요하면 PM에게 요청.

---

## 기능 상세

### 1. 5단계 시나리오 엔진

각 종목에 대해 5가지 시나리오를 생성:

| 시나리오 | 수익률 범위 | 설명 |
|----------|-------------|------|
| 급등 | +15% 이상 | 강한 상승 촉발 조건 |
| 상승 | +5% ~ +15% | 완만한 상승 |
| 보합 | -5% ~ +5% | 횡보 |
| 하락 | -15% ~ -5% | 완만한 하락 |
| 급락 | -15% 이하 | 강한 하락 촉발 조건 |

각 시나리오에 포함할 정보:
- 촉발 조건 (어떤 상황에서 이 시나리오가 발생하는지)
- 발생 확률 (%)
- 대응 전략 목록 (사용자가 선택 가능)
- 가격 변동 차트

### 2. 중간 경로 그래프 (핵심 과제)

**현재 문제**:
```
오늘 가격 ──── (빈 공간) ──── 63일 뒤 예측가
```

**목표**:
```
오늘 가격 ~~~~ 중간 경로 ~~~~ 63일 뒤 예측가
          (LLM + Monte Carlo로 채움)
```

**구현 방법**:
1. **Monte Carlo 시뮬레이션**: 과거 변동성 기반 무작위 경로 N개 생성
2. **LLM 보정**: 뉴스, 이벤트를 반영하여 경로를 조정
3. **5개 시나리오별 대표 경로**: 각 시나리오에 맞는 경로 1개씩 선택
4. **신뢰구간 밴드**: 부채꼴 형태로 불확실성 표시

### 3. 전략 선택 UI

- 5개 시나리오 카드 형태로 표시
- 각 카드: 확률, 차트, 전략 목록
- 사용자가 전략 선택 → 저장
- 선택한 전략 기반 알림 설정

---

## API 엔드포인트 (구현해야 할 것)

```
POST /api/scenarios/{symbol}/generate     # 시나리오 생성 (LLM 호출)
GET  /api/scenarios/{symbol}/latest       # 최신 시나리오 조회
POST /api/scenarios/{symbol}/select       # 사용자 전략 선택 저장
GET  /api/scenarios/{symbol}/path         # 중간 경로 데이터
GET  /api/scenarios/{symbol}/monte-carlo  # Monte Carlo 시뮬레이션 결과
```

---

## 기술 스택

| 기술 | 용도 |
|------|------|
| Python | 백엔드 로직 |
| LLM API (Claude/GPT) | 시나리오 텍스트 생성 + 경로 보정 |
| NumPy/SciPy | Monte Carlo 시뮬레이션 |
| FastAPI | API 엔드포인트 |
| React + Recharts | 시나리오 차트 UI |

---

## Sprint별 작업 계획

### Sprint 1 (Week 1-2)
- [ ] LLM API 연동 기반 구축 (Claude 또는 GPT)
- [ ] Monte Carlo 시뮬레이션 프로토타입
- [ ] 기본 시나리오 생성 로직 (5단계 분류)
- [ ] 단위 테스트 작성

### Sprint 2 (Week 3-4)
- [ ] LLM 기반 중간 경로 그래프 생성
- [ ] 5단계 시나리오 엔진 완성
- [ ] 시나리오 API 구현
- [ ] 신뢰구간 밴드 계산

### Sprint 3 (Week 5-6)
- [ ] 시나리오 카드 UI 구현
- [ ] 전략 선택 + 저장 기능
- [ ] 알림 연동
- [ ] 통합 테스트

### Sprint 4 (Week 7-8)
- [ ] 버그 수정
- [ ] 성능 최적화 (LLM 호출 캐싱)
- [ ] 문서화

---

## Git 작업 흐름 (매일)

```bash
# 아침
git checkout feat/scenario-strategy
git pull origin develop

# 작업 후
git add ml-service/app/services/scenario_predictor.py
git commit -m "feat: Monte Carlo 기반 경로 시뮬레이션 구현"
git push origin feat/scenario-strategy

# GitHub 웹에서 PR 생성 (base: develop)
```
