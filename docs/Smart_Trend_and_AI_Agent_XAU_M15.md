# 📈 Chiến Thuật: Smart Trend and AI Agent XAU M15

---

## 1. Tổng Quan & Triết Lý Chiến Thuật (Overview)
- **Tên cBot**: `Smart Trend and AI Agent XAU M15`
- **Cặp tiền chính**: `XAUUSD` (Vàng Giao Ngay / USD)
- **Khung thời gian tối ưu**: `M15` (15 Phút)
- **Triết lý cốt lõi**:
  - Kết hợp giữa **Chiến lược Bắt Xu Hướng Kỹ Thuật (Trend Following)** đa tầng và **Cố Vấn Suy Luận Gemini AI (AI Agent Co-Pilot)**.
  - cBot liên tục quét cấu trúc giá, xác định xu hướng chính bằng cặp đường làm mượt cao cấp **TEMA (Triple Exponential Moving Average)**, đo lường động lượng bằng **RSI 3 tầng**, và lọc nhiễu sideway bằng **ADX Rating**.
  - Đồng thời, tại mỗi nến M15 (và ngay khi khởi động), cBot gửi snapshot thị trường tới Gemini AI Server để nhận thêm góc nhìn đa chiều, tự động điều chỉnh Stop Loss / Take Profit hoặc chủ động chốt lời sớm (`CLOSE_ALL` / `ADJUST`).

---

## 2. Hệ Thống Chỉ Báo & Điều Kiện Kỹ Thuật (Technical Analysis Engine)

### 2.1. Danh Sách Chỉ Báo Kỹ Thuật
1. **TEMA 1 & TEMA 2**:
   - `periodTEMA1 = 147` (Fast TEMA)
   - `periodTEMA2 = 183` (Slow TEMA)
   - *Mục đích*: Xác định xu hướng định hướng chính của thị trường, loại bỏ độ trễ so với SMA/EMA truyền thống.
2. **Hệ Thống RSI 3 Tầng**:
   - `RSI` gốc: Chu kỳ 33 (`periodRSI = 33`)
   - `rsiShort`: EMA của RSI với chu kỳ 85 (`periodRSIshort = 85`)
   - `rsiLong`: EMA của `rsiShort` với chu kỳ 93 (`periodRSIlong = 93`)
   - *Mục đích*: Đo lường vùng quá mua/quá bán và cấu trúc động lượng trung hạn.
3. **ADX Rating & ATR**:
   - `periodADX = 8`, ngưỡng kích hoạt `minADX = 25` (Lọc bỏ thị trường không có xu hướng).
   - `ATR = 14` (Exponential) để đo độ biến động giá thực tế.
4. **Fibonacci Retracement Động**:
   - Chu kỳ đỉnh/đáy `periodFibo = 129` nến.
   - Mức mua hồi quy `periodLevelBuy = 0.13`, mức bán hồi quy `periodLevelSell = 0.618`.

### 2.2. Điều Kiện Vào Lệnh Mua (BUY Condition)
Lệnh BUY được kích hoạt khi đồng thời thỏa mãn:
1. `TEMA1 > TEMA2` (Đường TEMA nhanh nằm trên TEMA chậm).
2. `RSI > levelRSIBuy` (RSI vượt ngưỡng mua, mặc định 38) và `rsiShort > rsiLong`.
3. `ADX > minADX` (Độ mạnh xu hướng đủ lớn, mặc định >= 25).
4. Giá hiện tại nằm trong vùng hồi quy Fibonacci cho phép.
5. Không nằm trong vùng cấm giao dịch của bộ lọc tin tức.

### 2.3. Điều Kiện Vào Lệnh Bán (SELL Condition)
Lệnh SELL được kích hoạt khi đồng thời thỏa mãn:
1. `TEMA1 < TEMA2` (Đường TEMA nhanh cắt xuống dưới TEMA chậm).
2. `RSI < levelRSISell` (RSI dưới ngưỡng bán, mặc định 54) và `rsiShort < rsiLong`.
3. `ADX > minADX` (Xu hướng giảm có lực mạnh).
4. Không nằm trong vùng tin tức nguy hiểm.

---

## 3. Cơ Chế Tương Tác & Ra Quyết Định Của Gemini AI (AI Agent Bridge)

