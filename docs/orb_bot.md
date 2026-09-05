# ORB Bot — Opening Range Breakout (spec + implementation plan)

Tài liệu dùng làm **đầu vào thống nhất** để implement [`bots/orb_bot.py`](../bots/orb_bot.py) trong dnse-kash.

**Phạm vi:** **một phiên VN** từ `morning_open_*` đến **EOD flatten** (`eod_flatten_*`). OR M5, breakout, SL/TP, DCA — không có flatten giữa phiên và không có phiên chiều riêng trong code OrbBot.

---

## 1. Mục tiêu

- Xây Opening Range đầu phiên từ nến M5 đã đóng, breakout trên nến M5 đóng **sau** cửa sổ OR, vào lệnh, SL/TP, DCA (tùy chọn), giới hạn rủi ro cho đến EOD hoặc khi thoát lệnh.
- Không còn OR chiều / add-on phiên chiều / state machine PM.
- Tham số trong [`settings/bot_setting.txt`](../settings/bot_setting.txt); **`opening_range_minutes_ORB`** thường `{5, 15, 30}` (bội số thực tế = số nến M5).
- Kế thừa [`bots/base_bot.py`](../bots/base_bot.py).
- Đa nền tảng: `trading_platform` ∈ `DNSE` | `ENTRADE` | `BOTH`.

---

## 2. Thời gian phiên (GMT+7)

| Giai đoạn | Giờ (mặc định) | Hành vi bot |
|-----------|----------------|-------------|
| **Trước mở cửa** | Trước `morning_open_*` | Chờ. |
| **Cửa sổ OR** | `morning_open` + `opening_range_minutes_ORB` | Thu thập OR từ nến M5 đã đóng trong cửa sổ. |
| **Sau OR → EOD** | Cho đến `eod_flatten_*` (chưa qua đúng phút flatten) | `ARMED`: có thể breakout vào lệnh; `IN_TRADE`: SL/TP, invalidate scalp, DCA/grid, re-sync; tick ORB chỉ đến trước EOD trong `_orb_am_time_tick`. |
| **EOD** | `eod_flatten_hour_ORB`:`eod_flatten_minute_ORB` | **Flatten** toàn bộ vị thế còn lại. |

Giờ trong setting: **`morning_open_*`**, **`eod_flatten_*`** (`opening_range_minutes_ORB` quyết định độ dài OR, không phải một “phiên flatten” khác).

---

## 3. Logic ORB — một phiên

### 3.1 Opening Range

OR high/low = max(high) / min(low) của **`ceil(opening_range_minutes / 5)`** nến M5 **đã đóng** có `start_ts` trong `[morning_open, morning_open + opening_range_minutes)`.

### 3.2 Điều kiện trade sau Opening Range

1. Đã có đủ nến M5 trong cửa sổ OR và OR đã “đóng” theo thời gian.
2. `OR_high_am - OR_low_am >= min_or_width_points_ORB` (và filter ATR nếu bật); không đạt có thể SKIP.
3. Breakout: nến M5 **sau** cửa sổ OR có `close` vượt biên ± `buffer_points_ORB`; có thể xảy ra bất cứ khi nào trước EOD trong trạng thái `ARMED`; giới hạn số lần vào từ breakout: `max_trades_per_session_ORB`.

### 3.3 Breakout / vào lệnh

- `breakout_confirm_ORB` trong setting **tương thích ngược**; implementation chỉ dùng **đóng nến M5**.
- `trade_direction_ORB`: `long` | `short` | `both`; `single_position_ORB` tránh long+short cùng lúc.
- Khi vào BREAK: ghi `morning_breakout_side` (reset mỗi ngày).

### 3.4 DCA (tùy chọn)

- `allow_dca_ORB`, `max_dca_slices_ORB`, `dca_step_points_ORB`, `max_total_contracts_ORB`.
- Grid LO hoặc DCA reactive — xem [`bots/orb_bot.py`](../bots/orb_bot.py).

### 3.5 Không breakout trong ngày

`morning_breakout_side` chỉ được set khi vào BREAK; nếu cả ngày không vào được (hoặc không đủ tín hiệu), có thể vẫn `NONE` đến EOD.

### 3.6 Trong `IN_TRADE`: re-break add và đảo chiều theo đóng M5 (tuỳ chọn)

Áp khi **`st >=`** kết thúc cửa sổ OR (đúng các nến M5 như breakout ban đầu).

| Setting | Ý nghĩa |
|---------|--------|
| **`or_rebreak_add_enabled_ORB`** | Sau khi **giá tick** (`_reference_price`) ít nhất một lần nằm trong `[OR_low, OR_high]` kể từ lần vào breakout gần nhất, một nến M5 **đóng** có `close` cùng chiều breakout (qua `buffer_points_ORB`) → cộng thêm **`trade_size_ORB`** không tăng `morning_trades_fired`; ATR breakout filter giữ như ARMED breakout. Chặn duplicate theo `start_ts`; tôn trọng `max_total_contracts_ORB`. |
| **`reverse_on_opposite_or_m5_close_ORB`** + `stop_loss_mode_ORB="opposite_or_boundary"` | Khi có vị thế: nến M5 đóng xuyên **biên OR đối diện** (Long: `close < OR_low − buffer`; Short đối xứng) → **đóng hết** rồi **mở ngược chiều** tại **`close`** với **`trade_size_ORB`**; không tăng `morning_trades_fired`, không đếm `max_consecutive_sl`. **Tick-SL biên đối diện bị tắt** (chờ M5); TP vẫn theo tick. `trade_direction_ORB` vẫn ràng phía được phép đảo sang. |

