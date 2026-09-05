# 🤖 Chiến Thuật: Asian Range Judas Sweep AI Bot

Tài liệu thiết kế kiến trúc và chiến thuật giao dịch cho **Asian Range Judas Sweep AI Bot** (Săn Quét Thanh Khoản Phiên Á - ICT Judas Swing kết hợp AI Agent Sniper Mode trên cTrader 5.x Native).

---

## 1. 🎯 Tổng Quan & Triết Lý Chiến Thuật
- **Tên cBot**: `Asian Range Judas Sweep AI Bot`
- **Cặp giao dịch mục tiêu**: `XAUUSD` (Vàng)
- **Khung thời gian**: `M15` (Dữ liệu phiên Á: `00:00 - 06:00 UTC`, Phiên săn lệnh: London `07:00 - 10:00 UTC` & New York Overlap `12:30 - 16:00 UTC`)
- **Triết lý giao dịch**:
  - Tận dụng đặc tính nén tích lũy của Vàng trong phiên Á (`Asian Range`).
  - Khi bước vào phiên London hoặc New York, dòng tiền tạo lập (Smart Money) thường tạo ra các đợt phá vỡ giả mạo (**Judas Swing / Liquidity Sweep**) quét qua đỉnh/đáy phiên Á nhằm kích hoạt các lệnh chờ Breakout của retail trader.
  - cBot phát hiện thời điểm giá quét thanh khoản rồi rút râu đóng nến quay trở lại range, mở **Cổng Lọc Trước (Pre-filter Gate)** kích hoạt AI Agent phân tích hành vi nến (Pinbar / Fakeout / Order Block) để vào lệnh Sniper đảo chiều với tỷ lệ Risk:Reward vượt trội.

---

## 2. 📊 Hệ Thống Phân Tích Kỹ Thuật & Khung Thời Gian Giao Dịch
- **Quy Trình Phân Bổ Thời Gian Chuẩn 24H (Session Timeline)**:
  ```
  [00:00 - 06:00 UTC] ➔ THU THẬP & TÍCH LŨY (Phiên Á - Tuyệt đối KHÔNG vào lệnh mới)
           │
  [06:00 - 07:00 UTC] ➔ KHOẢNG NGHỈ TRƯỚC LONDON (Outside Killzones - KHÔNG vào lệnh)
           │
  [07:00 - 10:00 UTC] ➔ ⚡ LONDON OPEN KILLZONE (Thời Điểm Vàng Săn Quét #1 - Cho phép mở lệnh)
           │
  [10:00 - 12:30 UTC] ➔ KHOẢNG NGHỈ GIỮA PHIÊN (Outside Killzones - Chỉ quản lý lệnh đang chạy)
           │
  [12:30 - 16:00 UTC] ➔ ⚡ NEW YORK OVERLAP KILLZONE (Thời Điểm Vàng Săn Quét #2 - Cho phép mở lệnh)
           │
  [Sau 16:00 UTC]     ➔ ĐÓNG CỔNG VÀO MỚI (Outside Killzones - Chỉ quản lý vị thế hiện hữu)
  ```
- **Kiến Trúc Khóa Cứng 3 Lớp (Triple-Layer Session Guard Architecture)**:
  1. *Lớp 1 (FastAPI Server Hub /trade)*: Khi sổ lệnh sạch (`active_positions` trống) và `killzone_session == "Outside Killzones"`, server lập tức trả về `HOLD` (confidence 100%), ngắt hoàn toàn việc gọi LLM nhằm tiết kiệm chi phí token và độ trễ.
  2. *Lớp 2 (cBot Pre-Filter Gate)*: Ngoài khung giờ Killzone, cBot khóa chặt `_allowedAiDirection = "MANAGE_ONLY"`, vô hiệu hóa `gateOpen` để không gửi yêu cầu tìm lệnh mới lên server hoặc AI Direct.
  3. *Lớp 3 (cBot Execution Guard)*: Mọi phương thức mở lệnh (`ExecuteDecision`, `createOrder`, `ProcessStagedOrderExecution`) đều kiểm tra `IsGoldenKillzone()`. Bất kỳ quyết định `BUY`/`SELL` nào phát sinh ngoài khung giờ vàng đều bị từ chối và ghi log cảnh báo.
