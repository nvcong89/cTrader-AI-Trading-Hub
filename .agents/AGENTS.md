# Workspace Coding Rules & Standards

## Native cTrader 5.x Architecture Standard
All cBot projects delivered or finalized in this repository **MUST follow cTrader 5.x native solution/project hierarchy**:
```
<RootFolder>/ (e.g. Smart Trend Bot Pro_XAU_M15_v102/)
├── <RootFolder>.sln
└── <RootFolder>/ (Subfolder matching project name)
    ├── <RootFolder>.cs (Single consolidated C# file)
    ├── <RootFolder>.csproj (MSBuild project file)
    └── GlobalUsings.cs (Global using directives)
```
- **Rationale**: This exact structure matches cTrader Automate App native project instantiation. It enables cTrader to display 100% of the single-file `.cs` source code directly inside the cTrader Automate UI with full in-app editing and recompilation capabilities.

## Zero Warning & Clean Compilation Standard
All cBot C# source code MUST compile cleanly in cTrader Automate App with **0 Warnings**:
1. **CS0162 (Unreachable Code)**: Declare in-code license flag `Unlimited_License` as `private readonly bool` (NOT `const bool`) so branch evaluation occurs at runtime without generating dead-code compiler warnings.
2. **SYSLIB0014 (WebRequest Obsolete)**: Wrap `HttpWebRequest` network calls (`FetchForexFactoryNews` and `TryFetchXmlFallback`) with `#pragma warning disable SYSLIB0014` and `#pragma warning restore SYSLIB0014`.
3. **CS0618 (ModifyPosition Obsolete)**: Wrap legacy 3-parameter `ModifyPosition` calls (`MoveStopLossToBreakEven` and `TrailingStop`) with `#pragma warning disable CS0618` and `#pragma warning restore CS0618`.
- **Mandatory Native cTrader CLI Build Standard**: ALL cBot compilation and package building tasks MUST use official `ctrader-cli build` engine as the primary build tool with `--ctid`, `--pwd-file`, and `--account` authentication flags.

## AccessRights & Backtest Sandbox Protection
- All cBots default to `[Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]`.
- All network operations (ForexFactory News fetcher, Telegram alerts) and File I/O operations MUST check `if (RunningMode != RunningMode.RealTime) return;` at entry to prevent `System.Security.SecurityException` crashes during Backtesting and Optimization.

## ForexFactory News Feed Standard
- Primary feed URL: `https://nfs.faireconomy.media/ff_calendar_thisweek.json` (JSON format).
- Fallback feed URL: `https://nfs.faireconomy.media/ff_calendar_thisweek.xml` (XML format).
- Always include standard browser `User-Agent` (`Mozilla/5.0 ...`) and `Accept` HTTP headers to prevent 403 WAF blocks.
- Failed news fetches must retry every 5 minutes instead of waiting 6 hours.

## Mandatory cTrader CLI Backtesting & Optimization Standard
- **MANDATORY**: ALL backtesting and parameter optimization tasks MUST EXCLUSIVELY use official `ctrader-cli` (`ctrader-cli backtest` or cTrader Automate engine).
- **PROHIBITION**: NEVER use simplified external Python math simulations for generating backtest or optimization results. Official `ctrader-cli` ensures 100% fidelity with cTrader's native execution engine (including `m1` tick bars, spread, commission, leverage, and symbol precision).
- **CLI Executable**: `ctrader-cli.exe` is located at `C:\Users\210608\AppData\Local\Spotware\cTrader\abb70432efbee65d18af69e79fe8efe1` and configured in User `PATH`.
- **Default Spread Standard**: ALL backtesting and optimization runs MUST use `--spread=15` (15 pips) as the standard default spread.
- **Default Starting Balance**: ALL backtesting and optimization runs MUST use `--balance=1000` ($1,000 USD initial capital) as the standard default starting balance.
- **Default Commission Standard**: ALL backtesting and optimization runs MUST use `--commission=30` ($30 per 1 mln USD volume) as the standard default commission.
- **Offline-First Data Rule**: ALL backtesting tasks MUST prioritize reading local offline data (`HistoricalData\XAUUSD\XAUUSD-1M.csv` with `--data-mode=m1-csv`) before downloading online data from servers.
- **Explicit Backtest Execution Method Standard**: ALWAYS explicitly declare the exact backtest execution engine/method used (e.g. "Official cTrader CLI Native Engine (`ctrader-cli backtest`)" or "cTrader Desktop App UI") in every backtest summary report.
- **Comprehensive Backtest Reporting Standard**: EVERY backtest output summary MUST include: (1) The exact execution engine/method used, (2) The complete parameter set used to run the backtest (SL %, TP %, Risk %, ADX, RSI, TEMA, DCA settings), and (3) An analytical evaluation section assessing performance, win rate, Profit Factor, Drawdown, and strategy strengths/weaknesses.
- **Mandatory Asynchronous Background Task Standard**: ALL long-running backtesting and parameter optimization runs MUST be launched as asynchronous background tasks (`run_command` in background). This enables concurrent user interaction so the user can perform other coding, reviewing, or chatting tasks uninterrupted while CLI computations run in the background.
- **Mandatory 2-Step Risk Optimization Standard**: ALL parameter optimizations MUST follow the 2-step risk management methodology: (1) Step 1: Broad Exploration / Genetic Search to narrow parameter ranges, followed by (2) Step 2: Exhaustive Grid Search (`run_cli_optimizer.ps1`) to identify stable parameter plateaus (Parameter Plateau) and prevent overfitting spikes before live trading.
- **Package Verification**: All `.algo` compiled packages MUST be validated using `ctrader-cli metadata <path.algo>`.

