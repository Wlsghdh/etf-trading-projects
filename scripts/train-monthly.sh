#!/bin/bash
# 매월 모델 재학습 스크립트
# 매월 1일 03:00 KST 실행 (1000 종목 대응 + 백업 + 검증)
# cron: 0 3 1 * * /home/jjh0709/git/etf-trading-project/scripts/train-monthly.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# PATH 설정 (cron 환경)
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"

LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/train-$(date +%Y%m).log"
ALERT_FILE="$LOG_DIR/alerts.log"

mkdir -p "$LOG_DIR"

ts() { date +"%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }
alert() { echo "[$(ts)] [TRAIN] $*" >> "$ALERT_FILE"; log "🚨 ALERT: $*"; }

log "============================================"
log "🎓 월간 모델 재학습 시작"
log "============================================"

cd "$PROJECT_DIR"

# 1. ml-service 헬스체크
if ! docker ps --format '{{.Names}}' | grep -q '^etf-ml-service$'; then
    alert "etf-ml-service 컨테이너 미실행 - 학습 중단"
    exit 1
fi

HEALTH_OK=0
for i in {1..30}; do
    if docker exec etf-ml-service curl -sf -m 3 http://localhost:8000/health > /dev/null 2>&1; then
        log "✅ ml-service 헬스체크 통과"
        HEALTH_OK=1
        break
    fi
    sleep 2
done
if [ "$HEALTH_OK" -eq 0 ]; then
    alert "ml-service 헬스체크 실패 - 학습 중단"
    exit 1
fi

# 2. 학습 가능한 종목 수 확인
SYMBOL_COUNT=$(docker exec etf-ml-service curl -sf -m 10 http://localhost:8000/api/data/symbols 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null || echo 0)
log "📊 학습 데이터 종목 수: ${SYMBOL_COUNT}"

if [[ "$SYMBOL_COUNT" -lt 50 ]]; then
    alert "학습 가능한 종목 수가 너무 적음 (${SYMBOL_COUNT}개) - 학습 중단"
    exit 2
fi

# 3. 기존 모델 백업
BACKUP_DIR="$PROJECT_DIR/ml-service/data/models/ahnlab_lgbm/backup-$(date +%Y%m%d_%H%M%S)"
CURRENT_DIR="$PROJECT_DIR/ml-service/data/models/ahnlab_lgbm/current"
if [ -d "$CURRENT_DIR" ]; then
    log "💾 기존 모델 백업: $(basename $BACKUP_DIR)"
    cp -r "$CURRENT_DIR" "$BACKUP_DIR" 2>/dev/null \
        && log "  → 백업 완료" \
        || log "  → 백업 실패 (계속 진행)"
fi

# 4. 학습 실행
log ""
log "🚀 train_ahnlab.py 실행 중... (소요: 5~30분)"
log ""

START_TS=$(date +%s)
docker exec etf-ml-service python scripts/train_ahnlab.py 2>&1 | tee -a "$LOG_FILE"
TRAIN_EXIT=${PIPESTATUS[0]}
END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

log ""
log "소요 시간: ${ELAPSED}초"

if [ "$TRAIN_EXIT" -ne 0 ]; then
    alert "모델 재학습 실패 (exit code: $TRAIN_EXIT)"
    exit 3
fi

log "✅ 모델 재학습 완료"

# 5. 학습 후 검증: 새 모델로 즉시 예측 시도
log ""
log "🔬 학습 후 예측 검증..."
PREDICT_RESPONSE=$(docker exec etf-ml-service curl -sf -m 60 -X POST \
    http://localhost:8000/api/predictions/ranking 2>&1)
PREDICT_OK=$?

if [ "$PREDICT_OK" -eq 0 ]; then
    TOP=$(echo "$PREDICT_RESPONSE" | python3 -c \
        "import sys,json; r=json.load(sys.stdin)['rankings'][0]; print(f\"{r['symbol']} (score={r['score']:.4f})\")" \
        2>/dev/null || echo "N/A")
    TOTAL=$(echo "$PREDICT_RESPONSE" | python3 -c \
        "import sys,json; print(json.load(sys.stdin).get('total_symbols', 0))" 2>/dev/null || echo 0)
    log "✅ 예측 검증 성공: ${TOTAL}개 종목, 1위=${TOP}"
else
    alert "학습은 성공했으나 예측 검증 실패"
fi

log ""
log "완료: $(ts)"
log ""
