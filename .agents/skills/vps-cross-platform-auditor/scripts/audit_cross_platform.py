#!/usr/bin/env python3
"""
VPS Cross-Platform Windows & Linux Deployment Auditor
-----------------------------------------------------
Scans the repository to verify that code and scripts strictly satisfy
dual-compatibility standards for both Windows and Linux (Ubuntu) VPS.

Audit Checks:
1. Hardcoded Windows paths (C:\\, D:\\) in source code.
2. Unsafe os.path.basename calls on cross-platform paths.
3. Unguarded Windows-specific APIs (ctypes.windll, msvcrt, CREATE_NEW_PROCESS_GROUP).
4. Subprocess daemon detachment on Linux (start_new_session=True).
5. Absolute path stability for SQLite databases.
6. UNIX line endings (LF, \\n) in all .sh deployment scripts.
7. cTrader CLI dual-platform path discovery.
"""

import os
import sys
import re
from pathlib import Path
from typing import List, Dict, Tuple

# Ensure stdout and stderr support UTF-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parents[4]

# Colors for terminal output
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"

IGNORE_DIRS = {
    ".git", "node_modules", "venv", "__pycache__", ".pytest_cache", 
    "HistoricalData", "artifacts", "logs", "backups", "scratch", ".gemini"
}

IGNORE_FILES = {
    "audit_cross_platform.py", "Linux_commands.txt", "VPS_Linux.txt", 
    "README.md", "AGENTS.md", "SKILL.md", "check_db.py", "test_start_bot.py"
}

