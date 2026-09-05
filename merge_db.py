#!/usr/bin/env python3
"""
merge_db.py - Dedicated SQLite Database Merging Utility for cTrader AI Trading Hub
Allows seamlessly merging two 'portfolio.db' files from different VPS/machines into one.

Features:
- Automatic timestamped backup of the target database before any write
- Intelligent deduplication for trade history (by account_id, ctrader_id, exit_time)
- Automatic conflict resolution for accounts, open positions, bot instances, and logs
- Primary Key Auto-Increment remapping (prevents ID collision)
- PRAGMA integrity check post-merge
- Detailed CLI summary report of merged rows per table

Usage:
    python merge_db.py --source /path/to/vps2_portfolio.db [--target portfolio.db]
"""

import os
import sys
import shutil
import sqlite3
import datetime
import argparse
from typing import Dict, Tuple

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

def backup_database(target_path: str) -> str:
    """Creates a timestamped backup copy of the target database."""
    if not os.path.exists(target_path):
        return ""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{target_path}.bak_{timestamp}"
    shutil.copy2(target_path, backup_path)
    return backup_path

def get_table_row_count(conn: sqlite3.Connection, table_name: str, db_alias: str = "main") -> int:
    """Returns row count of a table if it exists, else 0."""
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM {db_alias}.{table_name}")
        row = cur.fetchone()
        return row[0] if row else 0
    except sqlite3.OperationalError:
        return 0

