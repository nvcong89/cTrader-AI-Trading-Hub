import sqlite3
import datetime
import os
import json
import csv
import io
import zipfile
from typing import Optional, List, Dict, Any

DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "portfolio.db"))

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=60.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA busy_timeout=60000")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except Exception:
        pass
    return conn

def init_db():
    conn = get_db()
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except Exception:
        pass
    c = conn.cursor()
    # Create accounts table
    c.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            account_id TEXT PRIMARY KEY,
            account_type TEXT,
            account_label TEXT,
            balance REAL,
            equity REAL,
            last_updated TEXT
        )
    ''')
    
    # Create active positions table
    c.execute('''
        CREATE TABLE IF NOT EXISTS positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ctrader_id INTEGER,
            account_id TEXT,
            bot_id TEXT,
            symbol TEXT,
            side TEXT,
            volume REAL,
            entry_price REAL,
            sl_pips REAL,
            tp_pips REAL,
            reason TEXT,
            entry_time TEXT
        )
    ''')
    
    # Create trade history table
    c.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ctrader_id INTEGER,
            account_id TEXT,
            bot_id TEXT,
            symbol TEXT,
            side TEXT,
            volume REAL,
            entry_price REAL,
            exit_price REAL,
            pnl REAL,
            reason TEXT,
            entry_time TEXT,
            exit_time TEXT
        )
    ''')
    
    # Create logs table
    c.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bot_id TEXT,
            level TEXT,
            message TEXT,
            timestamp TEXT
        )
    ''')
    
    # Create bot_instances table for Process Manager
    c.execute('''
        CREATE TABLE IF NOT EXISTS bot_instances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            algo_path TEXT,
            ctid_email TEXT,
            ctid_password TEXT,
            account_id TEXT,
            symbol TEXT,
            timeframe TEXT,
            status TEXT,
            pid INTEGER,
            created_at TEXT
        )
    ''')
    
    # Simple migration: Add ctid_password column if it doesn't exist
    try:
        c.execute('ALTER TABLE bot_instances ADD COLUMN ctid_password TEXT')
    except sqlite3.OperationalError:
        pass # Column likely already exists
        
    try:
        c.execute('ALTER TABLE bot_instances ADD COLUMN account_label TEXT')
    except sqlite3.OperationalError:
        pass # Column likely already exists

    try:
        c.execute('ALTER TABLE bot_instances ADD COLUMN custom_params TEXT')
    except sqlite3.OperationalError:
        pass # Column likely already exists

    try:
        c.execute('ALTER TABLE bot_instances ADD COLUMN display_order INTEGER DEFAULT 0')
    except sqlite3.OperationalError:
        pass # Column likely already exists

    try:
        c.execute("ALTER TABLE bot_instances ADD COLUMN account_type TEXT DEFAULT 'demo'")
    except sqlite3.OperationalError:
        pass # Column likely already exists

    try:
        c.execute("ALTER TABLE accounts ADD COLUMN account_type TEXT DEFAULT 'demo'")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE accounts ADD COLUMN account_label TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE accounts ADD COLUMN broker TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE accounts ADD COLUMN currency TEXT DEFAULT 'USD'")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE accounts ADD COLUMN ctid_email TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE accounts ADD COLUMN profile_id TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        # Populate broker for known accounts
        c.execute("UPDATE accounts SET broker = 'FxPro' WHERE (broker IS NULL OR broker = '') AND (account_id LIKE '82%' OR account_id LIKE '8%' OR account_label LIKE '%FxPro%')")
        c.execute("UPDATE accounts SET broker = 'Spotware' WHERE (broker IS NULL OR broker = '') AND (account_id LIKE '437%' OR account_label LIKE '%Demo%')")
    except Exception:
        pass

    try:
        # Auto-heal FxPro bots configured with space-separated US TECH 100 / US 30 / US 500 / JAPAN 225
        c.execute("UPDATE bot_instances SET symbol = '#USNDAQ100' WHERE (symbol = 'US TECH 100' OR symbol = 'US100' OR symbol = 'NAS100' OR symbol = 'NASDAQ100') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = '#US30' WHERE (symbol = 'US 30' OR symbol = 'US30' OR symbol = 'DJ30') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = '#USSPX500' WHERE (symbol = 'US 500' OR symbol = 'US500' OR symbol = 'SPX500') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = '#Japan225' WHERE (symbol = 'JAPAN 225' OR symbol = 'JAPAN225' OR symbol = 'JP225') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = '#Germany40' WHERE (symbol = 'GERMANY 40' OR symbol = 'GERMANY40' OR symbol = 'GER40') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = '#UK100' WHERE (symbol = 'UK 100' OR symbol = 'UK100' OR symbol = 'FTSE100') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")

        # Auto-heal FxPro bots configured with BTCUSD / ETHUSD / BTC / ETH
        c.execute("UPDATE bot_instances SET symbol = 'BITCOIN' WHERE (symbol = 'BTCUSD' OR symbol = 'BTC' OR symbol = 'XBTUSD' OR symbol = 'XBT') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = 'ETHEREUM' WHERE (symbol = 'ETHUSD' OR symbol = 'ETH') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = 'BITCOINCASH' WHERE (symbol = 'BCHUSD' OR symbol = 'BCH') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = 'ETHCLASSIC' WHERE (symbol = 'ETCUSD' OR symbol = 'ETC') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = 'LITECOIN' WHERE (symbol = 'LTCUSD' OR symbol = 'LTC') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
        c.execute("UPDATE bot_instances SET symbol = 'SOLANA' WHERE (symbol = 'SOLUSD' OR symbol = 'SOL') AND (account_id IN (SELECT account_id FROM accounts WHERE broker = 'FxPro') OR account_id LIKE '82%' OR account_id LIKE '8%')")
    except Exception:
        pass

    try:
        # Self-heal bot_instances account_type from accounts table
        c.execute('''
            UPDATE bot_instances 
            SET account_type = (
                SELECT LOWER(a.account_type) FROM accounts a WHERE a.account_id = bot_instances.account_id
            )
            WHERE account_id IN (SELECT account_id FROM accounts WHERE account_type IS NOT NULL AND account_type != '')
              AND (account_type IS NULL OR LOWER(account_type) != (SELECT LOWER(a.account_type) FROM accounts a WHERE a.account_id = bot_instances.account_id))
        ''')
    except Exception:
        pass

    try:
        c.execute('ALTER TABLE positions ADD COLUMN current_price REAL')
    except sqlite3.OperationalError:
        pass

    try:
        c.execute('ALTER TABLE positions ADD COLUMN pnl REAL')
    except sqlite3.OperationalError:
        pass

    try:
        c.execute('ALTER TABLE positions ADD COLUMN pnl_pips REAL')
    except sqlite3.OperationalError:
        pass

    try:
        c.execute('ALTER TABLE positions ADD COLUMN sl_price REAL')
    except sqlite3.OperationalError:
        pass

    try:
        c.execute('ALTER TABLE positions ADD COLUMN tp_price REAL')
    except sqlite3.OperationalError:
        pass

    try:
        c.execute('ALTER TABLE history ADD COLUMN pnl_pips REAL')
    except sqlite3.OperationalError:
        pass

    # Remove any existing duplicates in positions table keeping only latest id
    try:
        c.execute('''
            DELETE FROM positions
            WHERE id NOT IN (
                SELECT MAX(id)
                FROM positions
                GROUP BY account_id, ctrader_id
            )
        ''')
    except Exception:
        pass

    # Add unique index to prevent future duplicate positions
    try:
        c.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_acc_ctrader ON positions (account_id, ctrader_id)')
    except Exception:
        pass

    # Sanitize bot_instances ctid_email to master ctrader_account.txt if invalid
    try:
        cred_file = os.path.join(os.path.dirname(__file__), "ctrader_account.txt")
        if os.path.exists(cred_file):
            master_email = ""
            master_pwd = ""
            with open(cred_file, "r", encoding="utf-8") as f:
                for line in f:
                    line_str = line.strip()
                    if line_str.startswith("CTID_EMAIL="):
                        master_email = line_str.split("=", 1)[1].strip().strip('"').strip("'")
                    elif line_str.startswith("CTID_PASSWORD="):
                        master_pwd = line_str.split("=", 1)[1].strip().strip('"').strip("'")
            if master_email and "@" in master_email:
                c.execute("UPDATE bot_instances SET ctid_email = ? WHERE ctid_email IS NULL OR ctid_email = '' OR ctid_email NOT LIKE '%@%'", (master_email,))
                if master_pwd:
                    c.execute("UPDATE bot_instances SET ctid_password = ? WHERE ctid_password IS NULL OR ctid_password = ''", (master_pwd,))
    except Exception:
        pass

    # Self-heal bot_instances custom_params: Prune obsolete pips parameters and inject Dynamic ATR defaults
    try:
        c.execute("SELECT id, custom_params FROM bot_instances WHERE custom_params LIKE '%minAsianRangePips%' OR custom_params LIKE '%maxAsianRangePips%' OR custom_params LIKE '%sweepBufferPips%'")
        stale_rows = c.fetchall()
        for s_row in stale_rows:
            b_id = s_row[0]
            try:
                p_dict = json.loads(s_row[1]) if s_row[1] else {}
                p_dict.pop('minAsianRangePips', None)
                p_dict.pop('maxAsianRangePips', None)
                p_dict.pop('sweepBufferPips', None)
                if 'minAsianRangeDailyAtrPercent' not in p_dict:
                    p_dict['minAsianRangeDailyAtrPercent'] = 15.0
                if 'maxAsianRangeDailyAtrPercent' not in p_dict:
                    p_dict['maxAsianRangeDailyAtrPercent'] = 60.0
                if 'sweepBufferM15AtrPercent' not in p_dict:
                    p_dict['sweepBufferM15AtrPercent'] = 20.0
                c.execute("UPDATE bot_instances SET custom_params = ? WHERE id = ?", (json.dumps(p_dict, ensure_ascii=False), b_id))
            except Exception:
                pass
    except Exception:
        pass

    # Create AI Providers Configuration table
    c.execute('''
        CREATE TABLE IF NOT EXISTS ai_providers_config (
            id INTEGER PRIMARY KEY,
            active_provider TEXT DEFAULT 'qwen_api',
            gemini_api_key TEXT DEFAULT '',
            gemini_model TEXT DEFAULT 'gemini-1.5-flash',
            deepseek_api_key TEXT DEFAULT '',
            deepseek_model TEXT DEFAULT 'deepseek-chat',
            openai_api_key TEXT DEFAULT '',
            openai_model TEXT DEFAULT 'gpt-4o-mini',
            qwen_api_key TEXT DEFAULT '',
            qwen_model TEXT DEFAULT 'qwen3.7-flash',
            qwen_endpoint TEXT DEFAULT 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            updated_at TEXT
        )
    ''')

    # Migration for Qwen AI Provider
    try:
        c.execute("ALTER TABLE ai_providers_config ADD COLUMN qwen_api_key TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE ai_providers_config ADD COLUMN qwen_model TEXT DEFAULT 'qwen3.7-flash'")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE ai_providers_config ADD COLUMN qwen_endpoint TEXT DEFAULT 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'")
    except sqlite3.OperationalError:
        pass

    # Update any legacy gemini_web provider to modern API provider
    c.execute("UPDATE ai_providers_config SET active_provider = 'qwen_api' WHERE active_provider = 'gemini_web' OR active_provider IS NULL OR active_provider = ''")
    c.execute("UPDATE ai_providers_config SET qwen_model = 'qwen3.7-flash' WHERE qwen_model IS NULL OR qwen_model = '' OR qwen_model = 'qwen-turbo'")

    # Auto-load Qwen credentials from API_key.env if present
    api_key_env_path = os.path.join(os.path.dirname(__file__), "API_key.env")
    if os.path.exists(api_key_env_path):
        try:
            env_key = ""
            env_endpoint = ""
            with open(api_key_env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip()
                        if k in ("APIKey", "API_KEY", "QWEN_API_KEY"):
                            env_key = v
                        elif k in ("OpenAI_compatible", "OPENAI_COMPATIBLE", "QWEN_ENDPOINT"):
                            env_endpoint = v
            if env_key:
                c.execute('''
                    UPDATE ai_providers_config 
                    SET qwen_api_key = CASE WHEN qwen_api_key = '' OR qwen_api_key IS NULL THEN ? ELSE qwen_api_key END,
                        qwen_endpoint = CASE WHEN qwen_endpoint = '' OR qwen_endpoint IS NULL THEN ? ELSE qwen_endpoint END,
                        qwen_model = 'qwen3.7-flash'
                    WHERE id = 1
                ''', (env_key, env_endpoint or 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'))
        except Exception:
            pass

    # Seed default configuration row if empty
    c.execute('SELECT COUNT(*) FROM ai_providers_config')
    if c.fetchone()[0] == 0:
        c.execute('''
            INSERT INTO ai_providers_config (id, active_provider, gemini_api_key, gemini_model, deepseek_api_key, deepseek_model, openai_api_key, openai_model, qwen_api_key, qwen_model, qwen_endpoint, updated_at)
            VALUES (1, 'qwen_api', '', 'gemini-1.5-flash', '', 'deepseek-chat', '', 'gpt-4o-mini', '', 'qwen3.7-flash', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', ?)
        ''', (datetime.datetime.now().isoformat(),))

    # Create AI Evaluation Benchmark Tables
    c.execute('''
        CREATE TABLE IF NOT EXISTS ai_eval_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time TEXT,
            end_time TEXT,
            provider TEXT,
            model TEXT,
            dataset_name TEXT,
            total_scenarios INTEGER DEFAULT 0,
            processed_scenarios INTEGER DEFAULT 0,
            win_rate REAL DEFAULT 0.0,
            profit_factor REAL DEFAULT 0.0,
            avg_latency_ms REAL DEFAULT 0.0,
            total_wins INTEGER DEFAULT 0,
            total_losses INTEGER DEFAULT 0,
            total_holds INTEGER DEFAULT 0,
            total_pnl_pips REAL DEFAULT 0.0,
            status TEXT DEFAULT 'PENDING',
            summary_markdown TEXT DEFAULT '',
            error_message TEXT DEFAULT ''
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS ai_eval_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER,
            scenario_idx INTEGER,
            timestamp TEXT,
            symbol TEXT,
            timeframe TEXT,
            ask REAL,
            bid REAL,
            indicators_json TEXT,
            ai_action TEXT,
            ai_volume REAL,
            ai_sl_pips REAL,
            ai_tp_pips REAL,
            ai_confidence REAL,
            ai_reason TEXT,
            latency_ms REAL,
            forward_outcome TEXT,
            pnl_pips REAL,
            forward_bars_json TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS strategy_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT,
            timeframe_days INTEGER DEFAULT 7,
            bot_id TEXT DEFAULT 'ALL',
            symbol TEXT DEFAULT 'ALL',
            total_trades INTEGER DEFAULT 0,
            win_rate REAL DEFAULT 0.0,
            profit_factor REAL DEFAULT 0.0,
            total_pnl_usd REAL DEFAULT 0.0,
            total_pnl_pips REAL DEFAULT 0.0,
            total_wins INTEGER DEFAULT 0,
            total_losses INTEGER DEFAULT 0,
            provider TEXT,
            model TEXT,
            executive_summary TEXT,
            report_markdown TEXT,
            recommended_params_json TEXT,
            applied_status INTEGER DEFAULT 0
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT,
            total_bots INTEGER DEFAULT 0,
            rankings_json TEXT,
            next_update_at TEXT
        )
    ''')

    # Create News AI Assessments table
    c.execute('''
        CREATE TABLE IF NOT EXISTS news_ai_assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cluster_hash TEXT NOT NULL,
            timestamp_utc TEXT NOT NULL,
            symbol TEXT NOT NULL,
            currencies TEXT,
            events_json TEXT NOT NULL,
            volatility_level TEXT NOT NULL,
            expected_pips_range TEXT,
            trend_type TEXT NOT NULL,
            prob_buy REAL NOT NULL,
            prob_sell REAL NOT NULL,
            scenario_better TEXT,
            scenario_worse TEXT,
            bot_guidance TEXT,
            analysis_markdown TEXT NOT NULL,
            ai_provider TEXT,
            ai_model TEXT,
            latency_ms INTEGER DEFAULT 0,
            user_notes TEXT,
            created_at TEXT NOT NULL
        )
    ''')

    # Performance B-Tree Indexes
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_positions_account_bot ON positions (account_id, bot_id)",
        "CREATE INDEX IF NOT EXISTS idx_positions_ctrader_id ON positions (ctrader_id)",
        "CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions (symbol)",
        "CREATE INDEX IF NOT EXISTS idx_history_account_bot ON history (account_id, bot_id)",
        "CREATE INDEX IF NOT EXISTS idx_history_ctrader_id ON history (ctrader_id)",
        "CREATE INDEX IF NOT EXISTS idx_history_symbol ON history (symbol)",
        "CREATE INDEX IF NOT EXISTS idx_logs_bot_timestamp ON logs (bot_id, timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs (timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_ai_eval_results_run_id ON ai_eval_results (run_id)",
        "CREATE INDEX IF NOT EXISTS idx_strategy_audits_created ON strategy_audits (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_leaderboard_created ON leaderboard_snapshots (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_news_assessments_cluster ON news_ai_assessments (cluster_hash, symbol)",
        "CREATE INDEX IF NOT EXISTS idx_news_assessments_created ON news_ai_assessments (created_at DESC)"
    ]
    for idx_sql in indexes:
        try:
            c.execute(idx_sql)
        except Exception:
            pass

    conn.commit()
    conn.close()

def create_eval_run(provider: str, model: str, dataset_name: str, total_scenarios: int) -> int:
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO ai_eval_runs (start_time, provider, model, dataset_name, total_scenarios, status)
        VALUES (?, ?, ?, ?, ?, 'RUNNING')
    ''', (datetime.datetime.now().isoformat(), provider, model, dataset_name, total_scenarios))
    run_id = c.lastrowid
    conn.commit()
    conn.close()
    return run_id

