#!/usr/bin/env python3
"""
merge_all.py - 1-Click Multi-Database Merger for cTrader AI Trading Hub
Scans the current directory for all SQLite database files (*.db),
and seamlessly merges them into a single consolidated 'merged_portfolio.db'.

Features:
- Self-contained and portable (can run inside 'merge database tool' or standalone)
- Automatically detects all *.db files (vps1.db, vps2.db, portfolio.db, etc.)
- Excludes output files and backup files (*.bak_*)
- Creates backup of previous merged_portfolio.db if present
- Intelligent deduplication across trades, accounts, positions, bot instances, logs, and audits
- SQLite PRAGMA integrity verification
- Clear summary table output
"""

import os
import sys
import glob
import shutil
import sqlite3
import datetime
from typing import List, Dict, Tuple

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

OUTPUT_DB_NAME = "merged_portfolio.db"

def get_table_row_count(conn: sqlite3.Connection, table_name: str, db_alias: str = "main") -> int:
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM {db_alias}.{table_name}")
        row = cur.fetchone()
        return row[0] if row else 0
    except sqlite3.OperationalError:
        return 0

def check_table_exists(conn: sqlite3.Connection, table_name: str, db_alias: str = "main") -> bool:
    cur = conn.cursor()
    cur.execute(f"SELECT name FROM {db_alias}.sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cur.fetchone() is not None

def merge_single_db(source_db_path: str, target_db_path: str) -> Dict[str, Tuple[int, int]]:
    """Merges a single source DB into target DB with deduplication."""
    conn = sqlite3.connect(target_db_path)
    cur = conn.cursor()
    results = {}

    try:
        cur.execute("PRAGMA foreign_keys = OFF")
        cur.execute("ATTACH DATABASE ? AS source_db", (os.path.abspath(source_db_path),))

        # 1. Accounts Table
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
                """, acc_rows)
            after = get_table_row_count(conn, "accounts", "main")
            results["accounts"] = (before, after - before)

        # 2. History Table
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

        # 3. Active Positions Table
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

        # 4. Bot Instances
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

        # 5. Logs Table
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

        conn.commit()
        cur.execute("DETACH DATABASE source_db")

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

    return results

def find_candidate_db_files(search_dir: str) -> List[str]:
    """Finds all candidate SQLite .db files excluding output and backup files."""
    candidates = []
    for f in os.listdir(search_dir):
        if not f.lower().endswith(".db"):
            continue
        # Exclude output file and backups
        if f.lower() == OUTPUT_DB_NAME.lower() or ".bak_" in f.lower() or "_backup_" in f.lower():
            continue
        full_path = os.path.join(search_dir, f)
        if os.path.isfile(full_path):
            candidates.append(full_path)
    # Sort for deterministic processing
    candidates.sort()
    return candidates

def run_merge_pipeline(target_dir: str) -> str:
    """Executes the merge of all .db files in target_dir into OUTPUT_DB_NAME."""
    candidate_files = find_candidate_db_files(target_dir)

    print("=" * 70)
    print("   🔀 1-CLICK MULTI-DATABASE MERGE TOOL (cTrader AI Trading Hub)")
    print("=" * 70)
    print(f"📁 Thư mục làm việc: {target_dir}")

    if len(candidate_files) < 2:
        print("\n⚠️  [THÔNG BÁO] Không đủ file cơ sở dữ liệu để thực hiện merge!")
        print(f"   • Tìm thấy: {len(candidate_files)} file .db ({[os.path.basename(f) for f in candidate_files]})")
        print("   👉 HƯỚNG DẪN:")
        print("   1. Copy các file portfolio.db từ các VPS khác nhau vào thư mục này.")
        print("      (Ví dụ: vps1.db, vps2.db, portfolio_backup.db, ...)")
        print("   2. Chạy lại file 1_click_merge.bat một lần nữa.")
        print("=" * 70)
        return ""

    output_path = os.path.join(target_dir, OUTPUT_DB_NAME)

    # Backup existing merged_portfolio.db if exists
    if os.path.exists(output_path):
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        bak_name = f"{OUTPUT_DB_NAME}.bak_{ts}"
        bak_path = os.path.join(target_dir, bak_name)
        shutil.copy2(output_path, bak_path)
        print(f"🛡️  Đã sao lưu file merged cũ: {bak_name}")

    print(f"\n📋 Đã tìm thấy {len(candidate_files)} file database cần hợp nhất:")
    for idx, fpath in enumerate(candidate_files, 1):
        size_kb = os.path.getsize(fpath) / 1024
        print(f"   [{idx}] {os.path.basename(fpath):<30} ({size_kb:,.1f} KB)")

    # Step 1: Copy base file
    base_file = candidate_files[0]
    print(f"\n🚀 [Bước 1/2] Sử dụng '{os.path.basename(base_file)}' làm cơ sở (Base Database)...")
    shutil.copy2(base_file, output_path)

    # Step 2: Merge subsequent files
    print("⏳ [Bước 2/2] Tuần tự hợp nhất các file tiếp theo và lọc trùng lặp...")
    summary_history_added = 0
    
    for idx, next_file in enumerate(candidate_files[1:], 2):
        print(f"   ↳ Hợp nhất [{idx}/{len(candidate_files)}]: {os.path.basename(next_file)}...")
        res = merge_single_db(next_file, output_path)
        if "history" in res:
            added = res["history"][1]
            summary_history_added += added
            print(f"     ✔ Thêm mới +{added} lệnh lịch sử (History)")

    # Verify integrity
    conn = sqlite3.connect(output_path)
    cur = conn.cursor()
    cur.execute("PRAGMA integrity_check")
    status = cur.fetchone()[0]

    # Get final counts
    total_accs = get_table_row_count(conn, "accounts")
    total_history = get_table_row_count(conn, "history")
    total_positions = get_table_row_count(conn, "positions")
    total_bots = get_table_row_count(conn, "bot_instances")
    conn.close()

    if status.lower() != "ok":
        raise sqlite3.DatabaseError(f"Integrity check failed: {status}")

    print("\n" + "=" * 70)
    print("   🎉 HỢP NHẤT TOÀN BỘ CƠ SỞ DỮ LIỆU THÀNH CÔNG RỰC RỠ!")
    print("=" * 70)
    print(f"• File kết quả đầu ra: {OUTPUT_DB_NAME}")
    print(f"• Kích thước file     : {os.path.getsize(output_path) / 1024:,.1f} KB")
    print(f"• Tính toàn vẹn CSDL  : PRAGMA integrity_check = {status.upper()} (Hoàn hảo)")
    print("-" * 70)
    print(f"{'Bảng Dữ Liệu':<25} | {'Tổng Số Bản Ghi Hợp Nhất':<25}")
    print("-" * 70)
    print(f"{'history (Lịch sử lệnh)':<25} | {total_history:<25}")
    print(f"{'accounts (Tài khoản)':<25} | {total_accs:<25}")
    print(f"{'positions (Lệnh đang mở)':<25} | {total_positions:<25}")
    print(f"{'bot_instances (Cấu hình bot)':<25} | {total_bots:<25}")
    print("-" * 70)
    print("\n👉 CÁCH SỬ DỤNG:")
    print(f"   1. Copy file '{OUTPUT_DB_NAME}' ra thư mục gốc dự án cTrader-AI-Trading-Hub.")
    print("   2. Đổi tên thành 'portfolio.db' để Web Hub và Bot Manager nhận dữ liệu mới.")
    print("=" * 70)

    return output_path

def main():
    target_dir = os.path.dirname(os.path.abspath(__file__))
    if len(sys.argv) > 1 and os.path.isdir(sys.argv[1]):
        target_dir = os.path.abspath(sys.argv[1])
    try:
        run_merge_pipeline(target_dir)
    except Exception as e:
        print(f"\n❌ Đã xảy ra lỗi trong quá trình hợp nhất: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
