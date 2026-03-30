#!/bin/bash
# 서비스 헬스체크 스크립트
# Docker 컨테이너 상태 및 API 헬스체크를 수행하고 문제 시 알림

export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"
export TZ="Asia/Seoul"

PROJECT_DIR="/home/jjh0709/git/etf-trading-project"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Slack 알림 (선택)
send_alert() {
    local message="$1"
    local webhook_url="${SLACK_WEBHOOK_URL:-}"
    if [ -n "$webhook_url" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$webhook_url" 2>/dev/null || true
    fi
}

echo "[$TIMESTAMP] === 서비스 헬스체크 ==="

ISSUES=0

# 1. SSH 터널
if pgrep -f "ssh.*3306.*5100" > /dev/null 2>&1; then
    echo "[$TIMESTAMP] ✅ SSH 터널: 정상"
else
    echo "[$TIMESTAMP] ❌ SSH 터널: 중단됨 — 재시작 시도"
    ssh -f -N -L 0.0.0.0:3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "[$TIMESTAMP] ✅ SSH 터널: 재시작 성공"
    else
        echo "[$TIMESTAMP] ❌ SSH 터널: 재시작 실패"
        ISSUES=$((ISSUES + 1))
    fi
fi

# 2. Docker 컨테이너
for CONTAINER in etf-ml-service etf-scraper-service etf-trading-service etf-nginx; do
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$" 2>/dev/null; then
        # 헬스체크 상태 확인
        HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "no-healthcheck")
        if [ "$HEALTH_STATUS" = "unhealthy" ]; then
            echo "[$TIMESTAMP] ⚠️  $CONTAINER: 실행 중이지만 unhealthy"
            ISSUES=$((ISSUES + 1))
        else
            echo "[$TIMESTAMP] ✅ $CONTAINER: 정상"
        fi
    else
        echo "[$TIMESTAMP] ❌ $CONTAINER: 중단됨"
        ISSUES=$((ISSUES + 1))
    fi
done

# 3. API 헬스체크
check_api() {
    local name="$1"
    local url="$2"
    local response=$(curl -s --max-time 10 "$url" 2>/dev/null)
    local status=$(echo "$response" | jq -r '.status // "error"' 2>/dev/null)
    if [ "$status" = "ok" ] || [ "$status" = "healthy" ]; then
        echo "[$TIMESTAMP] ✅ $name API: 정상"
    else
        echo "[$TIMESTAMP] ❌ $name API: 응답 없음 (status=$status)"
        ISSUES=$((ISSUES + 1))
    fi
}

check_api "ML Service" "http://localhost/health"
check_api "Trading Service" "http://localhost:8002/health"
check_api "Scraper Service" "http://localhost/api/scraper/health"

# 4. 디스크 사용량 (90% 이상 경고)
DISK_USAGE=$(df -h "$PROJECT_DIR" | awk 'NR==2{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ] 2>/dev/null; then
    echo "[$TIMESTAMP] ⚠️  디스크 사용량: ${DISK_USAGE}% (90% 초과)"
    ISSUES=$((ISSUES + 1))
else
    echo "[$TIMESTAMP] ✅ 디스크 사용량: ${DISK_USAGE}%"
fi

# 결과 요약
echo "[$TIMESTAMP] === 헬스체크 완료: 이슈 ${ISSUES}건 ==="

if [ $ISSUES -gt 0 ]; then
    send_alert "⚠️ ETF Trading 헬스체크: ${ISSUES}건 이슈 발견 — 확인 필요"
fi
