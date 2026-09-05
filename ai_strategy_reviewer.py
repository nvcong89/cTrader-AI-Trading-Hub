"""
AI Quantitative Strategy Reviewer & Continuous Auto-Tuning Engine
==================================================================
Analyzes historical trading executions, active positions, and AI decision reasoning logs
at End-of-Day (EOD) or End-of-Week (EOW) intervals to generate actionable strategy audits,
risk diagnostics, and parameter fine-tuning recommendations.
"""

import os
import json
import re
import time
import datetime
from typing import Dict, Any, List, Optional, Tuple
import sqlite3
import httpx

import database
from database import (
    get_db,
    log_message,
    create_strategy_audit,
    get_strategy_audits,
    get_strategy_audit_by_id,
    update_strategy_audit_applied
)
import ai_engine

def load_telegram_config() -> Tuple[str, str]:
    """Loads Telegram credentials from environment or config files."""
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or ""
    base_dir = os.path.dirname(__file__)
    for filename in ["telegram.env", "telegrame.env", ".env"]:
        env_file = os.path.join(base_dir, filename)
        if os.path.exists(env_file):
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip()
                            if k in ["bot_token", "TELEGRAM_BOT_TOKEN", "BOT_TOKEN"] and not bot_token:
                                bot_token = v
                            elif k in ["groupID", "group_id", "TELEGRAM_CHAT_ID", "CHAT_ID", "telegramChatId"] and not chat_id:
                                chat_id = v
            except Exception:
                pass
            if bot_token and chat_id:
                break
    return bot_token, chat_id

