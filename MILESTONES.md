# 🏆 Milestone & Stable Releases Log (Happy Commits)

Tài liệu lưu trữ các cột mốc phiên bản ổn định (**Stable Releases / Happy Commits**) của dự án `cTrader-AI-Trading-Hub`. Nơi ghi nhận các phiên bản hoạt động trơn tru, đầy đủ tính năng để dễ dàng theo dõi, đánh dấu hoặc khôi phục (checkout/rollback) khi cần.

---

## 📑 Bảng Tổng Hợp Cột Mốc Ổn Định (Milestones Index)

| Phiên Bản / Tag | Commit Hash | Ngày Đạt Được | Trạng Thái | Điểm Nhấn Chính |
| :--- | :---: | :---: | :---: | :--- |
| **`v1.9.1-adaptive-cpu-gated-startup`** | `HEAD` | 02/09/2026 | ⭐ **Hoạt động ổn định** | **Adaptive Dynamic CPU-Gated Sequential Startup (< 40% CPU threshold)**, Real-time VPS Telemetry (CPU/RAM HUD & Modal), WebSocket Log Stream & Instant Cache Render |
| **`v1.9.0-bulk-fleet-and-smart-protection`** | [`2d06bdb`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/2d06bdb) | 01/09/2026 | ⭐ **Hoạt động ổn định** | **Bulk Fleet Controls (Start All / Stop All / Restart All)** với **60s Staggered Startup**, Realtime Fast Polling & Smart Trailing SL Protection |
| **`v1.8.0-trade-history-analytics`** | [`aecbbd0`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/aecbbd0) | 27/08/2026 | ⭐ **Hoạt động ổn định** | Ra mắt **Tab "Trade History"**, Bảng thống KPI (**Net Profit, Win Rate, Profit Factor**), Bộ lọc đa chiều & Xuất CSV |
| **`v1.7.0-agent-ai-hub`** | [`aecbbd0`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/aecbbd0) | 27/08/2026 | ⭐ **Hoạt động ổn định** | Ra mắt **Tab "Agent AI"**, Hỗ trợ đa nguồn AI (**Gemini Web, Gemini API, DeepSeek R1/V3, OpenAI**) & Live Ping Test |

---

## 🌟 Chi Tiết Các Cột Mốc Phiên Bản

---

### 📌 Cột Mốc: `v1.9.1-adaptive-cpu-gated-startup`
- **Ngày hoàn thành**: 02/09/2026
- **Trạng thái**: ⭐ Hoạt động hoàn hảo, 0 lỗi, React Build 100% clean, pytest 16/16 Passed.
- **Nội dung & Tính năng nổi bật**:
  1. **Khởi Chạy Tuần Tự Điều Tiết Theo Tải CPU VPS (Adaptive Dynamic CPU-Gated Startup)**:
     - Khi bấm `Start All` hoặc `Restart All`, hệ thống đo tải CPU thời gian thực qua `psutil`. Sau khi bật một bot, hệ thống chờ 10s ổn định và liên tục đo CPU mỗi 2s. Khi **CPU VPS < 40%** (xác nhận 2 lần liên tiếp), hệ thống mới kích hoạt bot tiếp theo, kèm cơ chế timeout an toàn 90s để chống nghẽn fleet.
  2. **Modal Cấu Hình Trực Quan (Bulk Action Config Modal)**:
     - Hiển thị đồng hồ đo CPU % & RAM % trực tiếp của VPS, thanh trượt cài đặt ngưỡng CPU (mặc định 40%), thời gian nghỉ tối thiểu (10s), và timeout tối đa (90s).
  3. **Thanh Đo Tài Nguyên VPS Trên Dashboard (Real-time HUD)**:
     - Hiển thị chip trạng thái `VPS CPU: X%` và `RAM: Y%` thời gian thực trên cả Sidebar Desktop và Mobile Header.
  4. **Nạp Giao Diện Siêu Tốc (Zero-Wait Instant Render)**:
     - Tự động nạp dữ liệu từ LocalStorage Cache giúp Dashboard hiển thị trong 0.05s khi refresh trang, kèm Axios Timeout 8s và nút Thử kết nối lại (Retry).
  5. **Luồng Log Trực Tiếp Đa Tầng (Live Log Streamer + HTTP Fallback)**:
     - Khắc phục lỗi ngắt WebSocket bằng cơ chế tự tạo file log và nạp snapshot HTTP tức thì kèm fallback polling 3s.
  6. **Hỗ Trợ Màu Sắc ANSI Trên Windows Server Console**:
     - Bật cờ `ENABLE_VIRTUAL_TERMINAL_PROCESSING` và `colorama` giúp log trên VPS hiển thị màu xanh chuẩn như máy Local.
