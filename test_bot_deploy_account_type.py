import pytest
from fastapi.testclient import TestClient
from main import app, get_db, load_all_credentials
import sqlite3

client = TestClient(app)

def test_deploy_bot_live_account_type_retention():
    # Setup test admin credentials
    creds = load_all_credentials()
    admin = creds["admin"]
    login_res = client.post("/api/login", json={"username": admin["username"], "password": admin["password"]})
    assert login_res.status_code == 200
    token = login_res.cookies["auth_token"]
    cookies = {"auth_token": token}
    
    # 1. Prepare a known live account in accounts table
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("""
            INSERT OR REPLACE INTO accounts (account_id, account_type, account_label, balance, equity, last_updated)
            VALUES ('TEST_LIVE_ACC_999', 'live', 'Test Live Account', 5000.0, 5000.0, '2026-09-04T12:00:00')
        """)
        conn.commit()
    finally:
        conn.close()

    # 2. Deploy a bot explicitly specifying account_type = 'live'
    deploy_payload = {
        "name": "Test Live Bot Unit Test",
        "algo_path": "Asian Range Judas Sweep AI Bot.algo",
        "account_id": "TEST_LIVE_ACC_999",
        "account_label": "Test Live Account",
        "account_type": "live",
        "symbol": "XAUUSD",
        "timeframe": "m15",
        "auto_start": False
    }

    res = client.post("/api/bots", json=deploy_payload, cookies=cookies)
    assert res.status_code == 200, f"Failed deploy: {res.text}"
    bot_id = res.json().get("bot_id")
    assert bot_id is not None

    try:
        # Verify in DB directly: bot_instances must have account_type = 'live'
        conn = get_db()
        try:
            c = conn.cursor()
            c.execute("SELECT account_type FROM bot_instances WHERE id = ?", (bot_id,))
            row = c.fetchone()
            assert row is not None
            assert row["account_type"].lower() == "live"
        finally:
            conn.close()

        # 3. Verify in dashboard endpoint: must return account_type = 'live'
        dash_res = client.get("/api/dashboard", cookies=cookies)
        assert dash_res.status_code == 200
        dash_data = dash_res.json()
        target_bot = next((b for b in dash_data.get("bots", []) if b["id"] == bot_id), None)
        assert target_bot is not None
        assert (target_bot.get("account_type") or "").lower() == "live"

        # 4. Verify in parameters endpoint: must return account_type = 'live'
        params_res = client.get(f"/api/bots/{bot_id}/parameters", cookies=cookies)
        assert params_res.status_code == 200
        params_data = params_res.json()
        assert (params_data.get("account_type") or "").lower() == "live"

        # 5. Test auto-inheritance: deploy another bot to TEST_LIVE_ACC_999 with default/empty account_type
        deploy_payload_inherit = {
            "name": "Test Inherited Live Bot",
            "algo_path": "Asian Range Judas Sweep AI Bot.algo",
            "account_id": "TEST_LIVE_ACC_999",
            "account_label": "Test Live Account",
            "account_type": "demo", # sent default 'demo' but account is known 'live'
            "symbol": "EURUSD",
            "timeframe": "m15",
            "auto_start": False
        }
        res_inherit = client.post("/api/bots", json=deploy_payload_inherit, cookies=cookies)
        assert res_inherit.status_code == 200
        inherited_bot_id = res_inherit.json().get("bot_id")
        assert inherited_bot_id is not None

        try:
            conn = get_db()
            try:
                c = conn.cursor()
                c.execute("SELECT account_type FROM bot_instances WHERE id = ?", (inherited_bot_id,))
                inh_row = c.fetchone()
                assert inh_row is not None
                assert inh_row["account_type"].lower() == "live"
            finally:
                conn.close()
        finally:
            # Cleanup inherited bot
            client.post(f"/api/bots/{inherited_bot_id}/delete", cookies=cookies)

    finally:
        # Cleanup test bot and account
        client.post(f"/api/bots/{bot_id}/delete", cookies=cookies)
        conn = get_db()
        try:
            c = conn.cursor()
            c.execute("DELETE FROM accounts WHERE account_id = 'TEST_LIVE_ACC_999'")
            conn.commit()
        finally:
            conn.close()
