"""
cTrader Multi-Account & Multi-Profile Configuration Manager
Provides unified, decoupled management of cTrader ID accounts, CLI credentials,
and Spotware Cloud Open API credentials per user profile.
"""

import json
import os
import sqlite3
import datetime
from typing import Dict, Any, List, Optional, Tuple

CONFIG_FILENAME = "ctrader_accounts.json"
LEGACY_ACCOUNT_FILE = "ctrader_account.txt"
LEGACY_ENV_FILE = "ctrader_API.env"

def get_config_path() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), CONFIG_FILENAME))

def load_accounts_config() -> Dict[str, Any]:
    """
    Loads configuration from ctrader_accounts.json.
    If the file does not exist, seamlessly synthesizes a legacy profile
    from ctrader_account.txt and ctrader_API.env for 100% backward compatibility.
    """
    config_path = get_config_path()
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "profiles" in data:
                    return data
        except Exception as e:
            print(f"[account_config] Error reading {CONFIG_FILENAME}: {e}")

    # Backward compatibility fallback
    return build_fallback_config()

def build_fallback_config() -> Dict[str, Any]:
    """Synthesizes a default profile from legacy credential files."""
    base_dir = os.path.dirname(__file__)
    
    # Read legacy cTrader account text file
    file_ctid = ""
    file_pwd = ""
    txt_path = os.path.join(base_dir, LEGACY_ACCOUNT_FILE)
    if os.path.exists(txt_path):
        try:
            with open(txt_path, "r", encoding="utf-8") as f:
                for line in f:
                    line_str = line.strip()
                    if line_str.startswith("CTID_EMAIL="):
                        file_ctid = line_str.split("=", 1)[1].strip().strip('"').strip("'")
                    elif line_str.startswith("CTID_PASSWORD="):
                        file_pwd = line_str.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass

    # Read legacy cTrader API env file
    client_id = ""
    secret = ""
    access_token = ""
    env_name = "live"
    redirect_uri = "https://openapi.ctrader.com/apps/token"
    account_id = ""
    
    env_path = os.path.join(base_dir, LEGACY_ENV_FILE)
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line_str = line.strip()
                    if line_str and not line_str.startswith("#") and "=" in line:
                        k, v = line_str.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k == "clientID": client_id = v
                        elif k == "secret": secret = v
                        elif k == "ACCESS_TOKEN": access_token = v
                        elif k == "ENVIRONMENT": env_name = v.lower()
                        elif k == "REDIRECT_URI": redirect_uri = v
                        elif k == "ACCOUNT_ID": account_id = v
        except Exception:
            pass

    accounts = []
    if account_id:
        accounts.append({
            "account_id": str(account_id),
            "account_label": f"Account #{account_id}",
            "broker": "FxPro",
            "account_type": env_name,
            "currency": "USD"
        })

    return {
        "version": "1.0",
        "description": "Auto-synthesized fallback configuration",
        "profiles": [
            {
                "id": "profile_default",
                "profile_name": "Default Account",
                "enabled": True,
                "ctid_email": file_ctid,
                "ctid_password": file_pwd,
                "open_api": {
                    "client_id": client_id,
                    "client_secret": secret,
                    "access_token": access_token,
                    "environment": env_name,
                    "redirect_uri": redirect_uri
                },
                "accounts": accounts
            }
        ]
    }

def save_accounts_config(config: Dict[str, Any]) -> bool:
    """Saves configuration back to ctrader_accounts.json atomically."""
    config_path = get_config_path()
    temp_path = config_path + ".tmp"
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write("\n")
        if os.path.exists(config_path):
            os.replace(temp_path, config_path)
        else:
            os.rename(temp_path, config_path)
        return True
    except Exception as e:
        if os.path.exists(temp_path):
            try: os.remove(temp_path)
            except Exception: pass
        print(f"[account_config] Error saving {CONFIG_FILENAME}: {e}")
        return False

def get_all_profiles(enabled_only: bool = False) -> List[Dict[str, Any]]:
    """Returns list of configured profiles."""
    cfg = load_accounts_config()
    profiles = cfg.get("profiles", [])
    if enabled_only:
        return [p for p in profiles if p.get("enabled", True)]
    return profiles

def get_profile_by_id(profile_id: str) -> Optional[Dict[str, Any]]:
    """Finds a profile by its unique string identifier."""
    for p in get_all_profiles():
        if p.get("id") == profile_id:
            return p
    return None

