"""
SEC EDGAR 파싱 결과 검증 스크립트

목적:
- edgartools 로 받은 데이터가 실제 공개값과 일치하는지 확인.
- 텍스트는 표준 섹션 존재 여부 + 앞부분 출력으로 검증.
- 재무수치는 헤드라인 숫자(매출/순이익/총자산)를 출력해 공개 자료와 대조.

검증 방법:
- AAPL FY2024 매출 = $391.0B (애플 공식 발표)
- AAPL FY2025 매출 = 본 스크립트 출력값과 애플 IR 발표 비교

실행:
    python scraper-service/scripts/edgar_verify_parsing.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    from edgar import Company, set_identity
except ImportError:
    print("[ERROR] edgartools 미설치")
    sys.exit(1)

SEC_IDENTITY = os.environ.get("SEC_IDENTITY", "CIH choi cih0210@example.com")

EXPECTED_10K_SECTIONS = [
    r"Item\s+1\.\s+Business",
    r"Item\s+1A\.\s+Risk\s+Factors",
    r"Management.s\s+Discussion\s+and\s+Analysis",
    r"Financial\s+Statements",
]


def verify_text(ticker: str, form: str = "10-K") -> dict:
    """텍스트 파싱 검증 — 섹션 존재 + 앞부분 출력"""
    print(f"\n{'='*60}")
    print(f"[텍스트 검증] {ticker} {form}")
    print('='*60)

    filing = Company(ticker).get_filings(form=form, amendments=False).latest()
    print(f"  Filing date: {filing.filing_date}")
    print(f"  Accession:   {filing.accession_no}")

    text = filing.text()
    text_size_kb = len(text.encode("utf-8")) / 1024
    print(f"  Text size:   {text_size_kb:.2f} KB  ({len(text):,} chars, {len(text.split()):,} words)")

    print(f"\n  --- 텍스트 앞부분 300자 ---")
    print(f"  {text[:300]!r}")

    print(f"\n  --- 10-K 표준 섹션 검사 ---")
    section_results = {}
    if form == "10-K":
        for pattern in EXPECTED_10K_SECTIONS:
            found = bool(re.search(pattern, text, re.IGNORECASE))
            mark = "OK" if found else "MISSING"
            print(f"  [{mark}] {pattern}")
            section_results[pattern] = found

    return {
        "filing_date": str(filing.filing_date),
        "text_size_kb": round(text_size_kb, 2),
        "char_count": len(text),
        "word_count": len(text.split()),
        "sections_found": section_results,
    }


def verify_financials_values(ticker: str) -> dict:
    """헤드라인 재무수치 출력 — 공개 자료와 대조용"""
    print(f"\n{'='*60}")
    print(f"[재무수치 검증] {ticker} - 공개값과 대조하세요")
    print('='*60)

    company = Company(ticker)
    financials = company.get_financials()

    result = {"ticker": ticker}

    # 빠른 헬퍼 메서드들
    print("\n  --- 헤드라인 숫자 (최신 회계연도) ---")
    for label, getter in [
        ("매출 (Revenue)", "get_revenue"),
        ("순이익 (Net Income)", "get_net_income"),
        ("총자산 (Total Assets)", "get_total_assets"),
    ]:
        try:
            if hasattr(financials, getter):
                value = getattr(financials, getter)()
                print(f"  {label:30s}: {value}")
                result[getter] = str(value)
            else:
                print(f"  {label:30s}: (메서드 없음: {getter})")
        except Exception as e:
            print(f"  {label:30s}: 실패 ({e})")
            result[getter] = f"error: {e}"

    # 손익계산서 전체 (직접 비교용)
    print("\n  --- Income Statement (3년치) ---")
    try:
        income = financials.income_statement()
        df = income.to_dataframe() if hasattr(income, "to_dataframe") else None
        if df is not None:
            print(df.head(15).to_string())
            result["income_statement_shape"] = list(df.shape)
            result["income_statement_columns"] = list(df.columns)
        else:
            print(f"  {income}")
    except Exception as e:
        print(f"  income_statement() 실패: {e}")

    # 대차대조표 일부
    print("\n  --- Balance Sheet 상위 10행 ---")
    try:
        bs = financials.balance_sheet()
        df = bs.to_dataframe() if hasattr(bs, "to_dataframe") else None
        if df is not None:
            print(df.head(10).to_string())
        else:
            print(f"  {bs}")
    except Exception as e:
        print(f"  balance_sheet() 실패: {e}")

    return result


def main():
    set_identity(SEC_IDENTITY)
    print(f"SEC Identity: {SEC_IDENTITY}")
    print(f"\n*** 검증 방법 ***")
    print(f"아래 출력된 재무수치를 Apple 공식 IR 자료, 야후파이낸스, 또는")
    print(f"Apple 10-K 원본 PDF(SEC.gov)와 비교해서 일치하는지 확인하세요.")
    print(f"참고: AAPL FY2024 매출 = $391.0B (공식 발표)")
    print(f"      AAPL FY2025 회계연도는 2025-09-27 종료\n")

    results = {}

    # 1. 텍스트 검증
    results["aapl_text"] = verify_text("AAPL", "10-K")

    # 2. 헤드라인 재무수치 — 공개값과 대조용
    results["aapl_financials"] = verify_financials_values("AAPL")

    # 결과 저장
    out_dir = Path(__file__).resolve().parent.parent / "logs"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"edgar_verify_{datetime.now():%Y%m%d_%H%M%S}.json"
    out_path.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")

    print(f"\n\n검증 결과 저장: {out_path}")
    print(f"\n출력된 매출/순이익/총자산이 공개 자료와 일치하면 → 파싱 정상")
    print(f"불일치하면 → 파싱 또는 데이터 매핑 문제 (디버깅 필요)")


if __name__ == "__main__":
    main()
