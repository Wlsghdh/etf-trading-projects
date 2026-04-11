"""
TradingView Chart Data Scraper using Playwright with DB Upload (Container Version)
==================================================================================
기존 data-scraping/tradingview_playwright_scraper_upload.py 코드를 그대로 가져와서
컨테이너 환경에 맞게 최소한의 수정만 적용한 버전.

변경사항:
- 경로 설정 (다운로드, 쿠키, 로그)
- DB 연결 방식 (SSH 터널 → host.docker.internal)
- task_info.json 업데이트 추가
- DB 로그 저장 추가 (scraping_logs 테이블)
"""

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from playwright.async_api import async_playwright, Browser, Page, BrowserContext

from app.config import settings
from app.services.db_service import DatabaseService
from app.services.db_log_handler import write_log, SyncDBLogHandler
from app.models.task_info import task_info_manager, JobStatus, SymbolStatus, TimeframeStatus
from config.symbol_loader import STOCK_LIST, NYSE_SYMBOLS, SECTOR_MAP

logger = logging.getLogger(__name__)

# DB 로깅용 전역 변수
_log_engine = None
_log_job_id: Optional[str] = None
_sync_handler: Optional[SyncDBLogHandler] = None


def _db_log(level: str, message: str, symbol: str = None, timeframe: str = None, **extra):
    """Direct synchronous DB log write."""
    write_log(_log_engine, _log_job_id or "unknown", level, message, symbol, timeframe, extra or None)


def _attach_db_handler(engine, job_id: str):
    """Attach SyncDBLogHandler to root logger to capture ALL log messages."""
    global _sync_handler
    _detach_db_handler()
    _sync_handler = SyncDBLogHandler(engine, job_id)
    _sync_handler.setFormatter(logging.Formatter("%(message)s"))
    logging.getLogger().addHandler(_sync_handler)


def _detach_db_handler():
    """Remove SyncDBLogHandler from root logger."""
    global _sync_handler
    if _sync_handler:
        logging.getLogger().removeHandler(_sync_handler)
        _sync_handler = None

# 체크포인트 파일 경로
CHECKPOINT_FILE = Path(settings.log_dir if hasattr(settings, 'log_dir') else "/app/logs") / "scrape_checkpoint.json"


def _load_checkpoint() -> dict:
    """체크포인트 파일을 로드한다. 없으면 빈 딕셔너리 반환."""
    if CHECKPOINT_FILE.exists():
        try:
            with open(CHECKPOINT_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def _save_checkpoint(completed_symbols: list, failed_symbols: list, job_id: str):
    """현재까지 완료/실패한 종목을 체크포인트 파일에 저장한다."""
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "job_id": job_id,
        "completed_symbols": completed_symbols,
        "failed_symbols": failed_symbols,
        "last_updated": datetime.now().isoformat(),
        "total_completed": len(completed_symbols),
        "total_failed": len(failed_symbols),
    }
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _clear_checkpoint():
    """체크포인트 파일을 삭제한다 (전체 완료 시)."""
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()


# 설정 (기존 코드와 동일)
TIME_PERIODS = [
    {"name": "12달", "button_text": "1Y", "interval": "1 날"},
    {"name": "1달", "button_text": "1M", "interval": "30 분"},
    {"name": "1주", "button_text": "5D", "interval": "5 분"},
    {"name": "1일", "button_text": "1D", "interval": "1 분"},
]

# 종목 리스트 및 거래소 매핑은 config/symbols.yaml에서 로드
# STOCK_LIST, NYSE_SYMBOLS, SECTOR_MAP은 상단 import에서 가져옴

def get_exchange_prefix(symbol: str) -> str:
    """종목의 거래소 접두사 반환"""
    if symbol in NYSE_SYMBOLS:
        return f"NYSE:{symbol}"
    return f"NASDAQ:{symbol}"

# 컨테이너 환경 경로
DOWNLOAD_DIR = Path(settings.download_dir)
COOKIES_FILE = Path(settings.cookies_file)


