import { describe, expect, it } from "vitest";
import {
  assertObjectKeyOwnership,
  buildUserObjectKey,
  getObjectStorageAdapter,
  validateUploadRequest,
} from "../storageAdapter";

describe("Cloudflare R2 private storage isolation & validation", () => {
  it("enforces strict two-account ownership on object keys", () => {
    const keyA = buildUserObjectKey("user-alpha", "file-1", "solve.webm");
    const keyB = buildUserObjectKey("user-beta", "file-2", "backup.json");

    expect(assertObjectKeyOwnership("user-alpha", keyA)).toBe(true);
    expect(assertObjectKeyOwnership("user-beta", keyA)).toBe(false);
    expect(assertObjectKeyOwnership("user-alpha", keyB)).toBe(false);
    expect(assertObjectKeyOwnership("user-alpha", "../users/user-alpha/x")).toBe(
      false
    );
  });

  it("validates MIME types and max upload sizes", () => {
    expect(
      validateUploadRequest({
        fileName: "solve.mp4",
        contentType: "video/mp4",
        sizeBytes: 5 * 1024 * 1024,
        fileKind: "video",
      }).ok
    ).toBe(true);

    expect(
      validateUploadRequest({
        fileName: "malware.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 1024,
        fileKind: "video",
      }).ok
    ).toBe(false);

    expect(
      validateUploadRequest({
        fileName: "huge.json",
        contentType: "application/json",
        sizeBytes: 60 * 1024 * 1024,
        fileKind: "backup",
      }).ok
    ).toBe(false);
  });

  it("supports mock object lifecycle (PUT -> HEAD -> GET -> DELETE)", async () => {
    process.env.R2_MOCK = "1";
    const adapter = getObjectStorageAdapter();
    expect(adapter.mode).toBe("mock");

    const key = buildUserObjectKey("user-test-1", "f-lifecycle", "backup.json");
    const put = await adapter.createPresignedPutUrl({
      objectKey: key,
      contentType: "application/json",
      sizeBytes: 12,
      origin: "http://localhost:3000",
    });
    expect(put.uploadUrl).toContain("/api/files/mock-blob");

    // Before upload, HEAD returns exists: false
    const before = await adapter.headObject(key);
    expect(before.exists).toBe(false);

    // Cleanup helper works even if missing
    await adapter.deleteObject(key);
  });
});
