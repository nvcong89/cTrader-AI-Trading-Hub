import os
import time
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app, bot_manager

client = TestClient(app)

def test_check_bot_update_status_stopped():
    """Stopped bot should always have has_update=False."""
    bot = {
        "id": 999,
        "name": "Test Bot",
        "algo_path": "Asian Range Judas Sweep AI Bot.algo",
        "status": "STOPPED",
        "pid": None
    }
    status = bot_manager.check_bot_update_status(bot)
    assert status["bot_id"] == 999
    assert status["has_update"] is False
    assert status["status"] == "STOPPED"
    assert status["algo_mtime"] is not None

def test_check_bot_update_status_running_with_update():
    """Running bot with older start time than .algo mtime should have has_update=True."""
    bot = {
        "id": 100,
        "name": "Running Bot",
        "algo_path": "Asian Range Judas Sweep AI Bot.algo",
        "status": "RUNNING",
        "pid": 12345
    }

    mock_proc = MagicMock()
    # Mock process created 1 hour ago
    file_mtime = time.time()
    mock_proc.create_time.return_value = file_mtime - 3600

    with patch.object(bot_manager, "is_process_running", return_value=True), \
         patch("psutil.Process", return_value=mock_proc), \
         patch("os.path.getmtime", return_value=file_mtime):
        
        status = bot_manager.check_bot_update_status(bot)
        assert status["has_update"] is True
        assert status["diff_seconds"] > 1.0

def test_check_bot_update_status_running_no_update():
    """Running bot with newer start time than .algo mtime should have has_update=False."""
    bot = {
        "id": 101,
        "name": "Running Bot Up To Date",
        "algo_path": "Asian Range Judas Sweep AI Bot.algo",
        "status": "RUNNING",
        "pid": 12346
    }

    mock_proc = MagicMock()
    now = time.time()
    # Mock process created AFTER the file was modified
    mock_proc.create_time.return_value = now
    file_mtime = now - 500

    with patch.object(bot_manager, "is_process_running", return_value=True), \
         patch("psutil.Process", return_value=mock_proc), \
         patch("os.path.getmtime", return_value=file_mtime):
        
        status = bot_manager.check_bot_update_status(bot)
        assert status["has_update"] is False
        assert status["diff_seconds"] < 0

def test_api_bulk_updates_endpoint():
    """Test GET /api/bots/bulk/updates with internal system dispatch header."""
    headers = {"X-Internal-Token": "LOCAL_SYSTEM_DISPATCH"}
    resp = client.get("/api/bots/bulk/updates", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "total_bots" in data
    assert "updated_count" in data
    assert "updated_bots" in data

def test_api_bulk_restart_updated_endpoint():
    """Test POST /api/bots/bulk/restart-updated with internal system dispatch header."""
    headers = {"X-Internal-Token": "LOCAL_SYSTEM_DISPATCH"}
    resp = client.post("/api/bots/bulk/restart-updated", json={}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "Smart Incremental Restart" in data["message"]

if __name__ == "__main__":
    test_check_bot_update_status_stopped()
    test_check_bot_update_status_running_with_update()
    test_check_bot_update_status_running_no_update()
    test_api_bulk_updates_endpoint()
    test_api_bulk_restart_updated_endpoint()
    print("All Smart Incremental Restart unit tests PASSED successfully!")
