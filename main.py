import os
import sys
import sqlite3
import logging

# Enable ANSI Virtual Terminal Processing & Disable QuickEdit freeze on Windows
if os.name == 'nt':
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        
        # 1. Enable Virtual Terminal Processing for ANSI colors
        hStdOut = kernel32.GetStdHandle(-11) # STD_OUTPUT_HANDLE = -11
        mode_out = ctypes.c_ulong()
        if kernel32.GetConsoleMode(hStdOut, ctypes.byref(mode_out)):
            mode_out.value |= 0x0004 # ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
            kernel32.SetConsoleMode(hStdOut, mode_out)

        # 2. Disable QuickEdit mode to prevent terminal click freezing the server
        hStdIn = kernel32.GetStdHandle(-10) # STD_INPUT_HANDLE = -10
        mode_in = ctypes.c_ulong()
        if kernel32.GetConsoleMode(hStdIn, ctypes.byref(mode_in)):
            mode_in.value &= ~0x0040 # Disable ENABLE_QUICK_EDIT_MODE = 0x0040
            mode_in.value |= 0x0080  # ENABLE_EXTENDED_FLAGS = 0x0080
            kernel32.SetConsoleMode(hStdIn, mode_in)
    except Exception:
        pass
    try:
        import colorama
        colorama.init()
    except Exception:
        pass

# Filter out high-frequency polling endpoints from Uvicorn access logs for ultra-lightweight CPU performance
class LightweightEndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        noisy_endpoints = ["/api/tick", "/api/system/metrics", "/api/ping", "/favicon.ico"]
        return not any(ep in msg for ep in noisy_endpoints)

logging.getLogger("uvicorn.access").addFilter(LightweightEndpointFilter())

from fastapi import FastAPI, HTTPException, Request, Depends, Response, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
import json
import asyncio
import database
from database import (
    init_db,
    get_db,
    log_message,
    maintain_database,
    backup_database,
    get_database_stats,
    export_trading_history_csv,
    export_logs_csv,
    export_all_data_zip,
    reset_and_vacuum_database
)
import datetime
import time
from bot_manager import BotManager, get_ctrader_credentials, get_algo_filename, normalize_symbol, get_account_broker
import ai_engine
import ai_eval_harness
import ai_strategy_reviewer
import bot_leaderboard

bot_manager = BotManager()

app = FastAPI()

# Enable automatic Gzip compression for all JSON and static responses > 1000 bytes (reduces payload by 75-85%)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Init Database and sync configured multi-account profiles
init_db()
try:
    from account_config import sync_accounts_to_database
    sync_accounts_to_database()
except Exception as _sync_err:
    print(f"[Startup] Account config sync note: {_sync_err}")

# Setup CORS (Supports Localhost, Remote VPS IP, and Custom Domains)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import hashlib
import httpx

def sanitize_trade_history_item(h: Any) -> Dict[str, Any]:
    """Sanitizes history row to guarantee safe, memory-bounded JSON serialization without MemoryError."""
    try:
        h_dict = dict(h) if h else {}
    except Exception:
        h_dict = {}

    reason_raw = str(h_dict.get("reason") or "")
    # Truncate reason to max 1000 characters to prevent buffer reallocation MemoryError
    if len(reason_raw) > 1000:
        reason_raw = reason_raw[:1000] + "... [truncated]"

    return {
        "id": h_dict.get("id"),
        "account_id": str(h_dict.get("account_id") or ""),
        "account_label": str(h_dict.get("account_label") or ""),
        "account_type": str(h_dict.get("account_type") or "DEMO"),
        "bot_id": str(h_dict.get("bot_id") or ""),
        "symbol": str(h_dict.get("symbol") or "XAUUSD"),
        "side": str(h_dict.get("side") or ""),
        "volume": float(h_dict.get("volume") or 0.0),
        "entry_price": float(h_dict.get("entry_price") or 0.0),
        "exit_price": float(h_dict.get("exit_price") or 0.0),
        "pnl": round(float(h_dict.get("pnl") or 0.0), 2),
        "pnl_pips": round(float(h_dict.get("pnl_pips") or 0.0), 1) if h_dict.get("pnl_pips") is not None else None,
        "entry_time": str(h_dict.get("entry_time") or ""),
        "exit_time": str(h_dict.get("exit_time") or ""),
        "ctrader_id": int(h_dict.get("ctrader_id")) if h_dict.get("ctrader_id") else None,
        "reason": reason_raw
    }

def sanitize_log_item(l: Any) -> Dict[str, Any]:
    """Sanitizes system/AI log row to guarantee safe JSON serialization."""
    try:
        l_dict = dict(l) if l else {}
    except Exception:
        l_dict = {}
    msg = str(l_dict.get("message") or "")
    if len(msg) > 1500:
        msg = msg[:1500] + "... [truncated]"
    return {
        "id": l_dict.get("id"),
        "timestamp": str(l_dict.get("timestamp") or ""),
        "bot_id": str(l_dict.get("bot_id") or ""),
        "level": str(l_dict.get("level") or "INFO"),
        "message": msg
    }

def load_telegram_config():
    """
    Scans and loads Telegram credentials from telegram.env, telegrame.env, or environment variables.
    """
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("bot_token") or ""
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or os.environ.get("groupID") or ""

    base_dir = os.path.dirname(__file__)
    for filename in ["telegram.env", "telegrame.env", ".env"]:
        env_file = os.path.join(base_dir, filename)
        if os.path.exists(env_file):
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            parts = line.split("=", 1)
                            if len(parts) == 2:
                                k, v = parts[0].strip(), parts[1].strip()
                                if k in ["bot_token", "TELEGRAM_BOT_TOKEN", "BOT_TOKEN"] and not bot_token:
                                    bot_token = v
                                elif k in ["groupID", "group_id", "TELEGRAM_CHAT_ID", "CHAT_ID", "telegramChatId"] and not chat_id:
                                    chat_id = v
            except Exception:
                pass
            if bot_token and chat_id:
                break

    return bot_token, chat_id

async def send_telegram_server_notification(message: str):
    """
    Sends an asynchronous Telegram notification from the server backend.
    """
    try:
        bot_token, chat_id = load_telegram_config()
        if not bot_token or not chat_id:
            return

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML"
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json=payload)
    except Exception as e:
        print(f"[Telegram Server Notification Error] {e}")

# Dynamic Authentication Config with Multi-User Support & Password-Hashed Invalidation
def load_all_credentials() -> Dict[str, Dict[str, str]]:
    admin_user = "admin"
    admin_pass = "password123"
    guest_user = "guest"
    guest_pass = "guest"
    
    env_path = os.path.join(os.path.dirname(__file__), "account_login.env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        key_val = line.split("=", 1)
                        if len(key_val) == 2:
                            k = key_val[0].strip()
                            v = key_val[1].strip()
                            if k == "ADMIN_USERNAME":
                                admin_user = v
                            elif k == "ADMIN_PASSWORD":
                                admin_pass = v
                            elif k == "GUEST_USERNAME":
                                guest_user = v
                            elif k == "GUEST_PASSWORD":
                                guest_pass = v
        except Exception:
            pass
    return {
        "admin": {"username": admin_user, "password": admin_pass, "role": "admin"},
        "guest": {"username": guest_user, "password": guest_pass, "role": "guest"}
    }

def load_admin_credentials():
    creds = load_all_credentials()
    return creds["admin"]["username"], creds["admin"]["password"]

def generate_auth_token(password: str, role: str = "admin") -> str:
    """Generates a secure SHA-256 token derived from role and current password. If password changes, all old tokens become invalid immediately."""
    salt = "AG_GEMINI_SERVER_SALT_v1"
    hash_val = hashlib.sha256(f"{role}:{password}:{salt}".encode("utf-8")).hexdigest()
    return f"{role}_{hash_val}"

def get_current_user(request: Request) -> Dict[str, str]:
    # Allow secure internal localhost dispatch from maintenance scripts
    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1", "localhost", "testclient") and request.headers.get("X-Internal-Token") == "LOCAL_SYSTEM_DISPATCH":
        return {"username": "system_localhost", "role": "admin"}

    token = request.cookies.get("auth_token") or request.headers.get("X-Auth-Token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    creds = load_all_credentials()
    
    # Check Admin
    admin_info = creds["admin"]
    valid_admin_token = generate_auth_token(admin_info["password"], role="admin")
    legacy_admin_token = hashlib.sha256(f"{admin_info['password']}:AG_GEMINI_SERVER_SALT_v1".encode("utf-8")).hexdigest()
    if token == valid_admin_token or token == legacy_admin_token:
        return {"username": admin_info["username"], "role": "admin"}
        
    # Check Guest
    guest_info = creds["guest"]
    valid_guest_token = generate_auth_token(guest_info["password"], role="guest")
    legacy_guest_token = hashlib.sha256(f"{guest_info['password']}:AG_GEMINI_SERVER_SALT_v1".encode("utf-8")).hexdigest()
    if token == valid_guest_token or token == legacy_guest_token:
        return {"username": guest_info["username"], "role": "guest"}
        
    raise HTTPException(status_code=401, detail="Session expired or password changed. Please log in again.")

def require_admin(request: Request) -> Dict[str, str]:
    user = get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=403, 
            detail="Permission denied: Guest account is in View-Only mode and cannot perform modifying actions."
        )
    return user

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/login")
async def api_login(req: LoginRequest):
    creds = load_all_credentials()
    admin_info = creds["admin"]
    guest_info = creds["guest"]
    
    matched_role = None
    matched_user = None
    matched_pass = None
    
    if req.username == admin_info["username"] and req.password == admin_info["password"]:
        matched_role = "admin"
        matched_user = admin_info["username"]
        matched_pass = admin_info["password"]
    elif req.username == guest_info["username"] and req.password == guest_info["password"]:
        matched_role = "guest"
        matched_user = guest_info["username"]
        matched_pass = guest_info["password"]
        
    if matched_role:
        token = generate_auth_token(matched_pass, role=matched_role)
        response = JSONResponse(content={"status": "success", "user": matched_user, "role": matched_role})
        response.set_cookie(
            key="auth_token", 
            value=token, 
            max_age=86400*30, 
            httponly=True, 
            samesite='lax'
        )
        return response
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/logout")
async def api_logout():
    response = JSONResponse(content={"status": "success"})
    response.delete_cookie("auth_token")
    return response

@app.get("/api/auth/me")
async def auth_me(request: Request):
    user = get_current_user(request)
    return {"user": user["username"], "role": user["role"]}

# In-Memory Real-Time Live Telemetry Cache (Zero Disk I/O)
live_telemetry_cache: Dict[str, Any] = {}
active_websockets: List[WebSocket] = []

class LiveTickTelemetry(BaseModel):
    bot_id: str
    account_number: str
    symbol: str
    bid: float
    ask: float
    equity: float
    balance: float
    positions: List[Dict[str, Any]] = []

@app.post("/api/tick")
async def handle_live_tick(data: LiveTickTelemetry):
    """
    Receives high-frequency live ticks from cBots, caches in RAM, and broadcasts via WebSockets without disk I/O.
    """
    live_telemetry_cache[data.symbol] = data.dict()
    
    # Broadcast to connected WebSocket clients
    ws_payload = json.dumps({
        "type": "TICK_TELEMETRY",
        "data": data.dict()
    })
    for ws in list(active_websockets):
        try:
            await ws.send_text(ws_payload)
        except Exception:
            pass
    return {"status": "success"}

@app.get("/api/telemetry")
async def get_all_live_telemetry():
    """Returns all latest live tick metrics from the in-memory cache."""
    return live_telemetry_cache

@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        if live_telemetry_cache:
            await websocket.send_text(json.dumps({
                "type": "INITIAL_TELEMETRY",
                "data": live_telemetry_cache
            }))
        while True:
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
    except Exception:
        if websocket in active_websockets:
            active_websockets.remove(websocket)

# Database Management Endpoints
@app.get("/api/database/stats")
async def api_database_stats(request: Request):
    """Returns database size, row counts, and table status."""
    get_current_user(request)
    return get_database_stats()

@app.post("/api/database/maintain")
async def api_database_maintain(request: Request, days_to_keep: int = 14):
    """Manually triggers database log purging and WAL optimization."""
    require_admin(request)
    return maintain_database(days_to_keep=days_to_keep)

@app.post("/api/database/backup")
async def api_database_backup(request: Request):
    """Manually creates a new online SQLite database snapshot backup."""
    require_admin(request)
    return backup_database()

@app.get("/api/database/export/history/csv")
async def api_export_history_csv(request: Request):
    """Exports all closed trades from history table as a downloadable CSV file."""
    get_current_user(request)
    csv_data = export_trading_history_csv()
    filename = f"trading_history_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/database/export/logs/csv")
async def api_export_logs_csv(request: Request, bot_id: Optional[str] = "ALL", level: Optional[str] = "ALL"):
    """Exports system & AI reasoning logs as a downloadable CSV file."""
    get_current_user(request)
    csv_data = export_logs_csv(bot_id=bot_id, level=level)
    filename = f"ai_system_logs_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/database/export/all/zip")
async def api_export_all_zip(request: Request):
    """Exports both trading history and logs packaged in a ZIP archive."""
    get_current_user(request)
    zip_bytes = export_all_data_zip()
    filename = f"portfolio_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

class DatabaseResetRequest(BaseModel):
    purge_logs_days: Optional[int] = 1

@app.post("/api/database/reset")
async def api_database_reset(request: Request, req: Optional[DatabaseResetRequest] = None):
    """Safely backs up database, purges old logs, and executes VACUUM to shrink DB file."""
    require_admin(request)
    purge_days = req.purge_logs_days if req and req.purge_logs_days is not None else 1
    return reset_and_vacuum_database(backup_first=True, purge_logs_days=purge_days)

class PositionInfo(BaseModel):
    id: int
    type: str
    volume: float
    entry_price: float
    current_price: float
    pnl: float
    sl: Optional[float]
    tp: Optional[float]
    duration_minutes: float

