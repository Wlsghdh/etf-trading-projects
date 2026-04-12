# stocks/ - 종목 정보 페이지

## 디렉토리 역할

종목 검색, 관심종목 관리, 뉴스 피드(감성 투표), TradingView 위젯 통합을 제공하는 종목 정보 허브 페이지. 목록 뷰와 상세 뷰 2단계 네비게이션 구조.

## 주요 파일

| 파일 | 설명 |
|------|------|
| `page.tsx` | 전체 페이지 컴포넌트 (889줄, 단일 파일 구성) |

### page.tsx 내부 구성요소

| 컴포넌트/함수 | 역할 |
|---------------|------|
| `loadFavorites()` / `saveFavorites()` | localStorage 기반 관심종목 CRUD |
| `getUser()` | 쿠키에서 `user-name` 추출 (투표 사용자 식별) |
| `TV_EXCHANGE` 매핑 | 심볼→거래소 매핑 (NASDAQ/AMEX/NYSE, 약 40개 종목) |
| `TVTimeline` | TradingView Timeline 위젯 (시장 뉴스, 1시간 자동 리로드) |
| `TVHotlists` | TradingView Hotlists 위젯 (인기 종목) |
| `TVChart` | TradingView Advanced Chart (RSI + MACD, 거래소 자동 매핑) |
| `TVSymbolInfo` | TradingView Symbol Info 위젯 |
| `TVMarketOverview` | TradingView Market Overview (지수 + 선물) |
| `TVScreener` | TradingView Screener (미국 시장 종목 스크리너) |
| `TVTickerTape` | TradingView Ticker Tape (주요 종목 실시간 시세) |
| `TVEvents` | TradingView Events (경제 캘린더, US/KR/JP/CN/EU) |
| `NewsCard` | 뉴스 카드 + Good/Bad 투표 UI (감성 바 포함) |
| `NewsPanel` | 뉴스 피드 (1시간 갱신, 종목별/시장 전체 필터) |

## 기능 목록

- **종목 검색**: 심볼 입력 → 상세 뷰 전환
- **관심종목**: localStorage에 저장, 즐겨찾기 토글, 목록 상단 표시
- **뉴스 피드**: `/trading/api/news` API 연동, 종목별/시장 전체 뉴스
- **감성 투표**: Good/Bad 투표 + optimistic UI 업데이트, 감성 바(초록/빨강) 표시
- **TradingView 위젯 7종**: Timeline, Hotlists, Chart, SymbolInfo, MarketOverview, Screener, TickerTape, Events
- **거래소 매핑**: `getTVSymbol()`로 심볼에 맞는 TradingView 거래소 프리픽스 자동 부여

## 데이터 흐름

```
목록 뷰
    ├─→ TVTimeline (시장 뉴스)
    ├─→ TVHotlists (인기 종목)
    ├─→ TVMarketOverview (지수/선물)
    ├─→ TVScreener (종목 스크리너)
    ├─→ TVTickerTape (실시간 시세)
    └─→ localStorage → 관심종목 목록

종목 선택 → 상세 뷰
    ├─→ TVChart({symbol}) + TVSymbolInfo({symbol})
    ├─→ TVEvents (경제 캘린더)
    └─→ NewsPanel({symbol})
            └─→ GET /trading/api/news?symbol={symbol}
                    → NewsCard (투표: POST /trading/api/news/{id}/vote)
```

## 작업 시 주의사항

- **TradingView 위젯 관리**: 모든 TV 위젯은 `useRef` + `innerHTML = ''` 패턴으로 cleanup 필수. props 변경 시 DOM 완전 재생성
- **TV_EXCHANGE 매핑**: 새 종목 추가 시 거래소 매핑 테이블에도 추가해야 TradingView 차트가 정상 동작
- **관심종목**: `FAVORITES_KEY = 'stock_favorites'`로 localStorage 저장. SSR에서 접근 불가하므로 `typeof window === 'undefined'` 가드 필수
- **뉴스 투표**: optimistic update 패턴 사용. 서버 응답 실패 시 UI 롤백 로직 확인 필요
- **사용자 식별**: 쿠키의 `user-name` 값으로 투표 중복 방지. 쿠키 없으면 기본값 `'User'`
- **위젯 자동 리로드**: TVTimeline, TVHotlists는 1시간마다 `reloadKey` 증가로 강제 리렌더링
