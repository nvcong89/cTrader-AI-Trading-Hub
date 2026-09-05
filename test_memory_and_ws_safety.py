import pytest
from starlette.testclient import TestClient
from main import app, sanitize_trade_history_item, sanitize_log_item

client = TestClient(app)

def test_sanitize_trade_history_long_reason():
    huge_reason = "SMC Liquidity sweep detected at key resistance zone. " * 100 # >5000 chars
    raw_item = {
        "id": 999,
        "account_id": "1234567",
        "symbol": "XAUUSD",
        "volume": 0.05,
        "pnl": 125.50,
        "reason": huge_reason
    }
    
    sanitized = sanitize_trade_history_item(raw_item)
    assert sanitized["id"] == 999
    assert sanitized["account_id"] == "1234567"
    assert sanitized["volume"] == 0.05
    assert len(sanitized["reason"]) <= 1020
    assert sanitized["reason"].endswith("... [truncated]")

def test_sanitize_log_item_long_message():
    huge_msg = "Gemini AI LLM prompt debug analysis log entry " * 80 # >3000 chars
    raw_log = {
        "id": 1,
        "timestamp": "2026-09-02T03:00:00",
        "bot_id": "Bot_Judas",
        "level": "GEMINI_REASONING",
        "message": huge_msg
    }
    
    sanitized = sanitize_log_item(raw_log)
    assert sanitized["id"] == 1
    assert len(sanitized["message"]) <= 1520
    assert sanitized["message"].endswith("... [truncated]")

def test_dashboard_api_with_sanitization():
    res = client.get("/api/dashboard", cookies={"session_id": "test_admin"})
    assert res.status_code in [200, 401]
    if res.status_code == 200:
        data = res.json()
        assert "history" in data
        assert "logs" in data
        assert "pnl_by_account" in data
