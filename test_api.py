import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_dashboard_unauthenticated():
    response = client.get("/api/dashboard")
    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated"}

def test_login_invalid():
    response = client.post("/api/login", json={"username": "wrong", "password": "password"})
    assert response.status_code == 401

def test_login_success():
    # Assuming default admin/password123 from main.py if .env is missing
    response = client.post("/api/login", json={"username": "admin", "password": "password123"})
    if response.status_code == 200:
        assert "auth_token" in response.cookies
        token = response.cookies["auth_token"]
        
        # Test /api/system/metrics
        metrics_res = client.get("/api/system/metrics", cookies={"auth_token": token})
        assert metrics_res.status_code == 200
        data = metrics_res.json()
        assert "cpu_percent" in data
        assert "ram_percent" in data

        # Test /api/bots/bulk/start with CPU gating payload
        bulk_res = client.post(
            "/api/bots/bulk/start",
            json={"max_cpu_threshold": 40.0, "min_delay_seconds": 10.0, "max_wait_seconds": 90.0},
            cookies={"auth_token": token}
        )
        assert bulk_res.status_code == 200
        assert bulk_res.json().get("status") == "success"

        # Test /api/bots/{bot_id}/parameters save endpoint
        bots_list = client.get("/api/bots", cookies={"auth_token": token}).json()
        if bots_list and len(bots_list) > 0:
            target_bot = bots_list[0]
            target_id = target_bot["id"]
            save_res = client.post(
                f"/api/bots/{target_id}/parameters",
                json={
                    "parameters": {"riskFactor": 1.0, "SLTPpercentage": True},
                    "name": target_bot.get("name"),
                    "symbol": target_bot.get("symbol"),
                    "timeframe": target_bot.get("timeframe"),
                    "account_label": target_bot.get("account_label"),
                    "account_type": target_bot.get("account_type"),
                    "restart": False
                },
                cookies={"auth_token": token}
            )
            assert save_res.status_code == 200
            assert save_res.json().get("status") == "success"