### 3.1. Dữ Liệu Thị Trường Gửi Tới Server (`/trade`)
Mỗi chu kỳ đóng nến và khi khởi động, cBot đóng gói gói tin JSON:
```json
{
  "bot_id": "Smart_Trend_XAU_M15",
  "symbol": "XAUUSD",
  "timeframe": "Minute15",
  "ask": 2745.30,
  "bid": 2745.15,
  "bars": [ ... 100 nến OHLCV gần nhất ... ],
  "strategy": {
    "tema1": 2742.80,
    "tema2": 2740.10,
    "rsi": 58.40,
    "adx": 31.20,
    "atr": 4.15,
    "recent_high": 2750.00,
    "recent_low": 2735.00
  },
  "active_positions": [ ... ],
  "recent_history": [ ... ],
  "account_balance": 1000.0,
  "account_equity": 1024.50
}
```

### 3.2. Cấu Trúc Quyết Định Của Gemini AI
Gemini phân tích cấu trúc đa khung thời gian và trả về lệnh có cấu trúc:
- `action`:
  - **`BUY`** / **`SELL`**: Vào lệnh mới theo đề xuất của AI.
  - **`HOLD`**: Giữ nguyên trạng thái lệnh mở, tiếp tục theo dõi sóng.
  - **`ADJUST`**: Dời Stop Loss / Take Profit tối ưu theo các mức cản mới của AI.
  - **`CLOSE_ALL`**: Thoát toàn bộ vị thế khẩn cấp nếu AI phát hiện đảo chiều cấu trúc thị trường hoặc bất thường vĩ mô.
- `confidence`: Độ tự tin của mô hình (từ 0% đến 100%).
- `reason`: Diễn giải logic kỹ thuật chi tiết của AI (được hiển thị trên Tab System Logs với màu tím neon).

---

## 4. Quản Lý Vốn & Rủi Ro (Risk Management)

1. **Khối Lượng Vào Lệnh (Lot Sizing)**:
   - Hỗ trợ vào lệnh theo **% Rủi Ro Vốn (Risk Factor %)**: Tự động tính toán khối lượng Lot dựa trên khoảng cách Stop Loss và số dư/equity tài khoản.
   - Hỗ trợ Fix Volume (`_fixedVolLots = 0.01`).
2. **Bảo Vệ Tài Khoản Sụt Giảm (Circuit Breaker Drawdown)**:
   - Giám sát sụt giảm tài khoản từ đỉnh equity (`Peak Equity`).
   - Nếu Drawdown vượt quá `maxEquityDDPercent = 15%`, cBot tự động kích hoạt **Chế Độ Ngắt Mạch**, giảm 50% khối lượng các lệnh tiếp theo để bảo toàn vốn.
3. **Quản Lý Lệnh Nâng Cao**:
    - **Cơ Chế Săn Râu Nến Chiết Khấu Chống FOMO (Anti-FOMO & Candle Wick Retracement Hunting)**:
      - Loại bỏ nguy cơ trượt giá và đu đỉnh/đáy do độ trễ 20–30s của AI: Khi AI trả về quyết định `BUY`/`SELL`, cBot đánh giá khoảng cách giá hiện tại so với giá mở cửa cây nến (`Bars.LastBar.Open`).
      - **Chế độ Dung sai Động (`Dynamic_ATR_Percent`)**: Dung sai trượt giá tự động tính bằng $\text{ATR}(14) \times (\text{slippageToleranceAtrPercent} / 100)$, tương thích tự động 100% cho mọi symbol (Forex, Vàng, Chỉ số Dow Jones, Nasdaq, Crypto) mà không cần cấu hình pips thủ công. Kèm sàn an toàn $\ge 1.5\times\text{Spread}$.
      - Nếu giá chưa chạy xa ($\le \text{Dung sai trượt giá}$), cBot mở Market Order ngay tại chân nến.
      - Nếu giá đã phóng xa ($> \text{Dung sai trượt giá}$), cBot chuyển trạng thái sang **Staging (`ARMED_BUY` / `ARMED_SELL`)** và kiên nhẫn theo dõi từng tick (`OnTick`). Khi giá nến M15 tạo nhịp hồi (Pullback) lùi về vùng giá mở cửa ($\pm \text{Vùng đệm Pullback}$ tính theo % ATR hoặc pips), cBot bóp cò khớp lệnh tại mức giá chiết khấu với R:R tối ưu.
      - Tự động hủy lệnh chờ (Invalidation) nếu: cây nến M15 kết thúc mà không hồi đón, hết hạn chờ `maxStagingWaitMinutes (8m)`, giá đã đi được $\ge 50\%$ quãng đường tới TP, hoặc giá thủng mức Stop Loss dự kiến.
    - **DCA Grid (Tùy chọn)**: Lưới trung bình giá an toàn với khoảng cách tối thiểu `dca_Distance = 300 pips` và cơ chế kéo ngược để chốt (`dcaPullBackToClose`).

