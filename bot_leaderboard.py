"""
Bot Fleet Quantitative Performance Leaderboard & Ranking System
================================================================
Computes multi-dimensional ranking metrics (Composite Quant Score, Win Rate %,
Profit Factor, Net PnL, Risk Control Tier Badges) for all bot instances.
Automatically calculated every 12 hours (2x daily) or refreshed on-demand.
"""

import json
import re
import datetime
from typing import Dict, Any, List, Optional
import database
from database import (
    get_db,
    save_leaderboard_snapshot,
    get_latest_leaderboard_snapshot,
    log_message
)

def normalize_symbol(s: Optional[str]) -> str:
    """Normalizes symbol string for robust cross-comparison across brokers and accounts."""
    if not s:
        return ""
    s = s.strip().upper().replace("#", "").replace("/", "").replace(" ", "").replace("_", "").replace("-", "")
    if s == "GOLD":
        return "XAUUSD"
    if "NDAQ" in s or "NAS" in s:
        return "NDAQ100"
    if "SPX" in s or "US500" in s:
        return "SPX500"
    if "US30" in s or "DJ30" in s or "DOW" in s:
        return "US30"
    if "JAPAN225" in s or "JP225" in s or "NI225" in s:
        return "JAPAN225"
    return s

def clean_key(s: Optional[str]) -> str:
    """Cleans an identifier string to lowercase alphanumeric characters."""
    if not s:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', str(s)).lower()

