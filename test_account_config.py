import os
import json
import sqlite3
import pytest
from account_config import (
    load_accounts_config,
    save_accounts_config,
    get_all_profiles,
    get_profile_by_id,
    get_profile_by_account,
    get_cli_credentials_for_account,
    get_open_api_credentials_for_account,
    get_all_configured_accounts,
    sync_accounts_to_database,
    sanitize_profiles_for_api,
    build_fallback_config
)

def test_load_accounts_config():
    cfg = load_accounts_config()
    assert "profiles" in cfg
    assert len(cfg["profiles"]) >= 2
    
    profiles = get_all_profiles()
    assert len(profiles) >= 2
    
    # Profile 1 (main)
    p_main = get_profile_by_id("profile_main")
    assert p_main is not None
    assert p_main["ctid_email"] == "nvcong89@live.com"
    assert len(p_main["accounts"]) >= 1
    
    # Profile 2 (hoaithanh)
    p_ht = get_profile_by_id("profile_hoaithanh")
    assert p_ht is not None
    assert p_ht["ctid_email"] == "hoaithanh169nb@gmail.com"
    assert len(p_ht["accounts"]) == 5

def test_get_profile_by_account():
    # Account from Profile 1
    p1 = get_profile_by_account("10645192")
    assert p1 is not None
    assert p1["id"] == "profile_main"
    
    # Account from Profile 2 (by account_id)
    p2_acc1 = get_profile_by_account("8240138")
    assert p2_acc1 is not None
    assert p2_acc1["id"] == "profile_hoaithanh"
    
    # Account from Profile 2 (by ctid_trader_id)
    p2_acc2 = get_profile_by_account("45261297")
    assert p2_acc2 is not None
    assert p2_acc2["id"] == "profile_hoaithanh"
    
    # Non-existent account
    p_none = get_profile_by_account("999999999")
    assert p_none is None

def test_get_cli_credentials_for_account():
    # Profile 1
    email1, pwd1 = get_cli_credentials_for_account("10645192")
    assert email1 == "nvcong89@live.com"
    assert pwd1 == "Th@nhcong89"
    
    # Profile 2
    email2, pwd2 = get_cli_credentials_for_account("8240138")
    assert email2 == "hoaithanh169nb@gmail.com"
    assert pwd2 == "Khanhlinh2023"

def test_get_open_api_credentials_for_account():
    # Profile 1 has full open_api credentials
    oa1 = get_open_api_credentials_for_account("10645192")
    assert oa1 is not None
    assert "35921" in oa1["client_id"]
    assert oa1["access_token"].startswith("4o_PS")
    assert oa1["environment"] == "live"
    
    # Profile 2 does not have active Open API token yet
    oa2 = get_open_api_credentials_for_account("8240138")
    # Should be None since access_token is empty
    assert oa2 is None

def test_get_all_configured_accounts():
    accounts = get_all_configured_accounts(enabled_only=True)
    assert len(accounts) >= 6
    
    acc_ids = [a["account_id"] for a in accounts]
    assert "10645192" in acc_ids
    assert "8240138" in acc_ids
    assert "8237659" in acc_ids
    
    for a in accounts:
        assert "profile_id" in a
        assert "ctid_email" in a
        assert "broker" in a

def test_sanitize_profiles_for_api():
    profiles = get_all_profiles()
    sanitized = sanitize_profiles_for_api(profiles)
    for s in sanitized:
        assert s["ctid_password"] == "••••••••"
        if s.get("open_api") and s["open_api"].get("client_secret"):
            assert s["open_api"]["client_secret"] == "••••••••"
        if s.get("open_api") and s["open_api"].get("access_token"):
            tok = s["open_api"]["access_token"]
            assert "..." in tok or tok == "••••••••"

def test_sync_accounts_to_database():
    # Test in-memory or actual DB sync
    synced = sync_accounts_to_database()
    assert synced >= 6
    
    from database import get_db
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("SELECT account_id, broker, ctid_email, profile_id FROM accounts WHERE account_id = '8246991'")
        row = c.fetchone()
        assert row is not None
        assert row["broker"] == "FxPro"
        assert row["ctid_email"] == "hoaithanh169nb@gmail.com"
        assert row["profile_id"] == "profile_hoaithanh"
    finally:
        conn.close()

def test_fallback_config_structure():
    fallback = build_fallback_config()
    assert "profiles" in fallback
    assert len(fallback["profiles"]) == 1
    assert fallback["profiles"][0]["id"] == "profile_default"

def test_account_details_with_stats_has_balance_equity():
    from account_config import get_account_details_with_stats
    stats = get_account_details_with_stats()
    assert len(stats) >= 5
    for s in stats:
        assert "balance" in s
        assert "equity" in s
        assert isinstance(s["balance"], (int, float))
        assert isinstance(s["equity"], (int, float))

