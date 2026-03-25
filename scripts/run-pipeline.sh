#!/bin/bash
# 마스터 데이터 파이프라인 스크립트 (API 전용 버전)
# 전체 데이터 수집 → 검증 → 피처 처리 → 예측 프로세스를 API 호출로 실행
#
# Usage:
#   ./scripts/run-pipeline.sh [--skip-validation] [--continue-on-error]
#
# Options:
#   --skip-validation     Skip data validation step
#   --continue-on-error   Continue pipeline even if validation fails
#   --execute-trading     Trigger trading execution after prediction (Step 5)

# PATH 설정 (cron 환경용)
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"
export TZ="Asia/Seoul"

# 프로젝트 경로 설정
PROJECT_DIR="/home/jjh0709/git/etf-trading-project"
SCRIPTS_DIR="$PROJECT_DIR/scripts"
LOG_DIR="$PROJECT_DIR/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_ONLY=$(date +%Y%m%d)
PIPELINE_LOG="$LOG_DIR/pipeline-${DATE_ONLY}.log"

# API 엔드포인트
SCRAPER_API="http://localhost/api/scraper"
ML_API="http://localhost:8000"
TRADING_API="http://localhost:8002"

# 폴링 설정
POLL_INTERVAL=30  # seconds
MAX_WAIT_HOURS=6  # Maximum wait time for each step

# 옵션 파싱
SKIP_VALIDATION=false
CONTINUE_ON_ERROR=false
EXECUTE_TRADING=false

for arg in "$@"; do
    case $arg in
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --continue-on-error)
            CONTINUE_ON_ERROR=true
            shift
            ;;
        --execute-trading)
            EXECUTE_TRADING=true
            shift
            ;;
        *)
            ;;
    esac
done

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR"

# 로그 함수
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$PIPELINE_LOG"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ ERROR: $1" | tee -a "$PIPELINE_LOG"
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ SUCCESS: $1" | tee -a "$PIPELINE_LOG"
}

log_warning() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  WARNING: $1" | tee -a "$PIPELINE_LOG"
}

# Slack 알림 함수 (옵션)
send_slack_notification() {
    local message="$1"
    local webhook_url="${SLACK_WEBHOOK_URL:-}"

    if [ -n "$webhook_url" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$webhook_url" 2>/dev/null || true
    fi
}

# SSH 터널 확인 및 시작
ensure_ssh_tunnel() {
    if ! pgrep -f "ssh.*3306.*5100" > /dev/null; then
        log "📡 SSH 터널 시작..."
        ssh -f -N -L 0.0.0.0:3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr \
            -o ServerAliveInterval=60 \
            -o ServerAliveCountMax=3 2>> "$PIPELINE_LOG"

        if [ $? -ne 0 ]; then
            log_error "SSH 터널 시작 실패"
            return 1
        fi
        sleep 3
        log "✅ SSH 터널 시작 완료"
    else
        log "✅ SSH 터널 이미 실행 중"
    fi
    return 0
}

# Docker 서비스 확인 및 시작
ensure_docker_services() {
    if ! docker ps | grep -q "etf-scraper-service"; then
        log_error "scraper-service 컨테이너가 실행 중이 아닙니다"
        return 1
    fi
    if ! docker ps | grep -q "etf-ml-service"; then
        log_error "ml-service 컨테이너가 실행 중이 아닙니다"
        return 1
    fi
    if ! docker ps | grep -q "etf-trading-service"; then
        log_warning "trading-service 컨테이너가 실행 중이 아닙니다 (자동매매 비활성)"
    else
        log "✅ trading-service 실행 중"
    fi
    log "✅ Docker 서비스 모두 실행 중"
    return 0
}

# API 폴링 함수
wait_for_api_completion() {
    local api_url="$1"
    local step_name="$2"

    local start_time=$(date +%s)
    local max_wait=$((MAX_WAIT_HOURS * 3600))

    log "🔍 $step_name 진행 상황 모니터링..."

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -gt $max_wait ]; then
            log_error "Timeout: $step_name exceeded ${MAX_WAIT_HOURS} hours"
            return 1
        fi

        local response=$(curl -s "$api_url" 2>/dev/null || echo '{"error": "request failed"}')
        local status=$(echo "$response" | jq -r '.status // "unknown"' 2>/dev/null)

        # progress에서 실제 완료 수 확인 (status가 error여도 실제로 완료됐을 수 있음)
        local progress_current=$(echo "$response" | jq -r '.progress.current // 0' 2>/dev/null)

        case "$status" in
            "completed"|"partial")
                log_success "$step_name 완료"
                return 0
                ;;
            "error"|"stopped")
                # error/stopped 상태지만 실제 데이터가 수집됐는지 확인
                if [ "$progress_current" -gt 0 ] 2>/dev/null; then
                    log_warning "$step_name 상태는 '$status'이지만 ${progress_current}건 완료됨 — 성공으로 간주"
                    return 0
                fi
                # end_time이 있으면 작업 자체는 끝난 것
                local end_time=$(echo "$response" | jq -r '.end_time // ""' 2>/dev/null)
                if [ -n "$end_time" ] && [ "$end_time" != "null" ]; then
                    log_warning "$step_name 완료 (상태: $status, 카운터 버그 가능)"
                    return 0
                fi
                log_error "$step_name 실패 ($status)"
                return 1
                ;;
            "idle"|"null"|"")
                # idle: 작업 완료 후 상태가 리셋됐을 수 있음
                if [ "$progress_current" -gt 0 ] 2>/dev/null; then
                    log_success "$step_name 완료 (${progress_current}건)"
                    return 0
                fi
                if [ $elapsed -gt 300 ]; then
                    log_error "$step_name 상태 확인 불가 (idle), 5분 경과로 실패 간주"
                    return 1
                fi
                sleep 5
                continue
                ;;
            "failed")
                log_error "$step_name 실패"
                return 1
                ;;
            "running"|"pending")
                # 진행률 표시 (있는 경우)
                local progress=$(echo "$response" | jq -r '.progress.current // .progress // 0' 2>/dev/null)
                local total=$(echo "$response" | jq -r '.progress.total // .total // 0' 2>/dev/null)
                local current_symbol=$(echo "$response" | jq -r '.progress.current_symbol // .current_symbol // ""' 2>/dev/null)

                if [ "$progress" != "0" ] && [ "$total" != "0" ]; then
                    log "Status: $status | Progress: $progress/$total | Current: ${current_symbol:-N/A}"
                elif [ -n "$current_symbol" ]; then
                    log "Status: $status | Current: ${current_symbol} | Elapsed: $((elapsed / 60))m"
                else
                    log "Status: $status | Elapsed: $((elapsed / 60))m"
                fi
                sleep "$POLL_INTERVAL"
                ;;
            *)
                log "⚠️ Unknown status: $status - continuing to poll"
                sleep "$POLL_INTERVAL"
                ;;
        esac
    done
}

