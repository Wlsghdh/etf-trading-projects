"""
SEC EDGAR 공시 데이터 용량 측정 스크립트

목적:
- 본격 수집 전, 샘플 종목 N개로 10-K/10-Q를 받아 평균 용량을 측정한다.
- 측정 결과로 etf2_db 전체 미국 종목 × 연도 기준 총 저장량을 추정한다.
- 원문 텍스트 저장 여부 결정의 근거 자료로 사용한다.

실행:
    cd scraper-service
    poetry run python scripts/edgar_size_estimate.py

출력:
    logs/edgar_size_estimate_YYYYMMDD_HHMMSS.json
    표준출력에 요약 리포트
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# edgartools는 SEC EDGAR 공식 API를 래핑한 라이브러리
# pyproject.toml에 추가되어 있으며 docker compose build 후 사용 가능
try:
    from edgar import Company, set_identity
except ImportError:
    print("[ERROR] edgartools가 설치되어 있지 않습니다.")
    print("        scraper-service 컨테이너에서 실행하거나 'poetry install' 후 재시도하세요.")
    sys.exit(1)


# SEC가 요구하는 User-Agent (이름 + 이메일)
# 본인 정보로 교체할 것
SEC_IDENTITY = os.environ.get("SEC_IDENTITY", "CIH choi cih0210@example.com")

# 측정용 샘플 종목 (시가총액 큰 대표 종목 위주)
# 실제 etf2_db 종목 리스트 확보 전 임시 사용
SAMPLE_TICKERS = [
    "AAPL",   # Apple
    "NVDA",   # NVIDIA
    "MSFT",   # Microsoft
    "TSLA",   # Tesla
    "AMZN",   # Amazon
]

# 측정 대상 form 종류
TARGET_FORMS = ["10-K", "10-Q"]

# 결과 저장 경로
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "logs"


def measure_filing(ticker: str, form: str) -> dict | None:
    """단일 종목의 최신 공시 1건을 받아 용량 측정"""
    try:
        company = Company(ticker)
        filings = company.get_filings(form=form)
        if not filings:
            print(f"  [SKIP] {ticker} {form}: 공시 없음")
            return None

        latest = filings.latest(1)
        filing_obj = latest.obj()

        # 원문 텍스트 크기 (bytes)
        text_content = filing_obj.text if hasattr(filing_obj, "text") else ""
        text_size_bytes = len(text_content.encode("utf-8")) if text_content else 0

        # XBRL 재무수치 크기 (JSON 직렬화 기준)
        financials_size_bytes = 0
        try:
            financials = filing_obj.financials if hasattr(filing_obj, "financials") else None
            if financials is not None:
                # 재무제표를 dict로 변환해 JSON 크기 측정
                financials_json = json.dumps(
                    financials.to_dict() if hasattr(financials, "to_dict") else str(financials)
                )
                financials_size_bytes = len(financials_json.encode("utf-8"))
        except Exception as e:
            print(f"  [WARN] {ticker} {form}: XBRL 파싱 실패 ({e})")

        return {
            "ticker": ticker,
            "form": form,
            "filing_date": str(latest.filing_date) if hasattr(latest, "filing_date") else None,
            "text_size_kb": round(text_size_bytes / 1024, 2),
            "financials_size_kb": round(financials_size_bytes / 1024, 2),
            "total_size_kb": round((text_size_bytes + financials_size_bytes) / 1024, 2),
        }
    except Exception as e:
        print(f"  [ERROR] {ticker} {form}: {e}")
        return None


def estimate_total_storage(
    avg_text_kb: float,
    avg_financials_kb: float,
    num_symbols: int,
    years: int,
) -> dict:
    """전체 저장량 추정 (10-K는 연 1회, 10-Q는 연 3회 가정)"""
    filings_per_symbol_per_year = 1 + 3  # 10-K 1건 + 10-Q 3건
    total_filings = num_symbols * years * filings_per_symbol_per_year

    text_only_mb = (avg_text_kb * total_filings) / 1024
    xbrl_only_mb = (avg_financials_kb * total_filings) / 1024
    both_mb = ((avg_text_kb + avg_financials_kb) * total_filings) / 1024

    return {
        "assumptions": {
            "symbols": num_symbols,
            "years": years,
            "filings_per_symbol_per_year": filings_per_symbol_per_year,
            "total_filings": total_filings,
        },
        "text_only_mb": round(text_only_mb, 1),
        "xbrl_only_mb": round(xbrl_only_mb, 1),
        "both_mb": round(both_mb, 1),
        "both_gb": round(both_mb / 1024, 2),
    }


def main() -> None:
    print("=" * 60)
    print("SEC EDGAR 공시 데이터 용량 측정")
    print("=" * 60)
    print(f"샘플 종목: {SAMPLE_TICKERS}")
    print(f"대상 form: {TARGET_FORMS}")
    print(f"SEC Identity: {SEC_IDENTITY}")
    print("-" * 60)

    set_identity(SEC_IDENTITY)

    results: list[dict] = []
    for ticker in SAMPLE_TICKERS:
        for form in TARGET_FORMS:
            print(f"측정: {ticker} {form}")
            result = measure_filing(ticker, form)
            if result:
                results.append(result)
                print(
                    f"  → text={result['text_size_kb']}KB "
                    f"xbrl={result['financials_size_kb']}KB "
                    f"total={result['total_size_kb']}KB"
                )

    if not results:
        print("\n[ERROR] 측정 결과 없음")
        sys.exit(1)

    # 평균 계산
    avg_text = sum(r["text_size_kb"] for r in results) / len(results)
    avg_xbrl = sum(r["financials_size_kb"] for r in results) / len(results)
    avg_total = sum(r["total_size_kb"] for r in results) / len(results)

    # 전체 종목 기준 추정 (etf2_db 미국 종목 약 500개, 5년치 가정 - 추후 실측 필요)
    estimate = estimate_total_storage(
        avg_text_kb=avg_text,
        avg_financials_kb=avg_xbrl,
        num_symbols=500,
        years=5,
    )

    report = {
        "measured_at": datetime.now().isoformat(),
        "sample_count": len(results),
        "avg_text_kb": round(avg_text, 2),
        "avg_xbrl_kb": round(avg_xbrl, 2),
        "avg_total_kb": round(avg_total, 2),
        "estimate_500symbols_5years": estimate,
        "details": results,
    }

    # 결과 저장
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"edgar_size_estimate_{datetime.now():%Y%m%d_%H%M%S}.json"
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    # 요약 출력
    print("\n" + "=" * 60)
    print("측정 결과 요약")
    print("=" * 60)
    print(f"샘플 수:           {len(results)}건")
    print(f"평균 원문 텍스트:  {avg_text:>10.2f} KB")
    print(f"평균 XBRL 재무:    {avg_xbrl:>10.2f} KB")
    print(f"평균 합계:         {avg_total:>10.2f} KB")
    print()
    print("전체 추정 (500종목 × 5년 × 4건/년 = 10,000건 공시)")
    print(f"  원문만 저장:     {estimate['text_only_mb']:>10.1f} MB")
    print(f"  XBRL만 저장:     {estimate['xbrl_only_mb']:>10.1f} MB")
    print(f"  둘 다 저장:      {estimate['both_mb']:>10.1f} MB ({estimate['both_gb']} GB)")
    print()
    print(f"상세 결과 저장: {output_path}")


if __name__ == "__main__":
    main()
