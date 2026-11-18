# RukTimer — Web/App Bấm Giờ Giải Rubik Chuẩn WCA (Next.js + Supabase + Vercel)

**RukTimer** là ứng dụng bấm giờ Rubik hiện đại (tương tự csTimer / CubeDesk), hỗ trợ cả **Desktop (Spacebar)** và **Mobile/Tablet (Chạm giữ cảm ứng)**, tích hợp **Cloud Database (Supabase PostgreSQL)**, đăng nhập tài khoản, đồng bộ dữ liệu Guest lên Cloud và tối ưu sẵn để deploy lên **Vercel**.

---

## Tính năng nổi bật

- **Đồng hồ chuẩn thi đấu WCA**:
  - Nhấn giữ phím `Space` hoặc chạm giữ màn hình cảm ứng (tùy chỉnh độ trễ `0s`, `0.30s`, `0.55s` chuẩn Stackmat).
  - Bật/tắt **15s WCA Inspection** (tự động tính `+2` từ 15–17s, `DNF` sau 17s, kèm âm báo bíp mốc `8s` & `12s`).
  - Hỗ trợ **Nhập thời gian thủ công** (dành cho người dùng đồng hồ Stackmat rời, VD gõ `945` -> `9.45s`).
  - Chế độ **Focus Mode** tự ẩn các bảng phụ khi đang giải.
- **13 bộ môn WCA & Hình trải 2D Scramble**:
  - Hỗ trợ `2x2`, `3x3`, `4x4`, `5x5`, `6x6`, `7x7`, `3x3 OH`, `3x3 BLD`, `Pyraminx`, `Megaminx`, `Skewb`, `Square-1`, `Clock`.
  - Mô phỏng trạng thái khối Rubik `2x2` đến `7x7` (bao gồm cả `OH` và `BLD`) ra sơ đồ 2D trực quan.
- **Thống kê chuyên sâu & Biểu đồ**:
  - Tự động tính `Single`, `Mo3`, `Ao5`, `Ao12`, `Ao50`, `Ao100` (Hiện tại & Kỷ lục PB), `Mean`, Độ lệch chuẩn (`σ`).
  - Biểu đồ đường theo dõi tiến độ `Single`, `Ao5`, `Ao12`.
  - Bấm vào bất kỳ lượt giải hoặc chỉ số `Ao5` / `Ao12` nào để xem chi tiết và **Copy Share Text** chia sẻ lên cộng đồng.
- **Quản lý nhiều Session & Sao lưu**:
  - Tạo, đổi tên, xóa nhiều phiên luyện tập; Xuất/Nhập file sao lưu **JSON** và **CSV (Excel)**.
- **Đăng nhập & Cloud Database (Supabase)**:
  - Đăng ký / Đăng nhập bằng **Email & Mật khẩu** hoặc **Google OAuth**.
  - Chế độ **Guest Mode** hoạt động ngay lập tức khi chưa đăng nhập, kèm nút **Đồng bộ 1 chạm** đẩy toàn bộ lịch sử Guest lên Cloud ngay khi đăng nhập.

---

## Hướng dẫn cài đặt & Kết nối Cloud DB (Supabase)

### Bước 1: Cài đặt thư viện
```bash
npm install
```

### Bước 2: Tạo Cloud Database trên Supabase (Miễn phí)
1. Truy cập [https://supabase.com](https://supabase.com) và tạo một Project mới.
2. Vào mục **SQL Editor** -> **New Query**, copy toàn bộ nội dung file [`supabase/schema.sql`](./supabase/schema.sql) dán vào và nhấn **Run** để khởi tạo bảng `cube_sessions`, `solves` cùng chính sách bảo mật **Row Level Security (RLS)**.
3. Vào **Project Settings** -> **API**, copy:
   - `Project URL`
   - `anon public` key
4. Tạo file `.env.local` ở thư mục gốc (dựa theo `.env.example`):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
5. *(Tùy chọn)* Cấu hình đăng nhập:
   - Vào **Authentication** -> **Providers** -> **Email**: Bạn có thể tắt *Confirm email* nếu muốn đăng ký xong vào thẳng không cần xác thực mail.
   - Vào **Authentication** -> **Providers** -> **Google**: Bật Google OAuth nếu muốn dùng nút *Tiếp tục với Google*.
   - Vào **Authentication** -> **URL Configuration**: Thêm URL callback `http://localhost:3000/auth/callback` (và `https://ten-web-cua-ban.vercel.app/auth/callback` sau khi deploy).

### Bước 3: Chạy thử trên máy
```bash
npm run dev
```
Mở `http://localhost:3000` để trải nghiệm.

---

## Phiên bản Điện thoại (Mobile App — iOS & Android)

Dự án hỗ trợ **2 hình thức cài đặt lên điện thoại** dùng chung Cloud Database:

1. **Cài trực tiếp bản PWA từ trình duyệt (Không cần tải qua chợ ứng dụng)**:
   - Mở `https://ruk-timer.vercel.app` trên điện thoại.
   - **Android (Chrome/Edge)**: Bấm nút **Cài App** trên thanh thông báo (hoặc menu `⋮` → *Cài đặt ứng dụng / Thêm vào màn hình chính*).
   - **iPhone / iPad (Safari)**: Bấm nút **Chia sẻ (Share)** → chọn **Thêm vào MH chính (Add to Home Screen)**.
   - Hỗ trợ chạy toàn màn hình độc lập, giữ sáng màn hình khi giải (*Wake Lock*), rung phản hồi (*Haptics*) và hoạt động cả khi offline.

2. **Ứng dụng gốc React Native + Expo (thư mục [`./mobile`](./mobile/README.md))**:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
   - Quét mã QR bằng ứng dụng **Expo Go** trên iPhone/Android để chạy ngay.
   - Xuất file cài đặt `.APK` cho Android: `eas build -p android --profile preview` (đã cấu hình sẵn trong `mobile/eas.json`).

---

## Hướng dẫn Deploy lên Vercel

1. Đẩy mã nguồn dự án này lên GitHub / GitLab / Bitbucket.
2. Truy cập [https://vercel.com/new](https://vercel.com/new) và chọn repository vừa đẩy lên.
3. Trong mục **Environment Variables** trên Vercel, thêm 2 biến:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Nhấn **Deploy**! (Hoặc dùng tích hợp **Supabase Integration** trực tiếp trên Vercel Marketplace để tự động điền biến môi trường).
