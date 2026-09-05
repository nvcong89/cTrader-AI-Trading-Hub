# 🤖 Chiến Thuật: cBot Agent Template (EMA Cross & Gemini AI Bridge)

Tài liệu thiết kế kiến trúc chuẩn mực và chiến lược giao dịch mẫu cho **`cbot_agent_template`** – Bộ khung mẫu (Template) tiêu chuẩn cho tất cả các cBot tích hợp AI Agent trong hệ thống `cTrader-AI-Trading-Hub`.

---

## 1. 🎯 Tổng Quan & Triết Lý Chiến Thuật (Overview)
- **Tên cBot**: `cbot_agent_template`
- **Mục đích**: Làm **Bot mẫu chuẩn (Standard Reference Template)** cho Agent và nhà phát triển khi tạo bot mới, cung cấp sẵn 100% hạ tầng cốt lõi (Risk Engine, Circuit Breaker, DCA, Break-Even, Trailing Stop, ForexFactory News, Telegram Alerts, Gemini AI Bridge) và chiến thuật **EMA Cross** đơn giản, hiệu quả.
- **Cặp giao dịch mục tiêu**: `XAUUSD` (hoặc bất kỳ cặp Forex/Crypto nào).
- **Khung thời gian tối ưu**: `M5`, `M15`, `H1`.
- **Triết lý giao dịch**:
  - Giao dịch theo xu hướng ngắn/trung hạn khi đường Trung bình Động Hàm Mũ Nhanh (**Fast EMA**) cắt đường Chậm (**Slow EMA**).
  - Tùy chọn lọc tín hiệu bằng chỉ báo Sức mạnh Tương đối (**RSI Filter**) để tránh vào lệnh ở vùng quá mua/quá bán.
  - Đồng bộ và nhận lệnh cố vấn/can thiệp trực tiếp từ **Gemini AI Agent** qua Web Bridge (`/trade`).

---

## 2. 📊 Hệ Thống Phân Tích Kỹ Thuật (Technical Analysis Engine)

### 2.1. Các Chỉ Báo Kỹ Thuật
- **Fast EMA (Chu kỳ mặc định: 9)**: Phản ứng nhanh với biến động giá hiện tại.
- **Slow EMA (Chu kỳ mặc định: 21)**: Xác định xu hướng nền tảng.
- **RSI (Chu kỳ 14 - Tùy chọn bật/tắt)**: Lọc vùng quá tải giá.
- **ATR (Chu kỳ 14)**: Đo lường độ biến động thị trường.

### 2.2. Điều Kiện Vào Lệnh (Signal Triggers)
- **Tín hiệu BUY**:
  - `Fast EMA` cắt lên trên `Slow EMA` (`HasCrossedAbove` hoặc `EMA9(0) > EMA21(0)` và `EMA9(-1) <= EMA21(-1)`).
  - Nếu bật `enableRsiFilter`: `RSI(14) < rsiOverbought (70.0)`.
- **Tín hiệu SELL**:
  - `Fast EMA` cắt xuống dưới `Slow EMA` (`HasCrossedBelow` hoặc `EMA9(0) < EMA21(0)` và `EMA9(-1) >= EMA21(-1)`).
  - Nếu bật `enableRsiFilter`: `RSI(14) > rsiOversold (30.0)`.
- **Đóng Lệnh Ngược Chiều (Opposite Close)**:
  - Tự động đóng lệnh BUY khi Fast EMA cắt xuống dưới Slow EMA.
  - Tự động đóng lệnh SELL khi Fast EMA cắt lên trên Slow EMA.

---

## 3. 🤖 Tích Hợp AI Agent (Direct Qwen / OpenRouter & Local Server Dual Mode)

### 3.1. Chế Độ Kết Nối Kép (Dual AI Connection Modes)
1. **`Direct_OpenRouter_DashScope` (Mặc định - Khuyên Dùng)**:
   - cBot C# gửi HTTP POST trực tiếp tới OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) hoặc Alibaba DashScope.
   - **Độ trễ cực thấp**: ~800ms - 1.5s (giảm 95% thời gian so với Playwright).
   - Tự động đóng gói System Prompt + Market Snapshot và yêu cầu trả về cấu trúc JSON thuần túy (`response_format: json_object`).
