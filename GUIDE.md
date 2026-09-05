# Hướng dẫn Cài đặt & Sử dụng cTrader AI Trading Hub

Hệ thống **cTrader AI Trading Hub** đóng vai trò là một máy chủ quản lý, điều phối và giám sát các cBot giao dịch trên nền tảng cTrader, kết hợp với AI đa nền tảng (Qwen, DeepSeek, Gemini, OpenAI).

Dưới đây là hướng dẫn chi tiết để bạn có thể cài đặt hệ thống và triển khai một bot mới lên Dashboard.

---

## 1. Cài đặt & Khởi động Server

### Bước 1: Cài đặt thư viện (Chỉ thực hiện lần đầu)
Nếu bạn vừa tải source code về hoặc vừa có bản cập nhật mới, hãy đảm bảo các thư viện Python đã được cài đặt đủ bằng cách mở cửa sổ Terminal/Command Prompt và chạy file:
```bat
install.bat
```
*(Nếu bạn đã chạy `pip install -r requirements.txt` thì có thể bỏ qua bước này).*

### Bước 2: Thiết lập Tài khoản Đăng nhập
Mở file `account_login.env` trong thư mục `AI_Gemini_Server`. Nếu file chưa có, hãy copy từ file `account_login.env.example` sang. Điền tài khoản và mật khẩu bạn muốn sử dụng:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123

GUEST_USERNAME=guest
GUEST_PASSWORD=guest
```
> **Lưu ý**: Tài khoản `admin` có đầy đủ toàn quyền quản trị và thực thi. Tài khoản `guest` chỉ có quyền xem (View-Only), không thể thực hiện bất kỳ thao tác thay đổi dữ liệu nào (Start/Stop bot, đóng lệnh, sửa tham số, đổi cấu hình AI...).

### Bước 3: Khởi chạy Server
Chạy file khởi động chính của hệ thống:
```bat
Run.bat
```
Server sẽ khởi động ngay lập tức (<1 giây). Khi có thông báo `Uvicorn running on http://127.0.0.1:8181`, hãy mở trình duyệt web và truy cập vào đường link này. Đăng nhập bằng tài khoản ở Bước 2.

---

## 2. Chuẩn bị file Bot (.algo)

Để hệ thống có thể nhận diện và tự động điền tên bot vào danh sách chọn, bạn cần:
1. Mở cTrader Automate và Build cBot của bạn thành file `.algo`.
2. Copy file `.algo` đó vào thư mục `AI_Gemini_Server\cbot`.
*(Nếu thư mục `cbot` chưa có, bạn có thể tự tạo mới).*

---

## 3. Hướng dẫn thêm Bot mới (Deploy New Bot)

Tại giao diện chính (Dashboard), bấm vào nút **+ New Bot** (ở góc phải bảng Bot Manager). Bảng thông tin "Deploy New Bot" sẽ hiện lên. Dưới đây là giải thích cho từng mục:

### 1. Bot Name
- **Ý nghĩa:** Tên định danh tùy chọn để bạn dễ dàng quản lý hiển thị trên bảng.
- **Cách điền:** Nhập bất kỳ tên nào bạn muốn (Ví dụ: `Gold M15 AI`, `Trend Bot Demo`).

### 2. Select Algo (from cbot/ folder)
- **Ý nghĩa:** Chọn file thuật toán cBot gốc để khởi chạy.
- **Cách điền:** Bấm vào danh sách xổ xuống và chọn file `.algo` tương ứng (Ví dụ: `Smart Trend and AI Agent XAU M15.algo`). 
- *Lưu ý: Nếu danh sách trống, hãy kiểm tra lại xem bạn đã copy file `.algo` vào thư mục `cbot` như ở mục 2 chưa, sau đó tải lại trang (F5).*

### 3. cTID Email
- **Ý nghĩa:** Email của tài khoản cTrader ID (cTID). Hệ thống cTrader CLI yêu cầu khai báo email này để xác thực quyền chạy thuật toán.
- **Cách điền:** Nhập chính xác email bạn dùng để đăng nhập vào ứng dụng cTrader.

### 4. cTID Password
- **Ý nghĩa:** Mật khẩu của tài khoản cTrader ID (cTID). Mật khẩu này sẽ được lưu và truyền cho engine cTrader CLI khởi động an toàn ở chế độ nền.
- **Cách điền:** Nhập chính xác mật khẩu cTID của bạn.

### 5. Account ID
- **Ý nghĩa:** Mã số của tài khoản giao dịch (Live hoặc Demo) mà bạn muốn cấp phép cho Bot trade.
- **Cách điền:** Nhập mã số tài khoản (Ví dụ: `1234567`). Lưu ý: Mã tài khoản này phải được liên kết với `cTID Email` bên trên.