def update_eval_run_progress(run_id: int, processed: int):
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE ai_eval_runs SET processed_scenarios = ? WHERE id = ?', (processed, run_id))
    conn.commit()
    conn.close()

def complete_eval_run(run_id: int, status: str, win_rate: float, profit_factor: float, avg_latency_ms: float, total_wins: int, total_losses: int, total_holds: int, total_pnl_pips: float, summary_markdown: str = "", error_message: str = ""):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        UPDATE ai_eval_runs
        SET end_time = ?,
            status = ?,
            win_rate = ?,
            profit_factor = ?,
            avg_latency_ms = ?,
            total_wins = ?,
            total_losses = ?,
            total_holds = ?,
            total_pnl_pips = ?,
            summary_markdown = ?,
            error_message = ?
        WHERE id = ?
    ''', (datetime.datetime.now().isoformat(), status, win_rate, profit_factor, avg_latency_ms, total_wins, total_losses, total_holds, total_pnl_pips, summary_markdown, error_message, run_id))
    conn.commit()
    conn.close()

def save_eval_result(run_id: int, scenario_idx: int, timestamp: str, symbol: str, timeframe: str, ask: float, bid: float, indicators_json: str, ai_action: str, ai_volume: float, ai_sl_pips: float, ai_tp_pips: float, ai_confidence: float, ai_reason: str, latency_ms: float, forward_outcome: str, pnl_pips: float, forward_bars_json: str):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO ai_eval_results (run_id, scenario_idx, timestamp, symbol, timeframe, ask, bid, indicators_json, ai_action, ai_volume, ai_sl_pips, ai_tp_pips, ai_confidence, ai_reason, latency_ms, forward_outcome, pnl_pips, forward_bars_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (run_id, scenario_idx, timestamp, symbol, timeframe, ask, bid, indicators_json, ai_action, ai_volume, ai_sl_pips, ai_tp_pips, ai_confidence, ai_reason, latency_ms, forward_outcome, pnl_pips, forward_bars_json))
    conn.commit()
    conn.close()

def get_eval_runs(limit: int = 50) -> list:
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM ai_eval_runs ORDER BY id DESC LIMIT ?', (limit,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows

def get_eval_run_detail(run_id: int) -> dict:
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM ai_eval_runs WHERE id = ?', (run_id,))
    run_row = c.fetchone()
    if not run_row:
        conn.close()
        return None
    run = dict(run_row)
    c.execute('SELECT * FROM ai_eval_results WHERE run_id = ? ORDER BY scenario_idx ASC', (run_id,))
    results = [dict(r) for r in c.fetchall()]
    conn.close()
    run["results"] = results
    return run

def log_message(bot_id: str, level: str, message: str):
    now_dt = datetime.datetime.now()
    now_iso = now_dt.isoformat()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    
    # Real-time Colored Console Output for Terminal Windows
    color_map = {
        "INFO": "\033[92m",      # Bright Green
        "WARN": "\033[93m",      # Bright Yellow
        "WARNING": "\033[93m",   # Bright Yellow
        "ERROR": "\033[91m",     # Bright Red
        "DEBUG": "\033[94m",     # Bright Blue
        "TRADE": "\033[96m",     # Bright Cyan
    }
    reset_color = "\033[0m"
    lvl = (level or "INFO").upper()
    color = color_map.get(lvl, "\033[97m")
    tag = f"[{bot_id}]" if bot_id else "[SYSTEM]"
    try:
        print(f"{color}[{now_str}] {tag:14} [{lvl:5}] {message}{reset_color}", flush=True)
    except Exception:
        pass

    conn = None
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute("INSERT INTO logs (bot_id, level, message, timestamp) VALUES (?, ?, ?, ?)",
                  (bot_id, level, message, now_iso))
        conn.commit()
    except Exception:
        pass
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

def maintain_database(days_to_keep: int = 14):
    """
    Purges logs older than days_to_keep and checkpoints/optimizes SQLite database.
    """
    conn = None
    purged_logs = 0
    try:
        conn = get_db()
        c = conn.cursor()
        
        cutoff_date = (datetime.datetime.now() - datetime.timedelta(days=days_to_keep)).isoformat()
        c.execute("DELETE FROM logs WHERE timestamp < ?", (cutoff_date,))
        purged_logs = c.rowcount
        
        conn.commit()
        
        # Run SQLite optimization and truncate WAL file
        c.execute("PRAGMA optimize")
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
        conn = None
        return {"status": "success", "purged_logs": purged_logs, "kept_days": days_to_keep}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

def backup_database(max_backups: int = 7):
    """
    Performs a non-blocking safe SQLite online backup and rotates historical backups.
    """
    try:
        backup_dir = os.path.join(os.path.dirname(__file__), "backups")
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"portfolio_backup_{timestamp_str}.db"
        backup_path = os.path.join(backup_dir, backup_filename)
        
        src_conn = sqlite3.connect(DB_FILE)
        dst_conn = sqlite3.connect(backup_path)
        
        with dst_conn:
            src_conn.backup(dst_conn, pages=100, sleep=0.01)
            
        dst_conn.close()
        src_conn.close()
        
        # Rotate old backups
        all_backups = sorted(
            [f for f in os.listdir(backup_dir) if f.startswith("portfolio_backup_") and f.endswith(".db")],
            reverse=True
        )
        for old_b in all_backups[max_backups:]:
            try:
                os.remove(os.path.join(backup_dir, old_b))
            except Exception:
                pass
                
        file_size_kb = round(os.path.getsize(backup_path) / 1024.0, 1)
        return {
            "status": "success",
            "backup_file": backup_filename,
            "backup_path": backup_path,
            "size_kb": file_size_kb,
            "total_backups": min(len(all_backups), max_backups)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def get_database_stats():
    """
    Returns statistics about database tables, row counts, file sizes, and 5GB threshold warnings.
    """
    conn = None
    try:
        conn = get_db()
        c = conn.cursor()
        
        c.execute("SELECT COUNT(*) FROM accounts")
        acc_count = c.fetchone()[0]
        
        c.execute("SELECT COUNT(*) FROM positions")
        pos_count = c.fetchone()[0]
        
        c.execute("SELECT COUNT(*) FROM history")
        hist_count = c.fetchone()[0]
        
        c.execute("SELECT COUNT(*) FROM logs")
        log_count = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM bot_instances")
        bots_count = c.fetchone()[0]
        
        db_size_kb = round(os.path.getsize(DB_FILE) / 1024.0, 1) if os.path.exists(DB_FILE) else 0.0
        wal_file = f"{DB_FILE}-wal"
        wal_size_kb = round(os.path.getsize(wal_file) / 1024.0, 1) if os.path.exists(wal_file) else 0.0

        db_size_mb = round(db_size_kb / 1024.0, 2)
        wal_size_mb = round(wal_size_kb / 1024.0, 2)
        total_size_mb = round((db_size_kb + wal_size_kb) / 1024.0, 2)

        # 5GB safety limits (5120 MB)
        warning_threshold_mb = 5120.0
        caution_threshold_mb = 3840.0

        is_storage_warning = total_size_mb >= warning_threshold_mb
        is_storage_caution = total_size_mb >= caution_threshold_mb
        usage_percent = min(100.0, round((total_size_mb / warning_threshold_mb) * 100.0, 1))
        
        conn.close()
        conn = None
        return {
            "accounts_count": acc_count,
            "positions_count": pos_count,
            "history_count": hist_count,
            "logs_count": log_count,
            "bots_count": bots_count,
            "db_size_kb": db_size_kb,
            "wal_size_kb": wal_size_kb,
            "db_size_mb": db_size_mb,
            "wal_size_mb": wal_size_mb,
            "total_size_mb": total_size_mb,
            "warning_threshold_mb": warning_threshold_mb,
            "is_storage_warning": is_storage_warning,
            "is_storage_caution": is_storage_caution,
            "usage_percent": usage_percent,
            "journal_mode": "WAL"
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

def export_trading_history_csv() -> str:
    """
    Exports all closed trades in history table into standard CSV format.
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM history ORDER BY id ASC")
    rows = c.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    headers = [
        "id", "account_id", "bot_id", "symbol", "side", "volume",
        "entry_price", "exit_price", "pnl_usd", "pnl_pips",
        "entry_time", "exit_time", "ctrader_id", "reason"
    ]
    writer.writerow(headers)

    for r in rows:
        r_dict = dict(r)
        writer.writerow([
            r_dict.get("id"),
            r_dict.get("account_id"),
            r_dict.get("bot_id"),
            r_dict.get("symbol"),
            r_dict.get("side"),
            r_dict.get("volume"),
            r_dict.get("entry_price"),
            r_dict.get("exit_price"),
            r_dict.get("pnl"),
            r_dict.get("pnl_pips"),
            r_dict.get("entry_time"),
            r_dict.get("exit_time"),
            r_dict.get("ctrader_id"),
            r_dict.get("reason", "")
        ])

    return output.getvalue()

def export_logs_csv(bot_id: str = None, level: str = None) -> str:
    """
    Exports system & AI reasoning logs into standard CSV format.
    """
    conn = get_db()
    c = conn.cursor()
    
    query = "SELECT * FROM logs WHERE 1=1"
    params = []
    if bot_id and bot_id != "ALL":
        query += " AND bot_id = ?"
        params.append(bot_id)
    if level and level != "ALL":
        query += " AND level = ?"
        params.append(level)
    query += " ORDER BY id ASC"

    c.execute(query, tuple(params))
    rows = c.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)

    headers = ["id", "timestamp", "bot_id", "level", "message"]
    writer.writerow(headers)

    for r in rows:
        r_dict = dict(r)
        writer.writerow([
            r_dict.get("id"),
            r_dict.get("timestamp"),
            r_dict.get("bot_id"),
            r_dict.get("level"),
            r_dict.get("message", "")
        ])

    return output.getvalue()

def export_all_data_zip() -> bytes:
    """
    Creates an in-memory ZIP archive containing both trading_history.csv and system_logs.csv.
    """
    history_csv = export_trading_history_csv()
    logs_csv = export_logs_csv()

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        zf.writestr(f"trading_history_{timestamp_str}.csv", history_csv)
        zf.writestr(f"ai_system_logs_{timestamp_str}.csv", logs_csv)

    return zip_buffer.getvalue()

def reset_and_vacuum_database(backup_first: bool = True, purge_logs_days: int = 1) -> dict:
    """
    Performs safe online backup, purges old logs, truncates WAL, and executes VACUUM to shrink DB file.
    """
    backup_result = None
    if backup_first:
        backup_result = backup_database(max_backups=10)

    conn = get_db()
    c = conn.cursor()
    
    cutoff_date = (datetime.datetime.now() - datetime.timedelta(days=purge_logs_days)).isoformat()
    c.execute("DELETE FROM logs WHERE timestamp < ?", (cutoff_date,))
    purged_logs_count = c.rowcount
    conn.commit()

    # Truncate WAL & Vacuum to physically reduce file size
    c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()

    # VACUUM requires its own isolated connection
    vac_conn = sqlite3.connect(DB_FILE, timeout=60.0)
    vac_conn.execute("VACUUM")
    vac_conn.close()

    new_stats = get_database_stats()
    return {
        "status": "success",
        "purged_logs": purged_logs_count,
        "backup": backup_result,
        "new_stats": new_stats
    }

def create_strategy_audit(
    timeframe_days: int,
    bot_id: str,
    symbol: str,
    total_trades: int,
    win_rate: float,
    profit_factor: float,
    total_pnl_usd: float,
    total_pnl_pips: float,
    total_wins: int,
    total_losses: int,
    provider: str,
    model: str,
    executive_summary: str,
    report_markdown: str,
    recommended_params_json: str
) -> int:
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO strategy_audits (
            created_at, timeframe_days, bot_id, symbol, total_trades, win_rate,
            profit_factor, total_pnl_usd, total_pnl_pips, total_wins, total_losses,
            provider, model, executive_summary, report_markdown, recommended_params_json, applied_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ''', (
        datetime.datetime.now().isoformat(), timeframe_days, str(bot_id or "ALL"), str(symbol or "ALL"),
        total_trades, win_rate, profit_factor, total_pnl_usd, total_pnl_pips,
        total_wins, total_losses, provider, model, executive_summary, report_markdown, recommended_params_json
    ))
    audit_id = c.lastrowid
    conn.commit()
    conn.close()
    return audit_id