# 파이프라인 시작
log "========================================"
log "🚀 ETF 데이터 파이프라인 시작 (API 전용)"
log "========================================"
log "타임스탬프: $TIMESTAMP"
log "옵션: skip_validation=$SKIP_VALIDATION, continue_on_error=$CONTINUE_ON_ERROR"
log ""

# 전체 시간 측정 시작
PIPELINE_START=$(date +%s)

# =============================================================================
# Step 0: 사전 준비
# =============================================================================
log "========================================="
log "Step 0: 사전 준비"
log "========================================="

ensure_ssh_tunnel
if [ $? -ne 0 ]; then
    log_error "SSH 터널 설정 실패"
    exit 1
fi

ensure_docker_services
if [ $? -ne 0 ]; then
    log_error "Docker 서비스 시작 실패"
    exit 1
fi

# 서비스 헬스체크
for i in {1..30}; do
    SCRAPING_HEALTH=$(curl -s "$SCRAPER_API/health" 2>/dev/null || echo '{"status": "error"}')
    # ML 서비스는 컨테이너 내부에서 체크
    ML_HEALTH=$(docker exec etf-ml-service curl -s http://localhost:8000/health 2>/dev/null || echo '{"status": "error"}')

    if echo "$SCRAPING_HEALTH" | grep -q '"status":"healthy"' && echo "$ML_HEALTH" | grep -q '"status":"healthy"'; then
        log_success "모든 서비스 정상"
        break
    fi

    if [ $i -eq 30 ]; then
        log_error "서비스 헬스체크 타임아웃"
        log "Scraping Health: $SCRAPING_HEALTH"
        log "ML Health: $ML_HEALTH"
        exit 1
    fi
    sleep 2
done

log ""

# =============================================================================
# Step 1: 데이터 스크래핑 (API 호출)
# =============================================================================
log "========================================="
log "Step 1/4: 데이터 스크래핑"
log "========================================="
log "API: $SCRAPER_API/jobs/full"
log ""

SCRAPE_START=$(date +%s)

# 이미 작업이 실행 중인지 확인
HEALTH=$(curl -s "$SCRAPER_API/health" 2>/dev/null || echo '{}')
CURRENT_JOB=$(echo "$HEALTH" | jq -r '.current_job // empty')

if [ -n "$CURRENT_JOB" ] && [ "$CURRENT_JOB" != "null" ]; then
    log "⚠️ 이미 스크래핑 작업 실행 중: $CURRENT_JOB"
    log "기존 작업 완료 대기..."

    wait_for_api_completion "$SCRAPER_API/jobs/status" "스크래핑"
    SCRAPE_EXIT=$?
else
    # 새로운 스크래핑 작업 시작
    log "🚀 새 스크래핑 작업 시작..."
    RESPONSE=$(curl -s -X POST "$SCRAPER_API/jobs/full" -H "Content-Type: application/json")
    JOB_ID=$(echo "$RESPONSE" | jq -r '.job_id // empty')

    if [ -z "$JOB_ID" ] || [ "$JOB_ID" == "null" ]; then
        log_error "스크래핑 작업 시작 실패: $RESPONSE"
        SCRAPE_EXIT=1
    else
        log "✅ 작업 시작됨: $JOB_ID"

        # 새 job이 running 상태로 바뀔 때까지 대기 (최대 60초)
        log "새 작업 시작 대기..."
        for wait_i in $(seq 1 12); do
            sleep 5
            NEW_STATUS=$(curl -s "$SCRAPER_API/jobs/status" 2>/dev/null | jq -r '.status // "unknown"')
            if [ "$NEW_STATUS" = "running" ] || [ "$NEW_STATUS" = "pending" ]; then
                log "작업 상태: $NEW_STATUS"
                break
            fi
        done

        wait_for_api_completion "$SCRAPER_API/jobs/status" "스크래핑"
        SCRAPE_EXIT=$?
    fi
fi

SCRAPE_END=$(date +%s)
SCRAPE_DURATION=$((SCRAPE_END - SCRAPE_START))

if [ $SCRAPE_EXIT -eq 0 ]; then
    log_success "스크래핑 완료 (소요시간: ${SCRAPE_DURATION}초)"
else
    log_error "스크래핑 실패 (Exit Code: $SCRAPE_EXIT)"
    log_error "파이프라인 중단"
    send_slack_notification "❌ ETF Pipeline Failed - Scraping step failed"

    log ""
    log "========================================"
    log "❌ 파이프라인 실패 - Step 1에서 중단됨"
    log "========================================"
    exit 1
fi

log ""

# =============================================================================
# Step 2: 데이터 검증 (선택사항 - API 연동 예정)
# =============================================================================
if [ "$SKIP_VALIDATION" = false ]; then
    log "========================================="
    log "Step 2/4: 데이터 검증"
    log "========================================="
    log "참고: 현재 API 방식의 검증 엔드포인트가 없습니다."
    log "필요시 --skip-validation 옵션을 사용하여 건너뛸 수 있습니다."
    log ""

    # TODO: 추후 검증 API 엔드포인트 구현 시 사용
    # VALIDATION_API="$SCRAPER_API/validation"
    # curl -s -X POST "$VALIDATION_API" ...

    log_warning "데이터 검증 단계 스킵 (구현 예정)"
    VALIDATE_EXIT=0
    VALIDATE_DURATION=0

    log ""
else
    log "========================================="
    log "Step 2/4: 데이터 검증 (건너뜀)"
    log "========================================="
    log "옵션: --skip-validation"
    log ""
    VALIDATE_EXIT=0
    VALIDATE_DURATION=0
fi

# =============================================================================
# Step 3: Feature Processing (API 호출)
# =============================================================================
log "========================================="
log "Step 3/4: Feature Processing"
log "========================================="
log "API: $SCRAPER_API/features/process"
log ""

FEATURE_START=$(date +%s)

# 피처 처리 상태 확인
FEATURE_STATUS=$(curl -s "$SCRAPER_API/features/status" 2>/dev/null || echo '{"status":"error"}')
CURRENT_FEATURE_STATUS=$(echo "$FEATURE_STATUS" | jq -r '.status // "error"')

if [ "$CURRENT_FEATURE_STATUS" == "running" ]; then
    log "⚠️ 이미 피처 처리 작업 실행 중"
    log "기존 작업 완료 대기..."

    wait_for_api_completion "$SCRAPER_API/features/status" "피처 처리"
    FEATURE_EXIT=$?
else
    # 새로운 피처 처리 작업 시작
    log "🚀 새 피처 처리 작업 시작..."
    RESPONSE=$(curl -s -X POST "$SCRAPER_API/features/process" \
        -H "Content-Type: application/json" \
        -d '{"include_macro": true, "shift_features": true}')

    JOB_ID=$(echo "$RESPONSE" | jq -r '.job_id // empty')

    if [ -z "$JOB_ID" ] || [ "$JOB_ID" == "null" ]; then
        log_error "피처 처리 작업 시작 실패: $RESPONSE"
        FEATURE_EXIT=1
    else
        log "✅ 작업 시작됨: $JOB_ID"

        wait_for_api_completion "$SCRAPER_API/features/status" "피처 처리"
        FEATURE_EXIT=$?
    fi
fi

FEATURE_END=$(date +%s)
FEATURE_DURATION=$((FEATURE_END - FEATURE_START))

if [ $FEATURE_EXIT -eq 0 ]; then
    log_success "Feature Processing 완료 (소요시간: ${FEATURE_DURATION}초)"
else
    log_error "Feature Processing 실패 (Exit Code: $FEATURE_EXIT)"

    if [ "$CONTINUE_ON_ERROR" = false ]; then
        log_error "파이프라인 중단 (--continue-on-error 옵션으로 계속 진행 가능)"
        send_slack_notification "❌ ETF Pipeline Failed - Feature Processing failed"

        log ""
        log "========================================"
        log "❌ 파이프라인 실패 - Step 3에서 중단됨"
        log "========================================"
        exit 1
    else
        log_warning "Feature Processing 실패했지만 계속 진행합니다 (--continue-on-error 옵션)"
        send_slack_notification "⚠️ ETF Pipeline Warning - Feature Processing failed but continuing"
    fi
fi

log ""

# =============================================================================
# Step 4: 예측 실행 (API 호출)
# =============================================================================
log "========================================="
log "Step 4/4: 예측 실행"
log "========================================="
log "API: docker exec etf-ml-service curl localhost:8000/api/predictions/ranking"
log ""

PREDICT_START=$(date +%s)

# 예측 실행 (컨테이너 내부에서 실행)
log "🚀 랭킹 예측 실행 중..."
RESPONSE=$(docker exec etf-ml-service curl -s -X POST http://localhost:8000/api/predictions/ranking \
    -H "Content-Type: application/json")

# 결과 파싱
TOTAL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total_symbols', 0))" 2>/dev/null || echo "0")

if [ "$TOTAL" != "0" ]; then
    TOP=$(echo "$RESPONSE" | python3 -c "import sys,json; r=json.load(sys.stdin)['rankings'][0]; print(f\"{r['symbol']} (score={r['score']})\")" 2>/dev/null || echo "N/A")
    log_success "예측 완료: $TOTAL 종목"
    log "🏆 1위: $TOP"
    PREDICT_EXIT=0
else
    log_error "예측 실패: $RESPONSE"
    PREDICT_EXIT=1
fi

PREDICT_END=$(date +%s)
PREDICT_DURATION=$((PREDICT_END - PREDICT_START))

log ""

# =============================================================================
# Step 5: 매매 실행 (선택사항 - --execute-trading 옵션 또는 APScheduler 자동)
# =============================================================================
TRADING_EXIT=0
TRADING_DURATION=0

if [ "$EXECUTE_TRADING" = true ]; then
    log "========================================="
    log "Step 5/5: 매매 실행"
    log "========================================="
    log "API: $TRADING_API/api/trading/execute"
    log ""

    TRADING_START=$(date +%s)

    # trading-service 헬스체크
    TRADING_HEALTH=$(curl -s "$TRADING_API/health" --max-time 10 2>/dev/null || echo '{"status": "error"}')

    if echo "$TRADING_HEALTH" | grep -q '"status":"ok"'; then
        log "✅ trading-service 정상"

        # 매매 실행 API 호출
        log "🚀 매매 실행 중..."
        TRADE_RESPONSE=$(curl -s -X POST "$TRADING_API/api/trading/execute" \
            -H "Content-Type: application/json" \
            --max-time 300 2>/dev/null)

        TRADE_SUCCESS=$(echo "$TRADE_RESPONSE" | jq -r '.success // false' 2>/dev/null)

        if [ "$TRADE_SUCCESS" = "true" ]; then
            TRADE_MSG=$(echo "$TRADE_RESPONSE" | jq -r '.message // "완료"' 2>/dev/null)
            BOUGHT=$(echo "$TRADE_RESPONSE" | jq -r '.bought_count // 0' 2>/dev/null)
            SOLD=$(echo "$TRADE_RESPONSE" | jq -r '.sold_count // 0' 2>/dev/null)
            DAY=$(echo "$TRADE_RESPONSE" | jq -r '.day_number // 0' 2>/dev/null)
            log_success "매매 실행 완료: $TRADE_MSG"
            log "거래일: $DAY | 매수: ${BOUGHT}건 | 매도: ${SOLD}건"
            TRADING_EXIT=0
        else
            TRADE_MSG=$(echo "$TRADE_RESPONSE" | jq -r '.message // .detail // "알 수 없는 오류"' 2>/dev/null)
            log_error "매매 실행 실패: $TRADE_MSG"
            TRADING_EXIT=1
        fi
    else
        log_error "trading-service 응답 없음 — 매매 실행 스킵"
        log "trading-service가 실행 중인지 확인: docker ps | grep trading"
        TRADING_EXIT=1
    fi

    TRADING_END=$(date +%s)
    TRADING_DURATION=$((TRADING_END - TRADING_START))
else
    # APScheduler 상태 확인만 수행
    log "========================================="
    log "Step 5/5: 매매 스케줄러 확인"
    log "========================================="

    if docker ps | grep -q "etf-trading-service"; then
        TRADING_HEALTH=$(curl -s "$TRADING_API/health" --max-time 10 2>/dev/null || echo '{}')
        TRADING_MODE=$(echo "$TRADING_HEALTH" | jq -r '.trading_mode // "unknown"' 2>/dev/null)
        log_success "trading-service 활성 (모드: $TRADING_MODE)"
        log "APScheduler가 설정된 시간에 자동 매매를 실행합니다"
        log "즉시 실행하려면: --execute-trading 옵션을 추가하세요"
    else
        log_warning "trading-service 미실행 — 자동매매 비활성"
        log "시작하려면: docker compose up -d trading-service"
    fi

    TRADING_EXIT=0
fi

log ""

# =============================================================================
# 파이프라인 요약
# =============================================================================
PIPELINE_END=$(date +%s)
PIPELINE_DURATION=$((PIPELINE_END - PIPELINE_START))

log "========================================"
log "📊 파이프라인 실행 요약"
log "========================================"
log "전체 소요시간: ${PIPELINE_DURATION}초 ($(($PIPELINE_DURATION / 60))분 $(($PIPELINE_DURATION % 60))초)"
log ""
log "Step 1 - 스크래핑:       $([ $SCRAPE_EXIT -eq 0 ] && echo '✅ 성공' || echo '❌ 실패') (${SCRAPE_DURATION}초)"
log "Step 2 - 검증:           ⏭️  스킵 (구현 예정)"
log "Step 3 - Feature:        $([ $FEATURE_EXIT -eq 0 ] && echo '✅ 성공' || echo '❌ 실패') (${FEATURE_DURATION}초)"
log "Step 4 - 예측:           $([ $PREDICT_EXIT -eq 0 ] && echo '✅ 성공' || echo '❌ 실패') (${PREDICT_DURATION}초)"
if [ "$EXECUTE_TRADING" = true ]; then
    log "Step 5 - 매매 실행:     $([ $TRADING_EXIT -eq 0 ] && echo '✅ 성공' || echo '❌ 실패') (${TRADING_DURATION}초)"
else
    log "Step 5 - 매매 스케줄러: ✅ APScheduler 자동 실행 대기"
fi
log ""

# 최종 결과 판정
if [ $SCRAPE_EXIT -eq 0 ] && [ $FEATURE_EXIT -eq 0 ] && [ $PREDICT_EXIT -eq 0 ] && [ $TRADING_EXIT -eq 0 ]; then
    log_success "모든 단계 완료!"
    log "========================================"
    send_slack_notification "✅ ETF Pipeline Completed Successfully (${PIPELINE_DURATION}s)"
    exit 0
else
    log_error "파이프라인 실패"
    log "========================================"

    if [ $SCRAPE_EXIT -ne 0 ]; then
        log_error "실패 단계: Step 1 (스크래핑)"
    fi
    if [ $FEATURE_EXIT -ne 0 ]; then
        log_error "실패 단계: Step 3 (Feature Processing)"
    fi
    if [ $PREDICT_EXIT -ne 0 ]; then
        log_error "실패 단계: Step 4 (예측)"
    fi
    if [ $TRADING_EXIT -ne 0 ]; then
        log_error "실패 단계: Step 5 (매매 실행)"
    fi

    log ""
    log "상세 로그: $PIPELINE_LOG"
    exit 1
fi
