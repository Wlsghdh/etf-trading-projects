"""DB Viewer API - 데이터베이스 테이블 목록 및 데이터 조회"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_remote_db, get_processed_db
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/tables")
def get_tables(
    db_name: str = Query("etf2_db", enum=["etf2_db", "etf2_db_processed"]),
    remote_db: Session = Depends(get_remote_db),
    processed_db: Session = Depends(get_processed_db),
):
    """DB 테이블 목록 및 메타 정보 조회"""
    db = remote_db if db_name == "etf2_db" else processed_db

    try:
        # 모든 테이블 목록
        result = db.execute(text("SHOW TABLES"))
        table_names = [row[0] for row in result]

        tables = []
        for name in table_names:
            try:
                # 행 수
                count_result = db.execute(text(f"SELECT COUNT(*) FROM `{name}`"))
                row_count = count_result.scalar()

                # 최신/최초 날짜
                date_result = db.execute(
                    text(f"SELECT MIN(time), MAX(time) FROM `{name}`")
                )
                row = date_result.fetchone()
                oldest = str(row[0]) if row and row[0] else None
                latest = str(row[1]) if row and row[1] else None

                # 심볼/타임프레임 파싱
                parts = name.rsplit("_", 1)
                if len(parts) == 2:
                    symbol, timeframe = parts
                else:
                    symbol, timeframe = name, ""

                # 최신 여부 (5일 이내 - 주말 고려)
                is_up_to_date = False
                if latest:
                    check = db.execute(
                        text(f"SELECT MAX(time) >= DATE_SUB(NOW(), INTERVAL 5 DAY) FROM `{name}`")
                    )
                    is_up_to_date = bool(check.scalar())

                tables.append({
                    "tableName": name,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "rowCount": row_count,
                    "latestDate": latest,
                    "oldestDate": oldest,
                    "isUpToDate": is_up_to_date,
                })
            except Exception as e:
                logger.warning(f"Error reading table {name}: {e}")
                tables.append({
                    "tableName": name,
                    "symbol": name,
                    "timeframe": "",
                    "rowCount": 0,
                    "latestDate": None,
                    "oldestDate": None,
                    "isUpToDate": False,
                })

        up_to_date = sum(1 for t in tables if t["isUpToDate"])
        total_rows = sum(t["rowCount"] for t in tables)

        return {
            "database": db_name,
            "totalTables": len(tables),
            "totalRows": total_rows,
            "upToDateTables": up_to_date,
            "staleTables": len(tables) - up_to_date,
            "lastChecked": None,
            "tables": tables,
        }
    except Exception as e:
        logger.error(f"Failed to list tables: {e}")
        return {"error": str(e), "tables": []}


@router.get("/tables/{table_name}/data")
def get_table_data(
    table_name: str,
    db_name: str = Query("etf2_db", enum=["etf2_db", "etf2_db_processed"]),
    limit: int = Query(50, le=500),
    offset: int = Query(0),
    remote_db: Session = Depends(get_remote_db),
    processed_db: Session = Depends(get_processed_db),
):
    """테이블 데이터 조회 (최신순)"""
    db = remote_db if db_name == "etf2_db" else processed_db

    try:
        # 컬럼 정보
        cols_result = db.execute(text(f"DESCRIBE `{table_name}`"))
        columns = [{"name": row[0], "type": row[1]} for row in cols_result]

        # 데이터 (최신순)
        data_result = db.execute(
            text(f"SELECT * FROM `{table_name}` ORDER BY time DESC LIMIT :limit OFFSET :offset"),
            {"limit": limit, "offset": offset},
        )
        col_names = data_result.keys()
        rows = [dict(zip(col_names, [str(v) if v is not None else None for v in row])) for row in data_result]

        # 총 행 수
        count_result = db.execute(text(f"SELECT COUNT(*) FROM `{table_name}`"))
        total = count_result.scalar()

        return {
            "tableName": table_name,
            "database": db_name,
            "columns": columns,
            "rows": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        logger.error(f"Failed to read table {table_name}: {e}")
        return {"error": str(e), "rows": []}
