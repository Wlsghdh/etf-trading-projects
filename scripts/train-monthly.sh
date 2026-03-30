#!/bin/bash
# 매월 모델 학습/업데이트 스크립트
# cron: 0 3 1 * * /home/jjh0709/git/etf-trading-project/scripts/train-monthly.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# PATH 설정 (cron 환경용)
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/train-$(date +%Y%m).log"

mkdir -p "$LOG_DIR"

echo "========================================" >> "$LOG_FILE"
echo "🎓 월간 학습 시작: $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

cd "$PROJECT_DIR"

# 1. 서비스 상태 확인 및 시작
if ! pgrep -f "ssh.*3306:127.0.0.1:5100" > /dev/null; then
    echo "📡 SSH 터널 시작..." >> "$LOG_FILE"
    ssh -f -N -L 3306:127.0.0.1:5100 ahnbi2@ahnbi2.suwon.ac.kr \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3
    sleep 3
fi

# Docker 컨테이너 확인
if ! docker ps | grep -q "etf-ml-service"; then
    echo "🐳 Docker 컨테이너 시작..." >> "$LOG_FILE"
    docker-compose up -d
    sleep 10
fi

# 2. 학습 API 호출 (현재 MVP는 단순 모델이므로 예측 정확도 분석만 수행)
echo "📈 이전 달 예측 정확도 분석..." >> "$LOG_FILE"

# 저장된 예측 결과 조회
PREDICTIONS=$(curl -s "http://localhost:8000/api/predictions?limit=100")
COUNT=$(echo "$PREDICTIONS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null)

echo "📊 저장된 예측 수: $COUNT" >> "$LOG_FILE"

# 3. 실제 모델 재학습 실행
echo "🔄 모델 재학습 시작..." >> "$LOG_FILE"

docker exec etf-ml-service python scripts/train_ahnlab.py 2>&1 | tee -a "$LOG_FILE"
TRAIN_EXIT=$?

if [ $TRAIN_EXIT -eq 0 ]; then
    echo "✅ 모델 재학습 완료" >> "$LOG_FILE"
else
    echo "❌ 모델 재학습 실패 (exit code: $TRAIN_EXIT)" >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"

# 4. 예측 DB 정리 (90일 이상 된 데이터 삭제 - 옵션)
# echo "🧹 오래된 예측 데이터 정리..." >> "$LOG_FILE"

echo "완료 시간: $(date)" >> "$LOG_FILE"
echo "✅ 월간 학습 완료"
