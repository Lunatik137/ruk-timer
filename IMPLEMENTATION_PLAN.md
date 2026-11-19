# IMPLEMENTATION_PLAN — RukTimer (đợt 2)

Mốc tham chiếu: commit `5998b6c` (working tree sạch tại thời điểm bắt đầu). Mọi nhận định bên dưới được đối chiếu với mã nguồn hiện tại, không dựa vào README.

Ký hiệu trạng thái: ⬜ chưa làm · 🟨 đang làm · ✅ xong · ⛔ bị chặn (ghi lý do).

## 0. Quyết định kỹ thuật & giả định

| # | Vấn đề thiếu thông tin | Quyết định |
|---|---|---|
| D1 | Chưa có test runner | Thêm `vitest` ở thư mục gốc. Logic thuần đặt trong `src/lib/core/` (chỉ dùng import tương đối, không dùng alias `@/`). |
| D2 | Expo (Metro) không import được file ngoài `mobile/` | `scripts/sync-core.mjs` sao chép `src/lib/core/*` sang `mobile/src/lib/core/` (file sinh ra, có test so sánh nội dung giống hệt). Một nguồn sự thật, hai nơi chạy. |
| D3 | Múi giờ/tuần chưa có quy ước (stats.ts dùng `Date` local và cửa sổ 7 ngày trượt) | Tuần bắt đầu **Thứ Hai**; ngày tính theo **múi giờ IANA của thiết bị** (`Intl.DateTimeFormat`, an toàn với DST). So sánh tuần dùng cùng khoảng thời gian đã trôi qua (tuần này đến hiện tại so với tuần trước cùng số ngày). |
| D4 | Lượt nào tính vào hoạt động/streak/thành tích | Hoạt động & streak: mọi lượt (kể cả `+2`, `DNF`, drill CFOP, mọi puzzle), khử trùng theo `id`. Báo cáo tuần (Mean/Best/σ): chỉ lượt hợp lệ ở session thường (loại session drill `CFOP • …`). Thành tích: lượt 3x3 hợp lệ ở session thường. |
| D5 | Random-state 3x3 | Dùng thư viện `cubing` (`cubing/scramble`, solver Kociemba chạy trong worker/WASM) cho web. Expo (Hermes) không chạy được WASM/Worker nên **Expo gọi `/api/scramble`** khi có mạng và rơi về generator hiện tại khi offline (ghi rõ trên UI). Nếu thư viện không tải được, web cũng rơi về generator cũ và hiển thị nhãn "ngẫu nhiên theo nước đi". |
| D6 | Không có tài khoản R2 | Viết adapter R2 thật (`@aws-sdk/client-s3`, endpoint `https://<account>.r2.cloudflarestorage.com`) + adapter mock ghi đĩa (`.data/r2-mock`) chọn bằng `R2_MOCK=1` hoặc khi thiếu credentials ở môi trường không phải production. Phần tích hợp R2 thật = ⛔ chờ credentials. |
| D7 | Xóa bảng `daily_submissions` | Không xóa dữ liệu. `schema.sql` không còn tạo bảng cho cài mới; bảng cũ (nếu đã tồn tại trên production) được giữ nguyên, ghi chú trong tài liệu: xuất trước khi `drop` thủ công. |
| D8 | Migration production | Supabase MCP đang lỗi `Unrecognized client_id`, nên không thể chạy migration từ đây (⛔). Tạo `supabase/migrations/*.sql` thuần cộng thêm (additive, idempotent) để bạn chạy. Không chạy thao tác phá hủy. |
| D9 | Xác thực route Gemini | Chấp nhận `Authorization: Bearer <access_token>` (Expo) hoặc cookie phiên (web). Guest → route trả 401 `guest`, client tự dùng báo cáo Coach tính từ dữ liệu. Hạn mức theo tài khoản/ngày bằng RPC Postgres `consume_ai_quota`, thêm giới hạn burst trong bộ nhớ. |

## 1. Giai đoạn 1 — Xác nhận xóa, offline sync, import/restore, Gemini

