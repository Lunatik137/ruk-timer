import type { UserFileRecord } from "@/types/cubing";

export async function uploadPrivateFile(blob: Blob, fileName: string, fileKind: UserFileRecord["kind"]) {
  const contentType = blob.type ||
    (fileKind === "backup" ? "application/json" : "application/octet-stream");
  const init = await fetch("/api/files/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, fileKind, contentType, sizeBytes: blob.size }),
  }).catch(() => null);
  if (!init) {
    return "Không kết nối được máy chủ để khởi tạo tải lên. Hãy kiểm tra mạng rồi thử lại.";
  }
  const signed = await init.json().catch(() => null);
  if (!init.ok) {
    return signed?.error || `Không khởi tạo được phiên tải lên (HTTP ${init.status}).`;
  }
  if (typeof signed?.uploadUrl !== "string" || !signed.uploadUrl ||
      typeof signed.fileId !== "string" || !signed.fileId ||
      typeof signed.contentType !== "string" || !signed.contentType) {
    return "Máy chủ trả về liên kết tải lên không hợp lệ. Vui lòng thử lại.";
  }

  const put = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": signed.contentType },
    body: blob,
  }).catch(() => null);
  if (!put) {
    if (signed.storageMode === "r2") {
      const origin = globalThis.location?.origin ?? "địa chỉ trang đang mở";
      return `Trình duyệt không gửi được tệp tới R2. Hãy kiểm tra kết nối và CORS của bucket: cho phép PUT và Content-Type từ ${origin}.`;
    }
    return "Không kết nối được kho tệp để tải lên. Hãy kiểm tra mạng rồi thử lại.";
  }
  if (!put.ok) {
    return `Kho tệp từ chối tải lên (HTTP ${put.status}). Vui lòng thử lại.`;
  }

  const complete = await fetch("/api/files/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: signed.fileId }),
  }).catch(() => null);
  if (!complete) {
    return "Tệp đã được gửi nhưng chưa xác nhận lưu vào kho cá nhân. Hãy kiểm tra mạng rồi thử lại.";
  }
  if (!complete.ok) {
    const data = await complete.json().catch(() => null);
    return data?.error || `Xác nhận lưu tệp thất bại (HTTP ${complete.status}).`;
  }
  return null;
}
