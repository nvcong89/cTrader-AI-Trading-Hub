import subprocess
import json
import re
import os
import sqlite3
import datetime
from database import get_db, log_message
from bot_manager import get_ctrader_cli_path, get_ctrader_credentials

def fetch_account_cli_data(ctid: str, pwd_file: str, account_id: str, timeout_sec: int = 25):
    """
    Executes ctrader-cli interactive session via stdin to read real-time broker positions, orders, and stats.
    """
    if not os.path.exists(pwd_file):
        # Look for existing runtime password files
        base_dir = os.path.dirname(os.path.abspath(__file__))
        for f in os.listdir(base_dir):
            if f.startswith(".runtime_pwd") and f.endswith(".txt"):
                pwd_file = os.path.join(base_dir, f)
                break

    cli_exe = get_ctrader_cli_path()
    cmd = [
        cli_exe,
        f'--ctid={ctid}',
        f'--pwd-file={pwd_file}',
        f'--account={account_id}'
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        # Send interactive inspect commands
        commands = "positions\norders\naccount\nquit\n"
        stdout, stderr = proc.communicate(input=commands, timeout=timeout_sec)
        
        return parse_cli_output(stdout, stderr)
    except subprocess.TimeoutExpired:
        proc.kill()
        return {"positions": [], "orders": [], "account": {}, "error": "cTrader CLI session timed out after 25s"}
    except Exception as e:
        return {"positions": [], "orders": [], "account": {}, "error": str(e)}

def parse_cli_output(stdout, stderr):
    data = {"positions": [], "orders": [], "account": {}, "success": False}
    if "Connected as" in stdout or "positions" in stdout or "Logged in" in stdout:
        data["success"] = True
    for match in re.finditer(r'\{\s*"([a-zA-Z0-9_\-]+)"\s*:\s*(\[[^\]]*\]|\{[^\}]*\})\s*\}', stdout):
        try:
            full_json_str = match.group(0)
            parsed = json.loads(full_json_str)
            for k, v in parsed.items():
                if k in data:
                    data[k] = v
                    if k == "positions": data["success"] = True
        except Exception:
            pass

    # Also capture raw account JSON object containing equity / balance
    if not data.get("account"):
        for m in re.finditer(r'\{[^{}]*"equity"[^{}]*\}', stdout, re.DOTALL):
            try:
                acc_obj = json.loads(m.group(0))
                data["account"] = acc_obj
                break
            except Exception:
                pass

    return data

def sync_ctrader_broker_positions():
    """
    Queries all configured bot instances and accounts, runs cTrader CLI to fetch live broker positions,
    and synchronizes the SQLite positions and accounts table.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        SELECT account_id, MAX(ctid_email) as ctid_email, MAX(ctid_password) as ctid_password 
        FROM bot_instances 
        WHERE account_id IS NOT NULL AND account_id != '' 
        AND status IN ('RUNNING', 'STARTING')
        GROUP BY account_id
    """)
    raw_instances = c.fetchall()
    instances = [dict(r) for r in raw_instances]
    conn.close()

    if not instances:
        return {
            "status": "success",
            "positions_count": 0,
            "orders_count": 0,
            "message": "Không có bot nào đang hoạt động. Sổ lệnh đã được giữ trống an toàn."
        }

    synced_positions_total = 0
    synced_orders_total = 0

    base_dir = os.path.dirname(os.path.abspath(__file__))

    for inst in instances:
        account_id = str(inst["account_id"])
        ctid, password = get_ctrader_credentials(inst)
        if not ctid:
            continue
        
        # Locate or generate pwd file
        pwd_file = os.path.join(base_dir, f".runtime_pwd_{account_id}.txt")
        if password:
            with open(pwd_file, "w", encoding="utf-8") as pf:
                pf.write(password.strip() + "\n")
        elif not os.path.exists(pwd_file):
            for f in os.listdir(base_dir):
                if f.startswith(".runtime_pwd") and f.endswith(".txt"):
                    pwd_file = os.path.join(base_dir, f)
                    break

        broker_data = fetch_account_cli_data(ctid, pwd_file, account_id)
        if not broker_data.get("success", False) or broker_data.get("error"):
            log_message("SYSTEM", "WARNING", f"Skipping position deletion for account {account_id} due to CLI connection glitch: {broker_data.get('error')}")
            continue

        cli_positions = broker_data.get("positions", [])
        cli_orders = broker_data.get("orders", [])

        # Sync active positions into SQLite
        cli_pos_ids = [p["id"] for p in cli_positions]

        # Open short-lived connection to apply database updates
        conn = get_db()
        c = conn.cursor()

        # 1. Close/Delete positions in DB for this account that are no longer in broker (ONLY on verified success)
        c.execute("SELECT id, ctrader_id, bot_id, symbol, side, volume, entry_price, entry_time FROM positions WHERE account_id = ?", (account_id,))
        raw_db_pos = c.fetchall()
        existing_db_pos = [dict(r) for r in raw_db_pos]

        for db_p in existing_db_pos:
            if db_p["ctrader_id"] and db_p["ctrader_id"] not in cli_pos_ids:
                now = datetime.datetime.now().isoformat()
                c.execute('''
                    INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, entry_time, exit_time, reason)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'Closed on Broker')
                ''', (db_p["ctrader_id"], account_id, db_p.get("bot_id"), db_p.get("symbol"), db_p.get("side"), db_p.get("volume"), db_p.get("entry_price"), db_p.get("entry_price"), db_p.get("entry_time"), now))
                c.execute("DELETE FROM positions WHERE id = ?", (db_p["id"],))

        # 2. Upsert broker positions into DB
        for p in cli_positions:
            pos_id = p["id"]
            symbol = p["symbolName"]
            side = p["tradeSide"].upper()
            vol = p.get("volumeLots", 0.01)
            entry_p = p.get("entryPrice", 0.0)
            
            # SL and TP prices & pips
            sl_p = p.get("stopLoss")
            tp_p = p.get("takeProfit")
            sl_pips = p.get("stopLossPips")
            tp_pips = p.get("takeProfitPips")
            
            # Pip size and contract multiplier
            pip_size = 0.01 if ("JPY" in symbol or "XAU" in symbol or "GOLD" in symbol) else 0.0001
            contract_mult = 100.0 if ("XAU" in symbol or "GOLD" in symbol) else 100000.0
            
            # Get latest known market price from DB accounts / positions if currentPrice is null
            cur_p = p.get("currentPrice")
            if not cur_p:
                c.execute("SELECT current_price FROM positions WHERE symbol = ? AND current_price IS NOT NULL ORDER BY id DESC LIMIT 1", (symbol,))
                cached_price = c.fetchone()
                if cached_price and cached_price["current_price"]:
                    cur_p = cached_price["current_price"]
                else:
                    cur_p = entry_p

            is_buy = (side == "BUY")
            if is_buy:
                pnl_pips = round((cur_p - entry_p) / pip_size, 1)
                pnl_val = round((cur_p - entry_p) * vol * (100.0 if "XAU" in symbol or "GOLD" in symbol else 10.0), 2)
            else:
                pnl_pips = round((entry_p - cur_p) / pip_size, 1)
                pnl_val = round((entry_p - cur_p) * vol * (100.0 if "XAU" in symbol or "GOLD" in symbol else 10.0), 2)

            if p.get("netProfit") is not None:
                pnl_val = p.get("netProfit")
            elif p.get("grossProfit") is not None:
                pnl_val = p.get("grossProfit")
            elif not cached_price and not p.get("currentPrice"):
                pnl_val = None

            if p.get("pips") is not None:
                pnl_pips = p.get("pips")

            entry_t = p.get("openTime") or datetime.datetime.now().isoformat()
            bot_lbl = p.get("label") or "cBot"

            c.execute("SELECT id FROM positions WHERE ctrader_id = ? AND account_id = ?", (pos_id, account_id))
            found = c.fetchone()
            if found:
                if pnl_val is not None:
                    c.execute('''
                        UPDATE positions SET
                            current_price = ?, pnl = ?, pnl_pips = ?,
                            sl_price = ?, tp_price = ?, sl_pips = ?, tp_pips = ?
                        WHERE id = ?
                    ''', (cur_p, pnl_val, pnl_pips, sl_p, tp_p, sl_pips, tp_pips, found["id"]))
                else:
                    c.execute('''
                        UPDATE positions SET
                            sl_price = ?, tp_price = ?, sl_pips = ?, tp_pips = ?
                        WHERE id = ?
                    ''', (sl_p, tp_p, sl_pips, tp_pips, found["id"]))
            else:
                c.execute('''
                    INSERT INTO positions (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, current_price, pnl, pnl_pips, sl_price, tp_price, sl_pips, tp_pips, entry_time, reason)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (pos_id, account_id, bot_lbl, symbol, side, vol, entry_p, cur_p, pnl_val, pnl_pips, sl_p, tp_p, sl_pips, tp_pips, entry_t, "Broker CLI Sync"))

            synced_positions_total += 1
        synced_orders_total += len(cli_orders)

        # Also sync account balance and equity into accounts table if captured
        cli_account = broker_data.get("account", {})
        if cli_account and ("balance" in cli_account or "equity" in cli_account):
            now_iso = datetime.datetime.now().isoformat()
            acc_bal = float(cli_account.get("balance", 0.0) or 0.0)
            acc_eq = float(cli_account.get("equity", acc_bal) or 0.0)
            c.execute("""
                UPDATE accounts
                SET balance = ?, equity = ?, last_updated = ?
                WHERE account_id = ?
            """, (acc_bal, acc_eq, now_iso, account_id))

        conn.commit()
        conn.close()

    log_message("SYSTEM", "INFO", f"CLI Broker Sync completed: {synced_positions_total} positions, {synced_orders_total} orders updated.")
    return {
        "status": "success",
        "positions_count": synced_positions_total,
        "orders_count": synced_orders_total,
        "message": f"Successfully synchronized {synced_positions_total} active positions from Spotware broker."
    }

# Backward compatibility alias
sync_broker_positions_with_db = sync_ctrader_broker_positions

def close_broker_position(position_id: int, account_id: str = None):
    """
    Executes ctrader-cli 'position close <position_id>' to close the position directly on the broker.
    """
    conn = get_db()
    c = conn.cursor()
    
    ctrader_id = position_id
    if not account_id:
        c.execute("SELECT account_id, ctrader_id FROM positions WHERE id = ? OR ctrader_id = ?", (position_id, position_id))
        pos = c.fetchone()
        if pos:
            account_id = pos["account_id"]
            if pos["ctrader_id"]:
                ctrader_id = pos["ctrader_id"]
        else:
            c.execute("SELECT account_id FROM bot_instances WHERE status = 'RUNNING' LIMIT 1")
            running_inst = c.fetchone()
            account_id = running_inst["account_id"] if running_inst and running_inst["account_id"] else ""

    c.execute("SELECT MAX(ctid_email) as ctid_email, MAX(ctid_password) as ctid_password FROM bot_instances WHERE account_id = ?", (account_id,))
    inst = dict(c.fetchone()) if c.fetchone() else None
    conn.close()

    ctid, password = get_ctrader_credentials(inst)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    pwd_file = os.path.join(base_dir, f".runtime_pwd_{account_id}.txt")
    if not os.path.exists(pwd_file) and password:
        with open(pwd_file, "w", encoding="utf-8") as pf:
            pf.write(password + "\n")
    elif not os.path.exists(pwd_file):
        for f in os.listdir(base_dir):
            if f.startswith(".runtime_pwd") and f.endswith(".txt"):
                pwd_file = os.path.join(base_dir, f)
                break

    cli_exe = get_ctrader_cli_path()
    cmd = [
        cli_exe,
        f'--ctid={ctid}',
        f'--pwd-file={pwd_file}',
        f'--account={account_id}'
    ]

    try:
        p = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdin_input = f"position close {ctrader_id} yes\nquit\n"
        stdout, stderr = p.communicate(input=stdin_input, timeout=25)
        
        # Check if refused or error in stdout
        if "Refused" in stdout or "Error:" in stdout:
            log_message("SYSTEM", "ERROR", f"cTrader CLI close refused: {stdout}")
            return {"status": "error", "message": f"cTrader CLI close refused: {stdout}", "output": stdout}
            
        # After executing close, sync database with broker
        sync_broker_positions_with_db()
        log_message("SYSTEM", "INFO", f"Closed position #{ctrader_id} on broker via cTrader CLI.")
        return {"status": "success", "message": f"Position #{ctrader_id} closed on broker successfully.", "output": stdout}
    except Exception as e:
        log_message("SYSTEM", "ERROR", f"Failed to close position #{ctrader_id} via cTrader CLI: {str(e)}")
        return {"status": "error", "message": str(e)}

def close_all_broker_positions(account_id: str = None):
    """
    Closes all open positions on the broker by querying positions and executing position close for each.
    """
    conn = get_db()
    c = conn.cursor()
    if account_id:
        c.execute("SELECT DISTINCT ctrader_id, account_id FROM positions WHERE account_id = ? AND ctrader_id IS NOT NULL", (account_id,))
    else:
        c.execute("SELECT DISTINCT ctrader_id, account_id FROM positions WHERE ctrader_id IS NOT NULL")
    rows = c.fetchall()
    conn.close()

    closed_count = 0
    errors = []
    for r in rows:
        pos_id = r["ctrader_id"]
        acc = r["account_id"]
        res = close_broker_position(pos_id, acc)
        if res.get("status") == "success":
            closed_count += 1
        else:
            errors.append(res.get("message"))

    sync_broker_positions_with_db()
    return {"status": "success", "closed_count": closed_count, "errors": errors}
