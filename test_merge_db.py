import os
import sqlite3
import pytest
from merge_db import merge_databases, backup_database

@pytest.fixture
def test_dbs(tmp_path):
    target_db = str(tmp_path / "target.db")
    source_db = str(tmp_path / "source.db")

    # Setup Target DB
    conn_t = sqlite3.connect(target_db)
    conn_t.execute('''
        CREATE TABLE accounts (
            account_id TEXT PRIMARY KEY,
            account_type TEXT,
            account_label TEXT,
            balance REAL,
            equity REAL,
            last_updated TEXT
        )
    ''')
    conn_t.execute('''
        CREATE TABLE history (
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
            pnl_pips REAL,
            reason TEXT,
            entry_time TEXT,
            exit_time TEXT
        )
    ''')
    conn_t.execute('''
        CREATE TABLE bot_instances (
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
            created_at TEXT,
            account_label TEXT,
            custom_params TEXT,
            display_order INTEGER,
            account_type TEXT
        )
    ''')

    # Seed target DB
    conn_t.execute("INSERT INTO accounts VALUES ('ACC_1', 'demo', 'VPS 1 Demo', 1000.0, 1050.0, '2026-09-01T10:00:00')")
    conn_t.execute("INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time) VALUES (101, 'ACC_1', 'bot_vps1', 'XAUUSD', 'BUY', 0.01, 2700.0, 2710.0, 10.0, 100.0, 'TakeProfit', '2026-09-01T10:00:00', '2026-09-01T10:15:00')")
    conn_t.commit()
    conn_t.close()

    # Setup Source DB (from VPS 2)
    conn_s = sqlite3.connect(source_db)
    conn_s.execute('''
        CREATE TABLE accounts (
            account_id TEXT PRIMARY KEY,
            account_type TEXT,
            account_label TEXT,
            balance REAL,
            equity REAL,
            last_updated TEXT
        )
    ''')
    conn_s.execute('''
        CREATE TABLE history (
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
            pnl_pips REAL,
            reason TEXT,
            entry_time TEXT,
            exit_time TEXT
        )
    ''')
    conn_s.execute('''
        CREATE TABLE bot_instances (
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
            created_at TEXT,
            account_label TEXT,
            custom_params TEXT,
            display_order INTEGER,
            account_type TEXT
        )
    ''')

    # 1 duplicate trade (ID 101), 1 new trade (ID 102), 1 new account (ACC_2), and updated ACC_1
    conn_s.execute("INSERT INTO accounts VALUES ('ACC_1', 'demo', 'VPS 1 Demo Updated', 1100.0, 1150.0, '2026-09-02T10:00:00')")
    conn_s.execute("INSERT INTO accounts VALUES ('ACC_2', 'live', 'VPS 2 Live', 5000.0, 5200.0, '2026-09-02T10:00:00')")
    # Duplicate trade
    conn_s.execute("INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time) VALUES (101, 'ACC_1', 'bot_vps1', 'XAUUSD', 'BUY', 0.01, 2700.0, 2710.0, 10.0, 100.0, 'TakeProfit', '2026-09-01T10:00:00', '2026-09-01T10:15:00')")
    # New trade from VPS 2
    conn_s.execute("INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time) VALUES (202, 'ACC_2', 'bot_vps2', 'EURUSD', 'SELL', 0.1, 1.0850, 1.0820, 30.0, 30.0, 'TakeProfit', '2026-09-02T08:00:00', '2026-09-02T09:00:00')")
    conn_s.execute("INSERT INTO bot_instances (name, algo_path, ctid_email, ctid_password, account_id, symbol, timeframe, status, pid, created_at, account_label, custom_params, display_order, account_type) VALUES ('VPS 2 Bot', 'cbot.algo', 'test@test.com', 'pwd', 'ACC_2', 'EURUSD', 'm15', 'running', 1234, '2026-09-02', 'ACC_2', '{}', 0, 'live')")
    conn_s.commit()
    conn_s.close()

    return source_db, target_db

def test_merge_databases_success(test_dbs):
    source_db, target_db = test_dbs

    backup_file = backup_database(target_db)
    assert os.path.exists(backup_file)

    results = merge_databases(source_db, target_db)
    assert "history" in results
    assert "accounts" in results

    # Verify history: 1 initial, exactly 1 added (102), total = 2 (no duplicate 101!)
    before_h, added_h = results["history"]
    assert before_h == 1
    assert added_h == 1

    conn = sqlite3.connect(target_db)
    conn.row_factory = sqlite3.Row
    trades = conn.execute("SELECT * FROM history ORDER BY id ASC").fetchall()
    assert len(trades) == 2
    assert trades[0]["ctrader_id"] == 101
    assert trades[1]["ctrader_id"] == 202

    # Verify accounts: ACC_1 updated to 1100 balance, ACC_2 added
    accs = conn.execute("SELECT * FROM accounts ORDER BY account_id ASC").fetchall()
    assert len(accs) == 2
    assert accs[0]["account_id"] == "ACC_1"
    assert accs[0]["balance"] == 1100.0
    assert accs[1]["account_id"] == "ACC_2"
    assert accs[1]["balance"] == 500.0 or accs[1]["balance"] == 5000.0

    # Verify bot_instances: added with status 'stopped' and pid None
    bots = conn.execute("SELECT * FROM bot_instances").fetchall()
    assert len(bots) == 1
    assert bots[0]["name"] == "VPS 2 Bot"
    assert bots[0]["status"] == "stopped"
    assert bots[0]["pid"] is None

    conn.close()

    # Clean up backup
    if os.path.exists(backup_file):
        os.remove(backup_file)