### 1.1 Xác nhận trước khi xóa
- **Hiện trạng đã xác minh**: `window.confirm` ở Header (xóa phiên), `RukTimerApp` (Alt+Z), `SolveDetailModal`, `TimerDisplay`; **không** xác nhận ở nút xóa từng dòng `HistoryPanel`, nút `×`/“Xóa lượt cuối” trong Drill Studio, bỏ đánh dấu “đã thuộc” (đặt lại SRS); `HistoryPanel` “Xóa hết” dùng bấm hai lần (không có Hủy/Esc); Expo dùng `Alert.alert` cho xóa lượt cuối và xóa trực tiếp trong modal chi tiết.
- **Thiết kế**: web `ConfirmDialog` + hook `useConfirm()` (Promise); Expo `ConfirmModal` + hook tương đương. Nút `Hủy` (focus mặc định) và `Xác nhận xóa`; Esc/overlay/đóng = hủy; khoá nút khi `busy`; hiển thị loại dữ liệu, số lượng, phạm vi (đồng bộ nhiều thiết bị khi đã đăng nhập).
- **Phạm vi**: xóa 1 lượt (modal chi tiết, lịch sử, timer, Alt+Z, drill, Expo), xóa phiên, xóa toàn bộ lượt trong phiên, xóa video/bản sao lưu trong kho R2, đặt lại tiến độ CFOP. Nhập/khôi phục chỉ **gộp** (không xóa dữ liệu hiện có) nên không cần xác nhận phá hủy; nếu thêm chế độ “thay thế” thì bắt buộc xác nhận.
- **Nghiệm thu**: không còn lệnh xóa nào được gọi trước khi bấm `Xác nhận xóa`; Alt+Z mở hộp thoại, Esc hủy, Enter chỉ kích hoạt nút đang focus (`Hủy`). **Kiểm thử**: test hook/logic xác nhận + rà bằng `grep` danh sách handler xóa.

### 1.2 Offline sync
- **Hiện trạng**: outbox một khoá chung (`ruktimer_sync_outbox_v1`), chỉ ghi khi Supabase trả lỗi, không tách theo tài khoản, chỉ có upsert/xóa solve & phiên; `update` (penalty/ghi chú/reconstruction), `clear_session` và CFOP progress không vào hàng đợi; khi đã đăng nhập, `solves`/`sessions` không được lưu cục bộ nên đóng tab trước khi đồng bộ sẽ mất lượt; `flushSyncOutbox` bỏ qua `delete_*` khi lỗi khác, không bảo toàn thứ tự phụ thuộc.
- **Thiết kế** (`src/lib/core/outbox.ts`, adapter lưu trữ trừu tượng cho localStorage/AsyncStorage): hàng đợi **theo `userId`**, thao tác `upsert_session | delete_session | upsert_solve | patch_solve | delete_solve | clear_session | upsert_cfop`, có `seq` tăng dần, **ghi vào hàng đợi trước, rồi mới gọi mạng, gỡ khi thành công** (ghi bền trước khi báo thành công). Gộp (coalesce) các thao tác cùng đối tượng, thao tác xóa loại bỏ upsert/patch chưa gửi cùng id, phiên phải được upsert trước solve phụ thuộc. Retry idempotent (`upsert onConflict id`, delete theo id). Bộ nhớ đệm cục bộ theo tài khoản (`ruktimer_cache_<uid>`) để mở lại app vẫn thấy dữ liệu chưa đồng bộ. Header hiển thị “Chờ đồng bộ (n)” từ số thao tác thật.
- **Dữ liệu cũ**: hàng đợi cũ không có `userId` được chuyển một lần sang tài khoản đang đăng nhập khi flush đầu tiên rồi xóa khóa cũ.
- **Nghiệm thu / kiểm thử** (vitest, executor giả): mất mạng → thao tác vẫn lưu; đóng/mở lại (tạo outbox mới từ storage) → còn nguyên; retry không nhân đôi; thứ tự phiên→solve; hai tài khoản tách biệt; lỗi giữa chừng không mất phần còn lại.

