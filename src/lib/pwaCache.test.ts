import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://timer.example";
const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function loadWorker() {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const addAll = vi.fn(async () => {});
  const put = vi.fn(async () => {});
  const match = vi.fn<(request: string) => Promise<Response | undefined>>();
  const open = vi.fn(async () => ({ addAll, match, put }));
  const deleteCache = vi.fn(async () => {});
  const fetch = vi.fn<typeof globalThis.fetch>();
  runInNewContext(worker, {
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) =>
        handlers.set(name, handler),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
    URL,
    Response,
    fetch,
    caches: {
      open,
      keys: async () => ["ruktimer-pwa-v1", "ruktimer-pwa-v2", "other-app-cache"],
      delete: deleteCache,
    },
  });

  const dispatch = (name: string, input: Record<string, unknown> = {}) => {
    let task: Promise<unknown> | undefined;
    const reply = (promise: Promise<unknown>) => { task = promise; };
    handlers.get(name)?.({ ...input, respondWith: reply, waitUntil: reply });
    return task;
  };
  const request = (path: string, mode = "cors") =>
    dispatch("fetch", { request: { url: new URL(path, origin).href, mode, method: "GET" } });
  return { dispatch, request, addAll, deleteCache, match, put, fetch };
}

describe("PWA offline cache", () => {
  it("precaches the public shell and its same-origin static assets", async () => {
    const sw = loadWorker();
    sw.match.mockResolvedValueOnce(new Response(
      '<script src="/_next/static/chunks/timer.js"></script>' +
      '<link href="/_next/static/timer.css" rel="stylesheet">' +
      '<link href="/api/files" rel="prefetch">'
    ));
    await sw.dispatch("install");
    expect(sw.addAll.mock.calls).toEqual([
      [["/", "/manifest.webmanifest"]],
      [[origin + "/_next/static/chunks/timer.js", origin + "/_next/static/timer.css"]],
    ]);
    await sw.dispatch("activate");
    expect(sw.deleteCache.mock.calls).toEqual([["ruktimer-pwa-v1"]]);
  });

  it("leaves API and auth requests to the network, and never returns HTML for an asset cache miss", async () => {
    const sw = loadWorker();
    expect(sw.request("/api/files")).toBeUndefined();
    expect(sw.request("/api/files/mock-blob")).toBeUndefined();
    expect(sw.request("/auth/callback", "navigate")).toBeUndefined();
    expect(sw.request("/?_rsc=frame")).toBeUndefined();
    sw.fetch.mockRejectedValue(new Error("offline"));
    const shell = new Response("Timer app");
    sw.match.mockImplementation(async (request) => request === "/" ? shell : undefined);
    expect(await sw.request("/", "navigate")).toBe(shell);
    expect(await sw.request("/_next/static/missing.js")).toMatchObject({ type: "error" });
  });

  it("returns the network response while the cache write is pending", async () => {
    const sw = loadWorker();
    const page = new Response("Timer app");
    sw.fetch.mockResolvedValueOnce(page);
    let finishWrite = () => {};
    const write = new Promise<void>((resolve) => { finishWrite = resolve; });
    sw.put.mockReturnValueOnce(write);
    try {
      expect(await sw.request("/", "navigate")).toBe(page);
      expect(sw.put).toHaveBeenCalledOnce();
    } finally {
      finishWrite();
    }
  });

  it("serves a cached versioned asset without a network request", async () => {
    const sw = loadWorker();
    const asset = new Response("application code");
    sw.match.mockResolvedValue(asset);
    expect(await sw.request("/_next/static/chunks/timer.js")).toBe(asset);
    expect(sw.fetch).not.toHaveBeenCalled();
  });
});