def get_strategy_audits(limit: int = 30) -> list:
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM strategy_audits ORDER BY id DESC LIMIT ?', (limit,))
    rows = c.fetchall()
    result = [dict(r) for r in rows]
    conn.close()
    return result

def get_strategy_audit_by_id(audit_id: int) -> dict:
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM strategy_audits WHERE id = ?', (audit_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def update_strategy_audit_applied(audit_id: int, applied_status: int = 1):
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE strategy_audits SET applied_status = ? WHERE id = ?', (applied_status, audit_id))
    conn.commit()
    conn.close()

def save_leaderboard_snapshot(total_bots: int, rankings_json: str, next_update_at: str) -> int:
    conn = get_db()
    c = conn.cursor()
    created_at = datetime.datetime.now().isoformat()
    c.execute('''
        INSERT INTO leaderboard_snapshots (created_at, total_bots, rankings_json, next_update_at)
        VALUES (?, ?, ?, ?)
    ''', (created_at, total_bots, rankings_json, next_update_at))
    snap_id = c.lastrowid
    conn.commit()
    conn.close()
    return snap_id

def get_latest_leaderboard_snapshot() -> dict:
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM leaderboard_snapshots ORDER BY id DESC LIMIT 1')
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

# ==========================================
# NEWS AI ASSESSMENTS PERSISTENCE & HISTORY
# ==========================================

