import subprocess
import os
import psutil
import datetime
import json
import time
import shutil
from typing import Optional, Dict, Any, List
from database import get_db, log_message
import asyncio

def get_algo_filename(path: Optional[str]) -> str:
    """
    Extracts the bare algo filename across platforms, handling both Windows (\\) and Unix (/) path separators.
    Example: 'C:\\Users\\Admin\\...\\Bot.algo' -> 'Bot.algo'
    """
    if not path:
        return ""
    return str(path).replace('\\', '/').split('/')[-1].strip()

def get_ctrader_cli_path() -> str:
    """
    Locates ctrader-cli executable dynamically:
    1. Checks system PATH
    2. Searches Linux paths (/usr/local/bin, /opt/ctrader-cli, Homebrew)
    3. Searches Windows LocalAppData and Program Files
    """
    found = shutil.which("ctrader-cli")
    if found:
        return found

    # Common Linux locations
    linux_paths = [
        "/usr/local/bin/ctrader-cli",
        "/opt/ctrader-cli/ctrader-cli",
        "/home/linuxbrew/.linuxbrew/bin/ctrader-cli",
        os.path.expanduser("~/.linuxbrew/bin/ctrader-cli")
    ]
    for lp in linux_paths:
        if os.path.exists(lp) and os.access(lp, os.X_OK):
            return lp

    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        spotware_dir = os.path.join(local_app_data, "Spotware", "cTrader")
        if os.path.exists(spotware_dir):
            for root, dirs, files in os.walk(spotware_dir):
                if "ctrader-cli.exe" in files:
                    return os.path.join(root, "ctrader-cli.exe")

    for env_var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"]:
        pf = os.environ.get(env_var, "")
        if pf:
            spotware_dir = os.path.join(pf, "Spotware")
            if os.path.exists(spotware_dir):
                for root, dirs, files in os.walk(spotware_dir):
                    if "ctrader-cli.exe" in files:
                        return os.path.join(root, "ctrader-cli.exe")

    return "ctrader-cli"

def get_ctrader_credentials(bot=None):
    """
    Get valid CTID email and password.
    Prioritizes:
    1. Direct bot instance credentials (if valid email with '@' and password present).
    2. Account profile from account_config (ctrader_accounts.json) matched by account_id.
    3. Master ctrader_account.txt fallback.
    """
    bot_ctid = ""
    bot_pwd = ""
    account_id = None
    if bot:
        if isinstance(bot, dict):
            bot_ctid = (bot.get('ctid_email') or "").strip().strip('"').strip("'")
            bot_pwd = (bot.get('ctid_password') or "").strip().strip('"').strip("'")
            account_id = bot.get('account_id')

    # 1. Direct bot instance credentials
    if bot_ctid and "@" in bot_ctid and bot_pwd:
        return bot_ctid.strip(), bot_pwd.strip()

    # 2. Lookup via account_config (ctrader_accounts.json)
    if account_id:
        try:
            from account_config import get_cli_credentials_for_account
            cfg_email, cfg_pwd = get_cli_credentials_for_account(account_id)
            if cfg_email and "@" in cfg_email and cfg_pwd:
                return cfg_email.strip(), cfg_pwd.strip()
        except Exception as ex:
            log_message("SYSTEM", "DEBUG", f"account_config credential lookup error: {ex}")

    # 3. Master ctrader_account.txt fallback
    file_ctid = ""
    file_pwd = ""
    cred_file = os.path.join(os.path.dirname(__file__), "ctrader_account.txt")
    if os.path.exists(cred_file):
        try:
            with open(cred_file, "r", encoding="utf-8") as f:
                for line in f:
                    line_str = line.strip()
                    if line_str.startswith("CTID_EMAIL="):
                        file_ctid = line_str.split("=", 1)[1].strip().strip('"').strip("'")
                    elif line_str.startswith("CTID_PASSWORD="):
                        file_pwd = line_str.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception as e:
            log_message("SYSTEM", "WARN", f"Error reading ctrader_account.txt: {e}")

    ctid = bot_ctid if (bot_ctid and "@" in bot_ctid) else file_ctid
    password = bot_pwd if bot_pwd else file_pwd

    return ctid.strip(), password.strip()

# Official FxPro cTrader Index, Commodity & Crypto Symbols
FXPRO_OFFICIAL_SYMBOLS = {
    "#USNDAQ100", "#US30", "#USSPX500", "#Japan225", "#Germany40", "#UK100",
    "#Euro50", "#AUS200", "#HongKong50", "#France40", "#Swiss20", "#Spain35",
    "#ChinaA50", "#US2000", "#GerTech30", "#Germany50", "#Holland25", "#ChinaHShar", "#France120",
    # Official FxPro Crypto symbols (named literally vs USD)
    "BITCOIN", "ETHEREUM", "BITCOINCASH", "ETHCLASSIC", "LITECOIN", "XRP",
    "DOGECOIN", "SOLANA", "CARDANO", "POLKADOT", "CHAINLINK", "AVALANCHE",
    "BINANCECOIN", "NEAR", "APTOS", "TRON", "UNISWAP", "HEDERA", "ALGORAND",
    "COSMOS", "FILECOIN", "INTERNET", "GRAPH", "STELLAR"
}