class BarData(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float

class StrategyData(BaseModel):
    tema1: float
    tema2: float
    rsi: float
    adx: float
    atr: float
    recent_high: float
    recent_low: float
    asian_high: Optional[float] = None
    asian_low: Optional[float] = None
    asian_range_pips: Optional[float] = None
    asian_range_daily_atr_percent: Optional[float] = None
    killzone_session: Optional[str] = None
    bias_direction: Optional[str] = None
    traditional_signal: Optional[str] = None
    signal_window_bars: Optional[int] = None

class ActivePosition(BaseModel):
    id: int
    symbol: str
    trade_type: str
    volume: float
    entry_price: float
    sl: float
    tp: float
    entry_time: str

class HistoricalTrade(BaseModel):
    position_id: int
    symbol: str
    trade_type: str
    volume: float
    entry_price: float
    exit_price: float
    pnl: float
    entry_time: str
    exit_time: str

class SwingStructure(BaseModel):
    last_swing_high: float = 0.0
    swing_high_type: str = "N/A"  # "HH", "LH", "EH"
    last_swing_low: float = 0.0
    swing_low_type: str = "N/A"   # "HL", "LL", "EL"
    prev_swing_high: float = 0.0
    prev_swing_low: float = 0.0
    market_structure: str = "SIDEWAYS" # "BULLISH_HH_HL", "BEARISH_LH_LL", "EXPANDING_CHOCH", "CONTRACTING_RANGE"

class TimeframeContext(BaseModel):
    timeframe: str
    fast_tema: float = 0.0
    slow_tema: float = 0.0
    rsi: float = 50.0
    trend_bias: str = "NEUTRAL"
    high_35: float = 0.0
    low_35: float = 0.0
    close: float = 0.0
    swing_structure: Optional[SwingStructure] = None

class MultiTimeframeData(BaseModel):
    current_tf: Optional[TimeframeContext] = None
    h1_tf: Optional[TimeframeContext] = None
    h4_tf: Optional[TimeframeContext] = None

class MarketSnapshot(BaseModel):
    request_id: Optional[str] = None
    bot_id: str
    symbol: str
    timeframe: str
    ask: float
    bid: float
    spread_pips: Optional[float] = None
    pip_size: Optional[float] = None
    pip_value: Optional[float] = None
    digits: Optional[int] = None
    bars: List[BarData]
    strategy: StrategyData
    multi_timeframe: Optional[MultiTimeframeData] = None
    position: Optional[PositionInfo] = None
    active_positions: List[ActivePosition] = []
    recent_history: List[HistoricalTrade] = []
    account_number: str
    account_type: str
    account_label: Optional[str] = None
    account_balance: float
    account_equity: float

class AgentDecision(BaseModel):
    request_id: Optional[str] = None
    bot_id: Optional[str] = None
    symbol: Optional[str] = None
    timeframe: Optional[str] = None
    action: str
    volume_lots: float = 0.01
    sl_pips: float = 0.0
    tp_pips: float = 0.0
    new_sl_price: Optional[float] = 0.0
    new_tp_price: Optional[float] = 0.0
    reason: str = ""
    confidence: float = 0.0

ai_consecutive_errors = 0
MAX_CONSECUTIVE_AI_ERRORS = 5

async def database_maintenance_loop():
    """Runs SQLite database log purging, WAL checkpointing, safe online backup, and 100MB threshold check every 24 hours."""
    while True:
        try:
            await asyncio.sleep(86400) # 24 hours
            log_message("SYSTEM", "INFO", "Executing scheduled 24h SQLite database maintenance & backup...")
            maintain_res = maintain_database(days_to_keep=14)
            backup_res = backup_database(max_backups=7)
            log_message("SYSTEM", "INFO", f"Maintenance completed: {maintain_res.get('purged_logs', 0)} logs purged. Backup: {backup_res.get('backup_file')}")
            
            # Check 100MB threshold and alert
            stats = get_database_stats()
            if stats.get("is_storage_warning"):
                total_mb = stats.get("total_size_mb", 0.0)
                log_message("SYSTEM", "WARNING", f"⚠️ Database size ({total_mb} MB) exceeded 100MB safety threshold!")
                try:
                    await send_telegram_server_notification(
                        f"⚠️ <b>CẢNH BÁO DUNG LƯỢNG DATABASE</b>\n"
                        f"Dung lượng tệp <code>portfolio.db</code> đã đạt <b>{total_mb} MB</b> (vượt ngưỡng an toàn 100 MB).\n\n"
                        f"💡 <b>Khuyến nghị</b>: Truy cập Web Hub để <b>Export CSV</b> lưu trữ dữ liệu riêng và thực hiện <b>Reset & Vacuum Database</b>."
                    )
                except Exception:
                    pass
        except Exception as ex:
            log_message("SYSTEM", "ERROR", f"Error in database maintenance loop: {ex}")

async def leaderboard_scheduler_loop():
    """Recalculates Bot Leaderboard Ranking snapshot every 12 hours."""
    while True:
        try:
            await asyncio.sleep(43200) # 12 hours
            log_message("SYSTEM", "INFO", "Executing scheduled 12-hour Bot Fleet Leaderboard recalculation...")
            bot_leaderboard.get_or_compute_leaderboard(force_refresh=True)
        except Exception as ex:
            log_message("SYSTEM", "ERROR", f"Error in leaderboard scheduler loop: {ex}")

def cleanup_stale_positions_on_startup():
    """
    Startup cleanup: deletes all open positions in the DB belonging to accounts
    that do not currently have any bot in 'RUNNING' or 'STARTING' status.
    If no bots are running across the hub, all open positions are purged cleanly.
    """
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("SELECT DISTINCT account_id FROM bot_instances WHERE status IN ('RUNNING', 'STARTING') AND account_id IS NOT NULL AND account_id != ''")
        running_account_ids = [str(r['account_id']) for r in c.fetchall()]
        if running_account_ids:
            placeholders = ','.join('?' for _ in running_account_ids)
            c.execute(f"DELETE FROM positions WHERE account_id NOT IN ({placeholders})", running_account_ids)
        else:
            c.execute("DELETE FROM positions")
        deleted_count = c.rowcount if c.rowcount and c.rowcount > 0 else 0
        conn.commit()
        if deleted_count > 0:
            log_message("SYSTEM", "INFO", f"[Startup Cleanup] Removed {deleted_count} stale positions from accounts without active bots. Active accounts: {running_account_ids}")
    except Exception as e:
        log_message("SYSTEM", "WARN", f"[Startup Cleanup] Failed to cleanup stale positions: {e}")
    finally:
        conn.close()

@app.on_event("startup")
async def startup_event():
    # Suppress noisy [WinError 10054] in Windows ProactorEventLoop
    import sys
    if sys.platform == 'win32':
        loop = asyncio.get_running_loop()
        def custom_exc_handler(loop, context):
            exc = context.get('exception')
            if isinstance(exc, ConnectionResetError) and getattr(exc, 'winerror', None) == 10054:
                return  # Silently suppress
            loop.default_exception_handler(context)
        loop.set_exception_handler(custom_exc_handler)
        
    # Print live console HUD banner
    print("""
\033[96m=====================================================================
  🚀 AI GEMINI TRADING HUB - FASTAPI BACKEND LIVE CONSOLE
  🟢 Server running on: http://0.0.0.0:8181
  📡 Real-time log streaming & bot telemetry active
=====================================================================\033[0m
""", flush=True)

    # Automatically self-heal stale/foreign bot PIDs, then purge stale positions
    await asyncio.to_thread(bot_manager.sync_stale_processes)
    cleanup_stale_positions_on_startup()
    asyncio.create_task(sync_active_accounts_telemetry(force=True))
    asyncio.create_task(sync_ctrader_cloud_trade_history(days=30, force=True))

    # Start 24h database maintenance loop & 12h leaderboard scheduler loop
    asyncio.create_task(database_maintenance_loop())
    asyncio.create_task(leaderboard_scheduler_loop())
    
    # Send Telegram Startup Alert
    try:
        asyncio.create_task(send_telegram_server_notification(
            "🚀 <b>Trading Agent Hub Online</b>\n"
            f"📅 Time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            "🟢 Status: FastAPI Engine Ready & Connected"
        ))
    except Exception:
        pass

def format_position_management_prompt(data: MarketSnapshot) -> str:
    """
    Constructs a specialized prompt for active position management, risk evaluation, and SL/TP adjustment.
    """
    pos_lines = []
    if data.position:
        dur_str = f"{data.position.duration_minutes:.1f}" if data.position.duration_minutes else "0"
        pos_lines.append(f"- Primary Position: {data.position.type} {data.position.volume} lots @ Entry={data.position.entry_price} | CurrentPrice={data.position.current_price} | PnL=${data.position.pnl:,.2f} | Current SL={data.position.sl} | Current TP={data.position.tp} | Duration={dur_str} mins")
    if data.active_positions and len(data.active_positions) > 0:
        for p in data.active_positions:
            pos_lines.append(f"- Position ID {p.id}: {p.trade_type} {p.volume} lots @ Entry={p.entry_price} | SL={p.sl} | TP={p.tp} | Opened={p.entry_time}")
    
    pos_summary = "\n".join(pos_lines) if pos_lines else "No detailed position breakdown."

    # Format the recent 35 OHLCV bars in chronological order
    bars_summary = "None"
    if data.bars and len(data.bars) > 0:
        recent_bars = list(reversed(data.bars[:35]))
        bars_lines = []
        for i, b in enumerate(recent_bars):
            bars_lines.append(f"Bar[-{len(recent_bars)-1-i}]: O={b.open:.2f}, H={b.high:.2f}, L={b.low:.2f}, C={b.close:.2f}, V={b.volume:.0f}")
        bars_summary = "\n".join(bars_lines)

    mtf_summary = "Current Timeframe Only"
    if data.multi_timeframe:
        cur = data.multi_timeframe.current_tf
        h1 = data.multi_timeframe.h1_tf
        h4 = data.multi_timeframe.h4_tf
        lines = []
        for tf_ctx, label in [(cur, f"Current ({cur.timeframe if cur else 'M15'})"), (h1, "Higher TF (H1)"), (h4, "Major TF (H4)")]:
            if tf_ctx:
                sw_str = ""
                if tf_ctx.swing_structure:
                    sw = tf_ctx.swing_structure
                    sw_str = f" | Swings: High={sw.last_swing_high} ({sw.swing_high_type}), Low={sw.last_swing_low} ({sw.swing_low_type}), PrevH={sw.prev_swing_high}, PrevL={sw.prev_swing_low} [Struct: {sw.market_structure}]"
                lines.append(f"- {label}: Bias={tf_ctx.trend_bias} | FastMA={tf_ctx.fast_tema} | SlowMA={tf_ctx.slow_tema} | RSI={tf_ctx.rsi}{sw_str}")
        if lines: mtf_summary = "\n".join(lines)

    pip_size = data.pip_size if (data.pip_size and data.pip_size > 0) else (0.01 if ("JPY" in data.symbol or "XAU" in data.symbol or "GOLD" in data.symbol) else 0.0001)
    spread_pips = data.spread_pips if (data.spread_pips is not None and data.spread_pips > 0) else (round(abs(data.ask - data.bid) / pip_size, 1) if pip_size > 0 else 1.0)
    atr_val = data.strategy.atr if data.strategy else (pip_size * 30)
    atr_pips = round(atr_val / pip_size) if (atr_val and pip_size > 0) else round(spread_pips * 15)
    min_sl_floor = max(round(spread_pips * 10.0), round(atr_pips * 0.8), 5)

    prompt = f"""You are a World-Class Institutional Forex Specialist & Quantitative Risk Manager using SMART MONEY CONCEPTS (SMC) & Price Action.

=== ACTIVE POSITION MANAGEMENT MODE ===
The cBot currently HAS OPEN POSITIONS in the order book. Your PRIMARY MISSION is to EVALUATE AND MANAGE THESE EXISTING POSITIONS (Protect capital, lock in profits, adjust SL/TP, or exit safely).

=== 1. ACTIVE ORDER BOOK SNAPSHOT ===
- Symbol: {data.symbol} | Timeframe: {data.timeframe}
- Current Market Prices: Ask={data.ask}, Bid={data.bid} | Spread: {spread_pips:.1f} pips (1 pip = {pip_size})
- Account Balance: ${data.account_balance:,.2f} | Equity: ${data.account_equity:,.2f}
- Running Positions:
{pos_summary}

=== 2. MULTI-TIMEFRAME SMC SWING STRUCTURE & TREND BIAS (M15 + H1 + H4) ===
{mtf_summary}

=== 3. TECHNICAL INDICATORS & SWINGS ===
- TEMA Fast: {data.strategy.tema1} | TEMA Slow: {data.strategy.tema2}
- RSI (14): {data.strategy.rsi:.1f} | ADX: {data.strategy.adx:.1f}
- ATR (14 Volatility): {atr_val:.2f} ({atr_pips:.0f} pips)
- Major 35-Bar Swing High (Resistance / BSL): {data.strategy.recent_high}
- Major 35-Bar Swing Low (Support / SSL): {data.strategy.recent_low}

=== 4. RECENT OHLCV CANDLE SEQUENCE (Last 35 bars, chronological) ===
{bars_summary}

=== 5. POSITION MANAGEMENT & SMC SWING (HH/HL/LH/LL) RULES ===
1. **Trend & Structure Health Assessment**:
   - Bullish Trend: Confirming Higher Highs (HH) and Higher Lows (HL).
   - Bearish Trend: Confirming Lower Highs (LH) and Lower Lows (LL).
   - Watch out for Change of Character (CHoCH) - break below recent HL for BUY or break above recent LH for SELL.
2. **Structural Stop Loss & Trailing Rules (HL / LH Invalidation + ATR Buffer)**:
   - When trailing or modifying Stop Loss:
     * For BUY: Trail SL safely behind the most recent **HL (Higher Low)** or Order Block Low minus (0.5 * ATR buffer).
     * For SELL: Trail SL safely behind the most recent **LH (Lower High)** or Order Block High plus (0.5 * ATR buffer).
   - Always leave at least 0.5 - 1.0 * ATR(14) ({int(atr_pips * 0.5)} - {atr_pips} pips) beyond the swing structure to avoid stop hunting.
3. **Action Decisions**:
   - `HOLD`: Position is healthy and progressing towards TP. No structural reason to alter SL/TP.
   - `ADJUST`: Modify Stop Loss or Take Profit.
     * Break-Even: Move SL to Entry price when trade is in solid profit (>= 1:1 RR) to eliminate risk.
     * Trailing / Lock Profit: Trail SL behind validated HL/LH with ATR buffer.
     * Extend TP: Adjust TP if higher-timeframe liquidity pool is within reach.
     * Specify `new_sl_price` and/or `new_tp_price` (exact price level) OR `sl_pips` / `tp_pips`.
     * ⚠️ Price Geometric Boundaries: For BUY, new_tp_price must be > current price and new_sl_price < current price. For SELL, new_tp_price must be < current price and new_sl_price > current price. If target TP or SL is already crossed, choose `CLOSE_ALL` to close immediately at market!
   - `CLOSE_ALL`: Emergency exit or Target Reached! Market printed a severe reversal signal (CHoCH against trade, strong rejection from major supply/demand zone), or price has reached its ultimate target. Close immediately to secure profit or prevent deeper losses.
   - `BUY` / `SELL`: Scale-in (add position) ONLY if trend is extremely strong with fresh unmitigated Order Block confirmation and account risk permits.

=== 6. REQUIRED JSON OUTPUT FORMAT ===
NOTE: Volume authority belongs 100% to cBot Risk Management Engine. Output "volume_lots": 0.01 (cBot computes actual lots from your SL pips and account risk %).
Reply ONLY with a pure valid JSON object (no markdown, no ```json).
{{
  "action": "ADJUST" | "HOLD" | "CLOSE_ALL" | "BUY" | "SELL",
  "volume_lots": 0.01,
  "sl_pips": {max(min_sl_floor, atr_pips)},
  "tp_pips": {int(max(min_sl_floor, atr_pips) * 2.5)},
  "new_sl_price": 2655.20,
  "new_tp_price": 2680.00,
  "reason": "Clear explanation evaluating open position health, whether SL should be moved to Break-Even/Trailing level with ATR buffer, or why holding/closing is required.",
  "confidence": 90.0
}}"""
    return prompt

def format_new_entry_prompt(data: MarketSnapshot) -> str:
    """
    Constructs a specialized prompt for discovering new high-probability SMC entry setups with HH/HL/LH/LL swing structure and ATR constraints.
    """
    # Format the recent 35 OHLCV bars in chronological order
    bars_summary = "None"
    if data.bars and len(data.bars) > 0:
        recent_bars = list(reversed(data.bars[:35]))
        bars_lines = []
        for i, b in enumerate(recent_bars):
            bars_lines.append(f"Bar[-{len(recent_bars)-1-i}]: O={b.open:.2f}, H={b.high:.2f}, L={b.low:.2f}, C={b.close:.2f}, V={b.volume:.0f}")
        bars_summary = "\n".join(bars_lines)

    mtf_summary = "Current Timeframe Only"
    if data.multi_timeframe:
        cur = data.multi_timeframe.current_tf
        h1 = data.multi_timeframe.h1_tf
        h4 = data.multi_timeframe.h4_tf
        lines = []
        for tf_ctx, label in [(cur, f"Current ({cur.timeframe if cur else 'M15'})"), (h1, "Higher TF (H1)"), (h4, "Major TF (H4)")]:
            if tf_ctx:
                sw_str = ""
                if tf_ctx.swing_structure:
                    sw = tf_ctx.swing_structure
                    sw_str = f" | Swings: High={sw.last_swing_high} ({sw.swing_high_type}), Low={sw.last_swing_low} ({sw.swing_low_type}), PrevH={sw.prev_swing_high}, PrevL={sw.prev_swing_low} [Struct: {sw.market_structure}]"
                lines.append(f"- {label}: Bias={tf_ctx.trend_bias} | FastMA={tf_ctx.fast_tema} | SlowMA={tf_ctx.slow_tema} | RSI={tf_ctx.rsi}{sw_str}")
        if lines: mtf_summary = "\n".join(lines)

    pip_size = data.pip_size if (data.pip_size and data.pip_size > 0) else (0.01 if ("JPY" in data.symbol or "XAU" in data.symbol or "GOLD" in data.symbol) else 0.0001)
    spread_pips = data.spread_pips if (data.spread_pips is not None and data.spread_pips > 0) else (round(abs(data.ask - data.bid) / pip_size, 1) if pip_size > 0 else 1.0)
    atr_val = data.strategy.atr if data.strategy else (pip_size * 30)
    atr_pips = round(atr_val / pip_size) if (atr_val and pip_size > 0) else round(spread_pips * 15)
    min_sl_floor = max(round(spread_pips * 10.0), round(atr_pips * 0.8), 5)

    kz_str = getattr(data.strategy, 'killzone_session', None) if data.strategy else None
    kz_line = f"\n- Killzone / Session: {kz_str}" if kz_str else ""
    asian_h = getattr(data.strategy, 'asian_high', None) if data.strategy else None
    asian_l = getattr(data.strategy, 'asian_low', None) if data.strategy else None
    asian_r = getattr(data.strategy, 'asian_range_pips', None) if data.strategy else None
    asian_d1 = getattr(data.strategy, 'asian_range_daily_atr_percent', None) if data.strategy else None
    d1_ratio_str = f" | {asian_d1:.1f}% Daily ATR" if (asian_d1 is not None and asian_d1 > 0) else ""
    asian_line = f"\n- Asian Session Range: High={asian_h}, Low={asian_l} ({asian_r:.1f} pips{d1_ratio_str})" if (asian_h and asian_l) else ""

    prompt = f"""You are a World-Class Institutional Forex Specialist & Quantitative Trader using SMART MONEY CONCEPTS (SMC) & Price Action.

=== NEW ENTRY DISCOVERY MODE ===
The cBot currently HAS NO OPEN POSITIONS (Flat / Clean Order Book). Your PRIMARY MISSION is to ANALYZE MARKET STRUCTURE AND DISCOVER OPTIMAL, HIGH-PROBABILITY ENTRY OPPORTUNITIES.

=== 1. MARKET SNAPSHOT ===
- Symbol: {data.symbol} | Timeframe: {data.timeframe}
- Current Market Prices: Ask={data.ask}, Bid={data.bid} | Spread: {spread_pips:.1f} pips (1 pip = {pip_size})
- Account Balance: ${data.account_balance:,.2f} | Equity: ${data.account_equity:,.2f}

=== 2. MULTI-TIMEFRAME SMC SWING STRUCTURE (HH, HL, LH, LL) & BIAS ===
{mtf_summary}

=== 3. TECHNICAL INDICATORS & SWINGS ===
- TEMA Fast: {data.strategy.tema1} | TEMA Slow: {data.strategy.tema2}
- RSI (14): {data.strategy.rsi:.1f} | ADX: {data.strategy.adx:.1f}
- ATR (14 Volatility): {atr_val:.2f} ({atr_pips:.0f} pips)
- Major 35-Bar Swing High (Buy-Side Liquidity BSL / Resistance): {data.strategy.recent_high}
- Major 35-Bar Swing Low (Sell-Side Liquidity SSL / Support): {data.strategy.recent_low}{kz_line}{asian_line}

=== 4. RECENT OHLCV CANDLE SEQUENCE (Last 35 bars, chronological) ===
{bars_summary}

=== 5. SMART MONEY CONCEPTS (SMC) & SWING STRUCTURE (HH/HL/LH/LL) ENTRY RULES ===
1. **Market Structure Alignment (HH/HL vs LH/LL)**:
   - **Bullish Trend (HH + HL)**: Price prints consecutive Higher Highs and Higher Lows. Look for BUY on retracement into Bullish OB or HL support.
   - **Bearish Trend (LH + LL)**: Price prints consecutive Lower Highs and Lower Lows. Look for SELL on retracement into Bearish OB or LH resistance.
   - **Liquidity Sweeps & CHoCH**: Sweep of key swing level followed by strong rejection candle.
2. **MANDATORY Swing-Based Stop Loss (HL/LH Invalidation + ATR Buffer)**:
   - Under NO circumstances place an arbitrary tight SL. Place SL strictly at the structural invalidation point:
     * For BUY: `SL Price = Recent HL (Higher Low) or OB Low - (0.5 * ATR)` -> Minimum SL distance must be >= {min_sl_floor} pips (10x Spread / 0.8x ATR).
     * For SELL: `SL Price = Recent LH (Lower High) or OB High + (0.5 * ATR)` -> Minimum SL distance must be >= {min_sl_floor} pips (10x Spread / 0.8x ATR).
3. **Structural Take Profit (HH/LL Target Liquidity)**:
   - For BUY: Target the recent **HH (Higher High)** or opposing liquidity pool above previous swing high.
   - For SELL: Target the recent **LL (Lower Low)** or opposing liquidity pool below previous swing low.
   - Projection must be >= 1.5 * ATR ({int(atr_pips*1.5)} pips). Do not force arbitrary R:R ratios; reflect authentic market liquidity targets.
4. **Exact Price & Pips**:
   - Provide BOTH `new_sl_price` / `new_tp_price` (exact chart price) AND `sl_pips` / `tp_pips` (1 pip = {pip_size} in price).

=== 6. VALID ACTIONS ===
- `BUY`: Validated Bullish Order Block bounce, CHoCH to upside, or SSL liquidity sweep reversal.
- `SELL`: Validated Bearish Order Block rejection, CHoCH to downside, or BSL liquidity sweep reversal.
- `HOLD`: Choppy consolidation, equilibrium, or lack of clear SMC confirmation. Wait patiently outside the market.

=== 7. REQUIRED JSON OUTPUT FORMAT ===
NOTE: Volume authority belongs 100% to cBot Risk Management Engine. Output "volume_lots": 0.01 (cBot computes actual lots from your SL pips and account risk %).
Reply ONLY with a pure valid JSON object (no markdown, no ```json).
{{
  "action": "BUY" | "SELL" | "HOLD",
  "volume_lots": 0.01,
  "sl_pips": {max(min_sl_floor, atr_pips)},
  "tp_pips": {int(max(min_sl_floor, atr_pips) * 2.5)},
  "new_sl_price": 4364.16,
  "new_tp_price": 4395.00,
  "reason": "SMC analysis detailing Order Block/Sweep, ATR-buffered SL placement behind structural invalidation, and TP target.",
  "confidence": 88.5
}}"""
    return prompt

def format_prompt(data: MarketSnapshot) -> str:
    """
    Adaptive prompt dispatcher: checks order book positions to select Position Management vs New Entry mode.
    """
    symbol_positions = [p for p in (data.active_positions or []) if p.symbol == data.symbol]
    has_active_positions = (data.position is not None) or len(symbol_positions) > 0
    if has_active_positions:
        log_message(data.bot_id, "INFO", f"[{data.symbol}] Active position detected ({len(symbol_positions)} open). Selecting POSITION MANAGEMENT mode.")
        return format_position_management_prompt(data)
    else:
        log_message(data.bot_id, "INFO", f"[{data.symbol}] Clean Order Book (0 open positions). Selecting NEW ENTRY DISCOVERY mode.")
        return format_new_entry_prompt(data)

@app.post("/trade", response_model=AgentDecision)
async def trade_endpoint(data: MarketSnapshot):
    try:
        log_message(data.bot_id, "INFO", f"Received market snapshot from {data.symbol} ({data.timeframe}) | Ask: {data.ask} | Bid: {data.bid} | Open Orders for {data.symbol}: {len([p for p in (data.active_positions or []) if p.symbol == data.symbol])} | Eq: ${data.account_equity:,.2f}")

        # Register/Update account info and positions in database from the snapshot (non-blocking)
        try:
            conn = get_db()
            c = conn.cursor()
            c.execute('''
                INSERT INTO accounts (account_id, account_type, account_label, balance, equity, last_updated)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_id) DO UPDATE SET
                    balance=excluded.balance,
                    equity=excluded.equity,
                    last_updated=excluded.last_updated
            ''', (data.account_number, data.account_type, data.account_label, data.account_balance, data.account_equity, datetime.datetime.now().isoformat()))
            
            # Hybrid Sync: Ensure database matches active_positions for this specific bot and symbol
            c.execute('SELECT id, ctrader_id FROM positions WHERE account_id = ? AND bot_id = ? AND symbol = ?', (data.account_number, data.bot_id, data.symbol))
            db_positions = c.fetchall()
            db_ctrader_ids = {r["ctrader_id"]: r["id"] for r in db_positions if r["ctrader_id"]}
            
            active_ctrader_ids = [pos.id for pos in data.active_positions]
            
            # 1. Close positions that are no longer active for THIS bot & symbol
            for ctrader_id, db_id in db_ctrader_ids.items():
                if ctrader_id not in active_ctrader_ids:
                    # Find it in recent history to get exit data
                    hist = next((h for h in data.recent_history if h.position_id == ctrader_id), None)
                    if hist:
                        # Move to history
                        c.execute('''
                            INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, entry_time, exit_time, reason)
                            SELECT ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, ?, ?, entry_time, ?, reason
                            FROM positions WHERE id = ?
                        ''', (hist.exit_price, hist.pnl, hist.exit_time, db_id))
                        c.execute('DELETE FROM positions WHERE id = ?', (db_id,))
                    else:
                        # Fake close if missing from recent history but we know it's closed
                        c.execute('''
                            INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, entry_time, exit_time, reason)
                            SELECT ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, entry_price, 0, entry_time, ?, reason
                            FROM positions WHERE id = ?
                        ''', (datetime.datetime.now().isoformat(), db_id))
                        c.execute('DELETE FROM positions WHERE id = ?', (db_id,))

            # 2. Add or update active positions using UPSERT (ON CONFLICT DO UPDATE)
            current_bid = data.bid if data.bid > 0 else (data.ask if data.ask > 0 else 0)
            current_ask = data.ask if data.ask > 0 else (data.bid if data.bid > 0 else 0)
            
            for pos in data.active_positions:
                is_buy = pos.trade_type.upper() == "BUY"
                cur_price = current_bid if is_buy else current_ask
                if cur_price == 0:
                    cur_price = pos.entry_price

                pip_size = 0.01 if ("JPY" in pos.symbol or "XAU" in pos.symbol or "GOLD" in pos.symbol) else 0.0001
                pnl_pips = round((cur_price - pos.entry_price) / pip_size, 1) if is_buy else round((pos.entry_price - cur_price) / pip_size, 1)
                
                # Dollar multiplier per pip lot (For XAUUSD: 1 lot = 100 oz -> $1 move = 100 pips = $100 -> $1/pip/lot)
                dollar_per_pip_lot = 1.0 if ("XAU" in pos.symbol or "GOLD" in pos.symbol) else 10.0
                pnl_usd = round(pnl_pips * pos.volume * dollar_per_pip_lot, 2)

                # Determine SL/TP price vs pips
                sl_price = None
                tp_price = None
                sl_pips = None
                tp_pips = None

                if pos.sl and pos.sl > 0:
                    if pos.sl > 1000: # Absolute price
                        sl_price = pos.sl
                        sl_pips = round(abs(pos.entry_price - pos.sl) / pip_size, 1)
                    else: # Pips distance
                        sl_pips = pos.sl
                        sl_price = round(pos.entry_price - (pos.sl * pip_size), 2) if is_buy else round(pos.entry_price + (pos.sl * pip_size), 2)

                if pos.tp and pos.tp > 0:
                    if pos.tp > 1000: # Absolute price
                        tp_price = pos.tp
                        tp_pips = round(abs(pos.entry_price - pos.tp) / pip_size, 1)
                    else: # Pips distance
                        tp_pips = pos.tp
                        tp_price = round(pos.entry_price + (pos.tp * pip_size), 2) if is_buy else round(pos.entry_price - (pos.tp * pip_size), 2)

                c.execute('''
                    INSERT INTO positions (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, current_price, pnl, pnl_pips, sl_price, tp_price, sl_pips, tp_pips, entry_time, reason)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(account_id, ctrader_id) DO UPDATE SET
                        bot_id = excluded.bot_id,
                        symbol = excluded.symbol,
                        side = excluded.side,
                        volume = excluded.volume,
                        entry_price = excluded.entry_price,
                        current_price = excluded.current_price,
                        pnl = excluded.pnl,
                        pnl_pips = excluded.pnl_pips,
                        sl_price = COALESCE(excluded.sl_price, positions.sl_price),
                        tp_price = COALESCE(excluded.tp_price, positions.tp_price),
                        sl_pips = COALESCE(excluded.sl_pips, positions.sl_pips),
                        tp_pips = COALESCE(excluded.tp_pips, positions.tp_pips)
                ''', (pos.id, data.account_number, data.bot_id, pos.symbol, pos.trade_type, pos.volume, pos.entry_price, cur_price, pnl_usd, pnl_pips, sl_price, tp_price, sl_pips, tp_pips, pos.entry_time, "Strategy or AI entry"))

            if data.position:
                p = data.position
                c.execute('''
                    UPDATE positions SET current_price = ?, pnl = ?
                    WHERE ctrader_id = ? AND account_id = ?
                ''', (p.current_price, p.pnl, p.id, data.account_number))

            # Also update any other positions of the same symbol with current market price
            if current_bid > 0 and current_ask > 0:
                c.execute("SELECT id, side, entry_price, volume, symbol FROM positions WHERE symbol = ?", (data.symbol,))
                other_positions = c.fetchall()
                for other_p in other_positions:
                    is_b = (other_p["side"].upper() == "BUY")
                    c_price = current_bid if is_b else current_ask
                    p_size = 0.01 if ("JPY" in other_p["symbol"] or "XAU" in other_p["symbol"] or "GOLD" in other_p["symbol"]) else 0.0001
                    p_pips = round((c_price - other_p["entry_price"]) / p_size, 1) if is_b else round((other_p["entry_price"] - c_price) / p_size, 1)
                    mult = 1.0 if ("XAU" in other_p["symbol"] or "GOLD" in other_p["symbol"]) else 10.0
                    p_usd = round(p_pips * other_p["volume"] * mult, 2)
                    c.execute("UPDATE positions SET current_price = ?, pnl = ?, pnl_pips = ? WHERE id = ?", (c_price, p_usd, p_pips, other_p["id"]))
            conn.commit()
            conn.close()
        except Exception as db_err:
            log_message(data.bot_id, "WARN", f"Non-blocking database sync warning: {db_err}")

        # Check active positions for this bot/symbol
        symbol_positions = [p for p in (data.active_positions or []) if p.symbol == data.symbol]
        has_active_positions = (data.position is not None) or len(symbol_positions) > 0

        # Hard Session Guard: Outside Golden Killzones (Asian session accumulation / gap)
        # When order book is clean (no active positions), immediately return HOLD without querying LLM.
        kz = getattr(data.strategy, 'killzone_session', None) if data.strategy else None
        bias = getattr(data.strategy, 'bias_direction', None) if data.strategy else None
        is_judas = "judas" in (data.bot_id or "").lower() or (kz is not None)

        if is_judas and not has_active_positions:
            if kz == "Outside Killzones" or bias in ("MANAGE_ONLY", "NONE", ""):
                is_outside = (kz == "Outside Killzones") or (not kz)
                if is_outside:
                    reason_msg = f"Outside Golden Killzones ({kz or 'Asian Accumulation / Gap'}). Clean order book - new entries strictly prohibited."
                    log_msg = f"[{data.symbol}] Outside Golden Killzones (Session: '{kz}', Bias: '{bias}') with clean order book. Auto-returning HOLD (New entries strictly prohibited during Asian accumulation / gap)."
                else:
                    reason_msg = f"Inside Golden Killzone ({kz}): Waiting for Judas Sweep trigger (Bias: '{bias or 'NONE'}'). Clean order book - HOLD."
                    log_msg = f"[{data.symbol}] Inside Golden Killzone ({kz}) with no Judas Sweep trigger (Bias: '{bias}') and clean order book. Auto-returning HOLD."

                log_message(data.bot_id, "INFO", log_msg)
                return AgentDecision(
                    request_id=data.request_id,
                    bot_id=data.bot_id,
                    symbol=data.symbol,
                    timeframe=data.timeframe,
                    action="HOLD",
                    volume_lots=0.01,
                    sl_pips=0.0,
                    tp_pips=0.0,
                    new_sl_price=0.0,
                    new_tp_price=0.0,
                    reason=reason_msg,
                    confidence=100.0
                )

        prompt_text = format_prompt(data)
        
        # Read active AI Provider Configuration from database
        conn = get_db()
        c = conn.cursor()
        c.execute("SELECT * FROM ai_providers_config WHERE id = 1")
        cfg_row = c.fetchone()
        conn.close()
        ai_config = dict(cfg_row) if cfg_row else {"active_provider": "qwen_api"}
        provider_name = ai_config.get("active_provider", "qwen_api")

        log_message(data.bot_id, "INFO", f"Transmitting technical prompt to AI Provider [{provider_name.upper()}] for {data.symbol}...")
        
        decision_dict, raw_response, latency_ms = await ai_engine.dispatch_ai_trade(ai_config, prompt_text=prompt_text)

        decision = AgentDecision(**decision_dict)
        
        # Check if decision was a fallback error (confidence 0 or parsing error)
        global ai_consecutive_errors
        if decision.confidence == 0.0 and "error" in decision.reason.lower():
            ai_consecutive_errors += 1
            log_message(data.bot_id, "WARN", f"AI Agent returned error fallback ({ai_consecutive_errors}/{MAX_CONSECUTIVE_AI_ERRORS}): {decision.reason}")
        else:
            ai_consecutive_errors = 0

        # Enforce metadata correlation back to the requesting bot instance
        decision.request_id = data.request_id
        decision.bot_id = data.bot_id
        decision.symbol = data.symbol
        decision.timeframe = data.timeframe

        # Format SL and TP with actual price and pips in parentheses
        pip_size = data.pip_size if (data.pip_size and data.pip_size > 0) else (0.01 if ("JPY" in data.symbol or "XAU" in data.symbol or "GOLD" in data.symbol) else 0.0001)
        digits = data.digits if data.digits is not None else (2 if ("XAU" in data.symbol or "GOLD" in data.symbol) else (3 if "JPY" in data.symbol else 5))
        
        is_buy = decision.action.upper() == "BUY"
        is_sell = decision.action.upper() == "SELL"

        # Check active position direction if in ADJUST mode
        active_pos = data.position or (data.active_positions[0] if (data.active_positions and len(data.active_positions) > 0) else None)
        if decision.action.upper() == "ADJUST" and active_pos:
            pos_type_str = getattr(active_pos, 'type', None) or getattr(active_pos, 'trade_type', None) or "BUY"
            if str(pos_type_str).upper() == "SELL":
                is_sell = True
                is_buy = False
            else:
                is_buy = True
                is_sell = False

        sl_val = decision.new_sl_price if (decision.new_sl_price and decision.new_sl_price > 0) else None
        if sl_val is None and decision.sl_pips and decision.sl_pips > 0:
            if is_sell:
                sl_val = round(data.ask + decision.sl_pips * pip_size, digits)
            else:
                sl_val = round(data.bid - decision.sl_pips * pip_size, digits)

        tp_val = decision.new_tp_price if (decision.new_tp_price and decision.new_tp_price > 0) else None
        if tp_val is None and decision.tp_pips and decision.tp_pips > 0:
            if is_sell:
                tp_val = round(data.bid - decision.tp_pips * pip_size, digits)
            else:
                tp_val = round(data.ask + decision.tp_pips * pip_size, digits)

        if sl_val is not None and (decision.new_sl_price is None or decision.new_sl_price <= 0):
            decision.new_sl_price = sl_val
        if tp_val is not None and (decision.new_tp_price is None or decision.new_tp_price <= 0):
            decision.new_tp_price = tp_val

        sl_str = f"{sl_val:.{digits}f} ({decision.sl_pips:.0f} pips)" if sl_val else (f"{decision.sl_pips:.0f} pips" if decision.sl_pips else "None")
        tp_str = f"{tp_val:.{digits}f} ({decision.tp_pips:.0f} pips)" if tp_val else (f"{decision.tp_pips:.0f} pips" if decision.tp_pips else "None")

        log_message(data.bot_id, "AI_REASONING", f"[{provider_name.upper()}] ({latency_ms}ms) [{data.symbol} {data.timeframe}] Decision: {decision.action} ({decision.confidence}%) => {decision.reason}")
        log_message(data.bot_id, "INFO", f"Agent Action: {decision.action} | Symbol: {data.symbol} | Lots: {decision.volume_lots} | SL: {sl_str} | TP: {tp_str}")
        
        return decision
        
    except Exception as e:
        ai_consecutive_errors += 1
        log_message(data.bot_id, "ERROR", f"Error in /trade endpoint ({ai_consecutive_errors}/{MAX_CONSECUTIVE_AI_ERRORS}): {str(e)}")

        # Return HOLD safely if it fails with full correlation metadata
        return AgentDecision(
            request_id=data.request_id,
            bot_id=data.bot_id,
            symbol=data.symbol,
            timeframe=data.timeframe,
            action="HOLD",
            volume_lots=0,
            sl_pips=0,
            tp_pips=0,
            reason=f"AI Agent Dispatch Fallback: {e}",
            confidence=0
        )

@app.post("/api/agent/restart")
async def api_restart_agent(request: Request):
    """Manual endpoint to restart the AI Agent browser and session."""
    require_admin(request)
    asyncio.create_task(restart_ai_agent())
    return {"status": "success", "message": "AI Agent restart initiated"}

class PortfolioReport(BaseModel):
    ctrader_id: Optional[int] = None
    bot_id: str
    action: str  # "open" or "close"
    symbol: str
    side: Optional[str] = "BUY"
    volume: Optional[float] = 0.01
    entry_price: Optional[float] = 0.0
    exit_price: Optional[float] = None
    pnl: Optional[float] = None
    pips: Optional[float] = None
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None
    sl_pips: Optional[float] = None
    tp_pips: Optional[float] = None
    reason: Optional[str] = None
    account_number: Optional[str] = "Demo_Default"
    account_type: Optional[str] = "Demo"
    account_label: Optional[str] = ""
    account_balance: Optional[float] = 0.0
    account_equity: Optional[float] = 0.0

@app.post("/portfolio/report")
async def portfolio_report(data: PortfolioReport):
    conn = None
    log_msg = ""
    try:
        conn = get_db()
        c = conn.cursor()
        
        # Update account info
        c.execute('''
            INSERT INTO accounts (account_id, account_type, account_label, balance, equity, last_updated)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
                balance=excluded.balance,
                equity=excluded.equity,
                last_updated=excluded.last_updated
        ''', (data.account_number, data.account_type, data.account_label, data.account_balance, data.account_equity, datetime.datetime.now().isoformat()))
        
        now = datetime.datetime.now().isoformat()
        if data.action == "open":
            # Sanity check: prevent corrupted cross-symbol prices (e.g. Gold at $1.35 or JPY at $1.35)
            sym_upper = (data.symbol or "").upper()
            if ("XAU" in sym_upper or "GOLD" in sym_upper) and data.entry_price < 500:
                log_message(data.bot_id, "WARN", f"Ignored anomalous position report for {data.symbol}: Entry price {data.entry_price} is invalid for Gold.")
                return {"status": "ignored", "reason": "Invalid entry price for Gold"}

            if ("JPY" in sym_upper) and data.entry_price < 50:
                log_message(data.bot_id, "WARN", f"Ignored anomalous position report for {data.symbol}: Entry price {data.entry_price} is invalid for JPY pair.")
                return {"status": "ignored", "reason": "Invalid entry price for JPY pair"}

            c.execute('''
                INSERT INTO positions (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, sl_price, tp_price, sl_pips, tp_pips, reason, entry_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_id, ctrader_id) DO UPDATE SET
                    bot_id = excluded.bot_id,
                    symbol = excluded.symbol,
                    side = excluded.side,
                    volume = excluded.volume,
                    entry_price = excluded.entry_price,
                    sl_price = excluded.sl_price,
                    tp_price = excluded.tp_price,
                    sl_pips = excluded.sl_pips,
                    tp_pips = excluded.tp_pips,
                    reason = excluded.reason
            ''', (data.ctrader_id, data.account_number, data.bot_id, data.symbol, data.side, data.volume, data.entry_price, data.sl_price, data.tp_price, data.sl_pips, data.tp_pips, data.reason, now))
            
            pip_size = 0.01 if ("JPY" in data.symbol or "XAU" in data.symbol or "GOLD" in data.symbol) else 0.0001
            digits = 2 if ("XAU" in data.symbol or "GOLD" in data.symbol) else (3 if "JPY" in data.symbol else 5)
            is_buy = (data.side or "").upper() == "BUY"

            sl_val = data.sl_price
            if sl_val is None and data.sl_pips and data.sl_pips > 0:
                sl_val = round(data.entry_price - data.sl_pips * pip_size, digits) if is_buy else round(data.entry_price + data.sl_pips * pip_size, digits)
            if sl_val is not None and sl_val <= 0:
                sl_val = None
            sl_display = f"{sl_val:.{digits}f} ({data.sl_pips:.0f} pips)" if sl_val else (f"{data.sl_pips} pips" if data.sl_pips else "None")

            tp_val = data.tp_price
            if tp_val is None and data.tp_pips and data.tp_pips > 0:
                tp_val = round(data.entry_price + data.tp_pips * pip_size, digits) if is_buy else round(data.entry_price - data.tp_pips * pip_size, digits)
            if tp_val is not None and tp_val <= 0:
                tp_val = None
            tp_display = f"{tp_val:.{digits}f} ({data.tp_pips:.0f} pips)" if tp_val else (f"{data.tp_pips} pips" if data.tp_pips else "None")

            log_msg = f"Opened {data.side} on {data.symbol} - Vol: {data.volume} @ Entry: {data.entry_price:.{digits}f} | SL: {sl_display} | TP: {tp_display}"
        elif data.action == "close":
            # Find corresponding open position to get entry time, price, side, and original reason
            pos = None
            if data.ctrader_id:
                c.execute('''
                    SELECT * FROM positions 
                    WHERE account_id=? AND bot_id=? AND ctrader_id=? 
                    ORDER BY id DESC LIMIT 1
                ''', (data.account_number, data.bot_id, data.ctrader_id))
                pos = c.fetchone()
            
            if not pos:
                c.execute('''
                    SELECT * FROM positions 
                    WHERE account_id=? AND bot_id=? AND symbol=? 
                    ORDER BY id DESC LIMIT 1
                ''', (data.account_number, data.bot_id, data.symbol))
                pos = c.fetchone()

            close_reason = data.reason.strip() if (data.reason and data.reason.strip()) else ((pos['reason'] if pos and pos['reason'] else "Closed"))
            pos_side = data.side if (data.side and data.side.strip() and data.side != "UNKNOWN") else (pos['side'] if pos else "UNKNOWN")
            pos_vol = data.volume if (data.volume and data.volume > 0) else (pos['volume'] if pos else 0.0)
            entry_p = pos['entry_price'] if (pos and pos['entry_price'] and pos['entry_price'] > 0) else (data.entry_price or 0.0)
            exit_p = data.exit_price if (data.exit_price and data.exit_price > 0) else entry_p
            pnl_pips_val = data.pips if data.pips is not None else (pos['pnl_pips'] if pos and 'pnl_pips' in pos.keys() else None)

            if pos:
                c.execute('''
                    INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (pos['ctrader_id'], data.account_number, data.bot_id, data.symbol, pos_side, pos_vol, entry_p, exit_p, data.pnl, pnl_pips_val, close_reason, pos['entry_time'], now))
                c.execute('DELETE FROM positions WHERE id=?', (pos['id'],))
            else:
                # Fallback if position wasn't tracked
                c.execute('''
                    INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (data.ctrader_id, data.account_number, data.bot_id, data.symbol, pos_side, pos_vol, entry_p, exit_p, data.pnl, pnl_pips_val, close_reason, now, now))
                
            pips_str = f" ({pnl_pips_val:+.1f} pips)" if pnl_pips_val is not None else ""
            log_msg = f"Closed position on {data.symbol} | PnL: {data.pnl}{pips_str} | Reason: {close_reason}"
            
        conn.commit()
    except Exception as e:
        log_message(data.bot_id, "ERROR", f"Failed to record portfolio report: {str(e)}")
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass
        
    if log_msg:
        log_message(data.bot_id, "INFO", log_msg)
        
        # Send Telegram notification
        try:
            account_info = f"• Tài khoản: <code>{data.account_number}</code>" + (f" ({data.account_label})" if data.account_label else "") + "\n" if data.account_number else ""
            if data.action == "open":
                side_str = (data.side or "").upper()
                side_emoji = "🟢 BUY" if side_str == "BUY" else "🔴 SELL"
                digits = 2 if ("XAU" in data.symbol or "GOLD" in data.symbol) else (3 if "JPY" in data.symbol else 5)
                msg = (
                    f"🚀 <b>[Trading Agent Hub] Position Opened</b>\n"
                    f"{account_info}"
                    f"• Bot: <code>{data.bot_id}</code>\n"
                    f"• Symbol: <b>{data.symbol}</b> ({side_emoji})\n"
                    f"• Khối lượng: <b>{data.volume} lots</b> @ Entry: <code>{data.entry_price:.{digits}f}</code>\n"
                    f"• Stop Loss: <b>{sl_display}</b> | Take Profit: <b>{tp_display}</b>\n"
                    f"• Lý do: <i>{data.reason or 'AI Strategy Entry'}</i>"
                )
                asyncio.create_task(send_telegram_server_notification(msg))
            elif data.action == "close":
                pnl_val = data.pnl if data.pnl is not None else 0.0
                pnl_emoji = "🟢 +" if pnl_val >= 0 else "🔴 "
                digits = 2 if ("XAU" in data.symbol or "GOLD" in data.symbol) else (3 if "JPY" in data.symbol else 5)
                side_str = (pos_side or "").upper()
                side_display = f" ({'🟢 BUY' if side_str == 'BUY' else ('🔴 SELL' if side_str == 'SELL' else side_str)})" if side_str and side_str != "UNKNOWN" else ""
                vol_str = f"• Khối lượng: <b>{pos_vol:g} lots</b>" if pos_vol > 0 else ""
                
                prices_line = ""
                if entry_p > 0 and exit_p > 0:
                    prices_line = f" | Entry: <code>{entry_p:.{digits}f}</code> ➔ Exit: <code>{exit_p:.{digits}f}</code>\n" if vol_str else f"• Entry: <code>{entry_p:.{digits}f}</code> ➔ Exit: <code>{exit_p:.{digits}f}</code>\n"
                elif vol_str:
                    vol_str += "\n"

                pips_display = f" ({pnl_pips_val:+.1f} pips)" if pnl_pips_val is not None else ""
                reason_clean = close_reason.replace("PositionCloseReason.", "")
                
                msg = (
                    f"🏁 <b>[Trading Agent Hub] Position Closed</b>\n"
                    f"{account_info}"
                    f"• Bot: <code>{data.bot_id}</code>\n"
                    f"• Symbol: <b>{data.symbol}</b>{side_display}\n"
                    f"{vol_str}{prices_line}"
                    f"• Net PnL: <b>{pnl_emoji}${pnl_val:,.2f}</b>{pips_display}\n"
                    f"• Lý do: <b>{reason_clean}</b>\n"
                    f"• Số dư: ${data.account_balance:,.2f} | Equity: ${data.account_equity:,.2f}"
                )
                asyncio.create_task(send_telegram_server_notification(msg))
        except Exception:
            pass
        
    return {"status": "success"}

class TelegramRelayRequest(BaseModel):
    message: str

@app.post("/api/telegram/send")
async def api_send_telegram_relay(data: TelegramRelayRequest):
    """
    Relays a Telegram notification message from cBots to the configured Telegram chat.
    Uses centralized credentials in telegram.env.
    """
    if not data.message or not data.message.strip():
        return {"status": "ignored", "reason": "Empty message"}
    try:
        await send_telegram_server_notification(data.message.strip())
        return {"status": "success"}
    except Exception as ex:
        return {"status": "error", "error": str(ex)}

_cbots_cache = None
_cbots_cache_time = 0.0

def get_cbots_library(force: bool = False):
    global _cbots_cache, _cbots_cache_time
    now = time.time()
    if not force and _cbots_cache is not None and (now - _cbots_cache_time) < 10.0:
        return _cbots_cache

    base_dir = os.path.abspath(os.path.dirname(__file__))
    cbot_dir = os.path.join(base_dir, "cbot")
    cbots = []
    seen_names = set()

    # Search candidates: (1) Workspace Root *.algo packages, (2) Top-level cbot/*.algo
    candidate_paths = []

    # 1. Scan workspace root directly for compiled packages
    if os.path.exists(base_dir):
        for f in os.listdir(base_dir):
            if f.endswith(".algo"):
                candidate_paths.append(os.path.join(base_dir, f))

    # 2. Scan cbot/ folder but ignore bin/ and obj/ subdirectories
    if os.path.exists(cbot_dir):
        for root, dirs, files in os.walk(cbot_dir):
            # Modify dirs in-place to avoid descending into bin and obj build artifacts
            dirs[:] = [d for d in dirs if d.lower() not in ["bin", "obj", "node_modules", ".git", ".vs"]]
            for file in files:
                if file.endswith(".algo"):
                    candidate_paths.append(os.path.join(root, file))

    for full_path in candidate_paths:
        file = os.path.basename(full_path)
        clean_name = os.path.splitext(file)[0]
        norm_key = clean_name.strip().lower()

        if norm_key in seen_names:
            continue
        seen_names.add(norm_key)

        rel_path = os.path.relpath(full_path, base_dir)
        size_bytes = os.path.getsize(full_path)
        mod_time = datetime.datetime.fromtimestamp(os.path.getmtime(full_path)).strftime("%Y-%m-%d %H:%M:%S")

        # Check for corresponding project source folder in cbot/
        source_available = False
        source_folder = os.path.join(cbot_dir, clean_name)
        if os.path.exists(source_folder) and os.path.isdir(source_folder):
            source_available = True

        # Guess symbol and timeframe hints
        symbol_hint = "XAUUSD"
        upper_name = clean_name.upper()
        if "EURUSD" in upper_name:
            symbol_hint = "EURUSD"
        elif "GBPUSD" in upper_name:
            symbol_hint = "GBPUSD"
        elif "USDJPY" in upper_name:
            symbol_hint = "USDJPY"
        elif "BTC" in upper_name:
            symbol_hint = "BTCUSD"
        elif "XAU" in upper_name or "GOLD" in upper_name:
            symbol_hint = "XAUUSD"

        timeframe_hint = "m15"
        for tf in ["m30", "m15", "m5", "h4", "h1", "d1", "m1"]:
            tf_u = tf.upper()
            if f"_{tf}" in upper_name.lower() or f" {tf}" in upper_name.lower() or f"_{tf_u}" in upper_name or f" {tf_u}" in upper_name or upper_name.endswith(f"_{tf_u}") or upper_name.endswith(f" {tf_u}"):
                timeframe_hint = tf
                break

        cbots.append({
            "filename": file,
            "name": clean_name,
            "rel_path": rel_path.replace("\\", "/"),
            "abs_path": full_path,
            "size_bytes": size_bytes,
            "size_formatted": f"{round(size_bytes / 1024, 1)} KB" if size_bytes < 1024*1024 else f"{round(size_bytes / (1024*1024), 2)} MB",
            "modified_at": mod_time,
            "has_source": source_available,
            "symbol_hint": symbol_hint,
            "timeframe_hint": timeframe_hint
        })

    _cbots_cache = sorted(cbots, key=lambda x: x["modified_at"], reverse=True)
    _cbots_cache_time = now
    return _cbots_cache

@app.get("/api/cbots")
async def list_cbots(request: Request):
    get_current_user(request)
    return {"cbots": get_cbots_library(force=True)}

@app.post("/api/cbots/upload")
async def upload_cbot(request: Request, file: UploadFile = File(...)):
    require_admin(request)
    if not file.filename.endswith((".algo", ".cs", ".zip")):
        raise HTTPException(status_code=400, detail="Invalid file type. Only .algo, .cs, or .zip files are allowed.")
    
    cbot_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot"))
    os.makedirs(cbot_dir, exist_ok=True)
    target_path = os.path.join(cbot_dir, file.filename)
    
    content = await file.read()
    with open(target_path, "wb") as f:
        f.write(content)
        
    return {
        "status": "success",
        "filename": file.filename,
        "size_bytes": len(content),
        "message": f"Successfully imported '{file.filename}' into cbot library"
    }

def safe_sync_stopped_bots_db(stopped_bot_ids: list):
    """
    Safely updates stopped bot statuses in SQLite using a separate short-lived connection
    with exception protection to prevent lock contention with read queries.
    """
    if not stopped_bot_ids:
        return
    conn = None
    try:
        conn = get_db()
        c = conn.cursor()
        for b_id in stopped_bot_ids:
            c.execute("UPDATE bot_instances SET status = 'STOPPED', pid = NULL WHERE id = ?", (b_id,))
        conn.commit()
    except Exception:
        pass
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

@app.get("/api/accounts")
async def list_accounts(request: Request):
    get_current_user(request)
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM accounts ORDER BY last_updated DESC")
        rows = c.fetchall()
        return {"accounts": [dict(r) for r in rows]}
    finally:
        conn.close()

@app.get("/api/accounts/profiles")
async def get_account_profiles(request: Request):
    get_current_user(request)
    from account_config import get_all_profiles, sanitize_profiles_for_api
    return {"profiles": sanitize_profiles_for_api(get_all_profiles())}

@app.post("/api/accounts/reload")
async def reload_accounts(request: Request):
    require_admin(request)
    from account_config import sync_accounts_to_database, get_all_configured_accounts
    synced = sync_accounts_to_database()
    return {
        "status": "success",
        "synced_count": synced,
        "accounts": get_all_configured_accounts(enabled_only=True)
    }

@app.get("/api/accounts/full-list")
async def get_accounts_full_list(request: Request):
    require_admin(request)
    from account_config import get_account_details_with_stats, get_all_profiles, sanitize_profiles_for_api
    accounts = get_account_details_with_stats()
    profiles = sanitize_profiles_for_api(get_all_profiles())
    return {
        "accounts": accounts,
        "profiles": profiles
    }

class RawConfigPayload(BaseModel):
    raw_json: str

@app.get("/api/accounts/raw-config")
async def get_raw_accounts_config(request: Request):
    require_admin(request)
    from account_config import get_raw_json_config
    return {"raw_json": get_raw_json_config()}

@app.put("/api/accounts/raw-config")
async def update_raw_accounts_config(payload: RawConfigPayload, request: Request):
    require_admin(request)
    from account_config import save_raw_json_config
    success, msg_str = save_raw_json_config(payload.raw_json)
    if not success:
        raise HTTPException(status_code=400, detail=msg_str)
    return {"status": "success", "message": msg_str}

@app.post("/api/accounts/profiles/{profile_id}/test-connection")
async def test_profile_connection(profile_id: str, request: Request):
    require_admin(request)
    from account_config import test_profile_open_api_connection
    result = await test_profile_open_api_connection(profile_id)
    return result

@app.post("/api/accounts/profiles/{profile_id}/refresh-token")
async def refresh_profile_token(profile_id: str, request: Request):
    require_admin(request)
    from account_config import refresh_profile_open_api_token
    result = refresh_profile_open_api_token(profile_id)
    if result.get("status") != "success":
        raise HTTPException(status_code=400, detail=result.get("message", "Token refresh failed"))
    return result

@app.post("/api/accounts/profiles/{profile_id}/scan-accounts")
async def scan_profile_accounts(profile_id: str, request: Request):
    require_admin(request)
    from account_config import scan_accounts_from_ctid
    result = await asyncio.to_thread(scan_accounts_from_ctid, profile_id)
    if result.get("status") != "success":
        raise HTTPException(status_code=400, detail=result.get("message", "Quét tài khoản cTID thất bại"))
    return result

class OpenApiPayload(BaseModel):
    client_id: Optional[str] = ""
    client_secret: Optional[str] = ""
    access_token: Optional[str] = ""
    refresh_token: Optional[str] = ""
    environment: Optional[str] = "live"
    redirect_uri: Optional[str] = "https://openapi.ctrader.com/apps/token"

class CreateProfilePayload(BaseModel):
    profile_name: str
    ctid_email: str
    ctid_password: str
    enabled: Optional[bool] = True
    auto_scan: Optional[bool] = True
    open_api: Optional[OpenApiPayload] = None

class UpdateProfilePayload(BaseModel):
    profile_name: Optional[str] = None
    ctid_email: Optional[str] = None
    ctid_password: Optional[str] = None
    enabled: Optional[bool] = None
    open_api: Optional[OpenApiPayload] = None

@app.post("/api/accounts/profiles")
async def create_profile_endpoint(payload: CreateProfilePayload, request: Request):
    require_admin(request)
    from account_config import create_profile, scan_accounts_from_ctid
    p_data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    auto_scan = p_data.pop("auto_scan", True)
    success, msg, profile_id = create_profile(p_data)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    
    scan_result = None
    if auto_scan and profile_id:
        try:
            scan_result = await asyncio.to_thread(scan_accounts_from_ctid, profile_id)
        except Exception as ex:
            scan_result = {"status": "warning", "message": f"Tạo hồ sơ thành công nhưng quét tài khoản gặp lỗi: {ex}"}

    return {
        "status": "success",
        "message": msg,
        "profile_id": profile_id,
        "scan_result": scan_result
    }

@app.put("/api/accounts/profiles/{profile_id}")
async def update_profile_endpoint(profile_id: str, payload: UpdateProfilePayload, request: Request):
    require_admin(request)
    from account_config import update_profile
    raw_dict = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    p_data = {k: v for k, v in raw_dict.items() if v is not None}
    success, msg = update_profile(profile_id, p_data)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}

