import logging
from typing import Optional

import httpx

from app.config import settings
from app.schemas import RankingItem, RankingResponse

logger = logging.getLogger(__name__)


class RankingClient:
    """ml-service 랭킹 API 호출 클라이언트"""

    def __init__(self):
        self._base_url = settings.ml_service_url

    async def get_daily_ranking(self, top_n: Optional[int] = None) -> list[RankingItem]:
        """
        ml-service에서 당일 랭킹 상위 N개 ETF 조회.
        POST /api/predictions/ranking 호출.
        """
        if top_n is None:
            top_n = settings.top_n_etfs

        url = f"{self._base_url}/api/predictions/ranking"

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(url, json={"limit": top_n})
                    resp.raise_for_status()
                    data = resp.json()

                ranking_resp = RankingResponse(**data)
                # 상위 N개만 추출 (이미 rank 순 정렬됨)
                top_rankings = ranking_resp.rankings[:top_n]
                logger.info(
                    f"랭킹 조회 성공: {len(top_rankings)}개 종목 "
                    f"(모델: {ranking_resp.model_name})"
                )
                return top_rankings

            except httpx.HTTPError as e:
                logger.warning(
                    f"ml-service 호출 실패 (시도 {attempt + 1}/3): {e}"
                )
                if attempt < 2:
                    import asyncio
                    await asyncio.sleep(10)
            except Exception as e:
                logger.error(f"랭킹 파싱 오류: {e}")
                if attempt < 2:
                    import asyncio
                    await asyncio.sleep(10)

        logger.error("ml-service 랭킹 조회 3회 실패 — 당일 매매 중단")
        return []


# 싱글턴
_ranking_client: Optional[RankingClient] = None


def get_ranking_client() -> RankingClient:
    global _ranking_client
    if _ranking_client is None:
        _ranking_client = RankingClient()
    return _ranking_client
