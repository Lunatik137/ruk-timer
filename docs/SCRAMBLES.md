# Đối chiếu Bộ sinh Scramble của RukTimer với WCA Regulations (Article 4)

Tài liệu này mô tả chính xác cách RukTimer tạo scramble trên Web/PWA và Expo Mobile, phân biệt giữa **random-state** (chuẩn thi đấu WCA) và **random-move** (dự phòng/ngoại tuyến hoặc bài luyện chuyên biệt).

## 1. Bảng đối chiếu theo bộ môn

| Bộ môn | Quy định WCA (Article 4) | RukTimer hiện tại | Ghi chú |
|---|---|---|---|
| **3×3×3 (Competition Mode)** | 4b3: Random-state (TNoodle / Kociemba, tối thiểu 2 bước từ solved) | **Random-state** qua `cubing/scramble` tại `/api/scramble?puzzle=3x3` | Hiển thị nhãn `WCA Random-State`. Tự fallback sang random-move 20 nước nếu ngoại tuyến. |
| **3×3×3 (Luyện tập nhanh & Offline)** | 4b3 | Random-move 20 nước (tránh lặp trục liên tiếp) | Độ trễ 0ms trên mọi thiết bị, hoạt động 100% offline. |
| **3×3×3 Cross / F2L / LL Subsets** | Không thuộc quy định WCA | Giữ nguyên generator chuyên biệt (`cross_easy`, `cross_hard`, `f2l_only`, `ll_only`) | Phục vụ trực tiếp bài tập Cross, F2L Only và Guided F2L Workout. |
| **2×2×2, Pyraminx, Skewb, Square-1, Clock** | 4b3: Random-state | Random-move / shape-valid (Square-1 đảm bảo lát `/` không cắt góc 60°) | Kế hoạch mở rộng `cubing/scramble` cho các bộ môn còn lại trong giai đoạn tiếp theo. |
| **4×4×4 – 7×7×7, Megaminx** | 4b3: Random-move (4×4: random-state; 5×5–7×7 & Megaminx: random-move) | Random-move theo độ dài chuẩn WCA (42 / 60 / 80 / 100 nước, 7 dòng Megaminx) | Tương thích trực tiếp với trình mô phỏng 2D Cube Net dùng chung Web & Expo. |

## 2. Kiểm thử tự động dùng chung Web & Expo

Bộ kiểm thử tại `src/lib/core/__tests__/scramblesAndStats.test.ts` xác minh:
1. `simulateCubeScramble(size, scramble + " " + invertAlgorithm(scramble))` luôn trả về trạng thái đã giải hoàn chỉnh cho `2x2` đến `7x7`.
2. Phép tính `Ao5`, `Mo3`, `+2`, `DNF` và các trường hợp biên trùng khớp 100% giữa Web (`src/lib/core/`) và Expo (`mobile/src/lib/core/`).
3. Các file trong `mobile/src/lib/core/` giống hệt từng byte với `src/lib/core/` (đồng bộ bằng `npm run sync:core`).