- **Commit Hash**: `2d06bdb`
- **Ngày hoàn thành**: 01/09/2026
- **Trạng thái**: ⭐ Hoạt động hoàn hảo, 0 lỗi, React Build 100% clean, cTrader 5.x Native Build 0 Warnings.
- **Nội dung & Tính năng nổi bật**:
  1. **Bộ Điều Khiển Fleet Hàng Loạt (Bulk Fleet Controls)**:
     - Tích hợp cụm nút `Start All`, `Stop All`, `Restart All` phong cách Glassmorphism ngay trên tiêu đề mục Live Running Bot Fleet.
  2. **Cơ Chế Staggered Startup 60 Giây Bất Đồng Bộ (Non-Blocking Async)**:
     - Tự động giãn cách 60 giây giữa các lượt khởi chạy bot trong nền qua `asyncio.create_task` và `await asyncio.sleep(60.0)`, bảo vệ tuyệt đối CPU và RAM VPS và tránh xung đột xác thực cTrader CLI.
  3. **Cơ Chế Fast Polling Real-Time**:
     - Web tự động quét trạng thái định kỳ 3 giây/lần trong suốt 240 giây khởi động để các bot chuyển màu xanh `RUNNING` trực tiếp trên giao diện mà không cần reload trang.
  4. **Cấu Trúc Swing Đa Khung Thời Gian (HH, HL, LH, LL)**:
     - Quét và nhận diện các đỉnh đáy kỹ thuật Swing Structure (M15, H1, H4) và truyền vào Market Snapshot cho AI đưa ra SL/TP chuẩn SMC.
  5. **Tự Động Chuyển Đổi Trailing SL Dương (Positive Trailing SL Auto-Mapping)**:
     - Tự động nhận diện mức TP điều chỉnh nằm giữa Entry và Market Price để dời SL dương khóa lãi, đồng thời bảo tồn mục tiêu TP cấu trúc lớn ban đầu.
  6. **Cơ Chế Bảo Vệ Stop Loss Lai (Hybrid Smart SL Protection Engine)**:
     - Đóng lệnh chốt lời ngay nếu SL bị vi phạm khi lệnh đang dương; hoặc giữ nguyên SL ban đầu nếu lệnh đang âm để ngăn ngừa Stop-out non và lỗi từ chối của broker.
  7. **Khắc Phục Lỗi Router FastAPI & An Toàn Render React**:
     - Sắp xếp thứ tự route `/api/bots/bulk/*` lên trước `/{bot_id}/*` và chuẩn hóa hàm `formatErrorMessage` bảo vệ React DOM không bao giờ bị crash màn hình đen.

---

### 📌 Cột Mốc: `v1.8.0-trade-history-analytics`
- **Ngày hoàn thành**: 27/08/2026
- **Trạng thái**: ⭐ Hoạt động hoàn hảo, 0 lỗi, React Build 100% clean.
- **Nội dung & Tính năng nổi bật**:
  1. **Tab "Trade History" chuyên biệt**: Quản lý toàn diện sổ lệnh đã đóng và phân tích hiệu suất thuật toán.
  2. **Thanh Thống Kê KPI Thời Gian Thực**: Tổng Lợi Nhuận Ròng (Net Profit $), Tỷ lệ Thắng (Win Rate %), Profit Factor (Lãi gộp / Lỗ gộp), và Lợi nhuận trung bình/lệnh.
  3. **Bộ Lọc Đa Chiều (Multi-Dimensional Filters)**: Lọc theo từng Bot, Cặp tiền (Symbol), Khoảng thời gian (Today / 7D / 30D / All Time), Kết quả (Wins / Losses), và tìm kiếm mã ID.
  4. **Xuất Báo Cáo 1-Click (Export to CSV)**: Tải toàn bộ dữ liệu lịch sử về máy tính để sao kê hoặc phân tích bằng Excel/Python.
  5. **Bảng Ma Trận Lệnh Đã Đóng Chi Tiết**: Thể hiện ID, Bot ID, Loại Lệnh, Volume, Giá Vào/Ra, Lời/Lỗ ($ & Pips), Thời Lượng (Duration), và Lý Do Đóng (TP, SL, AI, Manual).