@app.delete("/api/accounts/profiles/{profile_id}")
async def delete_profile_endpoint(profile_id: str, request: Request, force: bool = False):
    require_admin(request)
    from account_config import delete_profile
    success, msg = delete_profile(profile_id, force=force)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}

class CreateAccountPayload(BaseModel):
    profile_id: str
    account_id: str
    account_label: Optional[str] = None
    broker: Optional[str] = "FxPro"
    account_type: Optional[str] = "demo"
    currency: Optional[str] = "USD"
    enabled: Optional[bool] = True
    ctid_trader_id: Optional[str] = None

@app.post("/api/accounts")
async def create_new_account(payload: CreateAccountPayload, request: Request):
    require_admin(request)
    from account_config import add_account_to_profile
    success, msg_str = add_account_to_profile(payload.profile_id, payload.dict())
    if not success:
        raise HTTPException(status_code=400, detail=msg_str)
    return {"status": "success", "message": msg_str}

class UpdateAccountPayload(BaseModel):
    account_label: Optional[str] = None
    broker: Optional[str] = None
    account_type: Optional[str] = None
    currency: Optional[str] = None
    enabled: Optional[bool] = None

@app.put("/api/accounts/{account_id}")
async def update_account_endpoint(account_id: str, payload: UpdateAccountPayload, request: Request):
    require_admin(request)
    from account_config import update_account_info
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    success = update_account_info(account_id, updates)
    if not success:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")
    return {"status": "success", "message": f"Account '{account_id}' updated successfully."}

