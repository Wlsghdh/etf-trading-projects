---
name: ai-etf-project
description: |
  사용자가 프로젝트의 목적, 비즈니스 모델, AI ETF 운용 구조, 규제 대응 전략에 대해
  질문하면 이 스킬을 호출하라. 투자자/파트너 대상 자료 작성 시에도 반드시 참조하라.
  "이 프로젝트가 뭐야?", "비즈니스 모델이 뭐야?" 같은 질문에도 이 스킬로 답변하라.
  Triggers: project overview, business plan, AI ETF, 운용 구조, 규제 대응, 상관계수 0.7,
  Daily Rolling, FIFO, 종목 교체, 패시브 ETF vs 액티브 ETF.
---

# AI ETF Project

AI 기반 미래 수익률 예측으로 패시브 ETF를 능가하는 Active ETF 운용 시스템.

## 핵심 개념 요약

### 문제 인식
- 패시브 ETF(QQQ 등)는 과거 시가총액에 의존 → 상위 종목 적중률 약 6%
- 운용자 재량 기반 액티브 ETF는 불투명하고 일관성 부족

### 솔루션: AI Daily Rolling ETF
- **AI 예측**: 트랜스포머 모델로 3개월 후 수익률 상위 종목 예측 (적중률 24%+)
- **Daily Rolling 구조**: 매일 포트폴리오 1%를 FIFO로 교체
- **규제 대응**: 상관계수 0.7 기준 모니터링, 경계 근접 시 추종지수 매수로 전환

### 경쟁 우위
| 항목 | 패시브 ETF | 기존 액티브 | 우리 모델 |
|------|-----------|------------|----------|
| 투자 기준 | 과거 시가총액 | 운용역 재량 | 미래 수익률 예측 |
| 종목 교체 | 분기/반기 | 수시 | 매일 1% FIFO |
| 적중률 | ~6% | 변동 | 24%+ |
| 투명성 | O | X | O (웹 공개) |

### 비즈니스 모델
1. **운용 보수**: 직접 ETF 운용 (0.05% 기준)
2. **기술 라이선싱**: AI 예측 엔진을 타 운용사에 B2B 제공

### 규제 환경
- 국내: 비교지수 상관계수 0.7 이상 유지 필수
- 미국: 2019년 규제 완화 후 Active ETF 폭발 성장 (J커브)
- 전략: 규제 준수하며 알파 추구, 향후 완화 대비

## 상세 참조

비즈니스 플랜 전문: [references/business-plan.md](references/business-plan.md)

포함 내용:
- 시장 현황 및 성장성 분석
- 단계별 사업화 추진 전략 (Step 1~7)
- 기술적/사업적 준비 현황
- 수익 모델 상세 (AUM 시나리오)
- 팀 구성 및 투자 유치 전략

## 기술 스택 연결

이 프로젝트의 기술 구현:
- **ML 서비스**: `ml-service/` - FastAPI 기반 예측 API
- **스크래핑**: `scraper-service/` - 1일,1주,1달,12달 주가 데이터 수집
- **웹 상품소개/대시보드**: `web-dashboard/` - Next.js 상품소개 및 포트폴리오 시각화
- **모델 실험**: `etf-model/` - 예측 모델 학습/평가
- **자동화 모니터링**: `auto-monitoring/` - Next.js 자동화 진행여부 모니터링

설정될 작업:
1. **매일 오전 8시**: 데이터 크롤링
2. **매월 1일 새벽 3시**: 모델 학습
3. **스크래핑이 끝난 직후 ~ 장이 시작하기 전까지**: 다음날 매매/매도 종목 예측