def get_profile_by_account(account_id: Any) -> Optional[Dict[str, Any]]:
    """
    Finds the profile that owns a specific trading account ID or ctidTraderAccountId.
    """
    if account_id is None:
        return None
    acc_str = str(account_id).strip()
    for p in get_all_profiles(enabled_only=True):
        for acc in p.get("accounts", []):
            if str(acc.get("account_id", "")).strip() == acc_str:
                return p
            if str(acc.get("ctid_trader_id", "")).strip() == acc_str:
                return p
    return None

def get_cli_credentials_for_account(account_id: Any) -> Tuple[str, str]:
    """
    Resolves CTID email and password for a given trading account ID.
    Falls back gracefully to legacy credential sources if account is unmapped.
    """
    profile = get_profile_by_account(account_id)
    if profile:
        email = (profile.get("ctid_email") or "").strip()
        pwd = (profile.get("ctid_password") or "").strip()
        if email and pwd:
            return email, pwd

    # Fallback to legacy file
    base_dir = os.path.dirname(__file__)
    txt_path = os.path.join(base_dir, LEGACY_ACCOUNT_FILE)
    file_ctid = ""
    file_pwd = ""
    if os.path.exists(txt_path):
        try:
            with open(txt_path, "r", encoding="utf-8") as f:
                for line in f:
                    line_str = line.strip()
                    if line_str.startswith("CTID_EMAIL="):
                        file_ctid = line_str.split("=", 1)[1].strip().strip('"').strip("'")
                    elif line_str.startswith("CTID_PASSWORD="):
                        file_pwd = line_str.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass
    return file_ctid, file_pwd

def get_open_api_credentials_for_account(account_id: Any) -> Optional[Dict[str, Any]]:
    """
    Resolves Open API credentials (client_id, secret, access_token, environment)
    for a given account ID. Returns None if Open API is unconfigured for this account's profile.
    """
    profile = get_profile_by_account(account_id)
    if profile:
        if profile.get("open_api"):
            oa = profile["open_api"]
            cid = oa.get("client_id", "").strip()
            sec = oa.get("client_secret", "").strip()
            tok = oa.get("access_token", "").strip()
            if cid and sec and tok:
                return {
                    "client_id": cid,
                    "client_secret": sec,
                    "access_token": tok,
                    "environment": oa.get("environment", "live").lower(),
                    "redirect_uri": oa.get("redirect_uri", "https://openapi.ctrader.com/apps/token")
                }
        return None

    # Fallback to legacy ctrader_API.env only if account has no matched profile
    base_dir = os.path.dirname(__file__)
    env_path = os.path.join(base_dir, LEGACY_ENV_FILE)
    if os.path.exists(env_path):
        try:
            c = {}
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line_str = line.strip()
                    if line_str and not line_str.startswith("#") and "=" in line:
                        k, v = line_str.split("=", 1)
                        c[k.strip()] = v.strip().strip('"').strip("'")
            if c.get("clientID") and c.get("secret") and c.get("ACCESS_TOKEN"):
                return {
                    "client_id": c["clientID"],
                    "client_secret": c["secret"],
                    "access_token": c["ACCESS_TOKEN"],
                    "environment": c.get("ENVIRONMENT", "live").lower(),
                    "redirect_uri": c.get("REDIRECT_URI", "https://openapi.ctrader.com/apps/token")
                }
        except Exception:
            pass

    return None

def get_all_configured_accounts(enabled_only: bool = True) -> List[Dict[str, Any]]:
    """
    Returns a flattened list of all trading accounts configured across all profiles,
    enriched with profile metadata.
    """
    results = []
    profiles = get_all_profiles(enabled_only=enabled_only)
    for p in profiles:
        p_id = p.get("id", "")
        p_name = p.get("profile_name", "")
        ctid_email = p.get("ctid_email", "")
        oa = p.get("open_api") or {}
        has_oa = bool(oa.get("client_id") and oa.get("client_secret") and oa.get("access_token"))

        for acc in p.get("accounts", []):
            acc_copy = dict(acc)
            acc_copy["profile_id"] = p_id
            acc_copy["profile_name"] = p_name
            acc_copy["ctid_email"] = ctid_email
            acc_copy["has_open_api"] = has_oa
            if not acc_copy.get("currency"):
                acc_copy["currency"] = "USD"
            if not acc_copy.get("account_type"):
                acc_copy["account_type"] = "demo"
            results.append(acc_copy)
    return results

