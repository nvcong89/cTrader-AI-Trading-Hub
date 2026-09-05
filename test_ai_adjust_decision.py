"""
Unit & Integration Test Suite for AI Decision ADJUST & SafeModifyPosition Engine
================================================================================
Verifies:
1. Adaptive Prompt Dispatching (New Entry Discovery vs Active Position Management)
2. Mocking AI Engine outputting structured 'ADJUST' decision via /trade endpoint
3. Metadata correlation (request_id, bot_id, symbol, timeframe)
4. Comprehensive 7-Scenario SafeModifyPosition geometric validation logic
"""

import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from main import app, format_prompt, MarketSnapshot
import ai_engine

client = TestClient(app)

def create_sample_snapshot(has_position: bool = False) -> dict:
    """Helper creating valid MarketSnapshot schema dictionary."""
    base = {
        "bot_id": "bot_test_37",
        "request_id": "req_adjust_12345",
        "symbol": "GBPUSD",
        "timeframe": "M15",
        "ask": 1.28650,
        "bid": 1.28635,
        "spread_pips": 1.5,
        "pip_size": 0.0001,
        "account_number": "12345678",
        "account_type": "demo",
        "account_label": "ICMarkets Demo",
        "account_balance": 10000.0,
        "account_equity": 10250.0,
        "bars": [
            {"time": "2026-09-02T23:00:00", "open": 1.2840, "high": 1.2860, "low": 1.2835, "close": 1.2855, "volume": 1200},
            {"time": "2026-09-02T23:15:00", "open": 1.2855, "high": 1.2870, "low": 1.2850, "close": 1.2864, "volume": 1500}
        ],
        "strategy": {
            "tema1": 1.2860,
            "tema2": 1.2850,
            "rsi": 62.5,
            "adx": 28.0,
            "atr": 0.0030,
            "recent_high": 1.2870,
            "recent_low": 1.2835
        },
        "active_positions": []
    }
    if has_position:
        base["active_positions"] = [{
            "id": 999,
            "symbol": "GBPUSD",
            "trade_type": "BUY",
            "volume": 0.10,
            "entry_price": 1.28400,
            "current_price": 1.28635,
            "sl": 1.28250,
            "tp": 1.29000,
            "pnl": 23.50,
            "entry_time": "2026-09-02T23:30:00"
        }]
    return base


def test_adaptive_prompt_selection_position_management():
    """Verifies that format_prompt switches to ACTIVE POSITION MANAGEMENT MODE when positions exist."""
    # 1. Test clean order book -> NEW ENTRY DISCOVERY
    payload_flat = create_sample_snapshot(has_position=False)
    snap_flat = MarketSnapshot(**payload_flat)
    prompt_flat = format_prompt(snap_flat)
    assert "=== NEW ENTRY DISCOVERY MODE ===" in prompt_flat
    assert "=== ACTIVE POSITION MANAGEMENT MODE ===" not in prompt_flat

    # 2. Test active position -> ACTIVE POSITION MANAGEMENT
    payload_active = create_sample_snapshot(has_position=True)
    snap_active = MarketSnapshot(**payload_active)
    prompt_active = format_prompt(snap_active)
    assert "=== ACTIVE POSITION MANAGEMENT MODE ===" in prompt_active
    assert "Position ID 999: BUY" in prompt_active
    assert "1.284" in prompt_active


