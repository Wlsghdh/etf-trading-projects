import logging
from datetime import date, timedelta

import exchange_calendars as xcals

logger = logging.getLogger(__name__)

# NYSE 거래소 달력 (미국 주식 거래)
_nyse_calendar = xcals.get_calendar("XNYS")


def is_trading_day(d: date) -> bool:
    """NYSE 거래일 여부"""
    import pandas as pd
    ts = pd.Timestamp(d)
    return _nyse_calendar.is_session(ts)


def count_trading_days(start: date, end: date) -> int:
    """start ~ end 사이 거래일 수 (start 포함, end 포함)"""
    import pandas as pd
    sessions = _nyse_calendar.sessions_in_range(
        pd.Timestamp(start), pd.Timestamp(end)
    )
    return len(sessions)


def get_next_trading_day(d: date) -> date:
    """d 이후 다음 거래일 반환 (d가 거래일이면 d 반환)"""
    import pandas as pd
    ts = pd.Timestamp(d)
    if _nyse_calendar.is_session(ts):
        return d
    for i in range(1, 11):
        next_d = d + timedelta(days=i)
        if _nyse_calendar.is_session(pd.Timestamp(next_d)):
            return next_d
    return d + timedelta(days=1)


def get_trading_day_number_since(start: date, current: date) -> int:
    """start부터 current까지의 거래일 번호 (1-based)"""
    import pandas as pd
    sessions = _nyse_calendar.sessions_in_range(
        pd.Timestamp(start), pd.Timestamp(current)
    )
    return len(sessions)
