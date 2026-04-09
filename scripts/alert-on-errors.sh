#!/bin/bash
# 로그 에러 감시 스크립트
# 매 30분마다 실행 - 최근 로그 + docker 컨테이너 로그에서 ERROR 검출
# cron: */30 * * * * /home/jjh0709/git/etf-trading-project/scripts/alert-on-errors.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

LOG_DIR="$PROJECT_DIR/logs"
ALERT_FILE="$LOG_DIR/alerts.log"
STATE_FILE="$LOG_DIR/.alert-state"

mkdir -p "$LOG_DIR"
touch "$ALERT_FILE" "$STATE_FILE"

ts() { date +"%Y-%m-%d %H:%M:%S"; }
emit() { echo "[$(ts)] [$1] $2" >> "$ALERT_FILE"; }

# 마지막 검사 이후 30분 (cron 주기)
SINCE_MIN=35

# 1. 파이프라인/매매 로그 파일 ERROR 검출 (최근 1시간)
TODAY="$(date +%Y%m%d)"
for prefix in pipeline trading-status manual; do
    LOG_FILE="$LOG_DIR/${prefix}-${TODAY}.log"
    [ -f "$LOG_FILE" ] || continue

    # 30분 내 추가된 ERROR 라인만 추출
    NEW_ERRORS=$(awk -v cutoff="$(date -d "${SINCE_MIN} minutes ago" '+%Y-%m-%d %H:%M:%S')" '
        /\[ERROR\]|❌ ERROR|❌|ERROR:/ {
            match($0, /\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\]/)
            if (RSTART > 0) {
                t = substr($0, RSTART+1, 19)
                if (t >= cutoff) print
            } else {
                print
            }
        }
    ' "$LOG_FILE" 2>/dev/null)

    if [ -n "$NEW_ERRORS" ]; then
        SEEN_KEY="${prefix}-${TODAY}"
        LAST_HASH=$(grep "^${SEEN_KEY}=" "$STATE_FILE" | cut -d= -f2)
        NEW_HASH=$(echo "$NEW_ERRORS" | md5sum | cut -d' ' -f1)
        if [ "$LAST_HASH" != "$NEW_HASH" ]; then
            COUNT=$(echo "$NEW_ERRORS" | wc -l)
            emit "$prefix" "최근 ${SINCE_MIN}분 내 ERROR ${COUNT}건 (${LOG_FILE})"
            echo "$NEW_ERRORS" | head -3 | while IFS= read -r line; do
                emit "$prefix" "  → $line"
            done
            grep -v "^${SEEN_KEY}=" "$STATE_FILE" > "${STATE_FILE}.tmp" || true
            echo "${SEEN_KEY}=${NEW_HASH}" >> "${STATE_FILE}.tmp"
            mv "${STATE_FILE}.tmp" "$STATE_FILE"
        fi
    fi
done

# 2. Docker 컨테이너 로그 ERROR 검출 (최근 30분)
SINCE_TS="$(date -d "${SINCE_MIN} minutes ago" '+%Y-%m-%dT%H:%M:%S')"
for container in etf-ml-service etf-trading-service etf-scraper-service etf-trading-monitor; do
    docker ps --format '{{.Names}}' | grep -q "^${container}$" || continue

    ERR_LINES=$(docker logs --since "$SINCE_TS" "$container" 2>&1 \
        | grep -iE "error|exception|traceback" \
        | grep -ivE "GET /health|200 OK|499|favicon|inotify" \
        | tail -10)

    if [ -n "$ERR_LINES" ]; then
        COUNT=$(echo "$ERR_LINES" | wc -l)
        SEEN_KEY="docker-${container}"
        LAST_HASH=$(grep "^${SEEN_KEY}=" "$STATE_FILE" | cut -d= -f2)
        NEW_HASH=$(echo "$ERR_LINES" | md5sum | cut -d' ' -f1)
        if [ "$LAST_HASH" != "$NEW_HASH" ]; then
            emit "$container" "최근 ${SINCE_MIN}분 내 ERROR/Exception ${COUNT}건"
            echo "$ERR_LINES" | head -3 | while IFS= read -r line; do
                emit "$container" "  → $(echo "$line" | cut -c1-200)"
            done
            grep -v "^${SEEN_KEY}=" "$STATE_FILE" > "${STATE_FILE}.tmp" || true
            echo "${SEEN_KEY}=${NEW_HASH}" >> "${STATE_FILE}.tmp"
            mv "${STATE_FILE}.tmp" "$STATE_FILE"
        fi
    fi
done

# 3. 컨테이너 다운 감지
for container in etf-ml-service etf-trading-service etf-scraper-service etf-trading-monitor etf-nginx; do
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        SEEN_KEY="down-${container}"
        LAST_TS=$(grep "^${SEEN_KEY}=" "$STATE_FILE" | cut -d= -f2)
        NOW_TS=$(date +%s)
        # 동일 컨테이너에 대해 30분 이내 중복 알림 방지
        if [ -z "$LAST_TS" ] || [ "$((NOW_TS - LAST_TS))" -gt 1800 ]; then
            emit "$container" "🛑 컨테이너 다운 감지"
            grep -v "^${SEEN_KEY}=" "$STATE_FILE" > "${STATE_FILE}.tmp" || true
            echo "${SEEN_KEY}=${NOW_TS}" >> "${STATE_FILE}.tmp"
            mv "${STATE_FILE}.tmp" "$STATE_FILE"
        fi
    fi
done

# 4. SSH 터널 다운 감지
if ! pgrep -af "ssh.*3306" > /dev/null 2>&1; then
    SEEN_KEY="down-ssh-tunnel"
    LAST_TS=$(grep "^${SEEN_KEY}=" "$STATE_FILE" | cut -d= -f2)
    NOW_TS=$(date +%s)
    if [ -z "$LAST_TS" ] || [ "$((NOW_TS - LAST_TS))" -gt 1800 ]; then
        emit "ssh-tunnel" "🛑 SSH 터널 다운 (포트 3306)"
        grep -v "^${SEEN_KEY}=" "$STATE_FILE" > "${STATE_FILE}.tmp" || true
        echo "${SEEN_KEY}=${NOW_TS}" >> "${STATE_FILE}.tmp"
        mv "${STATE_FILE}.tmp" "$STATE_FILE"
    fi
fi

# state 파일이 너무 커지면 리셋 (1KB 초과)
if [ -f "$STATE_FILE" ] && [ $(stat -c %s "$STATE_FILE" 2>/dev/null || echo 0) -gt 1024 ]; then
    : > "$STATE_FILE"
fi

exit 0
