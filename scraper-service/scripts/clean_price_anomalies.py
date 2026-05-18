#!/usr/bin/env python3
"""
가격 이상치 정리 스크립트
========================

etf2_db의 _D 테이블에서 다른 종목 데이터가 섞인 이상치 행을 제거합니다.

방법:
1. 각 _D 테이블의 close 가격 중앙값 계산
2. 중앙값 대비 5배 이상 차이나는 행 = 이상치
3. intraday 데이터 제거 (하루에 여러 행이 있는 경우)
4. --execute로 실제 삭제

Usage:
    # Dry-run (기본): 이상치 리포트만
    python clean_price_anomalies.py

    # 실제 삭제
    python clean_price_anomalies.py --execute

    # 특정 테이블만
    python clean_price_anomalies.py --execute --tables GILD_D CSCO_D
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, text

# Logging
LOG_DIR = Path("/tmp/clean_anomalies_logs")
LOG_DIR.mkdir(exist_ok=True)
log_file = LOG_DIR / f"clean_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file, encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def get_daily_tables(conn, db_name: str) -> list[str]:
    """_D 테이블 목록 조회"""
    r = conn.execute(text(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_SCHEMA = :db AND TABLE_NAME LIKE '%\\_D'"
    ), {"db": db_name})
    return [row[0] for row in r]


def analyze_table(conn, table: str) -> dict:
    """테이블 분석: 이상치 + intraday 행 감지"""
    result = {
        "table": table,
        "total_rows": 0,
        "anomaly_rows": 0,
        "intraday_rows": 0,
        "clean_rows": 0,
        "price_range": "",
        "median_close": 0,
    }

    try:
        # 전체 행 수
        r = conn.execute(text(f"SELECT COUNT(*) FROM `{table}`"))
        result["total_rows"] = r.scalar() or 0

        if result["total_rows"] == 0:
            return result

        # 종가 중앙값 계산 (MySQL 8.0+)
        r = conn.execute(text(f"""
            SELECT close FROM `{table}` ORDER BY close
            LIMIT 1 OFFSET {result['total_rows'] // 2}
        """))
        row = r.fetchone()
        median = float(row[0]) if row else 0
        result["median_close"] = round(median, 2)

        # 가격 범위
        r = conn.execute(text(f"SELECT MIN(close), MAX(close) FROM `{table}`"))
        row = r.fetchone()
        result["price_range"] = f"${float(row[0]):.2f} ~ ${float(row[1]):.2f}"

        if median <= 0:
            return result

        # 이상치 행 수 (중앙값 대비 5배 이상 차이)
        r = conn.execute(text(f"""
            SELECT COUNT(*) FROM `{table}`
            WHERE close > :upper OR close < :lower
        """), {"upper": median * 5, "lower": median / 5})
        result["anomaly_rows"] = r.scalar() or 0

        # intraday 행 수 (하루에 2행 이상)
        r = conn.execute(text(f"""
            SELECT SUM(cnt - 1) FROM (
                SELECT DATE(time) as d, COUNT(*) as cnt
                FROM `{table}`
                GROUP BY DATE(time)
                HAVING cnt > 1
            ) sub
        """))
        val = r.scalar()
        result["intraday_rows"] = int(val) if val else 0

        result["clean_rows"] = result["total_rows"] - result["anomaly_rows"] - result["intraday_rows"]

    except Exception as e:
        logger.error(f"  [{table}] 분석 오류: {e}")

    return result


def clean_table(conn, table: str, dry_run: bool) -> dict:
    """이상치 + intraday 행 삭제"""
    stats = analyze_table(conn, table)

    if stats["total_rows"] == 0:
        return stats

    total_deleted = 0
    median = stats["median_close"]

    if median <= 0:
        logger.warning(f"  [{table}] 중앙값 0 - 스킵")
        return stats

    # 1) 가격 이상치 삭제
    if stats["anomaly_rows"] > 0:
        if dry_run:
            logger.info(f"  [{table}] DRY-RUN: 가격 이상치 {stats['anomaly_rows']}행 삭제 예정 "
                       f"(median=${median:.2f}, 범위 외: <${median/5:.2f} or >${median*5:.2f})")
        else:
            r = conn.execute(text(f"""
                DELETE FROM `{table}`
                WHERE close > :upper OR close < :lower
            """), {"upper": median * 5, "lower": median / 5})
            deleted = r.rowcount
            total_deleted += deleted
            logger.info(f"  [{table}] 가격 이상치 {deleted}행 삭제 완료")

    # 2) intraday 행 삭제 (하루에 여러 행 → 마지막 행만 유지)
    if stats["intraday_rows"] > 0:
        if dry_run:
            logger.info(f"  [{table}] DRY-RUN: intraday {stats['intraday_rows']}행 삭제 예정")
        else:
            # 각 날짜의 마지막 행(장마감가)만 유지, 나머지 삭제
            r = conn.execute(text(f"""
                DELETE t1 FROM `{table}` t1
                INNER JOIN (
                    SELECT DATE(time) as d, MAX(time) as keep_time
                    FROM `{table}`
                    GROUP BY DATE(time)
                    HAVING COUNT(*) > 1
                ) t2 ON DATE(t1.time) = t2.d AND t1.time != t2.keep_time
            """))
            deleted = r.rowcount
            total_deleted += deleted
            logger.info(f"  [{table}] intraday {deleted}행 삭제 완료")

    if not dry_run and total_deleted > 0:
        conn.commit()

    stats["deleted"] = total_deleted
    return stats


def main():
    parser = argparse.ArgumentParser(description="가격 이상치 정리")
    parser.add_argument("--execute", action="store_true", help="실제 삭제 (기본: dry-run)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", default="ahnbi2")
    parser.add_argument("--password", default="bigdata")
    parser.add_argument("--databases", nargs="+", default=["etf2_db"])
    parser.add_argument("--tables", nargs="+", default=None, help="특정 테이블만")
    args = parser.parse_args()

    dry_run = not args.execute
    mode = "DRY-RUN" if dry_run else "EXECUTE"
    logger.info(f"=== 가격 이상치 정리 ({mode}) ===")

    if not dry_run:
        logger.info("⚠ EXECUTE 모드: 5초 뒤 시작합니다. Ctrl+C로 중단 가능.")
        import time
        time.sleep(5)

    results = []

    for db_name in args.databases:
        db_url = f"mysql+pymysql://{args.user}:{args.password}@{args.host}:{args.port}/{db_name}"
        engine = create_engine(db_url)

        with engine.connect() as conn:
            if args.tables:
                tables = args.tables
            else:
                tables = get_daily_tables(conn, db_name)

            logger.info(f"\n{db_name}: {len(tables)}개 _D 테이블")

            problem_tables = []

            for i, table in enumerate(tables):
                stats = clean_table(conn, table, dry_run)
                if stats["anomaly_rows"] > 0 or stats["intraday_rows"] > 0:
                    problem_tables.append(stats)
                    results.append(stats)

            # 요약
            logger.info(f"\n{'='*60}")
            logger.info(f"{db_name} 요약 ({mode})")
            logger.info(f"{'='*60}")
            logger.info(f"  전체 _D 테이블: {len(tables)}")
            logger.info(f"  문제 테이블: {len(problem_tables)}")
            total_anomaly = sum(t["anomaly_rows"] for t in problem_tables)
            total_intraday = sum(t["intraday_rows"] for t in problem_tables)
            logger.info(f"  총 가격 이상치: {total_anomaly}행")
            logger.info(f"  총 intraday: {total_intraday}행")
            if not dry_run:
                total_deleted = sum(t.get("deleted", 0) for t in problem_tables)
                logger.info(f"  총 삭제: {total_deleted}행")

        engine.dispose()

    # 결과 저장
    result_file = LOG_DIR / f"clean_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(result_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    logger.info(f"\n결과 저장: {result_file}")


if __name__ == "__main__":
    main()
