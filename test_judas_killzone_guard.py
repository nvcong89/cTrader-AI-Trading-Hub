"""
Unit tests for Asian Range Judas Sweep AI Bot Killzone Timing Guard & Session Rules
Validates that:
1. Outside Golden Killzones (Asian session accumulation / gap) with clean order book => immediate HOLD (LLM dispatch skipped).
2. Inside Golden Killzones (London Open / NY Overlap) => LLM entry evaluation dispatched.
3. Managing active positions outside Killzones => LLM evaluation allowed for ADJUST / risk protection.
4. format_new_entry_prompt incorporates Asian Range and Killzone session context.
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app, format_prompt, format_new_entry_prompt, MarketSnapshot

client = TestClient(app)

def create_judas_snapshot(has_position: bool = False, killzone: str = "Outside Killzones", bias: str = "MANAGE_ONLY"):
    return {
        "bot_id": "Asian Range Judas Sweep AI Bot_XAUUSD_M15_test",
        "request_id": "req_judas_test_001",
        "symbol": "XAUUSD",
        "timeframe": "M15",
        "ask": 2650.50,
        "bid": 2650.30,
        "spread_pips": 2.0,
        "pip_size": 0.01,
        "account_number": "1234567",
        "account_type": "demo",
        "account_label": "ICMarkets Demo",
        "account_balance": 10000.0,
        "account_equity": 10000.0,
        "bars": [
            {"time": "2026-09-04T03:00:00Z", "open": 2648.0, "high": 2652.0, "low": 2647.5, "close": 2650.0, "volume": 500},
            {"time": "2026-09-04T03:15:00Z", "open": 2650.0, "high": 2651.5, "low": 2649.0, "close": 2650.4, "volume": 600}
        ],
        "strategy": {
            "tema1": 2650.0,
            "tema2": 2649.0,
            "rsi": 52.0,
            "adx": 22.0,
            "atr": 3.5,
            "recent_high": 2655.0,
            "recent_low": 2645.0,
            "asian_high": 2654.50,
            "asian_low": 2646.00,
            "asian_range_pips": 85.0,
            "asian_range_daily_atr_percent": 28.5,
            "killzone_session": killzone,
            "bias_direction": bias,
            "traditional_signal": "NONE",
            "signal_window_bars": 999
        },
        "active_positions": [{
            "id": 101,
            "symbol": "XAUUSD",
            "trade_type": "BUY",
            "volume": 0.10,
            "entry_price": 2648.00,
            "sl": 2640.00,
            "tp": 2665.00,
            "entry_time": "2026-09-04 02:00:00"
        }] if has_position else []
    }

def test_outside_killzone_clean_orderbook_immediate_hold():
    """Verifies that outside Golden Killzones with 0 positions, /trade immediately returns HOLD without calling LLM."""
    payload = create_judas_snapshot(has_position=False, killzone="Outside Killzones", bias="MANAGE_ONLY")

    with patch("ai_engine.dispatch_ai_trade", new_callable=AsyncMock) as mock_dispatch:
        response = client.post("/trade", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["action"] == "HOLD"
        assert data["confidence"] == 100.0
        assert "Outside Golden Killzones" in data["reason"]
        assert data["bot_id"] == "Asian Range Judas Sweep AI Bot_XAUUSD_M15_test"
        assert data["symbol"] == "XAUUSD"

        # Crucial check: AI LLM dispatch was completely bypassed
        mock_dispatch.assert_not_called()

def test_inside_killzone_clean_orderbook_no_trigger_hold():
    """Verifies that inside Golden Killzone without Judas Sweep trigger and clean order book, /trade returns HOLD with clear message."""
    payload = create_judas_snapshot(has_position=False, killzone="New York Overlap Killzone", bias="NONE")

    with patch("ai_engine.dispatch_ai_trade", new_callable=AsyncMock) as mock_dispatch:
        response = client.post("/trade", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["action"] == "HOLD"
        assert data["confidence"] == 100.0
        assert "Inside Golden Killzone (New York Overlap Killzone): Waiting for Judas Sweep trigger" in data["reason"]
        mock_dispatch.assert_not_called()

def test_inside_killzone_clean_orderbook_dispatches_llm():
    """Verifies that inside London Open Killzone with entry bias, LLM is properly dispatched."""
    payload = create_judas_snapshot(has_position=False, killzone="London Open Killzone", bias="BUY")

    mock_decision = {
        "action": "BUY",
        "volume_lots": 0.01,
        "sl_pips": 150.0,
        "tp_pips": 300.0,
        "new_sl_price": 2635.0,
        "new_tp_price": 2680.0,
        "reason": "Judas sweep of Asian low confirmed during London Open Killzone.",
        "confidence": 88.0
    }

    with patch("ai_engine.dispatch_ai_trade", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = (mock_decision, '{"action":"BUY"}', 420.0)
        response = client.post("/trade", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["action"] == "BUY"
        assert data["confidence"] == 88.0
        mock_dispatch.assert_called_once()

def test_outside_killzone_with_active_position_manages_position():
    """Verifies that when positions exist outside Killzones, AI is dispatched in position management mode."""
    payload = create_judas_snapshot(has_position=True, killzone="Outside Killzones", bias="MANAGE_ONLY")

    mock_adjust = {
        "action": "ADJUST",
        "volume_lots": 0.01,
        "sl_pips": 100.0,
        "tp_pips": 300.0,
        "new_sl_price": 2649.0,
        "new_tp_price": 2670.0,
        "reason": "Trailing stop moved to protect profits outside Killzone.",
        "confidence": 90.0
    }

    with patch("ai_engine.dispatch_ai_trade", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = (mock_adjust, '{"action":"ADJUST"}', 350.0)
        response = client.post("/trade", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["action"] == "ADJUST"
        mock_dispatch.assert_called_once()

def test_prompt_contains_asian_range_context():
    """Verifies that format_new_entry_prompt includes Asian Range and Killzone session data."""
    payload = create_judas_snapshot(has_position=False, killzone="London Open Killzone", bias="BUY")
    snapshot = MarketSnapshot(**payload)
    prompt = format_new_entry_prompt(snapshot)

    assert "Killzone / Session: London Open Killzone" in prompt
    assert "Asian Session Range: High=2654.5, Low=2646.0 (85.0 pips | 28.5% Daily ATR)" in prompt