## Python & Node Dependency Management Standard
- **MANDATORY**: Whenever a new Python library or NPM package is introduced to the project during code editing, you MUST immediately update `requirements.txt` (for Python) or `package.json` (for Node.js/React).
- You MUST also update `install.bat` to include any new installation steps required by the new libraries.
- **Rationale**: This ensures that the environment is fully reproducible for other developers or deployments with a 1-click install.

## Bot Strategy Documentation Standard (`docs/`)
- **MANDATORY**: For every cBot integrated, generated, or maintained in this repository, there **MUST be a corresponding Markdown strategy document** inside the `docs/` directory: `docs/<Bot_Name>.md`.
- **Required Sections for Each Strategy Document**:
  1. **Strategy Overview & Instrument**: Target symbol (e.g., XAUUSD), timeframe (e.g., M15), execution philosophy.
  2. **Technical Analysis Engine**: Indicators (TEMA, RSI, ADX, Fibonacci, ATR), entry/exit trigger conditions.
  3. **Gemini AI Agent Integration**: Market snapshot schema, prompt formulation, decision handling (`BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL`), confidence thresholds, and real-time execution flow.
  4. **Risk & Position Management**: Dynamic lot sizing, SL/TP calculation (pips vs equity percentage), Break-Even, Trailing Stop, Equity Drawdown Circuit Breakers, DCA Grid logic.
  5. **News & Market Protection**: ForexFactory high-impact news filter window (pre/post news suspension).
  6. **Parameter Reference Table**: Parameter names, data types, default values, and optimization guidelines.

## cBot Template & Automated Generation Standard (`cbot_agent_template`)
- **Master Reference Template**: All new cBots created in this repository MUST be instantiated from `cbot/cbot_agent_template/`.
- **Continuous Master Template Synchronization Rule (CRITICAL)**:
  - Whenever ANY architectural enhancement, security patch, performance optimization, or bug fix is implemented for ANY cBot in this repository (e.g. Main Thread API safety, `SendLiveTickTelemetry` synchronization, `BeginInvokeOnMainThread` execution for AI decisions, ForexFactory news fallback, SQLite telemetry, headless Chart null-checks, etc.), the exact same enhancement/patch **MUST BE IMMEDIATELY PROPAGATED AND SYNCHRONIZED BACK TO `cbot/cbot_agent_template/`**.
  - **Rationale**: This ensures `cbot_agent_template` remains the evergreen, state-of-the-art master template so that newly generated bots never inherit stale code or resolved bugs.
