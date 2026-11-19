// Per-account durable offline mutation queue (write-ahead, coalescing, dependency-ordered).
// Shared between Web (localStorage) and Expo (AsyncStorage).

export type OutboxOpType =
  | "upsert_session"
  | "delete_session"
  | "upsert_solve"
  | "patch_solve"
  | "delete_solve"
  | "clear_session"
  | "upsert_cfop"
  | "upsert_practice_set"
  | "upsert_settings";

export interface OutboxItem {
  id: string;
  seq: number;
  type: OutboxOpType;
  entityId: string; // session_id, solve_id, alg_id, or user_id
  sessionId?: string; // for dependency ordering (session must exist before solve)
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
}

export interface OutboxExecutorResult {
  ok: boolean;
  error?: string;
  permanent?: boolean; // e.g., constraint error that will never succeed on retry
}

export type OutboxExecutor = (
  userId: string,
  item: OutboxItem
) => Promise<OutboxExecutorResult>;

const LEGACY_OUTBOX_KEY = "ruktimer_sync_outbox_v1";

export function outboxKeyForUser(userId: string): string {
  return `ruktimer_sync_outbox_v2:${userId}`;
}

export function cacheKeyForUser(userId: string): string {
  return `ruktimer_user_cache_v1:${userId}`;
}

function makeOpId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Coalesces a new mutation into an existing per-user queue while preserving
 * referential integrity (session upserts stay ahead of solve upserts).
 */
export function coalesceOutboxQueue(
  existing: OutboxItem[],
  incoming: Omit<OutboxItem, "id" | "seq" | "attempts" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
): OutboxItem[] {
  const nextSeq =
    existing.length > 0 ? Math.max(...existing.map((i) => i.seq)) + 1 : 1;
  const nowIso = incoming.createdAt ?? new Date().toISOString();
  const item: OutboxItem = {
    id: incoming.id ?? makeOpId(),
    seq: nextSeq,
    type: incoming.type,
    entityId: incoming.entityId,
    sessionId: incoming.sessionId,
    payload: incoming.payload,
    createdAt: nowIso,
    attempts: 0,
  };

  let queue = [...existing];

  if (item.type === "upsert_session") {
    const idx = queue.findIndex(
      (q) => q.type === "upsert_session" && q.entityId === item.entityId
    );
    if (idx >= 0) {
      queue[idx] = {
        ...queue[idx],
        payload: { ...queue[idx].payload, ...item.payload },
      };
      return queue;
    }
    queue.push(item);
    return queue;
  }

  if (item.type === "delete_session") {
    // Drop any pending mutations for this session or its solves
    const hadUnsentInsert = queue.some(
      (q) => q.type === "upsert_session" && q.entityId === item.entityId
    );
    queue = queue.filter(
      (q) => q.entityId !== item.entityId && q.sessionId !== item.entityId
    );
    // Keep delete_session to ensure remote deletion if it already existed on cloud
    if (!hadUnsentInsert) {
      queue.push(item);
    } else {
      // Still push delete_session idempotently because an upsert could have been an update
      queue.push(item);
    }
    return queue;
  }

  if (item.type === "clear_session") {
    queue = queue.filter(
      (q) =>
        !(
          (q.type === "upsert_solve" ||
            q.type === "patch_solve" ||
            q.type === "delete_solve") &&
          q.sessionId === item.entityId
        )
    );
    queue.push(item);
    return queue;
  }

  if (item.type === "upsert_solve") {
    const idx = queue.findIndex(
      (q) => q.type === "upsert_solve" && q.entityId === item.entityId
    );
    if (idx >= 0) {
      queue[idx] = {
        ...queue[idx],
        payload: { ...queue[idx].payload, ...item.payload },
      };
      return queue;
    }
    queue.push(item);
    return queue;
  }

  if (item.type === "patch_solve") {
    // If the solve is still waiting to be inserted, merge patch directly into the upsert_solve
    const upsertIdx = queue.findIndex(
      (q) => q.type === "upsert_solve" && q.entityId === item.entityId
    );
    if (upsertIdx >= 0) {
      queue[upsertIdx] = {
        ...queue[upsertIdx],
        payload: { ...queue[upsertIdx].payload, ...item.payload },
      };
      return queue;
    }
    const patchIdx = queue.findIndex(
      (q) => q.type === "patch_solve" && q.entityId === item.entityId
    );
    if (patchIdx >= 0) {
      queue[patchIdx] = {
        ...queue[patchIdx],
        payload: { ...queue[patchIdx].payload, ...item.payload },
      };
      return queue;
    }
    queue.push(item);
    return queue;
  }

  if (item.type === "delete_solve") {
    queue = queue.filter(
      (q) =>
        !(
          (q.type === "upsert_solve" || q.type === "patch_solve") &&
          q.entityId === item.entityId
        )
    );
    queue.push(item);
    return queue;
  }

  if (
    item.type === "upsert_cfop" ||
    item.type === "upsert_practice_set" ||
    item.type === "upsert_settings"
  ) {
    queue = queue.filter(
      (q) => !(q.type === item.type && q.entityId === item.entityId)
    );
    queue.push(item);
    return queue;
  }

  queue.push(item);
  return queue;
}

