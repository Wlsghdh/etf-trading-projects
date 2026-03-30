#!/usr/bin/env python3
"""
ETF 자동매매 시스템 통합 오케스트레이터 (run.py)

전체 파이프라인을 자동화합니다:
  1. 사전 점검 (SSH 터널, Docker, .env)
  2. Docker 서비스 시작 및 헬스체크
  3. ML 모델 존재 여부 확인 → 초기 학습
  4. APScheduler로 일일/월간 작업 스케줄링
     - 매일 06:00 KST: 데이터 수집 + 피처 처리 + 예측
     - 매일 08:30 KST: 자동매매 (trading-service 내장 스케줄러)
     - 매월 1일 03:00 KST: 모델 재학습

사용법:
  python run.py                  # 모의투자 모드 (기본)
  python run.py --mode live      # 실투자 모드
  python run.py --mode paper     # 모의투자 모드 (명시적)
"""

import argparse
import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("\033[91m[ERROR] requests 패키지가 필요합니다: pip install requests\033[0m")
    sys.exit(1)

try:
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger
except ImportError:
    print("\033[91m[ERROR] apscheduler 패키지가 필요합니다: pip install apscheduler\033[0m")
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# 프로젝트 경로 설정
# ─────────────────────────────────────────────────────────────────────────────
PROJECT_DIR = Path(__file__).resolve().parent
LOG_DIR = PROJECT_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# API 엔드포인트 설정
# 참고: ml-service(8000), scraper-service(8001)는 nginx(80)을 통해 접근
#       trading-service(8002)는 직접 포트가 노출되어 있음
# ─────────────────────────────────────────────────────────────────────────────
NGINX_BASE = "http://localhost"
ML_HEALTH_URL = f"{NGINX_BASE}/health"
ML_RANKING_URL = f"{NGINX_BASE}/api/predictions/ranking"
SCRAPER_HEALTH_URL = f"{NGINX_BASE}/api/scraper/health"
SCRAPER_JOBS_FULL_URL = f"{NGINX_BASE}/api/scraper/jobs/full"
SCRAPER_JOBS_STATUS_URL = f"{NGINX_BASE}/api/scraper/jobs/status"
SCRAPER_FEATURES_PROCESS_URL = f"{NGINX_BASE}/api/scraper/features/process"
SCRAPER_FEATURES_STATUS_URL = f"{NGINX_BASE}/api/scraper/features/status"
TRADING_HEALTH_URL = "http://localhost:8002/health"

# 모델 경로
MODEL_DIR = PROJECT_DIR / "ml-service" / "data" / "models" / "ahnlab_lgbm" / "current"

# SSH 터널 설정
SSH_TUNNEL_CMD = [
    "ssh", "-f", "-N",
    "-L", "0.0.0.0:3306:127.0.0.1:5100",
    "ahnbi2@ahnbi2.suwon.ac.kr",
    "-o", "ServerAliveInterval=60",
    "-o", "ServerAliveCountMax=3",
]

# 폴링 설정
POLL_INTERVAL = 30       # 초
MAX_WAIT_SECONDS = 21600  # 6시간


# ─────────────────────────────────────────────────────────────────────────────
# 컬러 출력 헬퍼
# ─────────────────────────────────────────────────────────────────────────────
class Color:
    """ANSI 색상 코드"""
    RESET = "\033[0m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    DIM = "\033[2m"


def cprint(msg: str, color: str = Color.RESET) -> None:
    """색상이 적용된 콘솔 출력"""
    print(f"{color}{msg}{Color.RESET}")


def print_ok(msg: str) -> None:
    cprint(f"[OK] {msg}", Color.GREEN)


def print_fail(msg: str) -> None:
    cprint(f"[FAIL] {msg}", Color.RED)


def print_warn(msg: str) -> None:
    cprint(f"[WARN] {msg}", Color.YELLOW)


def print_info(msg: str) -> None:
    cprint(f"[INFO] {msg}", Color.CYAN)


# ─────────────────────────────────────────────────────────────────────────────
# 로깅 설정
# ─────────────────────────────────────────────────────────────────────────────
def setup_logging() -> logging.Logger:
    """파일 + 콘솔 듀얼 로거 설정"""
    logger = logging.getLogger("orchestrator")
    logger.setLevel(logging.DEBUG)

    # 기존 핸들러 제거 (중복 방지)
    logger.handlers.clear()

    # 파일 핸들러 - 날짜별 로그
    log_file = LOG_DIR / f"orchestrator-{datetime.now().strftime('%Y%m%d')}.log"
    fh = logging.FileHandler(str(log_file), encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(fh)

    # 콘솔 핸들러 - INFO 이상만
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter(
        f"{Color.DIM}%(asctime)s{Color.RESET} %(message)s",
        datefmt="%H:%M:%S",
    ))
    logger.addHandler(ch)

    return logger


log = setup_logging()


# ─────────────────────────────────────────────────────────────────────────────
# 유틸리티 함수
# ─────────────────────────────────────────────────────────────────────────────
def run_cmd(cmd: list[str], timeout: int = 120, check: bool = True) -> subprocess.CompletedProcess:
    """subprocess 실행 래퍼"""
    log.debug(f"CMD: {' '.join(cmd)}")
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=check,
        cwd=str(PROJECT_DIR),
    )


