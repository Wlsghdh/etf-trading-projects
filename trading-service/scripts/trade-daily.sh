#!/bin/bash
# trade-daily.sh - cron 폴백 스크립트
# 스케줄러 장애 시 cron에서 직접 실행

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/trade-$(date +%Y%m%d).log"

mkdir -p "$LOG_DIR"

echo "=== 매매 실행 시작: $(date) ===" >> "$LOG_FILE"

# Docker 컨테이너 내부에서 실행
CONTAINER_NAME="etf-trading-service"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    # 컨테이너가 실행 중이면 API 호출
    RESPONSE=$(curl -s -X POST http://localhost:8002/api/trading/execute)
    echo "응답: $RESPONSE" >> "$LOG_FILE"
else
    echo "ERROR: ${CONTAINER_NAME} 컨테이너가 실행 중이 아닙니다." >> "$LOG_FILE"
    exit 1
fi

echo "=== 매매 실행 완료: $(date) ===" >> "$LOG_FILE"
