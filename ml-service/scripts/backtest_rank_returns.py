"""종목별 10년치 평균 3개월 수익률 계산 및 etf_63_pred DB 저장.

etf2_db_processed의 각 {SYMBOL}_D 테이블에서 target_3m 값을 읽어
종목별 평균/중앙값/표준편차/승률/표본수 등의 통계를 계산하고,
MySQL etf_63_pred 데이터베이스에 저장한다.

Usage:
    docker exec -it etf-ml-service python scripts/backtest_rank_returns.py --calc-averages
    docker exec -it etf-ml-service python scripts/backtest_rank_returns.py --calc-averages --update-only
    docker exec -it etf-ml-service python scripts/backtest_rank_returns.py --calc-averages --force-recalc
    docker exec -it etf-ml-service python scripts/backtest_rank_returns.py --stats-only
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("backtest_rank_returns")

SOURCE_DB = "etf2_db_processed"
TARGET_DB = "etf_63_pred"
MIN_SAMPLES = 10
TARGET_3M_MIN = -1.0   # 3개월 최대 손실 -100%
TARGET_3M_MAX = 5.0    # 3개월 최대 수익 +500%


def get_mysql_base_url() -> str:
    host = os.getenv("MYSQL_HOST", "host.docker.internal")
    port = os.getenv("MYSQL_PORT", "3306")
    user = os.getenv("MYSQL_USER", "ahnbi2")
    password = os.getenv("MYSQL_PASSWORD", "bigdata")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}"


def get_source_engine() -> Engine:
    url = os.getenv("PROCESSED_DB_URL") or f"{get_mysql_base_url()}/{SOURCE_DB}"
    return create_engine(url, pool_pre_ping=True)


def get_target_engine_server() -> Engine:
    """서버 레벨 엔진 (DB 생성용, DB 미지정)."""
    return create_engine(get_mysql_base_url(), pool_pre_ping=True)


def get_target_engine() -> Engine:
    url = f"{get_mysql_base_url()}/{TARGET_DB}"
    return create_engine(url, pool_pre_ping=True)


def ensure_target_database_and_tables() -> None:
    """etf_63_pred DB와 테이블이 없으면 생성."""
    server_engine = get_target_engine_server()
    with server_engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {TARGET_DB} "
                          "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
        conn.commit()
    logger.info(f"Database ready: {TARGET_DB}")

    target_engine = get_target_engine()
    with target_engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS symbol_avg_returns (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                ticker          VARCHAR(20) NOT NULL UNIQUE,
                avg_return_3m   DOUBLE NOT NULL,
                median_return   DOUBLE,
                std_return      DOUBLE,
                win_rate        DOUBLE,
                sample_count    INT,
                min_return      DOUBLE,
                max_return      DOUBLE,
                data_start_date DATE,
                data_end_date   DATE,
                calculated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_avg_return (avg_return_3m)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS calculation_runs (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                run_date        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                n_symbols       INT,
                data_start_date DATE,
                data_end_date   DATE,
                status          VARCHAR(20) DEFAULT 'completed',
                note            TEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """))
        conn.commit()
    logger.info("Tables ready: symbol_avg_returns, calculation_runs")


def list_source_tables(engine: Engine) -> list[str]:
    query = text(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_SCHEMA = :schema AND TABLE_NAME LIKE '%_D' "
        "ORDER BY TABLE_NAME"
    )
    with engine.connect() as conn:
        result = conn.execute(query, {"schema": SOURCE_DB})
        return [row[0] for row in result]