def sync_accounts_to_database(conn: Optional[sqlite3.Connection] = None) -> int:
    """
    Synchronizes configured accounts from ctrader_accounts.json into SQLite accounts table.
    Performs safe upsert without overriding live broker balance/equity.
    """
    accounts = get_all_configured_accounts(enabled_only=True)
    if not accounts:
        return 0

    should_close = False
    if conn is None:
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "portfolio.db"))
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        should_close = True

    synced_count = 0
    now_iso = datetime.datetime.now().isoformat()
    try:
        c = conn.cursor()
        for acc in accounts:
            acc_id = str(acc.get("account_id", "")).strip()
            if not acc_id:
                continue
            acc_label = acc.get("account_label", f"Account #{acc_id}")
            acc_type = acc.get("account_type", "demo").lower()
            broker = acc.get("broker", "FxPro")
            currency = acc.get("currency", "USD")
            ctid_email = acc.get("ctid_email", "")
            profile_id = acc.get("profile_id", "")

            # Check if account already exists
            c.execute("SELECT account_id, balance, equity FROM accounts WHERE account_id = ?", (acc_id,))
            existing = c.fetchone()
            if existing:
                c.execute("""
                    UPDATE accounts
                    SET account_label = ?, account_type = ?, broker = ?, currency = ?, ctid_email = ?, profile_id = ?
                    WHERE account_id = ?
                """, (acc_label, acc_type, broker, currency, ctid_email, profile_id, acc_id))
            else:
                c.execute("""
                    INSERT INTO accounts (account_id, account_label, account_type, broker, currency, ctid_email, profile_id, balance, equity, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, ?)
                """, (acc_id, acc_label, acc_type, broker, currency, ctid_email, profile_id, now_iso))
            synced_count += 1
        conn.commit()
    finally:
        if should_close:
            conn.close()

    return synced_count

def sanitize_profiles_for_api(profiles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sanitizes sensitive passwords and secrets for public API output."""
    sanitized = []
    for p in profiles:
        p_copy = dict(p)
        if "ctid_password" in p_copy and p_copy["ctid_password"]:
            p_copy["ctid_password"] = "••••••••"
        if "open_api" in p_copy and isinstance(p_copy["open_api"], dict):
            oa_copy = dict(p_copy["open_api"])
            if oa_copy.get("client_secret"):
                oa_copy["client_secret"] = "••••••••"
            if oa_copy.get("access_token"):
                tok = oa_copy["access_token"]
                oa_copy["access_token"] = tok[:6] + "..." + tok[-4:] if len(tok) > 12 else "••••••••"
            p_copy["open_api"] = oa_copy
        sanitized.append(p_copy)
    return sanitized

def update_account_info(account_id: str, updates: Dict[str, Any]) -> bool:
    """
    Updates metadata for an account in ctrader_accounts.json and syncs to SQLite.
    Allowed update fields: account_label, broker, account_type, currency, enabled.
    """
    acc_str = str(account_id).strip()
    cfg = load_accounts_config()
    found = False

    for p in cfg.get("profiles", []):
        for acc in p.get("accounts", []):
            if str(acc.get("account_id", "")).strip() == acc_str:
                for key in ["account_label", "broker", "account_type", "currency", "enabled"]:
                    if key in updates:
                        acc[key] = updates[key]
                found = True
                break
        if found:
            break

    if not found:
        return False

    saved = save_accounts_config(cfg)
    if saved:
        sync_accounts_to_database()
    return saved

def add_account_to_profile(profile_id: str, account_data: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Adds a new trading account to a specified profile.
    """
    acc_id = str(account_data.get("account_id", "")).strip()
    if not acc_id:
        return False, "Account ID cannot be empty."

    cfg = load_accounts_config()
    
    # Check if account_id already exists anywhere
    for p in cfg.get("profiles", []):
        for acc in p.get("accounts", []):
            if str(acc.get("account_id", "")).strip() == acc_id:
                return False, f"Account ID {acc_id} already exists in profile '{p.get('profile_name')}'."

    target_profile = None
    for p in cfg.get("profiles", []):
        if p.get("id") == profile_id:
            target_profile = p
            break

    if not target_profile:
        return False, f"Profile ID '{profile_id}' not found."

    if "accounts" not in target_profile:
        target_profile["accounts"] = []

    new_acc = {
        "account_id": acc_id,
        "account_label": account_data.get("account_label") or f"Account #{acc_id}",
        "broker": account_data.get("broker", "FxPro"),
        "account_type": account_data.get("account_type", "demo").lower(),
        "currency": account_data.get("currency", "USD"),
        "enabled": account_data.get("enabled", True)
    }
    if "ctid_trader_id" in account_data and account_data["ctid_trader_id"]:
        new_acc["ctid_trader_id"] = str(account_data["ctid_trader_id"]).strip()

    target_profile["accounts"].append(new_acc)
    saved = save_accounts_config(cfg)
    if saved:
        sync_accounts_to_database()
        return True, "Account successfully added."
    return False, "Failed to save configuration."

def delete_account(account_id: str) -> bool:
    """
    Removes an account from ctrader_accounts.json and deletes it from SQLite accounts table.
    """
    acc_str = str(account_id).strip()
    cfg = load_accounts_config()
    found = False

    for p in cfg.get("profiles", []):
        accounts = p.get("accounts", [])
        new_accounts = [acc for acc in accounts if str(acc.get("account_id", "")).strip() != acc_str]
        if len(new_accounts) < len(accounts):
            p["accounts"] = new_accounts
            found = True
            break

    if not found:
        return False

    saved = save_accounts_config(cfg)
    if saved:
        # Also remove from SQLite accounts table
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "portfolio.db"))
        try:
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("DELETE FROM accounts WHERE account_id = ?", (acc_str,))
            conn.commit()
            conn.close()
        except Exception as ex:
            print(f"[account_config] Error deleting account from DB: {ex}")
    return saved

