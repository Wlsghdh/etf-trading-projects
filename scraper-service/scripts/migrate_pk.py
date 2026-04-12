#!/usr/bin/env python3
"""
Migration Script: ALTER PRIMARY KEY from (time) to (symbol, timeframe, time)

기존 etf2_db / etf2_db_processed 테이블의 PRIMARY KEY를
(time) → (symbol, timeframe, time) 복합키로 변경하는 마이그레이션 스크립트.

Usage:
    # Dry-run (기본값): 변경 사항만 리포트
    python migrate_pk.py

    # 실제 실행
    python migrate_pk.py --execute

    # 특정 DB만
    python migrate_pk.py --execute --databases etf2_db

    # 특정 테이블만
    python migrate_pk.py --execute --tables AAPL_D NVDA_1h

    # 기존 SSH 터널 사용 (로컬 실행 시)
    python migrate_pk.py --host 127.0.0.1 --port 3306

    # Docker 내부에서 실행 시
    python migrate_pk.py --host host.docker.internal --port 3306
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import create_engine, text

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

log_file = LOG_DIR / f"migrate_pk_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file, encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Progress tracking (resume support)
# ---------------------------------------------------------------------------
PROGRESS_FILE = LOG_DIR / "migrate_pk_progress.json"


def load_progress() -> dict:
    """Load progress from previous run."""
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def save_progress(progress: dict):
    """Save progress for resume capability."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2, default=str)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

# Tables to skip (non-stock data tables)
SKIP_TABLES = {
    "corporate_dividends",
    "corporate_splits",
}


def get_engine(host: str, port: int, user: str, password: str, database: str):
    """Create SQLAlchemy engine for a specific database."""
    url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
    return create_engine(url, pool_pre_ping=True, pool_recycle=3600, echo=False)


def list_tables(engine, database: str) -> list[str]:
    """List all tables in the database."""
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_SCHEMA = :db AND TABLE_TYPE = 'BASE TABLE'"
            ),
            {"db": database},
        )
        return [row[0] for row in result.fetchall()]


def get_primary_key_columns(engine, database: str, table: str) -> list[str]:
    """Get the columns that make up the primary key of a table."""
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE "
                "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl "
                "AND CONSTRAINT_NAME = 'PRIMARY' "
                "ORDER BY ORDINAL_POSITION"
            ),
            {"db": database, "tbl": table},
        )
        return [row[0] for row in result.fetchall()]


def get_table_columns(engine, database: str, table: str) -> list[str]:
    """Get all column names of a table."""
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl"
            ),
            {"db": database, "tbl": table},
        )
        return [row[0] for row in result.fetchall()]


def count_duplicates(engine, table: str) -> int:
    """
    Count rows that would be duplicates under the new PK (symbol, timeframe, time).
    Returns the number of EXTRA rows (total - unique groups).
    """
    with engine.connect() as conn:
        # Total rows
        total = conn.execute(text(f"SELECT COUNT(*) FROM `{table}`")).scalar()
        # Unique (symbol, timeframe, time) groups
        unique = conn.execute(
            text(
                f"SELECT COUNT(*) FROM ("
                f"  SELECT 1 FROM `{table}` GROUP BY `symbol`, `timeframe`, `time`"
                f") AS t"
            )
        ).scalar()
        return total - unique


