import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";
import {
  buildUserObjectKey,
  getObjectStorageAdapter,
  type UserFileKind,
  validateUploadRequest,
} from "@/lib/r2/storageAdapter";

/**
 * POST /api/files/upload-url — Issues a short-lived signed PUT URL and creates a `pending` metadata row.
 */
export async function POST(request: Request) {
  const auth = await getAuthenticatedServerContext(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Vui lòng đăng nhập để tải tệp lên kho cá nhân." },
      { status: 401 }
    );
  }

  const adapter = getObjectStorageAdapter();
  if (!adapter) {
    return NextResponse.json(
      {
        error:
          "Kho lưu trữ Cloudflare R2 chưa được cấu hình trên máy chủ (thiếu biến môi trường R2_*).",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const fileName = String(body?.fileName || "").trim();
  const contentType = String(body?.contentType || "").split(";")[0].trim().toLowerCase();
  const sizeBytes = Number(body?.sizeBytes || 0);
  const fileKind = (
    ["video", "backup", "other"].includes(body?.fileKind)
      ? body.fileKind
      : "other"
  ) as UserFileKind;

  const check = validateUploadRequest({
    fileKind,
    contentType,
    sizeBytes,
    fileName,
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const fileId = crypto.randomUUID();
  const objectKey = buildUserObjectKey(auth.user.id, fileId, fileName);

  const { error: insertErr } = await auth.supabase.from("user_files").insert({
    id: fileId,
    user_id: auth.user.id,
    object_key: objectKey,
    file_name: fileName,
    file_kind: fileKind,
    content_type: contentType,
    size_bytes: sizeBytes,
    status: "pending",
  });

  if (insertErr) {
    return NextResponse.json(
      {
        error: `Không thể khởi tạo metadata tệp (hãy đảm bảo bảng user_files đã được tạo): ${insertErr.message}`,
      },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const { uploadUrl, expiresInSec } = await adapter.createPresignedPutUrl({
    objectKey,
    contentType: contentType,
    sizeBytes,
    origin,
  });

  return NextResponse.json({
    fileId,
    uploadUrl,
    expiresInSec,
    contentType,
    storageMode: adapter.mode,
  });
}
