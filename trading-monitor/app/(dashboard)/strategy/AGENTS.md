# strategy/ - 매매전략 페이지

## 디렉토리 역할

종목별 시나리오 예측과 매매 복기를 제공하는 전략 페이지. Geometric Brownian Motion 기반 5-Way 시나리오(급등/상승/보합/하락/급락)를 생성하고, 실제 주문 이력을 조회하여 매매 성과를 분석한다.

## 주요 파일

| 파일 | 설명 |
|------|------|
| `page.tsx` | 전체 페이지 컴포넌트 (437줄, 단일 파일 구성) |

### page.tsx 내부 구성요소

| 컴포넌트/함수 | 역할 |
|---------------|------|
| `generateScenarios()` | GBM 기반 5-Way 시나리오 생성 (drift + volatility 조합, 63 거래일) |
| `ScenarioChart` | SVG 기반 시나리오 차트 (5개 라인, Y축 그리드, 시작가 기준선) |
| `TradeReviewTab` | 실제 주문 이력 조회 (매수/매도 금액 집계, 최근 100건 표시) |
| `TVChartSnapshot` | TradingView Advanced Chart 위젯 (RSI + MACD 포함) |
| `StrategyPage` | 메인 페이지: 종목 검색, 날짜 선택, 탭 전환 |

## 기능 목록

- **5-Way 시나리오 예측**: 급등(drift +0.4%), 상승(+0.15%), 보합(0%), 하락(-0.15%), 급락(-0.4%)
- **시나리오 차트**: SVG polyline 기반, 주말 제외, 예상 수익률/MDD 표시
- **TradingView 실제 차트**: 선택 종목의 일봉 차트 + RSI/MACD 보조지표
- **매매 복기 탭**: Trading Service의 주문 이력 조회, 매수/매도 총액 집계
- **종목 검색 + 날짜 선택**: 상단 UI에서 symbol/startDate 입력 후 예측 실행

## 데이터 흐름

```
사용자 입력 (종목 + 날짜)
    │
    ├─→ GET /trading/api/data/{symbol}?timeframe=D&limit=260
    │       → 시작가 결정 → generateScenarios() → SVG 차트 렌더링
    │
    └─→ (매매 복기 탭)
        GET /trading/api/trading/orders?page_size=200
            → 주문 이력 표시 (BUY/SELL, 수량, 가격, 상태, 일시)
```

## 작업 시 주의사항

- `generateScenarios()`는 클라이언트 사이드에서 `Math.random()` 기반으로 실행됨 (서버 ML 모델 아님). 예측 실행 시마다 결과가 달라짐
- 시나리오 기간은 63 거래일(약 3개월) 고정. 주말(토/일) 자동 제외 처리됨
- TradingView 위젯은 `symbol` 또는 `theme` 변경 시 DOM을 완전히 제거 후 재생성함 (innerHTML 초기화 패턴)
- Trading Service API(`/trading/api/...`)가 프록시를 통해 연결되므로, 해당 서비스가 실행 중이어야 주문 이력 조회 가능
- 탭은 `scenario`(시나리오 예측)와 `review`(매매 복기) 2개. 가상 매매 탭은 아직 미구현
