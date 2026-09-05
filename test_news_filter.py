import unittest
import json
import re
from datetime import datetime, timezone, timedelta

def is_currency_relevant(symbol_name: str, country: str) -> bool:
    if not country or not country.strip():
        return False
    clean_country = country.strip().upper()
    if clean_country == "ALL":
        return True
    
    clean_symbol = re.sub(r'[^a-zA-Z]', '', symbol_name or '').upper()
    
    # Substring match (e.g. "USD" in "XAUUSD" or "EURUSD", "JPY" in "GBPJPY")
    if clean_country in clean_symbol:
        return True
    
    # Gold & Metals alias protection
    if any(m in clean_symbol for m in ["XAU", "GOLD", "XAG", "SILVER"]) and clean_country == "USD":
        return True
        
    # Crypto alias protection
    if any(c in clean_symbol for c in ["BTC", "ETH", "BITCOIN", "CRYPTO"]) and clean_country == "USD":
        return True
        
    return False

def parse_forexfactory_json_item(item: dict):
    title = item.get("title", "")
    country = item.get("country", "")
    impact = item.get("impact", "")
    date_str = item.get("date", "")
    
    # ISO 8601 with offset
    dt = datetime.fromisoformat(date_str)
    # Always normalize to UTC
    dt_utc = dt.astimezone(timezone.utc)
    return {
        "title": title,
        "country": country,
        "impact": impact,
        "date_utc": dt_utc
    }

def is_news_blackout_active(events, symbol: str, now_utc: datetime, 
                            pause_before_mins: int = 30, pause_after_mins: int = 30, 
                            high_impact_only: bool = True):
    for ev in events:
        if high_impact_only and ev["impact"].lower() != "high":
            continue
        if not is_currency_relevant(symbol, ev["country"]):
            continue
            
        start_pause = ev["date_utc"] - timedelta(minutes=pause_before_mins)
        end_pause = ev["date_utc"] + timedelta(minutes=pause_after_mins)
        
        if start_pause <= now_utc <= end_pause:
            diff_mins = (ev["date_utc"] - now_utc).total_seconds() / 60.0
            if diff_mins >= 0:
                reason = f"High Impact News: '{ev['title']}' ({ev['country']}) in {diff_mins:.0f}m"
            else:
                reason = f"High Impact News: '{ev['title']}' ({ev['country']}) occurred {abs(diff_mins):.0f}m ago"
            return True, reason
    return False, ""

def should_force_close_before_news(events, symbol: str, now_utc: datetime, 
                                   close_before_mins: int = 6, 
                                   high_impact_only: bool = True):
    for ev in events:
        if high_impact_only and ev["impact"].lower() != "high":
            continue
        if not is_currency_relevant(symbol, ev["country"]):
            continue
            
        start_close = ev["date_utc"] - timedelta(minutes=close_before_mins)
        if start_close <= now_utc <= ev["date_utc"]:
            diff_mins = (ev["date_utc"] - now_utc).total_seconds() / 60.0
            reason = f"Force Close before High Impact News: '{ev['title']}' ({ev['country']}) in {diff_mins:.0f}m"
            return True, reason
    return False, ""