2. **`Local_Python_Server` (Legacy Proxy)**:
   - Gửi snapshot qua `http://127.0.0.1:8181/trade` cho Python server trung gian xử lý.

### 3.2. Cơ Chế An Toàn "Safety Guard Mode" (3-Strike Rule & 15m Cooldown)
- Tự động theo dõi số lần thất bại liên tiếp (`_consecutiveAiFailures`).
- Nếu gặp lỗi kết nối, timeout (>15s), lỗi phân tích cú pháp hoặc HTTP 429/500:
  - Tăng bộ đếm lỗi.
  - Khi lỗi đạt **3 lần liên tiếp**: cBot tự động chuyển sang trạng thái tạm dừng đánh giá AI trong **15 phút** (`_aiCooldownUntil`), đồng thời gửi thông báo khẩn cấp qua Telegram để bảo vệ tài khoản.
- Tự động reset bộ đếm về 0 ngay khi có phản hồi AI hợp lệ.

### 3.3. Giám Sát Nền Không Chặn (Async Dashboard Telemetry)
- Khi chạy ở chế độ Direct AI, cBot vẫn tự động gửi tick và trade reports về Web Dashboard Python (`http://127.0.0.1:8181/api/tick`) qua luồng nền không đồng bộ (`Task.Run`), đảm bảo giao diện React UI luôn hiển thị số liệu thời gian thực mà không làm chậm tốc độ vào lệnh.

---

## 4. 🛡️ Quản Lý Vốn & Kiểm Soát Rủi Ro (Risk Management Engine)

1. **Khối lượng vào lệnh linh hoạt**:
   - `Fixed Volume`: Khối lượng cố định (ví dụ: 0.01 lot).
   - `% Risk per Equity`: Tự động tính lot dựa trên % tài khoản chấp nhận chịu rủi ro và khoảng cách Stop Loss.
2. **Cắt lỗ & Chốt lời**:
   - Hỗ trợ cả 2 chế độ: `% Vốn thực` (ví dụ SL 1.5%, TP 3.0%) hoặc `Pips` cố định (ví dụ SL 150 pips, TP 300 pips).
3. **Bảo vệ sụt giảm vốn High-Watermark (Circuit Breaker)**:
   - Theo dõi đỉnh vốn cao nhất (`_peakEquity`).
   - Theo dõi đỉnh vốn cao nhất (`_peakEquity`).
   - Nếu mức sụt giảm `Drawdown >= maxEquityDDPercent (15%)`, tự động kích hoạt chế độ phòng thủ: giảm 50% rủi ro cho các lệnh kế tiếp và bắn cảnh báo Telegram.
4. **AI Gate Mode & Technical SL/TP Determination**:
   - **Pre-filter Gate**: Logic kỹ thuật (EMA Cross + RSI) đóng vai trò cổng lọc xu hướng (`bias_direction`). AI Agent là người đưa ra quyết định precision entry duy nhất trong phạm vi cổng cho phép.
   - **Dynamic SL Minimum Floor (`AiSlSpreadMultiplier = 10.0`, `AiSlMinFloorPips = 0.0`)**: Tự động tính toán sàn bảo vệ Stop Loss theo công thức $\max(\text{Spread}_{\text{pips}} \times 10.0, \, \text{ATR}_{14} \times 0.8)$. Không còn hardcode cố định, tự động thích ứng với từng symbol (EURUSD ~10 pips, XAUUSD ~200 pips, Indices, Crypto). Người dùng có thể chỉnh `AiSlMinFloorPips > 0` nếu muốn đặt sàn pips thủ công.
   - **Pure Technical SL/TP (SMC-Based)**: Điểm chốt lời (TP) và cắt lỗ (SL) do AI tính toán 100% dựa trên các vùng cấu trúc kỹ thuật thực tế (Order Blocks, Swing High/Low, FVG, Liquidity Pools), không ép tỷ lệ R:R nhân tạo.
   - **Volume Authority**: Quyền kiểm soát khối lượng (Lots) thuộc 100% về cBot Risk Engine nội bộ (% Equity hoặc Fixed Vol); AI không can thiệp volume.
