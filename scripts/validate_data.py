#!/usr/bin/env python3
"""
Data validation script for ETF trading database.
Validates data quality across all stock tables in the MySQL database.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any
import pymysql
from pymysql.cursors import DictCursor

# scraper-service를 sys.path에 추가하여 config 모듈 접근
_SCRAPER_SERVICE_DIR = str(Path(__file__).resolve().parent.parent / "scraper-service")
if _SCRAPER_SERVICE_DIR not in sys.path:
    sys.path.insert(0, _SCRAPER_SERVICE_DIR)

from config.symbol_loader import STOCK_LIST

# Configuration
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'ahnbi2',
    'password': 'bigdata',
    'database': 'etf2_db',
    'cursorclass': DictCursor
}

# STOCK_LIST는 config/symbols.yaml에서 로드 (상단 import)

TIMEFRAMES = ["D", "1h"]  # Daily and 1-hour data

# Validation thresholds
MAX_NULL_RATIO = 0.05  # 5% maximum null values
MAX_PRICE_CHANGE_RATIO = 0.5  # 50% maximum single-day price change


class DataValidator:
    """Validates data quality for stock tables."""

    def __init__(self):
        self.connection = None
        self.validation_results = {
            'timestamp': datetime.now().isoformat(),
            'summary': {
                'total_tables': 0,
                'passed': 0,
                'failed': 0,
                'errors': 0
            },
            'tables': {},
            'failed_tables': []
        }

    def connect(self) -> bool:
        """Establish database connection."""
        try:
            self.connection = pymysql.connect(**DB_CONFIG)
            print(f"✓ Connected to database: {DB_CONFIG['database']}")
            return True
        except Exception as e:
            print(f"✗ Database connection failed: {e}")
            return False

    def close(self):
        """Close database connection."""
        if self.connection:
            self.connection.close()
            print("✓ Database connection closed")

    def validate_all_tables(self):
        """Validate all stock tables."""
        for symbol in STOCK_LIST:
            for timeframe in TIMEFRAMES:
                table_name = f"{symbol}_{timeframe}"
                self.validate_table(table_name)

        self._calculate_summary()

    def validate_table(self, table_name: str):
        """Validate a single table."""
        print(f"\nValidating {table_name}...")
        self.validation_results['summary']['total_tables'] += 1

        result = {
            'exists': False,
            'row_count': 0,
            'checks': {}
        }

        try:
            # Check if table exists
            if not self._table_exists(table_name):
                result['error'] = 'Table does not exist'
                self.validation_results['tables'][table_name] = result
                self.validation_results['summary']['errors'] += 1
                self.validation_results['failed_tables'].append(table_name)
                print(f"  ✗ Table does not exist")
                return

            result['exists'] = True

            # Get row count
            result['row_count'] = self._get_row_count(table_name)
            print(f"  Row count: {result['row_count']}")

            if result['row_count'] == 0:
                result['error'] = 'Table is empty'
                self.validation_results['tables'][table_name] = result
                self.validation_results['summary']['failed'] += 1
                self.validation_results['failed_tables'].append(table_name)
                print(f"  ✗ Table is empty")
                return

            # Run validation checks
            result['checks']['recent_data'] = self._check_recent_data(table_name)
            result['checks']['null_values'] = self._check_null_values(table_name)
            result['checks']['duplicates'] = self._check_duplicates(table_name)
            result['checks']['price_anomalies'] = self._check_price_anomalies(table_name)

            # Determine overall status
            all_passed = all(
                check.get('passed', False)
                for check in result['checks'].values()
            )

            if all_passed:
                result['status'] = 'PASSED'
                self.validation_results['summary']['passed'] += 1
                print(f"  ✓ All checks passed")
            else:
                result['status'] = 'FAILED'
                self.validation_results['summary']['failed'] += 1
                self.validation_results['failed_tables'].append(table_name)
                print(f"  ✗ Some checks failed")

            self.validation_results['tables'][table_name] = result

        except Exception as e:
            result['error'] = str(e)
            self.validation_results['tables'][table_name] = result
            self.validation_results['summary']['errors'] += 1
            self.validation_results['failed_tables'].append(table_name)
            print(f"  ✗ Error: {e}")

    def _table_exists(self, table_name: str) -> bool:
        """Check if table exists."""
        with self.connection.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM information_schema.tables
                WHERE table_schema = %s AND table_name = %s
            """, (DB_CONFIG['database'], table_name))
            result = cursor.fetchone()
            return result['count'] > 0

    def _get_row_count(self, table_name: str) -> int:
        """Get total row count for table."""
        with self.connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) as count FROM `{table_name}`")
            result = cursor.fetchone()
            return result['count']

    def _check_recent_data(self, table_name: str) -> Dict[str, Any]:
        """Check if table has data from today or yesterday."""
        with self.connection.cursor() as cursor:
            # Get the most recent date in the table
            cursor.execute(f"""
                SELECT MAX(time) as latest_date
                FROM `{table_name}`
            """)
            result = cursor.fetchone()
            latest_date = result['latest_date']

            if not latest_date:
                return {
                    'passed': False,
                    'message': 'No date data found',
                    'latest_date': None
                }

            # Convert to date if datetime
            if isinstance(latest_date, datetime):
                latest_date = latest_date.date()

            today = datetime.now().date()
            yesterday = today - timedelta(days=1)

            # For daily data, allow yesterday's data (markets may not be open today)
            # For hourly data, allow data from last 24 hours
            is_recent = latest_date >= yesterday

            return {
                'passed': is_recent,
                'message': 'Recent data available' if is_recent else 'Data is stale',
                'latest_date': str(latest_date),
                'days_old': (today - latest_date).days
            }

    def _check_null_values(self, table_name: str) -> Dict[str, Any]:
        """Check for NULL values in critical columns."""
        critical_columns = ['open', 'high', 'low', 'close', 'volume']

        with self.connection.cursor() as cursor:
            total_rows = self._get_row_count(table_name)
            null_counts = {}

            for column in critical_columns:
                cursor.execute(f"""
                    SELECT COUNT(*) as count
                    FROM `{table_name}`
                    WHERE `{column}` IS NULL
                """)
                result = cursor.fetchone()
                null_count = result['count']
                null_counts[column] = {
                    'count': null_count,
                    'ratio': null_count / total_rows if total_rows > 0 else 0
                }

            # Check if any column exceeds threshold
            max_null_ratio = max(info['ratio'] for info in null_counts.values())
            passed = max_null_ratio <= MAX_NULL_RATIO

            return {
                'passed': passed,
                'message': f'Max NULL ratio: {max_null_ratio:.2%}',
                'null_counts': null_counts,
                'threshold': MAX_NULL_RATIO
            }

    def _check_duplicates(self, table_name: str) -> Dict[str, Any]:
        """Check for duplicate entries (same timestamp)."""
        with self.connection.cursor() as cursor:
            cursor.execute(f"""
                SELECT time, COUNT(*) as count
                FROM `{table_name}`
                GROUP BY time
                HAVING count > 1
                LIMIT 10
            """)
            duplicates = cursor.fetchall()

            duplicate_count = len(duplicates)
            passed = duplicate_count == 0

            return {
                'passed': passed,
                'message': f'Found {duplicate_count} duplicate timestamps',
                'duplicate_count': duplicate_count,
                'examples': [str(d['time']) for d in duplicates[:5]] if duplicates else []
            }

    def _check_price_anomalies(self, table_name: str) -> Dict[str, Any]:
        """Check for price anomalies (zero, negative, extreme changes)."""
        with self.connection.cursor() as cursor:
            # Check for zero or negative prices
            cursor.execute(f"""
                SELECT COUNT(*) as count
                FROM `{table_name}`
                WHERE `close` <= 0 OR `open` <= 0 OR `high` <= 0 OR `low` <= 0
            """)
            invalid_prices = cursor.fetchone()['count']

            # Check for extreme price changes (>50% in one period)
            cursor.execute(f"""
                SELECT
                    time,
                    close,
                    LAG(close) OVER (ORDER BY time) as prev_close,
                    ABS((close - LAG(close) OVER (ORDER BY time)) / LAG(close) OVER (ORDER BY time)) as change_ratio
                FROM `{table_name}`
                ORDER BY time DESC
                LIMIT 1000
            """)
            rows = cursor.fetchall()

            extreme_changes = [
                {
                    'time': str(row['time']),
                    'change_ratio': float(row['change_ratio'])
                }
                for row in rows
                if row['change_ratio'] and row['change_ratio'] > MAX_PRICE_CHANGE_RATIO
            ]

            passed = invalid_prices == 0 and len(extreme_changes) == 0

            issues = []
            if invalid_prices > 0:
                issues.append(f'{invalid_prices} rows with invalid prices (<=0)')
            if extreme_changes:
                issues.append(f'{len(extreme_changes)} extreme price changes (>{MAX_PRICE_CHANGE_RATIO:.0%})')

            return {
                'passed': passed,
                'message': '; '.join(issues) if issues else 'No price anomalies detected',
                'invalid_prices': invalid_prices,
                'extreme_changes': len(extreme_changes),
                'examples': extreme_changes[:5]
            }

    def _calculate_summary(self):
        """Calculate summary statistics."""
        summary = self.validation_results['summary']
        total = summary['total_tables']

        if total > 0:
            summary['pass_rate'] = summary['passed'] / total
            summary['fail_rate'] = summary['failed'] / total
            summary['error_rate'] = summary['errors'] / total

    def print_summary(self):
        """Print validation summary."""
        summary = self.validation_results['summary']

        print("\n" + "="*60)
        print("VALIDATION SUMMARY")
        print("="*60)
        print(f"Total tables:  {summary['total_tables']}")
        print(f"Passed:        {summary['passed']} ({summary.get('pass_rate', 0):.1%})")
        print(f"Failed:        {summary['failed']} ({summary.get('fail_rate', 0):.1%})")
        print(f"Errors:        {summary['errors']} ({summary.get('error_rate', 0):.1%})")

        if self.validation_results['failed_tables']:
            print(f"\nFailed tables ({len(self.validation_results['failed_tables'])}):")
            for table in self.validation_results['failed_tables']:
                print(f"  - {table}")

        print("="*60)

    def save_results(self, output_file: str = None):
        """Save validation results to JSON file."""
        if not output_file:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_file = f"/home/ahnbi2/etf-trading-project/logs/validation_{timestamp}.json"

        with open(output_file, 'w') as f:
            json.dump(self.validation_results, f, indent=2, default=str)

        print(f"\n✓ Results saved to: {output_file}")
        return output_file


def main():
    """Main execution function."""
    print("="*60)
    print("ETF Trading Database Validation")
    print("="*60)

    validator = DataValidator()

    try:
        # Connect to database
        if not validator.connect():
            sys.exit(1)

        # Run validation
        validator.validate_all_tables()

        # Print summary
        validator.print_summary()

        # Save results
        validator.save_results()

        # Exit with appropriate code
        if validator.validation_results['summary']['failed'] > 0 or \
           validator.validation_results['summary']['errors'] > 0:
            sys.exit(1)
        else:
            sys.exit(0)

    except Exception as e:
        print(f"\n✗ Validation failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    finally:
        validator.close()


if __name__ == "__main__":
    main()