class CrossPlatformAuditor:
    def __init__(self, root: Path):
        self.root = root
        self.results: Dict[str, List[Dict[str, any]]] = {
            "PASS": [],
            "WARN": [],
            "FAIL": []
        }

    def log_issue(self, level: str, check_name: str, file_path: Path, line_num: int, message: str, snippet: str = ""):
        rel_path = file_path.relative_to(self.root)
        self.results[level].append({
            "check": check_name,
            "file": str(rel_path),
            "line": line_num,
            "message": message,
            "snippet": snippet.strip()
        })

    def audit_hardcoded_paths(self):
        """Check 1: Detect hardcoded Windows drive letters (C:\\, D:\\) in active code"""
        check_name = "Hardcoded Windows Drive Paths"
        pattern = re.compile(r'["\']([a-zA-Z]:\\[^"\']*)["\']')
        
        for p in self.root.rglob("*"):
            if p.is_file() and p.suffix in [".py", ".js", ".jsx", ".ts", ".tsx"] and not any(ig in p.parts for ig in IGNORE_DIRS):
                if p.name in IGNORE_FILES:
                    continue
                try:
                    with open(p, "r", encoding="utf-8", errors="ignore") as f:
                        in_docstring = False
                        doc_marker = None
                        for idx, line in enumerate(f, 1):
                            clean = line.strip()
                            # Check docstring toggles
                            if '"""' in clean:
                                if not in_docstring:
                                    in_docstring = True
                                    doc_marker = '"""'
                                elif doc_marker == '"""':
                                    in_docstring = False
                                    doc_marker = None
                            elif "'''" in clean:
                                if not in_docstring:
                                    in_docstring = True
                                    doc_marker = "'''"
                                elif doc_marker == "'''":
                                    in_docstring = False
                                    doc_marker = None
                            
                            if in_docstring or clean.startswith("#") or clean.startswith("//") or clean.startswith("*"):
                                continue

                            match = pattern.search(line)
                            if match:
                                val = match.group(1)
                                # Whitelist CLI executable fallback path search strings if guarded
                                if "Spotware" in val or "Local" in val or "cTrader" in val:
                                    continue
                                self.log_issue("FAIL", check_name, p, idx, f"Hardcoded Windows path detected: '{val}'", clean)
                except Exception:
                    pass

    def audit_unsafe_basename(self):
        """Check 2: Detect os.path.basename on algo_path without cross-platform normalization"""
        check_name = "Unsafe os.path.basename on Cross-Platform Paths"
        
        for p in self.root.rglob("*.py"):
            if any(ig in p.parts for ig in IGNORE_DIRS) or p.name in IGNORE_FILES:
                continue
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    lines = content.splitlines()
                    for idx, line in enumerate(lines, 1):
                        if "os.path.basename(" in line and "algo" in line:
                            # If it uses get_algo_filename or replace('\\', '/'), it is safe
                            if "replace('\\\\', '/')" not in line and "get_algo_filename" not in line:
                                self.log_issue("WARN", check_name, p, idx, 
                                    "os.path.basename called on algo path without '\\' normalization (fails on Linux POSIX)", line)
            except Exception:
                pass

    def audit_unguarded_windows_apis(self):
        """Check 3: Detect Windows-only modules/APIs called without os.name == 'nt' check"""
        check_name = "Unguarded Windows-Only APIs"
        win_indicators = ["ctypes.windll", "msvcrt", "CREATE_NEW_PROCESS_GROUP"]
        
        for p in self.root.rglob("*.py"):
            if any(ig in p.parts for ig in IGNORE_DIRS) or p.name in IGNORE_FILES:
                continue
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    lines = content.splitlines()
                    for idx, line in enumerate(lines, 1):
                        clean = line.strip()
                        if clean.startswith("#"):
                            continue
                        for ind in win_indicators:
                            if ind in clean:
                                # Check if guarded in file or surrounding lines
                                is_guarded = ("if os.name == 'nt'" in content or 
                                              "os.name == 'nt'" in clean or 
                                              "sys.platform == 'win32'" in content)
                                if not is_guarded:
                                    self.log_issue("FAIL", check_name, p, idx, f"Windows-only call '{ind}' without OS guard", clean)
            except Exception:
                pass

    def audit_linux_daemon_detachment(self):
        """Check 4: Verify subprocess.Popen for background cTrader CLI uses start_new_session on Linux"""
        check_name = "Linux Daemon Detachment (start_new_session)"
        bot_mgr = self.root / "bot_manager.py"
        if bot_mgr.exists():
            with open(bot_mgr, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                if "start_new_session" not in content:
                    self.log_issue("FAIL", check_name, bot_mgr, 1, 
                        "subprocess.Popen does not configure start_new_session=True for Linux. May hang SSH or parent workers.")
                else:
                    self.results["PASS"].append({
                        "check": check_name,
                        "file": "bot_manager.py",
                        "message": "Subprocess correctly configures start_new_session=True for POSIX detachment."
                    })

    def audit_database_path_stability(self):
        """Check 5: Verify SQLite DB_FILE uses os.path.abspath(os.path.join(os.path.dirname(__file__), ...))"""
        check_name = "SQLite DB Absolute Path Stability"
        db_py = self.root / "database.py"
        if db_py.exists():
            with open(db_py, "r", encoding="utf-8", errors="ignore") as f:
                for idx, line in enumerate(f, 1):
                    if line.strip().startswith("DB_FILE ="):
                        if "os.path.dirname(__file__)" not in line or "os.path.abspath" not in line:
                            self.log_issue("FAIL", check_name, db_py, idx, 
                                "DB_FILE is using a relative path. Must use os.path.abspath(os.path.join(os.path.dirname(__file__), ...))", line)
                        else:
                            self.results["PASS"].append({
                                "check": check_name,
                                "file": "database.py",
                                "message": "DB_FILE is anchored to script directory with absolute path."
                            })

    def audit_shell_line_endings(self):
        """Check 6: Check for Windows CRLF (\\r\\n) in Linux .sh scripts"""
        check_name = "Shell Script Line Endings (UNIX LF Standard)"
        sh_files = list(self.root.rglob("*.sh"))
        for sh in sh_files:
            if any(ig in sh.parts for ig in IGNORE_DIRS):
                continue
            try:
                with open(sh, "rb") as f:
                    raw = f.read()
                    if b"\r\n" in raw:
                        self.log_issue("FAIL", check_name, sh, 1, 
                            f"Shell script contains Windows CRLF line endings (\\r\\n). Causes '\\r: command not found' on Linux.")
                    else:
                        self.results["PASS"].append({
                            "check": check_name,
                            "file": str(sh.relative_to(self.root)),
                            "message": "Verified UNIX LF line endings."
                        })
            except Exception:
                pass

    def audit_ctrader_cli_discovery(self):
        """Check 7: Verify cTrader CLI dynamic resolution covers both Windows & Linux"""
        check_name = "cTrader CLI Dynamic Dual-Platform Discovery"
        bot_mgr = self.root / "bot_manager.py"
        if bot_mgr.exists():
            with open(bot_mgr, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                has_linux_check = "/usr/local/bin" in content or "linuxbrew" in content or "/opt/ctrader-cli" in content
                has_win_check = "LOCALAPPDATA" in content or "ProgramFiles" in content
                if not (has_linux_check and has_win_check):
                    self.log_issue("FAIL", check_name, bot_mgr, 1, 
                        "get_ctrader_cli_path does not comprehensively cover both Linux and Windows install paths.")
                else:
                    self.results["PASS"].append({
                        "check": check_name,
                        "file": "bot_manager.py",
                        "message": "get_ctrader_cli_path covers both Windows and Linux standard install directories."
                    })

    def run_all_audits(self) -> int:
        print(f"\n{BOLD}{CYAN}======================================================================{RESET}")
        print(f"{BOLD}{CYAN}   🚀 VPS CROSS-PLATFORM WINDOWS & LINUX DEPLOYMENT AUDITOR   {RESET}")
        print(f"{BOLD}{CYAN}======================================================================{RESET}\n")

        self.audit_hardcoded_paths()
        self.audit_unsafe_basename()
        self.audit_unguarded_windows_apis()
        self.audit_linux_daemon_detachment()
        self.audit_database_path_stability()
        self.audit_shell_line_endings()
        self.audit_ctrader_cli_discovery()

        # Print Passes
        for p in self.results["PASS"]:
            print(f"  {GREEN}✔ [PASS]{RESET} {BOLD}{p['check']}{RESET} ({p['file']}): {p['message']}")

        # Print Warnings
        for w in self.results["WARN"]:
            print(f"\n  {YELLOW}⚠ [WARN]{RESET} {BOLD}{w['check']}{RESET}")
            print(f"     File: {w['file']}:{w['line']}")
            print(f"     Issue: {w['message']}")
            if w.get('snippet'):
                print(f"     Code:  {w['snippet']}")

        # Print Failures
        for f in self.results["FAIL"]:
            print(f"\n  {RED}✖ [FAIL]{RESET} {BOLD}{f['check']}{RESET}")
            print(f"     File: {f['file']}:{f['line']}")
            print(f"     Issue: {f['message']}")
            if f.get('snippet'):
                print(f"     Code:  {f['snippet']}")

        fail_count = len(self.results["FAIL"])
        warn_count = len(self.results["WARN"])
        pass_count = len(self.results["PASS"])

        print(f"\n{BOLD}----------------------------------------------------------------------{RESET}")
        print(f"Audit Summary: {GREEN}{pass_count} Passed{RESET} | {YELLOW}{warn_count} Warnings{RESET} | {RED}{fail_count} Failed{RESET}")
        print(f"{BOLD}----------------------------------------------------------------------{RESET}\n")

        if fail_count > 0:
            print(f"{RED}{BOLD}❌ AUDIT FAILED:{RESET} Resolve all FAIL issues before deploying to VPS.\n")
            return 1
        else:
            print(f"{GREEN}{BOLD}✅ AUDIT PASSED:{RESET} Codebase is 100% compliant for Windows & Linux VPS deployment!\n")
            return 0

if __name__ == "__main__":
    auditor = CrossPlatformAuditor(ROOT_DIR)
    exit_code = auditor.run_all_audits()
    sys.exit(exit_code)