@app.delete("/api/accounts/{account_id}")
async def delete_account_endpoint(account_id: str, request: Request):
    require_admin(request)
    from account_config import delete_account
    success = delete_account(account_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")
    return {"status": "success", "message": f"Account '{account_id}' deleted successfully."}

@app.get("/api/dashboard")
async def dashboard_view(request: Request):
    get_current_user(request)

    conn = get_db()
    try:
        c = conn.cursor()
        
        # Get all accounts
        c.execute("SELECT * FROM accounts ORDER BY last_updated DESC")
        accounts = c.fetchall()
        
        # Summary values (Total)
        c.execute("SELECT SUM(balance) as tb, SUM(equity) as te FROM accounts")
        totals = c.fetchone()
        
        c.execute('''
            SELECT COUNT(*) as cnt FROM positions 
            WHERE account_id IN (
                SELECT DISTINCT account_id FROM bot_instances 
                WHERE status IN ('RUNNING', 'STARTING') AND account_id IS NOT NULL AND account_id != ''
            )
        ''')
        open_positions = c.fetchone()['cnt']
        
        today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0).isoformat()
        c.execute("SELECT SUM(pnl) as pnl, COUNT(*) as cnt FROM history WHERE exit_time >= ?", (today_start,))
        today_stats = c.fetchone()
        
        c.execute("SELECT SUM(pnl) as pnl FROM history")
        total_stats = c.fetchone()
        
        c.execute("SELECT pnl FROM history ORDER BY id DESC")
        all_trades = c.fetchall()
        win_count = sum(1 for t in all_trades if t['pnl'] > 0)
        win_rate = round((win_count / max(1, len(all_trades))) * 100, 1)
        
        # Calculate loss streak
        loss_streak = 0
        for t in all_trades:
            if t['pnl'] < 0:
                loss_streak += 1
            else:
                break
                
        # Get bot instances enriched with account equity & details
        c.execute('''
            SELECT 
                b.id,
                b.name,
                b.algo_path,
                b.ctid_email,
                b.ctid_password,
                b.account_id,
                b.symbol,
                b.timeframe,
                b.status,
                b.pid,
                b.created_at,
                b.custom_params,
                b.display_order,
                COALESCE(NULLIF(b.account_label, ''), a.account_label, 'Account #' || b.account_id) as account_label,
                LOWER(COALESCE(NULLIF(a.account_type, ''), NULLIF(b.account_type, ''), 'demo')) as account_type,
                COALESCE(a.balance, 0.0) as account_balance,
                COALESCE(a.equity, 0.0) as account_equity,
                a.last_updated as account_last_updated
            FROM bot_instances b
            LEFT JOIN accounts a ON b.account_id = a.account_id 
            ORDER BY COALESCE(b.display_order, b.id) ASC, b.id DESC
        ''')
        bots = c.fetchall()
        
        # Get position count per account (only for accounts with active running bots)
        c.execute('''
            SELECT account_id, COUNT(*) as cnt FROM positions 
            WHERE account_id IN (
                SELECT DISTINCT account_id FROM bot_instances 
                WHERE status IN ('RUNNING', 'STARTING') AND account_id IS NOT NULL AND account_id != ''
            )
            GROUP BY account_id
        ''')
        pos_counts = {r['account_id']: r['cnt'] for r in c.fetchall()}

        # Sync bot status in memory and collect dead bot IDs for separate safe DB update
        stopped_bot_ids = []
        bot_list = []
        for b in bots:
            b_dict = dict(b)
            is_proc_running = bot_manager.is_process_running(b_dict.get('pid'))
            if b_dict['status'] == 'RUNNING' and not is_proc_running:
                b_dict['status'] = 'STOPPED'
                b_dict['pid'] = None
                stopped_bot_ids.append(b_dict['id'])
            b_dict['algo_name'] = get_algo_filename(b_dict.get('algo_path', ''))
            b_dict['has_code_update'] = bot_manager.check_bot_update_status(b_dict).get('has_update', False)
            b_dict['open_positions'] = pos_counts.get(b_dict.get('account_id'), 0)
            bot_list.append(b_dict)

        # Immediately persist healed status to SQLite database
        if stopped_bot_ids:
            try:
                c.executemany("UPDATE bot_instances SET status = 'STOPPED', pid = NULL WHERE id = ?", [(bid,) for bid in stopped_bot_ids])
                conn.commit()
            except Exception as dbe:
                log_message("SYSTEM", "WARN", f"Could not auto-heal stopped bot IDs {stopped_bot_ids} in DB: {dbe}")

        # Get active positions (only for accounts with active running bots)
        c.execute('''
            SELECT p.*, a.account_label, a.account_type 
            FROM positions p 
            LEFT JOIN accounts a ON p.account_id = a.account_id 
            WHERE p.account_id IN (
                SELECT DISTINCT account_id FROM bot_instances 
                WHERE status IN ('RUNNING', 'STARTING') AND account_id IS NOT NULL AND account_id != ''
            )
            ORDER BY p.id DESC
        ''')
        positions = c.fetchall()

        # Get history (preview 25 recent trades for dashboard)
        c.execute('''
            SELECT h.*, a.account_label, a.account_type 
            FROM history h 
            LEFT JOIN accounts a ON h.account_id = a.account_id 
            ORDER BY h.id DESC LIMIT 25
        ''')
        history = c.fetchall()
        
        # Get logs (preview 25 recent logs for dashboard)
        c.execute("SELECT * FROM logs ORDER BY id DESC LIMIT 25")
        logs = c.fetchall()
        
        # Calculate daily P&L history and multi-account breakdown
        c.execute('''
            SELECT 
                date(exit_time) as date, 
                COALESCE(account_id, 'Other') as account_id, 
                SUM(pnl) as pnl, 
                COUNT(*) as cnt
            FROM history 
            WHERE exit_time IS NOT NULL 
            GROUP BY date(exit_time), COALESCE(account_id, 'Other')
            ORDER BY date(exit_time) ASC
        ''')
        pnl_by_acc_raw = [dict(r) for r in c.fetchall()]

        # Collect distinct dates and accounts
        distinct_dates = sorted(list(set(r["date"] for r in pnl_by_acc_raw)))
        if not distinct_dates:
            distinct_dates = [datetime.datetime.now().strftime("%Y-%m-%d")]
        
        # Get active account IDs & labels
        c.execute("SELECT account_id, account_label, account_type FROM accounts")
        acc_rows = [dict(r) for r in c.fetchall()]
        acc_label_map = {
            str(a["account_id"]): f"Account #{a['account_id']} ({a.get('account_type', 'DEMO')})"
            for a in acc_rows
        }
        
        unique_acc_ids = sorted(list(set(str(r["account_id"]) for r in pnl_by_acc_raw)))
        for a in acc_rows:
            a_id_str = str(a["account_id"])
            if a_id_str not in unique_acc_ids:
                unique_acc_ids.append(a_id_str)

        # Build daily matrix & cumulative matrix
        accounts_daily = {acc: [0.0] * len(distinct_dates) for acc in unique_acc_ids}
        totals_daily = [0.0] * len(distinct_dates)

        date_idx_map = {d: i for i, d in enumerate(distinct_dates)}
        for r in pnl_by_acc_raw:
            d = r["date"]
            acc = str(r["account_id"])
            pnl_val = round(float(r["pnl"] or 0.0), 2)
            if d in date_idx_map:
                idx = date_idx_map[d]
                if acc in accounts_daily:
                    accounts_daily[acc][idx] += pnl_val
                totals_daily[idx] += pnl_val

        # Round values
        totals_daily = [round(v, 2) for v in totals_daily]
        for acc in accounts_daily:
            accounts_daily[acc] = [round(v, 2) for v in accounts_daily[acc]]

        # Build cumulative series
        totals_cumulative = []
        cum_tot = 0.0
        for v in totals_daily:
            cum_tot = round(cum_tot + v, 2)
            totals_cumulative.append(cum_tot)

        accounts_cumulative = {}
        for acc, vals in accounts_daily.items():
            cum_acc = 0.0
            cum_list = []
            for v in vals:
                cum_acc = round(cum_acc + v, 2)
                cum_list.append(cum_acc)
            accounts_cumulative[acc] = cum_list

        pnl_by_account = {
            "dates": distinct_dates,
            "totals_daily": totals_daily,
            "totals_cumulative": totals_cumulative,
            "accounts_daily": accounts_daily,
            "accounts_cumulative": accounts_cumulative,
            "account_labels": acc_label_map,
            "unique_accounts": unique_acc_ids
        }

        pnl_history = [{"date": d, "pnl": pnl_val} for d, pnl_val in zip(distinct_dates, totals_daily)]
    finally:
        conn.close()

    # If any dead bots were detected, update database safely in separate short-lived connection
    if stopped_bot_ids:
        safe_sync_stopped_bots_db(stopped_bot_ids)

    # Primary Telemetry Sync (Cloud Open API with automatic CLI fallback) if cache is older than 20s
    if time.time() - _last_cloud_sync_time > 20.0:
        asyncio.create_task(sync_active_accounts_telemetry(force=False))

    # Overlay in-memory live telemetry onto accounts
    accounts_list = []
    total_balance = 0.0
    total_equity = 0.0
    for a in accounts:
        a_dict = dict(a)
        acc_id = str(a_dict.get("account_id"))
        if acc_id in latest_accounts:
            if latest_accounts[acc_id].get("equity") is not None:
                a_dict["equity"] = latest_accounts[acc_id]["equity"]
            if latest_accounts[acc_id].get("balance") is not None:
                a_dict["balance"] = latest_accounts[acc_id]["balance"]
        total_balance += (a_dict.get("balance") or 0.0)
        total_equity += (a_dict.get("equity") or 0.0)
        accounts_list.append(a_dict)

    summary = {
        'account_id': 'all',
        'account_balance': round(total_balance, 2),
        'account_equity': round(total_equity, 2),
        'open_positions': open_positions,
        'daily_pnl': round(today_stats['pnl'] or 0, 2),
        'total_pnl': round(total_stats['pnl'] or 0, 2),
        'trades_today': today_stats['cnt'],
        'win_rate': win_rate,
        'loss_streak': loss_streak
    }

    # Compute live unrealized PnL from latest_prices for open positions only if missing in DB
    enriched_positions = []
    for p in positions:
        p_dict = dict(p)
        has_current_price = p_dict.get("current_price") is not None and p_dict.get("current_price") > 0
        has_pnl = p_dict.get("pnl") is not None
        if not (has_current_price and has_pnl):
            sym = p_dict.get("symbol", "XAUUSD")
            if sym in latest_prices:
                price_info = latest_prices[sym]
                is_buy = p_dict.get("side", "").upper() == "BUY"
                cur_p = price_info["bid"] if is_buy else price_info["ask"]
                pip_size = 0.01 if ("JPY" in sym or "XAU" in sym or "GOLD" in sym) else 0.0001
                mult = 1.0 if ("XAU" in sym or "GOLD" in sym) else 10.0
                pnl_pips = round((cur_p - p_dict["entry_price"]) / pip_size, 1) if is_buy else round((p_dict["entry_price"] - cur_p) / pip_size, 1)
                pnl_usd = round(pnl_pips * p_dict["volume"] * mult, 2)
                p_dict["current_price"] = cur_p
                p_dict["pnl"] = pnl_usd
                p_dict["pnl_pips"] = pnl_pips
        enriched_positions.append(p_dict)
    
    available_cbots = get_cbots_library()
    available_algos = [c["filename"] for c in available_cbots]

    # Measure VPS system CPU & RAM percent
    try:
        import psutil
        vps_cpu = round(psutil.cpu_percent(interval=None), 1)
        vps_ram = round(psutil.virtual_memory().percent, 1)
    except Exception:
        vps_cpu = 0.0
        vps_ram = 0.0
    
    return {
        "accounts": accounts_list,
        "summary": summary,
        "bots": bot_list,
        "positions": enriched_positions,
        "history": [sanitize_trade_history_item(h) for h in history],
        "logs": [sanitize_log_item(l) for l in logs],
        "pnl_history": pnl_history,
        "pnl_by_account": pnl_by_account,
        "available_algos": available_algos,
        "available_cbots": available_cbots,
        "vps_cpu_percent": vps_cpu,
        "vps_ram_percent": vps_ram
    }