# FxPro alias mapping (resolves user variations to official FxPro symbol)
FXPRO_SYMBOL_MAP: Dict[str, str] = {
    # Indices
    "USTECH100": "#USNDAQ100", "USTECH": "#USNDAQ100", "USTEC": "#USNDAQ100",
    "NAS100": "#USNDAQ100", "NASDAQ100": "#USNDAQ100", "US100": "#USNDAQ100",
    "NDX100": "#USNDAQ100", "USNDAQ100": "#USNDAQ100", "NASDAQ": "#USNDAQ100",
    "US30": "#US30", "DJ30": "#US30", "DOW30": "#US30", "WALLSTREET30": "#US30", "WS30": "#US30",
    "US500": "#USSPX500", "SPX500": "#USSPX500", "SP500": "#USSPX500", "USSPX500": "#USSPX500",
    "JAPAN225": "#Japan225", "JP225": "#Japan225", "NIKKEI225": "#Japan225", "NI225": "#Japan225",
    "GERMANY40": "#Germany40", "GER40": "#Germany40", "DAX40": "#Germany40",
    "UK100": "#UK100", "FTSE100": "#UK100",
    "EUROPE50": "#Euro50", "EURO50": "#Euro50", "EU50": "#Euro50",
    "AUSTRALIA200": "#AUS200", "AUS200": "#AUS200",
    "HONGKONG50": "#HongKong50", "HK50": "#HongKong50",
    "FRANCE40": "#France40", "CAC40": "#France40",
    "SWITZERLAND20": "#Swiss20", "SWISS20": "#Swiss20", "SMI20": "#Swiss20",
    "SPAIN35": "#Spain35", "IBEX35": "#Spain35",
    "CHINAA50": "#ChinaA50", "A50": "#ChinaA50",
    "US2000": "#US2000", "RUSSELL2000": "#US2000",
    # Crypto (FxPro literal names)
    "BTCUSD": "BITCOIN", "BTC": "BITCOIN", "XBTUSD": "BITCOIN", "XBT": "BITCOIN", "BITCOIN": "BITCOIN",
    "ETHUSD": "ETHEREUM", "ETH": "ETHEREUM", "ETHEREUM": "ETHEREUM",
    "BCHUSD": "BITCOINCASH", "BCH": "BITCOINCASH", "BITCOINCASH": "BITCOINCASH",
    "ETCUSD": "ETHCLASSIC", "ETC": "ETHCLASSIC", "ETHCLASSIC": "ETHCLASSIC",
    "LTCUSD": "LITECOIN", "LTC": "LITECOIN", "LITECOIN": "LITECOIN",
    "XRPUSD": "XRP", "XRP": "XRP", "RIPPLE": "XRP",
    "DOGEUSD": "DOGECOIN", "DOGE": "DOGECOIN", "DOGECOIN": "DOGECOIN",
    "SOLUSD": "SOLANA", "SOL": "SOLANA", "SOLANA": "SOLANA",
    "ADAUSD": "CARDANO", "ADA": "CARDANO", "CARDANO": "CARDANO",
    "DOTUSD": "POLKADOT", "DOT": "POLKADOT", "POLKADOT": "POLKADOT",
    "LINKUSD": "CHAINLINK", "LINK": "CHAINLINK", "CHAINLINK": "CHAINLINK",
    "AVAXUSD": "AVALANCHE", "AVAX": "AVALANCHE", "AVALANCHE": "AVALANCHE",
    "BNBUSD": "BINANCECOIN", "BNB": "BINANCECOIN", "BINANCECOIN": "BINANCECOIN",
    "NEARUSD": "NEAR", "NEAR": "NEAR",
    "APTUSD": "APTOS", "APTOS": "APTOS",
    "TRXUSD": "TRON", "TRON": "TRON",
    "UNIUSD": "UNISWAP", "UNISWAP": "UNISWAP",
    "HBARUSD": "HEDERA", "HEDERA": "HEDERA",
    "ALGOUSD": "ALGORAND", "ALGORAND": "ALGORAND",
    "ATOMUSD": "COSMOS", "COSMOS": "COSMOS",
    "FILUSD": "FILECOIN", "FILECOIN": "FILECOIN",
    "ICPUSD": "INTERNET", "INTERNET": "INTERNET",
    "GRTUSD": "GRAPH", "GRAPH": "GRAPH",
    "XLMUSD": "STELLAR", "STELLAR": "STELLAR"
}

# Standard cTrader brokers mapping (Spotware Demo, IC Markets, Pepperstone)
STANDARD_SYMBOL_MAP: Dict[str, str] = {
    "US30": "US 30", "DJ30": "US 30", "DOW30": "US 30", "WALLSTREET30": "US 30", "WS30": "US 30",
    "US500": "US 500", "SPX500": "US 500", "SP500": "US 500", "USSPX500": "US 500",
    "USTECH100": "US TECH 100", "USTECH": "US TECH 100", "USTEC": "US TECH 100",
    "NAS100": "US TECH 100", "NASDAQ100": "US TECH 100", "US100": "US TECH 100", "USNDAQ100": "US TECH 100", "NASDAQ": "US TECH 100",
    "JAPAN225": "JAPAN 225", "JP225": "JAPAN 225", "NIKKEI225": "JAPAN 225", "NI225": "JAPAN 225",
    "GERMANY40": "GERMANY 40", "GER40": "GERMANY 40", "DAX40": "GERMANY 40",
    "UK100": "UK 100", "FTSE100": "UK 100",
    "EUROPE50": "EUROPE 50", "EURO50": "EUROPE 50", "EU50": "EUROPE 50",
    "AUSTRALIA200": "AUSTRALIA 200", "AUS200": "AUSTRALIA 200",
    "HONGKONG50": "HONG KONG 50", "HK50": "HONG KONG 50",
    "FRANCE40": "FRANCE 40", "CAC40": "FRANCE 40",
    "SWITZERLAND20": "SWITZERLAND 20", "SWISS20": "SWITZERLAND 20",
    "SPAIN35": "SPAIN 35", "IBEX35": "SPAIN 35",
    "CHINAA50": "CHINA A50", "A50": "CHINA A50",
    "US2000": "US 2000", "RUSSELL2000": "US 2000",
    # Crypto (Standard brokers use ticker + USD format)
    "BITCOIN": "BTCUSD", "BTC": "BTCUSD", "BTCUSD": "BTCUSD", "XBTUSD": "BTCUSD",
    "ETHEREUM": "ETHUSD", "ETH": "ETHUSD", "ETHUSD": "ETHUSD",
    "BITCOINCASH": "BCHUSD", "BCH": "BCHUSD", "BCHUSD": "BCHUSD",
    "ETHCLASSIC": "ETCUSD", "ETC": "ETCUSD", "ETCUSD": "ETCUSD",
    "LITECOIN": "LTCUSD", "LTC": "LTCUSD", "LTCUSD": "LTCUSD",
    "SOLANA": "SOLUSD", "SOL": "SOLUSD", "SOLUSD": "SOLUSD",
    "CARDANO": "ADAUSD", "ADA": "ADAUSD", "ADAUSD": "ADAUSD",
    "DOGECOIN": "DOGEUSD", "DOGE": "DOGEUSD", "DOGEUSD": "DOGEUSD",
    "POLKADOT": "DOTUSD", "DOT": "DOTUSD", "DOTUSD": "DOTUSD",
    "CHAINLINK": "LINKUSD", "LINK": "LINKUSD", "LINKUSD": "LINKUSD",
    "AVALANCHE": "AVAXUSD", "AVAX": "AVAXUSD", "AVAXUSD": "AVAXUSD",
    "BINANCECOIN": "BNBUSD", "BNB": "BNBUSD", "BNBUSD": "BNBUSD"
}

