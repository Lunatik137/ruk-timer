import type { UserFileRecord } from "@/types/cubing";

export async function uploadPrivateFile(blob: Blob, fileName: string, fileKind: UserFileRecord["kind"]) {
  const contentType = blob.type ||
    (fileKind === "backup" ? "application/json" : "application/octet-stream");
  const init = await fetch("/api/files/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, fileKind, contentType, sizeBytes: blob.size }),
  });
  const signed = await init.json();
  if (!init.ok) return signed.error || "Không khởi tạo được phiên tải lên";

  const put = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": signed.contentType },
    body: blob,
  });
  if (!put.ok) return "Tải tệp bị gián đoạn. Vui lòng thử lại.";

  const complete = await fetch("/api/files/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: signed.fileId }),
  });
  if (!complete.ok) {
    const data = await complete.json();
    return data.error || "Xác nhận lưu tệp thất bại";
  }
  return null;
}