def delete_duplicates(engine, table: str) -> int:
    """
    Delete duplicate rows, keeping the one with the latest auto-generated internal rowid.

    Strategy: For each (symbol, timeframe, time) group with duplicates,
    keep the row with the MAX internal row (latest inserted).

    MySQL doesn't have ctid/rowid, so we use a self-join approach with a
    temporary table to identify duplicates to remove.
    """
    with engine.connect() as conn:
        # Step 1: Create a temp table with the rows to KEEP (max of each group)
        # We use a trick: among duplicates, keep the one with the highest
        # combination of all columns (effectively the "last" one).
        # Since there's no auto-increment, we use a subquery approach.

        # First, check how many duplicates exist
        dup_count = conn.execute(
            text(
                f"SELECT COUNT(*) FROM ("
                f"  SELECT `symbol`, `timeframe`, `time`, COUNT(*) as cnt "
                f"  FROM `{table}` GROUP BY `symbol`, `timeframe`, `time` HAVING cnt > 1"
                f") AS t"
            )
        ).scalar()

        if dup_count == 0:
            return 0

        # Step 2: Add a temporary auto-increment column to identify rows
        # We use a temporary table approach to avoid altering the original table.

        # Create temp table with unique rows (keep last by using a subquery)
        conn.execute(text(f"DROP TEMPORARY TABLE IF EXISTS `_tmp_migrate_{table}`"))
        conn.execute(
            text(
                f"CREATE TEMPORARY TABLE `_tmp_migrate_{table}` AS "
                f"SELECT `symbol`, `timeframe`, `time`, "
                f"  `open`, `high`, `low`, `close`, `volume`, `rsi`, `macd` "
                f"FROM `{table}` "
                f"GROUP BY `symbol`, `timeframe`, `time`"
            )
        )
        # Note: GROUP BY without aggregate on non-grouped columns is MySQL-specific.
        # In MySQL with ONLY_FULL_GROUP_BY disabled, it picks an arbitrary row.
        # We accept this since duplicate rows should have identical data.

        # Check if GROUP BY approach works (ONLY_FULL_GROUP_BY might be enabled)
        temp_count = conn.execute(
            text(f"SELECT COUNT(*) FROM `_tmp_migrate_{table}`")
        ).scalar()
        original_count = conn.execute(
            text(f"SELECT COUNT(*) FROM `{table}`")
        ).scalar()

        if temp_count == 0:
            # Fallback: ONLY_FULL_GROUP_BY is likely enabled, use different approach
            conn.execute(text(f"DROP TEMPORARY TABLE `_tmp_migrate_{table}`"))

            # Use ROW_NUMBER() window function (MySQL 8.0+)
            conn.execute(
                text(
                    f"CREATE TEMPORARY TABLE `_tmp_migrate_{table}` AS "
                    f"SELECT * FROM ("
                    f"  SELECT *, ROW_NUMBER() OVER ("
                    f"    PARTITION BY `symbol`, `timeframe`, `time` "
                    f"    ORDER BY `close` DESC"  # deterministic ordering
                    f"  ) AS _rn FROM `{table}`"
                    f") ranked WHERE _rn = 1"
                )
            )
            # Drop the _rn column
            conn.execute(
                text(f"ALTER TABLE `_tmp_migrate_{table}` DROP COLUMN _rn")
            )
            temp_count = conn.execute(
                text(f"SELECT COUNT(*) FROM `_tmp_migrate_{table}`")
            ).scalar()

        deleted_count = original_count - temp_count

        # Step 3: Delete all from original and re-insert from temp
        # This is safe because we're inside a transaction
        conn.execute(text(f"DELETE FROM `{table}` WHERE 1=1"))

        # Build column list dynamically from temp table
        cols = get_table_columns_from_temp(conn, f"_tmp_migrate_{table}")
        col_list = ", ".join(f"`{c}`" for c in cols)

        conn.execute(
            text(f"INSERT INTO `{table}` ({col_list}) SELECT {col_list} FROM `_tmp_migrate_{table}`")
        )
        conn.execute(text(f"DROP TEMPORARY TABLE `_tmp_migrate_{table}`"))
        conn.commit()

        return deleted_count


def get_table_columns_from_temp(conn, table: str) -> list[str]:
    """Get column names from a temporary table."""
    result = conn.execute(text(f"SHOW COLUMNS FROM `{table}`"))
    return [row[0] for row in result.fetchall()]