def save_news_assessment(
    cluster_hash: str,
    timestamp_utc: str,
    symbol: str,
    currencies: list,
    events: list,
    volatility_level: str,
    expected_pips_range: str,
    trend_type: str,
    prob_buy: float,
    prob_sell: float,
    scenario_better: str,
    scenario_worse: str,
    bot_guidance: str,
    analysis_markdown: str,
    ai_provider: str,
    ai_model: str,
    latency_ms: int = 0,
    user_notes: str = ""
) -> int:
    """
    Saves an AI economic news assessment into SQLite and returns the record ID.
    """
    conn = get_db()
    c = conn.cursor()
    created_at = datetime.datetime.now().isoformat()
    currencies_json = json.dumps(currencies, ensure_ascii=False)
    events_json = json.dumps(events, ensure_ascii=False)

    c.execute('''
        INSERT INTO news_ai_assessments (
            cluster_hash, timestamp_utc, symbol, currencies, events_json,
            volatility_level, expected_pips_range, trend_type, prob_buy, prob_sell,
            scenario_better, scenario_worse, bot_guidance, analysis_markdown,
            ai_provider, ai_model, latency_ms, user_notes, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        cluster_hash, timestamp_utc, symbol.strip().upper(), currencies_json, events_json,
        volatility_level, expected_pips_range, trend_type, prob_buy, prob_sell,
        scenario_better, scenario_worse, bot_guidance, analysis_markdown,
        ai_provider, ai_model, latency_ms, user_notes, created_at
    ))
    record_id = c.lastrowid
    conn.commit()
    conn.close()
    return record_id

def get_news_assessment_by_cluster(cluster_hash: str, symbol: str) -> Optional[dict]:
    """Retrieves the latest assessment for a given news cluster and symbol."""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT * FROM news_ai_assessments 
        WHERE cluster_hash = ? AND symbol = ?
        ORDER BY id DESC LIMIT 1
    ''', (cluster_hash, symbol.strip().upper()))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    res = dict(row)
    try:
        res["currencies"] = json.loads(res.get("currencies") or "[]")
        res["events"] = json.loads(res.get("events_json") or "[]")
    except Exception:
        pass
    return res

def get_news_assessment_by_id(assessment_id: int) -> Optional[dict]:
    """Retrieves a specific assessment by its ID."""
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM news_ai_assessments WHERE id = ?', (assessment_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    res = dict(row)
    try:
        res["currencies"] = json.loads(res.get("currencies") or "[]")
        res["events"] = json.loads(res.get("events_json") or "[]")
    except Exception:
        pass
    return res

def get_recent_news_assessments(limit: int = 50) -> List[dict]:
    """Retrieves a list of recent assessments ordered by ID descending."""
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM news_ai_assessments ORDER BY id DESC LIMIT ?', (limit,))
    rows = c.fetchall()
    conn.close()
    results = []
    for r in rows:
        item = dict(r)
        try:
            item["currencies"] = json.loads(item.get("currencies") or "[]")
            item["events"] = json.loads(item.get("events_json") or "[]")
        except Exception:
            pass
        results.append(item)
    return results