### 1.3 Sao lưu & khôi phục
- **Hiện trạng**: `parseUniversalImport` nhập thẳng không xem trước, tạo `id` mới cho csTimer/CSV nên nhập lại sẽ nhân đôi; `syncGuestToCloud`/import cloud không gửi `splits_ms`/`reconstruction`; CSV xuất có `Splits(ms)` nhưng chưa nhập lại; không báo số bản ghi bỏ qua/lỗi.
- **Thiết kế** (`src/lib/core/backup.ts`): `parseBackup()` trả `{format, sessions, solves, cfopProgress, warnings}`; `planImport(existing, parsed)` tính dấu vân tay `session|puzzle|time|penalty|scramble|solved_at` và khử trùng theo `id` + vân tay; id xác định (hash) cho csTimer/CSV để nhập lại không trùng; modal xem trước (số phiên, số lượt mới/trùng/lỗi) trước khi áp dụng; báo cáo kết quả đúng số. Bản sao lưu v3 gồm `splits_ms`, `reconstruction`, `cfopProgress`, bộ luyện CFOP; đọc được v1/v2, csTimer, CSV.
- **Cloud**: gửi cả `splits_ms`/`reconstruction` (có fallback khi thiếu cột), chia lô 500, đếm thành công/lỗi theo lô.
- **Nghiệm thu**: xuất → nhập lại vào tài khoản trống cho cùng dữ liệu (kể cả split, `+2`/`DNF`, reconstruction, lịch SRS); nhập lần hai báo 0 mới/n trùng.

### 1.4 Route Gemini
- **Hiện trạng**: `/api/ai/coach` không xác thực, không hạn mức; lỗi vẫn trả HTTP 200 mơ hồ.
- **Thiết kế**: xác thực (D9), hạn mức ngày qua `consume_ai_quota(limit int)` (bảng `ai_usage(user_id, day, count)` + RLS), giới hạn kích thước body/độ dài câu hỏi, timeout theo model (6 giây), trả mã `401 guest | 429 quota | 200 ok/fallback`. Client luôn có báo cáo Coach tính từ dữ liệu; hết hạn mức/lỗi không chặn Timer và Trainer. Gọi Gemini bằng header `x-goog-api-key`.
- **Kiểm thử**: test hàm kiểm tra hạn mức/burst và parser request; kiểm thử route bằng fetch giả.

## 2. Giai đoạn 2 — Gỡ Daily Ao5, báo cáo tuần/streak, scramble & thống kê

### 2.1 Gỡ Daily Ao5
- **Hiện trạng**: tab `daily` trong `AiCoachAndCommunityView` (+ import `generateDailyScrambles`, `fetch/submitDailyChallengeRecord`, `DailySubmissionRecord`), tiêu đề mô tả, bảng `daily_submissions` trong `schema.sql`, khóa `ruktimer_daily_submissions_v1`. Expo không có Daily.
- **Việc làm**: xóa tab/leaderboard/gửi kết quả/liên kết thử thách/hàm/kiểu/bảng trong `schema.sql`; giữ `computeTrimmedAverage`, Competition Mode, `computeBpaWpa`. Dọn khoá localStorage cũ (khoá nhỏ, không phải dữ liệu lịch sử người dùng nhập).
- **Nghiệm thu**: `grep -ri daily` trên `src`/`mobile` không còn entry point; build sạch.

### 2.2 Báo cáo tuần & streak
- **Hiện trạng**: `computeStreakAndHeatmap` dùng `getDate()` local, đếm mọi lượt nhưng khử trùng không có; `computeWeeklyComparison` dùng cửa sổ 7×24h trượt (không bám thứ Hai, gồm cả drill CFOP); `computePersonalAchievements` dùng toàn bộ `solves` 3x3 (cả drill); Header và tab Coach tính hai nơi từ hàm khác nhau; heatmap cố định 84 ngày.
- **Thiết kế** (`src/lib/core/activity.ts`, nhận `tz`, `now`): `dayKey()`, `weekStartKey()` (Thứ Hai), `computeActivity()` trả streak hiện tại (hôm nay chưa luyện vẫn giữ streak hôm qua), streak dài nhất (đã tính cả lịch sử nhiều năm bằng chênh lệch ngày UTC của khoá ngày), heatmap, `weeklyReport()` (D3, D4). Tất cả màn hình dùng chung.
- **Kiểm thử cố định**: 23:59/00:01, giao tuần Chủ Nhật→Thứ Hai, DST (America/New_York 2025-03-09 & 2025-11-02, Europe/Berlin), tuần chưa kết thúc, hôm nay chưa luyện, `+2`/`DNF`, drill CFOP, trùng id, lịch sử nhiều năm, múi giờ UTC+7. Kết quả mong đợi viết tay trong test.

