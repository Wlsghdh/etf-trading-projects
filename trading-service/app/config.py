from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # KIS API
    kis_app_key: str = ""
    kis_app_secret: str = ""
    kis_account_number: str = ""  # XXXXXXXX-XX
    kis_base_url: str = "https://openapivts.koreainvestment.com:29443"  # 모의투자 기본
    trading_mode: str = "paper"  # "paper" | "live"
    kis_live_confirmation: bool = False  # 실투자 안전장치

    # ML Service 연동
    ml_service_url: str = "http://ml-service:8000"

    # 전략 파라미터
    strategy_ratio: float = 0.7  # 전략 자금 비율 (ML 랭킹 기반)
    fixed_ratio: float = 0.3  # 고정 편입 비율
    top_n_etfs: int = 100  # 매수 종목 수
    cycle_trading_days: int = 63  # 순환 주기 (거래일)
    fixed_etf_codes: list[str] = ["QQQM"]  # 30% 고정 편입 ETF 코드 목록 (QQQ → QQQM, 가격 부담 완화)
    order_type: str = "limit"  # "market" (시장가) | "limit" (지정가: 전일 종가)

    # 해외주식 설정
    default_exchange_code: str = "NASD"  # 기본 거래소 (NASD, NYSE, AMEX)
    trade_currency: str = "USD"  # 거래 통화

    # 스케줄러
    trade_hour_kst: int = 8
    trade_minute_kst: int = 30

    # DB
    local_db_path: str = "/app/data/trading.db"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8002
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
