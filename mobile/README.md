# RukTimer Mobile (React Native + Expo)

Ứng dụng di động gốc (Android & iOS) của **RukTimer**, dùng chung cơ sở dữ liệu **Supabase Cloud DB** với bản Web (`https://ruk-timer.vercel.app`) giúp lịch sử giải, kỷ lục PB và các Session tự động đồng bộ xuyên suốt giữa Máy tính và Điện thoại.

---

## Cách 1: Chạy ngay trên điện thoại thật bằng Expo Go (Nhanh nhất — 30 giây)

1. Tải ứng dụng **Expo Go** miễn phí trên **App Store (iPhone)** hoặc **Google Play (Android)**.
2. Trên máy tính, mở terminal vào thư mục `mobile`:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
3. Dùng Camera (iPhone) hoặc ứng dụng Expo Go (Android) **quét mã QR** hiện trên màn hình terminal để mở thẳng App trên điện thoại!

---

## Cách 2: Xuất file cài đặt `.APK` cho điện thoại Android

Dự án đã cấu hình sẵn `eas.json` với profile xuất thẳng file `.apk`:

```bash
cd mobile
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Sau khi build xong trên đám mây của Expo, bạn sẽ nhận được đường link tải file `.apk` trực tiếp về cài đặt trên mọi máy Android.