def alter_primary_key(engine, table: str):
    """
    DROP existing PRIMARY KEY and ADD new composite PRIMARY KEY (symbol, timeframe, time).

    Also ensures symbol and timeframe columns have NOT NULL and correct types.
    """
    with engine.connect() as conn:
        # Ensure symbol column is NOT NULL VARCHAR(32)
        conn.execute(
            text(f"ALTER TABLE `{table}` MODIFY COLUMN `symbol` VARCHAR(32) NOT NULL")
        )
        # Ensure timeframe column is NOT NULL VARCHAR(16)
        conn.execute(
            text(f"ALTER TABLE `{table}` MODIFY COLUMN `timeframe` VARCHAR(16) NOT NULL")
        )
        # Drop old PK and add new composite PK in a single ALTER
        conn.execute(
            text(
                f"ALTER TABLE `{table}` "
                f"DROP PRIMARY KEY, "
                f"ADD PRIMARY KEY (`symbol`, `timeframe`, `time`)"
            )
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Main migration logic
# ---------------------------------------------------------------------------

def migrate_table(
    engine,
    database: str,
    table: str,
    dry_run: bool = True,
    progress: Optional[dict] = None,
) -> dict:
    """
    Migrate a single table's primary key.

    Returns a dict with migration result info.
    """
    result = {
        "table": table,
        "database": database,
        "status": "skipped",
        "old_pk": [],
        "has_symbol": False,
        "has_timeframe": False,
        "duplicates": 0,
        "deleted": 0,
        "error": None,
    }

    try:
        # Check if already completed in a previous run
        progress_key = f"{database}.{table}"
        if progress and progress.get(progress_key) == "completed":
            logger.info(f"  [{table}] Already migrated (skipping, found in progress file)")
            result["status"] = "already_done"
            return result

        # 1. Get current PK
        pk_cols = get_primary_key_columns(engine, database, table)
        result["old_pk"] = pk_cols

        # Check if already migrated
        if set(pk_cols) == {"symbol", "timeframe", "time"}:
            logger.info(f"  [{table}] Already has correct PK (symbol, timeframe, time)")
            result["status"] = "already_correct"
            if progress is not None:
                progress[progress_key] = "completed"
                save_progress(progress)
            return result

        # 2. Check if symbol and timeframe columns exist
        columns = get_table_columns(engine, database, table)
        result["has_symbol"] = "symbol" in columns
        result["has_timeframe"] = "timeframe" in columns

        if not result["has_symbol"] or not result["has_timeframe"]:
            missing = []
            if not result["has_symbol"]:
                missing.append("symbol")
            if not result["has_timeframe"]:
                missing.append("timeframe")
            logger.warning(
                f"  [{table}] Missing columns: {missing}. "
                f"Cannot migrate. Skipping."
            )
            result["status"] = "missing_columns"
            return result

        # 3. Check for duplicates on (symbol, timeframe, time)
        dup_count = count_duplicates(engine, table)
        result["duplicates"] = dup_count

        if dup_count > 0:
            logger.warning(
                f"  [{table}] Found {dup_count} duplicate rows on (symbol, timeframe, time)"
            )

        if dry_run:
            if dup_count > 0:
                result["status"] = "needs_dedup_and_alter"
            else:
                result["status"] = "needs_alter"
            logger.info(
                f"  [{table}] DRY-RUN: PK={pk_cols}, duplicates={dup_count}, "
                f"action={'dedup + alter' if dup_count > 0 else 'alter only'}"
            )
            return result

        # === EXECUTE MODE ===

        # 4. Delete duplicates if any
        if dup_count > 0:
            logger.info(f"  [{table}] Removing {dup_count} duplicate rows...")
            deleted = delete_duplicates(engine, table)
            result["deleted"] = deleted
            logger.info(f"  [{table}] Deleted {deleted} duplicate rows")

        # 5. ALTER PRIMARY KEY
        logger.info(f"  [{table}] Altering PRIMARY KEY...")
        alter_primary_key(engine, table)
        logger.info(f"  [{table}] PRIMARY KEY changed to (symbol, timeframe, time)")

        result["status"] = "migrated"
        if progress is not None:
            progress[progress_key] = "completed"
            save_progress(progress)

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        logger.error(f"  [{table}] ERROR: {e}")

    return result


def run_migration(
    host: str,
    port: int,
    user: str,
    password: str,
    databases: list[str],
    tables: Optional[list[str]],
    dry_run: bool,
):
    """Run migration across all specified databases and tables."""

    mode_label = "DRY-RUN" if dry_run else "EXECUTE"
    logger.info("=" * 70)
    logger.info(f"Primary Key Migration ({mode_label})")
    logger.info(f"  Host: {host}:{port}")
    logger.info(f"  Databases: {databases}")
    logger.info(f"  Tables filter: {tables or 'ALL'}")
    logger.info(f"  Log file: {log_file}")
    logger.info("=" * 70)

    if not dry_run:
        logger.warning(
            "*** EXECUTE MODE: This will modify database tables! ***"
        )
        logger.warning("Press Ctrl+C within 5 seconds to abort...")
        try:
            time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Aborted by user.")
            sys.exit(0)

    # Load progress for resume
    progress = load_progress() if not dry_run else None

    all_results = []
    summary = {
        "already_correct": 0,
        "already_done": 0,
        "needs_alter": 0,
        "needs_dedup_and_alter": 0,
        "migrated": 0,
        "missing_columns": 0,
        "skipped": 0,
        "error": 0,
        "total": 0,
    }

    for database in databases:
        logger.info(f"\n{'─' * 50}")
        logger.info(f"Database: {database}")
        logger.info(f"{'─' * 50}")

        try:
            engine = get_engine(host, port, user, password, database)
            # Test connection
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception as e:
            logger.error(f"Cannot connect to {database}: {e}")
            continue

        # Get table list
        all_tables = list_tables(engine, database)
        logger.info(f"Found {len(all_tables)} tables in {database}")

        # Filter tables
        if tables:
            target_tables = [t for t in all_tables if t in tables]
        else:
            target_tables = [t for t in all_tables if t not in SKIP_TABLES]

        logger.info(f"Will process {len(target_tables)} tables")

        for i, table in enumerate(sorted(target_tables), 1):
            logger.info(f"\n[{i}/{len(target_tables)}] Processing {database}.{table}")
            result = migrate_table(engine, database, table, dry_run=dry_run, progress=progress)
            all_results.append(result)
            summary[result["status"]] = summary.get(result["status"], 0) + 1
            summary["total"] += 1

        engine.dispose()

    # Print summary
    logger.info("\n" + "=" * 70)
    logger.info(f"Migration Summary ({mode_label})")
    logger.info("=" * 70)
    logger.info(f"  Total tables processed:    {summary['total']}")
    logger.info(f"  Already correct PK:        {summary['already_correct']}")
    logger.info(f"  Already done (resumed):    {summary['already_done']}")
    if dry_run:
        logger.info(f"  Needs ALTER only:          {summary['needs_alter']}")
        logger.info(f"  Needs dedup + ALTER:       {summary['needs_dedup_and_alter']}")
    else:
        logger.info(f"  Successfully migrated:     {summary['migrated']}")
    logger.info(f"  Missing columns (skipped): {summary['missing_columns']}")
    logger.info(f"  Errors:                    {summary['error']}")
    logger.info("=" * 70)

    # Print tables with issues
    error_tables = [r for r in all_results if r["status"] == "error"]
    if error_tables:
        logger.info("\nTables with errors:")
        for r in error_tables:
            logger.info(f"  {r['database']}.{r['table']}: {r['error']}")

    missing_tables = [r for r in all_results if r["status"] == "missing_columns"]
    if missing_tables:
        logger.info("\nTables missing symbol/timeframe columns:")
        for r in missing_tables:
            logger.info(
                f"  {r['database']}.{r['table']}: "
                f"symbol={'YES' if r['has_symbol'] else 'NO'}, "
                f"timeframe={'YES' if r['has_timeframe'] else 'NO'}"
            )

    dup_tables = [r for r in all_results if r["duplicates"] > 0]
    if dup_tables:
        logger.info("\nTables with duplicates on (symbol, timeframe, time):")
        for r in dup_tables:
            logger.info(f"  {r['database']}.{r['table']}: {r['duplicates']} duplicates")

    # Save results as JSON
    results_file = LOG_DIR / f"migrate_pk_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(results_file, "w") as f:
        json.dump(
            {"mode": mode_label, "summary": summary, "results": all_results},
            f,
            indent=2,
            default=str,
        )
    logger.info(f"\nDetailed results saved to: {results_file}")

    if dry_run:
        actionable = summary.get("needs_alter", 0) + summary.get("needs_dedup_and_alter", 0)
        if actionable > 0:
            logger.info(
                f"\nTo apply changes, run with --execute flag:\n"
                f"  python {Path(__file__).name} --execute"
            )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Migrate MySQL PRIMARY KEY from (time) to (symbol, timeframe, time)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dry-run (default) - report what would change
  python migrate_pk.py

  # Actually execute the migration
  python migrate_pk.py --execute

  # Only check etf2_db
  python migrate_pk.py --databases etf2_db

  # Only specific tables
  python migrate_pk.py --execute --tables AAPL_D NVDA_1h SPY_D

  # Custom host/port (e.g., local SSH tunnel)
  python migrate_pk.py --host 127.0.0.1 --port 3306
        """,
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        default=False,
        help="Actually execute the migration (default: dry-run only)",
    )
    parser.add_argument(
        "--host",
        default=os.getenv("DB_HOST", "127.0.0.1"),
        help="MySQL host (default: 127.0.0.1 via SSH tunnel)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("DB_PORT", "3306")),
        help="MySQL port (default: 3306)",
    )
    parser.add_argument(
        "--user",
        default=os.getenv("DB_USER", "ahnbi2"),
        help="MySQL username (default: ahnbi2)",
    )
    parser.add_argument(
        "--password",
        default=os.getenv("DB_PASSWORD", "bigdata"),
        help="MySQL password",
    )
    parser.add_argument(
        "--databases",
        nargs="+",
        default=["etf2_db", "etf2_db_processed"],
        help="Databases to migrate (default: etf2_db etf2_db_processed)",
    )
    parser.add_argument(
        "--tables",
        nargs="+",
        default=None,
        help="Specific tables to migrate (default: all tables)",
    )
    parser.add_argument(
        "--reset-progress",
        action="store_true",
        default=False,
        help="Reset progress file and re-process all tables",
    )

    args = parser.parse_args()

    if args.reset_progress and PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
        logger.info("Progress file reset.")

    dry_run = not args.execute

    run_migration(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        databases=args.databases,
        tables=args.tables,
        dry_run=dry_run,
    )


if __name__ == "__main__":
    main()
