import pytest
from starlette.testclient import TestClient
from main import app
import bot_leaderboard
import database

client = TestClient(app)

def test_compute_bot_leaderboard():
    data = bot_leaderboard.compute_bot_leaderboard()
    assert "rankings" in data
    assert "total_bots" in data
    assert "fleet_win_rate" in data
    assert isinstance(data["rankings"], list)
    if len(data["rankings"]) > 0:
        top = data["rankings"][0]
        assert "rank" in top
        assert top["rank"] == 1
        assert "composite_score" in top
        assert "tier_badge" in top

def test_get_or_compute_leaderboard():
    data = bot_leaderboard.get_or_compute_leaderboard(force_refresh=True)
    assert "snapshot_id" in data
    assert "next_update_at" in data
    assert "rankings" in data

def test_leaderboard_api_endpoint():
    res = client.get("/api/leaderboard", cookies={"session_id": "test_admin"})
    assert res.status_code in [200, 401]
