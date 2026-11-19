import { NextResponse } from "next/server";

/**
 * Generates an official WCA random-state 3x3 scramble via `cubing/scramble` (Kociemba solver).
 * Used by Competition Mode on both Web and Expo (Hermes cannot execute WASM workers directly).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const event = searchParams.get("event") || "333";
  const allowedEvents = new Set(["333", "222", "pyram", "skewb", "clock"]);
  const safeEvent = allowedEvents.has(event) ? event : "333";

  try {
    const mod = await import("cubing/scramble");
    const alg = await mod.randomScrambleForEvent(safeEvent);
    return NextResponse.json(
      {
        scramble: alg.toString().trim(),
        event: safeEvent,
        source: "random-state",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        scramble: null,
        event: safeEvent,
        source: "fallback-required",
      },
      { status: 503 }
    );
  }
}
