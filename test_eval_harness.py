"""
Unit Test Suite for AI Agent Evaluation & Benchmark Harness
"""
import pytest
import os
import json
import database
from ai_eval_harness import (
    simulate_forward_outcome,
    get_default_golden_dataset,
    format_benchmark_prompt
)

@pytest.fixture(autouse=True)
def setup_db():
    database.init_db()

def test_golden_dataset_structure():
    dataset = get_default_golden_dataset()
    assert len(dataset) >= 5
    for sc in dataset:
        assert "scenario_id" in sc
        assert "symbol" in sc
        assert "timeframe" in sc
        assert "bars" in sc
        assert len(sc["bars"]) == 35
        assert "forward_bars" in sc
        assert len(sc["forward_bars"]) >= 5

def test_format_benchmark_prompt():
    dataset = get_default_golden_dataset()
    prompt = format_benchmark_prompt(dataset[0])
    assert "NEW ENTRY DISCOVERY MODE" in prompt
    assert "XAUUSD" in prompt
    assert "REQUIRED JSON OUTPUT FORMAT" in prompt

def test_simulate_forward_outcome_buy_win():
    scenario = {
        "symbol": "XAUUSD",
        "ask": 2650.00,
        "bid": 2649.80,
        "forward_bars": [
            {"time": "T+1", "open": 2650.00, "high": 2652.00, "low": 2649.50, "close": 2651.80},
            {"time": "T+2", "open": 2651.80, "high": 2655.00, "low": 2651.00, "close": 2654.50}, # Reaches +300 pips ($3.00 on Gold)
        ]
    }
    decision = {
        "action": "BUY",
        "sl_pips": 150.0,
        "tp_pips": 300.0
    }
    outcome, pnl = simulate_forward_outcome(scenario, decision)
    assert outcome == "WIN"
    assert pnl == 300.0

def test_simulate_forward_outcome_buy_loss():
    scenario = {
        "symbol": "XAUUSD",
        "ask": 2650.00,
        "bid": 2649.80,
        "forward_bars": [
            {"time": "T+1", "open": 2650.00, "high": 2650.50, "low": 2647.00, "close": 2647.20}, # Drops $3.00, hits SL ($1.50)
        ]
    }
    decision = {
        "action": "BUY",
        "sl_pips": 150.0,
        "tp_pips": 300.0
    }
    outcome, pnl = simulate_forward_outcome(scenario, decision)
    assert outcome == "LOSS"
    assert pnl == -150.0

def test_simulate_forward_outcome_sell_win():
    scenario = {
        "symbol": "XAUUSD",
        "ask": 2650.20,
        "bid": 2650.00,
        "forward_bars": [
            {"time": "T+1", "open": 2650.00, "high": 2650.20, "low": 2646.00, "close": 2646.50}, # Drops $4.00, hits TP ($3.00)
        ]
    }
    decision = {
        "action": "SELL",
        "sl_pips": 150.0,
        "tp_pips": 300.0
    }
    outcome, pnl = simulate_forward_outcome(scenario, decision)
    assert outcome == "WIN"
    assert pnl == 300.0

def test_database_eval_crud():
    run_id = database.create_eval_run("test_provider", "test_model", "test_dataset", 10)
    assert run_id > 0
    
    database.save_eval_result(
        run_id=run_id,
        scenario_idx=1,
        timestamp="2026-03-10T14:15:00",
        symbol="XAUUSD",
        timeframe="M15",
        ask=2650.0,
        bid=2649.8,
        indicators_json="{}",
        ai_action="BUY",
        ai_volume=0.01,
        ai_sl_pips=150.0,
        ai_tp_pips=300.0,
        ai_confidence=90.0,
        ai_reason="Bullish test",
        latency_ms=850.0,
        forward_outcome="WIN",
        pnl_pips=300.0,
        forward_bars_json="[]"
    )
    
    database.complete_eval_run(
        run_id=run_id,
        status="COMPLETED",
        win_rate=100.0,
        profit_factor=99.0,
        avg_latency_ms=850.0,
        total_wins=1,
        total_losses=0,
        total_holds=0,
        total_pnl_pips=300.0,
        summary_markdown="# Test Report"
    )
    
    detail = database.get_eval_run_detail(run_id)
    assert detail is not None
    assert detail["status"] == "COMPLETED"
    assert detail["win_rate"] == 100.0
    assert len(detail["results"]) == 1
    assert detail["results"][0]["ai_action"] == "BUY"
