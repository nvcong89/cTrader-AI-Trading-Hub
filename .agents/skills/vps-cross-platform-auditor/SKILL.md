---
name: vps-cross-platform-auditor
description: Automated cross-platform compliance auditor agent for Windows Server/Desktop and Linux (Ubuntu) VPS. Inspects codebase for hardcoded Windows/Linux paths, unsafe path parsing, daemon detachment, DB path stability, unguarded OS APIs, and shell script line endings.
---

# VPS Cross-Platform Windows & Linux Deployment Auditor Agent

This specialized agent verifies that all backend services, bot process managers, database access routines, and deployment scripts in the repository are 100% compliant with both **Windows Server/Desktop** and **Linux (Ubuntu 22.04/24.04/26.04 LTS)** VPS environments before deployment.

---

## 🛡️ Compliance Checklist & Rules

1. **No Hardcoded Drive Letters & Paths**:
   - Prohibits hardcoding `C:\` or `D:\` in application source code, API handlers, or configuration.
   - All paths must use relative project references or dynamic resolution via `os.path.abspath(os.path.join(os.path.dirname(__file__), ...))`.

2. **Cross-Platform Path Parsing (`get_algo_filename`)**:
   - Prevents `os.path.basename` failure on POSIX Linux when dealing with Windows `\` separators.
   - Requires cross-platform normalization: `path.replace('\\', '/').split('/')[-1]`.

3. **Subprocess & Daemon Detachment**:
   - On Linux (`os.name != 'nt'`), background daemons (such as `ctrader-cli run`) must use `start_new_session=True` to detach from controlling TTY and SSH parent processes.
   - On Windows (`os.name == 'nt'`), use `creationflags=subprocess.CREATE_NEW_PROCESS_GROUP`.

4. **Dynamic cTrader CLI Discovery**:
   - Must dynamically search standard installation directories on both Windows (`%LOCALAPPDATA%\Spotware`, `%ProgramFiles%\Spotware`) and Linux (`/usr/local/bin/ctrader-cli`, `/opt/ctrader-cli`, Homebrew).

5. **SQLite Database Path Stability**:
   - `DB_FILE` must be anchored using `os.path.abspath(os.path.join(os.path.dirname(__file__), "portfolio.db"))` rather than a fragile relative path `"portfolio.db"`.

6. **Shell Script Line Ending Standard (UNIX LF)**:
   - All Linux `.sh` scripts must use UNIX `LF` (`\n`) line endings to prevent fatal `\r: command not found` errors.

7. **Defensive OS-Specific API Guards**:
   - Any Windows-only API call (`ctypes.windll`, `msvcrt`) must be wrapped inside `if os.name == 'nt':` or `if sys.platform == 'win32':`.

---

## 🚀 How to Run the Auditor

Run the auditor script anytime before committing or deploying code:

```powershell
python .agents/skills/vps-cross-platform-auditor/scripts/audit_cross_platform.py
```

### Interpretation of Results:
- **`✔ [PASS]`**: Check passed without any compatibility issues.
- **`⚠ [WARN]`**: Potential cross-platform hazard detected. Review recommended.
- **`✖ [FAIL]`**: Critical incompatibility found. MUST be resolved before VPS deployment. Exit code `1`.
