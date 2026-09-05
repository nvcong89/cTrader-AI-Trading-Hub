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


class TestNewsFilter(unittest.TestCase):
    def test_currency_relevance(self):
        # Gold
        self.assertTrue(is_currency_relevant("XAUUSD", "USD"))
        self.assertTrue(is_currency_relevant("GOLD", "USD"))
        self.assertTrue(is_currency_relevant("XAUUSD", "ALL"))
        self.assertFalse(is_currency_relevant("XAUUSD", "JPY"))
        self.assertFalse(is_currency_relevant("XAUUSD", "AUD"))
        self.assertFalse(is_currency_relevant("XAUUSD", "CAD"))
        
        # Forex
        self.assertTrue(is_currency_relevant("EURUSD", "EUR"))
        self.assertTrue(is_currency_relevant("EURUSD", "USD"))
        self.assertFalse(is_currency_relevant("EURUSD", "GBP"))
        self.assertTrue(is_currency_relevant("GBPJPY", "GBP"))
        self.assertTrue(is_currency_relevant("GBPJPY", "JPY"))
        self.assertFalse(is_currency_relevant("GBPJPY", "USD"))
        
        # Broker suffix / prefix
        self.assertTrue(is_currency_relevant("mXAUUSD_ecn", "USD"))
        self.assertTrue(is_currency_relevant("EURUSD.pro", "EUR"))
        self.assertTrue(is_currency_relevant("EURUSD.pro", "USD"))
        
        # Crypto
        self.assertTrue(is_currency_relevant("BTCUSD", "USD"))
        self.assertTrue(is_currency_relevant("ETHUSD", "USD"))
        self.assertTrue(is_currency_relevant("BITCOIN", "USD"))
        self.assertTrue(is_currency_relevant("ETHEREUM", "USD"))
        self.assertFalse(is_currency_relevant("BITCOIN", "EUR"))

    def test_utc_timezone_normalization(self):
        # Sample ForexFactory item: 11:15 EDT (-04:00) is 15:15 UTC
        raw_item = {
            "title": "US Non-Farm Payrolls",
            "country": "USD",
            "date": "2026-09-04T11:15:00-04:00",
            "impact": "High"
        }
        parsed = parse_forexfactory_json_item(raw_item)
        expected_utc = datetime(2026, 9, 4, 15, 15, 0, tzinfo=timezone.utc)
        self.assertEqual(parsed["date_utc"], expected_utc)
        
        # Test blackout window
        # 20 mins before news (14:55 UTC) -> should be blocked
        now_1 = datetime(2026, 9, 4, 14, 55, 0, tzinfo=timezone.utc)
        blocked, reason = is_news_blackout_active([parsed], "XAUUSD", now_1, pause_before_mins=30, pause_after_mins=30)
        self.assertTrue(blocked)
        self.assertIn("in 20m", reason)
        
        # 10 mins after news (15:25 UTC) -> should be blocked
        now_2 = datetime(2026, 9, 4, 15, 25, 0, tzinfo=timezone.utc)
        blocked, reason = is_news_blackout_active([parsed], "XAUUSD", now_2, pause_before_mins=30, pause_after_mins=30)
        self.assertTrue(blocked)
        self.assertIn("occurred 10m ago", reason)
        
        # 45 mins before news (14:30 UTC) -> should be clear
        now_3 = datetime(2026, 9, 4, 14, 30, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([parsed], "XAUUSD", now_3, pause_before_mins=30, pause_after_mins=30)
        self.assertFalse(blocked)
        
        # 45 mins after news (16:00 UTC) -> should be clear
        now_4 = datetime(2026, 9, 4, 16, 0, 0, tzinfo=timezone.utc)
        blocked, _ = is_news_blackout_active([parsed], "XAUUSD", now_4, pause_before_mins=30, pause_after_mins=30)
        self.assertFalse(blocked)

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
