import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  const colors = [
    "#ef4444",
    "#22c55e",
    "#3b82f6",
    "#facc15",
    "#f8fafc",
    "#f97316",
    "#22d3ee",
    "#ef4444",
    "#22c55e",
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            justifyContent: "center",
            alignContent: "center",
          }}
        >
          {colors.map((bg, idx) => (
            <div
              key={idx}
              style={{
                width: "38px",
                height: "38px",
                backgroundColor: bg,
                borderRadius: "8px",
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
