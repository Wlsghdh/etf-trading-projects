# multi-ai/ - 멀티AI 분석 페이지

## 디렉토리 역할

3x3 AI 분석 그리드(Technical/Fundamental/Market x ChatGPT/Gemini/Claude)와 시장 데이터 패널, TradingView 차트를 결합한 종합 분석 페이지. ML 랭킹, KIS 잔고, 실시간 시장 데이터를 통합하여 다각도 투자 분석을 제공한다.

## 주요 파일

| 파일 | 설명 |
|------|------|
| `page.tsx` | 전체 페이지 컴포넌트 (839줄, 단일 파일 구성) |

### page.tsx 내부 구성요소

| 컴포넌트/함수 | 역할 |
|---------------|------|
| `fetchSymbols()` | ML Service에서 종목 목록 조회 |
| `fetchStockData()` | 일봉 데이터 조회 (최대 260일) |
| `fetchRanking()` | ML 랭킹 결과 조회 (순위, 방향, 점수) |
| `fetchBalance()` | KIS 잔고 조회 (보유종목, 평가액, 가용현금) |
| `fetchPortfolio()` | 내부 포트폴리오 조회 (매수 이력) |
| `analyzeStock()` | 5개 API 병렬 호출 → `StockAnalysis` 객체 통합 |
| `generateGridResponses()` | 로컬 데이터 기반 3x3 그리드 즉시 응답 생성 |
| `callAI()` | AI API 호출 (`/trading/api/ai/chat`, model/message/context) |
| `MarketDataPanel` | 시장 지표 8개 표시 (S&P500, NASDAQ, DOW, VIX, USD/KRW, Gold, Fed Rate, 10Y Treasury) |
| `TradingViewChart` | Advanced Chart 위젯 (RSI + MACD, 거래소 자동 매핑) |
| `AICell` | AI 응답 셀 (Markdown 렌더링, shimmer 로딩 애니메이션) |
| `AI_COLS` | AI 컬럼 정의 (ChatGPT=초록, Gemini=파랑, Claude=주황) |
| `ROW_LABELS` | 행 정의 (Technical, Fundamental, Market) |

## 기능 목록

- **3x3 AI 분석 그리드**: 카테고리별 다른 컨텍스트 + 프롬프트로 AI 호출, Markdown 렌더링
- **2단계 분석**: 1단계 로컬 데이터 즉시 표시 → 2단계 실제 AI API 호출로 점진적 업데이트
- **MarketDataPanel**: S&P500, NASDAQ, DOW, VIX, USD/KRW, Gold, Fed Rate, 10Y Treasury 실시간 표시
- **TradingView Advanced Chart**: 리사이즈 가능(200~600px), 풀스크린 모드, ESC로 닫기
- **KIS 잔고 통합**: 30초마다 잔고 갱신, 보유종목 정보가 Fundamental 분석에 반영
- **RAG 모드**: `ragEnabled` 토글로 ML 예측 추론 데이터 연동 분석
- **AI 필터**: 전체/ChatGPT/Gemini/Claude 개별 보기 전환
- **사용자 질문 입력**: 자유 텍스트 입력 시 각 AI에 추가 컨텍스트로 전달

## 데이터 흐름

```
페이지 로드
    ├─→ GET /trading/api/ml/symbols → 종목 목록
    ├─→ GET /trading/api/trading/balance → KIS 잔고 (30초 갱신)
    └─→ GET /trading/api/market/overview → 시장 데이터 (5분 갱신)

분석 실행 (runAnalysis)
    │
    ├─ 1단계: analyzeStock() - 5개 API 병렬
    │   ├─ GET /trading/api/data/{symbol}?timeframe=D&limit=260
    │   ├─ GET /trading/api/ml/ranking
    │   ├─ GET /trading/api/trading/balance
    │   └─ GET /trading/api/trading/portfolio
    │   → generateGridResponses() → 즉시 그리드 표시
    │
    └─ 2단계: callAI() x 9 (3 AI x 3 카테고리) - 병렬 실행
        POST /trading/api/ai/chat
        { model, message, symbol, analysisContext, userId, sessionId }
        → 셀별 점진적 업데이트
```

## 작업 시 주의사항

- **API 프리픽스**: 모든 API 호출은 `API_PREFIX = '/trading/api'` 경유. 프록시 설정 확인 필요
- **TV_EXCHANGE 매핑**: multi-ai에도 별도 매핑 테이블 존재. stocks/page.tsx의 매핑과 동기화 유지 필요
- **AI 호출 9건 동시**: 분석 실행 시 3 AI x 3 카테고리 = 9건 API 호출이 동시 발생. 서버 부하 고려
- **카테고리별 프롬프트 분리**: Technical에는 RSI/MACD/추세, Fundamental에는 밸류에이션/52주, Market에는 환율/금리/VIX 컨텍스트만 전달하여 답변 혼선 방지
- **세션 ID**: `Date.now().toString(36) + Math.random()` 기반 클라이언트 생성. AI 대화 컨텍스트 유지용
- **차트 리사이즈**: `mousedown` → `mousemove` → `mouseup` 이벤트 체인으로 구현. `isResizing` 상태로 전역 이벤트 리스너 관리
- **KIS 미연결 시**: `kis_connected: false`이면 잔고 데이터 없이 ML 랭킹 + 내부 포트폴리오만 사용
- **Markdown 렌더링**: `react-markdown` 사용, `prose` 클래스로 스타일링. 다크모드 호환 필요