- **Mandatory Template Infrastructure Elements**:
  1. **Gemini AI Agent Bridge**: Real-time snapshot payload (`/trade`), live telemetry streaming (`/api/tick`), trade execution events (`/portfolio/report`), and AI decision execution (`BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL`).
  2. **Main Thread API Safety**: All cTrader API/COM objects (`Positions`, `Account`, `Symbol`) MUST be captured synchronously on the Main Thread before any asynchronous or background dispatch (`Task.Run`).
  3. **Risk & Capital Management**: Dynamic volume sizing (`Fixed` vs `% Equity`), SL/TP calculation (`% Equity` vs `Pips`), High-Watermark Circuit Breaker (automatic 50% risk cut when DD threshold reached).
  4. **Position Protection**: Automated Break-Even price move, Trailing Stop Loss, and DCA Grid management.
  5. **News & Alerts**: ForexFactory High-Impact News filter window (JSON + XML fallback), Telegram alerts with chart screenshot support.
  6. **Headless Execution Safety**: All Chart API interactions (`DrawStaticText`, `TakeChartshot`, `DrawFibonacciRetracement`) MUST be protected with `if (Chart != null)` to prevent crashes in CLI / headless environments.
  7. **Defensive OnStart Initialization**: Initialization subroutines (`InitializeLicense`, `InitializeNewsFilter`, `InitializeRiskManagement`, `InitializeStrategyIndicators`, `InitializeUI`) MUST be wrapped in defensive `try-catch` blocks.
  8. **AI Gate Mode & Technical SL/TP Determination Standard**:
      - **Pre-filter Gate Architecture**: Technical indicators (`buyCondition`/`sellCondition`) serve as trend filters (`bias_direction`); the AI Agent is the sole precision entry authority (`UseAiGateMode = true`).
      - **Pure Technical SL/TP (SMC Structure-Based)**: AI determines Stop Loss (placed behind Order Blocks / Swing High-Low) and Take Profit (placed at opposing liquidity pools / FVGs) strictly based on technical market structure. **DO NOT artificially inflate or force Risk:Reward ratios**; TP must reflect true structural targets.
      - **Strict Hard Rule — Zero AI Volume Authority (100% cBot Risk Engine Calculation)**:
        * The AI Agent has **0% authority** over trade volume or lot sizing.
        * Any volume parameter in AI responses (`volume_lots`) MUST be strictly ignored or treated as minimum lot (0.01).
        * The actual order volume is 100% computed by the cBot internal Risk Management Engine using dynamic account equity risk and technical SL distance:
          $$\text{TargetUnits} = \frac{\text{Account.Equity} \times (\text{EffectiveRisk}\% / 100)}{\text{EffectiveSL}_{\text{pips}} \times \text{Symbol.PipValue}}$$
        * Volume is strictly normalized via `Symbol.NormalizeVolumeInUnits` and bounded within `[Symbol.VolumeInUnitsMin, Math.Min(maxVol * Symbol.LotSize, Symbol.VolumeInUnitsMax)]`.
      - **Smart Geometric Position Management & Pre-Flight Validation Engine (`SafeModifyPosition`)**:
        * **AI ADJUST Standard JSON Schema**: When evaluating active positions, the AI Agent outputs:
          ```json
          {
            "action": "ADJUST",
            "volume_lots": 0.01,
            "sl_pips": 150,
            "tp_pips": 350,
            "new_sl_price": 2655.20,
            "new_tp_price": 2680.00,
            "reason": "SMC market structure evaluation...",
            "confidence": 92.5
          }
          ```
        * **100% Safe Pre-Flight Modification**: All calls modifying positions (Trailing Stop, Break-Even, AI ADJUST, DCA) MUST route exclusively through `SafeModifyPosition(Position pos, double? targetSL, double? targetTP, string source)` to validate broker geometric boundaries and `minStopBuffer` before calling the broker API, preventing all `InvalidStopLossTakeProfit` rejections.
        * **Comprehensive 7-Scenario Protection Architecture**:
          1. *Scenario 1 (Break-Even Move)*: Move SL to `pos.EntryPrice` when risk-reward threshold is reached to eliminate downside risk.
          2. *Scenario 2 (SMC Swing Trailing)*: Trail SL behind Higher Low (HL) for BUY or Lower High (LH) for SELL plus an ATR buffer (`0.5 - 1.0 * ATR(14)`) to prevent stop hunts.
          3. *Scenario 3 (Extend TP)*: Dynamically expand TP target when higher-timeframe liquidity pools (BSL/SSL) are reachable.
          4. *Scenario 4 (Positive Trailing SL Auto-Mapping)*: If AI returns a target TP that lies geometrically opposite of a standard TP (e.g. SELL Entry 4347, Market 4330, Proposed TP 4345.72), cBot automatically preserves the original structural TP and re-maps the proposed price to a Positive Trailing SL above market price to lock in accrued profit.
          5. *Scenario 5 (Hybrid Smart Profit-Lock Exit)*: If an AI-proposed SL or Trailing SL is breached by market price:
             - If trade is in profit (`currentPrice < Entry` on SELL or `> Entry` on BUY): execute immediate `ClosePosition(pos)` to lock in profit.
             - If trade is in drawdown: retain existing `pos.StopLoss`, skip modifying SL, and prevent broker `InvalidStopLossTakeProfit` rejections and panic stop-outs.
          6. *Scenario 6 (Broker minStopBuffer)*: Strictly enforce minimum broker stop distance before calling API:
             $$\text{minStopBuffer} = \max(\text{Symbol.Spread} \times 3, \text{Symbol.TickSize} \times 10)$$
             Requiring $SL < \text{Bid} - \text{minStopBuffer}$ & $TP > \text{Ask} + \text{minStopBuffer}$ for BUY; and $SL > \text{Ask} + \text{minStopBuffer}$ & $TP < \text{Bid} - \text{minStopBuffer}$ for SELL.
          7. *Scenario 7 (Anti-Spam Threshold Filter)*: Only submit `ModifyPosition` if proposed SL/TP changes by at least `0.5 * Symbol.PipSize` to avoid broker rate-limiting penalties.
      - **Default Local AI Server Hub**: All cBots default to `UseDirectAiApi = false` to route requests through the local Python AI Server Hub (`127.0.0.1:8181`).
