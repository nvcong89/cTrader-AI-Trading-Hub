import unittest
import json
from datetime import datetime, timezone
import news_service
import database

class TestNewsAssessmentService(unittest.TestCase):
    def setUp(self):
        database.init_db()

    def test_clustering_simultaneous_red_news(self):
        # 3 events: 2 high-impact at 12:30, 1 low impact at 12:30, 1 high impact at 14:00
        sample_events = [
            {
                "title": "Non-Farm Employment Change",
                "country": "USD",
                "impact": "High",
                "date": "2026-09-08T12:30:00Z",
                "forecast": "165K",
                "previous": "142K"
            },
            {
                "title": "Unemployment Rate",
                "country": "USD",
                "impact": "High",
                "date": "2026-09-08T12:30:00Z",
                "forecast": "4.2%",
                "previous": "4.3%"
            },
            {
                "title": "Average Hourly Earnings m/m",
                "country": "USD",
                "impact": "Low", # Should be excluded
                "date": "2026-09-08T12:30:00Z",
                "forecast": "0.3%",
                "previous": "0.2%"
            },
            {
                "title": "ISM Services PMI",
                "country": "USD",
                "impact": "High",
                "date": "2026-09-08T14:00:00Z",
                "forecast": "51.4",
                "previous": "51.4"
            }
        ]

        clusters = news_service.cluster_red_news(sample_events)
        self.assertEqual(len(clusters), 2)

        # Cluster 1: 12:30:00Z should have 2 events
        c1 = clusters[0]
        self.assertEqual(c1["timestamp_utc"], "2026-09-08T12:30:00Z")
        self.assertEqual(c1["events_count"], 2)
        self.assertIn("USD", c1["currencies"])
        event_titles = [e["title"] for e in c1["events"]]
        self.assertIn("Non-Farm Employment Change", event_titles)
        self.assertIn("Unemployment Rate", event_titles)
        self.assertNotIn("Average Hourly Earnings m/m", event_titles)

        # Cluster 2: 14:00:00Z should have 1 event
        c2 = clusters[1]
        self.assertEqual(c2["timestamp_utc"], "2026-09-08T14:00:00Z")
        self.assertEqual(c2["events_count"], 1)

    def test_parse_news_ai_response_valid_json_and_markdown(self):
        llm_output = """```json
{
  "volatility_level": "EXTREME",
  "expected_pips_range": "180 - 320 pips",
  "trend_type": "2_WAY_WHIPSAW",
  "prob_buy": 60.0,
  "prob_sell": 40.0,
  "scenario_better": "If actual NFP > 200K, Gold tests 2480.",
  "scenario_worse": "If actual NFP < 120K, Gold rallies to 2530.",
  "bot_guidance": "Pause bots 30m prior. Avoid market orders at 19:30."
}
```

# Detailed Macro & SMC Report
### 1. Macro Breakdown
The labor market is showing mixed signs of cooling...

### 2. SMC Liquidity Blueprint
Buy-side liquidity resting at 2520. Sell-side liquidity at 2485.
"""
        parsed = news_service.parse_news_ai_response(llm_output)
        self.assertEqual(parsed["volatility_level"], "EXTREME")
        self.assertEqual(parsed["expected_pips_range"], "180 - 320 pips")
        self.assertEqual(parsed["trend_type"], "2_WAY_WHIPSAW")
        self.assertEqual(parsed["prob_buy"], 60.0)
        self.assertEqual(parsed["prob_sell"], 40.0)
        self.assertIn("2480", parsed["scenario_better"])
        self.assertIn("Detailed Macro & SMC Report", parsed["analysis_markdown"])

    def test_save_and_retrieve_news_assessment_db(self):
        cluster_hash = "test_cluster_123"
        timestamp_utc = "2026-09-08T12:30:00Z"
        symbol = "XAUUSD"
        currencies = ["USD"]
        events = [{"title": "NFP", "country": "USD", "impact": "High"}]

        rec_id = database.save_news_assessment(
            cluster_hash=cluster_hash,
            timestamp_utc=timestamp_utc,
            symbol=symbol,
            currencies=currencies,
            events=events,
            volatility_level="HIGH",
            expected_pips_range="150 - 250 pips",
            trend_type="1_WAY_TREND",
            prob_buy=70.0,
            prob_sell=30.0,
            scenario_better="Surge",
            scenario_worse="Drop",
            bot_guidance="Pause 30m",
            analysis_markdown="## Macro test",
            ai_provider="qwen_api",
            ai_model="qwen3.7-flash",
            latency_ms=1200,
            user_notes="Important test"
        )
        self.assertIsInstance(rec_id, int)
        self.assertGreater(rec_id, 0)

        # Retrieve by cluster
        retrieved = database.get_news_assessment_by_cluster(cluster_hash, symbol)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["volatility_level"], "HIGH")
        self.assertEqual(retrieved["prob_buy"], 70.0)
        self.assertEqual(retrieved["user_notes"], "Important test")

        # Retrieve by id
        retrieved_id = database.get_news_assessment_by_id(rec_id)
        self.assertIsNotNone(retrieved_id)
        self.assertEqual(retrieved_id["id"], rec_id)

if __name__ == "__main__":
    unittest.main()