- **Theo Dõi Phiên Á (`TrackAsianSession`)**:
  - Ghi nhận mức giá cao nhất (`Asian High`), thấp nhất (`Asian Low`) và biên độ pips (`Asian Range`) trong khoảng `00:00 – 06:00 UTC`.
  - Tự động vẽ các đường biên ngang trực quan trên Chart (`if (Chart != null)`).
- **Khung Giờ Vàng (Golden Killzones)**:
  - **London Open Killzone**: `07:00 – 10:00 UTC` (Thời điểm săn quét thanh khoản mạnh nhất).
  - **New York Overlap Killzone**: `12:30 – 16:00 UTC` (Thời điểm dòng tiền Mỹ gia nhập).
- **Chuẩn Hóa Biên Độ & Quét Râu Động (Dynamic ATR Architecture)**:
  - **Hộp Phiên Á Động (`Daily ATR`)**: Đo lường biên độ phiên Á theo tỷ lệ % của `Daily ATR(14)`.
    - `Min Asian Range`: Phải $\ge 15\%$ Daily ATR (loại trừ thị trường kiệt quệ thanh khoản / ngày nghỉ lễ).
    - `Max Asian Range`: Phải $\le 60\%$ Daily ATR (loại trừ các phiên Á đã bùng nổ sóng xu hướng quá mạnh do tin tức khu vực, không còn là tích lũy).
  - **Khoảng Đệm Quét Râu Động (`M15 ATR`)**:
    - Khoảng râu nến M15 chọc thủng đỉnh/đáy phiên Á: $\text{sweepBuffer} = \max(\text{M15 ATR}_{14} \times 20\%, \, \text{Spread} \times 1.5)$.
    - Tự động co giãn theo từng symbol (Vàng, Ngoại tệ, Chỉ số, Crypto) mà không lo sai lệch định nghĩa pips giữa các broker.
- **Điều Kiện Kích Hoạt Cổng Lọc (Gate Triggers)**:
  - **SELL Gate (`JUDAS_SWEEP_SELL`)**: Trong Killzone, nến M15 tạo râu vượt qua `Asian High + sweepBuffer`, nhưng đóng nến trở lại bên dưới `Asian High`.
  - **BUY Gate (`JUDAS_SWEEP_BUY`)**: Trong Killzone, nến M15 tạo râu nhúng sâu dưới `Asian Low - sweepBuffer`, nhưng đóng nến trở lại bên trên `Asian Low`.
  - **MANAGE_ONLY**: Ngoài các khung giờ Killzone hoặc khi biên độ phiên Á nằm ngoài khoảng $15\% - 60\%$ Daily ATR.

---

## 3. 🤖 Tích Hợp Gemini / Qwen AI Agent
- **Truyền Ngữ Cảnh Chuyên Biệt Trong Prompt**:
  - Cung cấp dữ liệu phiên Á: `Asian High`, `Asian Low`, `Asian Range (pips)`, `Active Killzone Window`.
  - Cung cấp 50 nến OHLCV gần nhất, chỉ báo ATR(14) theo pips, Fast/Slow EMA, RSI và Lịch sử 5 lệnh gần nhất (24h).
- **Quy Tắc SMC Của AI**:
  - Xác nhận nến quét thanh khoản (Liquidity Sweep) và vùng Order Block / Fair Value Gap (FVG) hợp lệ.
  - Đưa ra quyết định: `BUY`, `SELL`, `HOLD`, `ADJUST`, `CLOSE_ALL` (Ngưỡng tin cậy tối thiểu `70.0%`).
  - Xác định Stop Loss (SL) sau râu nến quét (sàn tối thiểu động $\max(\text{Spread}_{\text{pips}} \times 10.0, \, \text{ATR}_{14} \times 0.8)$) và Take Profit (TP) tại biên đối diện của phiên Á.

---

