import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.kis_client import KISClient, OrderResult, BalanceInfo, TR_IDS, BASE_URLS


class TestTrIdMapping:
    def test_paper_ids(self):
        assert TR_IDS["paper"]["buy"] == "VTTT1002U"
        assert TR_IDS["paper"]["sell"] == "VTTT1006U"
        assert TR_IDS["paper"]["balance"] == "VTTS3012R"

    def test_live_ids(self):
        assert TR_IDS["live"]["buy"] == "TTTT1002U"
        assert TR_IDS["live"]["sell"] == "TTTT1006U"
        assert TR_IDS["live"]["balance"] == "TTTS3012R"


class TestBaseUrls:
    def test_paper_url(self):
        assert "openapivts" in BASE_URLS["paper"]
        assert "29443" in BASE_URLS["paper"]

    def test_live_url(self):
        assert "openapi" in BASE_URLS["live"]
        assert "9443" in BASE_URLS["live"]


class TestOrderResult:
    def test_success(self):
        r = OrderResult(success=True, order_id="12345", price=50000, quantity=10)
        assert r.success is True
        assert r.order_id == "12345"

    def test_failure(self):
        r = OrderResult(success=False, message="잔고 부족")
        assert r.success is False
        assert "잔고" in r.message


class TestBalanceInfo:
    def test_defaults(self):
        b = BalanceInfo()
        assert b.total_evaluation == 0.0
        assert b.available_cash == 0.0
        assert b.holdings == []

    def test_with_values(self):
        b = BalanceInfo(
            total_evaluation=100_000_000,
            available_cash=50_000_000,
            holdings=[{"code": "069500", "quantity": 100}],
        )
        assert b.available_cash == 50_000_000
        assert len(b.holdings) == 1


class TestLiveConfirmation:
    @patch("app.services.kis_client.settings")
    def test_live_without_confirmation_raises(self, mock_settings):
        mock_settings.trading_mode = "live"
        mock_settings.kis_live_confirmation = False
        mock_settings.kis_app_key = "test"
        mock_settings.kis_app_secret = "test"

        with pytest.raises(ValueError, match="KIS_LIVE_CONFIRMATION"):
            KISClient()

    @patch("app.services.kis_client.settings")
    def test_live_with_confirmation_ok(self, mock_settings):
        mock_settings.trading_mode = "live"
        mock_settings.kis_live_confirmation = True
        mock_settings.kis_app_key = "test"
        mock_settings.kis_app_secret = "test"
        mock_settings.kis_account_number = "12345678-01"

        client = KISClient()
        assert client._mode == "live"
        assert client._base_url == BASE_URLS["live"]