4. **Sàn Stop Loss Tối Thiểu Động (Dynamic Min SL Floor)**:
   - Tự động tính toán sàn bảo vệ Stop Loss $\max(\text{Spread}_{\text{pips}} \times 10.0, \, \text{ATR}_{14} \times 0.8)$ thông qua tham số `AiSlSpreadMultiplier = 10.0` và `AiSlMinFloorPips = 0.0` (0 = Tự động).
   - Đảm bảo thích ứng mượt mà khi chạy trên bất kỳ cặp symbol nào (Forex, Vàng, Indices, Crypto) mà không bị kẹt bởi giá trị hardcode cũ.

5. **Dời Stop Loss Hòa Vốn Động Chống Âm (Dynamic Fee-Compensated Break-Even)**:
   - **Tự động bù Commission 2 chiều & Swap**: Bot tự động tính toán tổng chi phí hoa hồng hai chiều ($2 \times |\text{pos.Commissions}|$) và phí swap âm tích lũy, quy đổi thành số pips tối thiểu cần bù đắp theo khối lượng lệnh.
   - **Đệm an toàn Zero Net Loss**: Áp dụng khoảng cách $\text{EffectiveBufferPips} = \max(\text{breakEvenExtraPips}, \text{FeePips} + 0.5)$, kết hợp cả cho lệnh đơn lẻ lẫn rổ lệnh DCA Grid trong `GetBreakEvenPrice()`, đảm bảo khi chạm SL vị thế luôn đạt Net PnL $\ge 0$.

6. **Tự Động Kích Hoạt Native Trailing Stop Khi AI ADJUST Dời SL Gần Sát Entry**:
   - Khi AI gửi tín hiệu `ADJUST`, nếu mức SL mới đề xuất thu hẹp được $\ge 80\%$ khoảng cách rủi ro ban đầu so với Entry (hoặc đã vượt qua Entry), cBot sẽ tự động bật tính năng Native Trailing Stop của sàn cTrader (`hasTrailingStop = true`) để server sàn bám sát và khóa chặt lợi nhuận.
   - Tiếp tục tuân thủ cơ chế **Strict One-Way Ratchet**: AI chỉ được dời SL tiếp theo nếu mức mới có lợi hơn mức đang trailing.

---

## 5. Bộ Lọc Tin Tức (ForexFactory News Filter)
- Tự động lấy lịch tin kinh tế tuần này từ ForexFactory (`ff_calendar_thisweek.json`).
- Tự động đóng băng mở lệnh mới trước **30 phút** và sau **30 phút** khi có tin tức đỏ (High-Impact News) liên quan đến đồng `USD`.

---

## 6. Bảng Tham Số Cấu Hình (Parameters Reference)