## 4. 🛡️ Quản Lý Vốn & Rủi Ro Cấp Thể Chế
- **Volume Authority**: Quyền kiểm soát khối lượng hoàn toàn thuộc về cBot Risk Engine nội bộ (`CalculateSLTP`).
- **Sàn Stop Loss Tối Thiểu Động (`AiSlSpreadMultiplier = 10.0`, `AiSlMinFloorPips = 0.0`)**: Tự động tính sàn bảo vệ Stop Loss theo $\max(\text{Spread}_{\text{pips}} \times 10.0, \, \text{ATR}_{14} \times 0.8)$ để chống quét nhiễu/spread trên mọi cặp tiền tệ và hàng hóa.
- **Dời Hòa Vốn (Break-Even) & Native Trailing Stop**: Tự động dời SL về `Entry + 2 pips` khi lợi nhuận đạt `breakEvenTrigger (250 pips)`. Khi `enableTrailingStopFromBreakEven` được bật, bot kích hoạt `hasTrailingStop: true` để hệ thống máy chủ sàn cTrader tự động bám đuôi trailing stop mượt mà (không spam API tick-by-tick).
- **Strict One-Way Profit Ratchet (Không Nới Lỏng SL)**: Khi AI gửi đề xuất `ADJUST`, bot chỉ chấp nhận dời SL khi mức SL mới thực sự có lợi hơn và bảo vệ lợi nhuận tốt hơn SL hiện tại (`targetSL > pos.StopLoss` cho BUY, `targetSL < pos.StopLoss` cho SELL). Tuyệt đối không lùi SL về phía sau. Nếu đề xuất không có lợi, bot bỏ qua phần sửa SL và tiếp tục duy trì Trailing Stop của sàn.
- **Cơ Chế Săn Râu Nến Chiết Khấu Chống FOMO (Anti-FOMO & Candle Wick Retracement Hunting)**:
  - Khắc phục triệt để độ trễ xử lý 20–30s của AI: Khi AI trả về quyết định `BUY`/`SELL`, cBot đánh giá khoảng cách giá hiện tại so với giá mở cửa cây nến (`Bars.LastBar.Open`).
  - **Chế độ Dung sai Động (`Dynamic_ATR_Percent`)**: Dung sai trượt giá tự động tính bằng $\text{ATR}(14) \times (\text{slippageToleranceAtrPercent} / 100)$, tương thích tự động 100% cho mọi symbol (Forex, Vàng, Chỉ số Dow Jones, Nasdaq, Crypto) mà không cần cấu hình pips thủ công. Kèm sàn an toàn $\ge 1.5\times\text{Spread}$.
  - Nếu giá chưa chạy xa ($\le \text{Dung sai trượt giá}$), cBot khớp Market Order ngay tại chân nến.
  - Nếu giá đã phóng xa ($> \text{Dung sai trượt giá}$), cBot không mua/bán đuổi mà chuyển quyết định vào bộ đệm **Staging (`ARMED_BUY` / `ARMED_SELL`)** và kiên nhẫn theo dõi từng tick (`OnTick`). Khi giá nến M15 tạo nhịp hồi (Pullback) lùi về vùng giá mở cửa ($\pm \text{Vùng đệm Pullback}$ tính theo % ATR hoặc pips), cBot bóp cò khớp lệnh tại mức giá chiết khấu với R:R tối ưu.
  - Tự động hủy lệnh chờ (Invalidation) nếu: cây nến M15 kết thúc mà không hồi đón, hết hạn chờ `maxStagingWaitMinutes (8m)`, giá đã đi được $\ge 50\%$ quãng đường tới TP, hoặc giá thủng mức Stop Loss dự kiến.
- **Ngắt Mạch Bảo Vệ Vốn (High-Watermark Circuit Breaker)**: Giảm 50% rủi ro khi mức sụt giảm `Drawdown >= 15%`.
- **Dời Stop Loss Hòa Vốn Động Chống Âm (Dynamic Fee-Compensated Break-Even)**: Tự động tính toán tổng chi phí hoa hồng hai chiều ($2 \times |\text{pos.Commissions}|$) và swap âm, quy đổi thành pips theo khối lượng và đảm bảo $\text{EffectiveBufferPips} = \max(\text{breakEvenExtraPips}, \text{FeePips} + 0.5)$ để Net PnL luôn $\ge 0$ khi chạm SL.
- **Tự Động Kích Hoạt Native Trailing Stop Khi AI ADJUST Dời SL Gần Sát Entry**: Khi AI gửi tín hiệu `ADJUST`, nếu mức SL mới đề xuất thu hẹp được $\ge 80\%$ khoảng cách rủi ro ban đầu so với Entry (hoặc đã vượt qua Entry), cBot sẽ tự động bật tính năng Native Trailing Stop của sàn cTrader (`hasTrailingStop = true`) để server sàn bám sát và khóa chặt lợi nhuận.