def get_account_broker(account_id: Optional[str], bot: Optional[Dict] = None) -> str:
    """
    Determines broker name for a given account_id.
    Returns 'FxPro', 'Spotware', 'IC Markets', 'Pepperstone', or 'Default'.
    """
    if not account_id:
        return "Default"
    
    acc_str = str(account_id).strip()

    # 1. Check account_label or bot name hints
    if bot:
        label = (bot.get("account_label") or "").upper()
        name = (bot.get("name") or "").upper()
        if "FXPRO" in label or "FXPRO" in name:
            return "FxPro"

    # 2. Check accounts database table
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute("PRAGMA table_info(accounts)")
        cols = {row[1] for row in c.fetchall()}
        if "broker" in cols:
            c.execute("SELECT broker, account_label FROM accounts WHERE account_id = ?", (acc_str,))
            row = c.fetchone()
            if row:
                if row[0] and row[0].strip():
                    conn.close()
                    return row[0].strip()
                if row[1] and "FXPRO" in row[1].upper():
                    conn.close()
                    return "FxPro"
        conn.close()
    except Exception:
        pass

    # 3. Known account numbering patterns (FxPro cTrader account ranges)
    if acc_str.startswith("82") or acc_str.startswith("45") or acc_str.startswith("8"):
        return "FxPro"
    if acc_str.startswith("437") or acc_str.startswith("40"):
        return "Spotware"

    return "Default"

def normalize_symbol(symbol: Optional[str], broker: Optional[str] = None) -> str:
    """
    Normalizes user-input or legacy MT-style symbols according to broker specification.
    - FxPro uses '#' prefixed symbols without spaces (e.g. #USNDAQ100, #US30, #USSPX500).
    - Standard cTrader brokers use space-separated names (e.g. US TECH 100, US 30, US 500).
    """
    if not symbol:
        return ""
    cleaned = str(symbol).strip()

    norm_key = cleaned.upper().replace("-", "").replace("_", "").replace(" ", "").lstrip("#")

    # 1. If broker is FxPro (or account belongs to FxPro)
    is_fxpro = broker and "FXPRO" in str(broker).upper()
    if is_fxpro:
        # Exact match with official FxPro symbols (preserve case-sensitively)
        for fx_sym in FXPRO_OFFICIAL_SYMBOLS:
            if cleaned.upper() == fx_sym.upper():
                return fx_sym
        if norm_key in FXPRO_SYMBOL_MAP:
            return FXPRO_SYMBOL_MAP[norm_key]
        return cleaned

    # 2. Standard cTrader brokers (Spotware, IC Markets, Pepperstone)
    if norm_key in STANDARD_SYMBOL_MAP:
        return STANDARD_SYMBOL_MAP[norm_key]

    return cleaned