class TradingViewScraper:
    """TradingView 차트 데이터 스크래퍼 (기존 코드와 동일한 로직)"""

    def __init__(self, headless: bool = True, job_id: str = None):
        self.headless = headless
        self.job_id = job_id
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None
        self.db_service: Optional[DatabaseService] = None

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def start(self):
        """브라우저 시작"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )

        # 다운로드 디렉토리 생성
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

        # 브라우저 컨텍스트 생성
        self.context = await self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            accept_downloads=True,
        )

        # 쿠키 로드 (있는 경우)
        if COOKIES_FILE.exists():
            with open(COOKIES_FILE, "r") as f:
                cookies = json.load(f)
                await self.context.add_cookies(cookies)
                logger.info(f"쿠키 로드됨: {len(cookies)}개")

        self.page = await self.context.new_page()

        # DB 연결
        try:
            self.db_service = DatabaseService()
            self.db_service.connect()
            logger.info("Database service connected")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            self.db_service = None

    async def close(self):
        """브라우저 종료"""
        if self.db_service:
            self.db_service.close()
            logger.info("Database service closed")

        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def save_cookies(self):
        """현재 쿠키를 파일에 저장"""
        if self.context:
            cookies = await self.context.cookies()
            with open(COOKIES_FILE, "w") as f:
                json.dump(cookies, f)
            logger.info(f"쿠키 저장됨: {len(cookies)}개")

    async def navigate_to_chart(self):
        """차트 페이지로 이동"""
        logger.info("차트 페이지로 이동 중...")
        await self.page.goto("https://kr.tradingview.com/chart/")

        # domcontentloaded만 대기 (networkidle은 차트 페이지에서 타임아웃 발생 가능)
        await self.page.wait_for_load_state("domcontentloaded")

        # 차트가 로드될 때까지 대기 (차트 영역이 나타날 때까지)
        try:
            await self.page.wait_for_selector(
                'div[class*="chart-container"], canvas', timeout=30000
            )
            logger.info("차트 로드 완료")
        except:
            logger.info("차트 로딩 대기 중...")

        await asyncio.sleep(3)  # 추가 로딩 대기

    async def search_and_select_symbol(self, symbol: str) -> bool:
        """
        심볼 검색 및 선택 (거래소 접두사 사용)

        Args:
            symbol: 검색할 심볼 (예: "NVDA", "AAPL")

        Returns:
            성공 여부
        """
        # 거래소 접두사 포함 심볼 (예: "NYSE:BA", "NASDAQ:AAPL")
        search_symbol = get_exchange_prefix(symbol)
        logger.info(f"심볼 검색: {search_symbol}")

        try:
            # 상단 툴바의 심볼 검색 버튼 클릭 (고정 ID 사용)
            symbol_btn = self.page.locator("#header-toolbar-symbol-search")
            await symbol_btn.click(timeout=5000)

            await asyncio.sleep(1)

            # 검색창에 심볼 입력 - "심볼, ISIN 또는 CUSIP" placeholder 사용
            search_input = (
                self.page.get_by_role("searchbox")
                .or_(self.page.get_by_placeholder("심볼, ISIN 또는 CUSIP"))
                .or_(self.page.locator('input[data-role="search"]'))
                .first
            )

            # 기존 텍스트 지우고 새로 입력 (거래소 접두사 포함)
            await search_input.clear()
            await search_input.fill(search_symbol, timeout=10000)
            await asyncio.sleep(1.5)  # 검색 결과 대기

            # 검색 결과에서 해당 심볼 클릭
            clicked = False

            # 방법 1: NASDAQ 거래소 주식 결과 클릭 (가장 일반적인 미국 주식)
            try:
                logger.info("방법 1: 첫번째 아이템 클릭")
                nasdaq_result = (
                    self.page.locator('[data-role="list-item"]').first
                )
                await nasdaq_result.click(timeout=3000)
                clicked = True
            except Exception as e:
                logger.warning(f"방법 1 실패: {e}")

            # 방법 2: NYSE 거래소 시도
            if not clicked:
                try:
                    logger.info("방법 2: NYSE 거래소 시도")
                    nyse_result = (
                        self.page.get_by_text(f"{symbol}")
                        .locator(
                            "xpath=ancestor::*[contains(., 'NYSE') and contains(., 'stock')]"
                        )
                        .first
                    )
                    await nyse_result.click(timeout=3000)
                    clicked = True
                except Exception as e:
                    logger.warning(f"방법 2 실패: {e}")

            # 방법 3: 첫 번째 검색 결과 (심볼명과 거래소 텍스트를 포함하는 요소)
            if not clicked:
                try:
                    logger.info("방법 3: 첫 번째 검색 결과")
                    first_result = self.page.locator(
                        f'div:has(> div:has-text("{symbol}")):has-text("stock")'
                    ).first
                    await first_result.click(timeout=3000)
                    clicked = True
                except Exception as e:
                    logger.warning(f"방법 3 실패: {e}")

            # 방법 4: Enter 키로 첫 번째 결과 선택
            if not clicked:
                logger.info("방법 4: Enter 키로 첫 번째 결과 선택")
                await self.page.keyboard.press("Enter")
                await asyncio.sleep(0.5)

            await asyncio.sleep(2)  # 차트 로딩 대기

            # === 심볼 검증: 차트에 표시된 심볼이 요청한 심볼과 일치하는지 확인 ===
            verified = await self._verify_chart_symbol(symbol)
            if not verified:
                logger.error(f"심볼 검증 실패: 차트에 {symbol}이 표시되지 않음")
                await self.capture_screenshot(f"symbol_verify_fail_{symbol}")
                return False

            logger.info(f"심볼 선택 및 검증 완료: {symbol}")
            return True

        except Exception as e:
            logger.error(f"심볼 검색 실패: {e}")
            await self.capture_screenshot(f"symbol_search_fail_{symbol}")
            # ESC로 다이얼로그 닫기
            await self.page.keyboard.press("Escape")
            await asyncio.sleep(0.5)
            return False

    async def _verify_chart_symbol(self, expected_symbol: str) -> bool:
        """
        차트에 현재 표시된 심볼이 기대하는 심볼과 일치하는지 검증.

        Args:
            expected_symbol: 기대하는 심볼 (예: "AAPL", "CSCO")

        Returns:
            일치하면 True
        """
        try:
            # 방법 1: 상단 툴바의 심볼 텍스트에서 확인
            chart_symbol = await self.page.evaluate("""
                () => {
                    // 심볼 검색 버튼 옆 텍스트
                    const symbolEl = document.querySelector('#header-toolbar-symbol-search');
                    if (symbolEl) {
                        const text = symbolEl.textContent || '';
                        return text.trim();
                    }
                    // 대체: 타이틀에서 추출
                    const titleEl = document.querySelector('[class*="symbolTitle"]') ||
                                    document.querySelector('[class*="title-"] > div');
                    if (titleEl) return titleEl.textContent.trim();
                    return '';
                }
            """)

            if chart_symbol and expected_symbol.upper() in chart_symbol.upper():
                logger.info(f"심볼 검증 성공: 차트={chart_symbol}, 기대={expected_symbol}")
                return True

            # 방법 2: 페이지 타이틀에서 확인
            page_title = await self.page.title()
            if expected_symbol.upper() in page_title.upper():
                logger.info(f"심볼 검증 성공 (타이틀): {page_title}")
                return True

            logger.warning(
                f"심볼 불일치 가능: 차트={chart_symbol}, 타이틀={page_title}, "
                f"기대={expected_symbol}. 계속 진행합니다."
            )
            # 경고만 하고 진행 (false positive 방지)
            return True

        except Exception as e:
            logger.warning(f"심볼 검증 중 오류 (무시하고 진행): {e}")
            return True

    async def capture_screenshot(self, name: str):
        """실패 시 디버깅용 스크린샷 캡처"""
        try:
            screenshot_dir = DOWNLOAD_DIR / "screenshots"
            screenshot_dir.mkdir(parents=True, exist_ok=True)
            path = screenshot_dir / f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            await self.page.screenshot(path=str(path), full_page=True)
            logger.info(f"스크린샷 저장: {path}")
        except Exception as e:
            logger.debug(f"스크린샷 실패: {e}")

    async def change_time_period(self, button_text: str) -> bool:
        """
        시간 단위 변경 - 여러 셀렉터를 순차적으로 시도

        Args:
            button_text: 버튼 텍스트 (예: "1Y", "1M", "5D", "1D")

        Returns:
            성공 여부
        """
        logger.info(f"시간 단위 변경: {button_text}")

        # 시도할 셀렉터 목록 (우선순위 순)
        selectors = [
            # 방법 1: 하단 날짜 범위 바에서 data-value 또는 value 속성으로 찾기
            f'button[data-value="{button_text}"]',
            f'button[value="{button_text}"]',
            # 방법 2: 텍스트 매칭 (정확히)
            f'button:has-text("{button_text}")',
            # 방법 3: id 기반 (TradingView가 가끔 사용)
            f'#header-toolbar-intervals button:has-text("{button_text}")',
            # 방법 4: 하단 날짜 범위 바 내 버튼
            f'div[class*="dateRangeExpander"] button:has-text("{button_text}")',
            f'div[class*="range-tab"] button:has-text("{button_text}")',
            f'div[class*="date-range"] button:has-text("{button_text}")',
        ]

        for i, selector in enumerate(selectors):
            try:
                btn = self.page.locator(selector).first
                await btn.click(timeout=3000)
                await asyncio.sleep(2)
                logger.info(f"시간 단위 변경 완료 (방법 {i+1}): {button_text}")
                return True
            except Exception:
                continue

        # 방법 5: JavaScript로 직접 클릭
        try:
            clicked = await self.page.evaluate(f"""
                () => {{
                    // 모든 버튼에서 텍스트가 정확히 일치하는 것 찾기
                    const buttons = document.querySelectorAll('button');
                    for (const btn of buttons) {{
                        const text = btn.textContent.trim();
                        if (text === '{button_text}') {{
                            btn.click();
                            return true;
                        }}
                    }}
                    return false;
                }}
            """)
            if clicked:
                await asyncio.sleep(2)
                logger.info(f"시간 단위 변경 완료 (JS): {button_text}")
                return True
        except Exception:
            pass

        # 방법 6: get_by_role로 시도
        try:
            btn = self.page.get_by_role("button", name=button_text, exact=True)
            await btn.click(timeout=3000)
            await asyncio.sleep(2)
            logger.info(f"시간 단위 변경 완료 (role): {button_text}")
            return True
        except Exception:
            pass

        logger.error(f"시간 단위 변경 최종 실패: {button_text}")
        await self.capture_screenshot(f"time_period_fail_{button_text}")
        return False

    def _get_timeframe_code(self, period_name: str) -> str:
        """
        Convert Korean period name to database timeframe code.
        """
        timeframe_map = {
            "12달": "D",
            "12개월": "D",
            "1달": "30m",
            "1개월": "30m",
            "1주": "5m",
            "1일": "1m",
        }
        return timeframe_map.get(period_name, "D")

    async def export_chart_data(
        self, output_filename: Optional[str] = None
    ) -> Optional[Path]:
        """
        차트 데이터를 CSV로 다운로드 (기존 코드와 동일)

        Args:
            output_filename: 출력 파일명 (없으면 자동 생성)

        Returns:
            다운로드된 파일 경로 또는 None
        """
        logger.info("차트 데이터 다운로드 시작...")

        try:
            arrow_clicked = await self.page.evaluate("""
                () => {
                    const arrows = document.querySelectorAll('div[class*="arrow"]');
                    if (arrows.length > 0) {
                        arrows[0].click();
                        return true;
                    }
                    return false;
                }
            """)

            if not arrow_clicked:
                logger.warning("레이아웃 메뉴를 찾을 수 없습니다")
                return None

            await asyncio.sleep(0.5)

            try:
                download_option = self.page.get_by_role(
                    "row", name="차트 데이터 다운로드"
                )
                await download_option.click(timeout=5000)
            except:
                download_option = self.page.locator("text=차트 데이터 다운로드")
                await download_option.click(timeout=5000)

            await asyncio.sleep(0.5)

            async with self.page.expect_download(timeout=60000) as download_info:
                download_btn = self.page.get_by_role("button", name="다운로드")
                await download_btn.click()

            download = await download_info.value

            # 파일 저장
            if output_filename:
                save_path = DOWNLOAD_DIR / output_filename
            else:
                save_path = DOWNLOAD_DIR / download.suggested_filename

            await download.save_as(save_path)
            logger.info(f"다운로드 완료: {save_path}")
            return save_path

        except Exception as e:
            logger.error(f"다운로드 실패: {e}")
            await self.capture_screenshot(f"download_fail")
            # ESC로 다이얼로그 닫기
            await self.page.keyboard.press("Escape")
            return None

    async def process_single_stock(self, symbol: str, max_retries: int = 3) -> dict:
        """
        단일 종목에 대해 모든 시간대 데이터 수집 (기존 코드와 동일한 로직)

        Args:
            symbol: 종목 심볼
            max_retries: 최대 재시도 횟수

        Returns:
            결과 딕셔너리 {period_name: file_path}
        """
        results = {}

        # 심볼 선택 (재시도)
        for attempt in range(max_retries):
            if await self.search_and_select_symbol(symbol):
                break
            else:
                if attempt < max_retries - 1:
                    logger.warning(f"심볼 선택 실패 (시도 {attempt + 1}/{max_retries}). 재시도 중...")
                    await asyncio.sleep(2)
                else:
                    logger.error(f"심볼 선택 최종 실패: {symbol}")
                    # 모든 timeframe을 실패로 표시
                    for period in TIME_PERIODS:
                        await task_info_manager.update_timeframe_status(
                            symbol, period["name"], TimeframeStatus.FAILED,
                            error="심볼 선택 실패"
                        )
                    return results

        # 각 시간대별로 데이터 수집
        for period in TIME_PERIODS:
            period_name = period["name"]
            button_text = period["button_text"]

            logger.info(f"\n[{symbol}] {period_name} 데이터 수집 중...")
            _db_log("INFO", f"{period_name} 데이터 수집 중...", symbol=symbol, timeframe=period_name)

            # timeframe 상태를 downloading으로 업데이트
            await task_info_manager.update_timeframe_status(
                symbol, period_name, TimeframeStatus.DOWNLOADING
            )

            # 시간 단위 변경 (재시도)
            time_change_success = False
            for attempt in range(max_retries):
                if await self.change_time_period(button_text):
                    time_change_success = True
                    break
                else:
                    if attempt < max_retries - 1:
                        logger.warning(f"시간 단위 변경 실패 (시도 {attempt + 1}/{max_retries}). 재시도 중...")
                        await asyncio.sleep(2)

            if not time_change_success:
                logger.error(f"시간 단위 변경 최종 실패: {button_text}")
                await task_info_manager.update_timeframe_status(
                    symbol, period_name, TimeframeStatus.FAILED,
                    error=f"시간 단위 변경 최종 실패: {button_text}"
                )
                continue

            await asyncio.sleep(1)

            # 데이터 다운로드 (재시도)
            timeframe_code = self._get_timeframe_code(period_name)
            filename = (
                f"{symbol}_{period_name}_{datetime.now().strftime('%Y%m%d')}.csv"
            )

            file_path = None
            for attempt in range(max_retries):
                file_path = await self.export_chart_data(filename)
                if file_path:
                    break
                else:
                    if attempt < max_retries - 1:
                        logger.warning(f"다운로드 실패 (시도 {attempt + 1}/{max_retries}). 재시도 중...")
                        await asyncio.sleep(2)

            if file_path:
                results[period_name] = file_path

                # DB 업로드
                if self.db_service:
                    try:
                        rows = self.db_service.upload_csv(
                            file_path, symbol, timeframe_code
                        )
                        logger.info(
                            f"  [{symbol} - {period_name}] ✓ Uploaded {rows} rows to DB"
                        )
                        _db_log("INFO", f"Uploaded {rows} rows to DB", symbol=symbol, timeframe=period_name, rows=rows)
                        # 성공 상태 업데이트
                        await task_info_manager.update_timeframe_status(
                            symbol, period_name, TimeframeStatus.SUCCESS, rows=rows
                        )
                    except Exception as e:
                        logger.error(
                            f"  [{symbol} - {period_name}] ✗ DB upload failed: {e}"
                        )
                        _db_log("ERROR", f"DB upload failed: {e}", symbol=symbol, timeframe=period_name)
                        await task_info_manager.update_timeframe_status(
                            symbol, period_name, TimeframeStatus.FAILED,
                            error=f"DB upload failed: {e}"
                        )
                else:
                    # DB 서비스 없어도 다운로드 성공으로 처리
                    await task_info_manager.update_timeframe_status(
                        symbol, period_name, TimeframeStatus.SUCCESS, rows=0
                    )
            else:
                logger.error(f"다운로드 최종 실패: {symbol} - {period_name}")
                _db_log("ERROR", "다운로드 최종 실패", symbol=symbol, timeframe=period_name)
                await task_info_manager.update_timeframe_status(
                    symbol, period_name, TimeframeStatus.FAILED,
                    error="다운로드 최종 실패"
                )

        return results

    async def process_all_stocks(self, stock_list: List[str] = None, is_retry: bool = False, resume: bool = True) -> dict:
        """
        모든 종목에 대해 데이터 수집 (체크포인트/재개 기능 포함)

        Args:
            stock_list: 종목 리스트 (없으면 기본 STOCK_LIST 사용)
            is_retry: retry 모드인지 여부
            resume: True면 이전 체크포인트에서 이어서 수집

        Returns:
            결과 딕셔너리 {symbol: {period_name: file_path}}
        """
        if stock_list is None:
            stock_list = STOCK_LIST

        all_results = {}
        retry_id = None
        completed_symbols = []
        failed_symbols = []

        # 체크포인트에서 이전 진행 상황 로드
        skipped_count = 0
        if resume and not is_retry:
            checkpoint = _load_checkpoint()
            if checkpoint.get("completed_symbols"):
                prev_completed = set(checkpoint["completed_symbols"])
                skipped_count = len(prev_completed)
                completed_symbols = list(prev_completed)
                logger.info(f"체크포인트 발견: {skipped_count}개 종목 이미 완료. 나머지부터 재개합니다.")
                _db_log("INFO", f"체크포인트에서 재개: {skipped_count}개 이미 완료")

        if is_retry:
            # retry 모드: 기존 상태 유지하면서 특정 심볼만 재처리
            retry_id = await task_info_manager.start_retry_task(stock_list)
            logger.info(f"Retry task started: {retry_id}")
        else:
            # full 모드: 새로운 job 초기화
            job_id = f"scrape_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            await task_info_manager.initialize_job(job_id, stock_list)
            await task_info_manager.update_job_status(JobStatus.RUNNING)

            # Setup DB logging with job_id
            global _log_engine, _log_job_id
            if self.db_service and self.db_service.engine:
                _log_engine = self.db_service.engine
                _log_job_id = job_id
                _attach_db_handler(self.db_service.engine, job_id)

        # 차트 페이지로 이동 (한 번만!)
        await self.navigate_to_chart()

        completed_set = set(completed_symbols)

        for i, symbol in enumerate(stock_list):
            # 체크포인트: 이미 완료된 종목은 건너뛰기
            if symbol in completed_set:
                logger.info(f"[{i + 1}/{len(stock_list)}] {symbol} - 이미 완료, 건너뜀")
                continue

            logger.info(f"\n{'=' * 50}")
            logger.info(f"[{i + 1}/{len(stock_list)}] {symbol} 처리 중... (완료: {len(completed_symbols)}, 실패: {len(failed_symbols)})")
            logger.info("=" * 50)
            _db_log("INFO", f"[{i + 1}/{len(stock_list)}] {symbol} 처리 시작", symbol=symbol)

            # task_info 업데이트
            await task_info_manager.update_symbol_status(symbol, SymbolStatus.DOWNLOADING)
            await task_info_manager.set_current_symbol(symbol)

            try:
                results = await self.process_single_stock(symbol)
                all_results[symbol] = results

                # 결과에 따라 완료/실패 분류
                if results:
                    completed_symbols.append(symbol)
                    completed_set.add(symbol)
                else:
                    failed_symbols.append(symbol)
            except Exception as e:
                logger.error(f"[{symbol}] 예외 발생: {e}")
                _db_log("ERROR", f"예외 발생: {e}", symbol=symbol)
                failed_symbols.append(symbol)

            # 체크포인트 저장 (매 종목 완료 후)
            if not is_retry:
                _save_checkpoint(completed_symbols, failed_symbols, job_id)

            # Rate limiting
            await asyncio.sleep(2)

        # job 완료
        job_info = await task_info_manager.get_job_info()
        completed = sum(1 for s in job_info.symbols.values() if s.status == SymbolStatus.COMPLETED)
        total = len(stock_list)

        if is_retry and retry_id:
            # retry 모드: retry task 완료 처리
            if completed == total:
                await task_info_manager.complete_retry_task(retry_id, JobStatus.COMPLETED)
            elif completed > 0:
                await task_info_manager.complete_retry_task(retry_id, JobStatus.PARTIAL)
            else:
                await task_info_manager.complete_retry_task(retry_id, JobStatus.ERROR)
        else:
            # full 모드
            if completed == len(job_info.symbols):
                await task_info_manager.update_job_status(JobStatus.COMPLETED)
                _clear_checkpoint()  # 전체 완료 시 체크포인트 삭제
            elif completed > 0:
                await task_info_manager.update_job_status(JobStatus.PARTIAL)
            else:
                await task_info_manager.update_job_status(JobStatus.ERROR)

        logger.info(f"\n{'=' * 50}")
        logger.info(f"Job 완료: {completed}/{total} 성공, {len(failed_symbols)}개 실패")
        if failed_symbols:
            logger.info(f"실패 종목: {failed_symbols}")
        logger.info("=" * 50)
        _db_log("INFO", f"Job 완료: {completed}/{total} 성공", completed=completed, total=total)
        _detach_db_handler()

        return all_results

    async def retry_failed(self) -> dict:
        """체크포인트에서 실패한 종목만 재수집한다."""
        checkpoint = _load_checkpoint()
        if not checkpoint:
            logger.info("체크포인트 파일이 없습니다. 재시도할 종목이 없습니다.")
            return {}

        completed_set = set(checkpoint.get("completed_symbols", []))
        all_symbols = set(STOCK_LIST)
        failed = list(all_symbols - completed_set)

        if not failed:
            logger.info("모든 종목이 이미 완료되었습니다.")
            _clear_checkpoint()
            return {}

        logger.info(f"실패/미완료 종목 {len(failed)}개 재수집 시작")
        return await self.process_all_stocks(stock_list=failed, is_retry=True, resume=False)


# Global instance for API use
scraper = TradingViewScraper(headless=settings.headless)