---

## 5. 📰 Bộ Lọc Tin Tức Đa Tầng (ForexFactory Multi-Layer News Blackout)
- **Tải Lịch Kinh Tế Tự Động & Đa Tầng Dự Phòng (3 Tầng)**:
  - Tầng 1: Tải trực tiếp JSON từ ForexFactory (`ff_calendar_thisweek.json`) chạy nền ngầm (`Task.Run`) không chặn luồng chính cTrader.
  - Tầng 2: Tự động fallback sang XML (`ff_calendar_thisweek.xml`) khi JSON gặp sự cố hoặc mã lỗi `429 Too Many Requests`.
  - Tầng 3: Tự động nạp từ bộ đệm đĩa cục bộ (`ff_calendar_cache.json` / `xml`) khi toàn bộ kết nối ra ngoài bị chặn, đảm bảo bot khởi động là có ngay dữ liệu bảo vệ.
- **Chuẩn Hóa Múi Giờ UTC 100%**: Sử dụng `DateTimeOffset` trích xuất múi giờ tuyệt đối của ForexFactory và quy chuẩn về UTC, triệt tiêu hoàn toàn lỗi lệch 7 tiếng so với giờ máy chủ.
- **Nhận Diện Cặp Tiền Thông Minh (`IsCurrencyRelevant`)**: Tự động liên kết tin tức USD/All cho Vàng (`XAUUSD`), Bạc (`XAGUSD`), Crypto (`BTCUSD`), và trích xuất đúng Base/Quote Currency cho các cặp tiền Forex chéo (`EURUSD`, `GBPJPY`,...).
- **Cơ Chế Khóa Lệnh 3 Tầng Bảo Vệ**:
  - Tầng 1 (Pre-filter Gate): Tại `OnBarClosed()`, khi nằm trong cửa sổ tin đỏ (`pauseBeforeNewsMins` đến `pauseAfterNewsMins`), cổng tín hiệu bị khóa cứng ở trạng thái `MANAGE_ONLY`, không gửi truy vấn mở lệnh mới sang AI.
  - Tầng 2 (Execution Gate): Tại `ExecuteDecision()`, chặn đứng tức thì nếu quyết định `BUY`/`SELL` từ AI trả về trúng thời điểm tin tức đang diễn ra.
  - Tầng 3 (Staged Pullback Gate): Tại `ProcessStagedOrderExecution()`, hủy ngay lập tức các lệnh chờ hồi giá (Anti-FOMO Staged) nếu thị trường bước vào vùng bão tin.
- **Đóng Vị Thế Thời Gian Thực**: `OnTick()` kiểm tra throttled 15s để kích hoạt `CloseAllPositions()` chính xác trước tin nếu tham số `closePositionsBeforeNews = true`.
- **Trực Quan Hóa Trên Biểu Đồ**: Hiển thị trạng thái tin tức và đếm ngược thời gian sự kiện trực tiếp trên bảng điều khiển chart (`UpdateUIPanel`).

---

## 6. 📋 Bảng Tham Số Cấu Hình Chuẩn (Parameter Reference)