class TestNewsFilter(unittest.TestCase):
    def test_currency_relevance(self):
        # Gold
        self.assertTrue(is_currency_relevant("XAUUSD", "USD"))
        self.assertTrue(is_currency_relevant("GOLD", "USD"))
        self.assertTrue(is_currency_relevant("XAUUSD", "ALL"))
        self.assertFalse(is_currency_relevant("XAUUSD", "JPY"))
        self.assertFalse(is_currency_relevant("XAUUSD", "AUD"))
        self.assertFalse(is_currency_relevant("XAUUSD", "CAD"))
        
        # Crypto
        self.assertTrue(is_currency_relevant("BTCUSD", "USD"))
        self.assertTrue(is_currency_relevant("BITCOIN", "USD"))
        self.assertTrue(is_currency_relevant("ETHUSD", "USD"))
        
        # Forex Pairs
        self.assertTrue(is_currency_relevant("EURUSD", "EUR"))
        self.assertTrue(is_currency_relevant("EURUSD", "USD"))
        self.assertFalse(is_currency_relevant("EURUSD", "GBP"))

    def test_news_blackout_timing(self):
        item = {
            "title": "Non-Farm Employment Change",
            "country": "USD",
            "date": "2026-09-04T08:30:00-04:00", # 12:30 UTC
            "impact": "High"
        }
        parsed = parse_forexfactory_json_item(item)
        
        # News event is at 12:30 UTC
        self.assertEqual(parsed["date_utc"].hour, 12)
        self.assertEqual(parsed["date_utc"].minute, 30)
        
        # 20 mins before news (12:10 UTC) -> should be blocked with 30m window
        now_1 = datetime(2026, 9, 4, 12, 10, 0, tzinfo=timezone.utc)
        blocked, reason = is_news_blackout_active([parsed], "XAUUSD", now_1, pause_before_mins=30, pause_after_mins=30)
        self.assertTrue(blocked)
        self.assertIn("in 20m", reason)
        
        # 10 mins after news (12:40 UTC) -> should be blocked with 30m window
        now_2 = datetime(2026, 9, 4, 12, 40, 0, tzinfo=timezone.utc)
        blocked, reason = is_news_blackout_active([parsed], "XAUUSD", now_2, pause_before_mins=30, pause_after_mins=30)
        self.assertTrue(blocked)
        self.assertIn("occurred 10m ago", reason)
        
        # 45 mins before news (11:45 UTC) -> should be clear
        now_3 = datetime(2026, 9, 4, 11, 45, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([parsed], "XAUUSD", now_3, pause_before_mins=30, pause_after_mins=30)
        self.assertFalse(blocked)
        
        # 45 mins after news (13:15 UTC) -> should be clear
        now_4 = datetime(2026, 9, 4, 13, 15, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([parsed], "XAUUSD", now_4, pause_before_mins=30, pause_after_mins=30)
        self.assertFalse(blocked)

    def test_force_close_and_pause_news_intervals(self):
        # News at 15:15 UTC (Non-Farm Employment Change, USD)
        usd_news = {
            "title": "Non-Farm Employment Change",
            "country": "USD",
            "date_utc": datetime(2026, 9, 4, 15, 15, 0, tzinfo=timezone.utc),
            "impact": "High"
        }
        
        # 1. At 15:00 UTC (15 mins before news):
        # pauseBeforeNewsMins = 18 -> Entry is BLOCKED
        # closeBeforeNewsMins = 6  -> Position is NOT force closed yet (still gồng to TP)
        now_1500 = datetime(2026, 9, 4, 15, 0, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([usd_news], "XAUUSD", now_1500, pause_before_mins=18, pause_after_mins=12)
        self.assertTrue(blocked, "New entries should be blocked 15m before news (within 18m window)")
        
        force_close, _ = should_force_close_before_news([usd_news], "XAUUSD", now_1500, close_before_mins=6)
        self.assertFalse(force_close, "Positions should NOT be force closed 15m before news (wait until 6m)")
        
        # 2. At 15:10 UTC (5 mins before news):
        # Entry BLOCKED and Force Close TRIGGERED
        now_1510 = datetime(2026, 9, 4, 15, 10, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([usd_news], "XAUUSD", now_1510, pause_before_mins=18, pause_after_mins=12)
        self.assertTrue(blocked)
        
        force_close, close_reason = should_force_close_before_news([usd_news], "XAUUSD", now_1510, close_before_mins=6)
        self.assertTrue(force_close, "Positions MUST be force closed 5m before news (within 6m window)")
        self.assertIn("Force Close before High Impact News", close_reason)
        
        # 3. At 15:20 UTC (5 mins after news):
        # Entry is still BLOCKED (pauseAfterNewsMins = 12, market still erratic)
        now_1520 = datetime(2026, 9, 4, 15, 20, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([usd_news], "XAUUSD", now_1520, pause_before_mins=18, pause_after_mins=12)
        self.assertTrue(blocked, "New entries should remain blocked 5m after news (within 12m window)")
        
        # 4. At 15:30 UTC (15 mins after news):
        # Market stabilized, entry blackout LIFTED
        now_1530 = datetime(2026, 9, 4, 15, 30, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([usd_news], "XAUUSD", now_1530, pause_before_mins=18, pause_after_mins=12)
        self.assertFalse(blocked, "Blackout should be completely lifted 15m after news")

    def test_unrelated_currency_not_blocked(self):
        # JPY High impact news at 15:15 UTC
        jpy_event = {
            "title": "BOJ Monetary Policy Statement",
            "country": "JPY",
            "date_utc": datetime(2026, 9, 4, 15, 15, 0, tzinfo=timezone.utc),
            "impact": "High"
        }
        # When trading XAUUSD at 15:00 UTC, JPY news should NOT block XAUUSD!
        now = datetime(2026, 9, 4, 15, 0, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([jpy_event], "XAUUSD", now)
        self.assertFalse(blocked)
        
        # But when trading USDJPY, JPY news SHOULD block!
        blocked_jpy, reason = is_news_blackout_active([jpy_event], "USDJPY", now)
        self.assertTrue(blocked_jpy)
        self.assertIn("BOJ", reason)

if __name__ == "__main__":
    unittest.main()
