import { describe, expect, it } from "vitest";
import {
  enqueueUserMutation,
  flushUserOutbox,
  loadUserOutbox,
  type KeyValueStore,
  type OutboxItem,
} from "../outbox";

function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("per-account durable offline outbox", () => {
  it("isolates queues per account and preserves mutations across reopen", async () => {
    const store = createMemoryStore();
    await enqueueUserMutation(store, "user-A", {
      type: "upsert_solve",
      entityId: "sv-1",
      sessionId: "sess-1",
      payload: { id: "sv-1", time_ms: 11000 },
    });
    await enqueueUserMutation(store, "user-B", {
      type: "upsert_solve",
      entityId: "sv-2",
      sessionId: "sess-2",
      payload: { id: "sv-2", time_ms: 15000 },
    });

    const qA = await loadUserOutbox(store, "user-A");
    const qB = await loadUserOutbox(store, "user-B");
    expect(qA).toHaveLength(1);
    expect(qA[0].entityId).toBe("sv-1");
    expect(qB).toHaveLength(1);
    expect(qB[0].entityId).toBe("sv-2");
  });

  it("coalesces upsert_solve + patch_solve (+2/comment/reconstruction) and drops deleted unsent solves", async () => {
    const store = createMemoryStore();
    await enqueueUserMutation(store, "u1", {
      type: "upsert_solve",
      entityId: "sv-1",
      sessionId: "s1",
      payload: { id: "sv-1", time_ms: 10000, penalty: "OK", comment: "" },
    });
    await enqueueUserMutation(store, "u1", {
      type: "patch_solve",
      entityId: "sv-1",
      sessionId: "s1",
      payload: { penalty: "+2", comment: "OLL skip", reconstruction: "R U R' U'" },
    });

    const q1 = await loadUserOutbox(store, "u1");
    expect(q1).toHaveLength(1);
    expect(q1[0].type).toBe("upsert_solve");
    expect(q1[0].payload.penalty).toBe("+2");
    expect(q1[0].payload.comment).toBe("OLL skip");
    expect(q1[0].payload.reconstruction).toBe("R U R' U'");

    // Deleting a solve drops the prior upsert/patch and leaves only idempotent delete_solve
    await enqueueUserMutation(store, "u1", {
      type: "delete_solve",
      entityId: "sv-1",
      sessionId: "s1",
      payload: { id: "sv-1" },
    });
    const q2 = await loadUserOutbox(store, "u1");
    expect(q2).toHaveLength(1);
    expect(q2[0].type).toBe("delete_solve");
  });

  it("orders session upsert before dependent solve upserts and retries idempotently after failure", async () => {
    const store = createMemoryStore();
    // Enqueue solve first, session second (out of order)
    await enqueueUserMutation(store, "u1", {
      type: "upsert_solve",
      entityId: "sv-10",
      sessionId: "sess-10",
      payload: { id: "sv-10", session_id: "sess-10" },
    });
    await enqueueUserMutation(store, "u1", {
      type: "upsert_session",
      entityId: "sess-10",
      payload: { id: "sess-10", name: "New 3x3" },
    });

    // Simulate offline failure on first flush
    const failedRes = await flushUserOutbox(store, "u1", async () => ({
      ok: false,
      error: "offline",
    }));
    expect(failedRes.flushedCount).toBe(0);
    expect(failedRes.remainingCount).toBe(2);

    // Simulate reconnect on second flush — verify session runs before solve
    const executed: string[] = [];
    const okRes = await flushUserOutbox(
      store,
      "u1",
      async (_uid, item: OutboxItem) => {
        executed.push(`${item.type}:${item.entityId}`);
        return { ok: true };
      }
    );
    expect(okRes.flushedCount).toBe(2);
    expect(okRes.remainingCount).toBe(0);
    expect(executed).toEqual(["upsert_session:sess-10", "upsert_solve:sv-10"]);
  });
});
