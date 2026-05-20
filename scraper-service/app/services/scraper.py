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
    """심볼 반환 (거래소 접두사 없이 심볼만 사용)"""
    return symbol

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

    async def _login_with_credentials(self):
        """ID/PW로 TradingView 로그인 (쿠키 만료 시 사용)"""
        username = settings.tradingview_username
        password = settings.tradingview_password
        if not username or not password:
            logger.warning("TradingView 로그인 정보가 설정되지 않았습니다")
            return False

        logger.info(f"ID/PW로 로그인 시도: {username}")
        try:
            # 로그인 페이지로 직접 이동
            await self.page.goto("https://kr.tradingview.com/accounts/signin/")
            await self.page.wait_for_load_state("domcontentloaded")
            await asyncio.sleep(3)

            # 이메일 로그인 선택
            email_btn = self.page.locator('button:has-text("이메일")')
            if await email_btn.count() > 0:
                await email_btn.click()
                await asyncio.sleep(1)

            # 유저네임/비밀번호 입력
            username_input = self.page.get_by_role("textbox", name="유저네임 또는 이메일")
            await username_input.fill(username, timeout=10000)
            password_input = self.page.get_by_role("textbox", name="비밀번호")
            await password_input.fill(password, timeout=10000)

            # 로그인 버튼 클릭
            submit_btn = self.page.locator('button[type="submit"], form button:has-text("로그인")')
            await submit_btn.first.click()
            await asyncio.sleep(8)

            # 로그인 성공 확인 (차트 페이지로 리다이렉트 또는 프로필 아이콘 존재)
            current_url = self.page.url
            logged_in = await self.page.locator('button[aria-label*="로그인계정"], button[aria-label*="유저 메뉴"]').count()
            if logged_in > 0 or "chart" in current_url:
                logger.info("ID/PW 로그인 성공!")
                await self.save_cookies()
                return True
            else:
                logger.error("ID/PW 로그인 실패")
                return False

        except Exception as e:
            logger.error(f"로그인 중 오류: {e}")
            return False

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

        # 로그인 여부 확인 — 안 되어 있으면 ID/PW로 로그인
        logged_in = await self.page.locator('button[aria-label*="로그인계정"]').count()
        if logged_in == 0:
            logger.warning("쿠키 로그인 실패 — ID/PW로 재로그인 시도")
            if await self._login_with_credentials():
                # 로그인 후 차트 페이지로 다시 이동
                await self.page.goto("https://kr.tradingview.com/chart/")
                await self.page.wait_for_load_state("domcontentloaded")
                await asyncio.sleep(5)
        else:
            logger.info("로그인 확인됨")

        # 즐겨찾기 지표 등 사이드 패널 닫기
        await self._dismiss_popups()

        # 차트 타입을 캔들스틱(OHLC)으로 강제 설정
        await self._ensure_candlestick_chart()

    async def _ensure_candlestick_chart(self):
        """차트 타입을 캔들스틱으로 설정 (라인 차트이면 OHLC 데이터가 CSV에 빠짐)"""
        try:
            # 현재 차트 타입 확인
            current_label = await self.page.locator(
                '#header-toolbar-chart-styles button'
            ).first.get_attribute('aria-label')
            logger.info(f"현재 차트 타입: {current_label}")

            if current_label and '캔들' in current_label:
                logger.info("이미 캔들스틱 차트 — 변경 불필요")
                return

            # 차트 타입 드롭다운 열기
            await self.page.locator('#header-toolbar-chart-styles button').first.click(timeout=5000)
            await asyncio.sleep(1)

            # '캔들' 옵션 클릭
            candle = self.page.get_by_text('캔들', exact=True)
            if await candle.count() > 0:
                await candle.first.click(timeout=3000)
                logger.info("차트 타입을 캔들스틱으로 변경 완료")
                await asyncio.sleep(1)

                # 레이아웃 저장 (Ctrl+S)
                await self.page.keyboard.press("Control+s")
                await asyncio.sleep(2)
                logger.info("레이아웃 저장 완료 (Ctrl+S)")
            else:
                logger.warning("캔들 옵션을 찾을 수 없음")
                await self.page.keyboard.press("Escape")
        except Exception as e:
            logger.warning(f"차트 타입 설정 중 오류: {e}")

    async def _dismiss_popups(self):
        """TradingView 팝업/광고/배너 자동 닫기"""
        # 방법 0: tv-dialog__modal-container 전용 처리 (거래소 계약서 등)
        try:
            modal = self.page.locator(".tv-dialog__modal-container")
            if await modal.count() > 0:
                logger.info("tv-dialog 모달 감지됨, 닫는 중...")
                closed = False
                for selector in [
                    ".tv-dialog__modal-container button[aria-label='Close']",
                    ".tv-dialog__modal-container button[aria-label='닫기']",
                    ".tv-dialog__modal-container [class*='close']",
                    ".tv-dialog__modal-container button:has(svg)",
                ]:
                    try:
                        close_btn = self.page.locator(selector).first
                        if await close_btn.count() > 0:
                            await close_btn.click(timeout=2000)
                            closed = True
                            logger.info(f"tv-dialog 모달 닫기 성공: {selector}")
                            break
                    except Exception:
                        continue
                if not closed:
                    await self.page.keyboard.press("Escape")
                    await asyncio.sleep(0.5)
                # 그래도 남아있으면 DOM에서 강제 제거
                if await modal.count() > 0:
                    try:
                        await modal.first.evaluate("el => el.remove()")
                        logger.info("tv-dialog 모달 강제 제거 완료")
                    except Exception:
                        pass
                await asyncio.sleep(0.5)
        except Exception as e:
            logger.warning(f"tv-dialog 모달 닫기 중 오류 (무시): {e}")

        try:
            # 방법 1: 모달/다이얼로그의 X 버튼으로 닫기
            closed = await self.page.evaluate("""
                () => {
                    let closed = 0;
                    // 모달/다이얼로그 닫기 버튼 (X) — 거래소 계약서, 광고, 알림 등
                    const closeSelectors = [
                        'button[aria-label="Close"]',
                        'button[aria-label="닫기"]',
                        'div[class*="dialog"] button[class*="close"]',
                        'div[class*="modal"] button[class*="close"]',
                        'div[class*="popup"] button[class*="close"]',
                        'div[class*="overlay"] button[class*="close"]',
                        'div[data-dialog-name] button[class*="close"]',
                        'div[class*="toast"] button[class*="close"]',
                    ];
                    for (const sel of closeSelectors) {
                        const btns = document.querySelectorAll(sel);
                        for (const btn of btns) {
                            try {
                                if (btn.offsetHeight > 0) { btn.click(); closed++; }
                            } catch {}
                        }
                    }
                    // 모달 배경 클릭으로 닫기
                    const overlays = document.querySelectorAll(
                        'div[class*="overlay"][class*="modal"], div[class*="backdrop"]'
                    );
                    for (const ov of overlays) {
                        try { ov.click(); closed++; } catch {}
                    }
                    return closed;
                }
            """)
            if closed > 0:
                logger.info(f"팝업 {closed}개 닫음")
                await asyncio.sleep(0.5)
        except Exception:
            pass

        # 방법 1.5: ESC 키로 남은 모달 닫기
        try:
            await self.page.keyboard.press("Escape")
            await asyncio.sleep(0.3)
        except Exception:
            pass

        # 방법 2: 즐겨찾기 지표 등 드롭다운/패널 닫기 - 차트 영역 클릭
        try:
            # 차트 캔버스 영역 클릭으로 떠있는 메뉴/패널 닫기
            chart = self.page.locator('div[class*="chart-container"] canvas').first
            if await chart.count() > 0:
                box = await chart.bounding_box()
                if box:
                    # 차트 중앙 클릭
                    await self.page.mouse.click(
                        box["x"] + box["width"] / 2,
                        box["y"] + box["height"] / 2
                    )
                    logger.info("차트 영역 클릭으로 패널 닫기 시도")
                    await asyncio.sleep(0.5)
        except Exception:
            pass

        # 방법 3: ESC 키
        try:
            await self.page.keyboard.press("Escape")
            await asyncio.sleep(0.3)
        except Exception:
            pass

    async def search_and_select_symbol(self, symbol: str) -> bool:
        """
        심볼 검색 및 선택 (거래소 접두사 사용)

        Args:
            symbol: 검색할 심볼 (예: "NVDA", "AAPL")

        Returns:
            성공 여부
        """
        # 팝업/광고 자동 닫기 (Flash Sale 등)
        await self._dismiss_popups()

        search_symbol = get_exchange_prefix(symbol)
        logger.info(f"심볼 검색: {search_symbol}")

        try:
            # 상단 툴바의 심볼 검색 버튼 클릭 (고정 ID 사용)
            symbol_btn = self.page.locator("#header-toolbar-symbol-search")
            await symbol_btn.click(timeout=5000)
            await asyncio.sleep(1)

            # 검색창 찾기
            search_input = (
                self.page.get_by_role("searchbox")
                .or_(self.page.get_by_placeholder("심볼, ISIN 또는 CUSIP"))
                .or_(self.page.locator('input[data-role="search"]'))
                .first
            )

            # 검색창 확실히 비우기: triple-click으로 전체 선택 후 삭제
            await search_input.click()
            await self.page.keyboard.press("Control+a")
            await self.page.keyboard.press("Backspace")
            await asyncio.sleep(0.3)

            # 한 글자씩 타이핑 (fill보다 검색 결과 트리거가 확실함)
            await search_input.type(search_symbol, delay=50)
            await asyncio.sleep(2)  # 검색 결과 로딩 대기 (충분히)

            # 검색 결과에서 해당 심볼 클릭
            clicked = False

            # 방법 1: 첫 번째 리스트 아이템 클릭
            try:
                first_item = self.page.locator('[data-role="list-item"]').first
                # 첫 번째 아이템의 텍스트에 심볼이 포함되어 있는지 확인
                item_text = await first_item.text_content(timeout=3000)
                if item_text and symbol.upper() in item_text.upper():
                    await first_item.click(timeout=3000)
                    clicked = True
                    logger.info(f"방법 1: 첫번째 아이템 클릭 (텍스트: {item_text[:50]})")
                else:
                    logger.warning(f"방법 1: 첫 번째 결과가 '{symbol}'과 불일치 (텍스트: {item_text[:50] if item_text else 'None'})")
            except Exception as e:
                logger.warning(f"방법 1 실패: {e}")

            # 방법 2: 검색 결과 중 심볼 텍스트를 정확히 포함하는 아이템 찾기
            if not clicked:
                try:
                    logger.info("방법 2: 심볼 텍스트 매칭 아이템 검색")
                    items = self.page.locator('[data-role="list-item"]')
                    count = await items.count()
                    for idx in range(min(count, 10)):
                        item = items.nth(idx)
                        text = await item.text_content(timeout=2000)
                        if text and symbol.upper() in text.upper():
                            await item.click(timeout=3000)
                            clicked = True
                            logger.info(f"방법 2: {idx+1}번째 아이템 클릭 (텍스트: {text[:50]})")
                            break
                except Exception as e:
                    logger.warning(f"방법 2 실패: {e}")

            # 방법 3: Enter 키로 첫 번째 결과 선택 (최후 수단)
            if not clicked:
                logger.info("방법 3: Enter 키로 첫 번째 결과 선택")
                await self.page.keyboard.press("Enter")
                await asyncio.sleep(0.5)

            await asyncio.sleep(2)

            # 검색 다이얼로그가 남아있을 수 있으므로 ESC로 닫기
            await self.page.keyboard.press("Escape")
            await asyncio.sleep(2)  # 차트 로딩 + 미존재 메시지 렌더링 대기

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

    async def _check_symbol_not_found(self) -> bool:
        """
        차트에 "이 심볼은 존재하지 않습니다" 메시지가 표시되는지 확인.
        여러 패턴을 종합적으로 체크.

        Returns:
            심볼이 존재하지 않으면 True (= 스킵해야 함)
        """
        try:
            not_found = await self.page.evaluate("""
                () => {
                    // 차트 영역과 전체 body 모두 확인
                    const chartArea = document.querySelector('[class*="chart-container"]');
                    const chartText = chartArea ? chartArea.innerText : '';
                    const body = document.body.innerText || '';
                    const allText = chartText + ' ' + body;

                    // 1. 직접적인 "심볼 미존재" 텍스트 감지
                    if (allText.includes('심볼은 존재하지 않습니다')) return 'text_not_found';
                    if (allText.includes('Symbol not found')) return 'text_not_found';
                    if (allText.includes('Invalid symbol')) return 'text_not_found';

                    // 2. "심볼 바꾸기" 버튼 감지 (미존재 심볼 페이지에만 표시)
                    const buttons = document.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = btn.textContent.trim();
                        if (text === '심볼 바꾸기' || text === 'Change Symbol') return 'change_symbol_btn';
                    }

                    // 3. 에러 아이콘 감지: 헤더에 빨간 X 에러 표시 (시O 고O 저O 종O 모두 0)
                    //    스크린샷에서 보면 "시O 고O 저O 종O 0 (0%) 볼륨O" 패턴
                    const headerText = document.querySelector('[class*="headerWrapper"]')?.innerText || '';
                    if (headerText && /시.?0.*고.?0.*저.?0.*종.?0/.test(headerText)) return 'zero_ohlc';

                    // 4. 차트 헤더의 에러 상태 아이콘 감지 (빨간 X)
                    const errorIcon = document.querySelector('[class*="statusItem"][class*="error"]') ||
                                     document.querySelector('[class*="main-"] svg[class*="error"]');
                    if (errorIcon) return 'error_icon';

                    // 5. 분석을 위해 다른 항목을 선택해 보세요 텍스트 감지
                    if (body.includes('분석을 위해 다른 항목을 선택해 보세요')) return 'select_other';

                    // 5.5. "데이터 없음" 감지 (심볼은 있지만 데이터가 없는 경우)
                    if (allText.includes('데이터 없음')) return 'no_data';
                    if (allText.includes('No data')) return 'no_data';
                    if (body.includes('곧 차트에 나타나길 바랍니다')) return 'no_data';

                    // 6. 인터벌 제한 메시지 감지 (D, W, M만 가능한 심볼)
                    if (body.includes('인터벌만 사용 가능합니다')) return 'interval_limited';
                    if (body.includes('다른 시간 간격을 선택하세요')) return 'interval_limited';

                    // 7. "D 인터벌로 전환" 버튼 감지
                    for (const btn of buttons) {
                        const text = btn.textContent.trim();
                        if (text.includes('인터벌로 전환')) return 'interval_switch_btn';
                    }

                    return false;
                }
            """)
            if not_found:
                logger.info(f"심볼 미존재 감지 방법: {not_found}")
            return bool(not_found)
        except Exception:
            return False

    async def _verify_chart_symbol(self, expected_symbol: str) -> bool:
        """
        차트에 현재 표시된 심볼이 기대하는 심볼과 일치하는지 검증.
        심볼이 존재하지 않으면 False 반환.

        Args:
            expected_symbol: 기대하는 심볼 (예: "AAPL", "CSCO")

        Returns:
            일치하면 True, 심볼 미존재면 False
        """
        try:
            # 심볼 미존재 감지 (가장 중요!)
            if await self._check_symbol_not_found():
                logger.error(f"심볼 미존재 감지: {expected_symbol} - TradingView에서 이 심볼을 찾을 수 없음")
                _db_log("ERROR", f"심볼 미존재: TradingView에서 찾을 수 없음", symbol=expected_symbol)
                return False

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

            if chart_symbol:
                # 엄격한 매칭: 심볼이 정확히 포함되어야 함 (ALTR ≠ ALTRCAX)
                import re
                # "AAPL" 또는 "NYSE:AAPL" 패턴에서 심볼 부분만 추출하여 비교
                chart_upper = chart_symbol.upper()
                expected_upper = expected_symbol.upper()
                # 정확한 단어 경계 매칭 (심볼 뒤에 다른 알파벳이 오면 불일치)
                pattern = rf'\b{re.escape(expected_upper)}\b'
                if re.search(pattern, chart_upper):
                    # 심볼 이름은 맞지만 데이터가 없을 수 있음 (CTRA, MRO 등)
                    # 한 번 더 미존재 체크
                    if await self._check_symbol_not_found():
                        logger.error(f"심볼 이름 일치하나 데이터 없음: {expected_symbol}")
                        _db_log("ERROR", f"심볼 데이터 없음: 이름은 맞으나 TradingView에 데이터 없음", symbol=expected_symbol)
                        return False
                    logger.info(f"심볼 검증 성공: 차트={chart_symbol}, 기대={expected_symbol}")
                    return True
                else:
                    logger.warning(f"심볼 불일치: 차트={chart_symbol}, 기대={expected_symbol}")
                    # 잘못된 심볼이 선택됨 - False 반환
                    return False

            # 방법 2: 페이지 타이틀에서 확인
            page_title = await self.page.title()
            if expected_symbol.upper() in page_title.upper():
                logger.info(f"심볼 검증 성공 (타이틀): {page_title}")
                return True

            logger.warning(
                f"심볼 불일치 가능: 차트={chart_symbol}, 타이틀={page_title}, "
                f"기대={expected_symbol}. 계속 진행합니다."
            )
            # 차트 심볼을 알 수 없는 경우에만 경고 후 진행
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

        # 시간 단위 변경 전 심볼 미존재 체크
        if await self._check_symbol_not_found():
            logger.warning(f"시간 단위 변경 스킵: 심볼 미존재 상태 ({button_text})")
            return False

        # 시간 단위 변경 전 팝업/모달 정리
        await self._dismiss_popups()

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
                await btn.click(timeout=5000)
                await asyncio.sleep(3)
                # 시간 단위 변경 후 인터벌 제한 메시지 체크
                if await self._check_symbol_not_found():
                    logger.warning(f"시간 단위 변경 후 인터벌 제한/심볼 미존재 감지: {button_text}")
                    return False
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
                if await self._check_symbol_not_found():
                    logger.warning(f"시간 단위 변경 후 인터벌 제한/심볼 미존재 감지 (JS): {button_text}")
                    return False
                logger.info(f"시간 단위 변경 완료 (JS): {button_text}")
                return True
        except Exception:
            pass

        # 방법 6: get_by_role로 시도
        try:
            btn = self.page.get_by_role("button", name=button_text, exact=True)
            await btn.click(timeout=3000)
            await asyncio.sleep(2)
            if await self._check_symbol_not_found():
                logger.warning(f"시간 단위 변경 후 인터벌 제한/심볼 미존재 감지 (role): {button_text}")
                return False
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
        차트 데이터를 CSV로 다운로드

        Args:
            output_filename: 출력 파일명 (없으면 자동 생성)

        Returns:
            다운로드된 파일 경로 또는 None
        """
        logger.info("차트 데이터 다운로드 시작...")

        try:
            # 다운로드 전 심볼 미존재 재확인 (시간 단위 변경 후 감지 가능)
            if await self._check_symbol_not_found():
                logger.warning("다운로드 스킵: 심볼 미존재 상태")
                return None

            # 팝업/모달 닫기 (거래소 계약서 등 + 이전 다운로드 다이얼로그)
            await self._dismiss_popups()
            # ESC로 혹시 남아있는 다이얼로그 닫기
            await self.page.keyboard.press("Escape")
            await asyncio.sleep(0.5)

            # 레이아웃 관리 메뉴 클릭 → "차트 데이터 다운로드..." 선택
            menu_opened = False
            # 방법 1: role 매칭 (Playwright MCP로 확인된 정확한 셀렉터)
            try:
                await self.page.get_by_role("button", name="레이아웃 관리").click(timeout=5000)
                menu_opened = True
                logger.info("메뉴 열기 성공: 레이아웃 관리")
            except Exception as e:
                logger.warning(f"레이아웃 관리 버튼 실패: {e}")
            # 방법 2: data-name 속성 (구버전 호환)
            if not menu_opened:
                try:
                    await self.page.locator('button[data-name="save-load-menu"]').click(timeout=5000)
                    menu_opened = True
                except Exception:
                    pass
            if not menu_opened:
                logger.error("레이아웃 메뉴를 열 수 없음")
                await self.capture_screenshot("debug_menu_fail")
                return None

            await asyncio.sleep(0.5)

            # "차트 데이터 다운로드" 메뉴 항목 클릭
            download_menu_clicked = False
            for dl_attempt in range(3):
                try:
                    dl_row = self.page.get_by_role("row", name="차트 데이터 다운로드")
                    if await dl_row.count() > 0:
                        await dl_row.click(timeout=5000)
                        download_menu_clicked = True
                        logger.info("차트 데이터 다운로드 클릭 성공 (role)")
                        break
                except Exception as e:
                    logger.warning(f"다운로드 메뉴 role 시도 {dl_attempt+1} 실패: {e}")

                # fallback: 텍스트 매칭
                try:
                    dl_text = self.page.locator("text=차트 데이터 다운로드")
                    if await dl_text.count() > 0:
                        await dl_text.first.click(timeout=5000)
                        download_menu_clicked = True
                        logger.info("차트 데이터 다운로드 클릭 성공 (text)")
                        break
                except Exception as e:
                    logger.warning(f"다운로드 메뉴 text 시도 {dl_attempt+1} 실패: {e}")

                # 메뉴가 닫혔을 수 있으므로 다시 열기
                if dl_attempt < 2:
                    logger.info("메뉴 재열기 시도...")
                    await self.page.keyboard.press("Escape")
                    await asyncio.sleep(0.5)
                    try:
                        await self.page.get_by_role("button", name="레이아웃 관리").click(timeout=5000)
                    except Exception:
                        try:
                            await self.page.locator('button[data-name="save-load-menu"]').click(timeout=5000)
                        except Exception:
                            pass
                    await asyncio.sleep(0.5)

            if not download_menu_clicked:
                logger.error("차트 데이터 다운로드 메뉴를 찾을 수 없음")
                await self.capture_screenshot("debug_download_menu_fail")
                await self.page.keyboard.press("Escape")
                return None

            await asyncio.sleep(1)

            # 다운로드 버튼 대기 및 로딩 상태 감지
            download_btn = self.page.get_by_role("button", name="다운로드")
            try:
                await download_btn.wait_for(state="visible", timeout=10000)
            except Exception:
                logger.warning("다운로드 버튼을 찾을 수 없음 - 데이터 없는 심볼일 수 있음")
                await self.capture_screenshot("download_no_btn")
                await self.page.keyboard.press("Escape")
                await asyncio.sleep(0.5)
                return None

            # 다운로드 버튼이 로딩 상태("...")인지 확인 (최대 15초 대기)
            for wait_attempt in range(5):
                btn_text = await download_btn.text_content()
                if btn_text and '다운로드' in btn_text:
                    break  # 버튼 준비됨
                if btn_text and btn_text.strip() in ('...', '···', '…', ''):
                    if wait_attempt < 4:
                        logger.info(f"다운로드 버튼 로딩 중... ({wait_attempt + 1}/5)")
                        await asyncio.sleep(3)
                    else:
                        logger.warning("다운로드 버튼이 로딩 상태에서 벗어나지 않음 - 데이터 없는 심볼")
                        await self.capture_screenshot("download_btn_loading")
                        await self.page.keyboard.press("Escape")
                        await asyncio.sleep(0.5)
                        return None
                else:
                    break  # 다른 텍스트면 시도해봄

            async with self.page.expect_download(timeout=120000) as download_info:
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
            # ESC로 다이얼로그 닫기 (여러 번 시도)
            for _ in range(3):
                await self.page.keyboard.press("Escape")
                await asyncio.sleep(0.5)
            await self._dismiss_popups()
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
        symbol_selected = False
        for attempt in range(max_retries):
            if await self.search_and_select_symbol(symbol):
                symbol_selected = True
                break
            else:
                # 심볼 미존재인 경우 재시도 없이 즉시 스킵
                if await self._check_symbol_not_found():
                    logger.warning(f"심볼 미존재 확인: {symbol} - 재시도 없이 스킵")
                    _db_log("WARNING", f"심볼 미존재 - 스킵", symbol=symbol)
                    for period in TIME_PERIODS:
                        await task_info_manager.update_timeframe_status(
                            symbol, period["name"], TimeframeStatus.FAILED,
                            error="심볼 미존재 (TradingView에서 찾을 수 없음)"
                        )
                    return results
                if attempt < max_retries - 1:
                    logger.warning(f"심볼 선택 실패 (시도 {attempt + 1}/{max_retries}). 재시도 중...")
                    await asyncio.sleep(2)
                else:
                    logger.error(f"심볼 선택 최종 실패: {symbol}")
                    for period in TIME_PERIODS:
                        await task_info_manager.update_timeframe_status(
                            symbol, period["name"], TimeframeStatus.FAILED,
                            error="심볼 선택 실패"
                        )
                    return results

        # 심볼은 선택됐지만 데이터가 없는 경우 (심볼 미존재 재확인)
        if symbol_selected and await self._check_symbol_not_found():
            logger.warning(f"심볼 선택 후 미존재 감지: {symbol} - 스킵")
            _db_log("WARNING", f"심볼 데이터 없음 - 스킵", symbol=symbol)
            for period in TIME_PERIODS:
                await task_info_manager.update_timeframe_status(
                    symbol, period["name"], TimeframeStatus.FAILED,
                    error="심볼 데이터 없음 (TradingView에서 찾을 수 없음)"
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

            # 시간 단위 변경 (재시도 with exponential backoff)
            time_change_success = False
            for attempt in range(max_retries):
                if await self.change_time_period(button_text):
                    time_change_success = True
                    break
                else:
                    if attempt < max_retries - 1:
                        wait_time = 2 * (attempt + 1)  # 2s, 4s, 6s...
                        logger.warning(f"시간 단위 변경 실패 (시도 {attempt + 1}/{max_retries}). {wait_time}초 후 재시도...")
                        await self._dismiss_popups()
                        await asyncio.sleep(wait_time)

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
                        wait_time = 3 * (attempt + 1)  # 3s, 6s, 9s...
                        logger.warning(f"다운로드 실패 (시도 {attempt + 1}/{max_retries}). {wait_time}초 후 재시도...")
                        await self._dismiss_popups()
                        await asyncio.sleep(wait_time)

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