def fetch_trading_performance_dataset(timeframe_days: int = 7, bot_id: Optional[str] = None, symbol: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts and computes quantitative metrics from history, positions, and AI logs.
    """
    conn = get_db()
    c = conn.cursor()

    cutoff_date = (datetime.datetime.now() - datetime.timedelta(days=timeframe_days)).isoformat()

    query_hist = "SELECT * FROM history WHERE (exit_time >= ? OR entry_time >= ?)"
    params: List[Any] = [cutoff_date, cutoff_date]

    if bot_id and bot_id != "ALL":
        query_hist += " AND (bot_id = ? OR ctrader_id IN (SELECT ctrader_id FROM positions WHERE bot_id = ?))"
        params.extend([bot_id, bot_id])

    if symbol and symbol != "ALL":
        query_hist += " AND symbol = ?"
        params.append(symbol)

    query_hist += " ORDER BY id DESC"
    c.execute(query_hist, params)
    raw_history = [dict(r) for r in c.fetchall()]

    # Fetch active open positions
    query_pos = "SELECT * FROM positions WHERE 1=1"
    pos_params: List[Any] = []
    if bot_id and bot_id != "ALL":
        query_pos += " AND bot_id = ?"
        pos_params.append(bot_id)
    if symbol and symbol != "ALL":
        query_pos += " AND symbol = ?"
        pos_params.append(symbol)
    c.execute(query_pos, pos_params)
    active_positions = [dict(r) for r in c.fetchall()]

    # Fetch recent AI reasoning logs
    query_logs = "SELECT * FROM logs WHERE (level = 'GEMINI_REASONING' OR level = 'AI_DECISION' OR level = 'TRADE') AND timestamp >= ?"
    log_params: List[Any] = [cutoff_date]
    if bot_id and bot_id != "ALL":
        query_logs += " AND bot_id = ?"
        log_params.append(bot_id)
    query_logs += " ORDER BY id DESC LIMIT 40"
    c.execute(query_logs, log_params)
    ai_logs = [dict(r) for r in c.fetchall()]

    # Fetch configured bot instances
    c.execute("SELECT id, name, symbol, timeframe, custom_params, status FROM bot_instances")
    bots = [dict(r) for r in c.fetchall()]

    conn.close()

    # Calculate Aggregated Statistics
    total_trades = len(raw_history)
    wins = [t for t in raw_history if (t.get('pnl') or 0.0) > 0.0 or (t.get('pnl_pips') or 0.0) > 0.0]
    losses = [t for t in raw_history if (t.get('pnl') or 0.0) < 0.0 or (t.get('pnl_pips') or 0.0) < 0.0]
    breakevens = [t for t in raw_history if (t.get('pnl') or 0.0) == 0.0 and (t.get('pnl_pips') or 0.0) == 0.0]

    total_wins = len(wins)
    total_losses = len(losses)
    win_rate = round((total_wins / total_trades * 100.0), 1) if total_trades > 0 else 0.0

    total_pnl_usd = round(sum(float(t.get('pnl') or 0.0) for t in raw_history), 2)
    total_pnl_pips = round(sum(float(t.get('pnl_pips') or 0.0) for t in raw_history), 1)

    gross_profit = sum(float(t.get('pnl') or 0.0) for t in wins)
    gross_loss = abs(sum(float(t.get('pnl') or 0.0) for t in losses))
    if gross_loss > 0:
        profit_factor = round(gross_profit / gross_loss, 2)
    elif gross_profit > 0:
        profit_factor = round(gross_profit, 2)
    else:
        profit_factor = 1.0

    # Symbol breakdown
    symbol_breakdown: Dict[str, Dict[str, Any]] = {}
    for t in raw_history:
        sym = t.get('symbol') or 'UNKNOWN'
        if sym not in symbol_breakdown:
            symbol_breakdown[sym] = {"trades": 0, "wins": 0, "losses": 0, "pnl_usd": 0.0, "pnl_pips": 0.0}
        symbol_breakdown[sym]["trades"] += 1
        pnl = float(t.get('pnl') or 0.0)
        pnl_pips = float(t.get('pnl_pips') or 0.0)
        symbol_breakdown[sym]["pnl_usd"] = round(symbol_breakdown[sym]["pnl_usd"] + pnl, 2)
        symbol_breakdown[sym]["pnl_pips"] = round(symbol_breakdown[sym]["pnl_pips"] + pnl_pips, 1)
        if pnl > 0 or pnl_pips > 0:
            symbol_breakdown[sym]["wins"] += 1
        elif pnl < 0 or pnl_pips < 0:
            symbol_breakdown[sym]["losses"] += 1

    for sym, st in symbol_breakdown.items():
        st["win_rate"] = round((st["wins"] / st["trades"] * 100.0), 1) if st["trades"] > 0 else 0.0

    # Best & Worst Trades
    sorted_by_pips = sorted(raw_history, key=lambda x: float(x.get('pnl_pips') or x.get('pnl') or 0.0), reverse=True)
    best_trades = sorted_by_pips[:3] if len(sorted_by_pips) >= 3 else sorted_by_pips
    worst_trades = sorted_by_pips[-3:] if len(sorted_by_pips) >= 3 else []
    worst_trades = [t for t in worst_trades if float(t.get('pnl_pips') or t.get('pnl') or 0.0) < 0.0]

    return {
        "timeframe_days": timeframe_days,
        "bot_filter": bot_id or "ALL",
        "symbol_filter": symbol or "ALL",
        "total_trades": total_trades,
        "total_wins": total_wins,
        "total_losses": total_losses,
        "total_breakeven": len(breakevens),
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "total_pnl_usd": total_pnl_usd,
        "total_pnl_pips": total_pnl_pips,
        "active_positions_count": len(active_positions),
        "active_positions": active_positions[:5],
        "symbol_breakdown": symbol_breakdown,
        "best_trades": best_trades,
        "worst_trades": worst_trades,
        "recent_logs_sample": [l.get("message", "") for l in ai_logs[:15]],
        "configured_bots": bots
    }

async def generate_strategy_audit_report(timeframe_days: int = 7, bot_id: Optional[str] = None, symbol: Optional[str] = None) -> Dict[str, Any]:
    """
    Generates a full AI Strategy Audit Report by feeding actual trade telemetry to the configured LLM.
    """
    dataset = fetch_trading_performance_dataset(timeframe_days, bot_id, symbol)

    # Fetch AI provider config
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM ai_providers_config WHERE id = 1")
    raw_cfg = c.fetchone()
    conn.close()

    ai_config = dict(raw_cfg) if raw_cfg else {"active_provider": "qwen_api", "qwen_model": "qwen3.7-flash"}
    provider = ai_config.get("active_provider", "qwen_api")
    model_name = ai_config.get(f"{provider.split('_')[0]}_model", "default-model")

    system_prompt = (
        "Bạn là Trưởng Ban Phân Tích & Quản Lý Rủi Ro Định Lượng (Chief Quantitative Risk & Algorithmic Trading Strategist) "
        "cho hệ thống cTrader AI Trading Hub. Bạn có nhiệm vụ đánh giá chuyên sâu nhật ký giao dịch, hiệu suất thực tế, "
        "phân tích nguyên nhân lệnh thắng/thua và đề xuất bộ tham số tối ưu (Stop Loss, Take Profit, DCA Spacing, Session Filter) "
        "để bot cải thiện lợi nhuận và hạn chế tối đa Drawdown cho tuần giao dịch tiếp theo.\n\n"
        "BẮT BUỘC TRẢ VỀ THEO CẤU TRÚC 2 PHẦN:\n"
        "PHẦN 1: BÁO CÁO ĐÁNH GIÁ CHI TIẾT (MARKDOWN) ĐẦY ĐỦ CÁC MỤC:\n"
        "  1. 📊 Tổng Quan Hiệu Suất & Chấm Điểm Chiến Lược (Score: 1-100)\n"
        "  2. 🏆 Phân Tích Các Setup Thắng Lớn (Mẫu hình & Phiên giao dịch hiệu quả)\n"
        "  3. ⚠️ Giải Phẫu Các Lệnh Thua Lỗ Nặng (Nguyên nhân: Breakout giả, biến động tin tức, SL quá hẹp, hay DCA ngược sóng)\n"
        "  4. 🔍 Đánh Giá Theo Từng Cặp Tiền (Symbol Diagnostic: XAUUSD, Forex, Crypto)\n"
        "  5. 💡 Kế Hoạch Hành Động & Điều Chỉnh Chiến Lược Cho Tuần Tới\n\n"
        "PHẦN 2: KHỐI JSON ĐỀ XUẤT THAM SỐ TỐI ƯU CỤ THỂ (Đặt trong ```json ... ```):\n"
        "{\n"
        "  \"recommended_sl_pips\": 35.0,\n"
        "  \"recommended_tp_pips\": 75.0,\n"
        "  \"recommended_dca_spacing_pips\": 30.0,\n"
        "  \"recommended_adx_threshold\": 25.0,\n"
        "  \"recommended_risk_percent\": 1.5,\n"
        "  \"recommended_confidence_gate\": 75.0,\n"
        "  \"avoid_sessions\": [\"Late NY Close\", \"Pre-News FOMC\"],\n"
        "  \"summary_recommendation\": \"Tăng khoảng cách SL lên 35 pips để tránh quét râu nến phiên Á, nới rộng DCA step.\"\n"
        "}"
    )

    user_prompt = (
        f"Dưới đây là Báo Cáo Dữ Liệu Giao Dịch Thực Tế Trong {timeframe_days} Ngày Qua "
        f"(Bộ Lọc: Bot={bot_id or 'ALL'}, Symbol={symbol or 'ALL'}):\n\n"
        f"--- METRICS TỔNG QUAN ---\n"
        f"- Tổng số lệnh đã đóng: {dataset['total_trades']}\n"
        f"- Số lệnh Thắng (Wins): {dataset['total_wins']} | Số lệnh Thua (Losses): {dataset['total_losses']} | Hòa vốn: {dataset['total_breakeven']}\n"
        f"- Tỷ lệ Thắng (Win Rate): {dataset['win_rate']}%\n"
        f"- Hệ số Lợi Nhuận (Profit Factor): {dataset['profit_factor']}\n"
        f"- Tổng PnL: ${dataset['total_pnl_usd']} USD ({dataset['total_pnl_pips']} pips)\n"
        f"- Vị thế đang mở hiện tại: {dataset['active_positions_count']} lệnh\n\n"
        f"--- CHI TIẾT THEO SYMBOL ---\n"
        f"{json.dumps(dataset['symbol_breakdown'], indent=2, ensure_ascii=False)}\n\n"
        f"--- TOP 3 LỆNH THẮNG LỚN NHẤT ---\n"
        f"{json.dumps(dataset['best_trades'], indent=2, ensure_ascii=False)}\n\n"
        f"--- TOP 3 LỆNH THUA LỖ NẶNG NHẤT ---\n"
        f"{json.dumps(dataset['worst_trades'], indent=2, ensure_ascii=False)}\n\n"
        f"--- MẪU LOG NHẬN ĐỊNH CỦA AI GẦN ĐÂY ---\n"
        f"{json.dumps(dataset['recent_logs_sample'], indent=2, ensure_ascii=False)}\n\n"
        "Hãy phân tích thật sắc bén, trung thực và đề xuất giải pháp tối ưu hóa thông số cụ thể."
    )

    try:
        raw_report, latency_ms = await ai_engine.query_llm_text(ai_config, system_prompt, user_prompt, temperature=0.3)
    except Exception as e:
        log_message("AI_AUDIT", "ERROR", f"Failed to generate strategy audit from LLM: {str(e)}")
        # Fallback local analytical summary if API offline
        raw_report = (
            f"# Báo Cáo Đánh Giá Hiệu Suất Chiến Lược (Offline Analytic Fallback)\n\n"
            f"**Thời gian đánh giá:** {timeframe_days} ngày qua | **Tổng lệnh:** {dataset['total_trades']}\n"
            f"- **Win Rate:** {dataset['win_rate']}%\n"
            f"- **Profit Factor:** {dataset['profit_factor']}\n"
            f"- **Tổng PnL:** ${dataset['total_pnl_usd']} USD ({dataset['total_pnl_pips']} pips)\n\n"
            f"### Ghi chú rủi ro:\n"
            f"*(Không thể kết nối tới AI Provider: {str(e)}. Báo cáo được tạo tự động từ bộ dữ liệu cục bộ SQLite.)*\n\n"
            f"```json\n"
            f"{{\n"
            f"  \"recommended_sl_pips\": 30.0,\n"
            f"  \"recommended_tp_pips\": 60.0,\n"
            f"  \"recommended_dca_spacing_pips\": 25.0,\n"
            f"  \"recommended_adx_threshold\": 22.0,\n"
            f"  \"recommended_risk_percent\": 1.0,\n"
            f"  \"recommended_confidence_gate\": 70.0,\n"
            f"  \"avoid_sessions\": [\"Late NY\"],\n"
            f"  \"summary_recommendation\": \"Duy trì kỷ luật SL/TP cố định, hạn chế nhồi lệnh DCA khi thị trường có tin tức mạnh.\"\n"
            f"}}\n"
            f"```"
        )
        latency_ms = 0.0

    # Extract Recommended Params JSON Block
    recommended_params: Dict[str, Any] = {}
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_report, re.DOTALL)
    if json_match:
        try:
            recommended_params = json.loads(json_match.group(1))
        except Exception:
            pass

    if not recommended_params:
        recommended_params = {
            "recommended_sl_pips": 30.0,
            "recommended_tp_pips": 60.0,
            "recommended_dca_spacing_pips": 25.0,
            "recommended_adx_threshold": 22.0,
            "recommended_risk_percent": 1.0,
            "recommended_confidence_gate": 70.0,
            "avoid_sessions": ["Late NY"],
            "summary_recommendation": "Tối ưu hóa quản lý vốn và khoảng cách Stop Loss."
        }

    # Extract Executive Summary (first 3-4 lines)
    summary_lines = [line.strip() for line in raw_report.split("\n") if line.strip() and not line.startswith("#") and not line.startswith("```")]
    exec_summary = " ".join(summary_lines[:3]) if summary_lines else "Báo cáo đánh giá chiến lược giao dịch hoàn thành."

    # Save to SQLite database
    audit_id = create_strategy_audit(
        timeframe_days=timeframe_days,
        bot_id=bot_id or "ALL",
        symbol=symbol or "ALL",
        total_trades=dataset["total_trades"],
        win_rate=dataset["win_rate"],
        profit_factor=dataset["profit_factor"],
        total_pnl_usd=dataset["total_pnl_usd"],
        total_pnl_pips=dataset["total_pnl_pips"],
        total_wins=dataset["total_wins"],
        total_losses=dataset["total_losses"],
        provider=provider,
        model=model_name,
        executive_summary=exec_summary[:500],
        report_markdown=raw_report,
        recommended_params_json=json.dumps(recommended_params, ensure_ascii=False)
    )

    return {
        "audit_id": audit_id,
        "created_at": datetime.datetime.now().isoformat(),
        "timeframe_days": timeframe_days,
        "bot_id": bot_id or "ALL",
        "symbol": symbol or "ALL",
        "dataset": dataset,
        "provider": provider,
        "model": model_name,
        "latency_ms": latency_ms,
        "executive_summary": exec_summary,
        "report_markdown": raw_report,
        "recommended_params": recommended_params,
        "applied_status": 0
    }

def apply_audit_recommendations(audit_id: int, target_bot_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Applies the AI recommended parameters directly into the target bot's custom_params in database.
    """
    audit = get_strategy_audit_by_id(audit_id)
    if not audit:
        return {"status": "error", "message": f"Audit #{audit_id} not found"}

    rec_json_str = audit.get("recommended_params_json") or "{}"
    try:
        rec_params = json.loads(rec_json_str)
    except Exception:
        rec_params = {}

    if not rec_params:
        return {"status": "error", "message": "No recommended parameters found in this audit"}

    conn = get_db()
    c = conn.cursor()

    applied_bots = []
    if target_bot_id:
        c.execute("SELECT id, name, custom_params FROM bot_instances WHERE id = ?", (target_bot_id,))
        bots_to_update = [dict(r) for r in c.fetchall()]
    else:
        # If no specific bot, update all bots matching audit filter or all bots
        audit_bot_id = audit.get("bot_id")
        if audit_bot_id and audit_bot_id != "ALL":
            c.execute("SELECT id, name, custom_params FROM bot_instances WHERE id = ? OR name LIKE ?", (audit_bot_id, f"%{audit_bot_id}%"))
        else:
            c.execute("SELECT id, name, custom_params FROM bot_instances")
        bots_to_update = [dict(r) for r in c.fetchall()]

    for b in bots_to_update:
        b_id = b["id"]
        existing_params = {}
        if b.get("custom_params"):
            try:
                existing_params = json.loads(b["custom_params"])
            except Exception:
                pass

        # Update relevant parameters
        if "recommended_sl_spread_multiplier" in rec_params:
            existing_params["AiSlSpreadMultiplier"] = float(rec_params["recommended_sl_spread_multiplier"])
        if "recommended_sl_pips" in rec_params:
            existing_params["AiSlMinFloorPips"] = float(rec_params["recommended_sl_pips"])
            existing_params["StopLossPips"] = float(rec_params["recommended_sl_pips"])
            existing_params["stoplossPip"] = float(rec_params["recommended_sl_pips"])
            existing_params["SlPips"] = float(rec_params["recommended_sl_pips"])
        if "recommended_tp_pips" in rec_params:
            existing_params["TakeProfitPips"] = float(rec_params["recommended_tp_pips"])
            existing_params["takeprofitPip"] = float(rec_params["recommended_tp_pips"])
            existing_params["TpPips"] = float(rec_params["recommended_tp_pips"])
        if "recommended_dca_spacing_pips" in rec_params:
            existing_params["DcaStepPips"] = float(rec_params["recommended_dca_spacing_pips"])
            existing_params["GridStepPips"] = float(rec_params["recommended_dca_spacing_pips"])
        if "recommended_adx_threshold" in rec_params:
            existing_params["AdxMinLevel"] = float(rec_params["recommended_adx_threshold"])
        if "recommended_risk_percent" in rec_params:
            existing_params["RiskPercent"] = float(rec_params["recommended_risk_percent"])
        if "recommended_confidence_gate" in rec_params:
            existing_params["MinConfidence"] = float(rec_params["recommended_confidence_gate"])

        c.execute("UPDATE bot_instances SET custom_params = ? WHERE id = ?", (json.dumps(existing_params), b_id))
        applied_bots.append(f"{b['name']} (#{b_id})")

    conn.commit()
    conn.close()

    update_strategy_audit_applied(audit_id, 1)

    log_message("STRATEGY_AUDIT", "INFO", f"Applied AI recommended parameters from Audit #{audit_id} to: {', '.join(applied_bots)}")

    return {
        "status": "success",
        "audit_id": audit_id,
        "applied_bots": applied_bots,
        "applied_params": rec_params
    }

async def send_telegram_strategy_audit(audit_id: int) -> Dict[str, Any]:
    """
    Pushes an executive strategy audit summary to Telegram.
    """
    audit = get_strategy_audit_by_id(audit_id)
    if not audit:
        return {"status": "error", "message": f"Audit #{audit_id} not found"}

    bot_token, chat_id = load_telegram_config()
    if not bot_token or not chat_id:
        return {"status": "error", "message": "Telegram Bot Token or Chat ID is not configured"}

    win_rate = audit.get("win_rate", 0.0)
    pf = audit.get("profit_factor", 0.0)
    pnl = audit.get("total_pnl_pips", 0.0)
    pnl_usd = audit.get("total_pnl_usd", 0.0)
    status_icon = "🏆" if win_rate >= 60.0 else ("⚠️" if win_rate >= 45.0 else "❌")

    rec_json_str = audit.get("recommended_params_json") or "{}"
    try:
        rec = json.loads(rec_json_str)
    except Exception:
        rec = {}

    text = (
        f"{status_icon} <b>[AI Quantitative Strategy Review] Audit #{audit.get('id', 0)}</b>\n\n"
        f"📅 <b>Khung Thời Gian:</b> {audit.get('timeframe_days', 7)} ngày qua\n"
        f"🤖 <b>AI Provider:</b> {audit.get('provider', '').upper()} (<code>{audit.get('model', '')}</code>)\n"
        f"🎯 <b>Phạm Vi:</b> Bot: {audit.get('bot_id', 'ALL')} | Symbol: {audit.get('symbol', 'ALL')}\n\n"
        f"📈 <b>Tỷ Lệ Thắng (Win Rate):</b> <b>{win_rate:.1f}%</b> ({audit.get('total_wins', 0)}W / {audit.get('total_losses', 0)}L)\n"
        f"⚖️ <b>Hệ Số Lợi Nhuận (Profit Factor):</b> <b>{pf:.2f}</b>\n"
        f"💰 <b>Tổng Lợi Nhuận:</b> <b>{pnl:+.1f} pips</b> (${pnl_usd:+.2f} USD)\n\n"
        f"💡 <b>Đề Xuất Tối Ưu Cho Tuần Tới:</b>\n"
        f"• <b>Stop Loss:</b> <code>{rec.get('recommended_sl_pips', 30)} pips</code>\n"
        f"• <b>Take Profit:</b> <code>{rec.get('recommended_tp_pips', 60)} pips</code>\n"
        f"• <b>DCA Spacing:</b> <code>{rec.get('recommended_dca_spacing_pips', 25)} pips</code>\n"
        f"• <b>Risk/Lệnh:</b> <code>{rec.get('recommended_risk_percent', 1.0)}%</code>\n\n"
        f"📝 <b>Nhận Xét Cốt Lõi:</b>\n"
        f"<i>{rec.get('summary_recommendation', audit.get('executive_summary', 'Đã tạo báo cáo tối ưu.'))}</i>\n\n"
        f"⏰ <i>Thời Gian: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</i>"
    )

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                return {"status": "success", "message": "Audit report sent to Telegram successfully"}
            else:
                return {"status": "error", "message": f"Telegram API error ({res.status_code}): {res.text}"}
    except Exception as e:
        return {"status": "error", "message": f"Failed to send to Telegram: {str(e)}"}