def http_get(url: str, timeout: int = 10) -> requests.Response | None:
    """안전한 HTTP GET 요청"""
    try:
        return requests.get(url, timeout=timeout)
    except Exception:
        return None


def http_post(url: str, json_data: dict | None = None, timeout: int = 30) -> requests.Response | None:
    """안전한 HTTP POST 요청"""
    try:
        return requests.post(url, json=json_data or {}, timeout=timeout)
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# 사전 점검 (Prerequisites)
# ─────────────────────────────────────────────────────────────────────────────
def check_ssh_tunnel() -> bool:
    """SSH 터널 확인 및 시작"""
    log.info("SSH 터널 확인 중...")

    # pgrep으로 SSH 터널 프로세스 확인
    result = run_cmd(["pgrep", "-f", "ssh.*3306.*5100"], check=False)
    if result.returncode == 0:
        print_ok("SSH 터널 확인")
        log.info("SSH 터널 이미 실행 중")
        return True

    # SSH 터널이 없으면 시작 시도
    print_warn("SSH 터널이 없습니다. 시작 시도 중...")
    log.info("SSH 터널 시작 시도...")

    try:
        result = run_cmd(SSH_TUNNEL_CMD, timeout=30, check=False)
        if result.returncode == 0:
            time.sleep(3)
            # 다시 확인
            verify = run_cmd(["pgrep", "-f", "ssh.*3306.*5100"], check=False)
            if verify.returncode == 0:
                print_ok("SSH 터널 시작 완료")
                log.info("SSH 터널 시작 완료")
                return True

        print_fail("SSH 터널 시작 실패")
        log.error(f"SSH 터널 시작 실패: {result.stderr}")
        return False
    except subprocess.TimeoutExpired:
        print_fail("SSH 터널 시작 타임아웃 (패스워드 필요?)")
        log.error("SSH 터널 시작 타임아웃")
        return False


def check_docker() -> bool:
    """Docker 실행 확인"""
    log.info("Docker 확인 중...")
    try:
        result = run_cmd(["docker", "ps"], timeout=10, check=False)
        if result.returncode == 0:
            print_ok("Docker 실행 확인")
            log.info("Docker 정상 실행 중")
            return True
        else:
            print_fail("Docker 데몬 연결 실패")
            log.error(f"Docker 연결 실패: {result.stderr}")
            return False
    except FileNotFoundError:
        print_fail("Docker가 설치되어 있지 않습니다")
        log.error("Docker 미설치")
        return False


def check_env_file() -> bool:
    """trading-service/.env 파일 확인"""
    log.info(".env 파일 확인 중...")
    env_path = PROJECT_DIR / "trading-service" / ".env"
    env_example = PROJECT_DIR / "trading-service" / ".env.example"

    if not env_path.exists():
        print_fail(f".env 파일이 없습니다: {env_path}")
        if env_example.exists():
            print_warn(f"  .env.example을 복사하세요: cp {env_example} {env_path}")
        log.error(f".env 파일 없음: {env_path}")
        return False

    # 필수 키 확인
    env_content = env_path.read_text()
    required_keys = ["KIS_APP_KEY", "KIS_APP_SECRET", "KIS_ACCOUNT_NUMBER"]
    missing = []
    for key in required_keys:
        if key not in env_content:
            missing.append(key)
        elif f"{key}=your_" in env_content or f"{key}=\n" in env_content:
            missing.append(f"{key} (미설정)")

    if missing:
        print_warn(f".env 파일에 누락/미설정 항목: {', '.join(missing)}")
        log.warning(f".env 필수 키 누락: {missing}")
        # 경고만 하고 계속 진행 (paper 모드에서는 API 키가 없어도 될 수 있음)
    else:
        print_ok(".env 파일 확인 완료")
        log.info(".env 파일 검증 완료")

    return True