### 6. Symbol
- **Ý nghĩa:** Mã giao dịch của cặp tiền/tài sản.
- **Cách điền:** Nhập chính xác tên mã (Symbol) giống như hiển thị trên Broker của bạn (Ví dụ: `XAUUSD`, `EURUSD`). Nếu đánh sai mã, Bot sẽ không thể vào lệnh.

### 7. Timeframe
- **Ý nghĩa:** Khung thời gian mặc định để Bot phân tích biểu đồ nến.
- **Cách điền:** Nhập mã khung thời gian chuẩn của cTrader.
  - Phút: `m1`, `m5`, `m15`, `m30`
  - Giờ: `h1`, `h4`
  - Ngày: `D1`

---

## 4. Quản lý trạng thái Bot
Sau khi điền đủ thông tin và bấm **Save Bot**:
- Bot sẽ xuất hiện trên bảng **Bot Manager** với trạng thái ban đầu là `STOPPED`.
- Để chạy bot, bấm nút **Start** màu xanh. Hệ thống sẽ khởi động nền tảng cTrader CLI và trạng thái sẽ chuyển sang `RUNNING`.
- Nếu có bất kỳ lỗi nào, bạn có thể kiểm tra mục **System Logs** ở cuối trang để biết thêm chi tiết.

---

## 5. Đánh giá & Benchmark AI Agent (AI Evaluation Harness)

Hệ thống tích hợp sẵn **AI Agent Evaluation & Benchmark Harness** cho phép bạn đo lường định lượng chất lượng quyết định của AI trước khi cho bot chạy live:

### Cách 1: Sử dụng Web Dashboard
1. Truy cập Tab **AI Benchmark** trên thanh điều hướng bên trái.
2. Nhấn nút **Bắt Đầu Benchmark**.
3. Hệ thống sẽ tự động gửi các tình huống thị trường mẫu (Market Snapshots) đến AI Provider đang hoạt động, thực hiện mô phỏng khớp lệnh trên 1–5 nến kế tiếp (Forward Lookahead Simulation).
4. Xem kết quả trực quan trên giao diện:
   - **Forward Win Rate (%)**: Tỷ lệ lệnh chạm TP trước SL.
   - **Profit Factor**: Tỷ lệ Lãi / Lỗ gộp.
   - **Net PnL**: Tổng số pips tích lũy.
   - **Avg Latency**: Độ trễ phản hồi trung bình (ms).
   - **Bảng chi tiết từng kịch bản**: Xem hành động AI (`BUY`/`SELL`/`HOLD`), lý do vào lệnh và kết quả chạm TP/SL.

### Cách 2: Chạy trực tiếp qua CLI
Mở Terminal và thực thi lệnh:
```bash
python ai_eval_harness.py --provider=qwen_api --model=qwen3.7-flash --delay=1.0
```
Sau khi hoàn tất, kết quả sẽ tự động lưu vào SQLite database và gửi báo cáo tóm tắt về nhóm Telegram được cấu hình.

---

## 6. Cấu hình cBot Hybrid AI Mode

Mỗi cBot trong dự án đều hỗ trợ **2 chế độ kết nối AI** linh hoạt:

### Chế độ A: Local Server Hub (Mặc định — Tất cả tính năng)
> Cần chạy `Run.bat` trước

| Tham số cBot | Giá trị |
|---|---|
| `Direct AI Cloud API ?` | `False` |
| `Dashboard Server URL` | `http://127.0.0.1:8181` |

**Ưu điểm:**
- ✅ Ghi log tập trung, SQLite telemetry, Web Dashboard đầy đủ
- ✅ Đổi AI provider (Qwen ↔ DeepSeek ↔ Gemini ↔ OpenAI) trực tiếp trên Dashboard, không cần recompile
- ✅ AI Benchmark Harness, Portfolio Tracking, WebSocket real-time

### Chế độ B: Direct Cloud AI (Nhẹ — Không cần server)
> Không cần chạy `Run.bat`. Chỉ cần file `.algo` + API Key.

| Tham số cBot | Giá trị |
|---|---|
| `Direct AI Cloud API ?` | `True` |
| `AI Endpoint URL` | URL của provider (Qwen/OpenRouter/...) |
| `AI API Key` | (bỏ trống nếu dùng `API_key.env`) |
| `AI Model Name` | `qwen3.7-flash` hoặc model tuỳ ý |

**Cấu hình API key tự động qua `API_key.env`:**
```env
# API_key.env (trong thư mục gốc hoặc ~/ hoặc ~/Documents/GitHub/cTrader-AI-Trading-Hub/)
APIKey=sk-your-qwen-key-here
OpenAI_compatible=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
Model=qwen3.7-flash
```

> [!TIP]
> **Ngay cả khi dùng Chế độ B**, cBot vẫn có thể gửi telemetry lên Dashboard nếu bạn đặt `Enable Dashboard Telemetry = True` và `Dashboard Server URL` trỏ tới server đang chạy. Hai chế độ hoàn toàn độc lập với nhau.
