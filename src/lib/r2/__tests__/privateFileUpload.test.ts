import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as listFiles } from "@/app/api/files/route";
import { POST as initUpload } from "@/app/api/files/upload-url/route";
import { POST as completeUpload } from "@/app/api/files/complete/route";
import { GET as getDownloadUrl } from "@/app/api/files/[id]/download/route";
import { GET as downloadBlob, PUT as putBlob } from "@/app/api/files/mock-blob/route";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";
import { getObjectStorageAdapter } from "../storageAdapter";
import { uploadPrivateFile } from "../uploadClient";

vi.mock("@/lib/supabase/authServer", () => ({ getAuthenticatedServerContext: vi.fn() }));

type Row = Record<string, unknown> & { object_key: string };

function mockMetadata(userId: string) {
  const rows: Row[] = [];
  const from = () => {
    const filters: Array<(row: Row) => boolean> = [];
    let columns = "*";
    let patch: Record<string, unknown> | undefined;
    const result = () => rows.filter((row) => filters.every((filter) => filter(row))).map((row) => {
      if (patch) Object.assign(row, patch);
      if (columns === "*") return row;
      return Object.fromEntries(columns.split(",").map((column) => {
        const [alias, name = alias] = column.trim().split(":");
        return [alias, row[name]];
      }));
    });
    const query = {
      insert: (row: Row) => { rows.push(row); return { error: null }; },
      select: (value: string) => { columns = value; return query; },
      update: (value: Record<string, unknown>) => { patch = value; return query; },
      delete: () => query,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      lt: () => Promise.resolve({ error: null }),
      order: () => query,
      limit: () => Promise.resolve({ data: result(), error: null }),
      maybeSingle: () => Promise.resolve({ data: result()[0], error: null }),
      single: () => Promise.resolve({ data: result()[0], error: null }),
    };
    return query;
  };
  vi.mocked(getAuthenticatedServerContext).mockResolvedValue({
    user: { id: userId },
    supabase: { from },
  } as unknown as NonNullable<Awaited<ReturnType<typeof getAuthenticatedServerContext>>>);
  return rows;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Private files API and upload client", () => {
  it.each([
    ["solve.webm", "video", "video/webm", "video/webm"],
    ["solve.webm", "video", "video/webm;codecs=vp8", "video/webm"],
    ["backup.json", "backup", "application/json", "application/json"],
  ] as const)("uploads, lists and downloads %s (%s, %s)", async (name, kind, type, signedType) => {
    vi.stubEnv("R2_MOCK", "1");
    const rows = mockMetadata(randomUUID());
    const origin = "http://localhost:3000";
    const requestFor = (path: string) => new Request(new URL(path, origin));
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = new URL(input, origin);
      const request = new Request(url, init);
      if (url.pathname.endsWith("/upload-url")) {
        expect(await request.clone().json()).toMatchObject({ fileName: name, fileKind: kind, contentType: type });
        return initUpload(request);
      }
      if (url.pathname.endsWith("/mock-blob")) {
        expect(request.headers.get("Content-Type")).toBe(signedType);
        return putBlob(request);
      }
      expect(url.pathname).toBe("/api/files/complete");
      return completeUpload(request);
    });

    try {
      const payload = kind === "video" ? new Uint8Array([26, 69, 223, 163]) : '{"solves":[]}';
      const blob = new Blob([payload], { type });
      expect(await uploadPrivateFile(blob, name, kind)).toBeNull();
      const list = await listFiles(requestFor("/api/files"));
      expect(list.status).toBe(200);
      const { files, storageMode } = await list.json();
      expect(storageMode).toBe("mock");
      expect(files).toEqual([expect.objectContaining({
        filename: name, kind, content_type: signedType, size_bytes: blob.size, status: "ready",
      })]);

      const link = await getDownloadUrl(requestFor("/api/files/" + files[0].id + "/download"), {
        params: Promise.resolve({ id: files[0].id }),
      });
      expect(link.status).toBe(200);
      const { downloadUrl } = await link.json();
      const download = await downloadBlob(requestFor(downloadUrl));
      expect(download.status).toBe(200);
      expect(download.headers.get("Content-Disposition")).toContain(name);
      expect(await download.arrayBuffer()).toEqual(await blob.arrayBuffer());
    } finally {
      for (const row of rows) await getObjectStorageAdapter()?.deleteObject(row.object_key);
    }
  });
});