# --- Bot Management APIs ---

class CreateBotRequest(BaseModel):
    name: str
    algo_path: str
    ctid_email: Optional[str] = ""
    ctid_password: Optional[str] = ""
    account_id: str
    account_label: Optional[str] = ""
    account_type: Optional[str] = "demo"
    symbol: str
    timeframe: str
    auto_start: Optional[bool] = False

@app.post("/api/bots")
async def create_bot(request: Request, data: CreateBotRequest):
    require_admin(request)
    
    algo_path = data.algo_path
    if not os.path.isabs(algo_path):
        algo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", algo_path))
        
    resolved_ctid, resolved_pwd = get_ctrader_credentials({
        "account_id": data.account_id,
        "ctid_email": data.ctid_email,
        "ctid_password": data.ctid_password
    })

    if data.ctid_email and data.ctid_password and "@" in data.ctid_email:
        resolved_ctid = data.ctid_email.strip()
        resolved_pwd = data.ctid_password.strip()
        # Only update legacy ctrader_account.txt if multi-account JSON is not present
        json_cfg = os.path.join(os.path.dirname(__file__), "ctrader_accounts.json")
        if not os.path.exists(json_cfg):
            cred_file = os.path.join(os.path.dirname(__file__), "ctrader_account.txt")
            try:
                with open(cred_file, "w", encoding="utf-8") as f:
                    f.write(f"CTID_EMAIL={resolved_ctid}\n")
                    f.write(f"CTID_PASSWORD={resolved_pwd}\n")
            except Exception:
                pass
        
    conn = get_db()
    try:
        c = conn.cursor()
        now = datetime.datetime.now().isoformat()
        
        # Check existing account record
        c.execute("SELECT account_type, account_label FROM accounts WHERE account_id = ?", (data.account_id,))
        existing_acc = c.fetchone()

        req_type = (data.account_type or "").strip().lower()
        if existing_acc and existing_acc["account_type"]:
            known_type = existing_acc["account_type"].strip().lower()
            # If user didn't explicitly override with a valid non-demo type, inherit known account type
            resolved_account_type = known_type if req_type in ("", "demo") and known_type == "live" else (req_type or known_type)
        else:
            resolved_account_type = req_type or "demo"

        resolved_label = data.account_label.strip() if (data.account_label and data.account_label.strip()) else (existing_acc["account_label"] if existing_acc and existing_acc["account_label"] else f"Account #{data.account_id}")

        # Upsert account record
        c.execute('''
            INSERT INTO accounts (account_id, account_type, account_label, balance, equity, last_updated)
            VALUES (?, ?, ?, 0.0, 0.0, ?)
            ON CONFLICT(account_id) DO UPDATE SET
                account_label = CASE WHEN excluded.account_label != '' THEN excluded.account_label ELSE accounts.account_label END,
                account_type = CASE WHEN excluded.account_type != '' THEN excluded.account_type ELSE accounts.account_type END,
                last_updated = excluded.last_updated
        ''', (data.account_id, resolved_account_type, resolved_label, now))

        # Get next display_order
        c.execute('SELECT COALESCE(MAX(display_order), 0) + 1 FROM bot_instances')
        next_order = c.fetchone()[0]

        broker = get_account_broker(data.account_id)
        resolved_symbol = normalize_symbol(data.symbol, broker=broker)
        c.execute('''
            INSERT INTO bot_instances (name, algo_path, ctid_email, ctid_password, account_id, account_label, symbol, timeframe, status, created_at, display_order, account_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (data.name, algo_path, resolved_ctid, resolved_pwd, data.account_id, resolved_label, resolved_symbol, data.timeframe, 'STOPPED', now, next_order, resolved_account_type))
        
        new_bot_id = c.lastrowid
        conn.commit()
    finally:
        conn.close()
    
    started = False
    start_msg = ""
    if data.auto_start and new_bot_id:
        started, start_msg = bot_manager.start_bot(new_bot_id)
        
    return {
        "status": "success", 
        "bot_id": new_bot_id,
        "started": started,
        "start_message": start_msg
    }

# --- System Metrics & Bulk Fleet Control APIs (Must be defined BEFORE /{bot_id} routes to prevent FastAPI router collision) ---
@app.get("/api/system/metrics")
async def get_system_metrics(request: Request):
    try:
        get_current_user(request)
    except Exception:
        pass

    try:
        import psutil
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        return {
            "cpu_percent": round(cpu, 1),
            "ram_percent": round(mem.percent, 1),
            "ram_used_mb": round(mem.used / (1024 * 1024), 1),
            "ram_total_mb": round(mem.total / (1024 * 1024), 1)
        }
    except Exception as e:
        return {"cpu_percent": 0.0, "ram_percent": 0.0, "error": str(e)}

class BulkActionRequest(BaseModel):
    account_type: Optional[str] = None
    max_cpu_threshold: Optional[float] = 40.0
    min_delay_seconds: Optional[float] = 10.0
    max_wait_seconds: Optional[float] = 90.0
    delay_seconds: Optional[float] = None

@app.post("/api/bots/bulk/start")
async def bulk_start_bots_endpoint(request: Request, body: Optional[BulkActionRequest] = None):
    require_admin(request)
    acc_type = body.account_type if body else None
    max_cpu = body.max_cpu_threshold if (body and body.max_cpu_threshold is not None) else 40.0
    min_delay = body.min_delay_seconds if (body and body.min_delay_seconds is not None) else 10.0
    max_wait = body.max_wait_seconds if (body and body.max_wait_seconds is not None) else 90.0
    delay = body.delay_seconds if (body and body.delay_seconds is not None) else None

    scope_name = f" [{acc_type.upper()} FLEET]" if acc_type else " toàn bộ fleet"
    # Launch adaptive CPU-gated startup asynchronously in background so event loop and UI never block
    asyncio.create_task(bot_manager.start_all_bots_async(
        account_type=acc_type,
        max_cpu_threshold=max_cpu,
        min_delay_seconds=min_delay,
        max_wait_seconds=max_wait,
        delay_seconds=delay
    ))
    return {
        "status": "success", 
        "message": f"Quá trình khởi chạy tuần tự các bot{scope_name} (CPU Gate < {max_cpu:.0f}%, nghỉ tối thiểu {int(min_delay)}s) đã bắt đầu trong nền."
    }

@app.post("/api/bots/bulk/stop")
async def bulk_stop_bots_endpoint(request: Request, body: Optional[BulkActionRequest] = None):
    require_admin(request)
    acc_type = body.account_type if body else None
    res = bot_manager.stop_all_bots(account_type=acc_type)
    return {"status": "success", "result": res}

@app.post("/api/bots/bulk/restart")
async def bulk_restart_bots_endpoint(request: Request, body: Optional[BulkActionRequest] = None):
    require_admin(request)
    acc_type = body.account_type if body else None
    max_cpu = body.max_cpu_threshold if (body and body.max_cpu_threshold is not None) else 40.0
    min_delay = body.min_delay_seconds if (body and body.min_delay_seconds is not None) else 10.0
    max_wait = body.max_wait_seconds if (body and body.max_wait_seconds is not None) else 90.0
    delay = body.delay_seconds if (body and body.delay_seconds is not None) else None

    scope_name = f" [{acc_type.upper()} FLEET]" if acc_type else " toàn bộ fleet"
    # Launch adaptive CPU-gated restart asynchronously in background
    asyncio.create_task(bot_manager.restart_all_bots_async(
        account_type=acc_type,
        max_cpu_threshold=max_cpu,
        min_delay_seconds=min_delay,
        max_wait_seconds=max_wait,
        delay_seconds=delay
    ))
    return {
        "status": "success", 
        "message": f"Quá trình khởi động lại{scope_name} (CPU Gate < {max_cpu:.0f}%, nghỉ tối thiểu {int(min_delay)}s) đã bắt đầu trong nền."
    }

@app.get("/api/bots/bulk/updates")
async def get_bot_updates_endpoint(request: Request, account_type: Optional[str] = None):
    """
    Returns update status of all bots, identifying instances whose .algo binary
    on disk is newer than their running process.
    """
    get_current_user(request)
    update_list = bot_manager.get_all_bots_update_status(account_type=account_type)
    updated_only = [b for b in update_list if b.get("has_update")]
    return {
        "status": "success",
        "total_bots": len(update_list),
        "updated_count": len(updated_only),
        "updated_bots": updated_only,
        "all_bots": update_list
    }

@app.post("/api/bots/bulk/restart-updated")
async def bulk_restart_updated_bots_endpoint(request: Request, body: Optional[BulkActionRequest] = None):
    """
    Smart Incremental Restart:
    Inspects all RUNNING bots and restarts ONLY instances whose .algo binary
    is newer than their running process. Bots without updates continue running undisturbed.
    """
    require_admin(request)
    acc_type = body.account_type if body else None
    max_cpu = body.max_cpu_threshold if (body and body.max_cpu_threshold is not None) else 40.0
    min_delay = body.min_delay_seconds if (body and body.min_delay_seconds is not None) else 10.0
    max_wait = body.max_wait_seconds if (body and body.max_wait_seconds is not None) else 90.0
    delay = body.delay_seconds if (body and body.delay_seconds is not None) else None

    # Launch smart incremental restart asynchronously in background task
    asyncio.create_task(bot_manager.restart_updated_bots_async(
        account_type=acc_type,
        max_cpu_threshold=max_cpu,
        min_delay_seconds=min_delay,
        max_wait_seconds=max_wait,
        delay_seconds=delay
    ))
    return {
        "status": "success",
        "message": "Quá trình Smart Incremental Restart (chỉ khởi động lại các bot có code mới) đã bắt đầu trong nền."
    }

class BotReorderRequest(BaseModel):
    ordered_ids: List[int]

@app.post("/api/bots/reorder")
async def reorder_bots_endpoint(payload: BotReorderRequest, request: Request):
    require_admin(request)
    conn = get_db()
    try:
        c = conn.cursor()
        for idx, bot_id in enumerate(payload.ordered_ids):
            c.execute("UPDATE bot_instances SET display_order = ? WHERE id = ?", (idx, bot_id))
        conn.commit()
        return {"status": "success", "message": "Bot display order updated successfully."}
    finally:
        conn.close()

# --- Individual Bot Instance Lifecycle APIs ---
@app.post("/api/bots/{bot_id}/start")
async def start_bot_endpoint(bot_id: int, request: Request):
    require_admin(request)
    success, msg = bot_manager.start_bot(bot_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success"}

@app.post("/api/bots/{bot_id}/stop")
async def stop_bot_endpoint(bot_id: int, request: Request):
    require_admin(request)
    success, msg = bot_manager.stop_bot(bot_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success"}

@app.post("/api/bots/{bot_id}/restart")
async def restart_bot_endpoint(bot_id: int, request: Request):
    require_admin(request)
    # Stop first
    bot_manager.stop_bot(bot_id)
    import asyncio
    await asyncio.sleep(1) # wait for process to fully terminate
    success, msg = bot_manager.start_bot(bot_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success"}

@app.post("/api/bots/{bot_id}/delete")
async def delete_bot_endpoint(bot_id: int, request: Request):
    require_admin(request)
    bot_manager.stop_bot(bot_id) # Ensure stopped
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("DELETE FROM bot_instances WHERE id = ?", (bot_id,))
        conn.commit()
    finally:
        conn.close()
    return {"status": "success"}

# --- Bot Parameters APIs ---

class SaveParametersRequest(BaseModel):
    parameters: dict
    restart: Optional[bool] = False
    name: Optional[str] = None
    account_id: Optional[str] = None
    account_label: Optional[str] = None
    account_type: Optional[str] = None
    ctid_email: Optional[str] = None
    ctid_password: Optional[str] = None
    symbol: Optional[str] = None
    timeframe: Optional[str] = None

@app.get("/api/cbots/schema")
async def get_cbot_schema(algo_path: str, request: Request):
    get_current_user(request)
    if not os.path.isabs(algo_path):
        algo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", algo_path))
    
    if not os.path.exists(algo_path):
        raise HTTPException(status_code=404, detail="Algo file not found")
        
    meta = bot_manager.get_algo_metadata(algo_path)
    if not meta:
        raise HTTPException(status_code=500, detail="Failed to extract metadata from algo file")
        
    return meta

@app.get("/api/bots/{bot_id}/parameters")
async def get_bot_parameters(bot_id: int, request: Request):
    get_current_user(request)
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("""
            SELECT 
                b.*,
                COALESCE(a.account_label, b.account_label, 'Account #' || b.account_id) as acc_label,
                LOWER(COALESCE(NULLIF(a.account_type, ''), NULLIF(b.account_type, ''), 'demo')) as acc_type
            FROM bot_instances b
            LEFT JOIN accounts a ON b.account_id = a.account_id
            WHERE b.id = ?
        """, (bot_id,))
        raw_bot = c.fetchone()
    finally:
        conn.close()
    
    if not raw_bot:
        raise HTTPException(status_code=404, detail="Bot not found")
        
    bot = dict(raw_bot)
    algo_path = bot['algo_path']
    if not os.path.exists(algo_path):
        candidate = os.path.abspath(os.path.join(os.path.dirname(__file__), "cbot", get_algo_filename(algo_path)))
        if os.path.exists(candidate):
            algo_path = candidate
            
    meta = bot_manager.get_algo_metadata(algo_path)
    
    # Parse saved custom_params
    saved_params = {}
    if 'custom_params' in bot.keys() and bot['custom_params']:
        try:
            saved_params = json.loads(bot['custom_params'])
        except Exception:
            pass
            
    return {
        "bot_id": bot_id,
        "name": bot.get('name'),
        "algo_path": bot.get('algo_path'),
        "account_id": bot.get('account_id'),
        "account_label": bot.get('acc_label') or bot.get('account_label') or "",
        "account_type": bot.get('acc_type') or bot.get('account_type') or "demo",
        "ctid_email": bot.get('ctid_email') or "",
        "ctid_password": bot.get('ctid_password') or "",
        "symbol": bot.get('symbol') or "XAUUSD",
        "timeframe": bot.get('timeframe') or "m15",
        "status": bot.get('status'),
        "schema": meta,
        "values": saved_params
    }

@app.post("/api/bots/{bot_id}/parameters")
async def save_bot_parameters(bot_id: int, data: SaveParametersRequest, request: Request):
    require_admin(request)
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM bot_instances WHERE id = ?", (bot_id,))
        raw_bot = c.fetchone()
        
        if not raw_bot:
            raise HTTPException(status_code=404, detail="Bot not found")
        
        bot = dict(raw_bot)
        
        # Filter submitted parameters against actual cBot algo schema to prune obsolete keys
        algo_path = bot.get('algo_path')
        if algo_path and isinstance(data.parameters, dict):
            meta = bot_manager.get_algo_metadata(algo_path)
            if meta and isinstance(meta.get("Parameters"), list):
                valid_params = {p["PropertyName"] for p in meta.get("Parameters", [])}
                data.parameters = {k: v for k, v in data.parameters.items() if k in valid_params}
                
        params_json = json.dumps(data.parameters)
        
        # Check actual columns in bot_instances to prevent no such column exceptions
        c.execute("PRAGMA table_info(bot_instances)")
        existing_bot_cols = {row[1] for row in c.fetchall()}

        updates = ["custom_params = ?"]
        values = [params_json]
        
        if data.name is not None and data.name.strip():
            updates.append("name = ?")
            values.append(data.name.strip())
        if data.account_id is not None and data.account_id.strip():
            updates.append("account_id = ?")
            values.append(data.account_id.strip())
        if data.account_label is not None and "account_label" in existing_bot_cols:
            updates.append("account_label = ?")
            values.append(data.account_label.strip())
        if data.account_type is not None and data.account_type.strip() and "account_type" in existing_bot_cols:
            updates.append("account_type = ?")
            values.append(data.account_type.strip())
        if data.ctid_email is not None and data.ctid_email.strip():
            updates.append("ctid_email = ?")
            values.append(data.ctid_email.strip())
            if data.ctid_password is not None:
                updates.append("ctid_password = ?")
                values.append(data.ctid_password.strip())
        elif data.account_id is not None and data.account_id.strip():
            # Auto-resolve credentials from account_config for the updated account
            resolved_ctid, resolved_pwd = get_ctrader_credentials({"account_id": data.account_id.strip()})
            if resolved_ctid:
                updates.append("ctid_email = ?")
                values.append(resolved_ctid)
            if resolved_pwd:
                updates.append("ctid_password = ?")
                values.append(resolved_pwd)
        target_acc = data.account_id.strip() if (data.account_id and data.account_id.strip()) else bot.get('account_id')
        acc_broker = get_account_broker(target_acc, bot)
        if data.symbol is not None and data.symbol.strip():
            updates.append("symbol = ?")
            values.append(normalize_symbol(data.symbol.strip(), broker=acc_broker))
        if data.timeframe is not None and data.timeframe.strip():
            updates.append("timeframe = ?")
            values.append(data.timeframe.strip())

        values.append(bot_id)
        sql = f"UPDATE bot_instances SET {', '.join(updates)} WHERE id = ?"
        c.execute(sql, tuple(values))

        # Synchronize account record in accounts table
        target_acc = data.account_id.strip() if (data.account_id and data.account_id.strip()) else bot.get('account_id')
        if target_acc:
            c.execute("PRAGMA table_info(accounts)")
            existing_acc_cols = {row[1] for row in c.fetchall()}
            
            acc_updates = []
            acc_vals = []
            if data.account_label is not None and data.account_label.strip() and "account_label" in existing_acc_cols:
                acc_updates.append("account_label = ?")
                acc_vals.append(data.account_label.strip())
            if data.account_type is not None and data.account_type.strip() and "account_type" in existing_acc_cols:
                acc_updates.append("account_type = ?")
                acc_vals.append(data.account_type.strip())
            if acc_updates:
                acc_vals.append(target_acc)
                c.execute(f"UPDATE accounts SET {', '.join(acc_updates)} WHERE account_id = ?", tuple(acc_vals))

        conn.commit()
    except sqlite3.OperationalError as ex:
        # Fallback if column migration is still pending
        try:
            c.execute("UPDATE bot_instances SET custom_params = ? WHERE id = ?", (json.dumps(data.parameters), bot_id))
            conn.commit()
        except Exception:
            pass
        log_message(f"BOT_{bot_id}", "WARN", f"Parameter save note: {ex}")
    except Exception as ex:
        log_message(f"BOT_{bot_id}", "ERROR", f"Failed to save bot parameters: {ex}")
        raise HTTPException(status_code=500, detail=f"Failed to save parameters: {str(ex)}")
    finally:
        conn.close()
    
    restarted = False
    if data.restart and bot['status'] == 'RUNNING':
        bot_manager.stop_bot(bot_id)
        await asyncio.sleep(1)
        ok, msg = bot_manager.start_bot(bot_id)
        restarted = True
        if not ok:
            return {"status": "warning", "message": f"Parameters saved, but restart failed: {msg}"}
            
    return {
        "status": "success",
        "restarted": restarted,
        "message": "Parameters updated and bot restarted successfully!" if restarted else "Parameters saved successfully."
    }

class TickPosition(BaseModel):
    id: int
    side: str
    volume: float
    entry_price: float
    net_profit: Optional[float] = 0.0
    pips: Optional[float] = 0.0

class TickTelemetry(BaseModel):
    bot_id: str
    account_number: str
    symbol: str
    bid: float
    ask: float
    equity: float
    balance: float
    positions: Optional[List[TickPosition]] = []

# In-memory latest telemetry cache
latest_prices = {}
latest_accounts = {}
_last_db_tick_sync = 0.0

# cTrader Open API Cloud Fallback Integration
from ctrader_open_api_client import CTraderOpenAPIClient
from ctrader_oauth_helper import load_env as load_ctrader_env
from ctrader_open_api.messages import OpenApiModelMessages_pb2 as model_msg
from ctrader_open_api.messages import OpenApiMessages_pb2 as msg

_last_cloud_sync_time = 0.0
_is_cloud_syncing = False

_last_cli_broker_sync_time = 0.0
_is_cli_broker_syncing = False

async def trigger_broker_cli_positions_sync_bg(force: bool = False):
    """
    Non-blocking background sync of live broker positions using ctrader-cli
    for all accounts that have running or starting bot instances.
    """
    global _last_cli_broker_sync_time, _is_cli_broker_syncing
    now = time.time()
    if not force and (now - _last_cli_broker_sync_time < 15.0):
        return
    if _is_cli_broker_syncing:
        return
    _is_cli_broker_syncing = True
    try:
        loop = asyncio.get_running_loop()
        import ctrader_reader
        await loop.run_in_executor(None, ctrader_reader.sync_ctrader_broker_positions)
        _last_cli_broker_sync_time = time.time()
    except Exception as e:
        log_message("SYSTEM", "WARN", f"Background CLI positions sync failed: {e}")
    finally:
        _is_cli_broker_syncing = False

def normalize_open_api_volume(raw_vol: int, symbol: str) -> float:
    sym = (symbol or "").upper()
    cents = raw_vol / 100.0
    if any(k in sym for k in ["XAU", "GOLD"]):
        return round(cents / 100.0, 2)
    elif any(k in sym for k in ["BTC", "ETH", "US 500", "US500", "JAPAN", "JP225", "SPX", "NAS", "GER", "UK100", "WTI", "BRENT"]):
        return round(cents, 2)
    else:
        # Standard Forex currency pairs: 1 lot = 100,000 units
        return round(cents / 100000.0, 2)

async def sync_ctrader_cloud_telemetry(force: bool = False) -> Dict[str, Any]:
    global _last_cloud_sync_time, _is_cloud_syncing, latest_accounts, latest_prices
    now_ts = time.time()
    if not force and (now_ts - _last_cloud_sync_time < 15.0):
        return {"status": "cached", "last_sync": _last_cloud_sync_time}
    if _is_cloud_syncing:
        return {"status": "in_progress"}

    # 1. Identify which accounts currently have active (RUNNING or STARTING) bot instances
    conn = get_db()
    active_account_ids = []
    try:
        c = conn.cursor()
        c.execute("SELECT DISTINCT account_id FROM bot_instances WHERE status IN ('RUNNING', 'STARTING') AND account_id IS NOT NULL AND account_id != ''")
        active_account_ids = [str(r['account_id']) for r in c.fetchall()]
    finally:
        conn.close()

    if not active_account_ids:
        return {"status": "no_active_bots", "message": "No active bots running."}

    _is_cloud_syncing = True
    synced_accounts = []
    unmatched_accounts = []
    total_open_positions = 0

    try:
        from account_config import get_open_api_credentials_for_account
        
        # 2. Group active accounts by their resolved Open API credentials
        cred_groups: Dict[str, Dict[str, Any]] = {}
        for target_id in active_account_ids:
            oa_creds = get_open_api_credentials_for_account(target_id)
            if not oa_creds or not oa_creds.get("client_id") or not oa_creds.get("access_token"):
                unmatched_accounts.append(target_id)
                continue
            
            sig = f"{oa_creds['client_id']}::{oa_creds['access_token']}"
            if sig not in cred_groups:
                cred_groups[sig] = {
                    "creds": oa_creds,
                    "target_ids": []
                }
            cred_groups[sig]["target_ids"].append(target_id)

        if not cred_groups:
            _last_cloud_sync_time = now_ts
            return {
                "status": "unconfigured" if not synced_accounts else "partial",
                "synced_accounts": synced_accounts,
                "unmatched_accounts": unmatched_accounts,
                "open_positions": 0
            }

        # 3. Synchronize each credential group with its isolated Open API TLS client
        for sig, group_info in cred_groups.items():
            creds = group_info["creds"]
            group_targets = group_info["target_ids"]
            client_id = creds["client_id"]
            secret = creds["client_secret"]
            access_token = creds["access_token"]
            default_env = creds.get("environment", "live").lower()

            client = None
            try:
                client = CTraderOpenAPIClient(environment=default_env, timeout=12.0)
                await client.connect()
                await client.authorize_application(client_id, secret)
                accounts_list = await client.get_accounts_by_access_token(access_token)

                # Build lookup maps for fast matching
                acc_map = {}
                for acc in accounts_list:
                    acc_id = str(acc.ctidTraderAccountId)
                    trader_id = str(getattr(acc, "traderLogin", acc_id))
                    acc_map[acc_id] = acc
                    acc_map[trader_id] = acc

                cached_sym_maps = {}

                for target_id in group_targets:
                    matched_acc = acc_map.get(target_id)
                    if not matched_acc:
                        unmatched_accounts.append(target_id)
                        continue

                    selected_acc_id = matched_acc.ctidTraderAccountId
                    trader_id = getattr(matched_acc, "traderLogin", selected_acc_id)
                    is_live = getattr(matched_acc, "isLive", False)
                    req_env = "live" if is_live else "demo"

                    if req_env != client.environment:
                        await client.disconnect()
                        client = CTraderOpenAPIClient(environment=req_env, timeout=12.0)
                        await client.connect()
                        await client.authorize_application(client_id, secret)

                    await client.authorize_account(selected_acc_id, access_token)
                    trader = await client.get_trader_profile(selected_acc_id)

                    digits = getattr(trader, "moneyDigits", 2)
                    raw_balance = getattr(trader, "balance", 0)
                    balance = raw_balance / (10 ** digits) if digits > 0 else raw_balance / 100.0
                    now_iso = datetime.datetime.now().isoformat()

                    acc_keys = [str(selected_acc_id), str(trader_id), target_id]
                    for k in set(acc_keys):
                        latest_accounts[k] = {
                            "balance": round(balance, 2),
                            "equity": round(balance, 2),
                            "last_updated": now_iso,
                            "source": f"cTrader Cloud ({'LIVE' if is_live else 'DEMO'})"
                        }

                    if selected_acc_id not in cached_sym_maps:
                        symbols = await client.get_symbols_list(selected_acc_id)
                        cached_sym_maps[selected_acc_id] = {s.symbolId: s.symbolName for s in symbols}
                    sym_map = cached_sym_maps[selected_acc_id]

                    reconcile_res = await client.reconcile_positions(selected_acc_id)
                    open_positions_count = len(reconcile_res.position)
                    total_open_positions += open_positions_count

                    # Subscribe to spot price ticks for all open position symbols
                    spot_prices = {}
                    def on_spot(pt, raw):
                        if pt == model_msg.PROTO_OA_SPOT_EVENT:
                            se = msg.ProtoOASpotEvent()
                            se.ParseFromString(raw)
                            bid = (se.bid / 100000.0) if getattr(se, "bid", None) else None
                            ask = (se.ask / 100000.0) if getattr(se, "ask", None) else None
                            if se.symbolId not in spot_prices:
                                spot_prices[se.symbolId] = {}
                            if bid: spot_prices[se.symbolId]["bid"] = bid
                            if ask: spot_prices[se.symbolId]["ask"] = ask

                    client.on_event(model_msg.PROTO_OA_SPOT_EVENT, on_spot)

                    open_symbol_ids = list(set([p.tradeData.symbolId for p in reconcile_res.position]))
                    if open_symbol_ids:
                        try:
                            await client.subscribe_spots(selected_acc_id, open_symbol_ids)
                        except Exception as sub_ex:
                            log_message("SYSTEM", "DEBUG", f"Could not subscribe spots for {selected_acc_id}: {sub_ex}")

                    # Fetch broker-calculated real-time Net & Gross Unrealized PnL
                    pnl_map = {}
                    total_net_pnl = 0.0
                    try:
                        pnl_res = await client.get_position_unrealized_pnl(selected_acc_id)
                        money_digits = getattr(pnl_res, "moneyDigits", 2) or 2
                        div = 10.0 ** money_digits
                        for upnl in pnl_res.positionUnrealizedPnL:
                            net_val = round(upnl.netUnrealizedPnL / div, 2)
                            gross_val = round(upnl.grossUnrealizedPnL / div, 2)
                            pnl_map[upnl.positionId] = {"net": net_val, "gross": gross_val}
                            total_net_pnl += net_val
                    except Exception as pnl_ex:
                        log_message("SYSTEM", "DEBUG", f"Could not fetch unrealized PnL for {selected_acc_id}: {pnl_ex}")

                    # Brief grace period (0.25s) for spot events to arrive over TLS
                    if open_symbol_ids:
                        await asyncio.sleep(0.25)

                    # Update latest_prices cache with current spot quotes
                    for sym_id, sp in spot_prices.items():
                        s_name = sym_map.get(sym_id)
                        if s_name:
                            b = sp.get("bid")
                            a = sp.get("ask") or b
                            if b and a:
                                latest_prices[s_name] = {"bid": b, "ask": a, "timestamp": now_ts}

                    effective_equity = round(balance + total_net_pnl, 2)

                    conn_sync = get_db()
                    try:
                        c_sync = conn_sync.cursor()
                        c_sync.execute('''
                            UPDATE accounts SET equity = ?, balance = ?, last_updated = ?
                            WHERE account_id = ? OR account_id = ? OR account_id = ?
                        ''', (effective_equity, round(balance, 2), now_iso, str(selected_acc_id), str(trader_id), target_id))

                        current_c_ids = [p.positionId for p in reconcile_res.position]
                        if current_c_ids:
                            placeholders = ",".join("?" for _ in current_c_ids)
                            c_sync.execute(f'''
                                DELETE FROM positions 
                                WHERE (account_id = ? OR account_id = ? OR account_id = ?) 
                                AND ctrader_id NOT IN ({placeholders})
                            ''', (str(selected_acc_id), str(trader_id), target_id, *current_c_ids))
                        else:
                            c_sync.execute('''
                                DELETE FROM positions 
                                WHERE account_id = ? OR account_id = ? OR account_id = ?
                            ''', (str(selected_acc_id), str(trader_id), target_id))

                        for p in reconcile_res.position:
                            c_id = p.positionId
                            sym_name = sym_map.get(p.tradeData.symbolId, "XAUUSD")
                            side = "BUY" if p.tradeData.tradeSide == 1 else "SELL"
                            vol = normalize_open_api_volume(p.tradeData.volume, sym_name)
                            entry_p = p.price
                            sl_val = getattr(p, "stopLoss", 0.0) or 0.0
                            tp_val = getattr(p, "takeProfit", 0.0) or 0.0
                            comment_val = getattr(p.tradeData, "comment", "") or "cTrader Cloud Position"
                            open_ts = getattr(p.tradeData, "openTimestamp", 0)
                            open_time_iso = datetime.datetime.fromtimestamp(open_ts / 1000.0).isoformat() if open_ts > 0 else now_iso

                            sym_upper = sym_name.upper()
                            if any(k in sym_upper for k in ["BTC", "ETH", "US30", "US 500", "US500", "JAPAN", "NAS", "GER", "UK", "SPX", "WS30", "NDX"]):
                                pip_size = 1.0
                            elif any(k in sym_upper for k in ["JPY", "XAU", "GOLD", "OIL", "WTI"]):
                                pip_size = 0.01
                            else:
                                pip_size = 0.0001

                            # Resolve current market price
                            cur_spot = spot_prices.get(p.tradeData.symbolId, {})
                            cur_p = cur_spot.get("bid" if side == "BUY" else "ask") or cur_spot.get("bid") or cur_spot.get("ask")
                            if not cur_p and sym_name in latest_prices:
                                cur_p = latest_prices[sym_name].get("bid" if side == "BUY" else "ask")
                            if not cur_p:
                                cur_p = entry_p

                            # Resolve Net Unrealized P&L from broker or math fallback
                            if c_id in pnl_map:
                                pnl_val = pnl_map[c_id]["net"]
                            else:
                                mult = 1.0 if ("XAU" in sym_upper or "GOLD" in sym_upper or any(k in sym_upper for k in ["BTC", "ETH", "US30", "US 500", "US500", "JAPAN", "NAS", "GER", "UK", "SPX"])) else 10.0
                                diff = (cur_p - entry_p) if side == "BUY" else (entry_p - cur_p)
                                pnl_val = round((diff / pip_size) * vol * mult, 2)

                            # Resolve PnL in Pips / Points
                            if cur_p and cur_p > 0 and cur_p != entry_p:
                                pnl_pips = round((cur_p - entry_p) / pip_size, 1) if side == "BUY" else round((entry_p - cur_p) / pip_size, 1)
                            else:
                                pnl_pips = 0.0

                            if side == "BUY":
                                sl_pips = round((entry_p - sl_val) / pip_size, 1) if (sl_val and sl_val > 0) else 0.0
                                tp_pips = round((tp_val - entry_p) / pip_size, 1) if (tp_val and tp_val > 0) else 0.0
                            else:
                                sl_pips = round((sl_val - entry_p) / pip_size, 1) if (sl_val and sl_val > 0) else 0.0
                                tp_pips = round((entry_p - tp_val) / pip_size, 1) if (tp_val and tp_val > 0) else 0.0

                            c_sync.execute('''
                                SELECT id FROM positions WHERE ctrader_id = ?
                            ''', (c_id,))
                            row = c_sync.fetchone()
                            if row:
                                c_sync.execute('''
                                    UPDATE positions 
                                    SET volume = ?, entry_price = ?, current_price = ?, pnl = ?, pnl_pips = ?, sl_price = ?, tp_price = ?, sl_pips = ?, tp_pips = ?, reason = ?
                                    WHERE ctrader_id = ?
                                ''', (vol, entry_p, cur_p, pnl_val, pnl_pips, sl_val, tp_val, sl_pips, tp_pips, comment_val, c_id))
                            else:
                                c_sync.execute('''
                                    INSERT INTO positions (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, current_price, pnl, pnl_pips, sl_price, tp_price, sl_pips, tp_pips, reason, entry_time)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (c_id, target_id, comment_val, sym_name, side, vol, entry_p, cur_p, pnl_val, pnl_pips, sl_val, tp_val, sl_pips, tp_pips, comment_val, open_time_iso))

                        conn_sync.commit()
                    except Exception as e:
                        log_message("SYSTEM", "WARN", f"Error persisting Cloud Open API positions for {target_id}: {e}")
                    finally:
                        conn_sync.close()

                    # Update in-memory live telemetry accounts
                    latest_accounts[target_id] = {"balance": round(balance, 2), "equity": effective_equity, "timestamp": now_ts}
                    latest_accounts[str(selected_acc_id)] = {"balance": round(balance, 2), "equity": effective_equity, "timestamp": now_ts}
                    latest_accounts[str(trader_id)] = {"balance": round(balance, 2), "equity": effective_equity, "timestamp": now_ts}

                    synced_accounts.append(target_id)

            except Exception as grp_ex:
                log_message("SYSTEM", "WARN", f"Open API group sync error ({client_id[:12]}...): {grp_ex}")
                for tid in group_targets:
                    if tid not in synced_accounts and tid not in unmatched_accounts:
                        unmatched_accounts.append(tid)
            finally:
                if client:
                    try:
                        await client.disconnect()
                    except Exception:
                        pass

        _last_cloud_sync_time = now_ts
        return {
            "status": "success" if not unmatched_accounts else "partial",
            "synced_accounts": synced_accounts,
            "unmatched_accounts": unmatched_accounts,
            "open_positions": total_open_positions
        }
    except Exception as ex:
        log_message("SYSTEM", "WARN", f"Cloud Open API sync error: {ex}")
        return {"status": "error", "message": str(ex), "unmatched_accounts": unmatched_accounts}
    finally:
        _is_cloud_syncing = False

