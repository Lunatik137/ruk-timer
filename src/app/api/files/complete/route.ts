import { NextResponse } from "next/server";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";
import {
  assertObjectKeyOwnership,
  getObjectStorageAdapter,
} from "@/lib/r2/storageAdapter";

/**
 * POST /api/files/complete — Verifies the uploaded object actually exists in R2 via HEAD
 * before transitioning metadata status from `pending` -> `ready`.
 */
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const fileId = String(body?.fileId || "");
  if (!fileId) {
    return NextResponse.json({ error: "Thiếu fileId." }, { status: 400 });
  }

  const { data: row, error: fetchErr } = await auth.supabase
    .from("user_files")
    .select("*")
    .eq("id", fileId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json(
      { error: "Không tìm thấy tệp thuộc tài khoản của bạn." },
      { status: 404 }
    );
  }

  if (!assertObjectKeyOwnership(auth.user.id, row.object_key)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const head = await adapter.headObject(row.object_key);
  if (!head.exists || head.sizeBytes <= 0) {
    // Clean up pending row if upload never completed
    await auth.supabase
      .from("user_files")
      .delete()
      .eq("id", fileId)
      .eq("user_id", auth.user.id);
    return NextResponse.json(
      {
        error:
          "Tệp chưa tải lên hoàn tất trên kho lưu trữ. Vui lòng thử tải lại.",
      },
      { status: 409 }
    );
  }

  const { data: updated, error: updErr } = await auth.supabase
    .from("user_files")
    .update({
      status: "ready",
      size_bytes: head.sizeBytes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .eq("user_id", auth.user.id)
    .select(
      "id, file_name, file_kind, content_type, size_bytes, status, created_at"
    )
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ file: updated });
}