5. **Dời Stop Loss Hòa Vốn Động Chống Âm (Dynamic Fee-Compensated Break-Even) & Native Trailing Stop**:
   - **Tự động bù toàn diện phí sàn (Commission & Swap)**: Bot tự động đọc `pos.Commissions` (nhân 2 cho vòng giao dịch round-trip) và phí `pos.Swap` âm lũy kế qua đêm, quy đổi thành số pips tối thiểu cần bù: $\text{FeePips} = \frac{\text{TotalFees}}{\text{pos.VolumeInUnits} \times \text{Symbol.PipValue}}$.
   - **Đệm an toàn tuyệt đối (Zero Net Loss)**: Áp dụng khoảng cách $\text{EffectiveBufferPips} = \max(\text{breakEvenExtraPips}, \text{FeePips} + 0.5)$, đảm bảo khi chạm SL vị thế luôn đạt Net PnL $\ge 0$ (loại bỏ triệt để rủi ro mang tiếng hòa vốn nhưng tài khoản vẫn bị âm tiền do phí sàn).
   - Hỗ trợ 2 chế độ kích hoạt linh hoạt: `Risk_Reward_Ratio` (ví dụ đạt $1.0R$) hoặc `Fixed_Pips` (ví dụ $20$ pips).
   - Khi `enableTrailingStopFromBreakEven` được bật, bot tự động kích hoạt Native Trailing Stop của máy chủ sàn cTrader (`hasTrailingStop: true`) để trailing tự động mượt mà ở cấp nền tảng.
6. **Bám sát lợi nhuận (Trailing Stop) & Strict One-Way Ratchet (No Loosening)**:
   - Dời SL tịnh tiến theo giá khi lợi nhuận đạt ngưỡng kích hoạt qua Native Trailing Stop (không spam tick).
   - **Tự động kích hoạt Native Trailing Stop khi AI ADJUST dời SL gần sát Entry**: Khi nhận quyết định `ADJUST`, nếu mức SL mới đề xuất thu hẹp được $\ge 80\%$ rủi ro ban đầu (hoặc đã vượt qua Entry), cBot tự động bật cờ Native Trailing Stop (`hasTrailingStop = true`) để server cTrader bám sát và khóa chặt lợi nhuận.
   - **Chỉ nhận AI ADJUST khi có lợi hơn cho Profit (Ratchet 1 chiều)**: Khi AI Agent gửi tín hiệu `ADJUST`, bot chỉ dời SL khi mức đề xuất có lợi hơn SL hiện tại (`targetSL > pos.StopLoss` cho BUY, `targetSL < pos.StopLoss` cho SELL). Tuyệt đối không lùi SL về phía sau. Nếu không có lợi, bỏ qua phần sửa SL và tiếp tục để Trailing Stop của sàn hoạt động.
8. **Cơ Chế Săn Râu Nến Chiết Khấu Chống FOMO (Anti-FOMO & Candle Wick Retracement Hunting)**:
   - Triệt tiêu hoàn toàn hiện tượng trượt giá và đu đỉnh/đáy do độ trễ 20–30s của AI: Khi AI trả về quyết định `BUY`/`SELL`, cBot đánh giá khoảng cách giá hiện tại so với giá mở cửa cây nến (`Bars.LastBar.Open`).
   - **Chế độ Dung sai Động (`Dynamic_ATR_Percent`)**: Dung sai trượt giá tự động tính bằng $\text{ATR}(14) \times (\text{slippageToleranceAtrPercent} / 100)$, tương thích tự động 100% cho mọi symbol (Forex, Vàng, Chỉ số Dow Jones, Nasdaq, Crypto) mà không cần cấu hình pips thủ công. Kèm sàn an toàn $\ge 1.5\times\text{Spread}$.
   - Nếu giá chưa chạy xa ($\le \text{Dung sai trượt giá}$), cBot mở Market Order ngay tại chân nến.
   - Nếu giá đã phóng xa ($> \text{Dung sai trượt giá}$), cBot chuyển trạng thái sang **Staging (`ARMED_BUY` / `ARMED_SELL`)** và kiên nhẫn theo dõi từng tick (`OnTick`). Khi giá nến M15 tạo nhịp hồi (Pullback) lùi về vùng giá mở cửa ($\pm \text{Vùng đệm Pullback}$ tính theo % ATR hoặc pips), cBot bóp cò khớp lệnh tại mức giá chiết khấu với R:R tối ưu.
   - Tự động hủy lệnh chờ (Invalidation) nếu: cây nến M15 kết thúc mà không hồi đón, hết hạn chờ `maxStagingWaitMinutes (8m)`, giá đã đi được $\ge 50\%$ quãng đường tới TP, hoặc giá thủng mức Stop Loss dự kiến.

