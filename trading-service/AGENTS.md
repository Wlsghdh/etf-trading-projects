# AGENTS.md - Trading Service (KIS API 연동)

## 개요

한국투자증권(KIS) Open API를 통해 미국 ETF 해외주식 매매를 수행하는 서비스.
FastAPI 백엔드(`trading-service`)가 KIS API를 호출하고, Next.js BFF(`trading-monitor`)가 프론트엔드에 데이터를 전달한다.

## 아키텍처: 데이터 흐름

```
KIS Open API (한국투자증권)
    |
    v
trading-service (FastAPI, port 8002)
  - app/services/kis_client.py   : KIS API 래퍼 (싱글턴)
  - app/routers/trading.py       : REST 엔드포인트
    |
    v
trading-monitor (Next.js BFF, port 3000)
  - app/api/trading/balance/route.ts
  - app/api/trading/portfolio/route.ts
  - app/api/trading/present-balance/route.ts
    |
    v
프론트엔드 (React 컴포넌트)
```

## 인증 방식

### OAuth2 토큰 발급
- **엔드포인트**: `POST /oauth2/tokenP`
- **방식**: `client_credentials` grant type
- **필요 정보**: `appkey`, `appsecret` (환경변수 `KIS_APP_KEY`, `KIS_APP_SECRET`)
- **유효기간**: 24시간 (내부적으로 23시간 후 자동 갱신)
- **캐싱**: `KISClient._access_token`에 인메모리 캐싱, 만료 60초 전에 재발급

### 요청 헤더 구조
```
authorization: Bearer {access_token}
appkey: {KIS_APP_KEY}
appsecret: {KIS_APP_SECRET}
tr_id: {거래 ID - 모의/실계좌별 상이}
content-type: application/json; charset=utf-8
```

### 계좌번호
- 형식: `XXXXXXXX-XX` (하이픈 구분)
- 환경변수: `KIS_ACCOUNT_NUMBER`

## 모의계좌 vs 실계좌

| 구분 | 모의계좌 (paper) | 실계좌 (live) |
|------|-----------------|--------------|
| Base URL | `openapivts.koreainvestment.com:29443` | `openapi.koreainvestment.com:9443` |
| 매수 tr_id | `VTTT1002U` | `TTTT1002U` |
| 매도 tr_id | `VTTT1006U` | `TTTT1006U` |
| 잔고 tr_id | `VTTS3012R` | `TTTS3012R` |
| 체결기준잔고 tr_id | `VTRP6504R` | `CTRP6504R` |
| 매수가능금액 tr_id | `VTTS3007R` | `TTTS3007R` |
| 현재가 tr_id | `HHDFS76200200` | `HHDFS76200200` (동일) |
| 안전장치 | 없음 | `KIS_LIVE_CONFIRMATION=true` 필수 |

## API 엔드포인트

### trading-service (FastAPI, port 8002)

| Method | 경로 | 설명 | KIS API 호출 |
|--------|------|------|-------------|
| GET | `/api/trading/balance` | 잔고 조회 (보유종목 + 매수가능금액) | `inquire-balance` + `inquire-psamount` |
| GET | `/api/trading/present-balance` | 체결기준 현재잔고 (총자산/손익) | `inquire-present-balance` |
| GET | `/api/trading/portfolio` | 미매도 매수건 (DB 기반) | 없음 (SQLite) |
| GET | `/api/trading/status` | 사이클 상태, 거래일 여부 | 없음 |
| POST | `/api/trading/execute` | 수동 매매 실행 | 매수/매도 주문 |
| POST | `/api/trading/cycle/new` | 새 사이클 생성 | 없음 |
| GET | `/api/trading/automation` | 자동매매 설정 조회 | 없음 |
| POST | `/api/trading/automation` | 자동매매 시작/중지 | 없음 |
| POST | `/api/trading/simulate` | 매매 시뮬레이션 | 없음 |
| GET | `/api/trading/prices` | 종목 최신 종가 (원격 MySQL) | 없음 |
| GET | `/api/trading/snapshots` | 일별 포트폴리오 스냅샷 | 없음 |
| POST | `/api/trading/reset` | 사이클 리셋 | 없음 |

### trading-monitor BFF (Next.js, port 3000)

| 경로 | 역할 | 호출 대상 |
|------|------|----------|
| `/api/trading/balance` | 잔고 조회 프록시 | `trading-service/api/trading/balance` |
| `/api/trading/portfolio` | 포트폴리오 (KIS 전용) | `trading-service/api/trading/balance` |
| `/api/trading/present-balance` | 체결기준잔고 프록시 | `trading-service/api/trading/present-balance` |

## KIS API 상세

