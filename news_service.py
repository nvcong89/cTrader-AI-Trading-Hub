"""
News Service - ForexFactory Red News Fetcher, Clusterer, and AI Prompt Engine
=============================================================================
Provides:
- Resilient fetching of ForexFactory economic calendar (JSON + XML fallback)
- In-memory caching with 15-minute TTL to prevent WAF blocks
- High-Impact / Red News filtering and timestamp clustering
- AI prompt formulation for Macroeconomic & SMC quantitative assessment
- Structured JSON and Markdown response parsing
"""

import json
import re
import time
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Tuple, Optional
import httpx

# In-memory Cache store: { "cache_key": { "timestamp": float, "data": Any } }
_NEWS_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 900  # 15 minutes

FF_JSON_THISWEEK = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
FF_JSON_NEXTWEEK = "https://nfs.faireconomy.media/ff_calendar_nextweek.json"
FF_XML_THISWEEK = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/xml, */*"
}

def generate_cluster_hash(timestamp_utc: str, event_titles: List[str], symbol: str = "") -> str:
    """Generates a stable MD5 signature for an event cluster and symbol."""
    sorted_titles = sorted([t.strip().lower() for t in event_titles])
    raw_str = f"{timestamp_utc.strip()}_{'|'.join(sorted_titles)}_{symbol.strip().upper()}"
    return hashlib.md5(raw_str.encode("utf-8")).hexdigest()

async def fetch_forexfactory_raw_events(week_range: str = "thisweek") -> List[Dict[str, Any]]:
    """
    Fetches raw economic calendar events with in-memory caching and XML fallback.
    """
    cache_key = f"ff_raw_{week_range.lower()}"
    now_ts = time.time()
    
    if cache_key in _NEWS_CACHE:
        cached_entry = _NEWS_CACHE[cache_key]
        if now_ts - cached_entry["timestamp"] < CACHE_TTL_SECONDS:
            return cached_entry["data"]

    target_url = FF_JSON_NEXTWEEK if week_range.lower() == "nextweek" else FF_JSON_THISWEEK
    events: List[Dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=12.0) as client:
            resp = await client.get(target_url)
            if resp.status_code == 200:
                events = resp.json()
            else:
                raise ValueError(f"HTTP status {resp.status_code}")
    except Exception as json_err:
        # Fallback to XML if thisweek fails
        if week_range.lower() == "thisweek":
            try:
                async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=12.0) as client:
                    xml_resp = await client.get(FF_XML_THISWEEK)
                    if xml_resp.status_code == 200:
                        root = ET.fromstring(xml_resp.content)
                        for item in root.findall(".//event"):
                            events.append({
                                "title": item.findtext("title", ""),
                                "country": item.findtext("country", ""),
                                "date": item.findtext("date", ""),
                                "time": item.findtext("time", ""),
                                "impact": item.findtext("impact", ""),
                                "forecast": item.findtext("forecast", ""),
                                "previous": item.findtext("previous", "")
                            })
            except Exception as xml_err:
                print(f"[NewsService] ForexFactory fetch failed (JSON: {json_err}, XML: {xml_err})")
                return []
        else:
            print(f"[NewsService] Next week JSON fetch failed: {json_err}")
            return []

    # Store in cache
    if events:
        _NEWS_CACHE[cache_key] = {
            "timestamp": now_ts,
            "data": events
        }

    return events

def parse_iso_or_ff_date(date_str: str) -> Optional[datetime]:
    """Robust parser for ForexFactory ISO 8601 or custom date strings."""
    if not date_str:
        return None
    try:
        # Check standard ISO 8601 format e.g. 2026-09-08T08:30:00-04:00
        dt = datetime.fromisoformat(date_str.strip())
        return dt.astimezone(timezone.utc)
    except Exception:
        pass

    # Try common fallback patterns
    for fmt in ["%m-%d-%Y %I:%M%p", "%Y-%m-%d %H:%M:%S", "%b %d, %Y %I:%M %p"]:
        try:
            parsed = datetime.strptime(date_str.strip(), fmt)
            return parsed.replace(tzinfo=timezone.utc)
        except Exception:
            continue
            
    return None

def cluster_red_news(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filters for Red News (impact == 'High') and groups events that occur
    at the exact same UTC release timestamp into clusters.
    """
    # 1. Filter High Impact only
    red_events = []
    for ev in events:
        impact = str(ev.get("impact", "")).strip().lower()
        if impact == "high":
            red_events.append(ev)

    # 2. Group by normalized UTC timestamp
    clusters_map: Dict[str, List[Dict[str, Any]]] = {}
    
    for ev in red_events:
        raw_date = ev.get("date", "")
        dt_utc = parse_iso_or_ff_date(raw_date)
        if not dt_utc:
            continue
            
        # Key format: ISO 8601 UTC
        time_key = dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        if time_key not in clusters_map:
            clusters_map[time_key] = []
            
        clusters_map[time_key].append({
            "title": str(ev.get("title", "")).strip(),
            "country": str(ev.get("country", "")).strip().upper(),
            "impact": "High",
            "forecast": str(ev.get("forecast", "") or "").strip(),
            "previous": str(ev.get("previous", "") or "").strip(),
            "date_utc": time_key
        })

    # 3. Assemble cluster objects
    now_utc = datetime.now(timezone.utc)
    cluster_list = []

    for time_key in sorted(clusters_map.keys()):
        items = clusters_map[time_key]
        if not items:
            continue
            
        dt_utc = datetime.fromisoformat(time_key.replace("Z", "+00:00"))
        # Local Vietnam / ICT Time (UTC+7)
        dt_vn = dt_utc.astimezone(timezone(timedelta(hours=7)))
        
        diff_seconds = (dt_utc - now_utc).total_seconds()
        diff_minutes = int(diff_seconds // 60)
        
        # Determine unique countries/currencies
        currencies = sorted(list(set(it["country"] for it in items if it["country"])))
        titles = [it["title"] for it in items]
        
        is_past = diff_seconds < -300  # More than 5 mins ago
        is_upcoming_soon = 0 <= diff_minutes <= 120  # Within 2 hours
        
        cluster_id = generate_cluster_hash(time_key, titles)

        cluster_list.append({
            "id": cluster_id,
            "timestamp_utc": time_key,
            "date_formatted_vn": dt_vn.strftime("%A, %d/%m/%Y"),
            "time_formatted_vn": dt_vn.strftime("%H:%M (UTC+7)"),
            "time_formatted_utc": dt_utc.strftime("%H:%M UTC"),
            "day_key": dt_vn.strftime("%Y-%m-%d"),
            "currencies": currencies,
            "events_count": len(items),
            "events": items,
            "diff_minutes": diff_minutes,
            "is_past": is_past,
            "is_upcoming_soon": is_upcoming_soon,
            "is_assessed": False,
            "latest_assessment": None
        })

    return cluster_list

def generate_news_cluster_prompt(
    cluster: Dict[str, Any],
    symbol: str,
    user_notes: str = ""
) -> Tuple[str, str]:
    """
    Builds the System and User Prompt for AI Engine.
    Instructs the LLM to analyze the simultaneous economic indicators and their
    combined impact on the target symbol (especially Gold / XAUUSD or Forex).
    """
    system_prompt = """You are an elite Macroeconomic Strategist, Quantitative Market Analyst, and Smart Money Concepts (SMC) Expert for algorithmic trading hubs.
Your mission is to perform a comprehensive, institutional-grade assessment of simultaneous High-Impact (Red) economic news events and forecast their precise impact on a specified trading instrument (e.g. XAUUSD, EURUSD, US30).

You MUST evaluate:
1. Inter-indicator Correlation & Conflict:
   - If multiple indicators release at once (e.g. US NFP strong + Unemployment Rate rising, or CPI Headline up + Core down), examine whether they reinforce each other or generate conflicting signals leading to high volatility whipsaws.
2. Target Symbol Reaction & Sensitivity:
   - Detail how the specific symbol is fundamentally and quantitatively linked to the released currency (e.g. XAUUSD vs USD yield curve, EURUSD vs ECB/Fed rate differential).
3. Volatility Magnitude & Expected Pips:
   - Classify volatility into LOW, MEDIUM, HIGH, or EXTREME.
   - Provide a realistic expected price movement range in pips (e.g. "120 - 250 pips").
4. Trend Directionality vs 2-Way Liquidity Sweep:
   - Classify into:
     * "1_WAY_TREND": Clear, one-directional aggressive trend extension.
     * "2_WAY_WHIPSAW": Violent two-way volatility, hunting liquidity on both sides (BSL & SSL) before picking a direction.
     * "SWEEP_THEN_TREND": Initial liquidity sweep / Judas Swing against the true fundamental direction, followed by strong reversal into the real trend.
5. Probabilities:
   - Estimate the probability of an overall BUY bias (%) vs SELL bias (%), ensuring they sum to 100%.
6. Bilingual Bifurcated Scenario Analysis:
   - Provide both Vietnamese and English explanations for Scenario A (Actual > Forecast) and Scenario B (Actual < Forecast).
7. Bilingual cBot & Trader Guidance:
   - Provide clear actionable instructions in both Vietnamese and English regarding blackout windows, scalping hazards, and SMC entry blueprints.

IMPORTANT FORMAT REQUIREMENT:
You MUST start your response with a valid JSON block enclosed in ```json ... ``` with the exact schema below, followed by an in-depth bilingual Markdown report:

```json
{
  "volatility_level": "EXTREME",
  "expected_pips_range": "150 - 300 pips",
  "trend_type": "2_WAY_WHIPSAW",
  "prob_buy": 65.0,
  "prob_sell": 35.0,
  "scenario_better_vi": "Nếu Thực tế > Dự báo: USD bật tăng mạnh, lợi suất TPCP Mỹ tăng vọt, gây áp lực khiến giá vàng giảm mạnh về kiểm tra vùng hỗ trợ.",
  "scenario_better_en": "If Actual > Forecast: USD surges, Treasury yields spike, forcing target symbol to drop sharply to test lower key support.",
  "scenario_worse_vi": "Nếu Thực tế < Dự báo: USD lao dốc trước kỳ vọng nới lỏng chính sách, kích hoạt đà bứt phá tăng giá mạnh cho cặp tiền/vàng.",
  "scenario_worse_en": "If Actual < Forecast: USD plummets on rate-cut expectations, propelling target symbol into aggressive bullish breakout.",
  "bot_guidance_vi": "Tạm dừng các bot Grid và Scalping trước giờ tin 30 phút. Đối với bot săn thanh khoản Judas Sweep, theo dõi tín hiệu quét đỉnh/đáy M1/M5 trước khi vào lệnh.",
  "bot_guidance_en": "Suspend grid and scalping bots 30 minutes before release. For Judas Sweep bots, monitor M1/M5 sweep of previous swing highs/lows before entering."
}
```

After the JSON block, provide a comprehensive bilingual Markdown analysis structured with two distinct section comments:

<!-- SECTION_VI -->
### 🇻🇳 PHÂN TÍCH VĨ MÔ & KỊCH BẢN SMC (TIẾNG VIỆT)
- 📊 **Tóm Tắt Vĩ Mô & Tác Động Chung**: ...
- ⚡ **Tương Quan Giữa Các Chỉ Số & Xung Đột Dữ Liệu**: ...
- 🎯 **Kịch Bản Thanh Khoản SMC & Điểm Phản Ứng Giá**: ...
- 🛡️ **Chiến Lược Quản Trị Rủi Ro & Lệnh Giao Dịch cBot**: ...

<!-- SECTION_EN -->
### 🇬🇧 INSTITUTIONAL MACRO & SMC ORDER FLOW ANALYSIS (ENGLISH)
- 📊 **Executive Macro Summary**: ...
- ⚡ **Inter-Indicator Dynamics & Potential Conflicts**: ...
- 🎯 **SMC Liquidity & Price Reaction Blueprint for Target Symbol**: ...
- 🛡️ **Tactical Risk & cBot Execution Recommendations**: ...
"""

    events_summary_lines = []
    for idx, ev in enumerate(cluster.get("events", []), 1):
        fc = ev.get("forecast") or "N/A"
        pr = ev.get("previous") or "N/A"
        events_summary_lines.append(f"  {idx}. [{ev.get('country')}] {ev.get('title')} | Forecast: {fc} | Previous: {pr}")

    events_text = "\n".join(events_summary_lines)
    user_notes_section = f"\nUser Scenario / Context Notes: {user_notes.strip()}" if user_notes.strip() else ""

    user_prompt = f"""Assess the following High-Impact Economic News Cluster:

Release Time: {cluster.get('date_formatted_vn')} at {cluster.get('time_formatted_vn')} ({cluster.get('time_formatted_utc')})
Target Symbol to Analyze: {symbol.strip().upper()}
Simultaneous High-Impact Events ({len(cluster.get('events', []))} events):
{events_text}{user_notes_section}

Please provide your rigorous institutional assessment following the required bilingual JSON schema and Markdown report structure.
"""
    return system_prompt, user_prompt

def parse_news_ai_response(raw_text: str) -> Dict[str, Any]:
    """
    Extracts structured JSON metrics and separate bilingual Markdown report from LLM response.
    Supports both legacy single-language responses and new bilingual responses with fallbacks.
    """
    clean_text = raw_text.strip()
    
    # Try finding markdown JSON block ```json ... ```
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', clean_text, re.DOTALL)
    json_data = {}
    markdown_report = clean_text

    if json_match:
        json_str = json_match.group(1)
        # Markdown is everything after the json block
        markdown_report = clean_text[json_match.end():].strip()
        try:
            json_data = json.loads(json_str)
        except Exception:
            json_data = {}
    else:
        # Try raw json
        brace_match = re.search(r'(\{[\s\S]*?\})', clean_text)
        if brace_match:
            try:
                json_data = json.loads(brace_match.group(1))
                markdown_report = clean_text[brace_match.end():].strip()
            except Exception:
                pass

    # Normalize fields with safe fallbacks
    volatility = str(json_data.get("volatility_level", "HIGH")).upper().strip()
    if volatility not in ["LOW", "MEDIUM", "HIGH", "EXTREME"]:
        volatility = "HIGH"

    trend_type = str(json_data.get("trend_type", "2_WAY_WHIPSAW")).upper().strip()
    if trend_type not in ["1_WAY_TREND", "2_WAY_WHIPSAW", "SWEEP_THEN_TREND"]:
        trend_type = "2_WAY_WHIPSAW"

    try:
        prob_buy = float(json_data.get("prob_buy", 50.0))
        prob_sell = float(json_data.get("prob_sell", 50.0))
    except (ValueError, TypeError):
        prob_buy, prob_sell = 50.0, 50.0

    # Ensure probabilities sum to 100%
    total_prob = prob_buy + prob_sell
    if total_prob > 0 and abs(total_prob - 100.0) > 0.5:
        prob_buy = round((prob_buy / total_prob) * 100.0, 1)
        prob_sell = round(100.0 - prob_buy, 1)

    expected_pips = str(json_data.get("expected_pips_range") or "100 - 250 pips").strip()
    
    # Bilingual fields extraction with graceful cross-fallbacks
    scenario_better_vi = str(json_data.get("scenario_better_vi") or "").strip()
    scenario_better_en = str(json_data.get("scenario_better_en") or "").strip()
    scenario_worse_vi = str(json_data.get("scenario_worse_vi") or "").strip()
    scenario_worse_en = str(json_data.get("scenario_worse_en") or "").strip()
    bot_guidance_vi = str(json_data.get("bot_guidance_vi") or "").strip()
    bot_guidance_en = str(json_data.get("bot_guidance_en") or "").strip()

    # Legacy fields fallback
    legacy_better = str(json_data.get("scenario_better") or "").strip()
    legacy_worse = str(json_data.get("scenario_worse") or "").strip()
    legacy_guidance = str(json_data.get("bot_guidance") or "").strip()

    if not scenario_better_vi and legacy_better:
        scenario_better_vi = legacy_better
    if not scenario_better_en:
        scenario_better_en = legacy_better or scenario_better_vi or "If actual data surpasses expectations, expect bullish continuation for the base currency."
    if not scenario_better_vi:
        scenario_better_vi = scenario_better_en

    if not scenario_worse_vi and legacy_worse:
        scenario_worse_vi = legacy_worse
    if not scenario_worse_en:
        scenario_worse_en = legacy_worse or scenario_worse_vi or "If actual data falls short, expect rapid re-pricing and reversal against forecast."
    if not scenario_worse_vi:
        scenario_worse_vi = scenario_worse_en

    if not bot_guidance_vi and legacy_guidance:
        bot_guidance_vi = legacy_guidance
    if not bot_guidance_en:
        bot_guidance_en = legacy_guidance or bot_guidance_vi or "Maintain minimum 30-minute pre-news blackout and avoid tight stop loss placement."
    if not bot_guidance_vi:
        bot_guidance_vi = bot_guidance_en

    scenario_better = scenario_better_vi
    scenario_worse = scenario_worse_vi
    bot_guidance = bot_guidance_vi

    if not markdown_report or len(markdown_report) < 30:
        markdown_report = clean_text

    # Extract Vietnamese and English markdown sections
    analysis_markdown_vi = ""
    analysis_markdown_en = ""

    if "<!-- SECTION_VI -->" in markdown_report and "<!-- SECTION_EN -->" in markdown_report:
        parts = markdown_report.split("<!-- SECTION_EN -->")
        analysis_markdown_vi = parts[0].replace("<!-- SECTION_VI -->", "").strip()
        analysis_markdown_en = parts[1].strip() if len(parts) > 1 else ""
    elif "<!-- SECTION_VI -->" in markdown_report:
        analysis_markdown_vi = markdown_report.replace("<!-- SECTION_VI -->", "").strip()
        analysis_markdown_en = analysis_markdown_vi
    elif "<!-- SECTION_EN -->" in markdown_report:
        analysis_markdown_en = markdown_report.replace("<!-- SECTION_EN -->", "").strip()
        analysis_markdown_vi = analysis_markdown_en
    else:
        # Split by English header pattern if comments weren't retained
        match_split = re.split(r'(?=###\s*(?:🇬🇧|ENGLISH|Institutional Macro|INSTITUTIONAL MACRO))', markdown_report, flags=re.IGNORECASE)
        if len(match_split) >= 2:
            analysis_markdown_vi = match_split[0].strip()
            analysis_markdown_en = match_split[1].strip()
        else:
            analysis_markdown_vi = markdown_report
            analysis_markdown_en = markdown_report

    if not analysis_markdown_vi:
        analysis_markdown_vi = markdown_report
    if not analysis_markdown_en:
        analysis_markdown_en = markdown_report

    return {
        "volatility_level": volatility,
        "expected_pips_range": expected_pips,
        "trend_type": trend_type,
        "prob_buy": prob_buy,
        "prob_sell": prob_sell,
        "scenario_better": scenario_better,
        "scenario_worse": scenario_worse,
        "bot_guidance": bot_guidance,
        "scenario_better_vi": scenario_better_vi,
        "scenario_better_en": scenario_better_en,
        "scenario_worse_vi": scenario_worse_vi,
        "scenario_worse_en": scenario_worse_en,
        "bot_guidance_vi": bot_guidance_vi,
        "bot_guidance_en": bot_guidance_en,
        "analysis_markdown": markdown_report,
        "analysis_markdown_vi": analysis_markdown_vi,
        "analysis_markdown_en": analysis_markdown_en
    }