---

## 5. 📰 Bộ Lọc Tin Tức (ForexFactory News Filter)
- Tự động tải lịch kinh tế từ ForexFactory (JSON feed, XML fallback).
- Tạm dừng mở vị thế trước và sau `pauseBeforeNewsMins / pauseAfterNewsMins (30 phút)` đối với tin tức High Impact của đồng USD.

---

## 6. 📋 Bảng Tham Số Cấu Hình Chuẩn (Parameter Reference)

| Tham Số (Parameter) | Kiểu Dữ Liệu | Giá Trị Mặc Định | Mô Tả & Khuyến Nghị Tối Ưu |
| :--- | :---: | :---: | :--- |
| `UseDirectAiApi` | `bool` | `false` | `false` = Local Server Hub (`127.0.0.1:8181`), `true` = Direct Cloud API |
| `UseAiGateMode` | `bool` | `true` | Cổng lọc 2 tầng: EMA cross định hướng → AI chọn điểm vào chính xác |
| `AiSlSpreadMultiplier` | `double` | `10.0` | Hệ số nhân Spread để tính sàn SL tối thiểu tự động (ví dụ: 10x Spread) |
| `AiSlMinFloorPips` | `double` | `0.0` | Sàn SL tối thiểu thủ công (pips, 0 = Tự động tính từ 10x Spread & ATR) |
| `enableWickRetracementHunting` | `bool` | `true` | Bật/tắt động cơ săn râu nến chiết khấu chống FOMO cho AI |
| `antiFomoToleranceMode` | `enum` | `Dynamic_ATR_Percent` | `Dynamic_ATR_Percent` = Co giãn theo % ATR (khuyên dùng đa cặp); `Fixed_Pips` = Pips cố định |
| `slippageToleranceAtrPercent` | `double` | `10.0` | Dung sai trượt giá theo % ATR (10% biên độ trung bình nến) |
| `pullbackBufferAtrPercent` | `double` | `5.0` | Vùng đệm pullback kỳ vọng theo % ATR (5% biên độ nến quanh Open) |
| `slippageTolerancePips` | `double` | `5.0` | Dung sai trượt giá dự phòng (pips) khi dùng Fixed_Pips hoặc chưa có ATR |
| `pullbackBufferPips` | `double` | `2.0` | Vùng đệm pullback dự phòng (pips) |
| `maxStagingWaitMinutes` | `int` | `8` | Thời gian chờ tối đa (phút) nhịp hồi trong nến M15 trước khi hủy lệnh |
| `cancelIfTpReachedPercent` | `double` | `50.0` | Tỷ lệ (%) quãng đường tới TP: Nếu giá tự chạy 50% tới TP mà không hồi thì hủy |
| `ApiUrl` | `string` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions` | Endpoint gọi OpenAI-compatible API |
| `AiApiKey` | `string` | `""` | API Key (để trống nếu dùng `API_key.env`) |
| `AiModelName` | `string` | `qwen3.7-flash` | Tên mô hình AI Qwen / DeepSeek / Gemini |
| `AiConfidenceThreshold` | `double` | `70.0` | Ngưỡng tin cậy tối thiểu (%) để cBot vào lệnh |
| `aiTimeoutSeconds` | `int` | `300` | Thời gian chờ tối đa cho 1 request AI (giây) |
| `EnableDashboardTelemetry` | `bool` | `true` | Bật/tắt gửi dữ liệu giám sát ngầm về Web Dashboard |
| `DashboardServerUrl` | `string` | `http://127.0.0.1:8181` | Địa chỉ máy chủ Web Dashboard nội bộ |
| `fastEmaPeriod` | `int` | `9` | Chu kỳ EMA nhanh (Khuyên dùng: 5 - 20) |
| `slowEmaPeriod` | `int` | `21` | Chu kỳ EMA chậm (Khuyên dùng: 20 - 100) |
| `enableRsiFilter` | `bool` | `false` | Bật/tắt bộ lọc vùng quá mua/quá bán RSI |
| `periodRSI` | `int` | `14` | Chu kỳ chỉ báo RSI |
| `rsiOverbought` | `double` | `70.0` | Ngưỡng quá mua RSI (không mở BUY nếu vượt) |
| `rsiOversold` | `double` | `30.0` | Ngưỡng quá bán RSI (không mở SELL nếu thấp hơn) |
| `riskFactor` | `double` | `1.0` | % Vốn chấp nhận rủi ro trên mỗi lệnh |
| `SLTPpercentage` | `bool` | `true` | Tính SL/TP theo % Vốn (true) hoặc theo Pips (false) |
| `stoplossPercentage` | `double` | `1.5` | % Cắt lỗ theo vốn thực |
| `takeprofitPercentage`| `double` | `3.0` | % Chốt lời theo vốn thực |
| `enableTrailingStop` | `bool` | `false` | Bật tính năng Trailing Stop |
| `enableAiAdjustTrailing` | `bool` | `true` | Tự động kích hoạt Native Trailing Stop khi AI ADJUST dời SL gần sát Entry |
| `aiAdjustTrailingThresholdPercent` | `double` | `80.0` | Ngưỡng (%) giảm rủi ro ban đầu để tự động bật Trailing Stop |
| `enableBreakEvenPrice`| `bool` | `false` | Bật tính năng dời SL về hòa vốn |
| `breakEvenRrTrigger` | `double` | `2.0` | Tỷ lệ R:R tối thiểu để kích hoạt dời SL về hòa vốn |
| `dcaEnable` | `bool` | `false` | Bật chiến thuật lưới trung bình giá DCA |
| `enableNewsFilter` | `bool` | `true` | Bật bộ lọc né tin tức đỏ ForexFactory |
| `BotId` | `string` | `cbot_agent_template` | ID định danh bot gửi tới Hub / Dashboard |
| `enableTelegramAlerts` | `bool` | `true` | Bật/tắt thông báo Telegram |
| `sendAiAdjustAlerts` | `bool` | `false` | Bật/tắt cảnh báo định kỳ AI ADJUST (mặc định `false` để chống spam) |
| `sendAntiFomoStagedAlerts` | `bool` | `false` | Bật/tắt cảnh báo trung gian Anti-FOMO Armed/Expired/Cancelled (mặc định `false` để chống spam) |

