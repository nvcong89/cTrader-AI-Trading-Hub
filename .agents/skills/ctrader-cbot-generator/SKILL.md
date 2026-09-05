---
name: ctrader-cbot-generator
description: Automated cBot generator for cTrader that instantiates new cBot projects following cTrader 5.x native solution/project hierarchy based on cbot_agent_template with Gemini AI Bridge, zero warnings, and full risk management.
---

# cTrader cBot Generator Agent Skill

Kỹ năng chuyên trách khởi tạo tự động các dự án cBot mới và duy trì tính nhất quán, tương thích tuyệt đối với **Gemini AI Agent Server** dựa trên chuẩn mẫu gốc **`cbot_agent_template`**.

---

## 🏛️ Quy Chuẩn Cốt Lõi (Core Standards)

### 1. 🌟 Master Reference Standard (`cbot_agent_template`)
Mọi cBot mới được tạo ra trong repository **BẮT BUỘC** phải lấy `cbot/cbot_agent_template/` làm khuôn mẫu gốc (Master Reference Template). Bot mới kế thừa toàn bộ hạ tầng bảo vệ, quản lý vốn, bộ lọc tin tức và kết nối AI Agent.

### 2. 🔄 Quy Tắc Đồng Bộ Ngược Liên Tục (Continuous Master Template Sync Rule)
- **MANDATORY**: Bất kỳ khi nào có chỉnh sửa code, vá lỗi hệ thống (Bug Fix), nâng cấp kiến trúc hoặc tối ưu hóa hiệu năng cho bất kỳ cBot nào trong repository (ví dụ: an toàn luồng Main Thread, đồng bộ Live Tick Telemetry `/api/tick`, cơ chế `BeginInvokeOnMainThread`, sửa lỗi News Feed Fallback, chống lock SQLite, bọc an toàn `Chart != null` cho CLI headless, v.v.), thay đổi đó **PHẢI ĐƯỢC ĐỒNG THỜI CẬP NHẬT NGƯỢC LẠI CHO `cbot_agent_template`**.
- **Mục đích**: Đảm bảo `cbot_agent_template` luôn luôn là phiên bản hoàn hảo nhất, không bị lỗi thời và không bị lặp lại các lỗi đã được sửa khi tạo bot mới.

### 3. 🤖 Tương Thích Tuyệt Đối Với Gemini AI Agent Bridge
Mỗi cBot mới sinh ra phải hỗ trợ đầy đủ 4 kênh tương tác với máy chủ Python FastAPI:
1. **Market Snapshot (`POST /trade`)**: Gửi dữ liệu nến, chỉ báo kỹ thuật, danh sách lệnh mở, lịch sử đóng lệnh gần nhất theo chu kỳ nến hoặc OnStart.
2. **Live Tick Telemetry (`POST /api/tick`)**: Truyền tick thời gian thực để máy chủ tính toán Unrealized PnL ($ / Pips) trực tiếp. **LƯU Ý**: Toàn bộ dữ liệu cTrader API (`Positions`, `Account`, `Symbol`) phải được trích xuất đồng bộ trên **Main Thread** trước khi chuyển qua `Task.Run` ngầm.
3. **Portfolio Trade Reporting (`POST /portfolio/report`)**: Tự động báo cáo sự kiện khớp lệnh (Open) và đóng lệnh (Close) lên cơ sở dữ liệu `portfolio.db`.
4. **AI Decision Execution (`ExecuteDecision`)**: Thực thi quyết định trả về từ AI Agent (`BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL`) qua `BeginInvokeOnMainThread`.

### 4. 🏗️ Cấu Trúc Solution/Project Chuẩn cTrader 5.x Native
Mỗi cBot được sinh ra tuân thủ chính xác cấu trúc thư mục native của cTrader Automate:
```
cbot/<BotName>/
├── <BotName>.sln
└── <BotName>/
    ├── <BotName>.cs (1 file C# duy nhất chứa toàn bộ logic chiến thuật)
    ├── <BotName>.csproj (MSBuild project file)
    └── GlobalUsings.cs (Global using directives)
```

### 5. 🛡️ Tiêu Chuẩn Zero Warning & Headless Execution Safety
- `private readonly bool Unlimited_License` (tránh cảnh báo CS0162 Unreachable Code).
- `#pragma warning disable SYSLIB0014` cho HttpWebRequest News Filter.
- `#pragma warning disable CS0618` cho ModifyPosition Break-Even/Trailing.
- Toàn bộ Chart API (`DrawStaticText`, `TakeChartshot`, `DrawFibonacciRetracement`) phải được bọc trong `if (Chart != null)` để hoạt động an toàn 100% trong môi trường CLI headless / Backtest.

### 6. 📝 Tự Động Sinh Tài Liệu Chiến Thuật (`docs/<BotName>.md`)
Mỗi bot mới được tạo ra phải đi kèm file tài liệu Markdown chuẩn 6 phần:
1. Tổng quan & Triết lý chiến thuật.
2. Hệ thống phân tích kỹ thuật (TA Engine).
3. Tích hợp Gemini AI Agent.
4. Quản lý vốn & Rủi ro.
5. Bộ lọc tin tức ForexFactory.
6. Bảng tham số cấu hình (Parameter Reference Table).

---

## 🚀 Quy Trình Khởi Tạo cBot Mới

### Bước 1: Chạy Script Khởi Tạo
Sử dụng script PowerShell tự động trong thư mục kỹ năng:
```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/ctrader-cbot-generator/scripts/generate_cbot.ps1 -NewBotName "My_Custom_Bot_Name" -StrategyDescription "Mô tả chiến thuật..."
```

### Bước 2: Tinh Chỉnh Chỉ Báo & Logic Chiến Thuật
Mở file `cbot/<NewBotName>/<NewBotName>/<NewBotName>.cs` và tùy chỉnh:
- `InitializeStrategyIndicators()`: Khởi tạo các chỉ báo theo chiến thuật mong muốn.
- `buyCondition()` / `sellCondition()`: Điều kiện vào lệnh kỹ thuật.
- `closeBuyCondition()` / `closeSellCondition()`: Điều kiện đóng lệnh kỹ thuật.
- `StrategyData`: Cấu trúc dữ liệu chỉ báo gửi cho AI Agent trong Market Snapshot.

### Bước 3: Biên Dịch & Kiểm Thử Gói `.algo`
```powershell
dotnet build "cbot/<NewBotName>/<NewBotName>/<NewBotName>.csproj" -c Release
```
Kiểm tra kết quả đảm bảo: **0 Errors, 0 Warnings** và file `.algo` được tạo tại `cbot/<NewBotName>.algo`.