def check_table_exists(conn: sqlite3.Connection, table_name: str, db_alias: str = "main") -> bool:
    """Checks if a table exists in the specified attached database."""
    cur = conn.cursor()
    cur.execute(f"SELECT name FROM {db_alias}.sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cur.fetchone() is not None

def merge_databases(source_db_path: str, target_db_path: str) -> Dict[str, Tuple[int, int]]:
    """
    Attaches source_db_path into target_db_path and merges records without collisions.
    Returns a dictionary of {table_name: (rows_before, rows_added)}.
    """
    source_db_path = os.path.abspath(source_db_path)
    target_db_path = os.path.abspath(target_db_path)

    if not os.path.exists(source_db_path):
        raise FileNotFoundError(f"Source database file not found: {source_db_path}")
    if not os.path.exists(target_db_path):
        raise FileNotFoundError(f"Target database file not found: {target_db_path}")

    # Connect to target DB
    conn = sqlite3.connect(target_db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    results = {}

    try:
        # Attach source DB
        cur.execute("PRAGMA foreign_keys = OFF")
        cur.execute(f"ATTACH DATABASE ? AS source_db", (source_db_path,))

        # 1. Accounts Table (Merge & Update latest equity/balance)
        if check_table_exists(conn, "accounts", "source_db") and check_table_exists(conn, "accounts", "main"):
            before = get_table_row_count(conn, "accounts", "main")
            cur.execute("SELECT account_id, account_type, account_label, balance, equity, last_updated FROM source_db.accounts")
            acc_rows = cur.fetchall()
            if acc_rows:
                cur.executemany("""
                    INSERT INTO accounts (account_id, account_type, account_label, balance, equity, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(account_id) DO UPDATE SET
                        account_label = CASE WHEN excluded.account_label != '' THEN excluded.account_label ELSE accounts.account_label END,
                        account_type = CASE WHEN excluded.account_type != '' THEN excluded.account_type ELSE accounts.account_type END,
                        balance = CASE WHEN excluded.last_updated >= accounts.last_updated THEN excluded.balance ELSE accounts.balance END,
                        equity = CASE WHEN excluded.last_updated >= accounts.last_updated THEN excluded.equity ELSE accounts.equity END,
                        last_updated = CASE WHEN excluded.last_updated >= accounts.last_updated THEN excluded.last_updated ELSE accounts.last_updated END
                """, [(r[0], r[1], r[2], r[3], r[4], r[5]) for r in acc_rows])
            after = get_table_row_count(conn, "accounts", "main")
            results["accounts"] = (before, after - before)

        # 2. History Table (Deduplicate trades by account_id + ctrader_id, or symbol + exit_time + pnl)
        if check_table_exists(conn, "history", "source_db") and check_table_exists(conn, "history", "main"):
            before = get_table_row_count(conn, "history", "main")
            cur.execute("""
                INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time)
                SELECT s.ctrader_id, s.account_id, s.bot_id, s.symbol, s.side, s.volume, s.entry_price, s.exit_price, s.pnl, 
                       CASE WHEN s.pnl_pips IS NOT NULL THEN s.pnl_pips ELSE NULL END,
                       s.reason, s.entry_time, s.exit_time
                FROM source_db.history s
                WHERE NOT EXISTS (
                    SELECT 1 FROM history m
                    WHERE m.account_id = s.account_id
                      AND (
                          (s.ctrader_id IS NOT NULL AND s.ctrader_id > 0 AND m.ctrader_id = s.ctrader_id)
                          OR (m.symbol = s.symbol AND m.exit_time = s.exit_time AND ABS(m.pnl - s.pnl) < 0.005)
                      )
                )
            """)
            after = get_table_row_count(conn, "history", "main")
            results["history"] = (before, after - before)

        # 3. Active Positions Table (Upsert open positions)
        if check_table_exists(conn, "positions", "source_db") and check_table_exists(conn, "positions", "main"):
            before = get_table_row_count(conn, "positions", "main")
            cur.execute("""
                INSERT INTO positions (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, sl_pips, tp_pips, reason, entry_time)
                SELECT s.ctrader_id, s.account_id, s.bot_id, s.symbol, s.side, s.volume, s.entry_price, s.sl_pips, s.tp_pips, s.reason, s.entry_time
                FROM source_db.positions s
                WHERE NOT EXISTS (
                    SELECT 1 FROM positions m
                    WHERE m.account_id = s.account_id AND m.ctrader_id = s.ctrader_id
                )
            """)
            after = get_table_row_count(conn, "positions", "main")
            results["positions"] = (before, after - before)

        # 4. Bot Instances (Avoid duplicate bot deployments with same name & account)
        if check_table_exists(conn, "bot_instances", "source_db") and check_table_exists(conn, "bot_instances", "main"):
            before = get_table_row_count(conn, "bot_instances", "main")
            cur.execute("""
                INSERT INTO bot_instances (name, algo_path, ctid_email, ctid_password, account_id, symbol, timeframe, status, pid, created_at, account_label, custom_params, display_order, account_type)
                SELECT s.name, s.algo_path, s.ctid_email, s.ctid_password, s.account_id, s.symbol, s.timeframe, 
                       'stopped', NULL, s.created_at, s.account_label, s.custom_params, s.display_order, s.account_type
                FROM source_db.bot_instances s
                WHERE NOT EXISTS (
                    SELECT 1 FROM bot_instances m
                    WHERE m.name = s.name AND m.account_id = s.account_id AND m.symbol = s.symbol
                )
            """)
            after = get_table_row_count(conn, "bot_instances", "main")
            results["bot_instances"] = (before, after - before)

        # 5. Logs Table (Deduplicate identical log messages)
        if check_table_exists(conn, "logs", "source_db") and check_table_exists(conn, "logs", "main"):
            before = get_table_row_count(conn, "logs", "main")
            cur.execute("""
                INSERT INTO logs (bot_id, level, message, timestamp)
                SELECT s.bot_id, s.level, s.message, s.timestamp
                FROM source_db.logs s
                WHERE NOT EXISTS (
                    SELECT 1 FROM logs m
                    WHERE m.bot_id = s.bot_id AND m.timestamp = s.timestamp AND m.message = s.message
                )
            """)
            after = get_table_row_count(conn, "logs", "main")
            results["logs"] = (before, after - before)

        # 6. Strategy Audits Table
        if check_table_exists(conn, "strategy_audits", "source_db") and check_table_exists(conn, "strategy_audits", "main"):
            before = get_table_row_count(conn, "strategy_audits", "main")
            cur.execute("""
                INSERT INTO strategy_audits (created_at, timeframe_days, bot_id, symbol, total_trades, win_rate, profit_factor, total_pnl_usd, total_pnl_pips, total_wins, total_losses, provider, model, executive_summary, report_markdown, recommended_params_json, applied_status)
                SELECT s.created_at, s.timeframe_days, s.bot_id, s.symbol, s.total_trades, s.win_rate, s.profit_factor, s.total_pnl_usd, s.total_pnl_pips, s.total_wins, s.total_losses, s.provider, s.model, s.executive_summary, s.report_markdown, s.recommended_params_json, s.applied_status
                FROM source_db.strategy_audits s
                WHERE NOT EXISTS (
                    SELECT 1 FROM strategy_audits m
                    WHERE m.created_at = s.created_at AND m.bot_id = s.bot_id
                )
            """)
            after = get_table_row_count(conn, "strategy_audits", "main")
            results["strategy_audits"] = (before, after - before)

        # 7. AI Evaluation Benchmark Runs
        if check_table_exists(conn, "ai_eval_runs", "source_db") and check_table_exists(conn, "ai_eval_runs", "main"):
            before = get_table_row_count(conn, "ai_eval_runs", "main")
            cur.execute("""
                INSERT INTO ai_eval_runs (start_time, end_time, provider, model, dataset_name, total_scenarios, processed_scenarios, win_rate, profit_factor, avg_latency_ms, total_wins, total_losses, total_holds, total_pnl_pips, status, summary_markdown, error_message)
                SELECT s.start_time, s.end_time, s.provider, s.model, s.dataset_name, s.total_scenarios, s.processed_scenarios, s.win_rate, s.profit_factor, s.avg_latency_ms, s.total_wins, s.total_losses, s.total_holds, s.total_pnl_pips, s.status, s.summary_markdown, s.error_message
                FROM source_db.ai_eval_runs s
                WHERE NOT EXISTS (
                    SELECT 1 FROM ai_eval_runs m
                    WHERE m.start_time = s.start_time AND m.model = s.model
                )
            """)
            after = get_table_row_count(conn, "ai_eval_runs", "main")
            results["ai_eval_runs"] = (before, after - before)

        # Commit transaction
        conn.commit()

        # Detach source DB
        cur.execute("DETACH DATABASE source_db")

        # Verify integrity
        cur.execute("PRAGMA integrity_check")
        integrity_status = cur.fetchone()[0]
        if integrity_status.lower() != "ok":
            raise sqlite3.DatabaseError(f"Integrity check failed post-merge: {integrity_status}")

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

    return results

def main():
    parser = argparse.ArgumentParser(description="Merge two portfolio.db files from different VPS instances safely.")
    parser.add_argument("--source", "-s", required=True, help="Path to the secondary portfolio.db (e.g. copied from VPS 2)")
    parser.add_argument("--target", "-t", default="portfolio.db", help="Path to the main target portfolio.db (default: portfolio.db)")
    parser.add_argument("--no-backup", action="store_true", help="Skip automatic timestamped backup of target DB")

    args = parser.parse_args()

    source_path = os.path.abspath(args.source)
    target_path = os.path.abspath(args.target)

    print("=" * 65)
    print("   🔀 cTrader AI Hub - Multi-VPS Portfolio Database Merger")
    print("=" * 65)
    print(f"• Source DB (VPS 2) : {source_path}")
    print(f"• Target DB (Main)  : {target_path}")

    if not os.path.exists(source_path):
        print(f"❌ Error: Source file '{source_path}' does not exist.")
        sys.exit(1)

    if not os.path.exists(target_path):
        print(f"❌ Error: Target file '{target_path}' does not exist.")
        sys.exit(1)

    # 1. Backup
    if not args.no_backup:
        backup_file = backup_database(target_path)
        print(f"🛡️  Backup created  : {backup_file}")
    else:
        print("⚠️  Warning: Backup skipped (--no-backup).")

    # 2. Execute Merge
    try:
        print("\n⏳ Merging databases and resolving unique constraints...")
        results = merge_databases(source_path, target_path)

        print("\n✅ Database Merge Completed Successfully!")
        print("-" * 65)
        print(f"{'Table Name':<22} | {'Initial Rows':<15} | {'New Rows Added':<15}")
        print("-" * 65)
        total_added = 0
        for table, (before, added) in results.items():
            print(f"{table:<22} | {before:<15} | +{added:<14}")
            total_added += added
        print("-" * 65)
        print(f"🎉 Total New Records Merged: {total_added}")
        print("=" * 65)

    except Exception as ex:
        print(f"\n❌ Error during merge: {str(ex)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
