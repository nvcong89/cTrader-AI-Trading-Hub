import pytest
import io
import zipfile
from starlette.testclient import TestClient
from main import app
import database

client = TestClient(app)

def test_database_storage_stats():
    stats = database.get_database_stats()
    assert "total_size_mb" in stats
    assert "warning_threshold_mb" in stats
    assert stats["warning_threshold_mb"] == 100.0
    assert "is_storage_warning" in stats
    assert "usage_percent" in stats

def test_export_trading_history_csv():
    csv_str = database.export_trading_history_csv()
    assert "id,account_id,bot_id,symbol" in csv_str
    lines = csv_str.strip().split("\n")
    assert len(lines) >= 1

def test_export_logs_csv():
    csv_str = database.export_logs_csv()
    assert "id,timestamp,bot_id,level,message" in csv_str
    lines = csv_str.strip().split("\n")
    assert len(lines) >= 1

def test_export_all_data_zip():
    zip_bytes = database.export_all_data_zip()
    assert len(zip_bytes) > 0
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        assert any(n.startswith("trading_history_") for n in names)
        assert any(n.startswith("ai_system_logs_") for n in names)

def test_api_export_endpoints():
    res_hist = client.get("/api/database/export/history/csv", cookies={"session_id": "test_admin"})
    assert res_hist.status_code in [200, 401]
    
    res_logs = client.get("/api/database/export/logs/csv", cookies={"session_id": "test_admin"})
    assert res_logs.status_code in [200, 401]

    res_zip = client.get("/api/database/export/all/zip", cookies={"session_id": "test_admin"})
    assert res_zip.status_code in [200, 401]
