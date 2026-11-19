import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type UserFileKind = "video" | "backup" | "other";

export const FILE_UPLOAD_LIMITS: Record<
  UserFileKind,
  { maxBytes: number; allowedMimes: string[] }
> = {
  video: {
    maxBytes: 200 * 1024 * 1024, // 200 MB
    allowedMimes: ["video/mp4", "video/webm", "video/quicktime"],
  },
  backup: {
    maxBytes: 50 * 1024 * 1024, // 50 MB
    allowedMimes: ["application/json", "text/csv", "text/plain"],
  },
  other: {
    maxBytes: 25 * 1024 * 1024, // 25 MB
    allowedMimes: ["application/json", "text/csv", "text/plain", "image/png"],
  },
};

export interface ObjectHeadResult {
  exists: boolean;
  sizeBytes: number;
}

export interface ObjectStorageAdapter {
  mode: "r2" | "mock";
  createPresignedPutUrl(params: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    origin: string;
  }): Promise<{ uploadUrl: string; expiresInSec: number }>;
  headObject(objectKey: string): Promise<ObjectHeadResult>;
  createPresignedGetUrl(params: {
    objectKey: string;
    fileName: string;
    origin: string;
    disposition?: "attachment" | "inline";
    contentType?: string;
  }): Promise<{ downloadUrl: string; expiresInSec: number }>;
  deleteObject(objectKey: string): Promise<void>;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  );
}

export function buildUserObjectKey(
  userId: string,
  fileId: string,
  fileName: string
): string {
  const safeName = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  return `users/${userId}/${fileId}-${safeName || "file"}`;
}

export function validateUploadRequest(params: {
  fileKind: UserFileKind;
  contentType: string;
  sizeBytes: number;
  fileName: string;
}): { ok: true } | { ok: false; error: string } {
  const rules = FILE_UPLOAD_LIMITS[params.fileKind];
  if (!rules) {
    return { ok: false, error: "Loại tệp không được hỗ trợ." };
  }
  const baseMime = params.contentType.split(";")[0].trim().toLowerCase();
  if (!rules.allowedMimes.includes(baseMime)) {
    return {
      ok: false,
      error: `Định dạng "${baseMime}" không hợp lệ cho loại ${params.fileKind}. Chỉ chấp nhận: ${rules.allowedMimes.join(", ")}.`,
    };
  }
  if (
    !Number.isFinite(params.sizeBytes) ||
    params.sizeBytes <= 0 ||
    params.sizeBytes > rules.maxBytes
  ) {
    const maxMb = Math.round(rules.maxBytes / (1024 * 1024));
    return {
      ok: false,
      error: `Kích thước tệp vượt giới hạn tối đa ${maxMb} MB.`,
    };
  }
  if (!params.fileName || params.fileName.trim().length === 0) {
    return { ok: false, error: "Tên tệp không hợp lệ." };
  }
  return { ok: true };
}

/**
 * Verifies that `objectKey` strictly belongs to `userId` (`users/<userId>/...`).
 */
export function assertObjectKeyOwnership(
  userId: string,
  objectKey: string
): boolean {
  if (!userId || !objectKey) return false;
  if (objectKey.includes("..")) return false;
  return objectKey.startsWith(`users/${userId}/`);
}

// ============================================================================
// Mock Disk Adapter (Used when R2_MOCK=1 or in dev/test without R2 credentials)
// ============================================================================

const MOCK_SIGN_SECRET =
  process.env.R2_MOCK_SECRET || "ruktimer-local-mock-r2-signing-secret";

export function getMockRootDir(): string {
  return path.resolve(process.cwd(), ".data", "r2-mock");
}

export function signMockToken(
  objectKey: string,
  action: "put" | "get",
  expUnix: number
): string {
  return crypto
    .createHmac("sha256", MOCK_SIGN_SECRET)
    .update(`${action}:${objectKey}:${expUnix}`)
    .digest("hex");
}

