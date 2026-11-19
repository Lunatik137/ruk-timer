import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  resolveSafeMockPath,
  verifyMockToken,
} from "@/lib/r2/storageAdapter";

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
  const name = searchParams.get("name") || "download";
  const exp = Number(searchParams.get("exp") || 0);
  const sig = searchParams.get("sig") || "";

  if (!verifyMockToken(key, "get", exp, sig)) {
    return NextResponse.json({ error: "Invalid or expired signature" }, { status: 403 });
  }

  const fp = resolveSafeMockPath(key);
  if (!fs.existsSync(fp)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = fs.readFileSync(fp);
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
    },
  });
}