# ─────────────────────────────────────────────────────────────────────────────
# Docker 서비스 관리
# ─────────────────────────────────────────────────────────────────────────────
def start_docker_services() -> bool:
    """docker-compose up -d로 모든 서비스 시작"""
    log.info("Docker 서비스 시작 중...")
    print_info("Docker 서비스 시작 중...")

    try:
        result = run_cmd(
            ["docker", "compose", "up", "-d"],
            timeout=300,
            check=False,
        )
        if result.returncode == 0:
            print_ok("Docker 서비스 시작")
            log.info("Docker compose up 완료")
            return True
        else:
            print_fail("Docker 서비스 시작 실패")
            log.error(f"docker compose up 실패: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print_fail("Docker 서비스 시작 타임아웃 (빌드 중?)")
        log.error("docker compose up 타임아웃")
        return False


def wait_for_health_checks(max_wait: int = 120) -> bool:
    """모든 서비스의 헬스체크 대기"""
    log.info("서비스 헬스체크 대기 중...")

    services = {
        "ml-service": ML_HEALTH_URL,
        "scraper-service": SCRAPER_HEALTH_URL,
        "trading-service": TRADING_HEALTH_URL,
    }

    healthy = set()
    start = time.time()

    while time.time() - start < max_wait:
        for name, url in services.items():
            if name in healthy:
                continue
            resp = http_get(url, timeout=5)
            if resp and resp.status_code == 200:
                healthy.add(name)
                # 포트 정보 표시
                port_map = {
                    "ml-service": "nginx:80 -> 8000",
                    "scraper-service": "nginx:80 -> 8001",
                    "trading-service": "port 8002",
                }
                print_ok(f"{name} ({port_map.get(name, '')}) 정상")
                log.info(f"{name} 헬스체크 통과")

        if len(healthy) == len(services):
            return True

        remaining = set(services.keys()) - healthy
        elapsed = int(time.time() - start)
        log.debug(f"대기 중... ({elapsed}s) 미응답: {remaining}")
        time.sleep(3)

    # 타임아웃 - 실패한 서비스 표시
    for name in set(services.keys()) - healthy:
        print_fail(f"{name} 헬스체크 실패 (타임아웃 {max_wait}초)")
        log.error(f"{name} 헬스체크 타임아웃")

    return False


# ─────────────────────────────────────────────────────────────────────────────
# ML 모델 확인 및 학습
# ─────────────────────────────────────────────────────────────────────────────
def check_ml_model() -> bool:
    """ML 모델 파일 존재 여부 확인"""
    log.info("ML 모델 확인 중...")

    if MODEL_DIR.exists() and any(MODEL_DIR.iterdir()):
        print_ok("ML 모델 확인 완료")
        log.info(f"ML 모델 존재: {MODEL_DIR}")
        return True
    else:
        print_warn("ML 모델이 없습니다. 초기 학습을 실행합니다.")
        log.warning(f"ML 모델 없음: {MODEL_DIR}")
        return False


def train_ml_model() -> bool:
    """ML 모델 학습 실행 (docker exec)"""
    log.info("ML 모델 학습 시작...")
    print_info("ML 모델 학습 시작... (시간이 걸릴 수 있습니다)")

    try:
        result = run_cmd(
            ["docker", "exec", "etf-ml-service", "python", "scripts/train_ahnlab.py"],
            timeout=7200,  # 2시간 타임아웃
            check=False,
        )
        if result.returncode == 0:
            print_ok("ML 모델 학습 완료")
            log.info("ML 모델 학습 성공")
            if result.stdout:
                log.debug(f"학습 출력:\n{result.stdout[-2000:]}")
            return True
        else:
            print_fail("ML 모델 학습 실패")
            log.error(f"ML 학습 실패:\nSTDOUT: {result.stdout[-1000:]}\nSTDERR: {result.stderr[-1000:]}")
            return False
    except subprocess.TimeoutExpired:
        print_fail("ML 모델 학습 타임아웃 (2시간 초과)")
        log.error("ML 학습 타임아웃")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# 예측 파이프라인 (매일 06:00 KST 실행)
# ─────────────────────────────────────────────────────────────────────────────
def run_prediction_pipeline() -> None:
    """
    전체 예측 파이프라인 실행:
      1. 스크래핑 (데이터 수집)
      2. 피처 처리
      3. ML 랭킹 예측
    """
    pipeline_start = time.time()
    log.info("=" * 60)
    log.info("예측 파이프라인 시작")
    log.info("=" * 60)

    try:
        # ── Step 1: 데이터 스크래핑 ──
        if not _step_scraping():
            log.error("파이프라인 중단: 스크래핑 실패")
            return

        # ── Step 2: 피처 처리 ──
        if not _step_feature_processing():
            log.error("파이프라인 중단: 피처 처리 실패")
            return

        # ── Step 3: ML 랭킹 예측 ──
        if not _step_ml_ranking():
            log.error("파이프라인 중단: ML 예측 실패")
            return

        elapsed = int(time.time() - pipeline_start)
        log.info(f"예측 파이프라인 완료 (소요시간: {elapsed // 60}분 {elapsed % 60}초)")

    except Exception as e:
        log.exception(f"예측 파이프라인 예외 발생: {e}")


def _step_scraping() -> bool:
    """Step 1: 데이터 스크래핑"""
    log.info("─── Step 1/3: 데이터 스크래핑 ───")
    step_start = time.time()

    # 스크래핑 작업 시작
    resp = http_post(SCRAPER_JOBS_FULL_URL, timeout=30)
    if not resp or resp.status_code not in (200, 201):
        log.error(f"스크래핑 작업 시작 실패: {resp.text if resp else 'No response'}")
        return False

    try:
        data = resp.json()
        job_id = data.get("job_id", "unknown")
        log.info(f"스크래핑 작업 시작됨: job_id={job_id}")
    except Exception:
        log.info("스크래핑 작업 시작됨 (job_id 파싱 불가)")

    # 완료될 때까지 폴링
    if not _poll_until_complete(SCRAPER_JOBS_STATUS_URL, "스크래핑"):
        return False

    elapsed = int(time.time() - step_start)
    log.info(f"스크래핑 완료 (소요시간: {elapsed}초)")
    return True


def _step_feature_processing() -> bool:
    """Step 2: 피처 처리"""
    log.info("─── Step 2/3: 피처 처리 ───")
    step_start = time.time()

    resp = http_post(
        SCRAPER_FEATURES_PROCESS_URL,
        json_data={"include_macro": True, "shift_features": True},
        timeout=30,
    )
    if not resp or resp.status_code not in (200, 201):
        log.error(f"피처 처리 시작 실패: {resp.text if resp else 'No response'}")
        return False

    log.info("피처 처리 작업 시작됨")

    # 완료될 때까지 폴링
    if not _poll_until_complete(SCRAPER_FEATURES_STATUS_URL, "피처 처리"):
        return False

    elapsed = int(time.time() - step_start)
    log.info(f"피처 처리 완료 (소요시간: {elapsed}초)")
    return True


def _step_ml_ranking() -> bool:
    """Step 3: ML 랭킹 예측"""
    log.info("─── Step 3/3: ML 랭킹 예측 ───")

    resp = http_post(ML_RANKING_URL, timeout=120)
    if not resp:
        log.error("ML 랭킹 API 호출 실패 (응답 없음)")
        return False

    if resp.status_code != 200:
        log.error(f"ML 랭킹 API 실패: {resp.status_code} - {resp.text[:500]}")
        return False

    try:
        data = resp.json()
        total = data.get("total_symbols", 0)
        rankings = data.get("rankings", [])
        if rankings:
            top = rankings[0]
            log.info(f"ML 예측 완료: {total}개 종목, 1위: {top.get('symbol', 'N/A')} "
                     f"(score={top.get('score', 'N/A')})")
        else:
            log.info(f"ML 예측 완료: {total}개 종목")
    except Exception:
        log.info("ML 예측 완료 (결과 파싱 불가)")

    return True


def _poll_until_complete(status_url: str, step_name: str) -> bool:
    """작업 상태를 폴링하여 완료될 때까지 대기"""
    start = time.time()

    while time.time() - start < MAX_WAIT_SECONDS:
        resp = http_get(status_url, timeout=10)
        if not resp:
            log.warning(f"{step_name}: 상태 확인 실패, 재시도...")
            time.sleep(10)
            continue

        try:
            data = resp.json()
            status = data.get("status", "unknown")
        except Exception:
            log.warning(f"{step_name}: 응답 파싱 실패")
            time.sleep(10)
            continue

        elapsed = int(time.time() - start)

        if status == "completed":
            log.info(f"{step_name} 완료")
            return True
        elif status == "failed":
            log.error(f"{step_name} 실패: {data}")
            return False
        elif status in ("running", "pending", "processing"):
            # 진행률 표시
            progress = data.get("progress", {})
            if isinstance(progress, dict):
                current = progress.get("current", 0)
                total = progress.get("total", 0)
                symbol = progress.get("current_symbol", data.get("current_symbol", ""))
                if current and total:
                    log.info(f"{step_name}: {status} ({current}/{total}) "
                             f"{'- ' + symbol if symbol else ''} [{elapsed}s]")
                else:
                    log.info(f"{step_name}: {status} [{elapsed}s]")
            else:
                log.info(f"{step_name}: {status} [{elapsed}s]")
            time.sleep(POLL_INTERVAL)
        elif status in ("idle", "unknown"):
            # idle이 5분 이상 지속되면 실패로 간주
            if elapsed > 300:
                log.error(f"{step_name}: 상태 '{status}'가 5분 이상 지속, 실패로 간주")
                return False
            time.sleep(5)
        else:
            log.warning(f"{step_name}: 알 수 없는 상태 '{status}', 계속 폴링...")
            time.sleep(POLL_INTERVAL)

    log.error(f"{step_name}: 최대 대기 시간 초과 ({MAX_WAIT_SECONDS}초)")
    return False


# ─────────────────────────────────────────────────────────────────────────────
# 모델 재학습 (매월 1일 03:00 KST)
# ─────────────────────────────────────────────────────────────────────────────
def run_monthly_retraining() -> None:
    """월간 모델 재학습 실행"""
    log.info("=" * 60)
    log.info("월간 모델 재학습 시작")
    log.info("=" * 60)

    try:
        success = train_ml_model()
        if success:
            log.info("월간 모델 재학습 완료")
        else:
            log.error("월간 모델 재학습 실패")
    except Exception as e:
        log.exception(f"월간 모델 재학습 예외: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 시그널 핸들러 (Graceful Shutdown)
# ─────────────────────────────────────────────────────────────────────────────
scheduler: BlockingScheduler | None = None


def signal_handler(signum: int, frame) -> None:
    """SIGINT/SIGTERM 시그널 핸들러"""
    sig_name = signal.Signals(signum).name
    log.info(f"종료 시그널 수신 ({sig_name})")
    cprint(f"\n종료 시그널 수신 ({sig_name}). 스케줄러를 종료합니다...", Color.YELLOW)

    if scheduler is not None:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass

    log.info("오케스트레이터 종료")
    sys.exit(0)


# ─────────────────────────────────────────────────────────────────────────────
# 배너 출력
# ─────────────────────────────────────────────────────────────────────────────
def print_banner(mode: str) -> None:
    """시작 배너 출력"""
    mode_kr = "모의투자 (paper)" if mode == "paper" else "실투자 (live)"
    mode_color = Color.GREEN if mode == "paper" else Color.RED

    print()
    cprint("=" * 47, Color.BOLD)
    cprint("  ETF 자동매매 시스템 v1.0", Color.BOLD)
    cprint(f"  모드: {mode_kr}", mode_color)
    cprint("=" * 47, Color.BOLD)
    print()


def print_schedule_info() -> None:
    """스케줄 정보 출력"""
    cprint("스케줄:", Color.BOLD)
    cprint("  - 매일 06:00 KST - 데이터 수집 + 예측", Color.CYAN)
    cprint("  - 매일 08:30 KST - 자동매매 (trading-service 내장)", Color.CYAN)
    cprint("  - 매월 1일 03:00 KST - 모델 재학습", Color.CYAN)
    print()


# ─────────────────────────────────────────────────────────────────────────────
# 메인 실행
# ─────────────────────────────────────────────────────────────────────────────
def main() -> None:
    global scheduler

    # ── 인자 파싱 ──
    parser = argparse.ArgumentParser(
        description="ETF 자동매매 시스템 통합 오케스트레이터",
    )
    parser.add_argument(
        "--mode",
        choices=["paper", "live"],
        default="paper",
        help="거래 모드: paper(모의투자, 기본) 또는 live(실투자)",
    )
    args = parser.parse_args()

    # ── 시그널 핸들러 등록 ──
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # ── 배너 출력 ──
    print_banner(args.mode)

    log.info(f"오케스트레이터 시작 (mode={args.mode})")

    # ── 실투자 모드 안전장치 ──
    if args.mode == "live":
        cprint("!! 실투자 모드입니다. 실제 매매가 실행됩니다 !!", Color.RED)
        try:
            confirm = input("계속하려면 'LIVE'를 입력하세요: ")
            if confirm.strip() != "LIVE":
                cprint("취소되었습니다.", Color.YELLOW)
                sys.exit(0)
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(0)
        print()

    # ═════════════════════════════════════════════════════════════════════
    # Step 1: 사전 점검 (Prerequisites)
    # ═════════════════════════════════════════════════════════════════════
    prereq_ok = True

    if not check_ssh_tunnel():
        prereq_ok = False

    if not check_docker():
        prereq_ok = False
        cprint("Docker가 실행되지 않으면 계속할 수 없습니다.", Color.RED)
        sys.exit(1)

    check_env_file()  # 경고만 (paper 모드에서는 필수 아닐 수 있음)

    if not prereq_ok:
        cprint("사전 점검 실패. SSH 터널을 확인하세요.", Color.RED)
        log.error("사전 점검 실패")
        sys.exit(1)

    print()

    # ═════════════════════════════════════════════════════════════════════
    # Step 2: Docker 서비스 시작
    # ═════════════════════════════════════════════════════════════════════
    if not start_docker_services():
        cprint("Docker 서비스 시작에 실패했습니다.", Color.RED)
        sys.exit(1)

    print()

    # ═════════════════════════════════════════════════════════════════════
    # Step 3: 헬스체크 대기
    # ═════════════════════════════════════════════════════════════════════
    if not wait_for_health_checks(max_wait=120):
        cprint("일부 서비스가 응답하지 않습니다. 로그를 확인하세요:", Color.RED)
        cprint("  docker compose logs --tail 50", Color.YELLOW)
        sys.exit(1)

    print()

    # ═════════════════════════════════════════════════════════════════════
    # Step 4: ML 모델 확인 → 없으면 초기 학습
    # ═════════════════════════════════════════════════════════════════════
    if not check_ml_model():
        if not train_ml_model():
            cprint("ML 모델 초기 학습에 실패했습니다. 수동으로 실행하세요:", Color.RED)
            cprint("  docker exec etf-ml-service python scripts/train_ahnlab.py", Color.YELLOW)
            sys.exit(1)

    print()

    # ═════════════════════════════════════════════════════════════════════
    # Step 5: APScheduler 설정 및 실행
    # ═════════════════════════════════════════════════════════════════════
    print_schedule_info()

    scheduler = BlockingScheduler(timezone="Asia/Seoul")

    # Job 1: 매일 06:00 KST - 예측 파이프라인
    scheduler.add_job(
        run_prediction_pipeline,
        CronTrigger(hour=6, minute=0, timezone="Asia/Seoul"),
        id="daily_prediction",
        name="일일 예측 파이프라인",
        replace_existing=True,
        misfire_grace_time=3600,  # 1시간 유예
    )

    # Job 2: 매월 1일 03:00 KST - 모델 재학습
    scheduler.add_job(
        run_monthly_retraining,
        CronTrigger(day=1, hour=3, minute=0, timezone="Asia/Seoul"),
        id="monthly_retraining",
        name="월간 모델 재학습",
        replace_existing=True,
        misfire_grace_time=7200,  # 2시간 유예
    )

    # 스케줄러 이벤트 리스너
    def job_executed(event):
        if event.exception:
            log.error(f"스케줄 작업 실패: {event.job_id} - {event.exception}")
        else:
            log.info(f"스케줄 작업 완료: {event.job_id}")

    from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR
    scheduler.add_listener(job_executed, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)

    # 스케줄러 시작
    cprint("스케줄러 실행중... (Ctrl+C로 종료)", Color.GREEN)
    log.info("APScheduler 시작")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("스케줄러 종료됨")
        cprint("\n스케줄러가 종료되었습니다.", Color.YELLOW)


if __name__ == "__main__":
    main()