export function verifyMockToken(
  objectKey: string,
  action: "put" | "get",
  expUnix: number,
  sig: string
): boolean {
  if (Date.now() / 1000 > expUnix) return false;
  const expected = signMockToken(objectKey, action, expUnix);
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export function resolveSafeMockPath(objectKey: string): string {
  const root = getMockRootDir();
  const resolved = path.resolve(root, objectKey);
  if (!resolved.startsWith(root)) {
    throw new Error("Invalid mock object path");
  }
  return resolved;
}

function createMockAdapter(): ObjectStorageAdapter {
  return {
    mode: "mock",
    async createPresignedPutUrl({ objectKey, origin }) {
      const expiresInSec = 300;
      const exp = Math.floor(Date.now() / 1000) + expiresInSec;
      const sig = signMockToken(objectKey, "put", exp);
      const url = `${origin}/api/files/mock-blob?key=${encodeURIComponent(
        objectKey
      )}&exp=${exp}&sig=${sig}`;
      return { uploadUrl: url, expiresInSec };
    },
    async headObject(objectKey) {
      const fp = resolveSafeMockPath(objectKey);
      try {
        const stat = fs.statSync(fp);
        return { exists: stat.isFile(), sizeBytes: stat.size };
      } catch {
        return { exists: false, sizeBytes: 0 };
      }
    },
    async createPresignedGetUrl({
      objectKey,
      fileName,
      origin,
      disposition = "attachment",
      contentType,
    }) {
      const expiresInSec = 300;
      const exp = Math.floor(Date.now() / 1000) + expiresInSec;
      const sig = signMockToken(objectKey, "get", exp);
      const params = new URLSearchParams({
        key: objectKey,
        name: fileName,
        exp: String(exp),
        sig,
      });
      if (disposition === "inline") {
        params.set("disposition", "inline");
      }
      if (contentType) {
        params.set("type", contentType);
      }
      const url = `${origin}/api/files/mock-blob?${params.toString()}`;
      return { downloadUrl: url, expiresInSec };
    },
    async deleteObject(objectKey) {
      const fp = resolveSafeMockPath(objectKey);
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch {
        throw new Error("Không thể xóa tệp trên kho lưu trữ cục bộ.");
      }
    },
  };
}

// ============================================================================
// Real Cloudflare R2 Adapter (S3-compatible API)
// ============================================================================

let cachedS3: S3Client | null = null;

function getR2Client(): S3Client {
  if (!cachedS3) {
    cachedS3 = new S3Client({
      region: "auto",
      // The browser supplies the body after signing. Do not sign a checksum of an empty body.
      requestChecksumCalculation: "WHEN_REQUIRED",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedS3;
}

function createR2Adapter(): ObjectStorageAdapter {
  const bucket = process.env.R2_BUCKET_NAME!;
  const client = getR2Client();

  return {
    mode: "r2",
    async createPresignedPutUrl({ objectKey, contentType, sizeBytes }) {
      const expiresInSec = 300;
      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: sizeBytes,
      });
      const uploadUrl = await getSignedUrl(client, cmd, {
        expiresIn: expiresInSec,
      });
      return { uploadUrl, expiresInSec };
    },
    async headObject(objectKey) {
      try {
        const res = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: objectKey })
        );
        return {
          exists: true,
          sizeBytes: Number(res.ContentLength ?? 0),
        };
      } catch {
        return { exists: false, sizeBytes: 0 };
      }
    },
    async createPresignedGetUrl({
      objectKey,
      fileName,
      disposition = "attachment",
      contentType,
    }) {
      const expiresInSec = 300;
      const safeFileName = fileName.replace(/["\r\n]/g, "");
      const cmd = new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ResponseContentDisposition: `${disposition}; filename="${safeFileName}"`,
        ...(contentType ? { ResponseContentType: contentType } : {}),
      });
      const downloadUrl = await getSignedUrl(client, cmd, {
        expiresIn: expiresInSec,
      });
      return { downloadUrl, expiresInSec };
    },
    async deleteObject(objectKey) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })
      );
    },
  };
}

export function getObjectStorageAdapter(): ObjectStorageAdapter | null {
  if (isR2Configured() && process.env.R2_MOCK !== "1") {
    return createR2Adapter();
  }
  if (process.env.R2_MOCK === "1" || process.env.NODE_ENV !== "production") {
    return createMockAdapter();
  }
  return null;
}
