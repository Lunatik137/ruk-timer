import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import {
  cacheKeyForUser,
  enqueueUserMutation,
  flushUserOutbox,
  loadUserOutbox,
  type KeyValueStore,
  type OutboxExecutorResult,
  type OutboxItem,
} from "./core/outbox";
import type { CfopProgressItem } from "./core/types";
import {
  CubeSession,
  DEFAULT_MOBILE_SETTINGS,
  MobileSettings,
  Solve,
} from "../types/cubing";

export type { CfopProgressItem };

const AS_SESSIONS_KEY = "ruktimer_mobile_guest_sessions_v1";
const AS_SOLVES_KEY = "ruktimer_mobile_guest_solves_v1";
const AS_SETTINGS_KEY = "ruktimer_mobile_settings_v1";
const AS_CFOP_PROGRESS_KEY = "ruktimer_mobile_cfop_progress_v2";
const AS_PRACTICE_SET_KEY = "ruktimer_mobile_cfop_practice_set_v1";

const asyncStoreAdapter: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

export function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createDefaultSession(): CubeSession {
  return {
    id: generateUuid(),
    name: "Session 1",
    puzzle: "3x3",
    created_at: new Date().toISOString(),
  };
}

export async function loadMobileSettings(): Promise<MobileSettings> {
  try {
    const raw = await AsyncStorage.getItem(AS_SETTINGS_KEY);
    return raw
      ? { ...DEFAULT_MOBILE_SETTINGS, ...JSON.parse(raw) }
      : DEFAULT_MOBILE_SETTINGS;
  } catch {
    return DEFAULT_MOBILE_SETTINGS;
  }
}

export async function saveMobileSettings(s: MobileSettings): Promise<void> {
  await AsyncStorage.setItem(AS_SETTINGS_KEY, JSON.stringify(s));
}

export async function loadGuestMobileData(): Promise<{
  sessions: CubeSession[];
  solves: Solve[];
}> {
  try {
    const [rawS, rawSv] = await Promise.all([
      AsyncStorage.getItem(AS_SESSIONS_KEY),
      AsyncStorage.getItem(AS_SOLVES_KEY),
    ]);
    let sessions: CubeSession[] = rawS ? JSON.parse(rawS) : [];
    const solves: Solve[] = rawSv ? JSON.parse(rawSv) : [];
    if (sessions.length === 0) {
      sessions = [createDefaultSession()];
      await AsyncStorage.setItem(AS_SESSIONS_KEY, JSON.stringify(sessions));
    }
    return { sessions, solves };
  } catch {
    return { sessions: [createDefaultSession()], solves: [] };
  }
}

export async function saveGuestMobileSessions(
  sessions: CubeSession[]
): Promise<void> {
  await AsyncStorage.setItem(AS_SESSIONS_KEY, JSON.stringify(sessions));
}

export async function saveGuestMobileSolves(solves: Solve[]): Promise<void> {
  await AsyncStorage.setItem(AS_SOLVES_KEY, JSON.stringify(solves));
}

export async function loadLocalMobileCfopProgress(): Promise<
  Record<string, CfopProgressItem>
