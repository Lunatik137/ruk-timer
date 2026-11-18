# AGENTS.md — RukTimer

Hướng dẫn phối hợp hai skill **`ui-ux-pro-max`** và **`impeccable`** trong dự án **RukTimer** (`Next.js 15` + `React 19` + `Tailwind CSS` + `Supabase`, kèm app Expo trong `mobile/`).

## 1. Nguồn chân lý & Ràng buộc bất biến

Trước mọi thay đổi, luôn đọc [PRODUCT.md](./PRODUCT.md). Các hành vi cốt lõi không được phép làm hỏng:
- **Zero-Friction Guest Mode**: Vào dùng timer và CFOP Trainer ngay lập tức, không ép đăng nhập; dữ liệu local vẫn đồng bộ lên Supabase Cloud khi đăng nhập.
- **Độ chính xác WCA**: Timing bằng `performance.now()` / `requestAnimationFrame`, hold delay (`0ms` / `300ms` / `550ms`), focus mode ẩn sidebar khi đang solve, thao tác Spacebar (desktop) và chạm giữ (mobile) có độ trễ thấp.
- **Ngôn ngữ**: Giao diện tiếng Việt, giữ nguyên thuật ngữ cubing quốc tế (`Single`, `Mo3`, `Ao5`, `Ao12`, `Ao50`, `Ao100`, `PB`, `DNF`, `+2`, `CFOP`, `F2L`, `OLL`, `PLL`, `Scramble`, `TPS`, `WCA Inspection`).
- **Phạm vi áp dụng UI skills**: Chỉ kích hoạt `impeccable` và `ui-ux-pro-max` cho tác vụ UI/UX/frontend. Các tác vụ thuần logic/backend (`src/lib/scrambles.ts`, `supabase/`, API, cấu hình build) không cần chạy workflow UI.

---

## 2. Phân vai hai skill (Không giẫm chân nhau)

| Skill | Vai trò chính | Khi nào gọi |
|---|---|---|
| **`ui-ux-pro-max`** | **Tra cứu tri thức thiết kế & stack** (palette, font pairing, UX outcome, a11y, chart, quy tắc `nextjs` / `react` / `html-tailwind` / `react-native`) | Cần tham khảo pattern, kiểm tra guideline UX/WCAG cụ thể, hoặc tìm best practice theo stack trước khi code |
| **`impeccable`** | **Định hướng thiết kế, tiêu chuẩn craft & cổng kiểm định** (Context, Mode `Operate`, `craft-floor.md`, `shape`, `critique`, `audit`, `polish`, `harden`, `adapt`, `optimize`) | Trước mọi chỉnh sửa UI, khi thiết kế tính năng mới, tinh chỉnh giao diện, hoặc review/nghiệm thu chất lượng |

> **Lưu ý môi trường Windows**:
> - Chạy script của `ui-ux-pro-max` bằng `python` (không dùng `python3`):
>   `python .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" ...`
> - Chạy launcher của `impeccable` bằng `.cmd`:
>   `.agents/skills/impeccable/scripts/impeccable.cmd context --target <path>`

---

## 3. Quy trình phối hợp chuẩn

### A. Thiết kế & xây dựng tính năng / màn hình mới
1. **Nạp ngữ cảnh (`impeccable`)**: Chạy `impeccable.cmd context --target <file>`. Với RukTimer, các màn hình Timer, CFOP Trainer, Session Manager, Settings thuộc Mode **`Operate`** (ưu tiên độ rõ, tốc độ thao tác, ít nhiễu hơn là trang trí).
2. **Định hình cấu trúc (`impeccable` `shape`)**: Làm rõ luồng người dùng, trạng thái (empty, loading, error, focus mode) trước khi viết code.
3. **Tra cứu pattern & stack (`ui-ux-pro-max`)**: Chỉ query đúng trọng tâm (2–5 từ khóa), ví dụ:
   - UX/A11y: `python .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard shortcut focus" --domain ux`
   - Stack Web: `python .agents/skills/ui-ux-pro-max/scripts/search.py "list rerender memo" --stack react`
   - Stack Tailwind: `python .agents/skills/ui-ux-pro-max/scripts/search.py "responsive drawer" --stack html-tailwind`
   - Stack Mobile (`mobile/`): `python .agents/skills/ui-ux-pro-max/scripts/search.py "touch target haptic" --stack react-native`
4. **Đọc `craft-floor.md` (`impeccable`)**: Đọc `.agents/skills/impeccable/reference/craft-floor.md` ngay trước khi sửa file UI.
5. **Implement & Tinh chỉnh**: Viết code, sau đó chạy bước `polish` / `harden` / `adapt` tùy phạm vi.

### B. Tinh chỉnh, sửa lỗi UI/UX, Accessibility hoặc Responsive
1. **Tra cứu đích danh (`ui-ux-pro-max`)**: Dùng `--domain ux` (hoặc `icons`, `chart`, `style`) cho vấn đề cần sửa, kèm `--stack` nếu liên quan kỹ thuật triển khai.
2. **Thực thi theo `impeccable`**:
   - Lỗi hiển thị mobile/PWA/keyboard → `adapt`
   - Copy tiếng Việt/nhãn nút khó hiểu → `clarify`
   - Trạng thái lỗi, offline, đồng bộ fail, edge case → `harden`
   - Lag/re-render khi timer chạy `requestAnimationFrame` → `optimize`
   - Hoàn thiện chi tiết trước khi bàn giao → `polish`

### C. Review & Nghiệm thu chất lượng UI
1. Dùng **`impeccable` `critique`** để đánh giá hierarchy, mật độ thông tin, sự tập trung khi đang solve.
2. Dùng **`impeccable` `audit`** để rà soát accessibility, contrast, responsive, performance.
3. Đối chiếu với các tiêu chí WCA/cubing trong [PRODUCT.md](./PRODUCT.md) trước khi kết luận đạt.

### D. Tài liệu hóa hoặc Redesign Design System
- **Một nguồn chân lý duy nhất**: Khi cần chuẩn hóa design system cho dự án hiện tại, ưu tiên dùng **`impeccable` `document`** để tạo `DESIGN.md` từ codebase đang có (tránh tạo thêm `design-system/` song song gây trùng lặp hoặc lệch token).
- Chỉ dùng `ui-ux-pro-max --design-system` khi mở một bề mặt hoàn toàn mới hoặc user yêu cầu thay đổi toàn bộ visual direction.

---

## 4. Nguyên tắc xử lý xung đột
1. **`PRODUCT.md` & yêu cầu của user là cao nhất**: Mọi gợi ý từ dataset của `ui-ux-pro-max` chỉ mang tính tham khảo; nếu trái với workflow Speedcubing (ví dụ: thêm modal xác nhận làm chậm thao tác Spacebar, hoặc đổi thuật ngữ cubing), phải bỏ qua gợi ý đó.
2. **Refinement giữ nguyên bản sắc**: Khi sửa một phần nhỏ của `RukTimerApp.tsx`, `TimerDisplay.tsx`, hay `CfopTrainerView.tsx`, không tự ý đổi bảng màu, font chữ, hay layout tổng thể sang một style mới từ `ui-ux-pro-max`.
3. **Kiểm chứng thực tế**: Sau khi sửa UI, chạy `npm run lint` / `npm run build` (hoặc kiểm tra trực tiếp trên trình duyệt nếu có dev server) trước khi báo hoàn thành.
