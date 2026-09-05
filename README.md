# ⚡ cTrader AI Trading Hub (FastAPI + React + Multi-AI Engine)

Hệ sinh thái giao dịch định lượng lai toàn diện cho **cTrader 5.x**, tích hợp **Cố vấn AI Co-Pilot** siêu tốc qua REST API (Google Gemini, Alibaba Qwen, DeepSeek, OpenAI), bảng điều khiển web **React Trading Hub** thời gian thực, bộ công cụ quản lý cụm bot **Bulk Fleet Controls**, và khung kiểm thử **AI Evaluation & Benchmark Harness**.

---

## 🌟 Tính Năng Nổi Bật (Key Features)

1. **🤖 Multi-AI REST Engine & Co-Pilot Bridge**:
   - Tiếp nhận Market Snapshot (100 nến OHLCV, TEMA, RSI, ADX, ATR, Cấu trúc Swing HH/HL/LH/LL đa khung thời gian).
   - Suy luận và gửi quyết định vào lệnh (`BUY`, `SELL`), giữ lệnh (`HOLD`), điều chỉnh bảo vệ (`ADJUST`), hoặc đóng lệnh (`CLOSE_ALL`).
   - Tương thích trực tiếp với Google Gemini API, Alibaba DashScope (Qwen 2.5), DeepSeek R1/V3, và OpenAI GPT-4o.

2. **🚀 Quản Lý Cụm Bot Fleet Hàng Loạt (Bulk Fleet Controls)**:
   - **`▶️ Start All`**: Tự động lọc và khởi chạy toàn bộ các bot đang dừng trong nền.
   - **`⏹️ Stop All`**: Dừng khẩn cấp toàn bộ các bot đang chạy trên VPS kèm popup xác nhận an toàn.
   - **`🔄 Restart All`**: Dừng sạch và khởi động lại tuần tự toàn bộ fleet bot.
   - **Staggered Startup (Độ trễ 60 giây)**: Khởi chạy tuần tự cách nhau 60s trong nền qua `asyncio.create_task` và `await asyncio.sleep(60.0)`, bảo vệ tuyệt đối CPU và RAM VPS không bị quá tải.
   - **Real-Time Fast Polling**: Giao diện quét tự động 3s/lần để cập nhật trạng thái bot đổi sang màu xanh `RUNNING` trực tiếp trên web.

3. **🛡️ Quản Trị Rủi Ro Đa Tầng & Smart Position Protection**:
   - **Quy tắc cứng 100% Volume cBot**: AI có 0% quyền hạn quyết định volume; volume thực tế được tính toán 100% bởi Risk Engine nội bộ của cBot theo Equity % và khoảng cách SL kỹ thuật.
   - **Positive Trailing SL Auto-Mapping**: Tự động nhận diện mức TP điều chỉnh nằm giữa Entry và Market Price để dời SL dương khóa lãi, đồng thời bảo tồn mục tiêu TP cấu trúc ban đầu.
   - **Hybrid Smart SL Protection Engine**: Đóng lệnh chốt lời ngay nếu SL bị vi phạm khi lệnh đang dương; hoặc giữ nguyên SL ban đầu nếu lệnh đang âm để ngăn ngừa Stop-out non và lỗi từ chối của broker.
   - **News Filter 2 Tầng**: Lọc tin đỏ ForexFactory (ưu tiên JSON, tự động fallback sang XML khi gặp lỗi mạng/429).
   - **High-Watermark Drawdown Circuit Breaker**: Tự động giảm 50% rủi ro khi chạm ngưỡng sụt giảm vốn.

4. **📊 Bảng Điều Khiển Web Trading Hub (React + Vite)**:
   - **Overview Tab**: Tổng quan trạng thái vốn, equity, số lượng bot và lệnh đang mở.
   - **Bot Manager Tab**: Quản lý phiên bản bot, cBot Library, Hot-Restart, Live Logs WebSocket, Dynamic Parameter Studio.
   - **Active Positions Matrix Tab**: Đồng bộ vị thế trực tiếp từ broker Spotware, theo dõi Live Tick PnL, đóng lệnh trực tiếp trên sàn.
   - **Trade History Tab**: Thống kê KPI (Net Profit, Win Rate, Profit Factor) và xuất báo cáo CSV 1-Click.
   - **Agent AI & Benchmark Tab**: Cấu hình API key, Ping test và đo lường định lượng tỷ lệ thắng của mô hình AI.

---

## 🛠️ Cài Đặt Nhanh (Quick Start)

### 1. Cài đặt tự động bằng script (Khuyến nghị trên Windows/VPS)
Nhấp đúp vào file:
```cmd
install.bat
```
Script sẽ tự động tạo môi trường ảo Python `venv`, cài đặt `requirements.txt` và cài đặt các gói NPM cho `frontend/`.

---

### 2. Khởi chạy hệ thống 1-Click
Nhấp đúp vào file:
```cmd
run.bat
```
Hệ thống sẽ đồng thời khởi chạy:
- **FastAPI Backend Hub**: `http://127.0.0.1:8181`
- **React Trading Dashboard**: `http://localhost:5173`

---

## 📁 Cấu Trúc Dự Án (Project Hierarchy)

```
cTrader-AI-Trading-Hub/
├── .agents/                                # Quy chuẩn dự án & Agent Skills
│   ├── AGENTS.md                           # Master Workspace Rules & Coding Standards
│   └── skills/                             # Agent Skills (Compiler, Generator, Reviewer, Backtester, Optimizer)
├── cbot/                                   # Mã nguồn các chiến thuật cBot (cTrader 5.x Native)
│   ├── cbot_agent_template/                # Master Reference Template cBot
│   ├── Asian Range Judas Sweep AI Bot/     # cBot Asian Range Judas Sweep
│   └── Smart Trend and AI Agent XAU M15/   # cBot Smart Trend XAU M15
├── docs/                                   # Tài liệu kiến trúc & Chiến thuật bot
│   ├── projectcontext.md                   # Bức tranh toàn cảnh kiến trúc hệ thống
│   ├── cbot_agent_template.md              # Tài liệu chi tiết bot template mẫu
│   └── Smart_Trend_and_AI_Agent_XAU_M15.md # Tài liệu chiến thuật Smart Trend M15
├── frontend/                               # Giao diện Web Trading Hub (React + TypeScript + Vite)
├── bot_manager.py                          # Module quản lý tiến trình bot & Bulk Fleet Controls
├── ctrader_reader.py                       # Module giao tiếp CLI với Broker Spotware
├── database.py                             # Cơ sở dữ liệu SQLite (WAL Mode, non-blocking)
├── ai_engine.py                            # Multi-AI REST Engine (Gemini, Qwen, DeepSeek, OpenAI)
├── ai_eval_harness.py                      # Khung đánh giá AI Benchmark & Forward Test
├── main.py                                 # Máy chủ FastAPI trung tâm & Router
└── requirements.txt                        # Danh mục thư viện Python
```

---

## 📜 Tài Liệu Tham Khảo (Documentation)
- **Toàn Cảnh Dự Án**: [docs/projectcontext.md](file:///c:/Users/210608/Documents/GitHub/cTrader-AI-Trading-Hub/docs/projectcontext.md)
- **Lịch Sử Phiên Bản & Cột Mốc**: [MILESTONES.md](file:///c:/Users/210608/Documents/GitHub/cTrader-AI-Trading-Hub/MILESTONES.md)
- **Quy Chuẩn Code & Kiến Trúc**: [.agents/AGENTS.md](file:///c:/Users/210608/Documents/GitHub/cTrader-AI-Trading-Hub/.agents/AGENTS.md)
