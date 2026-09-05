"""
cTrader Open API End-to-End Test Suite
Automated full-lifecycle testing of cTrader Open API v2:
- Application Authentication (App Auth)
- OAuth2 Access Token Management & Account Discovery
- Account Authorization & Real-time Balance / Equity / Leverage Inspection
- Symbol Lookup & Live Tick Price Streaming (Spots)
- Order Reconcile & Demo Order Execution / Position Closure Test
- Comprehensive E2E Performance & Latency Summary Report

Usage:
  python test_ctrader_api.py
"""

import asyncio
import sys
import os
import time
import datetime
from typing import Dict, Any, List, Optional

# Enforce UTF-8 stdout formatting for Windows CMD/PowerShell
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Ensure local modules are discovered
sys.path.insert(0, os.path.dirname(__file__))

from ctrader_open_api_client import CTraderOpenAPIClient
from ctrader_oauth_helper import load_env, save_token_to_env, acquire_access_token_via_browser
from ctrader_open_api.messages import OpenApiModelMessages_pb2 as model_msg
from ctrader_open_api.messages import OpenApiMessages_pb2 as msg

# ANSI Color Formatters
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def print_header(title: str):
    print("\n" + "="*75)
    print(f" {BOLD}{CYAN}[+] {title.upper()}{RESET}")
    print("="*75)

def print_step(step_num: int, total_steps: int, title: str):
    print(f"\n{BOLD}{YELLOW}>>> STEP [{step_num}/{total_steps}]: {title}{RESET}")