Ghi chú: tick `invalidate_breakout_*` (scalp gần BE) vẫn hoạt động song song — có thể giảm vị thế trước khi có nến M5 đảo chiều.

---

## 4. Quản lý rủi ro

- SL/TP theo `stop_loss_mode_ORB`, `take_profit_points_ORB`, v.v.
- `invalidate_breakout_enabled_ORB`: tick xuyên biên OR đối diện có thể chuyển sang scalp TP gần BE (`scalp_be_tp_points_ORB`).
- `daily_max_loss_points_ORB`, `max_consecutive_sl_ORB`, EOD flatten.

### 4.1 DNSE — TP cấp tài khoản, đồng bộ flat, tránh đóng trùng

Khi TP được cấu hình **ở tài khoản DNSE** (vd. qua `account-pnl-configs` / `apply_pnl_config` trong [`ntrade_ops.py`](../ntrade_ops.py)), sàn có thể **đóng hết vị thế** trong khi bot vẫn ở `IN_TRADE` và tiếp tục gửi lệnh flatten hoặc đánh giá SL/TP trên tick.

**Trong code OrbBot (live / `BOTH` với adapter DNSE):**

- Trước `_manage_trade` trong nhánh `IN_TRADE`, bot gọi **`_maybe_sync_dnse_exchange_flat`**: theo chu kỳ `rearm_sync_interval`, gọi **`GetTotal_OpenQuantity()`**; nếu **0** thì gọi **`_finalize_external_flat`** — cập nhật PnL ước lượng, **không gửi thêm lệnh đóng**, chuyển state / cleanup / rearm giống thoát lệnh (tùy policy bên dưới).
- Nếu sign quantity **không khớp** hướng bot đang nắm, bot **bỏ qua** adopt-flat (chủ yếu để tránh cảnh 2 tài sản song song, vd. còn hàng trên bên còn lại).
- Với `trading_platform_ORB=Both`, cơ chế trên chỉ nhìn **OpenQuantity DNSE**; nếu vị thế chỉ còn trên Entrade, bot **không** tự sync flat theo DNSE-only.

**Setting liên quan:**

| Setting | Mặc định | Ý nghĩa |
|---------|----------|---------|
| **`bot_tick_take_profit_enabled_ORB`** | `True` | Khi `False`: **tắt TP theo tick** chính (`take_profit_points_ORB`); **SL vẫn hoạt động**. Scalp / `scalp_be_tp_points_ORB` không đổi. Hữu ích khi TP thực tế do **account-level** trên DNSE. |
| **`external_flat_triggers_clean_tp_state_ORB`** | `False` | Khi `True`: adopt flat từ sync được xử lý như **TP “sạch”** cho nhánh cleanup/rearm (giống thoát TP trong bot). Khi `False`: vẫn thoát ghost `IN_TRADE` và PnL ước lượng nhưng **không** áp policy post-TP đầy đủ — phù hợp khi muốn **không coi** khớp ngoài là một TP có chủ đích của chiến lược tick. |

**Ghi chú `is_demo_ORB`:** `is_demo_ORB=True` chỉ có nghĩa là **Entrade papertrade**. Khi `trading_platform_ORB` gồm `DNSE` hoặc `BOTH`, DNSE vẫn là **live** (DNSE không có demo mode).

Trade-off: PnL trong `_finalize_external_flat` là **ước lượng** so với đóng có fill thực tế qua `_close_all`; daily cap và log vẫn nhất quán với các đường đóng khác trong bot.

---

## 5. Cấu hình `bot_setting.txt` (mẫu rút gọn)

```ini
is_active_ORB=False
tradingPlatform_ORB="ENTRADE"
opening_range_minutes_ORB=5
morning_open_hour_ORB=9
morning_open_minute_ORB=0

eod_flatten_hour_ORB=14
eod_flatten_minute_ORB=25

take_profit_points_ORB=6.0
daily_max_loss_points_ORB=20.0
```

---

## 6. Kiến trúc code

- [`bots/orb_bot.py`](../bots/orb_bot.py): state machine **chỉ AM** (`IDLE` → `COLLECT_OR_M5` → `ARMED` / `SKIP` → `IN_TRADE` / `DONE`), WebSocket M5 + REST backfill OR như WebUI.
- [`core/bot_runner.py`](../core/bot_runner.py): khởi tạo `OrbBot` với `eod_flatten_*_ORB`, `bot_tick_take_profit_enabled_ORB`, `external_flat_triggers_clean_tp_state_ORB`.

---

## 7. Rủi ro

- Phiên một cho đến EOD (hoặc khi thoát tay ngoài bot): không còn cắt vị thế cứng giữa trưa; risk **quan sát chủ động** vẫn cần.
- SL theo tick giá tham chiếu (`_reference_price`). TP theo tick trong bot là **software**; trên DNSE có thể thêm TP **cấp tài khoản** — khi đó nên bật sync flat và cân nhắc `bot_tick_take_profit_enabled_ORB=False` để tránh hai lớp TP chồng nhau (xem §4.1).
- Nếu bật `reverse_on_opposite_or_m5_close_ORB` với `opposite_or_boundary`, **tick-SL tại biên OR đối diện bị vô hiệu** để chờ lệnh đảo chiều theo **đóng M5**; rủi ro giá xuyên mạnh giữa nến cần chủ động quản lý (invalidate scalp / TP tick vẫn có hiệu lực tùy tình huống).

---

*Tài liệu đặc tả; cập nhật theo code hiện tại (phiên chiều đã bỏ).*