---

### 📌 Cột Mốc: `v1.7.0-agent-ai-hub`
| **`v1.6.2-real-broker-close`** | [`0c2c84d`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/0c2c84d) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Đóng lệnh **thực tế trực tiếp trên Broker Spotware** qua cTrader CLI engine |
| **`v1.6.1-stability-fix`** | [`a2d2fc1`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/a2d2fc1) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Khắc phục triệt để **hiện tượng chập chờn / biến mất lệnh** (Multi-bot isolation & CLI safety) |
| **`v1.6.0-live-tick-telemetry`** | [`c3769f3`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/c3769f3) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Stream **Live Tick Telemetry (`/api/tick`)** & Live Unrealized PnL thời gian thực |
| **`v1.5.1-pnl-sltp-fix`** | [`d1e972b`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/d1e972b) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Hiển thị **Giá SL/TP chính xác** (kèm pips) & Tự động tính **Unrealized Live PnL ($ / Pips)** |
| **`v1.5.0-cli-broker-sync`** | [`c75f6da`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/c75f6da) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Tích hợp **Direct cTrader CLI Broker Sync** đọc sổ lệnh & vị thế tức thời từ sàn |
| **`v1.4.0-positions`** | [`6d350c9`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/6d350c9) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Ra mắt **Active Positions Matrix Tab**, Live PnL ($ / Pips), Nút Close lẻ & 🚨 Close All |
| **`v1.3.0-template`** | [`642c4ca`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/642c4ca) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Ra mắt Master **`cbot_agent_template`** (EMA Cross + AI Bridge), Skill & Rule tạo bot tự động |
| **`v1.2.0-stable`** | [`bc85fb4`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/bc85fb4) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Ra mắt **Dynamic Parameter Studio**, sửa lỗi CLI headless, tích hợp Hot-Restart bot |
| **`v1.1.0-stable`** | [`348fcce`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/348fcce) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Thiết lập thư mục `docs/` & Quy chuẩn tài liệu chiến thuật cho từng bot |
| **`v1.0.0-core`** | [`449e888`](https://github.com/nvcong89/cTrader-AI-Trading-Hub/commit/449e888) | 26/08/2026 | ⭐ **Hoạt động ổn định** | Nâng cấp toàn diện Bot Manager, cBot Library Discovery & Gemini Web Bridge |

---

## 🌟 Chi Tiết Các Cột Mốc Phiên Bản

---

### 📌 Cột Mốc: `v1.6.2-real-broker-close` (Commit `0c2c84d`)
- **Commit Hash**: `0c2c84d`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH & PRODUCTION-READY**
- **Thông điệp Commit**: `fix: Execute real broker position close via cTrader CLI with confirmation confirmation and non-blocking SQLite WAL connection management`

#### 🎯 Các tính năng & Cải tiến cốt lõi đã hoàn thiện:
1. **Khắc Phục Nút Close Lệnh & Close All Thực Tế Trên Broker**:
   - Trước đây API chỉ xóa bản ghi trong database khiến vị thế trên sàn vẫn tồn tại và bị nạp lại sau đó.
   - Nay đã tích hợp hàm `close_broker_position(id)` và `close_all_broker_positions()`: Tự động chạy lệnh `position close <position_id> yes` trực tiếp lên máy chủ Spotware broker thông qua `ctrader-cli` trong nền.
2. **Tối Ưu Hóa Kết Nối SQLite & Khắc Phục Triệt Để Database Lock**:
   - Toàn bộ kết nối database được cấu hình lại với `busy_timeout=30000`, `synchronous=NORMAL` và vòng đời kết nối ngắn hạn (short-lived connection), đảm bảo không bao giờ bị nghẽn khóa giữa các bot và tiến trình CLI.

#### 🛠️ Lệnh khôi phục về phiên bản này:
```bash
git checkout 0c2c84d
```

---

---

### 📌 Cột Mốc: `v1.6.1-stability-fix` (Commit `a2d2fc1`)
- **Commit Hash**: `a2d2fc1`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH & PRODUCTION-READY**
- **Thông điệp Commit**: `fix: Prevent position list flickering by scoping /trade position synchronization to bot_id/symbol and protecting against deletions on transient CLI timeouts`

#### 🎯 Các tính năng & Cải tiến cốt lõi đã hoàn thiện:
1. **Cô Lập Đồng Bộ Vị Thế Giữa Các Bot (Multi-Bot Isolation)**:
   - Khi một bot gửi dữ liệu `/trade`, việc đóng hoặc đồng bộ lệnh chỉ áp dụng duy nhất cho các vị thế do chính `bot_id` và `symbol` đó quản lý. Không can thiệp hoặc xóa nhầm vị thế của các bot khác cùng chạy trên một tài khoản.
2. **Bảo Vệ Database Trước Lỗi Timeout Mạng / CLI**:
   - Engine cTrader CLI Reader chỉ thực hiện dọn dẹp vị thế khi có xác nhận kết nối sàn thành công 100% (`success: True`). Ngăn chặn tuyệt đối việc xóa nhầm dữ liệu khi kết nối mạng chập chờn.

#### 🛠️ Lệnh khôi phục về phiên bản này:
```bash
git checkout a2d2fc1
```

---

---

### 📌 Cột Mốc: `v1.6.0-live-tick-telemetry` (Commit `c3769f3`)
- **Commit Hash**: `c3769f3`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH & PRODUCTION-READY**
- **Thông điệp Commit**: `feat: Implement hybrid live tick streaming telemetry (/api/tick) in cBots and server-side live PnL calculator without waiting for bar close or market snapshots`

#### 🎯 Các tính năng & Cải tiến cốt lõi đã hoàn thiện:
1. **Live Tick Telemetry Stream (`POST /api/tick`)**:
   - Các cBot (`Smart Trend`, `cbot_agent_template`, `AI Agent Bot Example`) được trang bị hàm `SendLiveTickTelemetry()` trong sự kiện `OnTick()`.
   - Tự động stream giá Bid/Ask thực tế, số dư Equity/Balance, và Floating NetProfit/Pips của từng lệnh đang mở về server định kỳ mỗi 1 giây (không làm nghẽn tiến trình cBot).
2. **Real-time Live PnL Calculation Engine**:
   - Backend duy trì bộ nhớ đệm `latest_prices` và cập nhật tức thì Lời/Lỗ ($ / Pips) cho mọi vị thế đang mở.
   - Khi giao diện Web polling mỗi 3 giây, các con số Lời/Lỗ và giá thị trường sẽ liên tục nhảy theo nhịp đập thực tế của thị trường mà **không cần phải đợi đóng nến hay đợi Market Snapshot**.

#### 🛠️ Lệnh khôi phục về phiên bản này:
```bash
git checkout c3769f3
```

---

---

### 📌 Cột Mốc: `v1.5.1-pnl-sltp-fix` (Commit `d1e972b`)
- **Commit Hash**: `d1e972b`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH & PRODUCTION-READY**
- **Thông điệp Commit**: `fix: Format SL/TP as exact broker price targets with pips in active positions and calculate live unrealized PnL from market price ticks`

#### 🎯 Các tính năng & Cải tiến cốt lõi đã hoàn thiện:
1. **Hiển Thị Giá SL / TP Chính Xác**:
   - Bảng Active Positions hiển thị trực quan mức giá chốt lỗ/chốt lời thực tế (VD: `SL: 4631.19 (1838.0 pips)` | `TP: 4576.06 (3675.0 pips)`).
2. **Cơ Chế Tính Unrealized Floating PnL Thời Gian Thực**:
   - Tự động lấy giá Bid/Ask thị trường từ cBot để liên tục tính toán Floating PnL ($) và PnL (pips) theo từng biến động giá.
   - Cập nhật đồng bộ các vị thế cùng symbol trong danh mục.

#### 🛠️ Lệnh khôi phục về phiên bản này:
```bash
git checkout d1e972b
```

---

---

### 📌 Cột Mốc: `v1.5.0-cli-broker-sync` (Commit `c75f6da`)
- **Commit Hash**: `c75f6da`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH & PRODUCTION-READY**
- **Thông điệp Commit**: `feat: Add direct cTrader CLI broker positions and orders sync engine with frontend one-click sync`

#### 🎯 Các tính năng & Cải tiến cốt lõi đã hoàn thiện:
1. **Module Đọc Dữ Liệu Broker CLI (`ctrader_reader.py`)**:
   - Tự động kết nối `ctrader-cli` bằng ctid và mật khẩu, gửi chuỗi lệnh `positions\norders\nquit\n` để đọc trực tiếp sổ lệnh thị trường (`positions`) và lệnh chờ (`orders`) từ sàn Spotware.
   - Phân tích và trích xuất dữ liệu JSON chính xác 100% chuẩn Broker.
2. **API Đồng Bộ Dữ Liệu (`POST /api/positions/sync-cli`)**:
   - Tự động quét và cập nhật toàn bộ vị thế của các tài khoản vào SQLite database trong nền (background thread).
3. **Nút "⚡ Sync cTrader CLI Broker" Trên Web UI**:
   - Bổ sung nút bấm trực quan trên tab Active Positions với hiệu ứng loading và banner thông báo số lượng lệnh đồng bộ thành công.

#### 🛠️ Lệnh khôi phục về phiên bản này:
```bash
git checkout c75f6da
```

---

---

### 📌 Cột Mốc: `v1.4.0-positions` (Commit `6d350c9`)
- **Commit Hash**: `6d350c9`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH & PRODUCTION-READY**
- **Thông điệp Commit**: `feat: Add dedicated Active Positions tab with live PnL, metrics HUD, search, individual Close, and emergency Close All`

#### 🎯 Các tính năng & Cải tiến cốt lõi đã hoàn thiện:
1. **Executive Metrics HUD**:
   - Theo dõi tổng số lượng vị thế mở, tổng PnL Floating ($ và Pips) với màu Neon Xanh/Đỏ, tổng khối lượng Exposure (Lots), và số tài khoản active.
2. **Active Positions Data Matrix**:
   - Bảng chi tiết toàn bộ các lệnh đang hoạt động với đầy đủ thông tin: Symbol, Chiều BUY/SELL, Khối lượng (Lots), Tài khoản & loại tài khoản `[DEMO]` / `[LIVE]`, Tên bot quản lý, Giá vào vs Giá hiện tại, SL / TP targets, và thời gian vào lệnh.
3. **Thao Tác Đóng Lệnh Thời Gian Thực (Execution Actions)**:
   - Nút **Close** cho từng lệnh đơn lẻ kèm hộp thoại xác nhận.
   - Nút **🚨 Close All Positions** khẩn cấp để đóng toàn bộ các lệnh mở trên tất cả bot/tài khoản tức thời.
4. **Bộ Lọc & Tìm Kiếm**:
   - Tìm kiếm nhanh tức thời và bộ lọc theo chiều lệnh `ALL`, `BUY`, `SELL`.
5. **Cơ Chế Đồng Bộ & Polling Thời Gian Thực**:
   - Tự động polling dữ liệu mỗi 3 giây và tự động tính toán PnL Pips & USD trên server.

#### 🛠️ Lệnh khôi phục về phiên bản này:
```bash
git checkout 6d350c9
```

---

---

### 📌 Cột Mốc: `v1.3.0-template` (Commit `642c4ca`)
- **Commit Hash**: `642c4ca`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH & PRODUCTION-READY**
- **Thông điệp Commit**: `feat: Create cbot_agent_template with EMA Cross strategy and full AI/Risk infrastructure, update ctrader-cbot-generator skill, and configure bot generation rules`

#### 🎯 Các tính năng & Cải tiến cốt lõi đã hoàn thiện:
1. **Master cBot Template (`cbot_agent_template`)**:
   - Khởi tạo cấu trúc chuẩn cTrader 5.x native solution/project.
   - Chiến thuật cốt lõi: **EMA Cross** (Fast EMA cắt Slow EMA) kết hợp bộ lọc vùng quá mua/quá bán **RSI Filter**.
   - Kế thừa toàn bộ 100% hạ tầng vững chắc:
     - 🤖 **Gemini AI Co-Pilot Bridge**: Endpoint `/trade` nhận quyết định `BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL` và báo cáo `/portfolio/report`.
     - 🛡️ **Quản lý vốn & Rủi ro**: Dynamic Lot Sizing (% Equity / Fixed), High-Watermark Circuit Breaker (giảm 50% rủi ro khi DD chạm ngưỡng).
     - 🎯 **Stop Loss & Take Profit**: Tính theo % Equity hoặc Pips cố định.
     - 🔄 **Bảo toàn vị thế & DCA**: Dời Stop Loss hòa vốn (+2 pips), Trailing Stop Loss, Lưới DCA thông minh.
     - 📰 **Tin tức & Cảnh báo**: ForexFactory News Filter (JSON/XML), Telegram alerts.
     - 🖥️ **Headless CLI Safety**: Bọc an toàn `Chart != null` cho toàn bộ hàm vẽ biểu đồ.
   - Biên dịch thành công với **0 Errors, 0 Warnings** (`cbot/cbot_agent_template.algo`).
2. **Tài Liệu Chiến Thuật Chuẩn**:
   - Tạo file [`docs/cbot_agent_template.md`](docs/cbot_agent_template.md) theo chuẩn 6 phần.
3. **Agent Skill Khởi Tạo Bot Tự Động (`ctrader-cbot-generator`)**:
   - Cập nhật [`generate_cbot.ps1`](.agents/skills/ctrader-cbot-generator/scripts/generate_cbot.ps1) và [`SKILL.md`](.agents/skills/ctrader-cbot-generator/SKILL.md) để tự động copy từ `cbot_agent_template`, thay thế identifier C#, build `.algo` package và sinh file tài liệu `docs/`.
4. **Quy Chuẩn Bắt Buộc Trong Workspace ([`.agents/AGENTS.md`](.agents/AGENTS.md))**:
   - Thêm điều luật quy định mọi cBot mới bắt buộc phải phát triển từ chuẩn `cbot_agent_template`.

#### 🛠️ Lệnh khôi phục về phiên bản này:
```bash
git checkout 642c4ca
```

---

### 📌 Cột Mốc: `v1.2.0-stable` (Commit `bc85fb4`)
- **Commit Hash**: `bc85fb4`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH & PRODUCTION-READY**
- **Thông điệp Commit**: `feat: Implement Dynamic Parameter Studio with ctrader-cli metadata extraction, SQLite custom_params persistence, and live restart support`

#### 🎯 Các tính năng & Cải tiến cốt lõi đã hoàn thiện:
1. **Dynamic Parameter Studio (Giao diện cấu hình tham số động)**:
   - Tự động gọi `ctrader-cli metadata <cbot.algo>` để trích xuất 100% thông số của cBot, phân nhóm khoa học theo Group (`Volume & Risk`, `SL/TP`, `Strategy Indicators`, `DCA Grid`, `News Filter`, `Telegram`, `Circuit Breaker`).
   - Tích hợp điều khiển chuyên dụng: Range Slider + Number Input cho số có min/max, Toggle Switch cho Boolean, Input Text cho String.
   - Nút **Reset Defaults** khôi phục cấu hình mặc định tức thì.
   - Lưu thông số vào cột `custom_params` (JSON) trong SQLite.
2. **Cơ chế Hot-Restart Bot (Lưu & Tự động chạy lại)**:
   - Khi chỉnh sửa tham số của một bot đang chạy (`RUNNING`), nút bấm chuyển thành **⚡ Save & Restart Bot**.
   - Hệ thống tự động ngắt bot cũ an toàn và lập tức khởi động bot mới với thông số vừa cập nhật trong vòng 1 giây.
3. **Tiêm tham số động vào cTrader CLI (`bot_manager.py`)**:
   - Tự động chuyển đổi `custom_params` thành các cờ dòng lệnh `--<Param>=<Value>` khi khởi chạy `ctrader-cli run`.
   - cTrader nhận diện chính xác các tham số ghi đè với nguồn `Source: cmd arg`.
4. **Ổn định hóa toàn diện cBot C# & CLI Runner**:
   - **Chuẩn hóa `--pwd-file`**: Khắc phục triệt để lỗi `ConsoleInvalidUsageException` và `Error: 'algo-file' is required`.
   - **An toàn Headless (`Chart != null`)**: Bảo vệ toàn bộ các hàm vẽ giao diện và chụp ảnh biểu đồ khi bot chạy trên terminal không có GUI.
   - **Khởi tạo phòng vệ trong `OnStart()`**: Đảm bảo 100% các chỉ báo kỹ thuật (`TEMA`, `RSI`, `ADX`) luôn được khởi tạo thành công, loại bỏ hoàn toàn lỗi `NullReferenceException` khi đóng nến.
5. **System Logs & Stream Sự Kiện Thời Gian Thực**:
   - Tự động tải 250 log gần nhất từ SQLite khi mở tab.
   - Phân loại và hiển thị nổi bật các suy luận của Gemini AI với tag `GEMINI_REASONING` (khung viền tím neon, chi tiết lý do, % tự tin).

#### 🛠️ Lệnh khôi phục về phiên bản này:
```bash
git checkout bc85fb4
```

---

### 📌 Cột Mốc: `v1.1.0-stable` (Commit `348fcce`)
- **Commit Hash**: `348fcce`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **Hoàn thiện tài liệu**
- **Thông điệp Commit**: `docs: Establish docs folder with strategy documents for all cBots and configure Bot Strategy Documentation rule in AGENTS.md`

#### 🎯 Tính năng:
- Thiết lập thư mục `docs/` chuyên lưu trữ các file Markdown về chiến thuật của từng bot.
- Soạn thảo tài liệu chiến thuật chi tiết cho [Smart Trend and AI Agent XAU M15](docs/Smart_Trend_and_AI_Agent_XAU_M15.md) và [AI Agent Bot Example](docs/AI_Agent_Bot_Example.md).
- Thiết lập quy chuẩn bắt buộc (**Mandatory Rule**) trong [`.agents/AGENTS.md`](.agents/AGENTS.md) cho mọi cBot mới.

---

### 📌 Cột Mốc: `v1.0.0-core` (Commit `449e888`)
- **Commit Hash**: `449e888`
- **Ngày hoàn thành**: 26/08/2026
- **Trạng thái**: ⭐ **Core Bot Manager Ready**
- **Thông điệp Commit**: `feat: Upgrade Bot Manager with cBot library discovery, deploy wizard, upload modal, live fleet matrix, frontend_build.bat, and compile AI Agent Bot Example`

#### 🎯 Tính năng:
- Tab **Bot Manager** với giao diện quản lý hạm đội bot (Fleet Matrix) hiển thị: Tên bot, Tên tài khoản, Account Number, PID tiến trình, Equity thời gian thực.
- Thư viện phát hiện tự động các file `.algo` trong thư mục `cbot/`.
- Modal Deploy Wizard khởi tạo bot và Modal Upload file `.algo`.
- Tạo file build tiện ích `frontend_build.bat`.

---

## 📝 Hướng Dẫn Thêm Cột Mốc Mới Trong Tương Lai

Khi bạn hoàn thành một tính năng mới hoặc đạt một phiên bản ưng ý:
1. Lấy mã commit hash ngắn bằng lệnh: `git rev-parse --short HEAD`
2. Thêm một dòng vào **Bảng Tổng Hợp** ở đầu file này.
3. Tạo một mục chi tiết mới bên dưới theo mẫu:

```markdown
### 📌 Cột Mốc: vX.X.X-stable (Commit <commit_hash>)
- **Commit Hash**: `<commit_hash>`
- **Ngày hoàn thành**: DD/MM/YYYY
- **Trạng thái**: ⭐ **HOẠT ĐỘNG ỔN ĐỊNH**
- **Thông điệp Commit**: `<commit_message>`

#### 🎯 Các tính năng & Cải tiến:
- [Tính năng 1]
- [Tính năng 2]
- [Lỗi đã sửa]

#### 🛠️ Lệnh khôi phục:
git checkout <commit_hash>
```
