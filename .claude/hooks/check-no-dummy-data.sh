#!/bin/bash
# Hook: BFF API 파일에서 더미/하드코딩 데이터 패턴 검사
# trading-monitor/app/api/ 하위 .ts 파일이 수정될 때 실행

CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || git diff --name-only HEAD 2>/dev/null)

# BFF API 파일만 필터
API_FILES=$(echo "$CHANGED_FILES" | grep -E "trading-monitor/app/api/.*\\.ts$")

if [ -z "$API_FILES" ]; then
  exit 0
fi

ERRORS=""

for file in $API_FILES; do
  [ ! -f "$file" ] && continue

  # 더미 데이터 패턴 검사
  if grep -nE "(dummy|mock|fake|sample|하드코딩|= 100000|= 10000|fallback.*100)" "$file" | grep -v "//.*dummy\|//.*mock\|#.*dummy" > /dev/null 2>&1; then
    ERRORS="${ERRORS}\n⚠ ${file}: 더미/하드코딩 데이터 패턴 감지"
  fi

  # DB fallback으로 가격을 가져오는 패턴 검사 (portfolio/balance에서)
  if echo "$file" | grep -qE "(portfolio|balance)" && grep -nE "etf2_db|ML_SERVICE_URL.*tables.*data" "$file" > /dev/null 2>&1; then
    ERRORS="${ERRORS}\n⚠ ${file}: DB fallback으로 가격 조회 감지 - KIS API만 사용해야 합니다"
  fi
done

if [ -n "$ERRORS" ]; then
  echo -e "🚨 데이터 무결성 검사 실패:${ERRORS}"
  echo ""
  echo "규칙: 포트폴리오/잔고 데이터는 KIS API만 사용. DB fallback/더미 데이터 금지."
  exit 1
fi

exit 0