| Tham Số | Kiểu Dữ Liệu | Mặc Định | Ý Nghĩa / Hướng Dẫn Tối Ưu |
| :--- | :---: | :---: | :--- |
| `UseDirectAiApi` | `bool` | `false` | `false` = Local Server Hub (`127.0.0.1:8181`), `true` = Direct Cloud API |
| `UseAiGateMode` | `bool` | `true` | Cổng lọc 2 tầng: EMA cross định hướng → AI chọn điểm vào chính xác |
| `AiSlSpreadMultiplier` | `double` | `10.0` | Hệ số nhân Spread để tính sàn SL tối thiểu tự động (ví dụ: 10x Spread) |
| `AiSlMinFloorPips` | `double` | `0.0` | Sàn SL tối thiểu thủ công (pips, 0 = Tự động tính 10x Spread & ATR) |
| `enableWickRetracementHunting` | `bool` | `true` | Bật/tắt động cơ săn râu nến chiết khấu chống FOMO cho AI |
| `antiFomoToleranceMode` | `enum` | `Dynamic_ATR_Percent` | `Dynamic_ATR_Percent` = Co giãn theo % ATR (khuyên dùng đa cặp); `Fixed_Pips` = Pips cố định |
| `slippageToleranceAtrPercent` | `double` | `10.0` | Dung sai trượt giá theo % ATR (10% biên độ trung bình nến) |
| `pullbackBufferAtrPercent` | `double` | `5.0` | Vùng đệm pullback kỳ vọng theo % ATR (5% biên độ nến quanh Open) |
| `slippageTolerancePips` | `double` | `5.0` | Dung sai trượt giá dự phòng (pips) khi dùng Fixed_Pips hoặc chưa có ATR |
| `pullbackBufferPips` | `double` | `2.0` | Vùng đệm pullback dự phòng (pips) |
| `maxStagingWaitMinutes` | `int` | `8` | Thời gian chờ tối đa (phút) nhịp hồi trong nến M15 trước khi hủy lệnh |
| `cancelIfTpReachedPercent` | `double` | `50.0` | Tỷ lệ (%) quãng đường tới TP: Nếu giá tự chạy 50% tới TP mà không hồi thì hủy |
| `BotId` | `string` | `smart_trend_xau_m15` | Định danh bot trên hệ thống Server & SQLite |
| `ApiUrl` | `string` | `https://dashscope-intl.aliyuncs.com/...` | Endpoint kết nối Direct AI Cloud API |
| `DashboardServerUrl` | `string` | `http://127.0.0.1:8181` | Endpoint kết nối Local Python AI Server Hub |
| `riskFactor` | `double` | `1.0` | Tỷ lệ rủi ro trên mỗi lệnh (%) |
| `SLTPpercentage` | `bool` | `true` | Tính SL/TP theo % biến động giá thay vì pips cố định |
| `takeprofitPercentage` | `double` | `3.2` | Mức chốt lời theo % giá |
| `stoplossPercentage` | `double` | `1.8` | Mức cắt lỗ theo % giá |
| `periodTEMA1` / `periodTEMA2` | `int` | `147` / `183` | Chu kỳ cặp đường xu hướng TEMA M15 |
| `periodRSI` | `int` | `33` | Chu kỳ RSI chính |
| `minADX` | `double` | `25.0` | Ngưỡng lọc độ mạnh xu hướng tối thiểu |
| `enableNewsFilter` | `bool` | `true` | Bật/tắt né tin tức High-Impact ForexFactory |
| `enableBreakEvenPrice` | `bool` | `false` | Bật/tắt tính năng dời SL về hòa vốn |
| `breakEvenRrTrigger` | `double` | `2.0` | Tỷ lệ R:R tối thiểu để kích hoạt dời SL về hòa vốn |
| `enableAiAdjustTrailing` | `bool` | `true` | Tự động kích hoạt Native Trailing Stop khi AI ADJUST dời SL gần sát Entry |
| `aiAdjustTrailingThresholdPercent` | `double` | `80.0` | Ngưỡng (%) giảm rủi ro ban đầu để tự động bật Trailing Stop |
| `enableEquityProtection` | `bool` | `false` | Bật chế độ Circuit Breaker giảm rủi ro khi sụt vốn |
| `enableTelegramAlerts` | `bool` | `false` | Bật/tắt thông báo Telegram |
| `sendAiAdjustAlerts` | `bool` | `false` | Bật/tắt cảnh báo định kỳ AI ADJUST (mặc định `false` để chống spam) |
| `sendAntiFomoStagedAlerts` | `bool` | `false` | Bật/tắt cảnh báo trung gian Anti-FOMO Armed/Expired/Cancelled (mặc định `false` để chống spam) |

---

## 7. Cơ Chế Chống Spam & Định Dạng Thông Báo Telegram Chuẩn
- **Nguyên tắc chống spam (Anti-Spam Standard)**:
  - Chỉ gửi thông báo khi có sự kiện giao dịch thực sự: **Mở Lệnh** và **Đóng Lệnh**.
  - Tắt các thông báo trung gian gây loãng tin nhắn (`ADJUST Evaluated` mỗi nến, `Anti-FOMO Armed`, `Anti-FOMO Expired`, `Anti-FOMO Cancelled`).
  - Triệt tiêu hiện tượng gửi 2 thông báo trùng lặp (1 từ cBot và 1 từ Server Hub): Khi kết nối Server Hub, Hub là trung tâm phát cảnh báo duy nhất; cBot chỉ gửi trực tiếp khi chạy Standalone không có Hub.
- **Đầy đủ thông tin chuẩn hóa cho mỗi sự kiện**:
  - `🚀 [Trading Agent Hub] Position Opened`: Số tài khoản, Bot Label, Tên Symbol, Loại lệnh (BUY/SELL), Khối lượng (lots), Entry Price, Stop Loss (giá và pips), Take Profit (giá và pips), Lý do vào lệnh.
  - `🏁 [Trading Agent Hub] Position Closed`: Số tài khoản, Bot Label, Tên Symbol, Loại lệnh (BUY/SELL), Khối lượng (lots), Entry ➔ Exit Price, Net PnL ($ và pips), Lý do đóng lệnh (TP/SL/Manual/ProfitLockExit), Số dư & Equity.