- **Generator Agent Skill**: Use `.agents/skills/ctrader-cbot-generator/scripts/generate_cbot.ps1` to instantiate new bots with automated compilation, zero warnings verification, and strategy documentation generation.

## FastAPI & Web Hub Operational Standards
1. **Route Precedence Rule**: In FastAPI, static routes (e.g. `/api/bots/bulk/*`) MUST ALWAYS be declared BEFORE path-parameterized routes (e.g. `/api/bots/{bot_id}/*`) to prevent router collision and `422 Unprocessable Content` errors.
2. **Asynchronous Non-Blocking Background Execution**: Any long-running batch or sequential operations (such as Bulk Bot Fleet Start/Restart) MUST be executed asynchronously in background tasks using `await asyncio.sleep(...)` to prevent blocking the FastAPI Main Event Loop.
3. **VPS Adaptive Dynamic CPU-Gated Startup Standard**: Sequential bot startup runs (Start All / Restart All) MUST use adaptive CPU gating: after launching a bot, wait minimum stabilization time (`min_delay_seconds = 10s`), continuously monitor VPS CPU via `psutil`, and only trigger the next bot when CPU drops below target threshold (`max_cpu_threshold = 40.0%`, confirmed across 2 consecutive readings) with a safety timeout fallback (`max_wait_seconds = 90s`) to protect VPS CPU and RAM.
4. **React Safe Error Handling**: All frontend API error catch blocks MUST use `formatErrorMessage` to safely serialize validation arrays/objects into plain strings before rendering to JSX, preventing React blank/black screen crashes.
5. **Active Positions Multi-Tier Sync & Lifecycle Standard**:
   - **Account-Gated Visibility**: Toàn bộ API truy vấn vị thế (`/api/positions`, `dashboard_view`) BẮT BUỘC chỉ trả về các lệnh thuộc tài khoản đang có bot ở trạng thái `RUNNING` hoặc `STARTING`. Khi không có bot nào chạy, sổ lệnh bắt buộc phải trống hoàn toàn.
   - **Multi-Tier Sync Architecture**:
     * *Tier 1 (cBot Realtime Telemetry)*: Telemetry `/api/tick` cập nhật bộ nhớ in-memory tức thì (~0.001ms), ghi đệm SQLite mỗi 10s.
     * *Tier 2 (cTrader CLI Broker Sync)*: Vì cBot độc lập chỉ quản lý 1 cặp tiền, hệ thống phải tự động kích hoạt `ctrader_reader.sync_ctrader_broker_positions()` ngầm non-blocking qua `run_in_executor` (throttled 15s) khi người dùng truy vấn vị thế hoặc dashboard để kéo toàn bộ các lệnh thực tế của tài khoản từ broker.
     * *Tier 3 (cTrader Open API Cloud Sync)*: Đồng bộ số dư và vị thế qua WebSocket Open API (throttled 15s) cho tài khoản Cloud.
   - **Automatic Cleanup & Purge**:
     * Server Startup: Tự động chạy `cleanup_stale_positions_on_startup()` xóa các vị thế của tài khoản không có bot chạy.
     * Bot Stop: Khi bot dừng, nếu tài khoản không còn bot nào đang chạy, tự động purge sạch các vị thế của tài khoản đó.
   - **Frontend Polling & Resource Protection**: Frontend polling mặc định 15s (các tùy chọn: 5s, 15s, 30s, 60s, 0s/Tắt), tự động tạm dừng polling khi tab trình duyệt bị ẩn (`!document.hidden`) để bảo vệ 100% tài nguyên VPS.

