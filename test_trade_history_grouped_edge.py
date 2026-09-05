import pytest
from fastapi.testclient import TestClient
from main import app, load_all_credentials, generate_auth_token
import database
import datetime

client = TestClient(app)

@pytest.fixture(scope="module")
def admin_token():
    creds = load_all_credentials()
    return generate_auth_token(creds["admin"]["password"], "admin")

@pytest.fixture(scope="module", autouse=True)
def seed_test_trade_history():
    """Seeds test records into history table and cleans them up after test."""
    conn = database.get_db()
    c = conn.cursor()

    test_records = [
        # (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time)
        (99901, "ACC_DEMO_01", "Bot_Alpha", "XAUUSD", "BUY", 0.01, 2600.0, 2610.0, 100.0, 100.0, "TP Hit", datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat()),
        (99902, "ACC_DEMO_01", "Bot_Alpha", "XAUUSD", "BUY", 0.01, 2605.0, 2615.0, 100.0, 100.0, "TP Hit", datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat()),
        (99903, "ACC_DEMO_01", "Bot_Alpha", "XAUUSD", "SELL", 0.01, 2620.0, 2625.0, -50.0, -50.0, "SL Hit", datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat()),
        (99904, "ACC_DEMO_02", "Bot_Beta", "EURUSD", "BUY", 0.02, 1.0800, 1.0850, 100.0, 50.0, "TP Hit", datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat()),
        (99905, "ACC_DEMO_02", "Bot_Beta", "EURUSD", "SELL", 0.02, 1.0850, 1.0900, -100.0, -50.0, "SL Hit", datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat()),
        (99906, "ACC_DEMO_03", "Bot_Gamma", "BTCUSD", "BUY", 0.01, 60000.0, 59000.0, -100.0, -1000.0, "SL Hit", datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat()),
    ]

    c.executemany('''
        INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', test_records)
    conn.commit()
    conn.close()

    yield

    # Cleanup test records
    conn = database.get_db()
    c = conn.cursor()
    c.execute("DELETE FROM history WHERE ctrader_id >= 99901 AND ctrader_id <= 99906")
    conn.commit()
    conn.close()

def test_api_history_with_account_filter_and_sorting(admin_token):
    cookies = {"auth_token": admin_token}
    
    # 1. Filter by account_id
    res = client.get("/api/history?account_id=ACC_DEMO_01", cookies=cookies)
    assert res.status_code == 200
    data = res.json()
    assert "trades" in data
    assert len(data["trades"]) == 3
    for t in data["trades"]:
        assert t["account_id"] == "ACC_DEMO_01"

    # 2. Sort by PnL descending
    res_sort = client.get("/api/history?account_id=ACC_DEMO_01&sort_by=pnl&order=desc", cookies=cookies)
    assert res_sort.status_code == 200
    pnls = [t["pnl"] for t in res_sort.json()["trades"]]
    assert pnls == sorted(pnls, reverse=True)

    # 3. Sort by PnL ascending
    res_sort_asc = client.get("/api/history?account_id=ACC_DEMO_01&sort_by=pnl&order=asc", cookies=cookies)
    assert res_sort_asc.status_code == 200
    pnls_asc = [t["pnl"] for t in res_sort_asc.json()["trades"]]
    assert pnls_asc == sorted(pnls_asc)

def test_api_history_stats_edge_calculation(admin_token):
    cookies = {"auth_token": admin_token}

    # Stats for Bot_Alpha (2 wins of 100, 1 loss of -50 -> Total 3 trades)
    # Win rate: 66.7%, Gross profit: 200, Gross loss: 50, Net PnL: 150
    # Avg Win: 100, Avg Loss: 50, R:R = 2.0
    # Edge ($/trade) = (2/3 * 100) - (1/3 * 50) = 66.67 - 16.67 = +50.0
    # Edge (R) = (2/3 * 2.0) - (1/3) = 4/3 - 1/3 = 1.00R
    res = client.get("/api/history/stats?bot_id=Bot_Alpha", cookies=cookies)
    assert res.status_code == 200
    stats = res.json()

    assert stats["total_trades"] == 3
    assert stats["total_wins"] == 2
    assert stats["total_losses"] == 1
    assert stats["win_rate"] == 66.7
    assert stats["net_pnl"] == 150.0
    assert stats["profit_factor"] == 4.0
    assert stats["avg_win"] == 100.0
    assert stats["avg_loss"] == 50.0
    assert stats["rr_ratio"] == 2.0
    assert stats["edge_usd"] == 50.0
    assert stats["edge_r"] == 1.0
    assert stats["edge_status"] == "POSITIVE"

def test_api_history_grouped_stats_matrix(admin_token):
    cookies = {"auth_token": admin_token}

    res = client.get("/api/history/grouped-stats?sort_by=edge_usd&order=desc", cookies=cookies)
    assert res.status_code == 200
    data = res.json()
    assert "groups" in data
    assert "total_groups" in data
    assert data["total_groups"] >= 3

    # Check that groups are sorted by edge_usd desc
    edges = [g["edge_usd"] for g in data["groups"]]
    assert edges == sorted(edges, reverse=True)

    # Find Bot_Alpha group
    alpha_group = next((g for g in data["groups"] if g["bot_id"] == "Bot_Alpha"), None)
    assert alpha_group is not None
    assert alpha_group["symbol"] == "XAUUSD"
    assert alpha_group["account_id"] == "ACC_DEMO_01"
    assert alpha_group["edge_usd"] == 50.0
    assert alpha_group["edge_status"] == "POSITIVE"

    # Find Bot_Gamma group (1 loss of -100 -> negative edge)
    gamma_group = next((g for g in data["groups"] if g["bot_id"] == "Bot_Gamma"), None)
    assert gamma_group is not None
    assert gamma_group["symbol"] == "BTCUSD"
    assert gamma_group["account_id"] == "ACC_DEMO_03"
    assert gamma_group["edge_usd"] == -100.0
    assert gamma_group["edge_status"] == "NEGATIVE"