> {
  try {
    const raw = await AsyncStorage.getItem(AS_CFOP_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveLocalMobileCfopProgress(
  map: Record<string, CfopProgressItem>
): Promise<void> {
  await AsyncStorage.setItem(AS_CFOP_PROGRESS_KEY, JSON.stringify(map));
}

export async function loadLocalMobilePracticeSet(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(AS_PRACTICE_SET_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? Array.from(new Set(arr.filter((x): x is string => typeof x === "string")))
      : [];
  } catch {
    return [];
  }
}

export async function saveLocalMobilePracticeSet(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(
    AS_PRACTICE_SET_KEY,
    JSON.stringify(Array.from(new Set(ids)))
  );
}

export interface MobileUserCache {
  sessions: CubeSession[];
  solves: Solve[];
  cfopProgress: Record<string, CfopProgressItem>;
  practiceSetIds: string[];
  updatedAt: string;
}

export async function loadMobileUserCache(
  userId: string
): Promise<MobileUserCache | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKeyForUser(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MobileUserCache>;
    if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.solves)) {
      return null;
    }
    return {
      sessions: parsed.sessions,
      solves: parsed.solves,
      cfopProgress: parsed.cfopProgress ?? {},
      practiceSetIds: Array.isArray(parsed.practiceSetIds)
        ? parsed.practiceSetIds
        : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function saveMobileUserCache(
  userId: string,
  cache: Omit<MobileUserCache, "updatedAt">
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      cacheKeyForUser(userId),
      JSON.stringify({ ...cache, updatedAt: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

async function executeMobileOutboxItem(
  userId: string,
  item: OutboxItem
): Promise<OutboxExecutorResult> {
  if (item.type === "upsert_session") {
    const { error } = await supabase
      .from("cube_sessions")
      .upsert({ ...item.payload, user_id: userId }, { onConflict: "id" });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (item.type === "delete_session") {
    const { error } = await supabase
      .from("cube_sessions")
      .delete()
      .eq("id", String(item.entityId))
      .eq("user_id", userId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (item.type === "upsert_solve") {
    const { error } = await supabase
      .from("solves")
      .upsert({ ...item.payload, user_id: userId }, { onConflict: "id" });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (item.type === "patch_solve") {
    const updates = { ...item.payload };
    delete updates.id;
    delete updates.user_id;
    const { error } = await supabase
      .from("solves")
      .update(updates)
      .eq("id", String(item.entityId))
      .eq("user_id", userId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (item.type === "delete_solve") {
    const { error } = await supabase
      .from("solves")
      .delete()
      .eq("id", String(item.entityId))
      .eq("user_id", userId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (item.type === "upsert_cfop") {
    const { error } = await supabase
      .from("cfop_progress")
      .upsert(
        { ...item.payload, user_id: userId },
        { onConflict: "user_id,alg_id" }
      );
    if (error && error.message.includes("cfop_progress")) return { ok: true };
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (item.type === "upsert_practice_set") {
    const { error } = await supabase.from("cfop_practice_sets").upsert(
      {
        user_id: userId,
        alg_ids: item.payload.alg_ids ?? [],
        updated_at: item.payload.updated_at ?? new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error && error.message.includes("cfop_practice_sets")) {
      return { ok: true };
    }
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  return { ok: true };
}

export async function getMobileOutboxCount(userId: string): Promise<number> {
  const list = await loadUserOutbox(asyncStoreAdapter, userId);
  return list.length;
}

export async function flushMobileOutbox(userId: string): Promise<{
  flushedCount: number;
  remainingCount: number;
}> {
  const res = await flushUserOutbox(
    asyncStoreAdapter,
    userId,
    executeMobileOutboxItem
  );
  return {
    flushedCount: res.flushedCount,
    remainingCount: res.remainingCount,
  };
}

async function mobileWriteAhead(
  userId: string,
  mutation: Parameters<typeof enqueueUserMutation>[2]
): Promise<number> {
  await enqueueUserMutation(asyncStoreAdapter, userId, mutation);
  const res = await flushMobileOutbox(userId);
  return res.remainingCount;
}

export async function cloudInsertMobileSession(
  userId: string,
  session: CubeSession
): Promise<number> {
  return mobileWriteAhead(userId, {
    type: "upsert_session",
    entityId: session.id,
    payload: {
      id: session.id,
      user_id: userId,
      name: session.name,
      puzzle: session.puzzle,
      created_at: session.created_at,
    },
  });
}

export async function cloudDeleteMobileSession(
  userId: string,
  sessionId: string
): Promise<number> {
  return mobileWriteAhead(userId, {
    type: "delete_session",
    entityId: sessionId,
    payload: { id: sessionId, user_id: userId },
  });
}

export async function cloudInsertMobileSolve(
  userId: string,
  solve: Solve
): Promise<number> {
  return mobileWriteAhead(userId, {
    type: "upsert_solve",
    entityId: solve.id,
    sessionId: solve.session_id,
    payload: {
      id: solve.id,
      user_id: userId,
      session_id: solve.session_id,
      puzzle: solve.puzzle,
      time_ms: solve.time_ms,
      penalty: solve.penalty,
      scramble: solve.scramble,
      comment: solve.comment || "",
      solved_at: solve.solved_at,
    },
  });
}

export async function cloudUpdateMobileSolve(
  userId: string,
  solveId: string,
  updates: Partial<Pick<Solve, "penalty" | "comment">>
): Promise<number> {
  return mobileWriteAhead(userId, {
    type: "patch_solve",
    entityId: solveId,
    payload: updates as Record<string, unknown>,
  });
}

export async function cloudDeleteMobileSolve(
  userId: string,
  solveId: string
): Promise<number> {
  return mobileWriteAhead(userId, {
    type: "delete_solve",
    entityId: solveId,
    payload: { id: solveId, user_id: userId },
  });
}

export async function cloudUpsertMobileCfopProgress(
  userId: string,
  item: CfopProgressItem
): Promise<number> {
  return mobileWriteAhead(userId, {
    type: "upsert_cfop",
    entityId: item.alg_id,
    payload: {
      user_id: userId,
      alg_id: item.alg_id,
      status: item.status,
      preferred_formula: item.preferred_formula ?? null,
      ease_factor: item.ease_factor,
      interval_days: item.interval_days,
      repetitions: item.repetitions,
      next_review_at: item.next_review_at,
      last_drilled_at: item.last_drilled_at ?? null,
      updated_at: item.updated_at,
    },
  });
}

export async function cloudSaveMobilePracticeSet(
  userId: string,
  algIds: string[]
): Promise<number> {
  return mobileWriteAhead(userId, {
    type: "upsert_practice_set",
    entityId: userId,
    payload: {
      alg_ids: Array.from(new Set(algIds)),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function fetchCloudMobileData(userId: string): Promise<{
  sessions: CubeSession[];
  solves: Solve[];
  cfopProgress?: Record<string, CfopProgressItem>;
  practiceSetIds?: string[];
  error?: string;
}> {
  await flushMobileOutbox(userId);

  const sessionsRes = await supabase
    .from("cube_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (sessionsRes.error) {
    return { sessions: [], solves: [], error: sessionsRes.error.message };
  }

  const solves: Solve[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const pageRes = await supabase
      .from("solves")
      .select("*")
      .eq("user_id", userId)
      .order("solved_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (pageRes.error) {
      return { sessions: [], solves: [], error: pageRes.error.message };
    }
    const batch = (pageRes.data ?? []) as Solve[];
    solves.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  let sessions = (sessionsRes.data ?? []) as CubeSession[];

  if (sessions.length === 0) {
    const def: CubeSession = {
      id: generateUuid(),
      user_id: userId,
      name: "Session 1",
      puzzle: "3x3",
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("cube_sessions").insert(def);
    if (!error) sessions = [def];
  }

  const cfopProgress: Record<string, CfopProgressItem> = {};
  try {
    const cfopRes = await supabase
      .from("cfop_progress")
      .select("*")
      .eq("user_id", userId);
    if (!cfopRes.error && Array.isArray(cfopRes.data)) {
      for (const row of cfopRes.data) {
        cfopProgress[row.alg_id] = {
          alg_id: row.alg_id,
          status: row.status,
          preferred_formula: row.preferred_formula ?? undefined,
          ease_factor: Number(row.ease_factor ?? 2.5),
          interval_days: Number(row.interval_days ?? 0),
          repetitions: Number(row.repetitions ?? 0),
          next_review_at: row.next_review_at,
          last_drilled_at: row.last_drilled_at ?? undefined,
          updated_at: row.updated_at,
        };
      }
    }
  } catch {
    // non-fatal
  }

  let practiceSetIds: string[] | undefined;
  try {
    const psRes = await supabase
      .from("cfop_practice_sets")
      .select("alg_ids")
      .eq("user_id", userId)
      .maybeSingle();
    if (!psRes.error && Array.isArray(psRes.data?.alg_ids)) {
      practiceSetIds = psRes.data.alg_ids.filter(
        (x: unknown): x is string => typeof x === "string"
      );
    }
  } catch {
    // non-fatal
  }

  return { sessions, solves, cfopProgress, practiceSetIds };
}

export async function syncGuestMobileToCloud(userId: string): Promise<{
  count: number;
  error?: string;
}> {
  const { sessions, solves } = await loadGuestMobileData();
  const localCfop = await loadLocalMobileCfopProgress();
  const localPracticeSet = await loadLocalMobilePracticeSet();

  const cfopItems = Object.values(localCfop);
  if (cfopItems.length > 0) {
    try {
      await supabase.from("cfop_progress").upsert(
        cfopItems.map((item) => ({
          user_id: userId,
          alg_id: item.alg_id,
          status: item.status,
          preferred_formula: item.preferred_formula ?? null,
          ease_factor: item.ease_factor,
          interval_days: item.interval_days,
          repetitions: item.repetitions,
          next_review_at: item.next_review_at,
          last_drilled_at: item.last_drilled_at ?? null,
          updated_at: item.updated_at,
        })),
        { onConflict: "user_id,alg_id" }
      );
    } catch {
      // non-fatal
    }
  }

  if (localPracticeSet.length > 0) {
    try {
      await supabase.from("cfop_practice_sets").upsert(
        {
          user_id: userId,
          alg_ids: localPracticeSet,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch {
      // non-fatal
    }
  }

  if (solves.length === 0) return { count: 0 };

  const usedSessionIds = new Set(solves.map((s) => s.session_id));
  const sessionsPayload = sessions
    .filter((s) => usedSessionIds.has(s.id))
    .map((s) => ({
      id: s.id,
      user_id: userId,
      name: s.name === "Session 1" ? "Mobile Imported" : s.name,
      puzzle: s.puzzle,
      created_at: s.created_at,
    }));

  if (sessionsPayload.length > 0) {
    const { error: sErr } = await supabase
      .from("cube_sessions")
      .upsert(sessionsPayload, { onConflict: "id" });
    if (sErr) return { count: 0, error: sErr.message };
  }

  const solvesPayload = solves.map((sv) => ({
    id: sv.id,
    user_id: userId,
    session_id: sv.session_id,
    puzzle: sv.puzzle,
    time_ms: sv.time_ms,
    penalty: sv.penalty,
    scramble: sv.scramble,
    comment: sv.comment || "",
    solved_at: sv.solved_at,
  }));

  const { error: svErr } = await supabase
    .from("solves")
    .upsert(solvesPayload, { onConflict: "id" });
  if (svErr) return { count: 0, error: svErr.message };

  await saveGuestMobileSessions([createDefaultSession()]);
  await saveGuestMobileSolves([]);
  return { count: solvesPayload.length };
}
