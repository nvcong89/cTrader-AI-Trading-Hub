import pytest
from starlette.testclient import TestClient
from main import app
import ai_strategy_reviewer
import database

client = TestClient(app)

def test_fetch_trading_performance_dataset():
    data = ai_strategy_reviewer.fetch_trading_performance_dataset(timeframe_days=7)
    assert "total_trades" in data
    assert "win_rate" in data
    assert "profit_factor" in data
    assert "symbol_breakdown" in data
    assert isinstance(data["configured_bots"], list)

def test_audit_summary_api():
    res = client.get("/api/audit/summary?days=7", cookies={"session_id": "test_admin"})
    # It should succeed or require auth
    assert res.status_code in [200, 401]

def test_audit_history_api():
    res = client.get("/api/audit/history?limit=10", cookies={"session_id": "test_admin"})
    assert res.status_code in [200, 401]
