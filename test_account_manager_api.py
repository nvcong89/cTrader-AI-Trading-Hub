"""
Unit tests for Account Manager backend functions in account_config.py
"""
import os
import json
import sqlite3
import pytest
from account_config import (
    load_accounts_config,
    save_accounts_config,
    get_all_profiles,
    get_account_details_with_stats,
    update_account_info,
    add_account_to_profile,
    delete_account,
    get_raw_json_config,
    save_raw_json_config,
    refresh_profile_open_api_token
)

def test_account_crud_and_sync():
    # 1. Load profiles
    profiles = get_all_profiles()
    assert len(profiles) > 0, "Should have at least one profile"
    test_pid = profiles[0]["id"]

    # 2. Add temporary test account
    test_acc_id = "99988877"
    success, msg = add_account_to_profile(test_pid, {
        "account_id": test_acc_id,
        "account_label": "Automated Test Account",
        "broker": "TestBroker",
        "account_type": "demo",
        "currency": "USD",
        "enabled": True
    })
    assert success is True, f"Failed to add test account: {msg}"

    # 3. Verify account in details with stats
    accounts = get_account_details_with_stats()
    matched = [a for a in accounts if a["account_id"] == test_acc_id]
    assert len(matched) == 1
    assert matched[0]["account_label"] == "Automated Test Account"
    assert matched[0]["broker"] == "TestBroker"
    assert matched[0]["enabled"] is True

    # 4. Update account
    updated = update_account_info(test_acc_id, {
        "account_label": "Renamed Test Account",
        "broker": "UpdatedBroker",
        "enabled": False
    })
    assert updated is True

    # Verify update
    accounts = get_account_details_with_stats()
    matched = [a for a in accounts if a["account_id"] == test_acc_id]
    assert len(matched) == 1
    assert matched[0]["account_label"] == "Renamed Test Account"
    assert matched[0]["broker"] == "UpdatedBroker"
    assert matched[0]["enabled"] is False

    # 5. Raw config verification
    raw = get_raw_json_config()
    assert test_acc_id in raw
    parsed = json.loads(raw)
    assert "profiles" in parsed

    # 6. Delete account
    deleted = delete_account(test_acc_id)
    assert deleted is True

    # Verify deletion
    accounts = get_account_details_with_stats()
    matched = [a for a in accounts if a["account_id"] == test_acc_id]
    assert len(matched) == 0

def test_raw_json_validation():
    # Invalid JSON
    success, msg = save_raw_json_config("{not valid json")
    assert success is False
    assert "Syntax Error" in msg

    # Valid JSON but missing profiles
    success, msg = save_raw_json_config('{"version": "1.0"}')
    assert success is False
    assert "profiles" in msg

def test_refresh_token_missing():
    # Attempting refresh on invalid profile
    res = refresh_profile_open_api_token("non_existent_profile")
    assert res["status"] == "error"

def test_scan_accounts_error_handling():
    from account_config import scan_accounts_from_ctid
    res = scan_accounts_from_ctid("non_existent_profile")
    assert res["status"] == "error"
    assert "không tồn tại" in res["message"]

def test_profile_api_endpoints(monkeypatch):
    from fastapi.testclient import TestClient
    from main import app
    import main

    # Mock require_admin to bypass auth in test
    monkeypatch.setattr(main, "require_admin", lambda req: {"username": "admin", "role": "admin"})

    client = TestClient(app)

    # 1. Create Profile API
    payload = {
        "profile_name": "API Test Profile",
        "ctid_email": "api_test_unique@example.com",
        "ctid_password": "MySecretPassword123",
        "enabled": True,
        "auto_scan": False,
        "open_api": {
            "client_id": "test_cid",
            "environment": "demo"
        }
    }
    resp = client.post("/api/accounts/profiles", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    prof_id = data["profile_id"]
    assert prof_id is not None

    # 2. Update Profile API
    up_payload = {
        "profile_name": "API Test Profile Updated",
        "enabled": False
    }
    resp_up = client.put(f"/api/accounts/profiles/{prof_id}", json=up_payload)
    assert resp_up.status_code == 200
    assert resp_up.json()["status"] == "success"

    # 3. Delete Profile API
    resp_del = client.delete(f"/api/accounts/profiles/{prof_id}")
    assert resp_del.status_code == 200
    assert resp_del.json()["status"] == "success"

if __name__ == "__main__":
    print("Running Account Manager backend unit tests...")
    test_account_crud_and_sync()
    test_raw_json_validation()
    test_refresh_token_missing()
    test_scan_accounts_error_handling()
    print("ALL Account Manager tests PASSED successfully!")

