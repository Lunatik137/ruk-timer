import { NextResponse } from "next/server";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";
import {
  assertObjectKeyOwnership,
  getObjectStorageAdapter,
} from "@/lib/r2/storageAdapter";

/**
 * DELETE /api/files/[id] — Verifies ownership, deletes R2 object FIRST, then deletes metadata row.
 */
export async function DELETE(
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
    .select("id, object_key")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json(
      { error: "Không tìm thấy tệp thuộc tài khoản của bạn." },
      { status: 404 }
    );
  }

  if (!assertObjectKeyOwnership(auth.user.id, row.object_key)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  // Delete object from R2 before deleting metadata so failure never leaves orphan objects
  try {
    await adapter.deleteObject(row.object_key);
  } catch {
    return NextResponse.json(
      { error: "Không thể xóa tệp trên R2. Vui lòng thử lại." },
      { status: 502 }
    );
  }

  const { error: delErr } = await auth.supabase
    .from("user_files")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, id });
}