def list_existing_tickers(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT ticker FROM symbol_avg_returns"))
        return {row[0] for row in result}


def compute_symbol_stats(engine: Engine, table: str) -> dict | None:
    ticker = table[:-2] if table.endswith("_D") else table
    query = text(
        f"SELECT `time`, `target_3m` FROM `{table}` "
        f"WHERE `target_3m` IS NOT NULL ORDER BY `time`"
    )
    df = pd.read_sql(query, engine)
    if df.empty:
        return None

    raw_count = len(df)

    # --- 일자 중복 제거: 하루에 여러 행 → 마지막 행(장 마감 값)만 사용 ---
    df["date_only"] = pd.to_datetime(df["time"]).dt.date
    df = df.sort_values("time").drop_duplicates(subset=["date_only"], keep="last")
    df = df.drop(columns=["date_only"])

    # --- 이상치 필터: target_3m 범위 제한 ---
    before_filter = len(df)
    df = df[(df["target_3m"] >= TARGET_3M_MIN) & (df["target_3m"] <= TARGET_3M_MAX)]
    filtered_out = before_filter - len(df)

    if len(df) < MIN_SAMPLES:
        logger.warning(f"[SKIP] {ticker}: sample_count={len(df)} < {MIN_SAMPLES} "
                       f"(raw={raw_count}, dedup={before_filter}, filtered={filtered_out})")
        return None

    if filtered_out > 0:
        logger.info(f"[FILTER] {ticker}: removed {raw_count - before_filter} duplicates, "
                    f"{filtered_out} outliers → {len(df)} rows")

    returns = df["target_3m"].astype(float)
    return {
        "ticker": ticker,
        "avg_return_3m": float(returns.mean()),
        "median_return": float(returns.median()),
        "std_return": float(returns.std()),
        "win_rate": float((returns > 0).mean()),
        "sample_count": int(len(returns)),
        "min_return": float(returns.min()),
        "max_return": float(returns.max()),
        "data_start_date": df["time"].min().date(),
        "data_end_date": df["time"].max().date(),
    }


def upsert_symbol_stats(engine: Engine, stats: list[dict]) -> None:
    if not stats:
        return
    upsert_sql = text("""
        INSERT INTO symbol_avg_returns
            (ticker, avg_return_3m, median_return, std_return, win_rate,
             sample_count, min_return, max_return, data_start_date, data_end_date)
        VALUES
            (:ticker, :avg_return_3m, :median_return, :std_return, :win_rate,
             :sample_count, :min_return, :max_return, :data_start_date, :data_end_date)
        ON DUPLICATE KEY UPDATE
            avg_return_3m   = VALUES(avg_return_3m),
            median_return   = VALUES(median_return),
            std_return      = VALUES(std_return),
            win_rate        = VALUES(win_rate),
            sample_count    = VALUES(sample_count),
            min_return      = VALUES(min_return),
            max_return      = VALUES(max_return),
            data_start_date = VALUES(data_start_date),
            data_end_date   = VALUES(data_end_date)
    """)
    with engine.begin() as conn:
        conn.execute(upsert_sql, stats)
    logger.info(f"Upserted {len(stats)} rows into symbol_avg_returns")


def record_run(engine: Engine, n_symbols: int, start: str | None, end: str | None, note: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO calculation_runs
                    (n_symbols, data_start_date, data_end_date, status, note)
                VALUES (:n, :start, :end, 'completed', :note)
            """),
            {"n": n_symbols, "start": start, "end": end, "note": note},
        )


def calc_averages(force_recalc: bool = False, update_only: bool = False) -> pd.DataFrame:
    ensure_target_database_and_tables()
    source_engine = get_source_engine()
    target_engine = get_target_engine()

    tables = list_source_tables(source_engine)
    logger.info(f"Found {len(tables)} source tables in {SOURCE_DB}")

    if force_recalc:
        with target_engine.begin() as conn:
            conn.execute(text("DELETE FROM symbol_avg_returns"))
        logger.info("[force-recalc] Cleared symbol_avg_returns")
        existing = set()
    elif update_only:
        existing = list_existing_tickers(target_engine)
        logger.info(f"[update-only] {len(existing)} tickers already in DB, will skip them")
    else:
        existing = set()

    stats_list: list[dict] = []
    for i, table in enumerate(tables, 1):
        ticker = table[:-2] if table.endswith("_D") else table
        if update_only and ticker in existing:
            continue
        try:
            stats = compute_symbol_stats(source_engine, table)
        except Exception as exc:
            logger.error(f"[ERROR] {ticker}: {exc}")
            continue
        if stats:
            stats_list.append(stats)
            if i % 20 == 0 or i == len(tables):
                logger.info(f"  progress: {i}/{len(tables)} (collected={len(stats_list)})")

    if not stats_list:
        logger.warning("No stats computed. Nothing to save.")
        return pd.DataFrame()

    upsert_symbol_stats(target_engine, stats_list)

    df = pd.DataFrame(stats_list).sort_values("avg_return_3m", ascending=False).reset_index(drop=True)
    start = str(df["data_start_date"].min())
    end = str(df["data_end_date"].max())
    note_parts = []
    if force_recalc:
        note_parts.append("force_recalc")
    if update_only:
        note_parts.append("update_only")
    record_run(target_engine, len(df), start, end, ", ".join(note_parts) or "calc_averages")

    return df


def load_stats_from_db() -> pd.DataFrame:
    ensure_target_database_and_tables()
    engine = get_target_engine()
    with engine.connect() as conn:
        df = pd.read_sql(
            text("SELECT * FROM symbol_avg_returns ORDER BY avg_return_3m DESC"),
            conn,
        )
    return df


def save_csv(df: pd.DataFrame, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "symbol_avg_returns.csv"
    csv_df = df.sort_values("avg_return_3m", ascending=False).reset_index(drop=True)
    csv_df.index += 1
    csv_df.index.name = "rank"
    csv_df.to_csv(out_path)
    logger.info(f"CSV saved: {out_path}")
    return out_path


def print_report(df: pd.DataFrame) -> None:
    if df.empty:
        print("No data to report.")
        return

    sorted_df = df.sort_values("avg_return_3m", ascending=False).reset_index(drop=True)
    overall = sorted_df["avg_return_3m"].mean()

    print()
    print("=" * 96)
    print("  종목별 평균 3개월(63거래일) 수익률 리포트")
    print("=" * 96)
    print(f"  종목 수: {len(sorted_df)}")
    if "data_start_date" in sorted_df.columns:
        print(f"  데이터 기간: {sorted_df['data_start_date'].min()} ~ {sorted_df['data_end_date'].max()}")
    print(f"  전체 평균 수익률: {overall * 100:+.2f}%")
    print("=" * 96)

    header = (
        f"{'순위':>4} | {'종목':8} | {'평균':>9} | {'중앙값':>9} | "
        f"{'승률':>6} | {'표본':>6} | {'기간':>19}"
    )
    print(header)
    print("-" * 96)

    def fmt(rank: int, row: pd.Series) -> str:
        start = str(row.get("data_start_date", ""))[:10]
        end = str(row.get("data_end_date", ""))[:10]
        return (
            f"{rank:4d} | {row['ticker']:8s} | "
            f"{row['avg_return_3m']*100:+8.2f}% | "
            f"{row['median_return']*100:+8.2f}% | "
            f"{row['win_rate']*100:5.1f}% | "
            f"{row['sample_count']:6d} | "
            f"{start}~{end[5:]}"
        )

    print("\n[Top 10]")
    for i, row in sorted_df.head(10).iterrows():
        print(fmt(i + 1, row))

    print("\n[Bottom 10]")
    bot = sorted_df.tail(10)
    for i, row in bot.iterrows():
        print(fmt(i + 1, row))

    print("\n" + "=" * 96)
    print("  포트폴리오 그룹별 기대 수익률")
    print("=" * 96)
    groups = [
        ("Top 5", sorted_df.head(5)),
        ("Top 10", sorted_df.head(10)),
        ("Top 20", sorted_df.head(20)),
        ("전체 평균", sorted_df),
        ("Bottom 10", sorted_df.tail(10)),
    ]
    for label, g in groups:
        avg = g["avg_return_3m"].mean()
        diff = avg - overall
        print(f"  {label:12s} | 평균: {avg*100:+7.2f}% | vs 전체: {diff*100:+7.2f}%p | {len(g)}종목")

    top10_avg = sorted_df.head(10)["avg_return_3m"].mean()
    bot10_avg = sorted_df.tail(10)["avg_return_3m"].mean()
    print(f"  {'Top10-Bot10':12s} | 스프레드: {(top10_avg - bot10_avg)*100:+7.2f}%p")
    print()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="종목별 평균 3개월 수익률 계산 및 etf_63_pred 저장")
    p.add_argument("--calc-averages", action="store_true", help="종목별 평균 계산 실행")
    p.add_argument("--stats-only", action="store_true", help="DB에서 통계만 조회")
    p.add_argument("--force-recalc", action="store_true", help="기존 결과 삭제 후 전체 재계산")
    p.add_argument("--update-only", action="store_true", help="신규 종목만 추가 계산")
    p.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parent.parent / "results"),
        help="CSV 저장 디렉토리 (기본: ml-service/results)",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if not any([args.calc_averages, args.stats_only]):
        logger.info("옵션 없음 → --calc-averages 로 동작")
        args.calc_averages = True

    if args.calc_averages:
        df = calc_averages(force_recalc=args.force_recalc, update_only=args.update_only)
        if df.empty and args.update_only:
            logger.info("신규 종목 없음 → 기존 DB에서 조회")
            df = load_stats_from_db()
    else:
        df = load_stats_from_db()

    if df.empty:
        logger.warning("결과 없음")
        return 1

    save_csv(df, Path(args.output))
    print_report(df)
    return 0


if __name__ == "__main__":
    sys.exit(main())
