#!/bin/bash
# 매매 결과 검증 스크립트
# 매일 22:35 KST 실행 (22:30 자동매매 5분 후)
# cron: 35 22 * * 1-5 /home/jjh0709/git/etf-trading-project/scripts/post-trade-check.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# PATH 설정 (cron 환경 호환)
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

LOG_DIR="$PROJECT_DIR/logs"
TODAY="$(date +%Y%m%d)"
STATUS_FILE="$LOG_DIR/trading-status-${TODAY}.log"
ALERT_FILE="$LOG_DIR/alerts.log"

mkdir -p "$LOG_DIR"

ts() { date +"%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" | tee -a "$STATUS_FILE"; }
alert() {
    echo "[$(ts)] [TRADING] $*" >> "$ALERT_FILE"
    log "🚨 ALERT: $*"
}

log "============================================"
log "📋 매매 결과 검증 시작"
log "============================================"

# 1. trading-service 컨테이너 기동 확인
if ! docker ps --format '{{.Names}}' | grep -q '^etf-trading-service$'; then
    alert "trading-service 컨테이너 미실행"
    exit 1
fi

# 2. 오늘 매매 trading_logs 조회 (KST 13:30 = UTC 22:30 의 매매 실행)
TODAY_ISO="$(date +%Y-%m-%d)"

LOG_ROWS=$(sqlite3 -separator '|' "$PROJECT_DIR/trading-service/data/trading.db" \
    "SELECT level, substr(message, 1, 200) FROM trading_logs
     WHERE created_at >= '${TODAY_ISO} 13:00:00'
       AND created_at <  '${TODAY_ISO} 14:30:00'
     ORDER BY id ASC;" 2>/dev/null)

if [[ -z "$LOG_ROWS" ]]; then
    alert "오늘(${TODAY_ISO}) 매매 실행 흔적 없음 - APScheduler 미동작 가능성"
    log "→ 진단 명령: docker logs etf-trading-service --since '${TODAY_ISO}' | grep apscheduler"
    exit 2
fi

log ""
log "--- trading_logs (오늘 매매 시도) ---"
echo "$LOG_ROWS" | while IFS='|' read -r level message; do
    log "  [$level] $message"
done
log ""

# 3. 오늘 발생한 ERROR 카운트
ERROR_COUNT=$(echo "$LOG_ROWS" | grep -c "^ERROR")
INFO_COUNT=$(echo "$LOG_ROWS" | grep -c "^INFO")

# 4. 사이클 / 매수 결과 확인
CYCLE_INFO=$(sqlite3 -separator '|' "$PROJECT_DIR/trading-service/data/trading.db" \
    "SELECT id, current_day_number, initial_capital, is_active
     FROM trading_cycles WHERE is_active = 1 ORDER BY id DESC LIMIT 1;" 2>/dev/null)

if [[ -n "$CYCLE_INFO" ]]; then
    log "현재 활성 사이클: $CYCLE_INFO"
else
    alert "활성 사이클 없음"
fi

TODAY_PURCHASES=$(sqlite3 "$PROJECT_DIR/trading-service/data/trading.db" \
    "SELECT COUNT(*) FROM daily_purchases WHERE purchase_date = '${TODAY_ISO}';" 2>/dev/null || echo 0)

TODAY_ORDERS=$(sqlite3 "$PROJECT_DIR/trading-service/data/trading.db" \
    "SELECT COUNT(*) FROM order_logs WHERE date(created_at) = '${TODAY_ISO}';" 2>/dev/null || echo 0)

log "오늘 매수 기록: ${TODAY_PURCHASES}건"
log "오늘 주문 로그: ${TODAY_ORDERS}건"

# 5. 종합 판정
log ""
log "--- 종합 판정 ---"
if [[ "$TODAY_ORDERS" -eq 0 ]] && [[ "$TODAY_PURCHASES" -eq 0 ]]; then
    if [[ "$ERROR_COUNT" -gt 0 ]]; then
        alert "매매 실행됐으나 0건 주문 (ERROR ${ERROR_COUNT}건) — 중단된 상태"
    else
        alert "매매 시도 흔적 없음 또는 모두 스킵됨"
    fi
elif [[ "$ERROR_COUNT" -gt 0 ]] && [[ "$TODAY_ORDERS" -lt 50 ]]; then
    alert "부분 실패: 주문 ${TODAY_ORDERS}건 (목표 100), ERROR ${ERROR_COUNT}건"
elif [[ "$TODAY_ORDERS" -ge 50 ]]; then
    log "✅ 정상: 주문 ${TODAY_ORDERS}건 (INFO ${INFO_COUNT}, ERROR ${ERROR_COUNT})"
else
    log "⚠️  주의: 주문 ${TODAY_ORDERS}건 (목표 100 미달)"
fi

log "완료: $(ts)"
log ""