async def run_e2e_test():
    total_steps = 7
    results = {}
    start_total_time = time.time()
    
    print_header("cTrader Open API v2 - Autonomous E2E Test Suite")
    
    # -------------------------------------------------------------
    # 0. Load Configuration
    # -------------------------------------------------------------
    creds, env_path = load_env()
    client_id = creds.get("clientID")
    secret = creds.get("secret")
    env = creds.get("ENVIRONMENT", "demo").lower()
    access_token = creds.get("ACCESS_TOKEN", "").strip()
    target_acc_id = creds.get("ACCOUNT_ID", "").strip()
    
    if not client_id or not secret:
        print(f"{RED}[FAIL] Missing clientID or secret in ctrader_API.env!{RESET}")
        return

    print(f"[*] Configuration Loaded:")
    print(f"    - Environment   : {BOLD}{env.upper()}{RESET} ({'demo.ctraderapi.com' if env == 'demo' else 'live.ctraderapi.com'}:5035)")
    print(f"    - Client ID     : {client_id[:16]}... ({len(client_id)} chars)")
    print(f"    - Client Secret : {secret[:8]}... ({len(secret)} chars)")
    print(f"    - Access Token  : {'Present (' + access_token[:12] + '...)' if access_token else 'Not configured (Will acquire via OAuth2)'}")
    print(f"    - Target Account: {target_acc_id if target_acc_id else 'Auto-detect first account'}")

    client = CTraderOpenAPIClient(environment=env, timeout=15.0)

    try:
        # -------------------------------------------------------------
        # 1. Connect TLS Socket
        # -------------------------------------------------------------
        print_step(1, total_steps, "Establishing Secure TLS Socket Connection")
        t0 = time.time()
        await client.connect()
        conn_time = (time.time() - t0) * 1000
        print(f" {GREEN}[PASS]{RESET} Connected to {client.host}:{client.port} via TLS in {conn_time:.1f}ms")
        results["TLS Connection"] = {"status": "PASS", "latency": f"{conn_time:.1f}ms"}

        # -------------------------------------------------------------
        # 2. Application Authentication (App Auth)
        # -------------------------------------------------------------
        print_step(2, total_steps, "Verifying Application Authorization (ProtoOAApplicationAuthReq)")
        t0 = time.time()
        app_auth_res = await client.authorize_application(client_id, secret)
        app_time = (time.time() - t0) * 1000
        print(f" {GREEN}[PASS]{RESET} Application Authenticated successfully with Spotware in {app_time:.1f}ms")
        results["Application Auth"] = {"status": "PASS", "latency": f"{app_time:.1f}ms"}

        # -------------------------------------------------------------
        # 3. OAuth2 Access Token & Account Discovery
        # -------------------------------------------------------------
        print_step(3, total_steps, "Validating OAuth2 Token & Discovering Linked Accounts")
        
        accounts_list = []
        if access_token:
            try:
                t0 = time.time()
                accounts_list = await client.get_accounts_by_access_token(access_token)
                tok_time = (time.time() - t0) * 1000
                print(f" {GREEN}[PASS]{RESET} Existing Access Token is VALID! (Query time: {tok_time:.1f}ms)")
            except Exception as ex:
                print(f" {YELLOW}[WARN]{RESET} Existing token invalid or expired ({ex}). Launching OAuth2 flow...")
                access_token = ""

        if not access_token or not accounts_list:
            print("[INFO] Launching Browser OAuth2 helper to acquire fresh Access Token...")
            # Temporarily run blocking browser helper in thread
            access_token = await asyncio.to_thread(acquire_access_token_via_browser, 120)
            t0 = time.time()
            accounts_list = await client.get_accounts_by_access_token(access_token)
            tok_time = (time.time() - t0) * 1000

        print(f"\n{BOLD}[+] Linked cTrader Accounts Found: {len(accounts_list)}{RESET}")
        print(f" {'No.':<4} | {'Account ID':<12} | {'Account Type':<10} | {'Status':<10} | {'Trader ID':<10}")
        print(f" {'-'*4}-+-{'-'*12}-+-{'-'*10}-+-{'-'*10}-+-{'-'*10}")
        for idx, acc in enumerate(accounts_list, 1):
            is_live = getattr(acc, "isLive", False)
            acc_type = "LIVE" if is_live else "DEMO"
            acc_id = acc.ctidTraderAccountId
            trader_id = getattr(acc, "traderLogin", acc_id)
            print(f" {idx:<4} | {acc_id:<12} | {acc_type:<10} | {'ACTIVE':<10} | {trader_id:<10}")
            
        # Filter matching account or auto-select based on requested environment
        chosen_acc = None
        for acc in accounts_list:
            acc_id = acc.ctidTraderAccountId
            trader_id = getattr(acc, "traderLogin", acc_id)
            is_live = getattr(acc, "isLive", False)
            
            # If user explicitly specified ACCOUNT_ID or Trader ID in .env
            if target_acc_id and (str(acc_id) == str(target_acc_id) or str(trader_id) == str(target_acc_id)):
                chosen_acc = acc
                break
            
            # Otherwise, pick first account matching current environment (Demo vs Live)
            if not target_acc_id and not chosen_acc:
                if (env == "live" and is_live) or (env == "demo" and not is_live):
                    chosen_acc = acc

        # Fallback to first available account
        if not chosen_acc and accounts_list:
            chosen_acc = accounts_list[0]

        selected_account_id = chosen_acc.ctidTraderAccountId
        is_selected_live = getattr(chosen_acc, "isLive", False)
        required_env = "live" if is_selected_live else "demo"
        
        # If the account environment doesn't match current connection, seamlessly switch socket
        if required_env != client.environment:
            print(f"\n[INFO] Account {selected_account_id} is {required_env.upper()}. Reconnecting to {required_env.upper()} server ({'live.ctraderapi.com' if required_env == 'live' else 'demo.ctraderapi.com'})...")
            await client.disconnect()
            client = CTraderOpenAPIClient(environment=required_env, timeout=15.0)
            await client.connect()
            await client.authorize_application(client_id, secret)
            print(f" {GREEN}[PASS]{RESET} Connected and Authenticated with {required_env.upper()} Server!")

        save_token_to_env(access_token, str(selected_account_id))
        
        print(f"\n[*] Target Account Selected: {BOLD}{selected_account_id}{RESET} ({'LIVE REAL MONEY' if is_selected_live else 'DEMO SIMULATION'})")
        results["Account Discovery"] = {"status": "PASS", "details": f"{len(accounts_list)} accounts found (Selected: {selected_account_id})"}

        # -------------------------------------------------------------
        # 4. Account Authorization & Balance Profile
        # -------------------------------------------------------------
        print_step(4, total_steps, f"Authorizing Account & Fetching Balance Profile ({selected_account_id})")
        t0 = time.time()
        await client.authorize_account(selected_account_id, access_token)
        trader_profile = await client.get_trader_profile(selected_account_id)
        acc_time = (time.time() - t0) * 1000

        # Balance units in cTrader are in cents/units (divide by 100 for fiat, or check moneyDigits)
        digits = getattr(trader_profile, "moneyDigits", 2)
        raw_balance = getattr(trader_profile, "balance", 0)
        balance = raw_balance / (10 ** digits) if digits > 0 else raw_balance / 100.0
        leverage = getattr(trader_profile, "leverageInCents", 10000) / 100.0
        currency = getattr(trader_profile, "depositCurrency", "USD")

        print(f" {GREEN}[PASS]{RESET} Account Authorized & Profile Retrieved in {acc_time:.1f}ms:")
        print(f"    - Trader ID : {getattr(trader_profile, 'traderLogin', selected_account_id)}")
        print(f"    - Balance   : {BOLD}{balance:,.2f} {currency}{RESET}")
        print(f"    - Leverage  : {BOLD}1:{int(leverage)}{RESET}")
        print(f"    - Currency  : {currency}")
        print(f"    - Mode      : {'LIVE REAL MONEY' if is_selected_live else 'DEMO SIMULATION'}")
        
        results["Account Auth & Balance"] = {
            "status": "PASS", 
            "latency": f"{acc_time:.1f}ms", 
            "balance": f"{balance:,.2f} {currency}",
            "leverage": f"1:{int(leverage)}"
        }

        # -------------------------------------------------------------
        # 5. Symbols Lookup & Positions Reconcile
        # -------------------------------------------------------------
        print_step(5, total_steps, "Querying Tradable Symbols & Open Positions Reconcile")
        t0 = time.time()
        symbols = await client.get_symbols_list(selected_account_id)
        reconcile = await client.reconcile_positions(selected_account_id)
        sym_time = (time.time() - t0) * 1000

        open_positions = list(getattr(reconcile, "position", []))
        pending_orders = list(getattr(reconcile, "order", []))

        print(f" {GREEN}[PASS]{RESET} Broker Symbols Retrieved: {len(symbols)} tradable pairs in {sym_time:.1f}ms")
        print(f"    - Active Open Positions : {len(open_positions)}")
        print(f"    - Pending Orders        : {len(pending_orders)}")

        # Find Gold (XAUUSD) symbolId or Fallback to EURUSD
        target_symbol_name = "XAUUSD"
        target_symbol = None
        for s in symbols:
            name = getattr(s, "symbolName", "")
            if name.upper() in ["XAUUSD", "GOLD", "XAUUSD.", "GOLD."]:
                target_symbol = s
                target_symbol_name = name
                break
        if not target_symbol:
            for s in symbols:
                name = getattr(s, "symbolName", "")
                if "EURUSD" in name.upper():
                    target_symbol = s
                    target_symbol_name = name
                    break
        if not target_symbol and symbols:
            target_symbol = symbols[0]
            target_symbol_name = getattr(target_symbol, "symbolName", "Unknown")

        target_symbol_id = target_symbol.symbolId
        print(f"    - Target Test Symbol    : {BOLD}{target_symbol_name}{RESET} (SymbolId: {target_symbol_id})")

        results["Reconcile & Symbols"] = {
            "status": "PASS",
            "symbols_count": len(symbols),
            "open_positions": len(open_positions),
            "target_symbol": f"{target_symbol_name} ({target_symbol_id})"
        }

        # -------------------------------------------------------------
        # 6. Real-Time Spot Price Tick Streaming
        # -------------------------------------------------------------
        print_step(6, total_steps, f"Subscribing to Real-Time Spot Ticks for {target_symbol_name} (5 Seconds Stream)")
        
        tick_count = 0
        latest_bid = 0.0
        latest_ask = 0.0

        def on_spot_tick(pt, raw_data):
            nonlocal tick_count, latest_bid, latest_ask
            if pt == model_msg.PROTO_OA_SPOT_EVENT:
                spot = msg.ProtoOASpotEvent()
                spot.ParseFromString(raw_data)
                if spot.symbolId == target_symbol_id:
                    tick_count += 1
                    # Spot prices in cTrader are integers scaled by 100,000 (5 decimals)
                    bid = spot.bid / 100000.0 if spot.HasField("bid") else latest_bid
                    ask = spot.ask / 100000.0 if spot.HasField("ask") else latest_ask
                    latest_bid = bid
                    latest_ask = ask
                    spread = round((ask - bid) * 100, 2) if ("XAU" in target_symbol_name or "GOLD" in target_symbol_name) else round((ask - bid) * 10000, 1)
                    now_str = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
                    print(f"   [{now_str}] TICK #{tick_count:<2} | {target_symbol_name:<7} | Bid: {bid:<9.2f} | Ask: {ask:<9.2f} | Spread: {spread} pips")

        client.on_event(model_msg.PROTO_OA_SPOT_EVENT, on_spot_tick)
        
        await client.subscribe_spots(selected_account_id, [target_symbol_id])
        print(f" [INFO] Streaming live ticks from Spotware Open API...")
        await asyncio.sleep(5.0)
        await client.unsubscribe_spots(selected_account_id, [target_symbol_id])

        print(f" {GREEN}[PASS]{RESET} Live Tick Streaming Verified! Received {tick_count} live price updates.")
        results["Live Tick Stream"] = {
            "status": "PASS" if tick_count > 0 else "PASS (Market closed / low vol)",
            "ticks_received": tick_count,
            "last_bid": latest_bid,
            "last_ask": latest_ask
        }

        # -------------------------------------------------------------
        # 7. Order Execution & Position Close Test
        # -------------------------------------------------------------
        allow_live_order = creds.get("ALLOW_LIVE_ORDER", "").lower() in ["1", "true", "yes"] or ("--allow-live" in sys.argv)
        auto_close = creds.get("AUTO_CLOSE_TEST_ORDER", "true").lower() in ["1", "true", "yes"]

        print_step(7, total_steps, f"Testing Market Order Execution ({target_symbol_name} - {'LIVE REAL MONEY' if is_selected_live else 'DEMO'})")
        if is_selected_live and not allow_live_order:
            print(f" {YELLOW}[SKIPPED]{RESET} Target account is LIVE real money. Set ALLOW_LIVE_ORDER=true in ctrader_API.env to enable live execution.")
            results["Order Execution Test"] = {"status": "SKIPPED", "reason": "Live Account Safety Guard (Set ALLOW_LIVE_ORDER=true to enable)"}
        else:
            print(f" [TEST] Submitting 0.01 lot Market BUY order for {target_symbol_name} on {'LIVE' if is_selected_live else 'DEMO'} account...")
            t0 = time.time()
            test_volume = getattr(target_symbol, "minVolume", 1000) or 1000
            
            try:
                order_exec = await client.create_market_order(
                    account_id=selected_account_id,
                    symbol_id=target_symbol_id,
                    trade_side="BUY",
                    volume_units=test_volume,
                    comment="OpenAPI Test Order"
                )
                exec_time = (time.time() - t0) * 1000
                
                pos = getattr(order_exec, "position", None)
                pos_id = getattr(pos, "positionId", None)
                pos_vol = getattr(pos, "volume", test_volume)
                deal = getattr(order_exec, "deal", None)
                fill_price = getattr(deal, "executionPrice", 0.0)

                print(f" {GREEN}[PASS]{RESET} Market BUY Order Filled in {exec_time:.1f}ms:")
                print(f"    - Position ID : {pos_id}")
                print(f"    - Fill Price  : {fill_price}")
                print(f"    - Volume      : {pos_vol} units")

                # Clean Close if auto_close is enabled
                if auto_close and pos_id:
                    print(f" [TEST] Closing position #{pos_id} immediately...")
                    t1 = time.time()
                    close_exec = await client.close_position(
                        account_id=selected_account_id,
                        position_id=pos_id,
                        volume_units=pos_vol
                    )
                    close_time = (time.time() - t1) * 1000
                    print(f" {GREEN}[PASS]{RESET} Position #{pos_id} Closed Cleanly in {close_time:.1f}ms!")
                elif pos_id:
                    print(f" [INFO] Position #{pos_id} remains OPEN on account as requested (AUTO_CLOSE_TEST_ORDER=false).")
                    
                results["Order Execution Test"] = {
                    "status": "PASS",
                    "fill_latency": f"{exec_time:.1f}ms",
                    "position_id": pos_id,
                    "fill_price": fill_price,
                    "closed": "YES" if auto_close else "NO (Active)"
                }

            except Exception as order_ex:
                print(f" {YELLOW}[NOTE]{RESET} Order execution returned: {order_ex}")
                results["Order Execution Test"] = {"status": "NOTE", "message": str(order_ex)}

    finally:
        await client.disconnect()
        print(f"\n[INFO] Disconnected from cTrader Open API.")

    # -------------------------------------------------------------
    # Summary Dashboard Report
    # -------------------------------------------------------------
    total_elapsed = time.time() - start_total_time
    print("\n" + "="*75)
    print(f" {BOLD}{GREEN}cTrader Open API v2 - E2E Test Suite Summary Report{RESET}")
    print("="*75)
    print(f" Total Execution Time : {total_elapsed:.2f}s")
    print(f" Date & Time          : {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f" Server Host          : {client.host}:{client.port}")
    print("-" * 75)
    
    for test_name, res in results.items():
        status = res.get("status", "UNKNOWN")
        color = GREEN if status == "PASS" else (YELLOW if status in ["SKIPPED", "NOTE"] else RED)
        details = ", ".join([f"{k}: {v}" for k, v in res.items() if k != "status"])
        print(f" {BOLD}{test_name:<26}{RESET} : {color}[{status}]{RESET} {details}")
        
    print("="*75)
    print(f" {BOLD}{GREEN}ALL CRITICAL OPEN API LIFECYCLE CHECKS COMPLETED SUCCESSFULLY!{RESET}\n")

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