```mermaid
graph TD
    %% 스타일 정의
    classDef docker fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b;
    classDef host fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#4a148c;
    classDef db fill:#fff9c4,stroke:#fbc02d,stroke-width:2px,color:#f9a825;
    classDef user fill:#212121,stroke:#000,stroke-width:2px,color:#fff;
    classDef script fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#c62828;

    %% 1. 외부 사용자
    USER(("External User")):::user

    %% 2. 원격 서버 (Production)
    subgraph "Production Server (ahnbi2.suwon.ac.kr)"

        %% 자동화
        subgraph "Automation"
            CRON["Cron Daemon"]:::host
            SCRIPTS["start.sh
predict-daily.sh"]:::script
        end

        %% Docker Compose 환경
        subgraph "Docker Compose Environment"

            subgraph "Container: web-dashboard"
                NEXT["Next.js Dashboard
(Port 3000)"]:::docker
            end

            subgraph "Container: etf-ml-service"
                FASTAPI["FastAPI ML Service
(Port 8000)"]:::docker
                SQLITE[("SQLite
predictions.db")]:::db
            end
        end

        %% 호스트의 MySQL
        MYSQL[("MySQL Database
etf2_db (Port 5100)
~500 tables")]:::db

    end

    %% --- 연결 흐름 ---

    %% 외부 접근
    USER --> |"https://ahnbi2.suwon.ac.kr
(Nginx Reverse Proxy)"| NEXT
    USER --> |"API 직접 접근 (Optional)"| FASTAPI

    %% 자동화 실행
    CRON -.-> |"Schedule"| SCRIPTS
    SCRIPTS -.-> |"docker exec / curl"| FASTAPI

    %% 프론트 → 백엔드
    NEXT --> |"Internal Docker Network
http://ml-service:8000"| FASTAPI

    %% 백엔드 → DB
    FASTAPI <--> |"Save"| SQLITE
    FASTAPI <--> |"host.docker.internal:5100
(No SSH Tunnel Needed!)"| MYSQL

    %% 링크 스타일
    linkStyle 4 stroke:#01579b,stroke-width:2px;
    linkStyle 6 stroke:#fbc02d,stroke-width:2px;
```

## 투자 유니버스 (101개 종목)

S&P 500 상위 시가총액 종목 기반, 섹터별 분산 투자 유니버스.

### 섹터별 분류

| 섹터 | 종목 수 | 종목 리스트 |
|------|--------|-------------|
| **Technology** | 30 | AAPL, MSFT, NVDA, GOOGL, GOOG, META, AVGO, ADBE, CRM, CSCO, ORCL, AMD, INTC, QCOM, TXN, NOW, INTU, AMAT, ADI, LRCX, KLAC, MU, PANW, CRWD, ANET, PLTR, APP, IBM, HOOD, IBKR |
| **Communication** | 4 | AMZN, TSLA, NFLX, T |
| **Consumer** | 9 | WMT, HD, COST, MCD, LOW, TJX, BKNG, PEP, KO |
| **Financials** | 15 | BRK.B, JPM, V, MA, BAC, WFC, GS, MS, BLK, SCHW, AXP, C, SPGI, COF, BX |
| **Healthcare** | 14 | UNH, JNJ, LLY, ABBV, MRK, PFE, TMO, ABT, DHR, AMGN, ISRG, GILD, BSX, SYK |
| **Industrials** | 12 | CAT, GE, HON, UNP, BA, RTX, LMT, DE, ETN, PLD, MDT, MMM |
| **Energy** | 3 | XOM, CVX, COP |
| **Consumer Staples** | 3 | PG, PM, LIN |
| **Utilities & Others** | 11 | NEE, CEG, DIS, VZ, TMUS, UBER, GEV, PGR, WELL, APH, ACN |

### 데이터베이스 테이블 구조

각 종목별로 6개의 시간프레임 테이블 존재 (총 606개 테이블):

| 테이블 접미사 | 시간프레임 | 용도 |
|--------------|-----------|------|
| `{SYMBOL}_D` | Daily | 일봉 데이터 (12개월) |
| `{SYMBOL}_W` | Weekly | 주봉 데이터 |
| `{SYMBOL}_M` | Monthly | 월봉 데이터 |
| `{SYMBOL}_1h` | 1 Hour | 1시간봉 (1일 데이터) |
| `{SYMBOL}_10m` | 10 Min | 10분봉 |
| `{SYMBOL}_12M` | 12 Month | 12개월 범위 데이터 |

**예시**: NVDA 종목 → `NVDA_D`, `NVDA_W`, `NVDA_M`, `NVDA_1h`, `NVDA_10m`, `NVDA_12M`

### 데이터 수집 주기

- **Daily 데이터**: 매일 장 마감 후 자동 스크래핑 (cron)
- **Intraday 데이터**: 1시간/10분봉 - 실시간 트레이딩용
- **Long-term 데이터**: 주봉/월봉 - 장기 트렌드 분석용

## 주요 용어

| 용어 | 설명 |
|------|------|
| Daily Rolling | 매일 포트폴리오 일부를 교체하는 운용 방식 |
| FIFO | 선입선출, 가장 오래된 매수 블록부터 매도 |
| 코호트 | 같은 날 편입된 종목 그룹 |
| 상관계수 0.7 | 국내 액티브 ETF 규제 기준 |
| 알파 | 벤치마크 대비 초과 수익 |
| 투자 유니버스 | AI 예측 및 포트폴리오 구성 대상 종목 집합 (101개) |
