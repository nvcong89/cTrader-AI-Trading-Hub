"""
cTrader Open API OAuth2 Helper
Automates OAuth2 authorization flow, launches local callback server,
opens browser for cTrader ID login, exchanges code for Access Token,
and supports manual Access Token entry as a fallback.
"""

import sys
import os
import urllib.parse
import webbrowser
import httpx
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import time

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), "ctrader_API.env")
    creds = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    creds[k.strip()] = v.strip()
    return creds, env_path

def save_token_to_env(access_token: str, account_id: str = None):
    creds, env_path = load_env()
    creds["ACCESS_TOKEN"] = access_token.strip()
    if account_id:
        creds["ACCOUNT_ID"] = str(account_id).strip()
        
    lines = []
    found_token = False
    found_acc = False
    
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                k = line.strip().split("=")[0].strip() if "=" in line else ""
                if k == "ACCESS_TOKEN":
                    lines.append(f"ACCESS_TOKEN={access_token.strip()}\n")
                    found_token = True
                elif k == "ACCOUNT_ID" and account_id:
                    lines.append(f"ACCOUNT_ID={str(account_id).strip()}\n")
                    found_acc = True
                else:
                    lines.append(line)
                    
        if not found_token:
            lines.append(f"ACCESS_TOKEN={access_token.strip()}\n")
        if account_id and not found_acc:
            lines.append(f"ACCOUNT_ID={str(account_id).strip()}\n")
    else:
        for k, v in creds.items():
            lines.append(f"{k}={v}\n")
            
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"[SUCCESS] Updated ACCESS_TOKEN in {os.path.basename(env_path)}")

class OAuthCallbackHandler(BaseHTTPRequestHandler):
    auth_code = None
    server_instance = None

    def log_message(self, format, *args):
        return

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "code" in params:
            OAuthCallbackHandler.auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            html = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>cTrader Open API - Authorization Success</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0b0f19; color: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #111827; border: 1px solid #10b981; border-radius: 12px; padding: 40px; text-align: center; max-width: 480px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                    h1 { color: #10b981; font-size: 24px; margin-bottom: 12px; }
                    p { color: #9ca3af; font-size: 15px; line-height: 1.5; }
                    .badge { background: #064e3b; color: #34d399; padding: 6px 14px; border-radius: 20px; font-weight: bold; display: inline-block; margin-top: 15px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>cTrader Authorization Successful!</h1>
                    <p>Access Token has been captured and verified. You can now close this browser window and return to the terminal test script.</p>
                    <div class="badge">Connected to Spotware Open API</div>
                </div>
            </body>
            </html>
            """
            self.wfile.write(html.encode("utf-8"))
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Error: Authorization code not found in callback.")

def acquire_access_token_via_browser(timeout_seconds: int = 60) -> str:
    """Launches local OAuth2 callback server, opens browser, and exchanges auth code for Access Token."""
    creds, _ = load_env()
    client_id = creds.get("clientID")
    secret = creds.get("secret")
    redirect_uri = creds.get("REDIRECT_URI", "http://localhost:5000/callback")
    
    if not client_id or not secret:
        raise ValueError("Missing clientID or secret in ctrader_API.env!")

    parsed_uri = urllib.parse.urlparse(redirect_uri)
    port = parsed_uri.port or 5000

    OAuthCallbackHandler.auth_code = None
    httpd = None
    try:
        httpd = HTTPServer(("localhost", port), OAuthCallbackHandler)
        OAuthCallbackHandler.server_instance = httpd
        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        server_thread.start()
    except Exception as e:
        print(f"[NOTE] Could not start local callback server on port {port}: {e}")

    # Formulate cTrader OAuth2 Auth URL
    auth_params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "trading"
    }
    auth_url = f"https://openapi.ctrader.com/apps/auth?{urllib.parse.urlencode(auth_params)}"
    
    print("\n" + "="*75)
    print(" [cTrader Open API OAuth2 Authorization]")
    print("="*75)
    print(f"Opening browser to authenticate your cTrader ID...")
    print(f"Direct Auth URL: {auth_url}\n")
    print(f"Current Redirect URI in .env: {redirect_uri}")
    print("="*75)
    print("LƯU Ý QUAN TRỌNG:")
    print("1. Nếu trang web báo lỗi 'Provided application does not contain provided URI':")
    print("   -> Bạn vào https://openapi.ctrader.com/apps, mở ứng dụng của bạn và xem mục 'Redirect URI'.")
    print(f"   -> Cập nhật đúng giá trị đó vào dòng REDIRECT_URI trong file ctrader_API.env")
    print("   -> HOẶC trên trang web https://openapi.ctrader.com/apps, bạn bấm 'Get Token' / copy Access Token và dán trực tiếp vào bên dưới.")
    print("="*75)
    
    try:
        webbrowser.open(auth_url)
    except Exception:
        pass

    # Wait for callback or manual paste
    print(f"\nĐang chờ cấp quyền tự động (Timeout: {timeout_seconds}s)...")
    print("Hoặc bạn có thể dán trực tiếp Access Token vào đây (nhấn Enter để bỏ qua):")
    
    # Non-blocking check for auth_code
    start_time = time.time()
    while OAuthCallbackHandler.auth_code is None and (time.time() - start_time < timeout_seconds):
        time.sleep(0.5)

    if httpd:
        try:
            httpd.shutdown()
        except Exception:
            pass

    if OAuthCallbackHandler.auth_code:
        auth_code = OAuthCallbackHandler.auth_code
        print(f"\n[SUCCESS] Captured Authorization Code: {auth_code[:12]}...")

        # Exchange Code for Access Token
        token_url = "https://openapi.ctrader.com/apps/token"
        token_params = {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": secret,
            "code": auth_code,
            "redirect_uri": redirect_uri
        }
        
        print("[INFO] Requesting Access Token from Spotware Token Endpoint...")
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(token_url, params=token_params)
            if resp.status_code != 200:
                raise ValueError(f"Token exchange failed ({resp.status_code}): {resp.text}")
                
            data = resp.json()
            access_token = data.get("accessToken")
            
            if not access_token:
                raise ValueError(f"No accessToken in response: {data}")

            print(f"[SUCCESS] Acquired Access Token: {access_token[:15]}...")
            save_token_to_env(access_token)
            return access_token
    else:
        # Prompt for manual token entry
        user_token = input("\n[INPUT] Vui lòng dán Access Token của bạn vào đây: ").strip()
        if user_token:
            save_token_to_env(user_token)
            return user_token
        raise TimeoutError("Chưa nhận được Access Token. Vui lòng kiểm tra Redirect URI trên https://openapi.ctrader.com/apps hoặc dán Access Token vào ctrader_API.env.")

if __name__ == "__main__":
    try:
        token = acquire_access_token_via_browser()
        print(f"\nFinal Access Token: {token}")
    except Exception as e:
        print(f"\n[ERROR] {e}")
