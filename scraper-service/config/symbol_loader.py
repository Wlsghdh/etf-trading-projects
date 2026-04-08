"""
Symbol Loader - YAML 설정 파일에서 종목 리스트를 로드하는 모듈

symbols.yaml 파일을 읽어서 STOCK_LIST, NYSE_SYMBOLS, SECTOR_MAP을 반환한다.
종목 추가/삭제 시 symbols.yaml만 수정하면 코드 변경 없이 반영된다.
"""

import yaml
from pathlib import Path
from typing import Tuple, List, Set, Dict

# 기본 설정 파일 경로 (scraper-service/config/symbols.yaml)
_DEFAULT_CONFIG_PATH = Path(__file__).parent / "symbols.yaml"


def load_symbols(config_path: str = None) -> Tuple[List[str], Set[str], Dict[str, str]]:
    """
    symbols.yaml에서 종목 정보를 로드한다.

    Returns:
        stock_list: 전체 종목 심볼 리스트 (순서 보장)
        nyse_symbols: NYSE 거래소 종목 세트
        sector_map: {심볼: 섹터} 매핑 딕셔너리
    """
    path = Path(config_path) if config_path else _DEFAULT_CONFIG_PATH

    with open(path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    stock_list = []
    nyse_symbols = set()
    sector_map = {}

    for sector, symbols in config["sectors"].items():
        for item in symbols:
            symbol = item["symbol"]
            exchange = item.get("exchange", "NASDAQ")

            stock_list.append(symbol)
            sector_map[symbol] = sector

            if exchange == "NYSE":
                nyse_symbols.add(symbol)

    return stock_list, nyse_symbols, sector_map


# 모듈 임포트 시 바로 사용할 수 있도록 로드
STOCK_LIST, NYSE_SYMBOLS, SECTOR_MAP = load_symbols()