async def sync_active_accounts_telemetry(force: bool = False):
    """
    Unified Telemetry Coordinator:
    1. Primary (Tier 1): Tries cTrader Cloud Open API for all active bot accounts.
    2. Fallback (Tier 2): If Cloud sync fails, throws error, or leaves active accounts un-synced,
       automatically invokes cTrader CLI broker sync as fallback.
    """
    cloud_result = None
    try:
        cloud_result = await sync_ctrader_cloud_telemetry(force=force)
    except Exception as e:
        log_message("SYSTEM", "WARN", f"Cloud Open API sync encountered error, falling back to CLI: {e}")

    needs_cli_fallback = False
    if not cloud_result:
        needs_cli_fallback = True
    elif cloud_result.get("status") in ["error", "unconfigured", "partial"]:
        needs_cli_fallback = True
    elif cloud_result.get("unmatched_accounts"):
        needs_cli_fallback = True

    if needs_cli_fallback:
        await trigger_broker_cli_positions_sync_bg(force=force)

_last_history_sync_time = 0.0
_is_history_syncing = False

async def sync_ctrader_cloud_trade_history(days: int = 30, force: bool = False) -> Dict[str, Any]:
    """
    Synchronizes closed deals (Trade History) from cTrader Cloud Open API for all active bot accounts
    into SQLite 'history' table with idempotency and accurate broker Net PnL.
    """
    global _last_history_sync_time, _is_history_syncing
    now_ts = time.time()
    if not force and (now_ts - _last_history_sync_time < 60.0):
        return {"status": "throttled", "message": "History sync throttled (<60s)"}
    if _is_history_syncing:
        return {"status": "in_progress", "message": "History sync already running"}

    _is_history_syncing = True
    client = None
    synced_deals_count = 0
    updated_deals_count = 0
    synced_accounts = []

    try:
        env_dict, _ = load_ctrader_env()
        client_id = env_dict.get("clientID", "")
        secret = env_dict.get("secret", "")
        access_token = env_dict.get("ACCESS_TOKEN", "")

        if not client_id or not secret or not access_token:
            return {"status": "unconfigured", "message": "Missing cTrader Open API credentials"}

        # Find target accounts that have active bots or are in accounts table
        conn = get_db()
        try:
            c = conn.cursor()
            c.execute('''
                SELECT DISTINCT account_id FROM bot_instances 
                WHERE status IN ('RUNNING', 'STARTING') AND account_id IS NOT NULL AND account_id != ''
            ''')
            active_accs = [str(r["account_id"]).strip() for r in c.fetchall()]
            if not active_accs:
                c.execute("SELECT DISTINCT account_id FROM accounts WHERE account_id IS NOT NULL AND account_id != ''")
                active_accs = [str(r["account_id"]).strip() for r in c.fetchall()]
            
            # Map running bot names by account & symbol for attribution
            c.execute("SELECT account_id, name, symbol FROM bot_instances WHERE account_id IS NOT NULL")
            bot_map = {}
            for r in c.fetchall():
                key = (str(r["account_id"]).strip(), str(r["symbol"] or "").upper().strip())
                bot_map[key] = r["name"]
        finally:
            conn.close()

        if not active_accs:
            cfg_acc = env_dict.get("ACCOUNT_ID", "").strip()
            if cfg_acc:
                active_accs = [cfg_acc]

        if not active_accs:
            return {"status": "no_accounts", "message": "No active accounts to sync"}

        client = CTraderOpenAPIClient(environment="demo", timeout=15.0)
        await client.connect()
        await client.authorize_application(client_id, secret)
        token_accs = await client.get_accounts_by_access_token(access_token)

        acc_map = {}
        for acc in token_accs:
            cid = str(acc.ctidTraderAccountId)
            tlogin = str(getattr(acc, "traderLogin", cid))
            acc_map[cid] = acc
            acc_map[tlogin] = acc

        now_ms = int(now_ts * 1000)
        from_ms = now_ms - (days * 86400 * 1000)
        cached_sym_maps = {}

        for target_id in active_accs:
            matched_acc = acc_map.get(target_id)
            if not matched_acc:
                continue

            selected_acc_id = matched_acc.ctidTraderAccountId
            trader_id = getattr(matched_acc, "traderLogin", selected_acc_id)
            is_live = getattr(matched_acc, "isLive", False)
            req_env = "live" if is_live else "demo"

            if req_env != client.environment:
                await client.disconnect()
                client = CTraderOpenAPIClient(environment=req_env, timeout=15.0)
                await client.connect()
                await client.authorize_application(client_id, secret)

            await client.authorize_account(selected_acc_id, access_token)

            if selected_acc_id not in cached_sym_maps:
                symbols = await client.get_symbols_list(selected_acc_id)
                cached_sym_maps[selected_acc_id] = {s.symbolId: s.symbolName for s in symbols}
            sym_map = cached_sym_maps[selected_acc_id]

            # Fetch deals within time window
            deal_res = await client.get_deal_list(selected_acc_id, from_ms, now_ms, max_rows=200)
            closing_deals = [d for d in deal_res.deal if d.HasField("closePositionDetail")]

            conn_sync = get_db()
            try:
                c_sync = conn_sync.cursor()
                for d in closing_deals:
                    cpd = d.closePositionDetail
                    pos_id = d.positionId
                    sym_name = sym_map.get(d.symbolId, "Unknown")
                    sym_upper = sym_name.upper()

                    # Original position side: tradeSide 1=BUY (closing was BUY -> original was SELL), 2=SELL (closing was SELL -> original was BUY)
                    pos_side = "BUY" if d.tradeSide == 2 else "SELL"
                    vol = normalize_open_api_volume(cpd.closedVolume, sym_name)
                    entry_p = cpd.entryPrice
                    exit_p = d.executionPrice

                    digits = getattr(cpd, "moneyDigits", 2) or 2
                    div = 10.0 ** digits
                    gross_val = cpd.grossProfit / div
                    swap_val = cpd.swap / div
                    comm_val = cpd.commission / div
                    net_pnl = round(gross_val + swap_val + comm_val, 2)

                    if any(k in sym_upper for k in ["BTC", "ETH", "US30", "US 500", "US500", "JAPAN", "NAS", "GER", "UK", "SPX", "WS30", "NDX"]):
                        pip_size = 1.0
                    elif any(k in sym_upper for k in ["JPY", "XAU", "GOLD", "OIL", "WTI"]):
                        pip_size = 0.01
                    else:
                        pip_size = 0.0001

                    diff = (exit_p - entry_p) if pos_side == "BUY" else (entry_p - exit_p)
                    pnl_pips = round(diff / pip_size, 1) if (entry_p and exit_p) else 0.0

                    exit_time_iso = datetime.datetime.fromtimestamp(d.executionTimestamp / 1000.0).isoformat() if d.executionTimestamp > 0 else datetime.datetime.now().isoformat()
                    entry_time_iso = datetime.datetime.fromtimestamp(d.createTimestamp / 1000.0).isoformat() if (getattr(d, "createTimestamp", 0) > 0) else exit_time_iso

                    attributed_bot = bot_map.get((target_id, sym_upper)) or bot_map.get((str(trader_id), sym_upper)) or "cTrader Cloud Trade"

                    # Idempotency check in history table
                    c_sync.execute('''
                        SELECT id FROM history 
                        WHERE ctrader_id = ? AND (account_id = ? OR account_id = ? OR account_id = ?)
                    ''', (pos_id, target_id, str(selected_acc_id), str(trader_id)))
                    row = c_sync.fetchone()

                    if row:
                        c_sync.execute('''
                            UPDATE history SET
                                exit_price = ?, pnl = ?, pnl_pips = ?, exit_time = ?
                            WHERE id = ?
                        ''', (exit_p, net_pnl, pnl_pips, exit_time_iso, row["id"]))
                        updated_deals_count += 1
                    else:
                        c_sync.execute('''
                            INSERT INTO history (ctrader_id, account_id, bot_id, symbol, side, volume, entry_price, exit_price, pnl, pnl_pips, reason, entry_time, exit_time)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (pos_id, target_id, attributed_bot, sym_name, pos_side, vol, entry_p, exit_p, net_pnl, pnl_pips, "Cloud Closed Deal", entry_time_iso, exit_time_iso))
                        synced_deals_count += 1

                conn_sync.commit()
            except Exception as dbe:
                log_message("SYSTEM", "WARN", f"Error persisting deals for {target_id}: {dbe}")
            finally:
                conn_sync.close()

            synced_accounts.append(target_id)

        _last_history_sync_time = now_ts
        log_message("SYSTEM", "INFO", f"Cloud Trade History Sync: {synced_deals_count} new, {updated_deals_count} updated across accounts {synced_accounts}")
        return {
            "status": "success",
            "synced_accounts": synced_accounts,
            "new_deals": synced_deals_count,
            "updated_deals": updated_deals_count,
            "message": f"Đã đồng bộ {synced_deals_count} lệnh mới và cập nhật {updated_deals_count} lệnh từ cTrader Cloud Open API."
        }
    except Exception as ex:
        log_message("SYSTEM", "WARN", f"Cloud Trade History Sync error: {ex}")
        return {"status": "error", "message": str(ex)}
    finally:
        if client:
            try:
                await client.disconnect()
            except Exception:
                pass
        _is_history_syncing = False

@app.post("/api/ctrader/sync")
async def trigger_ctrader_sync(request: Request):
    """Manual sync endpoint to pull latest balance and positions (Cloud Open API with CLI fallback)."""
    require_admin(request)
    await sync_active_accounts_telemetry(force=True)
    return {"status": "success", "message": "Triggered cloud and broker synchronization."}

@app.post("/api/history/sync")
async def trigger_history_sync(request: Request, days: int = 30):
    """Manual sync endpoint to pull closed trade history deals from cTrader Cloud Open API."""
    require_admin(request)
    res = await sync_ctrader_cloud_trade_history(days=days, force=True)
    return res

@app.post("/api/tick")
async def handle_tick_telemetry(data: TickTelemetry):
    global latest_prices, latest_accounts, _last_db_tick_sync
    now_iso = datetime.datetime.now().isoformat()
    now_ts = time.time()
    
    # 1. Ultra-fast in-memory updates (0.001ms, zero lock, zero disk write)
    latest_prices[data.symbol] = {
        "bid": data.bid,
        "ask": data.ask,
        "time": now_iso
    }
    
    if data.account_number:
        latest_accounts[str(data.account_number)] = {
            "equity": data.equity,
            "balance": data.balance,
            "last_updated": now_iso,
            "source": "cBot Realtime"
        }
    
    # 2. Throttled SQLite persistence (every 10s max across all ticks to prevent DB lock starvation)
    if now_ts - _last_db_tick_sync > 10.0:
        _last_db_tick_sync = now_ts
        conn = None
        try:
            conn = get_db()
            c = conn.cursor()
            if data.account_number and data.equity is not None:
                c.execute('''
                    UPDATE accounts SET equity = ?, balance = ?, last_updated = ?
                    WHERE account_id = ?
                ''', (data.equity, data.balance, now_iso, str(data.account_number)))
            conn.commit()
        except Exception:
            pass
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
                    
    return {"status": "ok"}

# --- Active Positions Management APIs ---

@app.get("/api/positions")
async def get_active_positions(request: Request):
    get_current_user(request)
    
    # Primary Telemetry Sync (Cloud Open API with automatic CLI fallback) if cache is older than 15s
    if time.time() - _last_cloud_sync_time > 15.0:
        asyncio.create_task(sync_active_accounts_telemetry(force=False))

    conn = get_db()
    try:
        c = conn.cursor()
        c.execute('''
            SELECT 
                p.*,
                COALESCE(a.account_label, 'Account #' || p.account_id) as account_label,
                COALESCE(a.account_type, 'DEMO') as account_type,
                a.balance as account_balance,
                a.equity as account_equity,
                COALESCE(b.name, p.bot_id) as bot_name,
                b.algo_path
            FROM positions p
            LEFT JOIN accounts a ON p.account_id = a.account_id
            LEFT JOIN bot_instances b ON (p.bot_id = b.name OR p.bot_id = ('BOT_' || b.id) OR p.bot_id = ('Bot ' || b.id))
            WHERE p.account_id IN (
                SELECT DISTINCT account_id FROM bot_instances
                WHERE status IN ('RUNNING', 'STARTING') AND account_id IS NOT NULL AND account_id != ''
            )
            ORDER BY p.id DESC
        ''')
        rows = c.fetchall()
    finally:
        conn.close()

    positions_list = []
    for r in rows:
        pos_dict = dict(r)
        sym = pos_dict.get("symbol", "XAUUSD")
        # If live quotes exist in latest_prices, dynamically refresh current_price & pnl_pips
        if sym in latest_prices:
            price_info = latest_prices[sym]
            is_buy = pos_dict.get("side", "").upper() == "BUY"
            cur_p = price_info.get("bid") if is_buy else price_info.get("ask")
            if cur_p and cur_p > 0:
                sym_upper = sym.upper()
                if any(k in sym_upper for k in ["BTC", "ETH", "US30", "US 500", "US500", "JAPAN", "NAS", "GER", "UK", "SPX", "WS30", "NDX"]):
                    pip_size = 1.0
                    mult = 1.0
                elif any(k in sym_upper for k in ["JPY", "XAU", "GOLD", "OIL", "WTI"]):
                    pip_size = 0.01
                    mult = 1.0 if ("XAU" in sym_upper or "GOLD" in sym_upper) else 10.0
                else:
                    pip_size = 0.0001
                    mult = 10.0
                pnl_pips = round((cur_p - pos_dict["entry_price"]) / pip_size, 1) if is_buy else round((pos_dict["entry_price"] - cur_p) / pip_size, 1)
                pos_dict["current_price"] = cur_p
                pos_dict["pnl_pips"] = pnl_pips
                if pos_dict.get("pnl") is None:
                    pos_dict["pnl"] = round(pnl_pips * pos_dict["volume"] * mult, 2)

        # Fallback current_price if still missing
        if pos_dict.get("current_price") is None or pos_dict.get("current_price") == 0:
            pos_dict["current_price"] = pos_dict.get("entry_price")
        positions_list.append(pos_dict)

    return {"positions": positions_list}

@app.post("/api/positions/{position_id}/close")
async def close_single_position(position_id: int, request: Request):
    require_admin(request)
    import ctrader_reader
    
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM positions WHERE id = ? OR ctrader_id = ?", (position_id, position_id))
        pos = c.fetchone()
    finally:
        conn.close()
    
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
        
    pos_dict = dict(pos)
    target_ctrader_id = pos_dict.get('ctrader_id') or pos_dict['id']
    acc_id = pos_dict.get('account_id') or ''
    
    # Run CLI broker close in thread pool
    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(None, ctrader_reader.close_broker_position, target_ctrader_id, acc_id)
    
    if res.get("status") == "success":
        return {"status": "success", "message": f"Position #{target_ctrader_id} closed on broker successfully."}
    else:
        raise HTTPException(status_code=500, detail=res.get("message", "Failed to close position on broker."))

@app.post("/api/positions/close-all")
async def close_all_positions(request: Request):
    require_admin(request)
    import ctrader_reader
    
    # Run CLI broker close-all in thread pool
    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(None, ctrader_reader.close_all_broker_positions)
    
    if res.get("status") == "success":
        log_message("SYSTEM", "WARN", f"Emergency Close All executed! Closed {res.get('closed_count', 0)} active positions on broker.")
        return {"status": "success", "closed_count": res.get("closed_count", 0), "message": f"Successfully closed {res.get('closed_count', 0)} positions on broker."}
    else:
        raise HTTPException(status_code=500, detail=res.get("message", "Failed to close all positions."))

@app.post("/api/positions/sync-cli")
async def sync_positions_via_cli(request: Request):
    require_admin(request)
    import ctrader_reader
    # Run sync in thread pool to avoid blocking async event loop
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, ctrader_reader.sync_ctrader_broker_positions)
    return result

@app.get("/api/bots/{bot_id}/logs")
async def get_bot_logs(bot_id: int, request: Request):
    get_current_user(request)
    log_path = os.path.join(os.path.dirname(__file__), "logs", f"bot_{bot_id}.log")
    if not os.path.exists(log_path):
        return {"logs": "Log file not found."}
    
    try:
        # Read the last 200 lines to avoid massive payloads
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            
        filtered_lines = []
        skip = False
        for line in lines:
            if "Commands:" in line:
                skip = True
            if skip and "> " in line:
                skip = False
                continue
            if not skip:
                filtered_lines.append(line)

        last_lines = filtered_lines[-100:]
        
        # Add a helpful system message at the end
        if len(last_lines) > 0 and "Instance" in "".join(last_lines):
            last_lines.append("\n[System Note]: The native C# Print() logs are buffered by the cTrader CLI engine in the background and cannot be extracted directly to this terminal. Please check the 'System Logs' tab to monitor this bot's AI reasoning, decisions, and trade execution events in real-time!\n")

        return {"logs": "".join(last_lines)}
    except Exception as e:
        return {"logs": f"Error reading log file: {e}"}

class AgentConfigUpdate(BaseModel):
    active_provider: str
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    deepseek_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    qwen_api_key: Optional[str] = None
    qwen_model: Optional[str] = None
    qwen_endpoint: Optional[str] = None
    headless_mode: Optional[bool] = None
    refresh_interval_mins: Optional[int] = 15
    refresh_requests_count: Optional[int] = 20
    hard_restart_interval_mins: Optional[int] = 60
    hard_restart_requests_count: Optional[int] = 100

class TestConnectionRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    model: Optional[str] = None
    endpoint: Optional[str] = None

def get_api_key_env_path() -> str:
    repo_root_candidate = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(repo_root_candidate, "API_key.env")

def sync_api_keys_to_env_file(g_key: str, ds_key: str, oa_key: str, qw_key: str, qw_end: str):
    """
    Synchronizes AI API keys from Web Dashboard into API_key.env and os.environ in real-time.
    """
    env_path = get_api_key_env_path()
    existing_lines = []
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                existing_lines = f.readlines()
        except Exception:
            existing_lines = []

    key_updates = {
        "QWEN_API_KEY": qw_key,
        "OPENROUTER_API_KEY": qw_key if ("openrouter" in (qw_end or "").lower() or (qw_key and qw_key.startswith("sk-or-"))) else "",
        "DEEPSEEK_API_KEY": ds_key,
        "GEMINI_API_KEY": g_key,
        "OPENAI_API_KEY": oa_key,
        "QWEN_ENDPOINT": qw_end
    }

    updated_keys = set()
    new_lines = []
    for line in existing_lines:
        trimmed = line.strip()
        if trimmed and not trimmed.startswith("#") and "=" in trimmed:
            k, _ = trimmed.split("=", 1)
            k_clean = k.strip().upper()
            if k_clean in key_updates:
                val = key_updates[k_clean]
                if val:
                    new_lines.append(f"{k_clean}={val}\n")
                    os.environ[k_clean] = val
                else:
                    new_lines.append(line)
                updated_keys.add(k_clean)
                continue
        new_lines.append(line)

    for k, val in key_updates.items():
        if k not in updated_keys and val:
            new_lines.append(f"{k}={val}\n")
            os.environ[k] = val

    try:
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        log_message("SYSTEM", "INFO", f"Synced AI API Keys to {env_path} successfully.")
    except Exception as ex:
        log_message("SYSTEM", "ERROR", f"Failed to write API_key.env: {ex}")

@app.get("/api/agent/config")
async def get_agent_config_endpoint(request: Request):
    get_current_user(request)
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM ai_providers_config WHERE id = 1")
        row = c.fetchone()
    finally:
        conn.close()
    
    env_path = get_api_key_env_path()
    env_exists = os.path.exists(env_path)

    if not row:
        return {
            "active_provider": "qwen_api",
            "gemini_api_key_masked": "",
            "gemini_has_key": False,
            "gemini_model": "gemini-1.5-flash",
            "deepseek_api_key_masked": "",
            "deepseek_has_key": False,
            "deepseek_model": "deepseek-chat",
            "openai_api_key_masked": "",
            "openai_has_key": False,
            "openai_model": "gpt-4o-mini",
            "qwen_api_key_masked": "",
            "qwen_has_key": False,
            "qwen_model": "qwen3.7-flash",
            "qwen_endpoint": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            "headless_mode": True,
            "refresh_interval_mins": 15,
            "refresh_requests_count": 20,
            "hard_restart_interval_mins": 60,
            "hard_restart_requests_count": 100,
            "env_file_path": env_path,
            "env_file_exists": env_exists
        }
    data = dict(row)
    
    def mask_k(k):
        if not k: return ""
        return (k[:4] + "..." + k[-4:]) if len(k) > 8 else "********"
        
    return {
        "active_provider": data.get("active_provider", "qwen_api"),
        "gemini_api_key_masked": mask_k(data.get("gemini_api_key", "")),
        "gemini_has_key": bool(data.get("gemini_api_key")),
        "gemini_model": data.get("gemini_model", "gemini-1.5-flash"),
        "deepseek_api_key_masked": mask_k(data.get("deepseek_api_key", "")),
        "deepseek_has_key": bool(data.get("deepseek_api_key")),
        "deepseek_model": data.get("deepseek_model", "deepseek-chat"),
        "openai_api_key_masked": mask_k(data.get("openai_api_key", "")),
        "openai_has_key": bool(data.get("openai_api_key")),
        "openai_model": data.get("openai_model", "gpt-4o-mini"),
        "qwen_api_key_masked": mask_k(data.get("qwen_api_key", "")),
        "qwen_has_key": bool(data.get("qwen_api_key")),
        "qwen_model": data.get("qwen_model", "qwen3.7-flash"),
        "qwen_endpoint": data.get("qwen_endpoint", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
        "headless_mode": bool(data.get("headless_mode", 1)),
        "refresh_interval_mins": data.get("refresh_interval_mins", 15),
        "refresh_requests_count": data.get("refresh_requests_count", 20),
        "hard_restart_interval_mins": data.get("hard_restart_interval_mins", 60),
        "hard_restart_requests_count": data.get("hard_restart_requests_count", 100),
        "env_file_path": env_path,
        "env_file_exists": env_exists
    }

@app.post("/api/agent/config")
async def update_agent_config_endpoint(req: AgentConfigUpdate, request: Request):
    require_admin(request)
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM ai_providers_config WHERE id = 1")
        existing_row = c.fetchone()
        existing = dict(existing_row) if existing_row else {}
        
        active_p = req.active_provider or existing.get("active_provider", "qwen_api")
        
        # Only update key if user actually typed a new key (not masked placeholder)
        def clean_key(new_v, old_v):
            if new_v is None: return old_v
            v = new_v.strip()
            if not v or v.startswith("...") or "..." in v or v == "********":
                return old_v
            return v
            
        g_key = clean_key(req.gemini_api_key, existing.get("gemini_api_key", ""))
        g_mod = req.gemini_model or existing.get("gemini_model", "gemini-1.5-flash")
        ds_key = clean_key(req.deepseek_api_key, existing.get("deepseek_api_key", ""))
        ds_mod = req.deepseek_model or existing.get("deepseek_model", "deepseek-chat")
        oa_key = clean_key(req.openai_api_key, existing.get("openai_api_key", ""))
        oa_mod = req.openai_model or existing.get("openai_model", "gpt-4o-mini")
        qw_key = clean_key(req.qwen_api_key, existing.get("qwen_api_key", ""))
        qw_mod = req.qwen_model or existing.get("qwen_model", "qwen3.7-flash")
        qw_end = req.qwen_endpoint or existing.get("qwen_endpoint", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
        now = datetime.datetime.now().isoformat()
        
        c.execute('''
            INSERT INTO ai_providers_config (id, active_provider, gemini_api_key, gemini_model, deepseek_api_key, deepseek_model, openai_api_key, openai_model, qwen_api_key, qwen_model, qwen_endpoint, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                active_provider=excluded.active_provider,
                gemini_api_key=excluded.gemini_api_key,
                gemini_model=excluded.gemini_model,
                deepseek_api_key=excluded.deepseek_api_key,
                deepseek_model=excluded.deepseek_model,
                openai_api_key=excluded.openai_api_key,
                openai_model=excluded.openai_model,
                qwen_api_key=excluded.qwen_api_key,
                qwen_model=excluded.qwen_model,
                qwen_endpoint=excluded.qwen_endpoint,
                updated_at=excluded.updated_at
        ''', (active_p, g_key, g_mod, ds_key, ds_mod, oa_key, oa_mod, qw_key, qw_mod, qw_end, now))
        conn.commit()
    finally:
        conn.close()

    # Automatically synchronize keys to API_key.env file for cBots to read dynamically
    sync_api_keys_to_env_file(g_key, ds_key, oa_key, qw_key, qw_end)

    log_message("SYSTEM", "INFO", f"AI Provider Configuration updated: Active Provider -> [{active_p.upper()}], API_key.env synchronized.")
    return {"status": "success", "message": "Cấu hình AI Provider và file API_key.env đã được đồng bộ thành công."}

@app.post("/api/agent/test-connection")
async def test_agent_connection_endpoint(req: TestConnectionRequest, request: Request):
    require_admin(request)
    # Read configured key if not provided directly
    key = req.api_key or ""
    endpoint = req.endpoint or ""
    if not key or "..." in key or key == "********":
        conn = get_db()
        c = conn.cursor()
        c.execute("SELECT * FROM ai_providers_config WHERE id = 1")
        cfg = c.fetchone()
        conn.close()
        if cfg:
            if req.provider == "gemini_api": key = cfg["gemini_api_key"]
            elif req.provider == "deepseek_api": key = cfg["deepseek_api_key"]
            elif req.provider == "openai_api": key = cfg["openai_api_key"]
            elif req.provider == "qwen_api":
                key = cfg["qwen_api_key"]
                if not endpoint: endpoint = cfg["qwen_endpoint"]
            
    res = await ai_engine.test_ai_provider_connection(req.provider, key, req.model or "", endpoint=endpoint)
    return res

@app.get("/api/agent/status")
async def get_agent_status_endpoint(request: Request):
    get_current_user(request)
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM ai_providers_config WHERE id = 1")
    cfg = c.fetchone()
    conn.close()
    active_p = cfg["active_provider"] if cfg else "qwen_api"
    
    return {
        "active_provider": active_p,
        "status": "online",
        "engine": "REST API (High-Speed)"
    }

# ==========================================
# AI AGENT EVALUATION & BENCHMARK HARNESS
# ==========================================
class StartEvalRequest(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    delay_secs: Optional[float] = 1.0

current_eval_task: Optional[asyncio.Task] = None

@app.post("/api/eval/start")
async def start_ai_eval_endpoint(req: Optional[StartEvalRequest] = None, request: Request = None):
    require_admin(request)
    global current_eval_task
    if current_eval_task and not current_eval_task.done():
        raise HTTPException(status_code=400, detail="Một phiên đánh giá AI Benchmark đang được thực thi. Vui lòng chờ hoàn thành.")

    provider = req.provider if req else None
    model = req.model if req else None
    delay = req.delay_secs if req and req.delay_secs is not None else 1.0

    async def _run_benchmark():
        try:
            await ai_eval_harness.run_ai_benchmark(
                provider_override=provider,
                model_override=model,
                rate_limit_delay_secs=delay
            )
        except Exception as ex:
            log_message("AI_EVAL", "ERROR", f"AI Benchmark execution error: {ex}")

    current_eval_task = asyncio.create_task(_run_benchmark())
    return {"status": "started", "message": "Phiên AI Benchmark đã được khởi chạy ngầm thành công."}

@app.get("/api/eval/status")
async def get_eval_status_endpoint(request: Request):
    get_current_user(request)
    global current_eval_task
    is_running = bool(current_eval_task and not current_eval_task.done())
    runs = database.get_eval_runs(limit=1)
    latest_run = runs[0] if runs else None
    return {
        "is_running": is_running,
        "latest_run": latest_run
    }

@app.get("/api/eval/history")
async def get_eval_history_endpoint(limit: int = 20, request: Request = None):
    get_current_user(request)
    runs = database.get_eval_runs(limit=limit)
    return {"runs": runs}

@app.get("/api/eval/runs/{run_id}")
async def get_eval_run_detail_endpoint(run_id: int, request: Request):
    get_current_user(request)
    detail = database.get_eval_run_detail(run_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên Benchmark này.")
    return detail

# --- AI Strategy Reviewer & Auto-Tuning Models & APIs ---
class GenerateAuditRequest(BaseModel):
    timeframe_days: Optional[int] = 7
    bot_id: Optional[str] = "ALL"
    symbol: Optional[str] = "ALL"

class ApplyAuditRequest(BaseModel):
    target_bot_id: Optional[int] = None

@app.get("/api/audit/summary")
async def get_strategy_audit_summary_endpoint(
    request: Request,
    days: int = 7,
    bot_id: Optional[str] = "ALL",
    symbol: Optional[str] = "ALL"
):
    get_current_user(request)
    summary = ai_strategy_reviewer.fetch_trading_performance_dataset(
        timeframe_days=days,
        bot_id=bot_id,
        symbol=symbol
    )
    return summary

@app.post("/api/audit/generate")
async def generate_strategy_audit_endpoint(
    request: Request,
    req: Optional[GenerateAuditRequest] = None
):
    require_admin(request)
    days = req.timeframe_days if req and req.timeframe_days else 7
    bot_id = req.bot_id if req and req.bot_id else "ALL"
    symbol = req.symbol if req and req.symbol else "ALL"

    try:
        report = await ai_strategy_reviewer.generate_strategy_audit_report(
            timeframe_days=days,
            bot_id=bot_id,
            symbol=symbol
        )
        return report
    except Exception as e:
        log_message("AI_AUDIT", "ERROR", f"Error generating strategy audit: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/audit/history")
async def get_strategy_audits_history_endpoint(request: Request, limit: int = 30):
    get_current_user(request)
    audits = database.get_strategy_audits(limit=limit)
    return {"audits": audits}

@app.get("/api/audit/{audit_id}")
async def get_strategy_audit_detail_endpoint(audit_id: int, request: Request):
    get_current_user(request)
    audit = database.get_strategy_audit_by_id(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy bản đánh giá #{audit_id}")
    return audit

@app.post("/api/audit/{audit_id}/apply")
async def apply_strategy_audit_params_endpoint(
    audit_id: int,
    request: Request,
    req: Optional[ApplyAuditRequest] = None
):
    require_admin(request)
    target_bot_id = req.target_bot_id if req else None
    res = ai_strategy_reviewer.apply_audit_recommendations(audit_id, target_bot_id)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

@app.post("/api/audit/{audit_id}/telegram")
async def send_strategy_audit_telegram_endpoint(audit_id: int, request: Request):
    require_admin(request)
    res = await ai_strategy_reviewer.send_telegram_strategy_audit(audit_id)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

# --- Bot Fleet Performance Leaderboard APIs ---
@app.get("/api/leaderboard")
async def get_bot_leaderboard_endpoint(request: Request, force: bool = False):
    get_current_user(request)
    return bot_leaderboard.get_or_compute_leaderboard(force_refresh=force)

@app.post("/api/leaderboard/refresh")
async def refresh_bot_leaderboard_endpoint(request: Request):
    require_admin(request)
    return bot_leaderboard.get_or_compute_leaderboard(force_refresh=True)

@app.get("/api/history")
async def get_trade_history(
    request: Request,
    bot_id: Optional[str] = None,
    symbol: Optional[str] = None,
    account_id: Optional[str] = None,
    days: Optional[int] = None,
    outcome: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "id",
    order: str = "desc",
    limit: int = 200,
    offset: int = 0
):
    get_current_user(request)

    # Non-blocking background sync of closed deals from Cloud Open API if older than 60s
    if time.time() - _last_history_sync_time > 60.0:
        asyncio.create_task(sync_ctrader_cloud_trade_history(days=30, force=False))

    conn = get_db()
    c = conn.cursor()
    
    query = "SELECT * FROM history WHERE 1=1"
    params = []
    
    if bot_id and bot_id != "ALL":
        query += " AND bot_id = ?"
        params.append(bot_id)
        
    if symbol and symbol != "ALL":
        query += " AND symbol = ?"
        params.append(symbol)

    if account_id and account_id != "ALL":
        query += " AND account_id = ?"
        params.append(account_id)
        
    if outcome == "WIN":
        query += " AND pnl > 0"
    elif outcome == "LOSS":
        query += " AND pnl < 0"
        
    if days and days > 0:
        cutoff = (datetime.datetime.now() - datetime.timedelta(days=days)).isoformat()
        query += " AND exit_time >= ?"
        params.append(cutoff)
        
    if search and search.strip():
        term = f"%{search.strip()}%"
        query += " AND (symbol LIKE ? OR reason LIKE ? OR CAST(ctrader_id AS TEXT) LIKE ? OR bot_id LIKE ? OR account_id LIKE ?)"
        params.extend([term, term, term, term, term])

    # Whitelist sorting columns to prevent SQL injection
    valid_sort_cols = {
        "id": "id",
        "ctrader_id": "ctrader_id",
        "symbol": "symbol",
        "account_id": "account_id",
        "bot_id": "bot_id",
        "side": "side",
        "volume": "volume",
        "pnl": "pnl",
        "pnl_pips": "pnl_pips",
        "entry_price": "entry_price",
        "exit_price": "exit_price",
        "exit_time": "exit_time"
    }
    col = valid_sort_cols.get(sort_by.lower(), "id")
    sort_direction = "ASC" if order.lower() == "asc" else "DESC"
    query_paged = f"{query} ORDER BY {col} {sort_direction} LIMIT ? OFFSET ?"
    paged_params = list(params)
    paged_params.extend([limit, offset])
    
    c.execute(query_paged, tuple(paged_params))
    rows = [sanitize_trade_history_item(row) for row in c.fetchall()]
    
    # Calculate filtered total count
    count_query = query.replace("SELECT *", "SELECT COUNT(*) as total", 1)
    c.execute(count_query, tuple(params))
    total_count = c.fetchone()["total"]
    
    conn.close()
    return {"trades": rows, "total": total_count}

@app.get("/api/history/stats")
async def get_history_stats(
    request: Request,
    bot_id: Optional[str] = None,
    symbol: Optional[str] = None,
    account_id: Optional[str] = None,
    days: Optional[int] = None
):
    get_current_user(request)
    conn = get_db()
    c = conn.cursor()
    
    query = "SELECT * FROM history WHERE 1=1"
    params = []
    
    if bot_id and bot_id != "ALL":
        query += " AND bot_id = ?"
        params.append(bot_id)
        
    if symbol and symbol != "ALL":
        query += " AND symbol = ?"
        params.append(symbol)

    if account_id and account_id != "ALL":
        query += " AND account_id = ?"
        params.append(account_id)
        
    if days and days > 0:
        cutoff = (datetime.datetime.now() - datetime.timedelta(days=days)).isoformat()
        query += " AND exit_time >= ?"
        params.append(cutoff)
        
    c.execute(query, tuple(params))
    trades = [dict(r) for r in c.fetchall()]
    conn.close()
    
    total_trades = len(trades)
    if total_trades == 0:
        return {
            "total_trades": 0,
            "total_wins": 0,
            "total_losses": 0,
            "win_rate": 0.0,
            "net_pnl": 0.0,
            "gross_profit": 0.0,
            "gross_loss": 0.0,
            "profit_factor": 0.0,
            "avg_pnl": 0.0,
            "avg_win": 0.0,
            "avg_loss": 0.0,
            "rr_ratio": 0.0,
            "edge_usd": 0.0,
            "edge_r": 0.0,
            "edge_status": "NEUTRAL",
            "max_win": 0.0,
            "max_loss": 0.0
        }
        
    wins = [float(t["pnl"]) for t in trades if t.get("pnl") is not None and t["pnl"] > 0]
    losses = [float(t["pnl"]) for t in trades if t.get("pnl") is not None and t["pnl"] < 0]
    
    total_wins = len(wins)
    total_losses = len(losses)
    win_rate = round((total_wins / total_trades) * 100, 1) if total_trades > 0 else 0.0
    
    gross_profit = round(sum(wins), 2)
    gross_loss = round(abs(sum(losses)), 2)
    net_pnl = round(gross_profit - gross_loss, 2)
    
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (99.0 if gross_profit > 0 else 0.0)
    avg_pnl = round(net_pnl / total_trades, 2) if total_trades > 0 else 0.0
    
    avg_win = round(gross_profit / total_wins, 2) if total_wins > 0 else 0.0
    avg_loss = round(gross_loss / total_losses, 2) if total_losses > 0 else 0.0
    rr_ratio = round(avg_win / avg_loss, 2) if avg_loss > 0 else (99.0 if avg_win > 0 else 0.0)
    
    prob_win = total_wins / total_trades if total_trades > 0 else 0.0
    prob_loss = total_losses / total_trades if total_trades > 0 else 0.0
    edge_usd = round((prob_win * avg_win) - (prob_loss * avg_loss), 2)
    edge_r = round((prob_win * rr_ratio) - prob_loss, 2) if rr_ratio > 0 else round(-prob_loss, 2)

    if edge_usd > 0.0:
        edge_status = "POSITIVE"
    elif edge_usd < 0.0:
        edge_status = "NEGATIVE"
    else:
        edge_status = "NEUTRAL"

    max_win = max(wins) if wins else 0.0
    max_loss = min(losses) if losses else 0.0
    
    return {
        "total_trades": total_trades,
        "total_wins": total_wins,
        "total_losses": total_losses,
        "win_rate": win_rate,
        "net_pnl": net_pnl,
        "gross_profit": gross_profit,
        "gross_loss": gross_loss,
        "profit_factor": profit_factor,
        "avg_pnl": avg_pnl,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "rr_ratio": rr_ratio,
        "edge_usd": edge_usd,
        "edge_r": edge_r,
        "edge_status": edge_status,
        "max_win": round(max_win, 2),
        "max_loss": round(max_loss, 2)
    }

@app.get("/api/history/grouped-stats")
async def get_history_grouped_stats(
    request: Request,
    bot_id: Optional[str] = None,
    symbol: Optional[str] = None,
    account_id: Optional[str] = None,
    days: Optional[int] = None,
    sort_by: str = "edge_usd",
    order: str = "desc"
):
    """
    Computes multi-dimensional quantitative matrix grouped by (symbol, account_id, bot_id).
    Evaluates Win Rate, Net PnL, Profit Factor, and Mathematical Expectancy (Edge).
    """
    get_current_user(request)
    conn = get_db()
    c = conn.cursor()

    query = "SELECT * FROM history WHERE pnl IS NOT NULL"
    params = []

    if bot_id and bot_id != "ALL":
        query += " AND bot_id = ?"
        params.append(bot_id)

    if symbol and symbol != "ALL":
        query += " AND symbol = ?"
        params.append(symbol)

    if account_id and account_id != "ALL":
        query += " AND account_id = ?"
        params.append(account_id)

    if days and days > 0:
        cutoff = (datetime.datetime.now() - datetime.timedelta(days=days)).isoformat()
        query += " AND exit_time >= ?"
        params.append(cutoff)

    c.execute(query, tuple(params))
    rows = c.fetchall()
    conn.close()

    # Group trades by (symbol, account_id, bot_id)
    from collections import defaultdict
    groups = defaultdict(list)
    for r in rows:
        sym = r["symbol"] or "UNKNOWN"
        acc = str(r["account_id"] or "N/A")
        bot = r["bot_id"] or "Manual"
        groups[(sym, acc, bot)].append(dict(r))

    group_results = []
    for (sym, acc, bot), trades in groups.items():
        total_trades = len(trades)
        wins = [float(t["pnl"]) for t in trades if t.get("pnl") is not None and t["pnl"] > 0]
        losses = [float(t["pnl"]) for t in trades if t.get("pnl") is not None and t["pnl"] < 0]

        total_wins = len(wins)
        total_losses = len(losses)
        win_rate = round((total_wins / total_trades) * 100, 1) if total_trades > 0 else 0.0

        gross_profit = round(sum(wins), 2)
        gross_loss = round(abs(sum(losses)), 2)
        net_pnl = round(gross_profit - gross_loss, 2)

        profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (99.0 if gross_profit > 0 else 0.0)
        avg_pnl = round(net_pnl / total_trades, 2) if total_trades > 0 else 0.0

        avg_win = round(gross_profit / total_wins, 2) if total_wins > 0 else 0.0
        avg_loss = round(gross_loss / total_losses, 2) if total_losses > 0 else 0.0
        rr_ratio = round(avg_win / avg_loss, 2) if avg_loss > 0 else (99.0 if avg_win > 0 else 0.0)

        prob_win = total_wins / total_trades if total_trades > 0 else 0.0
        prob_loss = total_losses / total_trades if total_trades > 0 else 0.0
        edge_usd = round((prob_win * avg_win) - (prob_loss * avg_loss), 2)
        edge_r = round((prob_win * rr_ratio) - prob_loss, 2) if rr_ratio > 0 else round(-prob_loss, 2)

        if edge_usd > 0.0:
            edge_status = "POSITIVE"
        elif edge_usd < 0.0:
            edge_status = "NEGATIVE"
        else:
            edge_status = "NEUTRAL"

        total_pnl_pips = round(sum(float(t.get("pnl_pips") or 0.0) for t in trades), 1)

        group_results.append({
            "symbol": sym,
            "account_id": acc,
            "bot_id": bot,
            "total_trades": total_trades,
            "total_wins": total_wins,
            "total_losses": total_losses,
            "win_rate": win_rate,
            "net_pnl": net_pnl,
            "total_pnl_pips": total_pnl_pips,
            "gross_profit": gross_profit,
            "gross_loss": gross_loss,
            "profit_factor": profit_factor,
            "avg_pnl": avg_pnl,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "rr_ratio": rr_ratio,
            "edge_usd": edge_usd,
            "edge_r": edge_r,
            "edge_status": edge_status
        })

    # Sort groups
    reverse = (order.lower() != "asc")
    sort_key = sort_by.lower()
    if sort_key in ("symbol", "account_id", "bot_id"):
        group_results.sort(key=lambda x: str(x.get(sort_key, "")).lower(), reverse=reverse)
    elif group_results and sort_key in group_results[0]:
        group_results.sort(key=lambda x: x.get(sort_key, 0.0), reverse=reverse)
    else:
        group_results.sort(key=lambda x: x.get("edge_usd", 0.0), reverse=reverse)

    return {"groups": group_results, "total_groups": len(group_results)}

@app.post("/api/history/clear")
async def clear_history_endpoint(request: Request):
    require_admin(request)
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM history")
    conn.commit()
    conn.close()
    log_message("SYSTEM", "INFO", "Trade history records cleared by user.")
    return {"status": "success", "message": "Trade history cleared successfully."}

@app.get("/api/logs")
async def get_logs_endpoint(
    request: Request,
    limit: int = 300,
    bot_id: Optional[str] = None,
    level: Optional[str] = None
):
    get_current_user(request)
    conn = get_db()
    try:
        c = conn.cursor()
        query = "SELECT * FROM (SELECT * FROM logs WHERE 1=1"
        params = []
        if bot_id and bot_id != "ALL":
            query += " AND bot_id = ?"
            params.append(bot_id)
        if level and level != "ALL":
            query += " AND level = ?"
            params.append(level)
        query += " ORDER BY id DESC LIMIT ?) ORDER BY id ASC"
        params.append(limit)
        
        c.execute(query, tuple(params))
        rows = c.fetchall()
        return [sanitize_log_item(r) for r in rows]
    finally:
        conn.close()

@app.delete("/api/logs")
@app.post("/api/logs/clear")
async def clear_logs_endpoint(request: Request):
    require_admin(request)
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute("DELETE FROM logs")
        conn.commit()
        log_message("SYSTEM", "INFO", "System logs cleared by user.")
        return {"status": "success", "message": "Logs cleared successfully."}
    finally:
        conn.close()

# --- WebSocket Logs Streaming ---

@app.websocket("/")
async def websocket_root_fallback(websocket: WebSocket):
    """Root fallback WebSocket handler to prevent 403 Forbidden on root connections."""
    await websocket_logs(websocket)

@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    conn = get_db()
    c = conn.cursor()
    try:
        # Get last log ID to start tailing
        c.execute("SELECT MAX(id) as max_id FROM logs")
        row = c.fetchone()
        last_id = row['max_id'] if row and row['max_id'] else 0
        
        while True:
            await asyncio.sleep(1) # Poll every 1 second
            
            c.execute("SELECT * FROM logs WHERE id > ? ORDER BY id ASC", (last_id,))
            new_logs = c.fetchall()
            conn.commit() # End implicit transaction to release read locks
            
            for log_row in new_logs:
                log_dict = dict(log_row)
                await websocket.send_json(log_dict)
                last_id = log_dict['id']
                
    except WebSocketDisconnect:
        print("Client disconnected from /ws/logs")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        conn.close()

@app.websocket("/ws/logs/bot/{bot_id}")
async def websocket_bot_logs(websocket: WebSocket, bot_id: int):
    await websocket.accept()
    log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "logs"))
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"bot_{bot_id}.log")
    
    if not os.path.exists(log_path):
        try:
            with open(log_path, "w", encoding="utf-8") as f:
                f.write(f"--- Log stream started for Bot #{bot_id} at {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\nWaiting for bot process output...\n")
        except Exception as e:
            await websocket.send_text(f"[Log Init] Initializing log stream for Bot #{bot_id}...")

    try:
        # Send initial last 100 lines
        if os.path.exists(log_path):
            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
                for line in lines[-100:]:
                    await websocket.send_text(line.rstrip("\r\n"))
        
        # Tail the file continuously
        if os.path.exists(log_path):
            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(0, 2) # go to end
                while True:
                    line = f.readline()
                    if not line:
                        await asyncio.sleep(0.5)
                        continue
                    await websocket.send_text(line.rstrip("\r\n"))
        else:
            while True:
                await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Bot WebSocket error: {e}")

# --- Network Latency & Connectivity Diagnostics Endpoint ---
@app.get("/api/ping")
async def ping_endpoint():
    return {
        "status": "pong",
        "server_time_ms": int(time.time() * 1000)
    }

# Mount Frontend Dist if available (Single-Port Web + API Production Mode)
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("trade") or full_path.startswith("portfolio") or full_path.startswith("auth") or full_path.startswith("ws/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
        return {"message": "Frontend build not found"}

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8181))
    uvicorn.run(app, host=host, port=port)



