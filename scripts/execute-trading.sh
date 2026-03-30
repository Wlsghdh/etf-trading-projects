#!/bin/bash
# 수동 매매 실행 스크립트
# trading-service의 /api/trading/execute 엔드포인트를 호출하여 즉시 매매 실행
#
# Usage:
#   ./scripts/execute-trading.sh              # 매매 실행
#   ./scripts/execute-trading.sh --status     # 매매 상태만 확인
#   ./scripts/execute-trading.sh --portfolio  # 포트폴리오 조회

# PATH 설정 (cron 환경용)
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"
export TZ="Asia/Seoul"

PROJECT_DIR="/home/jjh0709/git/etf-trading-project"
LOG_DIR="$PROJECT_DIR/logs"
DATE_ONLY=$(date +%Y%m%d)
TRADING_LOG="$LOG_DIR/trading-${DATE_ONLY}.log"
TRADING_API="http://localhost:8002"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$TRADING_LOG"
}

# 옵션 파싱
ACTION="execute"
for arg in "$@"; do
    case $arg in
        --status)
            ACTION="status"
            ;;
        --portfolio)
            ACTION="portfolio"
            ;;
        --help)
            echo "Usage: $0 [--status|--portfolio|--help]"
            echo ""
            echo "Options:"
            echo "  (no option)     매매 즉시 실행"
            echo "  --status        현재 매매 상태 조회"
            echo "  --portfolio     포트폴리오(미매도 보유종목) 조회"
            echo "  --help          도움말"
            exit 0
            ;;
    esac
done

# trading-service 헬스체크
log "Trading Service 헬스체크..."
HEALTH=$(curl -s "$TRADING_API/health" --max-time 10 2>/dev/null)

if [ -z "$HEALTH" ] || echo "$HEALTH" | grep -q '"error"'; then
    log "❌ trading-service 응답 없음"
    log "컨테이너 확인: docker ps | grep trading"
    log "시작: cd $PROJECT_DIR && docker compose up -d trading-service"
    exit 1
fi

TRADING_MODE=$(echo "$HEALTH" | jq -r '.trading_mode // "unknown"' 2>/dev/null)
DB_STATUS=$(echo "$HEALTH" | jq -r '.database // "unknown"' 2>/dev/null)
log "✅ trading-service 정상 (모드: $TRADING_MODE, DB: $DB_STATUS)"

case "$ACTION" in
    status)
        log "========================================="
        log "매매 상태 조회"
        log "========================================="

        RESPONSE=$(curl -s "$TRADING_API/api/trading/status" --max-time 30 2>/dev/null)
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        ;;

    portfolio)
        log "========================================="
        log "포트폴리오 조회"
        log "========================================="

        RESPONSE=$(curl -s "$TRADING_API/api/trading/portfolio" --max-time 30 2>/dev/null)
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        ;;

    execute)
        log "========================================="
        log "매매 실행 시작"
        log "========================================="
        log "모드: $TRADING_MODE"

        if [ "$TRADING_MODE" = "live" ]; then
            log "⚠️  실투자 모드입니다! 실제 주문이 실행됩니다."
            read -p "계속하시겠습니까? (y/N): " CONFIRM
            if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
                log "사용자 취소"
                exit 0
            fi
        fi

        log "🚀 매매 실행 중... (최대 5분 대기)"
        RESPONSE=$(curl -s -X POST "$TRADING_API/api/trading/execute" \
            -H "Content-Type: application/json" \
            --max-time 300 2>/dev/null)

        if [ -z "$RESPONSE" ]; then
            log "❌ 응답 없음 (타임아웃 또는 연결 실패)"
            exit 1
        fi

        SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false' 2>/dev/null)
        MESSAGE=$(echo "$RESPONSE" | jq -r '.message // "알 수 없음"' 2>/dev/null)
        DAY=$(echo "$RESPONSE" | jq -r '.day_number // 0' 2>/dev/null)
        BOUGHT=$(echo "$RESPONSE" | jq -r '.bought_count // 0' 2>/dev/null)
        SOLD=$(echo "$RESPONSE" | jq -r '.sold_count // 0' 2>/dev/null)
        BOUGHT_TOTAL=$(echo "$RESPONSE" | jq -r '.bought_total // 0' 2>/dev/null)
        SOLD_TOTAL=$(echo "$RESPONSE" | jq -r '.sold_total // 0' 2>/dev/null)

        log ""
        if [ "$SUCCESS" = "true" ]; then
            log "✅ 매매 실행 완료"
            log "메시지: $MESSAGE"
            log "거래일: $DAY"
            log "매수: ${BOUGHT}건 (\$${BOUGHT_TOTAL})"
            log "매도: ${SOLD}건 (\$${SOLD_TOTAL})"
        else
            log "❌ 매매 실행 실패"
            log "메시지: $MESSAGE"
            exit 1
        fi
        ;;
esac

log ""
log "상세 로그: $TRADING_LOG"