## VPS Cross-Platform Windows & Linux Deployment Standard
All backend services, bot process managers, database access routines, and deployment scripts in this repository **MUST be strictly dual-compatible with both Windows Server/Desktop and Linux (Ubuntu 22.04/24.04/26.04 LTS)**:
1. **Cross-Platform Path Handling**:
   - **PROHIBITION**: NEVER hardcode Windows drive letters (`C:\`, `D:\`) or raw backslash path separators (`\`) in application logic or default configurations.
   - **Cross-Platform Path Parsing**: When parsing filenames or resolving paths that may originate from another operating system (e.g. `algo_path` saved on Windows imported into Linux SQLite), ALWAYS use cross-platform extraction: `path.replace('\\', '/').split('/')[-1]` rather than standard `os.path.basename` (which does not treat `\` as a separator on POSIX Linux).
   - **Stable Absolute Base Paths**: All database files, credentials files, and log directories MUST resolve against `os.path.dirname(__file__)` (e.g. `os.path.abspath(os.path.join(os.path.dirname(__file__), "portfolio.db"))`) instead of volatile relative paths like `"portfolio.db"` which fail when scripts are executed from varying working directories.
2. **Subprocess & cTrader CLI Daemon Detachment**:
   - **Linux POSIX Detachment**: On Linux (`os.name != 'nt'`), background processes spawned via `subprocess.Popen` (such as `ctrader-cli run`) MUST specify `start_new_session=True` so that child processes detach cleanly from controlling terminals and SSH sessions without hanging parent web workers or SSH pipelines.
   - **Windows Process Group**: On Windows (`os.name == 'nt'`), use `creationflags=subprocess.CREATE_NEW_PROCESS_GROUP`.
   - **Dynamic CLI Binary Discovery**: Application code MUST dynamically discover `ctrader-cli` across both environments:
     * Linux: Check system PATH, `/usr/local/bin/ctrader-cli`, `/opt/ctrader-cli/ctrader-cli`, Homebrew `/home/linuxbrew/.linuxbrew/bin/ctrader-cli`.
     * Windows: Check system PATH, `%LOCALAPPDATA%\Spotware\cTrader`, `%ProgramFiles%\Spotware`.
3. **OS-Specific Guards & APIs**:
   - Any Windows-only API calls (`ctypes.windll`, `msvcrt`, `subprocess.CREATE_NEW_PROCESS_GROUP`) MUST be wrapped in explicit OS guards: `if os.name == 'nt':` or `if sys.platform == 'win32':`.
   - Any Linux-only service or shell integrations (`systemctl`, POSIX signals like `SIGKILL`, `chmod +x`) MUST be guarded or isolated to deployment scripts.
4. **Database Migration Self-Healing**:
   - When loading bot instances from SQLite, if an `algo_path` contains stale foreign path separators or fails `os.path.exists()`, the system MUST auto-heal by locating the candidate file in the local active directory (`cbot/` or root) and updating the database record automatically.
5. **Shell Script Line Ending Standard (LF)**:
   - All Linux deployment and maintenance scripts (`.sh` files in `deploy/`) MUST be formatted with UNIX line endings (`LF`, `\n`) rather than Windows line endings (`CRLF`, `\r\n`). Windows `CRLF` in shell scripts causes fatal `\r: command not found` errors on Linux.
6. **Mandatory Pre-Deployment Cross-Platform Audit**:
   - Before deploying code to production Windows or Linux VPS, run the Cross-Platform Deployment Auditor Agent:
     `python .agents/skills/vps-cross-platform-auditor/scripts/audit_cross_platform.py`

## Mandatory Post-Plan Auto-Commit & Push Standard
- **MANDATORY**: Ngay sau khi hoàn thành bất kỳ kế hoạch triển khai nào (`implementation_plan.md`), sau khi toàn bộ mã nguồn đã được biên dịch thành công (0 warnings), kiểm thử và xác thực đạt chuẩn, agent **BẮT BUỘC PHẢI TỰ ĐỘNG THỰC HIỆN COMMIT VÀ PUSH TO ORIGIN** ngay lập tức.
- Không chờ người dùng phải gõ lệnh nhắc `commit and push to origin`.
- **Quy trình thực hiện chuẩn**:
  1. Dọn dẹp các file rác hoặc thư mục build tạm thời (ví dụ: `Get-ChildItem -Path cbot -Recurse -Directory -Filter "Debug" | Remove-Item -Recurse -Force`).
  2. `git status` kiểm tra các file thay đổi và untracked.
  3. `git add .` stage toàn bộ thay đổi.
  4. `git commit -m "<type>: <mô tả chi tiết và rõ ràng>"` theo chuẩn Conventional Commits.
  5. `git push origin main` đẩy mã nguồn lên remote repository.
  6. Báo cáo commit ID, commit message và trạng thái push sạch sẽ cho người dùng trong phản hồi cuối.

