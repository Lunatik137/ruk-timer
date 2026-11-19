import { NextResponse } from "next/server";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";
import {
  assertObjectKeyOwnership,
  getObjectStorageAdapter,
} from "@/lib/r2/storageAdapter";

/**
 * GET /api/files/[id]/view — Verifies authentication, ownership, and video kind,
 * then returns a short-lived signed inline playback URL with the video's Content-Type.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedServerContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const adapter = getObjectStorageAdapter();
  if (!adapter) {
    return NextResponse.json(
      { error: "Kho R2 chưa được cấu hình." },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  const { data: row, error } = await auth.supabase
    .from("user_files")
    .select("id, object_key, file_name, file_kind, content_type, status")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !row || row.status !== "ready") {
    return NextResponse.json(
      { error: "Không tìm thấy tệp hoặc bạn không có quyền xem tệp này." },
      { status: 404 }
    );
  }

  if (!assertObjectKeyOwnership(auth.user.id, row.object_key)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const baseMime = String(row.content_type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (row.file_kind !== "video" || !baseMime.startsWith("video/")) {
    return NextResponse.json(
      { error: "Chỉ hỗ trợ xem trực tiếp cho tệp video." },
      { status: 400 }
    );
  }

  const origin = new URL(request.url).origin;
  const { downloadUrl: viewUrl, expiresInSec } =
    await adapter.createPresignedGetUrl({
      objectKey: row.object_key,
      fileName: row.file_name,
      origin,
      disposition: "inline",
      contentType: baseMime,
    });

  return NextResponse.json({
    viewUrl,
    expiresInSec,
    contentType: baseMime,
    fileName: row.file_name,
  });
}
