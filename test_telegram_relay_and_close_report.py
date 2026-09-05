import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from main import app
from database import get_db

@pytest.fixture
def client():
    return TestClient(app)

def test_telegram_send_relay_endpoint(client):
    with patch("main.send_telegram_server_notification", new_callable=AsyncMock) as mock_send:
        # Test empty message
        res_empty = client.post("/api/telegram/send", json={"message": ""})
        assert res_empty.status_code == 200
        assert res_empty.json()["status"] == "ignored"
        mock_send.assert_not_called()

        # Test valid message relay
        res_valid = client.post("/api/telegram/send", json={"message": "🚀 <b>[Test Bot] Test Notification</b>"})
        assert res_valid.status_code == 200
        assert res_valid.json()["status"] == "success"
        mock_send.assert_called_once_with("🚀 <b>[Test Bot] Test Notification</b>")

def test_portfolio_report_close_with_rich_details_and_telegram(client):
    with patch("main.send_telegram_server_notification", new_callable=AsyncMock) as mock_send:
        # 1. Open a position first
        open_payload = {
            "ctrader_id": 999101,
            "bot_id": "test_judas_bot",
            "action": "open",
            "symbol": "XAUUSD",
            "side": "BUY",
            "volume": 0.05,
            "entry_price": 2750.00,
            "sl_price": 2740.00,
            "tp_price": 2770.00,
            "sl_pips": 100.0,
            "tp_pips": 200.0,
            "reason": "SMC Order Block Sweep",
            "account_number": "1234567",
            "account_type": "demo",
            "account_label": "Demo Alpha",
            "account_balance": 10000.0,
            "account_equity": 10000.0
        }
        res_open = client.post("/portfolio/report", json=open_payload)
        assert res_open.status_code == 200

        # Verify Telegram alert for open
        assert mock_send.call_count >= 1
        open_msg = mock_send.call_args[0][0]
        assert "Position Opened" in open_msg
        assert "XAUUSD" in open_msg
        assert "1234567" in open_msg

        mock_send.reset_mock()

        # 2. Close the position with TakeProfit reason, exit_price, and pips
        close_payload = {
            "ctrader_id": 999101,
            "bot_id": "test_judas_bot",
            "action": "close",
            "symbol": "XAUUSD",
            "side": "BUY",
            "volume": 0.05,
            "entry_price": 2750.00,
            "exit_price": 2770.00,
            "pnl": 100.0,
            "pips": 200.0,
            "reason": "TakeProfit",
            "account_number": "1234567",
            "account_type": "demo",
            "account_label": "Demo Alpha",
            "account_balance": 10100.0,
            "account_equity": 10100.0
        }
        res_close = client.post("/portfolio/report", json=close_payload)
        assert res_close.status_code == 200

        # Verify Telegram alert for close
        mock_send.assert_called_once()
        close_msg = mock_send.call_args[0][0]
        assert "Position Closed" in close_msg
        assert "TakeProfit" in close_msg
        assert "XAUUSD" in close_msg
        assert "1234567" in close_msg
        assert "+$100.00" in close_msg
        assert "+200.0 pips" in close_msg

        # 3. Verify history database record has the reason, exit_price, and pnl_pips saved
        conn = get_db()
        c = conn.cursor()
        c.execute("SELECT * FROM history WHERE ctrader_id=? ORDER BY id DESC LIMIT 1", (999101,))
        row = c.fetchone()
        assert row is not None
        assert row["reason"] == "TakeProfit"
        assert row["exit_price"] == 2770.00
        assert row["pnl"] == 100.0
        assert row["pnl_pips"] == 200.0
        conn.close()
