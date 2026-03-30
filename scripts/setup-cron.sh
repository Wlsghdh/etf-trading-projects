#!/bin/bash
# cron 작업 설정 스크립트 (서버 시간: KST 기준)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📅 Cron 작업 설정 (KST 기준)"
echo "============================="
echo ""
echo "서버 시간대: $(date +%Z) ($(date '+%Y-%m-%d %H:%M'))"
echo ""
echo "다음 작업을 crontab에 추가합니다:"
echo ""
echo "1. [데이터 파이프라인] 매일 07:00 KST (월~금) - 미국 장 마감 후"
echo "2. [서비스 헬스체크]   매 6시간마다"
echo "3. [수익률 업데이트]   매주 일요일 11:00 KST"
echo "4. [모델 재학습]       매년 1월 1일 12:00 KST"
echo ""
echo "※ 매매 실행은 trading-service APScheduler (23:30 KST)"
echo ""

# 현재 crontab 백업
crontab -l > /tmp/crontab_backup 2>/dev/null
echo "📋 기존 crontab 백업: /tmp/crontab_backup"

# 기존 ETF 관련 작업 제거
(crontab -l 2>/dev/null | grep -v "etf-trading-project") | crontab -

mkdir -p "$PROJECT_DIR/logs"

# =============================================================================
# 1. 데이터 파이프라인 (매일 07:00 KST, 월~금)
#    미국 장 마감: 06:00 KST (서머타임 05:00) → 1시간 후 수집 시작
# =============================================================================
(crontab -l 2>/dev/null; echo "# ETF Pipeline - 데이터 파이프라인 (07:00 KST 월~금)") | crontab -
(crontab -l 2>/dev/null; echo "0 7 * * 1-5 $PROJECT_DIR/scripts/run-pipeline.sh --skip-validation >> $PROJECT_DIR/logs/cron.log 2>&1") | crontab -
(crontab -l 2>/dev/null; echo "") | crontab -

# =============================================================================
# 2. 서비스 헬스체크 (6시간마다)
# =============================================================================
(crontab -l 2>/dev/null; echo "# ETF Pipeline - 서비스 헬스체크 (6시간마다)") | crontab -
(crontab -l 2>/dev/null; echo "0 */6 * * * $PROJECT_DIR/scripts/check-services.sh >> $PROJECT_DIR/logs/cron.log 2>&1") | crontab -
(crontab -l 2>/dev/null; echo "") | crontab -

# =============================================================================
# 3. 주간 수익률 업데이트 (매주 일요일 11:00 KST)
# =============================================================================
(crontab -l 2>/dev/null; echo "# ETF Pipeline - 주간 수익률 업데이트 (일요일 11:00 KST)") | crontab -
(crontab -l 2>/dev/null; echo "0 11 * * 0 $PROJECT_DIR/scripts/update-returns.sh >> $PROJECT_DIR/logs/cron.log 2>&1") | crontab -
(crontab -l 2>/dev/null; echo "") | crontab -

# =============================================================================
# 4. 연간 모델 재학습 (매년 1월 1일 12:00 KST)
# =============================================================================
(crontab -l 2>/dev/null; echo "# ETF Pipeline - 연간 모델 학습 (1월 1일 12:00 KST)") | crontab -
(crontab -l 2>/dev/null; echo "0 12 1 1 * $PROJECT_DIR/scripts/train-yearly.sh >> $PROJECT_DIR/logs/cron.log 2>&1") | crontab -

echo ""
echo "✅ Cron 작업 설정 완료!"
echo ""
echo "현재 설정된 cron 작업:"
echo "---------------------"
crontab -l | grep -v "^$" | grep -v "^#$"
echo ""
echo "📝 로그: $PROJECT_DIR/logs/"
echo ""
echo "========================================="
echo "📌 자동화 타임라인 (KST)"
echo "========================================="
echo ""
echo "  07:00  데이터 파이프라인 시작"
echo "  │  Step 1: TradingView 스크래핑 (101종목)"
echo "  │  Step 3: 피처 처리 (85개 피처)"
echo "  │  Step 4: ML 랭킹 예측"
echo "  │  Step 5: trading-service 상태 확인"
echo "  ~12:00  파이프라인 완료"
echo "  │"
echo "  23:30  APScheduler 자동매매 실행"
echo "         잔고 조회 → ML 랭킹 → FIFO 매도 → 매수"
echo ""
echo "========================================="
