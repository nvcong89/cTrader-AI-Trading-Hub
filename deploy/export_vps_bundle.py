#!/usr/bin/env python3
"""
VPS Safe Snapshot & Bundle Exporter
------------------------------------
Creates an atomic, consistent hot backup of portfolio.db, collects bot logs,
and captures systemd journal logs, packaging everything into /tmp/vps_data_bundle.tar.gz.
"""

import os
import sys
import shutil
import sqlite3
import tarfile
import subprocess
import datetime
from pathlib import Path

BASE_DIR = Path("/opt/ctrader-ai-hub")
if not BASE_DIR.exists():
    BASE_DIR = Path(__file__).resolve().parents[1]

timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
temp_snap_dir = Path(f"/tmp/vps_snapshot_{timestamp}")
bundle_tar_path = Path(f"/tmp/vps_bundle_{timestamp}.tar.gz")

temp_snap_dir.mkdir(parents=True, exist_ok=True)

# 1. SQLite Safe Hot Snapshot
db_path = BASE_DIR / "portfolio.db"
if db_path.exists():
    try:
        snap_db_path = temp_snap_dir / "portfolio.db"
        src_conn = sqlite3.connect(str(db_path), timeout=30.0)
        dst_conn = sqlite3.connect(str(snap_db_path))
        src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()
        print(f"[EXPORTER] SQLite safe snapshot created at: {snap_db_path}")
    except Exception as e:
        print(f"[EXPORTER] Warning: SQLite snapshot error: {e}", file=sys.stderr)

# 2. Collect bot log files
logs_src = BASE_DIR / "logs"
if logs_src.exists():
    logs_dst = temp_snap_dir / "logs"
    logs_dst.mkdir(parents=True, exist_ok=True)
    for f in logs_src.glob("*"):
        if f.is_file():
            shutil.copy2(f, logs_dst / f.name)
    print(f"[EXPORTER] Collected bot logs from {logs_src}")

# 3. Capture systemd journal (last 500 lines)
try:
    res = subprocess.run(
        ["journalctl", "-u", "ctrader-hub", "-n", "500", "--no-pager"],
        capture_output=True,
        text=True,
        timeout=10
    )
    if res.returncode == 0 and res.stdout:
        journal_file = temp_snap_dir / "systemd_ctrader-hub.log"
        journal_file.write_text(res.stdout, encoding="utf-8")
        print("[EXPORTER] Captured systemd journal logs")
except Exception as e:
    print(f"[EXPORTER] Warning: journalctl capture error: {e}", file=sys.stderr)

# 4. Create tar.gz bundle
with tarfile.open(bundle_tar_path, "w:gz") as tar:
    tar.add(temp_snap_dir, arcname="")

# 5. Clean up temporary snapshot directory
shutil.rmtree(temp_snap_dir, ignore_errors=True)

# Output token for parent PowerShell script
print(f"BUNDLE_PATH:{bundle_tar_path}")
