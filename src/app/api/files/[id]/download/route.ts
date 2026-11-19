import { NextResponse } from "next/server";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";
import {
  assertObjectKeyOwnership,
  getObjectStorageAdapter,
} from "@/lib/r2/storageAdapter";

/**
 * GET /api/files/[id]/download — Verifies ownership and returns a short-lived signed GET URL.
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
    .select("id, object_key, file_name, status")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !row || row.status !== "ready") {
    return NextResponse.json(
      { error: "Không tìm thấy tệp hoặc bạn không có quyền tải tệp này." },
      { status: 404 }
    );
  }

  if (!assertObjectKeyOwnership(auth.user.id, row.object_key)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const { downloadUrl, expiresInSec } = await adapter.createPresignedGetUrl({
    objectKey: row.object_key,
    fileName: row.file_name,
    origin,
  });

  return NextResponse.json({ downloadUrl, expiresInSec });
}