### 2.3 Scramble & thống kê
- Mô phỏng thi đấu (Competition Mode) dùng scramble 3x3 **random-state** (D5), nhãn nguồn hiển thị. Scramble luyện Cross/F2L giữ nguyên. Đối chiếu WCA Regulations Article 4 (4b: scramble ngẫu nhiên tổng quát; 4f & Article 12/A: random-state): ghi trong `docs/SCRAMBLES.md` những môn còn dùng random-move (4x4+, pyra, skewb, sq1, clock, megaminx) so với chuẩn TNoodle.
- Bộ test chung (`src/lib/core/*.test.ts`, đồng bộ sang Expo): scramble ↔ hình 2D (áp scramble rồi áp nghịch đảo phải về trạng thái đã giải, áp scramble hợp lệ cho 2x2…7x7), `Ao5`, `Mo3`, `+2`, `DNF` (1 DNF trong Ao5 vẫn tính, 2 DNF → DNF), biên (<5 lượt, toàn DNF, +2 trên lượt tốt nhất).

## 3. Giai đoạn 3 — Bộ luyện CFOP, SRS trên Expo, Coach/Bài tập hôm nay

### 3.1 Bộ case luyện ngẫu nhiên
- **Hiện trạng**: có `learned/SRS`, “Adaptive Drill” chỉ bốc trong bộ lọc hiện tại; chưa có chọn case thủ công.
- **Thiết kế**: `practiceSet` (mảng id case, giữ khi đổi bộ lọc/tìm kiếm/tải lại). Checkbox trên mỗi thẻ; thanh “Bộ luyện (n)” có danh sách xem/bỏ chọn, nút `Luyện ngẫu nhiên`. `core/practiceQueue.ts`: xáo Fisher–Yates, đi hết vòng mới lặp, không lặp liên tiếp ở biên vòng nếu >1 case, hỗ trợ 1 case. Tái dùng Drill Studio + “ẩn công thức”, kết quả vào session riêng của case. Lưu `localStorage` (Guest) + bảng `cfop_practice_sets(user_id, case_ids, updated_at)` khi đăng nhập (last-write-wins theo `updated_at`).
- **Dữ liệu cũ**: không ảnh hưởng.

### 3.2 SRS & “Đến hạn ôn” trên Expo
- Tách danh mục thuần `core/cfopCatalog.ts` (id, stage, code, name, formula, altFormula, recognition) + SM-2 (`core/sm2.ts`) dùng chung; web `cfop.ts` re-export. Expo: màn “Học CFOP” dùng danh mục chung (ID khớp web), tab “Đến hạn ôn”, đánh giá SRS sau lượt, đồng bộ `cfop_progress` + `cfop_practice_sets` qua outbox chung, cache AsyncStorage.

### 3.3 Coach & Bài tập hôm nay
- Hiển thị số lượt có split; chỉ đưa nhận định theo giai đoạn khi `splitCount ≥ 8` (ngưỡng ghi trong UI), dưới ngưỡng ghi “chưa đủ mẫu”. “Bắt đầu bài tập” mở đúng bài (kể cả `COMPETITION_SIM` → vào thẳng vòng Ao5).
- Luồng đo (`core/workout.ts`, lưu `localStorage`): **mốc** = trung vị F2L (ms) của ≤10 lượt split gần nhất (cần ≥5) và, nếu không đủ, trung bình 12 lượt 3x3 gần nhất (cần ≥5); không đủ → “chưa có mốc”, vẫn luyện nhưng không kết luận. Pha 1: 10 lượt F2L-only; Pha 2: 5 lượt 3x3 có split; kết luận cải thiện/giảm chỉ khi chênh lệch > max(5%, 1σ của mốc) và đủ mẫu, ngược lại “chưa đủ bằng chứng”.

## 4. Giai đoạn 4 — Quay video, R2

