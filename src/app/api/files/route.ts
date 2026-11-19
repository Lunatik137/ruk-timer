import { NextResponse } from "next/server";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";
import { getObjectStorageAdapter } from "@/lib/r2/storageAdapter";

/**
 * GET /api/files — Lists ready private files owned by the authenticated user.
 * Cleans up abandoned pending uploads older than 1 hour.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedServerContext(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Vui lòng đăng nhập để quản lý kho tệp cá nhân." },
      { status: 401 }
    );
  }

  const adapter = getObjectStorageAdapter();
  const staleCutoff = new Date(Date.now() - 3600_000).toISOString();

  // Opportunistic cleanup of stale pending metadata rows
  try {
    await auth.supabase
      .from("user_files")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("status", "pending")
      .lt("created_at", staleCutoff);
  } catch {
    // non-fatal
  }

  const { data, error } = await auth.supabase
    .from("user_files")
    .select(
      "id, file_name, file_kind, content_type, size_bytes, status, created_at"
    )
    .eq("user_id", auth.user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      {
        files: [],
        storageMode: adapter?.mode ?? "unconfigured",
        error: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    files: data ?? [],
    storageMode: adapter?.mode ?? "unconfigured",
  });
}
