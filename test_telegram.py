import os
import sys
import datetime
import urllib.request
import urllib.parse
import json

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def load_telegram_env():
    token = ""
    chat_id = ""
    candidate_files = [
        os.path.join(os.path.dirname(__file__), "telegrame.env"),
        os.path.join(os.path.dirname(__file__), "telegram.env"),
        os.path.join(os.path.dirname(__file__), "telegram.env.example")
    ]
    
    env_file = None
    for f in candidate_files:
        if os.path.exists(f):
            env_file = f
            break

    if not env_file:
        return token, chat_id

    print(f"[INFO] Loading credentials from: {os.path.basename(env_file)}")
    try:
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        k = parts[0].strip().lower()
                        v = parts[1].strip()
                        if k in ["telegram_bot_token", "bot_token", "token"]:
                            token = v
                        elif k in ["telegram_chat_id", "groupid", "chat_id", "group_id"]:
                            chat_id = v
    except Exception as e:
        print(f"[ERROR] Failed to read {env_file}: {e}")

    return token, chat_id

def send_telegram_test():
    token, chat_id = load_telegram_env()

    if not token or not chat_id:
        print("❌ [ERROR] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.")
        print("👉 Vui lòng tạo file 'telegram.env' và điền:")
        print("TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN")
        print("TELEGRAM_CHAT_ID=YOUR_CHAT_ID")
        sys.exit(1)

    print(f"📡 [CONNECTING] Telegram API with Bot Token: {token[:8]}... | Chat ID: {chat_id}")

    now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    message = (
        f"🤖 <b>cTRADER AI TRADING HUB - TELEGRAM TEST</b>\n\n"
        f"✅ <b>Trạng thái:</b> Kết nối Telegram thành công!\n"
        f"🕒 <b>Thời gian:</b> <code>{now_str}</code>\n"
        f"🌐 <b>Máy chủ:</b> <code>cTrader-AI-Trading-Hub (VPS)</code>\n"
        f"📊 <b>Tính năng:</b> Sẵn sàng nhận thông báo Mở/Đóng lệnh & Cảnh báo rủi ro Drawdown từ cBots.\n\n"
        f"<i>Antigravity cTrader Agent System</i>"
    )

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = resp.read().decode("utf-8")
            res_json = json.loads(resp_body)
            if res_json.get("ok"):
                print("🎉 [THÀNH CÔNG] Tin nhắn Test đã được gửi tới Telegram Group/Chat thành công!")
                print(f"👉 Message ID: {res_json.get('result', {}).get('message_id')}")
            else:
                print(f"❌ [LỖI TỪ TELEGRAM API] {resp_body}")
    except urllib.error.HTTPError as he:
        err_msg = he.read().decode('utf-8')
        print(f"❌ [HTTP ERROR {he.code}] {err_msg}")
    except Exception as e:
        print(f"❌ [EXCEPTION] Không thể kết nối tới Telegram: {e}")

if __name__ == "__main__":
    send_telegram_test()
