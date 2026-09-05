"""
FastAPI Integration Tests for AI Evaluation Endpoints
"""
import pytest
from fastapi.testclient import TestClient
from main import app, generate_auth_token, load_admin_credentials
import database

client = TestClient(app)

@pytest.fixture
def auth_cookies():
    _, pwd = load_admin_credentials()
    token = generate_auth_token(pwd)
    return {"auth_token": token}

def test_eval_endpoints_auth_required():
    res = client.get("/api/eval/status")
    assert res.status_code == 401

def test_eval_status_and_history(auth_cookies):
    res = client.get("/api/eval/status", cookies=auth_cookies)
    assert res.status_code == 200
    data = res.json()
    assert "is_running" in data
    assert "latest_run" in data

    hist_res = client.get("/api/eval/history", cookies=auth_cookies)
    assert hist_res.status_code == 200
    hist_data = hist_res.json()
    assert "runs" in hist_data
    assert isinstance(hist_data["runs"], list)