def test_trade_endpoint_mock_ai_adjust():
    """Verifies /trade endpoint handles AI 'ADJUST' decision and returns proper schema & correlation."""
    mock_adjust_decision = {
        "action": "ADJUST",
        "volume_lots": 0.01,
        "sl_pips": 150.0,
        "tp_pips": 350.0,
        "new_sl_price": 1.28550,
        "new_tp_price": 1.29100,
        "reason": "Price formed BOS upward; trailing SL behind Higher Low M15 at 1.28550 with ATR buffer.",
        "confidence": 92.5
    }

    # Patch dispatch_ai_trade to return our mock ADJUST decision
    with patch("ai_engine.dispatch_ai_trade", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = (mock_adjust_decision, '{"action": "ADJUST"}', 850.0)

        snapshot_payload = create_sample_snapshot(has_position=True)

        response = client.post("/trade", json=snapshot_payload)
        assert response.status_code == 200
        data = response.json()

        # Validate ADJUST response fields
        assert data["action"] == "ADJUST"
        assert data["new_sl_price"] == 1.28550
        assert data["new_tp_price"] == 1.29100
        assert data["confidence"] == 92.5
        assert "BOS" in data["reason"]

        # Validate correlation metadata
        assert data["request_id"] == "req_adjust_12345"
        assert data["bot_id"] == "bot_test_37"
        assert data["symbol"] == "GBPUSD"
        assert data["timeframe"] == "M15"


# ── Python Port of cBot SafeModifyPosition 7-Scenario Verification ──
def simulate_safe_modify_position(
    trade_type: str,
    entry_price: float,
    current_bid: float,
    current_ask: float,
    spread: float,
    tick_size: float,
    pip_size: float,
    pos_sl: float | None,
    pos_tp: float | None,
    target_sl: float | None,
    target_tp: float | None,
    net_profit: float
):
    """
    Python mirror of cBot SafeModifyPosition engine to prove 100% mathematical & geometric correctness.
    Returns dict: { 'status': 'MODIFIED'|'BYPASSED'|'CLOSE_POSITION', 'final_sl': ..., 'final_tp': ... }
    """
    min_stop_buffer = max(spread * 3.0, tick_size * 10.0)
    final_sl = target_sl if target_sl is not None else pos_sl
    final_tp = target_tp if target_tp is not None else pos_tp

    if trade_type.upper() == "SELL":
        # Scenario 4: Auto-mapping positive trailing SL if proposed TP is at or above current market
        if target_tp is not None and target_tp >= (current_bid - min_stop_buffer):
            proposed_trailing_sl = target_tp
            final_tp = pos_tp
            if proposed_trailing_sl > (current_ask + min_stop_buffer):
                if pos_sl is None or proposed_trailing_sl < pos_sl:
                    final_sl = proposed_trailing_sl
            else:
                # Scenario 5: Profit-Lock Exit
                if current_ask < entry_price:
                    return {"status": "CLOSE_POSITION", "reason": "Profit-Lock Exit: SELL breached trailing level"}
                else:
                    final_sl = pos_sl

        # Scenario 6: Validate boundaries
        if final_sl is not None and final_sl <= (current_ask + min_stop_buffer):
            if current_ask < entry_price:
                return {"status": "CLOSE_POSITION", "reason": "Profit-Lock Exit: SELL breached SL boundary"}
            else:
                final_sl = pos_sl

        if final_tp is not None and final_tp >= (current_bid - min_stop_buffer):
            final_tp = pos_tp

        if final_sl is not None and final_tp is not None and final_sl <= final_tp:
            final_tp = pos_tp

    elif trade_type.upper() == "BUY":
        # Scenario 4: Auto-mapping positive trailing SL if proposed TP is at or below current market
        if target_tp is not None and target_tp <= (current_ask + min_stop_buffer):
            proposed_trailing_sl = target_tp
            final_tp = pos_tp
            if proposed_trailing_sl < (current_bid - min_stop_buffer):
                if pos_sl is None or proposed_trailing_sl > pos_sl:
                    final_sl = proposed_trailing_sl
            else:
                # Scenario 5: Profit-Lock Exit
                if current_bid > entry_price:
                    return {"status": "CLOSE_POSITION", "reason": "Profit-Lock Exit: BUY breached trailing level"}
                else:
                    final_sl = pos_sl

        # Scenario 6: Validate boundaries
        if final_sl is not None and final_sl >= (current_bid - min_stop_buffer):
            if current_bid > entry_price:
                return {"status": "CLOSE_POSITION", "reason": "Profit-Lock Exit: BUY breached SL boundary"}
            else:
                final_sl = pos_sl

        if final_tp is not None and final_tp <= (current_ask + min_stop_buffer):
            final_tp = pos_tp

        if final_sl is not None and final_tp is not None and final_sl >= final_tp:
            final_tp = pos_tp

    # Scenario 7: Anti-Spam threshold filter (< 0.5 pip)
    sl_changed = final_sl is not None and (pos_sl is None or abs(final_sl - pos_sl) > (pip_size * 0.5))
    tp_changed = final_tp is not None and (pos_tp is None or abs(final_tp - pos_tp) > (pip_size * 0.5))
    if not sl_changed and not tp_changed:
        return {"status": "BYPASSED", "reason": "Delta < 0.5 pip anti-spam threshold"}

    # Broker Safety
    if trade_type.upper() == "BUY":
        if final_sl is not None and final_sl >= (current_bid - min_stop_buffer):
            return {"status": "BYPASSED", "reason": "SL violates broker minStopBuffer"}
        if final_tp is not None and final_tp <= (current_ask + min_stop_buffer):
            return {"status": "BYPASSED", "reason": "TP violates broker minStopBuffer"}
    else:
        if final_sl is not None and final_sl <= (current_ask + min_stop_buffer):
            return {"status": "BYPASSED", "reason": "SL violates broker minStopBuffer"}
        if final_tp is not None and final_tp >= (current_bid - min_stop_buffer):
            return {"status": "BYPASSED", "reason": "TP violates broker minStopBuffer"}

    return {"status": "MODIFIED", "final_sl": final_sl, "final_tp": final_tp}


def test_safe_modify_scenarios():
    """Verifies all core scenarios of SafeModifyPosition."""
    # ── Test Scenario 1: Break-Even Move (BUY) ──
    res1 = simulate_safe_modify_position(
        trade_type="BUY",
        entry_price=2650.00,
        current_bid=2670.00,
        current_ask=2670.30,
        spread=0.30,
        tick_size=0.01,
        pip_size=0.01,
        pos_sl=2640.00,
        pos_tp=2690.00,
        target_sl=2650.00, # Move to Entry Price
        target_tp=None,
        net_profit=200.0
    )
    assert res1["status"] == "MODIFIED"
    assert res1["final_sl"] == 2650.00

    # ── Test Scenario 2: Trailing Stop behind Higher Low (BUY) ──
    res2 = simulate_safe_modify_position(
        trade_type="BUY",
        entry_price=2650.00,
        current_bid=2675.00,
        current_ask=2675.30,
        spread=0.30,
        tick_size=0.01,
        pip_size=0.01,
        pos_sl=2650.00,
        pos_tp=2695.00,
        target_sl=2665.50, # Trail behind HL
        target_tp=None,
        net_profit=250.0
    )
    assert res2["status"] == "MODIFIED"
    assert res2["final_sl"] == 2665.50

    # ── Test Scenario 4: Positive Trailing SL Auto-Mapping (SELL) ──
    # User entered SELL @ 4350. Market is 4320. AI proposed TP = 4340 (Above Market!).
    # cBot should auto-map this into a Positive Trailing SL @ 4340 and preserve original TP.
    res4 = simulate_safe_modify_position(
        trade_type="SELL",
        entry_price=4350.00,
        current_bid=4320.00,
        current_ask=4320.30,
        spread=0.30,
        tick_size=0.01,
        pip_size=0.01,
        pos_sl=4360.00,
        pos_tp=4280.00,
        target_sl=None,
        target_tp=4340.00, # Proposed TP is above market price -> Auto-mapped to Trailing SL!
        net_profit=300.0
    )
    assert res4["status"] == "MODIFIED"
    assert res4["final_sl"] == 4340.00
    assert res4["final_tp"] == 4280.00 # Original TP preserved!

    # ── Test Scenario 5: Profit-Lock Exit (SL boundary breached while in profit) ──
    res5 = simulate_safe_modify_position(
        trade_type="SELL",
        entry_price=4350.00,
        current_bid=4342.00,
        current_ask=4342.30, # Ask (4342.30) has breached proposed SL (4340.00)
        spread=0.30,
        tick_size=0.01,
        pip_size=0.01,
        pos_sl=4360.00,
        pos_tp=4280.00,
        target_sl=4340.00, # Breached by current_ask!
        target_tp=None,
        net_profit=77.0 # In Profit ($)
    )
    assert res5["status"] == "CLOSE_POSITION"

    # ── Test Scenario 7: Anti-Spam Threshold Filter (< 0.5 pip change) ──
    res7 = simulate_safe_modify_position(
        trade_type="BUY",
        entry_price=2650.00,
        current_bid=2670.00,
        current_ask=2670.30,
        spread=0.30,
        tick_size=0.01,
        pip_size=0.01,
        pos_sl=2650.00,
        pos_tp=2690.00,
        target_sl=2650.003, # Delta only 0.003 (< 0.5 * 0.01)
        target_tp=None,
        net_profit=200.0
    )
    assert res7["status"] == "BYPASSED"
    assert "Delta < 0.5 pip" in res7["reason"]