def is_item_match_bot(item: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """Accurately checks if a trade or position item belongs to a specific bot instance."""
    b_id_str = str(b["id"])
    b_name = b.get("name", "")
    b_key = clean_key(b_name)
    b_sym = normalize_symbol(b.get("symbol"))
    b_acc = str(b.get("account_id") or "").strip()

    t_bot = str(item.get("bot_id") or "")
    t_key = clean_key(t_bot)
    t_sym = normalize_symbol(item.get("symbol"))
    t_acc = str(item.get("account_id") or "").strip()

    # 1. Symbol must match if both present (prevents cross-symbol trade pollution)
    if b_sym and t_sym and b_sym != t_sym:
        return False

    # 2. Account ID must match if both present (prevents cross-account trade pollution)
    if b_acc and t_acc and b_acc != t_acc:
        return False

    # 3. Match identifier: ID or normalized key
    if t_bot == b_id_str or t_key == b_key:
        return True
    if len(b_key) > 5 and (b_key in t_key or t_key in b_key):
        return True

    return False

def compute_bot_leaderboard() -> Dict[str, Any]:
    """
    Analyzes historical trade outcomes and active positions across all bot instances
    to compute ranking scores and tier classifications.
    """
    conn = get_db()
    c = conn.cursor()

    # 1. Fetch configured bot instances
    c.execute("SELECT id, name, symbol, timeframe, status, account_id, account_type, created_at, custom_params FROM bot_instances ORDER BY id ASC")
    raw_bots = [dict(r) for r in c.fetchall()]

    # 1b. Fetch accounts to provide fallback account_type mapping
    try:
        c.execute("SELECT account_id, account_type FROM accounts")
        acc_type_map = {str(r["account_id"]): (r["account_type"] or "demo").lower() for r in c.fetchall()}
    except Exception:
        acc_type_map = {}

    # 2. Fetch trade history
    c.execute("SELECT * FROM history ORDER BY id DESC")
    raw_history = [dict(r) for r in c.fetchall()]

    # 3. Fetch active positions
    c.execute("SELECT * FROM positions")
    raw_positions = [dict(r) for r in c.fetchall()]

    conn.close()

    bot_rankings: List[Dict[str, Any]] = []

    for b in raw_bots:
        b_id = b["id"]
        b_name = b["name"]
        b_symbol = b["symbol"]
        b_timeframe = b["timeframe"]
        b_status = b["status"]
        b_account = b["account_id"]
        b_acc_type = (b.get("account_type") or acc_type_map.get(str(b_account), "demo")).lower()

        # Match history trades for this bot using accurate symbol- and account-aware comparison
        bot_trades = [t for t in raw_history if is_item_match_bot(t, b)]

        total_trades = len(bot_trades)
        wins = [t for t in bot_trades if (t.get('pnl') or 0.0) > 0.0 or (t.get('pnl_pips') or 0.0) > 0.0]
        losses = [t for t in bot_trades if (t.get('pnl') or 0.0) < 0.0 or (t.get('pnl_pips') or 0.0) < 0.0]
        breakevens = [t for t in bot_trades if (t.get('pnl') or 0.0) == 0.0 and (t.get('pnl_pips') or 0.0) == 0.0]

        total_wins = len(wins)
        total_losses = len(losses)
        win_rate = round((total_wins / total_trades * 100.0), 1) if total_trades > 0 else 0.0

        closed_pnl_usd = round(sum(float(t.get('pnl') or 0.0) for t in bot_trades), 2)
        closed_pnl_pips = round(sum(float(t.get('pnl_pips') or 0.0) for t in bot_trades), 1)

        # Active positions for this bot
        bot_positions = [p for p in raw_positions if is_item_match_bot(p, b)]
        floating_pnl_usd = round(sum(float(p.get('pnl') or 0.0) for p in bot_positions), 2)
        floating_pnl_pips = round(sum(float(p.get('pnl_pips') or 0.0) for p in bot_positions), 1)

        total_pnl_usd = round(closed_pnl_usd + floating_pnl_usd, 2)
        total_pnl_pips = round(closed_pnl_pips + floating_pnl_pips, 1)

        # Profit Factor
        gross_profit = sum(float(t.get('pnl') or 0.0) for t in wins)
        gross_loss = abs(sum(float(t.get('pnl') or 0.0) for t in losses))
        if gross_loss > 0:
            profit_factor = round(gross_profit / gross_loss, 2)
        elif gross_profit > 0:
            profit_factor = round(gross_profit, 2)
        else:
            profit_factor = 1.0

        # Composite Quant Score Formulation (0.0 - 100.0)
        # 1. Win Rate Score (30%)
        score_winrate = min(100.0, win_rate * 1.25)

        # 2. Profit Factor Score (30%)
        if profit_factor >= 3.0:
            score_pf = 100.0
        elif profit_factor >= 2.0:
            score_pf = 85.0 + (profit_factor - 2.0) * 15.0
        elif profit_factor >= 1.2:
            score_pf = 70.0 + (profit_factor - 1.2) * 18.75
        elif profit_factor >= 1.0:
            score_pf = 50.0 + (profit_factor - 1.0) * 100.0
        else:
            score_pf = max(10.0, profit_factor * 50.0)

        # 3. PnL Performance Score (20%)
        if total_pnl_usd > 0:
            score_pnl = min(100.0, 50.0 + (total_pnl_usd / 50.0) * 50.0)
        else:
            score_pnl = max(10.0, 50.0 - (abs(total_pnl_usd) / 50.0) * 40.0)

        # 4. Consistency & Execution Reliability Score (20%)
        score_activity = min(100.0, 40.0 + min(total_trades * 4.0, 40.0) + (20.0 if b_status == 'RUNNING' else 0.0))

        composite_score = round(0.30 * score_winrate + 0.30 * score_pf + 0.20 * score_pnl + 0.20 * score_activity, 1)

        # Tier Badge Classification
        if composite_score >= 80.0 or (win_rate >= 70.0 and total_trades >= 3):
            tier_badge = "TIER_S" # Elite / Diamond
            tier_label = "👑 Tier S (Diamond)"
            tier_color = "#38bdf8"
        elif composite_score >= 68.0:
            tier_badge = "TIER_A" # Gold / Strong
            tier_label = "🥇 Tier A (Gold)"
            tier_color = "#f59e0b"
        elif composite_score >= 50.0:
            tier_badge = "TIER_B" # Silver / Moderate
            tier_label = "🥈 Tier B (Silver)"
            tier_color = "#94a3b8"
        else:
            tier_badge = "TIER_C" # Bronze / Under Review
            tier_label = "⚠️ Tier C (Review)"
            tier_color = "#f87171"

        bot_rankings.append({
            "bot_id": b_id,
            "bot_name": b_name,
            "symbol": b_symbol,
            "timeframe": b_timeframe,
            "status": b_status,
            "account_id": b_account,
            "account_type": b_acc_type,
            "total_trades": total_trades,
            "total_wins": total_wins,
            "total_losses": total_losses,
            "total_breakevens": len(breakevens),
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "closed_pnl_usd": closed_pnl_usd,
            "floating_pnl_usd": floating_pnl_usd,
            "total_pnl_usd": total_pnl_usd,
            "total_pnl_pips": total_pnl_pips,
            "open_positions_count": len(bot_positions),
            "composite_score": composite_score,
            "tier_badge": tier_badge,
            "tier_label": tier_label,
            "tier_color": tier_color
        })

    # Sort Rankings: Primary by composite_score DESC, Secondary by total_pnl_usd DESC
    bot_rankings.sort(key=lambda x: (x["composite_score"], x["total_pnl_usd"]), reverse=True)

    # Assign Sequential Ranks
    for idx, r in enumerate(bot_rankings, start=1):
        r["rank"] = idx

    # Compute Fleet Overall Aggregate
    fleet_total_trades = sum(r["total_trades"] for r in bot_rankings)
    fleet_total_wins = sum(r["total_wins"] for r in bot_rankings)
    fleet_win_rate = round((fleet_total_wins / fleet_total_trades * 100.0), 1) if fleet_total_trades > 0 else 0.0
    fleet_total_pnl_usd = round(sum(r["total_pnl_usd"] for r in bot_rankings), 2)
    running_bots_count = sum(1 for r in bot_rankings if r["status"] == "RUNNING")

    top_performer = bot_rankings[0] if bot_rankings else None

    return {
        "calculated_at": datetime.datetime.now().isoformat(),
        "total_bots": len(bot_rankings),
        "running_bots_count": running_bots_count,
        "fleet_total_trades": fleet_total_trades,
        "fleet_win_rate": fleet_win_rate,
        "fleet_total_pnl_usd": fleet_total_pnl_usd,
        "top_performer": top_performer,
        "rankings": bot_rankings
    }

def get_or_compute_leaderboard(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Returns the latest 12-hour cached leaderboard snapshot or computes a fresh one if expired.
    """
    now = datetime.datetime.now()

    if not force_refresh:
        snap = get_latest_leaderboard_snapshot()
        if snap and snap.get("next_update_at"):
            try:
                next_update = datetime.datetime.fromisoformat(snap["next_update_at"])
                if now < next_update:
                    # Return cached snapshot
                    rankings_data = json.loads(snap.get("rankings_json", "{}"))
                    rankings_data["is_cached"] = True
                    rankings_data["snapshot_id"] = snap["id"]
                    rankings_data["created_at"] = snap["created_at"]
                    rankings_data["next_update_at"] = snap["next_update_at"]
                    return rankings_data
            except Exception:
                pass

    # Compute fresh leaderboard
    data = compute_bot_leaderboard()
    next_update_dt = now + datetime.timedelta(hours=12)
    next_update_str = next_update_dt.isoformat()

    snap_id = save_leaderboard_snapshot(
        total_bots=data["total_bots"],
        rankings_json=json.dumps(data, ensure_ascii=False),
        next_update_at=next_update_str
    )

    data["is_cached"] = False
    data["snapshot_id"] = snap_id
    data["created_at"] = now.isoformat()
    data["next_update_at"] = next_update_str

    log_message("LEADERBOARD", "INFO", f"Recalculated 12-hour Bot Leaderboard Snapshot #{snap_id}. Top: {data.get('top_performer', {}).get('bot_name', 'N/A')}")
    return data