| Tham Số (Parameter) | Kiểu Dữ Liệu | Giá Trị Mặc Định | Mô Tả & Khuyến Nghị Tối Ưu |
| :--- | :---: | :---: | :--- |
| `UseDirectAiApi` | `bool` | `false` | `false` = Local Server Hub (`127.0.0.1:8181`), `true` = Direct Cloud API |
| `UseAiGateMode` | `bool` | `true` | Cổng lọc 2 tầng: Judas Sweep định hướng → AI chọn điểm vào chính xác |
| `AiSlSpreadMultiplier` | `double` | `10.0` | Hệ số nhân Spread để tính sàn SL tối thiểu tự động (ví dụ: 10x Spread) |
| `AiSlMinFloorPips` | `double` | `0.0` | Sàn bảo vệ SL tối thiểu thủ công (pips, 0 = Tự động tính 10x Spread & ATR) |
| `enableWickRetracementHunting` | `bool` | `true` | Bật/tắt động cơ săn râu nến chiết khấu chống FOMO cho AI |
| `antiFomoToleranceMode` | `enum` | `Dynamic_ATR_Percent` | `Dynamic_ATR_Percent` = Co giãn theo % ATR (khuyên dùng đa cặp); `Fixed_Pips` = Pips cố định |
| `slippageToleranceAtrPercent` | `double` | `10.0` | Dung sai trượt giá theo % ATR (10% biên độ trung bình nến) |
| `pullbackBufferAtrPercent` | `double` | `5.0` | Vùng đệm pullback kỳ vọng theo % ATR (5% biên độ nến quanh Open) |
| `slippageTolerancePips` | `double` | `5.0` | Dung sai trượt giá dự phòng (pips) khi dùng Fixed_Pips hoặc chưa có ATR |
| `pullbackBufferPips` | `double` | `2.0` | Vùng đệm pullback dự phòng (pips) |
| `maxStagingWaitMinutes` | `int` | `8` | Thời gian chờ tối đa (phút) nhịp hồi trong nến M15 trước khi hủy lệnh |
| `cancelIfTpReachedPercent` | `double` | `50.0` | Tỷ lệ (%) quãng đường tới TP: Nếu giá tự chạy 50% tới TP mà không hồi thì hủy |
| `asianStartHour` | `int` | `0` | Giờ bắt đầu phiên Á (UTC Hour) |
| `asianEndHour` | `int` | `6` | Giờ kết thúc phiên Á (UTC Hour) |
| `minAsianRangeDailyAtrPercent` | `double` | `15.0` | Tỷ lệ tối thiểu (%) biên độ phiên Á so với Daily ATR (loại trừ ngày nghỉ/dry liquidity) |
| `maxAsianRangeDailyAtrPercent` | `double` | `60.0` | Tỷ lệ tối đa (%) biên độ phiên Á so với Daily ATR (loại trừ phiên Á đã chạy sóng mạnh) |
| `londonStartHour` | `int` | `7` | Giờ bắt đầu London Killzone (UTC) |
| `londonEndHour` | `int` | `10` | Giờ kết thúc London Killzone (UTC) |
| `nyStartHour` | `int` | `12` | Giờ bắt đầu New York Overlap Killzone (UTC) |
| `nyEndHour` | `int` | `16` | Giờ kết thúc New York Overlap Killzone (UTC) |
| `sweepBufferM15AtrPercent` | `double` | `20.0` | Khoảng đệm quét râu tối thiểu theo % ATR M15 (kèm sàn $1.5 \times \text{Spread}$) |
| `drawAsianRangeVisuals` | `bool` | `true` | Vẽ đường biên High/Low phiên Á trực quan lên biểu đồ |
| `riskFactor` | `double` | `1.0` | Tỷ lệ rủi ro (%) tài khoản trên mỗi lệnh |
| `enableBreakEvenPrice` | `bool` | `false` | Dời SL về hòa vốn khi đạt mục tiêu |
| `breakEvenRrTrigger` | `double` | `2.0` | Tỷ lệ R:R tối thiểu để kích hoạt dời SL về hòa vốn |
| `enableAiAdjustTrailing` | `bool` | `true` | Tự động kích hoạt Native Trailing Stop khi AI ADJUST dời SL gần sát Entry |
| `aiAdjustTrailingThresholdPercent` | `double` | `80.0` | Ngưỡng (%) giảm rủi ro ban đầu để tự động bật Trailing Stop |
| `breakEvenTrigger` | `double` | `250.0` | Điểm kích hoạt hòa vốn (pips) |
| `enableTelegramAlerts` | `bool` | `true` | Bật/tắt thông báo Telegram |
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