class BotManager:
    def __init__(self):
        self.active_processes = {}
        self.crash_restart_attempts = {}
        self.crash_restart_last_success = {}
        os.makedirs("logs", exist_ok=True)

    def is_process_running(self, pid: Optional[int]) -> bool:
        if not pid or pid <= 4:  # PID 0 is Idle, PID 4 is System on Windows
            return False
        try:
            p = psutil.Process(pid)
            if not (p.is_running() and p.status() != psutil.STATUS_ZOMBIE):
                return False
            
            # Instantaneous name check: reads process image name in < 0.1ms without hanging
            try:
                proc_name = p.name().lower()
            except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess):
                return False

            # Verify if process executable name belongs to cTrader CLI or dotnet runtime
            if any(k in proc_name for k in ["ctrader", "dotnet", "cbot"]):
                return True

            # Any other process name is a foreign/system process and not our bot
            return False
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return False
        except Exception:
            return False

    def _force_set_bot_stopped_in_db(self, bot_id: int):
        """Cleanly and safely updates a bot instance status to STOPPED and resets pid to NULL.
        If the bot's account has no other running or starting bots, purges positions for that account."""
        conn = None
        try:
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT account_id FROM bot_instances WHERE id = ?", (bot_id,))
            b_row = c.fetchone()
            acc_id = str(b_row['account_id']) if (b_row and b_row['account_id']) else None

            c.execute("UPDATE bot_instances SET status = 'STOPPED', pid = NULL WHERE id = ?", (bot_id,))
            conn.commit()

            if acc_id:
                c.execute("SELECT COUNT(*) FROM bot_instances WHERE account_id = ? AND status IN ('RUNNING', 'STARTING')", (acc_id,))
                remaining_active = c.fetchone()[0]
                if remaining_active == 0:
                    c.execute("DELETE FROM positions WHERE account_id = ?", (acc_id,))
                    deleted_pos = c.rowcount if c.rowcount and c.rowcount > 0 else 0
                    conn.commit()
                    if deleted_pos > 0:
                        log_message("SYSTEM", "INFO", f"[Bot Stop] Purged {deleted_pos} stale positions for account {acc_id} (no active bots remaining).")
        except Exception as e:
            log_message(f"BOT_{bot_id}", "ERROR", f"Failed to reset status to STOPPED in DB: {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def sync_stale_processes(self):
        """
        Scans all bot instances in database. If a bot is marked RUNNING but its PID is dead,
        belongs to a Windows system process, or was copied from another machine/reboot,
        automatically resets its status to 'STOPPED' and pid to NULL.
        Also automatically heals stale cross-platform algo_paths (e.g. Windows -> Linux).
        """
        conn = None
        try:
            conn = get_db()
            c = conn.cursor()

            # 1. Auto-heal cross-platform algo_paths
            try:
                c.execute("SELECT id, algo_path FROM bot_instances")
                all_bots = [dict(r) for r in c.fetchall()]
                for b in all_bots:
                    r_path = b.get('algo_path') or ""
                    if not r_path or not os.path.exists(r_path):
                        b_name = get_algo_filename(r_path)
                        if b_name:
                            cand1 = os.path.abspath(os.path.join(os.path.dirname(__file__), b_name))
                            cand2 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", b_name))
                            b_clean = os.path.splitext(b_name)[0]
                            cand3 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", b_clean, f"{b_clean}.algo"))
                            cand4 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", b_clean, b_clean, "bin", "Release", "net6.0", b_name))
                            found = [p for p in [cand1, cand2, cand3, cand4] if os.path.exists(p)]
                            if found:
                                c.execute("UPDATE bot_instances SET algo_path = ? WHERE id = ?", (found[0], b['id']))
                                log_message("SYSTEM", "INFO", f"[Auto-Heal] Normalized bot #{b['id']} algo_path to '{found[0]}'")
                conn.commit()
            except Exception as he:
                log_message("SYSTEM", "WARN", f"Error during algo_path auto-healing: {he}")

            # 2. Sync running status
            c.execute("SELECT id, name, pid, status FROM bot_instances WHERE status = 'RUNNING'")
            running_bots = [dict(r) for r in c.fetchall()]
            healed_count = 0
            for bot in running_bots:
                pid = bot.get('pid')
                if not self.is_process_running(pid):
                    c.execute("UPDATE bot_instances SET status = 'STOPPED', pid = NULL WHERE id = ?", (bot['id'],))
                    log_message("SYSTEM", "INFO", f"[Self-Healing] Bot #{bot['id']} '{bot.get('name')}' had stale PID {pid}. Reset status to STOPPED.")
                    healed_count += 1
            if healed_count > 0:
                conn.commit()
                log_message("SYSTEM", "INFO", f"[Self-Healing] Successfully healed {healed_count} stale bot instances.")
                try:
                    c.execute("SELECT DISTINCT account_id FROM bot_instances WHERE status IN ('RUNNING', 'STARTING') AND account_id IS NOT NULL AND account_id != ''")
                    active_accs = [str(r['account_id']) for r in c.fetchall()]
                    if active_accs:
                        placeholders = ','.join('?' for _ in active_accs)
                        c.execute(f"DELETE FROM positions WHERE account_id NOT IN ({placeholders})", active_accs)
                    else:
                        c.execute("DELETE FROM positions")
                    purged_cnt = c.rowcount if c.rowcount and c.rowcount > 0 else 0
                    if purged_cnt > 0:
                        conn.commit()
                        log_message("SYSTEM", "INFO", f"[Self-Healing] Purged {purged_cnt} stale positions from accounts without active bots.")
                except Exception as p_ex:
                    log_message("SYSTEM", "WARN", f"[Self-Healing] Error cleaning stale positions: {p_ex}")

            # 3. Auto-heal legacy or MT-style symbol names in database
            try:
                c.execute("SELECT id, symbol, account_id FROM bot_instances")
                for b in c.fetchall():
                    raw_sym = b['symbol'] or ""
                    acc_id = b['account_id']
                    acc_broker = get_account_broker(acc_id)
                    norm_sym = normalize_symbol(raw_sym, broker=acc_broker)
                    if norm_sym and norm_sym != raw_sym:
                        c.execute("UPDATE bot_instances SET symbol = ? WHERE id = ?", (norm_sym, b['id']))
                        log_message("SYSTEM", "INFO", f"[Auto-Heal] Normalized bot #{b['id']} symbol '{raw_sym}' -> '{norm_sym}' (Broker: {acc_broker})")
                conn.commit()
            except Exception as se:
                log_message("SYSTEM", "WARN", f"Error during symbol auto-healing: {se}")
        except Exception as e:
            log_message("SYSTEM", "WARN", f"Error during sync_stale_processes: {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def check_crashed_running_bots(self) -> List[Dict[str, Any]]:
        """
        Scans all bot instances in database with status 'RUNNING'.
        If a bot's PID is dead or invalid, records it as crashed, updates its status
        in SQLite to 'STOPPED', and returns details of all crashed bots for Telegram
        alerts and auto-restart handling.
        """
        conn = None
        crashed = []
        now_ts = time.time()
        try:
            conn = get_db()
            c = conn.cursor()
            c.execute("""
                SELECT id, name, symbol, timeframe, account_id, pid, status
                FROM bot_instances 
                WHERE status = 'RUNNING'
            """)
            running_bots = [dict(r) for r in c.fetchall()]

            for bot in running_bots:
                pid = bot.get('pid')
                bot_id = bot['id']

                # If bot was running stably for > 10 minutes (600s), reset its crash counter
                last_start = self.crash_restart_last_success.get(bot_id, 0)
                if last_start > 0 and (now_ts - last_start > 600):
                    self.crash_restart_attempts[bot_id] = 0

                if not self.is_process_running(pid):
                    c.execute("UPDATE bot_instances SET status = 'STOPPED', pid = NULL WHERE id = ?", (bot_id,))
                    self.active_processes.pop(bot_id, None)
                    
                    current_attempts = self.crash_restart_attempts.get(bot_id, 0) + 1
                    self.crash_restart_attempts[bot_id] = current_attempts
                    
                    bot_info = dict(bot)
                    bot_info["dead_pid"] = pid
                    bot_info["attempt"] = current_attempts
                    crashed.append(bot_info)
                    log_message(f"BOT_{bot_id}", "WARN", f"[Watchdog] Detected CRASHED bot #{bot_id} '{bot.get('name')}' (Stale PID {pid}). Attempt: {current_attempts}/3")

            if crashed:
                conn.commit()
        except Exception as ex:
            log_message("SYSTEM", "WARN", f"[Watchdog] Error scanning crashed bots: {ex}")
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

        return crashed

    def start_bot(self, bot_id: int):
        conn = None
        raw_bot = None
        try:
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT * FROM bot_instances WHERE id = ?", (bot_id,))
            raw_bot = c.fetchone()
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
        
        if not raw_bot:
            return False, "Bot not found"
            
        bot = dict(raw_bot)
        if bot['status'] == 'RUNNING' and self.is_process_running(bot.get('pid')):
            return False, "Bot is already running"

        cli_executable = get_ctrader_cli_path()
        if cli_executable == "ctrader-cli" and not shutil.which("ctrader-cli"):
            return False, "Không tìm thấy ctrader-cli.exe trên VPS. Vui lòng cài đặt cTrader Desktop hoặc thêm thư mục chứa ctrader-cli.exe vào biến môi trường PATH."

        raw_algo_path = bot['algo_path']
        base_filename = get_algo_filename(raw_algo_path)
        c1 = os.path.abspath(os.path.join(os.path.dirname(__file__), base_filename))
        c2 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", base_filename))
        bot_clean = os.path.splitext(base_filename)[0]
        c3 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", bot_clean, f"{bot_clean}.algo"))
        c4 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", bot_clean, bot_clean, "bin", "Release", "net6.0", base_filename))
        valid_candidates = [c for c in [raw_algo_path, c1, c2, c3, c4] if c and os.path.exists(c)]
        if valid_candidates:
            algo_path = max(valid_candidates, key=os.path.getmtime)
            # Auto-heal database if resolved path differs from raw_algo_path
            if algo_path != raw_algo_path:
                try:
                    conn_heal = get_db()
                    conn_heal.execute("UPDATE bot_instances SET algo_path = ? WHERE id = ?", (algo_path, bot_id))
                    conn_heal.commit()
                    conn_heal.close()
                except Exception:
                    pass
        else:
            return False, f"Algo file not found at {raw_algo_path} or {c2}"

        # Get credentials using master ctrader_account.txt with graceful fallback
        ctid, password = get_ctrader_credentials(bot)
                            
        if not ctid or not password:
            return False, "CTID credentials not found. Please provide CTID Email & Password in ctrader_account.txt or bot configuration."

        account = bot['account_id']
        raw_symbol = bot['symbol']
        broker = get_account_broker(account, bot)
        symbol = normalize_symbol(raw_symbol, broker=broker)
        if symbol != raw_symbol:
            log_message(f"BOT_{bot_id}", "INFO", f"[Symbol Auto-Mapping] Remapped symbol '{raw_symbol}' -> '{symbol}' (Broker: {broker})")
            try:
                conn_h = get_db()
                conn_h.execute("UPDATE bot_instances SET symbol = ? WHERE id = ?", (symbol, bot_id))
                conn_h.commit()
                conn_h.close()
            except Exception as eh:
                log_message(f"BOT_{bot_id}", "WARN", f"[Symbol Auto-Mapping] Failed to update DB: {eh}")
        timeframe = bot['timeframe']
        
        # Sanitize bot_identifier and account_label to ensure safe CLI parameter parsing without whitespace conflicts
        raw_name = bot['name'] if 'name' in bot.keys() and bot['name'] else f"bot_{bot_id}"
        bot_identifier = "".join(c if c.isalnum() or c == '_' else '_' for c in raw_name)
        raw_label = bot['account_label'] if 'account_label' in bot.keys() and bot['account_label'] else ""
        account_label = "".join(c if c.isalnum() or c in '_-#' else '_' for c in raw_label).strip('_')
        
        # Ensure password file is used (ctrader-cli requires --pwd-file for non-interactive execution)
        pwd_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), f".runtime_pwd_{bot_id}.txt"))
        with open(pwd_file_path, "w", encoding="utf-8") as pf:
            pf.write(password.strip() + "\n")
        
        # Build command with positional algo_path and --pwd-file
        cmd = [
            cli_executable, "run", 
            algo_path,
            f"--ctid={ctid}",
            f"--pwd-file={pwd_file_path}",
            f"--account={account}",
            f"--symbol={symbol}",
            f"--period={timeframe}",
            "--full-access",
            "--exit-on-stop",
            f"--BotId={bot_identifier}",
            "--ApiUrl=http://127.0.0.1:8181/trade"
        ]

        if account_label:
            cmd.append(f"--AccountLabel={account_label}")

        # Inject custom parameters from database if configured
        if bot.get('custom_params'):
            try:
                params_dict = json.loads(bot['custom_params'])
                if isinstance(params_dict, dict):
                    system_keys = {"BotId", "AccountLabel", "ApiUrl", "Symbol", "Period", "symbol", "period", "ctid", "account", "password", "pwd-file", "full-access", "exit-on-stop"}
                    
                    # Fetch algo metadata to prune any obsolete or unknown parameters
                    meta = self.get_algo_metadata(algo_path)
                    valid_params = {p["PropertyName"] for p in meta.get("Parameters", [])} if (meta and isinstance(meta.get("Parameters"), list)) else None
                    
                    pruned_keys = []
                    for k, v in list(params_dict.items()):
                        if k in system_keys or v is None:
                            continue
                        if valid_params is not None and k not in valid_params:
                            pruned_keys.append(k)
                            del params_dict[k]
                            continue
                        if isinstance(v, bool):
                            cmd.append(f"--{k}={'True' if v else 'False'}")
                        elif isinstance(v, (int, float)):
                            cmd.append(f"--{k}={v}")
                        elif isinstance(v, str):
                            val_str = v.strip()
                            if val_str:
                                cmd.append(f"--{k}={val_str}")
                    
                    if pruned_keys:
                        log_message(f"BOT_{bot_id}", "INFO", f"[Param Auto-Prune] Filtered out {len(pruned_keys)} obsolete parameters not supported by algo: {', '.join(pruned_keys)}")
                        # Auto-heal database
                        try:
                            conn_heal = get_db()
                            conn_heal.execute("UPDATE bot_instances SET custom_params = ? WHERE id = ?", (json.dumps(params_dict, ensure_ascii=False), bot_id))
                            conn_heal.commit()
                            conn_heal.close()
                        except Exception as eh:
                            log_message(f"BOT_{bot_id}", "WARN", f"[Param Auto-Prune] Failed to auto-heal DB: {eh}")
            except Exception as pe:
                log_message(f"BOT_{bot_id}", "WARN", f"Failed to parse custom_params: {str(pe)}")

        logs_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "logs"))
        os.makedirs(logs_dir, exist_ok=True)
        log_file_path = os.path.join(logs_dir, f"bot_{bot_id}.log")
        
        try:
            log_file = open(log_file_path, "a", encoding="utf-8")
            # Write start marker
            log_file.write(f"\n\n--- Starting Bot {bot_id} at {datetime.datetime.now()} ---\n")
            
            # Mask password in logs
            safe_cmd = [arg if not arg.startswith("--password=") else "--password=********" for arg in cmd]
            log_file.write(f"Command: {' '.join(safe_cmd)}\n\n")
            log_file.flush()
            
            env = os.environ.copy()
            env["DOTNET_ROLL_FORWARD"] = "Major"
            popen_kwargs = {
                "stdin": subprocess.PIPE,
                "stdout": log_file,
                "stderr": subprocess.STDOUT,
                "env": env,
            }
            if os.name == 'nt':
                popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                popen_kwargs["start_new_session"] = True
            process = subprocess.Popen(cmd, **popen_kwargs)
            
            # Update database status safely
            up_conn = None
            try:
                up_conn = get_db()
                c = up_conn.cursor()
                c.execute("UPDATE bot_instances SET status = 'RUNNING', pid = ? WHERE id = ?", (process.pid, bot_id))
                up_conn.commit()
            except Exception as dbe:
                log_message(f"BOT_{bot_id}", "WARN", f"Could not update status to RUNNING in DB: {dbe}")
            finally:
                if up_conn:
                    try:
                        up_conn.close()
                    except Exception:
                        pass
            
            # Keep process object alive to prevent stdin EOF
            self.active_processes[bot_id] = process
            self.crash_restart_last_success[bot_id] = time.time()
            
            log_message(f"BOT_{bot_id}", "INFO", f"Bot started with PID {process.pid}")
            return True, "Bot started successfully"
            
        except Exception as e:
            return False, f"Failed to start bot: {str(e)}"

    def stop_bot(self, bot_id: int):
        # Reset crash attempts on manual stop so watchdog won't treat manual stop as crash
        self.crash_restart_attempts[bot_id] = 0
        conn = None
        raw_bot = None
        try:
            conn = get_db()
            c = conn.cursor()
            c.execute("SELECT * FROM bot_instances WHERE id = ?", (bot_id,))
            raw_bot = c.fetchone()
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
        
        if not raw_bot:
            return False, "Bot not found"
            
        bot = dict(raw_bot)
        pid = bot.get('pid')

        # If process is not running or belongs to a foreign PID from copied database / reboot
        if not pid or not self.is_process_running(pid):
            self._force_set_bot_stopped_in_db(bot_id)
            self.active_processes.pop(bot_id, None)
            log_message(f"BOT_{bot_id}", "INFO", f"Bot #{bot_id} had stale PID {pid}. Cleanly reset to STOPPED.")
            return True, "Bot đã được chuyển về trạng thái STOPPED an toàn (tiến trình cũ không còn hoạt động trên máy này)"

        try:
            try:
                parent = psutil.Process(pid)
                children = parent.children(recursive=True)
                for child in children:
                    try:
                        child.terminate()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                parent.terminate()
                
                # Wait for all processes to exit gracefully, kill remaining if timeout
                gone, alive = psutil.wait_procs(children + [parent], timeout=3)
                for p in alive:
                    try:
                        p.kill()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
            
            self._force_set_bot_stopped_in_db(bot_id)
            self.active_processes.pop(bot_id, None)
            log_message(f"BOT_{bot_id}", "INFO", f"Bot stopped (PID {pid})")
            return True, "Bot stopped successfully"
        except Exception as e:
            # Always guarantee DB is reset to STOPPED so user is never stuck
            self._force_set_bot_stopped_in_db(bot_id)
            self.active_processes.pop(bot_id, None)
            log_message(f"BOT_{bot_id}", "WARN", f"Bot stopped with notice: {e}")
            return True, "Bot đã được chuyển về trạng thái STOPPED an toàn (tiến trình cũ không còn hoạt động trên máy này)"

    def restart_bot(self, bot_id: int):
        self.stop_bot(bot_id)
        time.sleep(1)
        return self.start_bot(bot_id)

    def _get_bots_by_account_type(self, account_type: Optional[str] = None) -> list:
        conn = None
        try:
            conn = get_db()
            c = conn.cursor()
            if account_type:
                acc_t = account_type.strip().lower()
                if acc_t == 'live':
                    c.execute("""
                        SELECT b.id, b.name, b.algo_path, b.status, b.pid, LOWER(COALESCE(a.account_type, 'demo')) as account_type
                        FROM bot_instances b
                        LEFT JOIN accounts a ON b.account_id = a.account_id
                        WHERE LOWER(COALESCE(a.account_type, 'demo')) = 'live'
                    """)
                else:
                    c.execute("""
                        SELECT b.id, b.name, b.algo_path, b.status, b.pid, LOWER(COALESCE(a.account_type, 'demo')) as account_type
                        FROM bot_instances b
                        LEFT JOIN accounts a ON b.account_id = a.account_id
                        WHERE LOWER(COALESCE(a.account_type, 'demo')) != 'live'
                    """)
            else:
                c.execute("""
                    SELECT b.id, b.name, b.algo_path, b.status, b.pid, LOWER(COALESCE(a.account_type, 'demo')) as account_type
                    FROM bot_instances b
                    LEFT JOIN accounts a ON b.account_id = a.account_id
                """)
            return [dict(r) for r in c.fetchall()]
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def start_all_bots(
        self,
        account_type: Optional[str] = None,
        max_cpu_threshold: float = 40.0,
        min_delay_seconds: float = 10.0,
        max_wait_seconds: float = 90.0,
        delay_seconds: Optional[float] = None
    ) -> dict:
        """
        Starts all non-running bot instances sequentially with dynamic CPU gating (< 40% threshold).
        """
        if delay_seconds is not None and delay_seconds > 0:
            min_delay_seconds = delay_seconds

        bots = self._get_bots_by_account_type(account_type)
        results = []
        started_count = 0
        skipped_count = 0
        failed_count = 0

        for i, bot in enumerate(bots):
            bot_id = bot['id']
            bot_name = bot.get('name', f"Bot #{bot_id}")
            
            # If already running with valid PID, skip
            if bot.get('status') == 'RUNNING' and self.is_process_running(bot.get('pid')):
                skipped_count += 1
                results.append({"id": bot_id, "name": bot_name, "status": "SKIPPED", "message": "Already running"})
                continue

            success, msg = self.start_bot(bot_id)
            if success:
                started_count += 1
                results.append({"id": bot_id, "name": bot_name, "status": "STARTED", "message": msg})
                # Apply CPU cooldown check between sequential bot starts (except after the last bot)
                if i < len(bots) - 1:
                    time.sleep(min_delay_seconds)
                    start_wait = time.time()
                    passes = 0
                    while (time.time() - start_wait) < max_wait_seconds:
                        c_cpu = psutil.cpu_percent(interval=None)
                        if c_cpu < max_cpu_threshold:
                            passes += 1
                            if passes >= 2:
                                break
                        else:
                            passes = 0
                        time.sleep(2.0)
            else:
                failed_count += 1
                results.append({"id": bot_id, "name": bot_name, "status": "FAILED", "message": msg})

        scope_label = f"{account_type.upper()} " if account_type else ""
        log_message("BOT_FLEET", "INFO", f"Start All {scope_label}executed: {started_count} started, {skipped_count} skipped, {failed_count} failed out of {len(bots)} total.")
        return {
            "total": len(bots),
            "started": started_count,
            "skipped": skipped_count,
            "failed": failed_count,
            "details": results
        }

    def stop_all_bots(self, account_type: Optional[str] = None) -> dict:
        """
        Stops all running bot instances safely by terminating process trees.
        """
        bots = self._get_bots_by_account_type(account_type)
        results = []
        stopped_count = 0
        skipped_count = 0
        failed_count = 0

        for bot in bots:
            bot_id = bot['id']
            bot_name = bot.get('name', f"Bot #{bot_id}")

            # If not running, skip
            if bot.get('status') != 'RUNNING' and not self.is_process_running(bot.get('pid')):
                skipped_count += 1
                results.append({"id": bot_id, "name": bot_name, "status": "SKIPPED", "message": "Already stopped"})
                continue

            success, msg = self.stop_bot(bot_id)
            if success:
                stopped_count += 1
                results.append({"id": bot_id, "name": bot_name, "status": "STOPPED", "message": msg})
            else:
                failed_count += 1
                results.append({"id": bot_id, "name": bot_name, "status": "FAILED", "message": msg})

        scope_label = f"{account_type.upper()} " if account_type else ""
        log_message("BOT_FLEET", "INFO", f"Stop All {scope_label}executed: {stopped_count} stopped, {skipped_count} skipped, {failed_count} failed out of {len(bots)} total.")
        return {
            "total": len(bots),
            "stopped": stopped_count,
            "skipped": skipped_count,
            "failed": failed_count,
            "details": results
        }

    def restart_all_bots(
        self,
        account_type: Optional[str] = None,
        max_cpu_threshold: float = 40.0,
        min_delay_seconds: float = 10.0,
        max_wait_seconds: float = 90.0,
        delay_seconds: Optional[float] = None
    ) -> dict:
        """
        Stops all running bot instances, waits for complete release, and restarts them sequentially with CPU gating.
        """
        stop_res = self.stop_all_bots(account_type=account_type)
        time.sleep(2.0)
        start_res = self.start_all_bots(
            account_type=account_type,
            max_cpu_threshold=max_cpu_threshold,
            min_delay_seconds=min_delay_seconds,
            max_wait_seconds=max_wait_seconds,
            delay_seconds=delay_seconds
        )
        return {
            "stopped": stop_res.get("stopped", 0),
            "started": start_res.get("started", 0),
            "failed": start_res.get("failed", 0),
            "total": start_res.get("total", 0),
            "details": start_res.get("details", [])
        }

    async def wait_for_cpu_cooldown(
        self,
        max_cpu_threshold: float = 40.0,
        min_delay_seconds: float = 10.0,
        max_wait_seconds: float = 90.0,
        check_interval: float = 2.0
    ) -> bool:
        """
        Waits for min_delay_seconds, then dynamically monitors VPS CPU until it cools down below
        max_cpu_threshold (verified 2 consecutive times) or max_wait_seconds timeout is reached.
        """
        if min_delay_seconds > 0:
            log_message("BOT_FLEET", "INFO", f"[CPU Gate] Waiting {min_delay_seconds}s for bot initialization...")
            await asyncio.sleep(min_delay_seconds)

        start_time = time.time()
        consecutive_passes = 0

        # Prime cpu_percent
        psutil.cpu_percent(interval=None)

        while (time.time() - start_time) < max_wait_seconds:
            cpu_now = psutil.cpu_percent(interval=None)
            if cpu_now < max_cpu_threshold:
                consecutive_passes += 1
                if consecutive_passes >= 2:
                    log_message(
                        "BOT_FLEET",
                        "INFO",
                        f"[CPU Gate] VPS CPU cooled down to {cpu_now:.1f}% (< {max_cpu_threshold}%). Ready for next bot!"
                    )
                    return True
            else:
                consecutive_passes = 0
                elapsed = int(time.time() - start_time)
                log_message(
                    "BOT_FLEET",
                    "INFO",
                    f"[CPU Gate] VPS CPU is {cpu_now:.1f}% (> {max_cpu_threshold}%). Cooling down ({elapsed}/{int(max_wait_seconds)}s)..."
                )

            await asyncio.sleep(check_interval)

        final_cpu = psutil.cpu_percent(interval=None)
        log_message(
            "BOT_FLEET",
            "WARN",
            f"[CPU Gate] Max timeout ({int(max_wait_seconds)}s) reached (Current CPU: {final_cpu:.1f}%). Proceeding to next bot..."
        )
        return False

    async def start_all_bots_async(
        self,
        account_type: Optional[str] = None,
        max_cpu_threshold: float = 40.0,
        min_delay_seconds: float = 10.0,
        max_wait_seconds: float = 90.0,
        delay_seconds: Optional[float] = None
    ) -> dict:
        """
        Starts all non-running bot instances sequentially with dynamic CPU gating (< 40% CPU threshold).
        """
        if delay_seconds is not None and delay_seconds > 0:
            min_delay_seconds = delay_seconds

        bots = self._get_bots_by_account_type(account_type)
        to_start = [b for b in bots if not (b.get('status') == 'RUNNING' and self.is_process_running(b.get('pid')))]
        started_count = 0
        failed_count = 0

        scope_label = f"[{account_type.upper()}] " if account_type else ""
        for i, bot in enumerate(to_start):
            bot_id = bot['id']
            bot_name = bot.get('name', f"Bot #{bot_id}")
            success, msg = self.start_bot(bot_id)
            if success:
                started_count += 1
                log_message("BOT_FLEET", "INFO", f"{scope_label}[{i+1}/{len(to_start)}] Started bot '{bot_name}' (#{bot_id})")
                if i < len(to_start) - 1:
                    await self.wait_for_cpu_cooldown(
                        max_cpu_threshold=max_cpu_threshold,
                        min_delay_seconds=min_delay_seconds,
                        max_wait_seconds=max_wait_seconds
                    )
            else:
                failed_count += 1
                log_message("BOT_FLEET", "ERROR", f"{scope_label}[{i+1}/{len(to_start)}] Failed to start bot '{bot_name}' (#{bot_id}): {msg}")

        log_message("BOT_FLEET", "INFO", f"Start All {scope_label}background task completed: {started_count} started, {failed_count} failed out of {len(to_start)} target bots.")
        return {
            "total": len(bots),
            "target": len(to_start),
            "started": started_count,
            "failed": failed_count
        }

    async def restart_all_bots_async(
        self,
        account_type: Optional[str] = None,
        max_cpu_threshold: float = 40.0,
        min_delay_seconds: float = 10.0,
        max_wait_seconds: float = 90.0,
        delay_seconds: Optional[float] = None
    ) -> dict:
        """
        Stops all running bot instances, waits 2s asynchronously, and restarts them sequentially with CPU gating.
        """
        self.stop_all_bots(account_type=account_type)
        await asyncio.sleep(2.0)
        return await self.start_all_bots_async(
            account_type=account_type,
            max_cpu_threshold=max_cpu_threshold,
            min_delay_seconds=min_delay_seconds,
            max_wait_seconds=max_wait_seconds,
            delay_seconds=delay_seconds
        )

    def check_bot_update_status(self, bot: dict) -> dict:
        """
        Determines if a bot instance has a newer .algo file on disk than its currently running process.
        """
        result = {
            "bot_id": bot.get("id"),
            "bot_name": bot.get("name"),
            "has_update": False,
            "status": bot.get("status"),
            "algo_mtime": None,
            "proc_start_time": None,
            "diff_seconds": 0.0,
            "resolved_algo_path": None
        }
        
        raw_algo_path = bot.get("algo_path") or ""
        if not raw_algo_path and bot.get("id"):
            try:
                conn = get_db()
                c = conn.cursor()
                c.execute("SELECT algo_path FROM bot_instances WHERE id = ?", (bot.get("id"),))
                row = c.fetchone()
                if row and row[0]:
                    raw_algo_path = row[0]
                conn.close()
            except Exception:
                pass

        base_filename = get_algo_filename(raw_algo_path)
        if not base_filename:
            return result
            
        c1 = os.path.abspath(os.path.join(os.path.dirname(__file__), base_filename))
        c2 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", base_filename))
        bot_clean = os.path.splitext(base_filename)[0]
        c3 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", bot_clean, f"{bot_clean}.algo"))
        c4 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", bot_clean, bot_clean, "bin", "Release", "net6.0", base_filename))
        valid_candidates = [c for c in [raw_algo_path, c1, c2, c3, c4] if c and os.path.exists(c)]
        
        if not valid_candidates:
            return result
            
        resolved_algo_path = max(valid_candidates, key=os.path.getmtime)
        result["resolved_algo_path"] = resolved_algo_path
        algo_mtime = os.path.getmtime(resolved_algo_path)
        result["algo_mtime"] = algo_mtime
        
        pid = bot.get("pid")
        if bot.get("status") == "RUNNING" and self.is_process_running(pid):
            try:
                proc = psutil.Process(pid)
                proc_start_time = proc.create_time()
                result["proc_start_time"] = proc_start_time
                diff = algo_mtime - proc_start_time
                result["diff_seconds"] = diff
                # Has update if file mtime is greater than process creation time (+1.0s buffer)
                if diff > 1.0:
                    result["has_update"] = True
            except Exception:
                pass
                
        return result

    def get_all_bots_update_status(self, account_type: Optional[str] = None) -> List[dict]:
        """
        Scans all bot instances and returns update status for each.
        """
        bots = self._get_bots_by_account_type(account_type)
        return [self.check_bot_update_status(b) for b in bots]

    async def restart_updated_bots_async(
        self,
        account_type: Optional[str] = None,
        max_cpu_threshold: float = 40.0,
        min_delay_seconds: float = 10.0,
        max_wait_seconds: float = 90.0,
        delay_seconds: Optional[float] = None
    ) -> dict:
        """
        Inspects all RUNNING bots.
        Restarts ONLY bots whose .algo file on disk is newer than their running process.
        Bots without changes remain untouched.
        Uses adaptive CPU gating (<40% threshold) between restarts.
        """
        if delay_seconds is not None and delay_seconds > 0:
            min_delay_seconds = delay_seconds

        bots = self._get_bots_by_account_type(account_type)
        running_bots = [b for b in bots if b.get('status') == 'RUNNING' and self.is_process_running(b.get('pid'))]
        
        updated_bots = []
        untouched_bots = []
        for b in running_bots:
            status_info = self.check_bot_update_status(b)
            if status_info["has_update"]:
                updated_bots.append((b, status_info))
            else:
                untouched_bots.append(b)

        restarted_count = 0
        failed_count = 0
        restarted_names = []

        log_message(
            "BOT_FLEET",
            "INFO",
            f"[Smart Restart] Detected {len(updated_bots)} updated bots needing restart out of {len(running_bots)} running bots."
        )

        for i, (bot, info) in enumerate(updated_bots):
            bot_id = bot["id"]
            bot_name = bot.get("name", f"Bot_{bot_id}")
            log_message(
                f"BOT_{bot_id}",
                "INFO",
                f"[Smart Restart] ({i+1}/{len(updated_bots)}) Restarting '{bot_name}' with new .algo build (mtime diff: +{info['diff_seconds']:.1f}s)..."
            )
            
            # Stop existing process
            self.stop_bot(bot_id)
            await asyncio.sleep(2.0)
            
            # Start with new binary
            ok, msg = self.start_bot(bot_id)
            if ok:
                restarted_count += 1
                restarted_names.append(bot_name)
            else:
                failed_count += 1
                log_message(f"BOT_{bot_id}", "ERROR", f"[Smart Restart] Failed to restart '{bot_name}': {msg}")

            # CPU-Gating wait before next bot
            if i < len(updated_bots) - 1:
                await self._wait_for_cpu_cooldown(
                    max_cpu_threshold=max_cpu_threshold,
                    min_delay_seconds=min_delay_seconds,
                    max_wait_seconds=max_wait_seconds,
                    bot_name=bot_name
                )

        return {
            "status": "success",
            "total_running": len(running_bots),
            "updated_count": len(updated_bots),
            "restarted_count": restarted_count,
            "failed_count": failed_count,
            "restarted_bots": restarted_names,
            "untouched_count": len(untouched_bots),
            "untouched_bots": [b.get("name") for b in untouched_bots]
        }

    def get_algo_metadata(self, algo_path: str):
        if not algo_path:
            return None
            
        base_filename = get_algo_filename(algo_path)
        c1 = os.path.abspath(os.path.join(os.path.dirname(__file__), base_filename))
        c2 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", base_filename))
        bot_clean = os.path.splitext(base_filename)[0]
        c3 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", bot_clean, f"{bot_clean}.algo"))
        c4 = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", bot_clean, bot_clean, "bin", "Release", "net6.0", base_filename))
        valid_candidates = [c for c in [algo_path, c1, c2, c3, c4] if c and os.path.exists(c)]
        if valid_candidates:
            algo_path = max(valid_candidates, key=os.path.getmtime)
        else:
            print(f"[get_algo_metadata] File not found: {algo_path}")
            return None

        try:
            cli_executable = get_ctrader_cli_path()
            cmd = [cli_executable, "metadata", algo_path]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if res.returncode == 0 and res.stdout.strip():
                return json.loads(res.stdout)
            else:
                print(f"[get_algo_metadata] Failed with returncode {res.returncode}: {res.stderr}")
        except Exception as e:
            print(f"Error fetching metadata for {algo_path}: {e}")
        return None
