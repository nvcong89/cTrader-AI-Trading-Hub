import pytest
from fastapi.testclient import TestClient
from main import app, load_all_credentials, generate_auth_token

client = TestClient(app)

def test_login_invalid():
    res = client.post("/api/login", json={"username": "fake", "password": "wrongpassword"})
    assert res.status_code == 401

def test_admin_login_and_auth_me():
    creds = load_all_credentials()
    admin = creds["admin"]
    res = client.post("/api/login", json={"username": admin["username"], "password": admin["password"]})
    assert res.status_code == 200
    assert "auth_token" in res.cookies
    token = res.cookies["auth_token"]
    
    me_res = client.get("/api/auth/me", cookies={"auth_token": token})
    assert me_res.status_code == 200
    data = me_res.json()
    assert data["user"] == admin["username"]
    assert data["role"] == "admin"

def test_guest_login_and_auth_me():
    creds = load_all_credentials()
    guest = creds["guest"]
    res = client.post("/api/login", json={"username": guest["username"], "password": guest["password"]})
    assert res.status_code == 200
    assert "auth_token" in res.cookies
    token = res.cookies["auth_token"]
    
    me_res = client.get("/api/auth/me", cookies={"auth_token": token})
    assert me_res.status_code == 200
    data = me_res.json()
    assert data["user"] == guest["username"]
    assert data["role"] == "guest"

def test_guest_read_endpoints_allowed():
    creds = load_all_credentials()
    guest = creds["guest"]
    res = client.post("/api/login", json={"username": guest["username"], "password": guest["password"]})
    token = res.cookies["auth_token"]
    guest_cookies = {"auth_token": token}
    
    # Read-only endpoints should return 200 OK
    assert client.get("/api/dashboard", cookies=guest_cookies).status_code == 200
    assert client.get("/api/accounts", cookies=guest_cookies).status_code == 200
    assert client.get("/api/positions", cookies=guest_cookies).status_code == 200
    assert client.get("/api/cbots", cookies=guest_cookies).status_code == 200
    assert client.get("/api/logs", cookies=guest_cookies).status_code == 200
    assert client.get("/api/agent/config", cookies=guest_cookies).status_code == 200
    assert client.get("/api/agent/status", cookies=guest_cookies).status_code == 200
    assert client.get("/api/eval/status", cookies=guest_cookies).status_code == 200
    assert client.get("/api/eval/history", cookies=guest_cookies).status_code == 200
    assert client.get("/api/history", cookies=guest_cookies).status_code == 200
    assert client.get("/api/history/stats", cookies=guest_cookies).status_code == 200
    assert client.get("/api/database/stats", cookies=guest_cookies).status_code == 200

def test_guest_mutating_endpoints_forbidden():
    creds = load_all_credentials()
    guest = creds["guest"]
    res = client.post("/api/login", json={"username": guest["username"], "password": guest["password"]})
    token = res.cookies["auth_token"]
    guest_cookies = {"auth_token": token}
    
    # Mutating endpoints must return 403 Forbidden for Guest
    assert client.post("/api/bots/bulk/start", cookies=guest_cookies).status_code == 403
    assert client.post("/api/bots/bulk/stop", cookies=guest_cookies).status_code == 403
    assert client.post("/api/bots/bulk/restart", cookies=guest_cookies).status_code == 403
    assert client.post("/api/bots/999/start", cookies=guest_cookies).status_code == 403
    assert client.post("/api/bots/999/stop", cookies=guest_cookies).status_code == 403
    assert client.post("/api/bots/999/restart", cookies=guest_cookies).status_code == 403
    assert client.post("/api/bots/999/delete", cookies=guest_cookies).status_code == 403
    assert client.post("/api/bots/999/parameters", json={"parameters": {}}, cookies=guest_cookies).status_code == 403
    assert client.post("/api/positions/close-all", cookies=guest_cookies).status_code == 403
    assert client.post("/api/positions/999/close", cookies=guest_cookies).status_code == 403
    assert client.post("/api/agent/config", json={"active_provider": "gemini_api"}, cookies=guest_cookies).status_code == 403
    assert client.post("/api/agent/test-connection", json={"provider": "gemini_api"}, cookies=guest_cookies).status_code == 403
    assert client.post("/api/eval/start", cookies=guest_cookies).status_code == 403
    assert client.post("/api/database/maintain", cookies=guest_cookies).status_code == 403
    assert client.post("/api/database/backup", cookies=guest_cookies).status_code == 403
    assert client.post("/api/history/clear", cookies=guest_cookies).status_code == 403
    assert client.post("/api/logs/clear", cookies=guest_cookies).status_code == 403
