import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  resolveSafeMockPath,
  verifyMockToken,
} from "@/lib/r2/storageAdapter";

const ALLOWED_INLINE_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

/**
 * Local mock signed-URL endpoint used ONLY when `R2_MOCK=1` or in non-production without R2 credentials.
 */
export async function PUT(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.R2_MOCK !== "1") {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "";
  const exp = Number(searchParams.get("exp") || 0);
  const sig = searchParams.get("sig") || "";

  if (!verifyMockToken(key, "put", exp, sig)) {
    return NextResponse.json({ error: "Invalid or expired signature" }, { status: 403 });
  }

  const fp = resolveSafeMockPath(key);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const buf = Buffer.from(await request.arrayBuffer());
  fs.writeFileSync(fp, buf);
  return NextResponse.json({ ok: true, sizeBytes: buf.length });
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.R2_MOCK !== "1") {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "";
  const name = (searchParams.get("name") || "download").replace(/["\r\n]/g, "");
  const exp = Number(searchParams.get("exp") || 0);
  const sig = searchParams.get("sig") || "";
  const disposition =
    searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  const requestedType = (searchParams.get("type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!verifyMockToken(key, "get", exp, sig)) {
    return NextResponse.json({ error: "Invalid or expired signature" }, { status: 403 });
  }

  const fp = resolveSafeMockPath(key);
  if (!fs.existsSync(fp)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = fs.readFileSync(fp);
  const totalLength = data.length;
  const contentType =
    disposition === "inline" && ALLOWED_INLINE_VIDEO_TYPES.has(requestedType)
      ? requestedType
      : "application/octet-stream";

  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `${disposition}; filename="${name}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };

  const rangeHeader = request.headers.get("range");
  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const [rawStart, rawEnd] = rangeHeader.slice(6).split("-");
    const start = rawStart === "" ? Math.max(0, totalLength - Number(rawEnd)) : Number(rawStart);
    const end =
      rawStart === ""
        ? totalLength - 1
        : rawEnd === "" || rawEnd === undefined
        ? totalLength - 1
        : Math.min(totalLength - 1, Number(rawEnd));

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      start >= totalLength
    ) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${totalLength}`,
        },
      });
    }

    const chunk = data.subarray(start, end + 1);
    return new NextResponse(chunk, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${totalLength}`,
        "Content-Length": String(chunk.length),
      },
    });
  }

  return new NextResponse(data, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(totalLength),
    },
  });
}
