# 🔀 1-Click Multi-Database Merger Tool

Công cụ hợp nhất đa cơ sở dữ liệu SQLite chuyên dụng cho **cTrader AI Trading Hub**.

Dùng khi bạn vận hành cBot trên nhiều VPS hoặc nhiều tài khoản khác nhau và muốn hợp nhất toàn bộ lịch sử giao dịch (`history`), số dư tài khoản (`accounts`), lệnh đang mở (`positions`), cấu hình bot (`bot_instances`) và nhật ký (`logs`) thành **1 file `merged_portfolio.db` duy nhất**.

---

## 🚀 Cách Sử Dụng 1-Click

1. **Bước 1: Copy các file `.db` vào thư mục này**
   - Tải file `portfolio.db` từ các VPS về (bằng WinSCP, FileZilla, hoặc lệnh `scp`).
   - Đổi tên để phân biệt nếu muốn (ví dụ: `vps1.db`, `vps2.db`, `portfolio_demo.db`, `portfolio_live.db`...).
   - Dán toàn bộ vào thư mục `merge database tool/`.

2. **Bước 2: Nhấp đúp chuột vào `1_click_merge.bat`**
   - Hệ thống sẽ tự động quét mọi file `*.db` trong thư mục.
   - Hợp nhất và lọc sạch các bản ghi trùng lặp (Deduplication).
   - Tự động kiểm tra tính toàn vẹn `PRAGMA integrity_check`.
   - In bảng thống kê chi tiết số bản ghi của từng bảng.

3. **Bước 3: Đưa file kết quả vào sử dụng**
   - Copy file kết quả `merged_portfolio.db` ra thư mục gốc dự án: `cTrader-AI-Trading-Hub/`.
   - Đổi tên thành `portfolio.db` để Web Hub hiển thị toàn bộ lịch sử tổng hợp.

---

## 🛡️ Tính Năng An Toàn

- **Chống Trùng Lệnh Lịch Sử**: So khớp từng lệnh theo `(account_id, ctrader_id)` và `(symbol, exit_time, pnl)`. Lệnh đã có sẽ được bỏ qua, chỉ import lệnh mới và tự sinh ID mới để không xung đột khóa chính.
- **Tự Động Sao Lưu**: Nếu đã có file `merged_portfolio.db` từ lần merge trước, tool sẽ tự động sao lưu ra file `.bak_<timestamp>` trước khi ghi đè.
- **Tương Thích Đa Nền Tảng**: Có thể chạy bằng file `.bat` trên Windows hoặc chạy trực tiếp bằng lệnh `python merge_all.py` trên Linux/macOS.