### 4.1 Quay trực tiếp
- `getUserMedia({video})` chỉ khi bấm `Quay video` (không xin micro), xem trước, `MediaRecorder`, dừng, xem lại, quay lại, `Dùng clip này`; xử lý `NotAllowedError`, `NotFoundError`, thiếu `MediaRecorder`; dừng mọi track khi đóng/đổi tab/unmount. Dùng chung luồng phân tích với clip tải lên. Mốc ghi rõ nguồn: “Do bạn đánh dấu” / “Hệ thống gợi ý (chưa xác nhận)”.
- **Expo**: chưa có Analyzer. Cần thêm `expo-camera`, `expo-video`, `expo-file-system`, màn Analyzer (lấy mẫu khung hình bằng `expo-video-thumbnails`), upload bằng URL ký; ghi ở mục “Còn thiếu” (không triển khai trong đợt này).

### 4.2 Kho cá nhân Cloudflare R2
- **Phân vùng dữ liệu**: Supabase Postgres giữ tài khoản, `solves`, `cube_sessions`, `cfop_progress`, `user_files` (metadata, trạng thái `pending/ready`); R2 giữ nội dung nhị phân (`users/<uid>/<fileId>`: video, sao lưu, file cá nhân). Khôi phục: sao lưu JSON có thể tải từ R2 rồi nhập lại bằng luồng 1.3.
- **API** (`src/app/api/files/*`): `POST upload-url` (xác thực, kiểm tra loại/kích thước, tạo hàng `pending`, trả PUT URL ký ngắn hạn), `POST complete` (HEAD object kiểm tra tồn tại + kích thước rồi mới `ready`), `GET list`, `GET [id]/download` (URL ký GET), `DELETE [id]` (xóa object rồi metadata; lỗi xóa object không báo thành công). Kiểm tra sở hữu theo `uid` từ phiên (không tin `uid` từ client), RLS trên `user_files`, khóa R2 chỉ ở máy chủ. Upload dở dang: hàng `pending` quá hạn được dọn khi gọi `list`.
- **Giới hạn**: video ≤ 200 MB (`video/mp4|webm|quicktime`), sao lưu ≤ 50 MB (`application/json|text/csv`).
- **Kiểm thử**: test logic phân quyền/validate bằng adapter giả với 2 tài khoản; mock adapter chạy cục bộ; ⛔ tích hợp R2 thật chờ credentials.

## 5. Thứ tự triển khai & trạng thái

| Bước | Hạng mục | Trạng thái |
|---|---|---|
| 1 | Hạ tầng test (vitest), `src/lib/core`, script sync Expo | ✅ Xong (22 tests vitest, 9 pure modules) |
| 2 | 1.1 Xác nhận xóa (web + Expo) | ✅ Xong (`ConfirmDialog`, `ConfirmModal`, rà soát 0 window.confirm) |
| 3 | 1.2 Offline sync | ✅ Xong (`outbox.ts`, tách theo userId, retry idempotent, cache) |
| 4 | 1.3 Sao lưu/khôi phục | ✅ Xong (`backup.ts`, preview modal, chống trùng, v3/csTimer/CSV) |
| 5 | 1.4 Gemini auth/quota | ✅ Xong (`quota.ts`, route auth + 401 guest fallback, burst limit) |
| 6 | 2.1 Gỡ Daily | ✅ Xong (gỡ tab/leaderboard/submit/types, giữ Ao5 & comp) |
| 7 | 2.2 Activity/streak/tuần + test | ✅ Xong (`activity.ts`, tuần bắt đầu T2, IANA tz, 6 test case) |
| 8 | 2.3 Scramble random-state + test chung | ✅ Xong (`/api/scramble`, random-state 3x3, test đảo nghịch) |
| 9 | 3.1–3.2 Bộ luyện + SRS Expo | ✅ Xong (multi-group practice queue, SRS Đến hạn ôn trên Expo) |
| 10 | 3.3 Coach/Bài tập hôm nay | ✅ Xong (ngưỡng 8 split, F2L workout MVP baseline/remeasure) |
| 11 | 4.1 Quay video | ✅ Xong (`getUserMedia` cam-only, preview, record, nhãn nguồn) |
| 12 | 4.2 R2 | ✅ Xong (S3 API adapter + local mock `.data/r2-mock`, 4 API routes) |
| 13 | Tài liệu, build, typecheck, migration, deploy | ✅ Xong (Next.js build ok, Expo tsc ok, 22/22 tests ok; migration & R2 env chờ nạp) |

Thứ tự khác đề xuất ban đầu: tạo hạ tầng test/core trước vì mọi giai đoạn dùng chung.