def get_raw_json_config() -> str:
    """
    Returns raw JSON string of ctrader_accounts.json.
    """
    config_path = get_config_path()
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"[account_config] Error reading raw JSON: {e}")
    
    # Return formatted fallback config
    return json.dumps(load_accounts_config(), indent=2, ensure_ascii=False)

def save_raw_json_config(raw_json_str: str) -> Tuple[bool, str]:
    """
    Validates and saves a raw JSON string into ctrader_accounts.json.
    """
    try:
        data = json.loads(raw_json_str)
    except json.JSONDecodeError as ex:
        return False, f"JSON Syntax Error: {ex}"

    if not isinstance(data, dict) or "profiles" not in data or not isinstance(data["profiles"], list):
        return False, "Invalid format: Root object must contain a 'profiles' list."

    saved = save_accounts_config(data)
    if saved:
        synced = sync_accounts_to_database()
        return True, f"Configuration saved and {synced} accounts synced to database."
    return False, "Failed to write configuration file."

def refresh_profile_open_api_token(profile_id: str) -> Dict[str, Any]:
    """
    Refreshes the OAuth2 Access Token for a profile using Spotware Open API.
    """
    profile = get_profile_by_id(profile_id)
    if not profile:
        return {"status": "error", "message": f"Profile '{profile_id}' not found."}

    oa = profile.get("open_api") or {}
    client_id = oa.get("client_id", "").strip()
    client_secret = oa.get("client_secret", "").strip()
    refresh_token = oa.get("refresh_token", "").strip()
    redirect_uri = oa.get("redirect_uri", "https://openapi.ctrader.com/apps/token").strip()

    if not client_id or not client_secret:
        return {"status": "error", "message": "Missing client_id or client_secret for this profile."}
    if not refresh_token:
        return {"status": "error", "message": "No refresh_token found for this profile. Please configure refresh_token first."}

    try:
        from ctrader_open_api.auth import Auth
        auth = Auth(client_id, client_secret, redirect_uri)
        res = auth.refreshToken(refresh_token)

        if not isinstance(res, dict):
            return {"status": "error", "message": f"Unexpected response from cTrader: {res}"}

        if "accessToken" in res:
            new_access_token = res["accessToken"]
            new_refresh_token = res.get("refreshToken", refresh_token)
            expires_in = res.get("expiresIn", 2592000)

            # Update profile in ctrader_accounts.json
            cfg = load_accounts_config()
            for p in cfg.get("profiles", []):
                if p.get("id") == profile_id:
                    if "open_api" not in p:
                        p["open_api"] = {}
                    p["open_api"]["access_token"] = new_access_token
                    p["open_api"]["refresh_token"] = new_refresh_token
                    p["open_api"]["last_refreshed"] = datetime.datetime.now().isoformat()
                    break
            save_accounts_config(cfg)

            return {
                "status": "success",
                "message": "Token refreshed successfully.",
                "expires_in": expires_in,
                "access_token_masked": new_access_token[:6] + "..." + new_access_token[-4:]
            }
        else:
            err_code = res.get("errorCode", "UNKNOWN_ERROR")
            err_desc = res.get("errorDescription", res.get("description", str(res)))
            return {"status": "error", "message": f"cTrader Open API Error: {err_code} - {err_desc}"}

    except Exception as ex:
        return {"status": "error", "message": f"Token refresh exception: {ex}"}

