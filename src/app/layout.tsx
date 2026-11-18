import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RukTimer — Bấm giờ Rubik chuyên nghiệp & Lưu lịch sử Cloud",
  description:
    "Ứng dụng bấm giờ giải Rubik chuẩn WCA (2x2–7x7, OH, BLD, Pyraminx, Megaminx, Skewb, Square-1, Clock) hỗ trợ đăng nhập và đồng bộ lịch sử giải lên Cloud DB.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="font-sans antialiased bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