---

## 7. 🛡️ Cơ Chế Chống Spam & Định Dạng Thông Báo Telegram Chuẩn
- **Nguyên tắc chống spam (Anti-Spam Standard)**:
  - Chỉ gửi thông báo khi có sự kiện giao dịch thực sự: **Mở Lệnh** và **Đóng Lệnh**.
  - Tắt các thông báo trung gian gây loãng tin nhắn (`ADJUST Evaluated` mỗi nến, `Anti-FOMO Armed`, `Anti-FOMO Expired`, `Anti-FOMO Cancelled`).
  - Triệt tiêu hiện tượng gửi 2 thông báo trùng lặp (1 từ cBot và 1 từ Server Hub): Khi kết nối Server Hub, Hub là trung tâm phát cảnh báo duy nhất; cBot chỉ gửi trực tiếp khi chạy Standalone không có Hub.
- **Đầy đủ thông tin chuẩn hóa cho mỗi sự kiện**:
  - `🚀 [Trading Agent Hub] Position Opened`: Số tài khoản, Bot Label, Tên Symbol, Loại lệnh (BUY/SELL), Khối lượng (lots), Entry Price, Stop Loss (giá và pips), Take Profit (giá và pips), Lý do vào lệnh.
  - `🏁 [Trading Agent Hub] Position Closed`: Số tài khoản, Bot Label, Tên Symbol, Loại lệnh (BUY/SELL), Khối lượng (lots), Entry ➔ Exit Price, Net PnL ($ và pips), Lý do đóng lệnh (TP/SL/Manual/ProfitLockExit), Số dư & Equity.

