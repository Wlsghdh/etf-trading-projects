"""
KIS API 연결 테스트 스크립트
- 토큰 발급
- 잔고 조회
- 현재가 조회 (QQQ)
"""
import asyncio
import httpx
from dotenv import load_dotenv
import os

load_dotenv()

APP_KEY = os.getenv("KIS_APP_KEY", "")
APP_SECRET = os.getenv("KIS_APP_SECRET", "")
ACCOUNT = os.getenv("KIS_ACCOUNT_NUMBER", "")
BASE_URL = "https://openapivts.koreainvestment.com:29443"  # 모의투자


async def test_token():
    """1. OAuth 토큰 발급 테스트"""
    print("=" * 50)
    print("[1] 토큰 발급 테스트")
    print("=" * 50)

    url = f"{BASE_URL}/oauth2/tokenP"
    body = {
        "grant_type": "client_credentials",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=body)
        data = resp.json()

    if "access_token" in data:
        token = data["access_token"]
        print(f"  SUCCESS: 토큰 발급 완료")
        print(f"  토큰 앞 20자: {token[:20]}...")
        return token
    else:
        print(f"  FAILED: {data}")
        return None


async def test_balance(token: str):
    """2. 해외주식 잔고 조회 테스트"""
    print()
    print("=" * 50)
    print("[2] 해외주식 잔고 조회 테스트")
    print("=" * 50)

    account_parts = ACCOUNT.split("-")
    if len(account_parts) != 2:
        print(f"  ERROR: 계좌번호 형식 오류: {ACCOUNT} (XXXXXXXX-XX 필요)")
        return

    url = f"{BASE_URL}/uapi/overseas-stock/v1/trading/inquire-balance"
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
        "tr_id": "VTTS3012R",
    }
    params = {
        "CANO": account_parts[0],
        "ACNT_PRDT_CD": account_parts[1],
        "OVRS_EXCG_CD": "NASD",
        "TR_CRCY_CD": "USD",
        "CTX_AREA_FK200": "",
        "CTX_AREA_NK200": "",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=headers, params=params)
        data = resp.json()

    rt_cd = data.get("rt_cd")
    msg = data.get("msg1", "")

    if rt_cd == "0":
        output2 = data.get("output2", {})
        holdings = data.get("output1", [])
        avail = output2.get("ovrs_ord_psbl_amt", "0")
        print(f"  SUCCESS: 잔고 조회 완료")
        print(f"  주문 가능 금액(USD): ${float(avail):,.2f}")
        print(f"  보유 종목 수: {len(holdings)}")
        for h in holdings:
            qty = h.get("ovrs_cblc_qty", "0")
            if float(qty) > 0:
                print(f"    - {h.get('ovrs_pdno')}: {qty}주 @ ${h.get('now_pric2', '?')}")
    else:
        print(f"  FAILED (rt_cd={rt_cd}): {msg}")
        if "CANO" in msg or "계좌" in msg:
            print(f"  -> 계좌번호를 확인하세요: {ACCOUNT}")


async def test_current_price(token: str, ticker: str = "QQQ"):
    """3. 해외주식 현재가 조회 테스트"""
    print()
    print("=" * 50)
    print(f"[3] 현재가 조회 테스트 ({ticker})")
    print("=" * 50)

    url = f"{BASE_URL}/uapi/overseas-price/v1/quotations/price"
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
        "tr_id": "HHDFS76200200",
    }
    params = {
        "AUTH": "",
        "EXCD": "NAS",
        "SYMB": ticker,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=headers, params=params)
        data = resp.json()

    rt_cd = data.get("rt_cd")
    msg = data.get("msg1", "")

    if rt_cd == "0":
        output = data.get("output", {})
        last = output.get("last", "0")
        name = output.get("rsym", ticker)
        high = output.get("high", "0")
        low = output.get("low", "0")
        volume = output.get("tvol", "0")
        print(f"  SUCCESS: {name}")
        print(f"  현재가: ${float(last):,.2f}")
        print(f"  고가/저가: ${float(high):,.2f} / ${float(low):,.2f}")
        print(f"  거래량: {volume}")
    else:
        print(f"  FAILED (rt_cd={rt_cd}): {msg}")


async def main():
    print(f"KIS API 연결 테스트 (모의투자)")
    print(f"APP_KEY: {APP_KEY[:10]}..." if APP_KEY else "APP_KEY: 미설정!")
    print(f"계좌번호: {ACCOUNT}")
    print()

    if not APP_KEY or not APP_SECRET:
        print("ERROR: .env에 KIS_APP_KEY, KIS_APP_SECRET을 설정하세요.")
        return

    # 1. 토큰
    token = await test_token()
    if not token:
        print("\n토큰 발급 실패 — 이후 테스트 중단")
        return

    # 2. 잔고
    await test_balance(token)

    # 3. 현재가
    await test_current_price(token, "QQQ")

    print()
    print("=" * 50)
    print("테스트 완료!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