### 1. 잔고 조회 (`get_balance`)
- **KIS API**: `GET /uapi/overseas-stock/v1/trading/inquire-balance`
- **응답 구조**:
  - `output1`: 보유종목 배열 (종목코드, 수량, 평균매수가, 현재가, 수익률)
  - `output2`: 요약 (총평가손익, 매수가능금액)
- **보완**: 매수가능금액이 0이면 `inquire-psamount` API로 재조회
- **캐싱**: 30초 TTL 인메모리 캐시 (KIS 간헐 500 에러 대응)
- **재시도**: 최대 2회 재시도, 실패 시 캐시 반환

### 2. 체결기준 현재잔고 (`get_present_balance`)
- **KIS API**: `GET /uapi/overseas-stock/v1/trading/inquire-present-balance`
- **응답 구조**:
  - `output1`: 보유종목 상세 (종목별 매수금/평가금/손익)
  - `output2`: 통화별 매수/평가/예수금 (USD 추출)
  - `output3`: 전체 자산/손익 요약 (총매수/총평가/수익률/예수금)
- **파라미터**: `WCRC_FRCR_DVSN_CD=02`(외화), `NATN_CD=840`(미국)

### 3. 매수/매도 주문 (`buy_order`, `sell_order`)
- **KIS API**: `POST /uapi/overseas-stock/v1/trading/order`
- **주문 유형**: 시장가(`OVRS_ORD_UNPR=0`) 또는 지정가
- **거래소 코드**: 티커별 자동 매핑 (`TICKER_EXCHANGE_MAP`)

### 4. 현재가 조회 (`get_current_price`)
- **KIS API**: `GET /uapi/overseas-price/v1/quotations/price`
- **응답**: `output.last` (최종 체결가)

### 5. 체결 조회 (`get_order_status`)
- **KIS API**: `GET /uapi/overseas-stock/v1/trading/inquire-ccnl`

## 중요 설계 원칙

### 포트폴리오 데이터는 KIS에서만 가져옴
- `trading-monitor/app/api/trading/portfolio/route.ts`는 **KIS balance API만 사용**
- DB fallback 제거됨 - 모든 보유종목 데이터는 KIS 실시간 데이터 기반
- BFF에서 보유종목의 투자금/평가금/수익률을 직접 계산

### balance BFF의 fallback 로직
- KIS가 0을 반환하면 → `trading-service/portfolio` (DB)에서 투자금 조회 후 보정
- trading-service 완전 실패 시 → portfolio 기반 추정값 반환 (`kis_connected: false`)

## 주의사항

### Rate Limit
- KIS 모의투자: 초당 5건 제한
- `_rate_limit()`: 200ms 간격으로 호출 조절

### 토큰 만료
- 24시간 유효, 23시간 후 자동 갱신
- 403 에러 시 토큰 초기화 후 재발급
- 500 에러 시 토큰은 유지 (서버 문제)

### 환율
- `_get_exchange_rate()`: `open.er-api.com` API로 USD/KRW 조회
- 실패 시 폴백: 1350원

### 거래소 코드
- `TICKER_EXCHANGE_MAP`에 주요 ETF 매핑 (QQQ→NASD, SPY→AMEX 등)
- 매핑 없는 종목은 `settings.default_exchange_code` 사용

### 모의투자 리셋
- KIS 모의투자 계좌 리셋은 한국투자증권 웹사이트에서 직접 수행
- `/api/trading/reset`은 내부 사이클만 리셋

## 파일 구조

```
trading-service/
├── app/
│   ├── config.py                    # 설정 (KIS 키, 계좌번호, 모드)
│   ├── services/
│   │   └── kis_client.py            # KIS API 클라이언트 (싱글턴)
│   ├── routers/
│   │   └── trading.py               # REST 엔드포인트
│   └── schemas.py                   # Pydantic 모델
│
trading-monitor/
├── app/api/trading/
│   ├── balance/route.ts             # BFF: 잔고 프록시
│   ├── portfolio/route.ts           # BFF: 포트폴리오 (KIS 전용)
│   └── present-balance/route.ts     # BFF: 체결기준잔고 프록시
```

## 환경변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `KIS_APP_KEY` | 한투 앱 키 | - |
| `KIS_APP_SECRET` | 한투 앱 시크릿 | - |
| `KIS_ACCOUNT_NUMBER` | 계좌번호 | `50123456-01` |
| `TRADING_MODE` | `paper` / `live` | `paper` |
| `KIS_LIVE_CONFIRMATION` | 실투자 안전장치 | `true` |
| `TRADING_SERVICE_URL` | BFF에서 사용 | `http://localhost:8002` |
