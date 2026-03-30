#!/bin/bash
# 연간 모델 학습 스크립트
# 매년 1월 1일 새벽 3시 실행
# cron: 0 3 1 1 * /home/jjh0709/git/etf-trading-project/scripts/train-yearly.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# PATH 설정 (cron 환경용)
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/train-$(date +%Y).log"

mkdir -p "$LOG_DIR"

echo "========================================" >> "$LOG_FILE"
echo "🎓 연간 모델 학습 시작: $(date)" >> "$LOG_FILE"
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

# 2. 헬스체크
for i in {1..30}; do
    if wget -q -O- http://localhost:8000/health | grep -q "healthy"; then
        echo "✅ 서비스 정상" >> "$LOG_FILE"
        break
    fi
    sleep 2
done

# 3. 이전 년도 예측 성과 분석
echo "📈 지난 1년간 예측 성과 분석..." >> "$LOG_FILE"

PREDICTIONS=$(wget -q -O- "http://localhost:8000/api/predictions/history?days=365")
COUNT=$(echo "$PREDICTIONS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null)

echo "📊 분석 대상 예측 수: $COUNT" >> "$LOG_FILE"

# 4. 모델 재학습 (추후 ML 파이프라인 연동)
echo "" >> "$LOG_FILE"
echo "🔄 모델 재학습 시작..." >> "$LOG_FILE"

docker exec etf-ml-service python scripts/train_ahnlab.py 2>&1 | tee -a "$LOG_FILE"
TRAIN_EXIT=$?

if [ $TRAIN_EXIT -eq 0 ]; then
    echo "✅ 모델 재학습 완료" >> "$LOG_FILE"
else
    echo "❌ 모델 재학습 실패 (exit code: $TRAIN_EXIT)" >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"

# 5. 새해 첫 팩트시트 생성
echo "📄 새해 첫 팩트시트 준비..." >> "$LOG_FILE"

# 6. 완료
echo "완료 시간: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
echo "✅ 연간 모델 학습 완료"
