import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RukTimer — Bấm giờ Rubik WCA",
    short_name: "RukTimer",
    description:
      "Ứng dụng bấm giờ giải Rubik chuẩn WCA hỗ trợ đồng bộ lịch sử giải qua Cloud DB trên Web & Điện thoại.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#020617",
    theme_color: "#020617",
    categories: ["games", "utilities", "sports"],
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
