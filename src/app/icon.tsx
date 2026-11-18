import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

export default function Icon() {
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
          background: "linear-gradient(135deg, #0f172a 0%, #020617 100%)",
          borderRadius: "112px",
          padding: "68px",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            justifyContent: "center",
            alignContent: "center",
          }}
        >
          {colors.map((bg, idx) => (
            <div
              key={idx}
              style={{
                width: "108px",
                height: "108px",
                backgroundColor: bg,
                borderRadius: "20px",
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