/**
 * Orders queue so session creations execute before dependent solve mutations,
 * while preserving original `seq` order otherwise.
 */
export function sortOutboxForFlush(items: OutboxItem[]): OutboxItem[] {
  const priority = (t: OutboxOpType): number => {
    if (t === "upsert_session") return 1;
    if (t === "clear_session") return 2;
    if (t === "upsert_solve") return 3;
    if (t === "patch_solve") return 4;
    if (t === "delete_solve") return 5;
    if (t === "delete_session") return 6;
    return 7;
  };
  return [...items].sort((a, b) => {
    const pa = priority(a.type);
    const pb = priority(b.type);
    if (pa !== pb) return pa - pb;
    return a.seq - b.seq;
  });
}

export async function loadUserOutbox(
  store: KeyValueStore,
  userId: string
): Promise<OutboxItem[]> {
  try {
    const key = outboxKeyForUser(userId);
    const raw = await store.getItem(key);
    let list: OutboxItem[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];

    // One-time migration from legacy global key (`ruktimer_sync_outbox_v1`)
    const legacyRaw = await store.getItem(LEGACY_OUTBOX_KEY);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw);
        if (Array.isArray(legacy) && legacy.length > 0) {
          for (const old of legacy) {
            const entityId = String(
              old?.payload?.id ?? old?.payload?.alg_id ?? old?.id ?? makeOpId()
            );
            const sessionId = old?.payload?.session_id
              ? String(old.payload.session_id)
              : undefined;
            list = coalesceOutboxQueue(list, {
              type: old.type as OutboxOpType,
              entityId,
              sessionId,
              payload: (old.payload ?? {}) as Record<string, unknown>,
              createdAt: old.createdAt,
            });
          }
          await store.setItem(key, JSON.stringify(list));
        }
      } catch {
        // ignore corrupt legacy entry
      }
      if (store.removeItem) {
        await store.removeItem(LEGACY_OUTBOX_KEY);
      } else {
        await store.setItem(LEGACY_OUTBOX_KEY, "[]");
      }
    }

    return list;
  } catch {
    return [];
  }
}

export async function saveUserOutbox(
  store: KeyValueStore,
  userId: string,
  items: OutboxItem[]
): Promise<void> {
  try {
    await store.setItem(outboxKeyForUser(userId), JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

export async function enqueueUserMutation(
  store: KeyValueStore,
  userId: string,
  mutation: Omit<OutboxItem, "id" | "seq" | "attempts" | "createdAt">
): Promise<OutboxItem[]> {
  const current = await loadUserOutbox(store, userId);
  const next = coalesceOutboxQueue(current, mutation);
  await saveUserOutbox(store, userId, next);
  return next;
}

/**
 * Flushes all queued mutations for `userId` in dependency order.
 * If a session upsert fails, dependent solve mutations for that session remain queued
 * without blocking independent mutations.
 */
export async function flushUserOutbox(
  store: KeyValueStore,
  userId: string,
  executor: OutboxExecutor
): Promise<{
  flushedCount: number;
  remainingCount: number;
  failedPermanentCount: number;
}> {
  const queue = await loadUserOutbox(store, userId);
  if (queue.length === 0) {
    return { flushedCount: 0, remainingCount: 0, failedPermanentCount: 0 };
  }

  const ordered = sortOutboxForFlush(queue);
  const remaining: OutboxItem[] = [];
  const failedSessionIds = new Set<string>();
  let flushedCount = 0;
  let failedPermanentCount = 0;

  for (const item of ordered) {
    if (
      item.sessionId &&
      failedSessionIds.has(item.sessionId) &&
      (item.type === "upsert_solve" || item.type === "patch_solve")
    ) {
      remaining.push(item);
      continue;
    }

    try {
      const res = await executor(userId, item);
      if (res.ok) {
        flushedCount++;
      } else if (res.permanent) {
        failedPermanentCount++;
      } else {
        if (item.type === "upsert_session") {
          failedSessionIds.add(item.entityId);
        }
        remaining.push({
          ...item,
          attempts: item.attempts + 1,
          lastError: res.error,
        });
      }
    } catch (err) {
      if (item.type === "upsert_session") {
        failedSessionIds.add(item.entityId);
      }
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  await saveUserOutbox(store, userId, remaining);
  return {
    flushedCount,
    remainingCount: remaining.length,
    failedPermanentCount,
  };
}
