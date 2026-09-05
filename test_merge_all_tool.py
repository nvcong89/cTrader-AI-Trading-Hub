import os
import sqlite3
import pytest
import sys

# Import merge_all module from 'merge database tool' directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "merge database tool"))
import merge_all

def create_mock_db(db_path: str, accounts: list, history: list):
    conn = sqlite3.connect(db_path)
    conn.execute('''
        CREATE TABLE accounts (
            account_id TEXT PRIMARY KEY,
            account_type TEXT,
            account_label TEXT,
            balance REAL,
            equity REAL,
            last_updated TEXT
        )
    ''')
    conn.execute('''
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
    conn.execute('''
        CREATE TABLE positions (
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
    conn.execute('''
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

    for acc in accounts:
        conn.execute("INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)", acc)
    for h in history:
        conn.execute("INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", h)

    conn.commit()
    conn.close()

def test_merge_all_not_enough_files(tmp_path, capsys):
    # Empty directory
    res = merge_all.run_merge_pipeline(str(tmp_path))
    assert res == ""
    captured = capsys.readouterr()
    assert "Không đủ file cơ sở dữ liệu" in captured.out

    # 1 file only
    create_mock_db(str(tmp_path / "only_one.db"), [], [])
    res2 = merge_all.run_merge_pipeline(str(tmp_path))
    assert res2 == ""

def test_merge_all_multi_vps_databases(tmp_path):
    vps1_db = str(tmp_path / "vps1.db")
    vps2_db = str(tmp_path / "vps2.db")
    vps3_db = str(tmp_path / "vps3.db")

    # DB 1: trades 101, 102
    create_mock_db(
        vps1_db,
        [("ACC_1", "demo", "Demo 1", 1000.0, 1050.0, "2026-09-01T10:00:00")],
        [
            (101, "ACC_1", "bot1", "XAUUSD", "BUY", 0.01, 2700.0, 2710.0, 10.0, 100.0, "TakeProfit", "2026-09-01T10:00:00", "2026-09-01T10:15:00"),
            (102, "ACC_1", "bot1", "XAUUSD", "SELL", 0.02, 2710.0, 2705.0, 10.0, 50.0, "TakeProfit", "2026-09-01T11:00:00", "2026-09-01T11:20:00")
        ]
    )

    # DB 2: duplicate 102, new 103
    create_mock_db(
        vps2_db,
        [("ACC_1", "demo", "Demo 1", 1100.0, 1150.0, "2026-09-02T10:00:00"),
         ("ACC_2", "live", "Live 2", 5000.0, 5200.0, "2026-09-02T10:00:00")],
        [
            (102, "ACC_1", "bot1", "XAUUSD", "SELL", 0.02, 2710.0, 2705.0, 10.0, 50.0, "TakeProfit", "2026-09-01T11:00:00", "2026-09-01T11:20:00"),
            (103, "ACC_2", "bot2", "EURUSD", "BUY", 0.1, 1.0800, 1.0850, 50.0, 50.0, "TakeProfit", "2026-09-02T08:00:00", "2026-09-02T09:00:00")
        ]
    )

    # DB 3: duplicate 101, new 104
    create_mock_db(
        vps3_db,
        [("ACC_3", "demo", "Demo 3", 2000.0, 2020.0, "2026-09-03T10:00:00")],
        [
            (101, "ACC_1", "bot1", "XAUUSD", "BUY", 0.01, 2700.0, 2710.0, 10.0, 100.0, "TakeProfit", "2026-09-01T10:00:00", "2026-09-01T10:15:00"),
            (104, "ACC_3", "bot3", "GBPUSD", "BUY", 0.05, 1.2900, 1.2940, 20.0, 40.0, "TakeProfit", "2026-09-03T09:00:00", "2026-09-03T09:30:00")
        ]
    )

    output_path = merge_all.run_merge_pipeline(str(tmp_path))
    assert output_path == os.path.join(str(tmp_path), "merged_portfolio.db")
    assert os.path.exists(output_path)

    conn = sqlite3.connect(output_path)
    conn.row_factory = sqlite3.Row

    # Verify history: exactly 4 distinct trades
    trades = conn.execute("SELECT * FROM history ORDER BY id ASC").fetchall()
    assert len(trades) == 4
    ctrader_ids = [t["ctrader_id"] for t in trades]
    assert sorted(ctrader_ids) == [101, 102, 103, 104]

    # Verify accounts: 3 distinct accounts, ACC_1 updated to balance 1100.0
    accs = conn.execute("SELECT * FROM accounts ORDER BY account_id ASC").fetchall()
    assert len(accs) == 3
    acc_map = {a["account_id"]: a["balance"] for a in accs}
    assert acc_map["ACC_1"] == 1100.0
    assert acc_map["ACC_2"] == 5000.0
    assert acc_map["ACC_3"] == 2000.0

    conn.close()

    # Re-run merge pipeline to verify automatic backup creation
    merge_all.run_merge_pipeline(str(tmp_path))
    backup_files = [f for f in os.listdir(str(tmp_path)) if "merged_portfolio.db.bak_" in f]
    assert len(backup_files) >= 1