async def test_profile_open_api_connection(profile_id: str) -> Dict[str, Any]:
    """
    Tests Open API connectivity and credentials validity for a specific profile.
    """
    profile = get_profile_by_id(profile_id)
    if not profile:
        return {"status": "error", "message": f"Profile '{profile_id}' not found."}

    oa = profile.get("open_api") or {}
    client_id = oa.get("client_id", "").strip()
    client_secret = oa.get("client_secret", "").strip()
    access_token = oa.get("access_token", "").strip()
    environment = oa.get("environment", "demo").lower().strip()

    if not client_id or not client_secret:
        return {"status": "error", "message": "Missing client_id or client_secret."}
    if not access_token:
        return {"status": "error", "message": "Missing access_token."}

    from ctrader_open_api_client import CTraderOpenAPIClient
    client = CTraderOpenAPIClient(environment=environment, timeout=10.0)
    try:
        t0 = datetime.datetime.now()
        await client.connect(max_retries=2)
        await client.authorize_application(client_id, client_secret)
        raw_accounts = await client.get_accounts_by_access_token(access_token)
        latency_ms = int((datetime.datetime.now() - t0).total_seconds() * 1000)

        accounts_summary = []
        for acc in raw_accounts:
            accounts_summary.append({
                "ctidTraderAccountId": getattr(acc, "ctidTraderAccountId", None),
                "isLive": getattr(acc, "isLive", False),
                "traderLogin": getattr(acc, "traderLogin", None)
            })

        return {
            "status": "success",
            "connected": True,
            "latency_ms": latency_ms,
            "environment": environment,
            "account_count": len(accounts_summary),
            "accounts": accounts_summary
        }
    except Exception as ex:
        return {
            "status": "error",
            "connected": False,
            "message": str(ex)
        }
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass

def get_account_details_with_stats(conn: Optional[sqlite3.Connection] = None) -> List[Dict[str, Any]]:
    """
    Returns full account list merged with runtime balance, equity, and active bot counts.
    """
    accounts = get_all_configured_accounts(enabled_only=False)
    should_close = False
    if conn is None:
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "portfolio.db"))
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        should_close = True

    results = []
    try:
        c = conn.cursor()
        for acc in accounts:
            acc_id = str(acc.get("account_id", "")).strip()
            item = dict(acc)
            
            # Query SQLite for balance, equity, last_updated
            c.execute("SELECT balance, equity, last_updated FROM accounts WHERE account_id = ?", (acc_id,))
            db_row = c.fetchone()
            if db_row:
                item["balance"] = db_row["balance"] if db_row["balance"] is not None else 0.0
                item["equity"] = db_row["equity"] if db_row["equity"] is not None else 0.0
                item["last_updated"] = db_row["last_updated"]
            else:
                item["balance"] = 0.0
                item["equity"] = 0.0
                item["last_updated"] = None

            # Count running bots on this account
            c.execute("SELECT COUNT(*) FROM bot_instances WHERE account_id = ? AND status IN ('RUNNING', 'STARTING')", (acc_id,))
            running_count = c.fetchone()[0]
            item["running_bots"] = running_count

            # Total bots configured on this account
            c.execute("SELECT COUNT(*) FROM bot_instances WHERE account_id = ?", (acc_id,))
            total_count = c.fetchone()[0]
            item["total_bots"] = total_count

            results.append(item)
    finally:
        if should_close:
            conn.close()

    return results
