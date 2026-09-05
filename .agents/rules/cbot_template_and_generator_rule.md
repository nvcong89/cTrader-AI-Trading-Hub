# cBot Master Template & Automated Generator Rule

Tài liệu quy chuẩn bắt buộc (**Mandatory Rule**) áp dụng cho toàn bộ quá trình phát triển, khởi tạo và bảo trì cBot trong dự án `cTrader-AI-Trading-Hub`.

---

## 1. 🌟 Quy Chuẩn Mẫu Gốc (Master Reference Template Standard)
- Mọi cBot mới được xây dựng trong dự án **BẮT BUỘC** phải được khởi tạo từ mẫu chuẩn gốc:
  `cbot/cbot_agent_template/`
- Bot mới phải giữ lại đầy đủ kiến trúc hạ tầng cốt lõi:
  1. **Gemini AI Agent Bridge**: Snapshot `/trade`, Live Telemetry `/api/tick`, Báo cáo vị thế `/portfolio/report`, Xử lý quyết định `ExecuteDecision`.
  2. **Quản lý vốn & Rủi ro**: Dynamic Volume (`Fixed` / `% Equity`), SL/TP (`Pips` / `% Equity`), Circuit Breaker giảm 50% rủi ro khi DD chạm ngưỡng.
  3. **Bảo vệ vị thế**: Break-Even tự động, Trailing Stop Loss, Lưới DCA.
  4. **Bộ lọc tin tức**: ForexFactory News Filter (JSON + XML fallback).
  5. **An toàn Headless**: Bọc `Chart != null` cho toàn bộ Chart API.

---

## 2. 🔄 Quy Tắc Đồng Bộ Ngược Liên Tục (Continuous Master Template Synchronization Rule)
- **MANDATORY**: Khi có bất kỳ chỉnh sửa code, nâng cấp tính năng, tối ưu hóa hoặc vá lỗi hệ thống (Bug Fix) nào trên **bất kỳ cBot nào trong dự án** (ví dụ: vá lỗi luồng Main Thread trong `SendLiveTickTelemetry`, xử lý `BeginInvokeOnMainThread`, sửa kết nối SQLite WAL, cơ chế News Fetch, v.v.), thay đổi đó **PHẢI ĐƯỢC ĐỒNG THỜI CẬP NHẬT NGƯỢC LẠI CHO `cbot_agent_template`**.
- **Mục đích**: Bảo đảm `cbot_agent_template` luôn luôn là phiên bản hoàn hảo nhất, không bị lỗi thời và không bị lặp lại các lỗi đã được sửa khi tạo bot mới.

---

## 3. 🤖 Tương Thích Tuyệt Đối Với Gemini AI Server
Mọi cBot phải hỗ trợ đầy đủ 4 kênh tương tác với máy chủ Python FastAPI:
- `POST /trade`: Gửi Market Snapshot theo chu kỳ nến.
- `POST /api/tick`: Truyền live tick (toàn bộ dữ liệu cTrader API `Positions`, `Account`, `Symbol` phải được chụp đồng bộ trên Main Thread trước khi chuyển sang `Task.Run`).
- `POST /portfolio/report`: Báo cáo mở/đóng lệnh lên database.
- `ExecuteDecision`: Tiếp nhận quyết định AI (`BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL`) qua `BeginInvokeOnMainThread`.

---

## 4. 📁 Kiến Trúc cTrader 5.x Native
Mỗi cBot được tổ chức theo chuẩn solution/project 5.x:
```
cbot/<BotName>/
├── <BotName>.sln
└── <BotName>/
    ├── <BotName>.cs (1 file C# duy nhất)
    ├── <BotName>.csproj
    └── GlobalUsings.cs
```

---

## 5. 🛠️ Quy Trình Khởi Tạo Bot Tự Động
Sử dụng agent skill và script tự động:
```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-cbot-generator/scripts/generate_cbot.ps1 -NewBotName "<Bot_Name>" -StrategyDescription "<Mô tả chiến thuật>"
```
Biên dịch kiểm thử gói `.algo`:
```powershell
dotnet build "cbot/<Bot_Name>/<Bot_Name>/<Bot_Name>.csproj" -c Release
```
Đảm bảo **0 Warnings, 0 Errors** trước khi đưa vào sử dụng.
