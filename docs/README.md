# 📚 cBot Trading Strategy & AI Agent Documentation

Tài liệu chi tiết về chiến thuật giao dịch, cơ chế phân tích kỹ thuật, quản lý rủi ro và cách tích hợp suy luận của Gemini AI cho từng bot trong hệ thống.

> 📖 **Tổng quan dự án & Kiến trúc hệ thống**: Xem chi tiết tại [**`docs/projectcontext.md`**](projectcontext.md).

---

## 📑 Danh Mục Chiến Thuật Bot

| Tên Bot | Cặp Tiền / Khung Thời Gian | Mô Hình Chiến Thuật | Tích Hợp AI | Chi Tiết |
| :--- | :---: | :---: | :---: | :---: |
| **cbot_agent_template** | `XAUUSD` / Any (M5 - H1) | EMA Cross (Fast/Slow EMA + RSI Filter) | Gemini Web Pro | [Xem Tài Liệu](cbot_agent_template.md) |
| **Smart Trend and AI Agent XAU M15** | `XAUUSD` (M15) | Trend Following (TEMA + RSI + ADX + Fibo) | Gemini Web Pro | [Xem Tài Liệu](Smart_Trend_and_AI_Agent_XAU_M15.md) |
| **AI Agent Bot Example** | `XAUUSD` (M1 / M15) | AI Agent Hybrid Core (Autonomous Execution) | Gemini Web Pro | [Xem Tài Liệu](AI_Agent_Bot_Example.md) |

---

## 📐 Cấu Trúc Chuẩn Cho File Tài Liệu Chiến Thuật (`docs/<Bot_Name>.md`)

Mỗi file chiến thuật cần bao gồm đầy đủ 6 phần:
1. **Tổng Quan & Triết Lý Chiến Thuật**: Cặp giao dịch, khung thời gian, mục tiêu lợi nhuận.
2. **Hệ Thống Phân Tích Kỹ Thuật (TA Engine)**: Các chỉ báo (TEMA, RSI, ADX, Fibonacci, EMA, ATR) và công thức kích hoạt tín hiệu BUY / SELL.
3. **Cơ Chế Tương Tác & Ra Quyết Định Của Gemini AI**:
   - Dữ liệu gửi đi (Market Snapshot: OHLCV, Positions, Strategy metrics).
   - Quyết định AI trả về (`BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL`).
   - Mức độ tự tin (Confidence %) và các điều kiện lọc.
4. **Quản Lý Vốn & Rủi Ro (Risk Management)**:
   - Tính toán Volume (Fixed vs % Balance/Equity).
   - Stop Loss / Take Profit theo % hoặc Pips.
   - Break-Even, Trailing Stop, Circuit Breaker (Equity Drawdown Protection).
   - Lưới trung bình giá (DCA Grid) nếu có.
5. **Bộ Lọc Tin Tức (ForexFactory News Filter)**: Tự động tạm dừng trước/sau tin High-impact USD.
6. **Bảng Tham Số Cấu Hình Chi Tiết (Parameters Reference Table)**: Tên tham số, kiểu dữ liệu, giá trị mặc định, giải thích và khuyến nghị tối ưu.
