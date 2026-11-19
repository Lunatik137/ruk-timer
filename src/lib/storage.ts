import {
  CfopProgressItem,
  CubeSession,
  DEFAULT_SETTINGS,
  Solve,
  TimerSettings,
} from "@/types/cubing";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  cacheKeyForUser,
  enqueueUserMutation,
  flushUserOutbox,
  loadUserOutbox,
  type KeyValueStore,
  type OutboxExecutorResult,
  type OutboxItem,
} from "@/lib/core/outbox";
import {
  exportBackupJsonV3,
  exportSolvesCsvV2,
  parseBackup,
  planImport,
  type ImportPlan,
  type ParsedBackup,
} from "@/lib/core/backup";

export type { ImportPlan, ParsedBackup, OutboxItem };
export { parseBackup, planImport };

const LS_SESSIONS_KEY = "ruktimer_guest_sessions_v1";
const LS_SOLVES_KEY = "ruktimer_guest_solves_v1";
const LS_ACTIVE_SESSION_KEY = "ruktimer_active_session_v1";
const LS_SETTINGS_KEY = "ruktimer_settings_v1";
const LS_CFOP_PROGRESS_KEY = "ruktimer_cfop_progress_v2";
const LS_LEGACY_LEARNED_CFOP_KEY = "ruktimer_cfop_learned_v1";
const LS_CFOP_PRACTICE_SET_KEY = "ruktimer_cfop_practice_set_v1";
const LS_GUIDED_WORKOUT_KEY = "ruktimer_guided_workout_v1";

const browserStore: KeyValueStore = {
  getItem: (key) => (typeof window !== "undefined" ? localStorage.getItem(key) : null),
  setItem: (key, value) => {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window !== "undefined") localStorage.removeItem(key);
  },
};

export function generateUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// LocalStorage Helpers (Guest Mode, Settings, Practice Set & Per-User Cache)
// ============================================================================

export function loadLocalSettings(): TimerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveLocalSettings(settings: TimerSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}

export function loadActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_ACTIVE_SESSION_KEY);
}

export function saveActiveSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_ACTIVE_SESSION_KEY, id);
}

export function createDefaultSession(): CubeSession {
  return {
    id: generateUuid(),
    name: "Session 1",
    puzzle: "3x3",
    created_at: new Date().toISOString(),
  };
}

export function loadGuestData(): {
  sessions: CubeSession[];
  solves: Solve[];
} {
  if (typeof window === "undefined") {
    return { sessions: [createDefaultSession()], solves: [] };
  }
  try {
    const rawSessions = localStorage.getItem(LS_SESSIONS_KEY);
    const rawSolves = localStorage.getItem(LS_SOLVES_KEY);
    let sessions: CubeSession[] = rawSessions ? JSON.parse(rawSessions) : [];
    const solves: Solve[] = rawSolves ? JSON.parse(rawSolves) : [];

    if (sessions.length === 0) {
      const def = createDefaultSession();
      sessions = [def];
      localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify(sessions));
    }

    return { sessions, solves };
  } catch {
    const def = createDefaultSession();
    return { sessions: [def], solves: [] };
  }
}

export function saveGuestSessions(sessions: CubeSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

export function saveGuestSolves(solves: Solve[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_SOLVES_KEY, JSON.stringify(solves));
  } catch {
    // ignore
  }
}

export function getGuestSolveCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const rawSolves = localStorage.getItem(LS_SOLVES_KEY);
    if (!rawSolves) return 0;
    const arr = JSON.parse(rawSolves);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

export function clearGuestSolvesAfterSync(): void {
  if (typeof window === "undefined") return;
  const freshSession = createDefaultSession();
  localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify([freshSession]));
  localStorage.setItem(LS_SOLVES_KEY, JSON.stringify([]));
}

export interface UserLocalCache {
  sessions: CubeSession[];
  solves: Solve[];
  cfopProgress: Record<string, CfopProgressItem>;
  practiceSetIds: string[];
  updatedAt: string;
}

export function loadUserLocalCache(userId: string): UserLocalCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKeyForUser(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserLocalCache>;
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

export function saveUserLocalCache(
  userId: string,
  cache: Omit<UserLocalCache, "updatedAt">
): void {
  if (typeof window === "undefined") return;
  try {
    const data: UserLocalCache = {
      ...cache,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(cacheKeyForUser(userId), JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

export function loadLocalPracticeSet(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_CFOP_PRACTICE_SET_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? Array.from(new Set(arr.filter((x): x is string => typeof x === "string")))
      : [];
  } catch {
    return [];
  }
}

export function saveLocalPracticeSet(algIds: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const unique = Array.from(new Set(algIds));
    localStorage.setItem(LS_CFOP_PRACTICE_SET_KEY, JSON.stringify(unique));
  } catch {
    // ignore
  }
}

export function loadGuidedWorkoutRaw(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_GUIDED_WORKOUT_KEY);
}

export function saveGuidedWorkoutRaw(json: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (json === null) localStorage.removeItem(LS_GUIDED_WORKOUT_KEY);
    else localStorage.setItem(LS_GUIDED_WORKOUT_KEY, json);
  } catch {
    // ignore
  }
}

// ============================================================================
// CFOP Progress & Spaced Repetition (SM-2) Storage (Local + Cloud)
// ============================================================================

export function loadLocalCfopProgress(): Record<string, CfopProgressItem> {
  if (typeof window === "undefined") return {};
  try {
    const rawV2 = localStorage.getItem(LS_CFOP_PROGRESS_KEY);
    const map: Record<string, CfopProgressItem> = rawV2
      ? JSON.parse(rawV2)
      : {};

    const rawV1 = localStorage.getItem(LS_LEGACY_LEARNED_CFOP_KEY);
    if (rawV1) {
      const legacyIds = JSON.parse(rawV1);
      if (Array.isArray(legacyIds)) {
        const nowIso = new Date().toISOString();
        let migrated = false;
        for (const id of legacyIds) {
          if (typeof id === "string" && !map[id]) {
            map[id] = {
              alg_id: id,
              status: "learned",
              ease_factor: 2.5,
              interval_days: 3,
              repetitions: 1,
              next_review_at: nowIso,
              updated_at: nowIso,
            };
            migrated = true;
          }
        }
        if (migrated) {
          localStorage.setItem(LS_CFOP_PROGRESS_KEY, JSON.stringify(map));
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function saveLocalCfopProgress(
  progressMap: Record<string, CfopProgressItem>
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_CFOP_PROGRESS_KEY, JSON.stringify(progressMap));
    const learnedIds = Object.values(progressMap)
      .filter((p) => p.status === "learned" || p.status === "mastered")
      .map((p) => p.alg_id);
    localStorage.setItem(
      LS_LEGACY_LEARNED_CFOP_KEY,
      JSON.stringify(learnedIds)
    );
  } catch {
    // ignore
  }
}

// ============================================================================
// Per-Account Durable Offline Outbox (Write-Ahead + Dependency Ordered)
// ============================================================================

export async function getPendingOutboxCount(
  userId: string | null
): Promise<number> {
  if (!userId) return 0;
  const list = await loadUserOutbox(browserStore, userId);
  return list.length;
}

async function executeSupabaseOutboxItem(
  userId: string,
  item: OutboxItem
): Promise<OutboxExecutorResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Supabase chưa được cấu hình" };

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

  if (item.type === "clear_session") {
    const { error } = await supabase
      .from("solves")
      .delete()
      .eq("session_id", String(item.entityId))
      .eq("user_id", userId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  if (item.type === "upsert_solve") {
    const full = { ...item.payload, user_id: userId };
    const { error } = await supabase
      .from("solves")
      .upsert(full, { onConflict: "id" });
    if (
      error &&
      (error.message.includes("splits_ms") ||
        error.message.includes("reconstruction"))
    ) {
      const stripped: Record<string, unknown> = { ...full };
      delete stripped.splits_ms;
      delete stripped.reconstruction;
      const retry = await supabase
        .from("solves")
        .upsert(stripped, { onConflict: "id" });
      return retry.error
        ? { ok: false, error: retry.error.message }
        : { ok: true };
    }
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
      .upsert({ ...item.payload, user_id: userId }, { onConflict: "user_id,alg_id" });
    if (error && error.message.includes("cfop_progress")) {
      return { ok: true };
    }
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

  if (item.type === "upsert_settings") {
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        settings: item.payload.settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error && error.message.includes("user_settings")) {
      return { ok: true };
    }
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  return { ok: true };
}

export async function flushSyncOutbox(userId: string): Promise<{
  flushedCount: number;
  remainingCount: number;
}> {
  const res = await flushUserOutbox(
    browserStore,
    userId,
    executeSupabaseOutboxItem
  );
  return {
    flushedCount: res.flushedCount,
    remainingCount: res.remainingCount,
  };
}

async function writeAheadAndFlush(
  userId: string,
  mutation: Parameters<typeof enqueueUserMutation>[2]
): Promise<{ queued: number; error: string | null }> {
  await enqueueUserMutation(browserStore, userId, mutation);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const remaining = await getPendingOutboxCount(userId);
    return { queued: remaining, error: "Đang ngoại tuyến — đã xếp hàng đồng bộ" };
  }
  const res = await flushSyncOutbox(userId);
  return {
    queued: res.remainingCount,
    error: res.remainingCount > 0 ? "Chờ đồng bộ lên Cloud" : null,
  };
}

// ============================================================================
// Supabase Cloud DB Operations (Paginated + Write-Ahead Outbox)
// ============================================================================

export async function fetchCloudData(userId: string): Promise<{
  sessions: CubeSession[];
  solves: Solve[];
  cfopProgress?: Record<string, CfopProgressItem>;
  practiceSetIds?: string[];
  remoteSettings?: Partial<TimerSettings>;
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { sessions: [], solves: [], error: "Supabase chưa được cấu hình" };
  }

  // Flush any pending local mutations first so cloud reflects latest offline work
  await flushSyncOutbox(userId);

  const sessionsRes = await supabase
    .from("cube_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (sessionsRes.error) {
    return { sessions: [], solves: [], error: sessionsRes.error.message };
  }

  const allSolves: Solve[] = [];
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
    allSolves.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  let sessions = (sessionsRes.data ?? []) as CubeSession[];

  if (sessions.length === 0) {
    const newSession: CubeSession = {
      id: generateUuid(),
      user_id: userId,
      name: "Session 1",
      puzzle: "3x3",
      created_at: new Date().toISOString(),
    };
    const { error: insertErr } = await supabase
      .from("cube_sessions")
      .insert(newSession);
    if (!insertErr) {
      sessions = [newSession];
    } else {
      return { sessions: [], solves: [], error: insertErr.message };
    }
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

  let remoteSettings: Partial<TimerSettings> | undefined;
  try {
    const setRes = await supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle();
    if (!setRes.error && setRes.data?.settings) {
      remoteSettings = setRes.data.settings as Partial<TimerSettings>;
    }
  } catch {
    // non-fatal
  }

  return {
    sessions,
    solves: allSolves,
    cfopProgress,
    practiceSetIds,
    remoteSettings,
  };
}

export async function cloudInsertSession(
  userId: string,
  session: CubeSession
): Promise<string | null> {
  const res = await writeAheadAndFlush(userId, {
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
  return res.error;
}

export async function cloudUpdateSession(
  userId: string,
  session: CubeSession
): Promise<string | null> {
  const res = await writeAheadAndFlush(userId, {
    type: "upsert_session",
    entityId: session.id,
    payload: {
      id: session.id,
      user_id: userId,
      name: session.name,
      puzzle: session.puzzle,
      created_at: session.created_at,
      updated_at: new Date().toISOString(),
    },
  });
  return res.error;
}

export async function cloudDeleteSession(
  userId: string,
  sessionId: string
): Promise<string | null> {
  const res = await writeAheadAndFlush(userId, {
    type: "delete_session",
    entityId: sessionId,
    payload: { id: sessionId, user_id: userId },
  });
  return res.error;
}

export async function cloudInsertSolve(
  userId: string,
  solve: Solve
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    id: solve.id,
    user_id: userId,
    session_id: solve.session_id,
    puzzle: solve.puzzle,
    time_ms: solve.time_ms,
    penalty: solve.penalty,
    scramble: solve.scramble,
    comment: solve.comment,
    solved_at: solve.solved_at,
  };
  if (solve.splits_ms) payload.splits_ms = solve.splits_ms;
  if (solve.reconstruction) payload.reconstruction = solve.reconstruction;

  const res = await writeAheadAndFlush(userId, {
    type: "upsert_solve",
    entityId: solve.id,
    sessionId: solve.session_id,
    payload,
  });
  return res.error;
}

export async function cloudUpdateSolve(
  userId: string,
  solveId: string,
  updates: Partial<
    Pick<Solve, "penalty" | "comment" | "time_ms" | "reconstruction">
  >,
  sessionId?: string
): Promise<string | null> {
  const res = await writeAheadAndFlush(userId, {
    type: "patch_solve",
    entityId: solveId,
    sessionId,
    payload: updates as Record<string, unknown>,
  });
  return res.error;
}

export async function cloudDeleteSolve(
  userId: string,
  solveId: string,
  sessionId?: string
): Promise<string | null> {
  const res = await writeAheadAndFlush(userId, {
    type: "delete_solve",
    entityId: solveId,
    sessionId,
    payload: { id: solveId, user_id: userId },
  });
  return res.error;
}

export async function cloudClearSessionSolves(
  userId: string,
  sessionId: string
): Promise<string | null> {
  const res = await writeAheadAndFlush(userId, {
    type: "clear_session",
    entityId: sessionId,
    sessionId,
    payload: { session_id: sessionId, user_id: userId },
  });
  return res.error;
}

export async function cloudUpsertCfopProgress(
  userId: string,
  item: CfopProgressItem
): Promise<string | null> {
  const res = await writeAheadAndFlush(userId, {
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
  return res.error;
}

export async function cloudSavePracticeSet(
  userId: string,
  algIds: string[]
): Promise<string | null> {
  const res = await writeAheadAndFlush(userId, {
    type: "upsert_practice_set",
    entityId: userId,
    payload: {
      alg_ids: Array.from(new Set(algIds)),
      updated_at: new Date().toISOString(),
    },
  });
  return res.error;
}

export async function cloudSaveUserSettings(
  userId: string,
  settings: TimerSettings
): Promise<void> {
  await writeAheadAndFlush(userId, {
    type: "upsert_settings",
    entityId: userId,
    payload: { settings },
  });
}

/**
 * Syncs Guest Mode localStorage sessions, solves, CFOP progress & practice set
 * into the authenticated user's Cloud DB (preserving splits_ms & reconstruction).
 */
export async function syncGuestToCloud(userId: string): Promise<{
  syncedSolves: number;
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { syncedSolves: 0, error: "Supabase chưa được cấu hình" };
  }

  const { sessions: guestSessions, solves: guestSolves } = loadGuestData();
  const localCfop = loadLocalCfopProgress();
  const localPracticeSet = loadLocalPracticeSet();

  const cfopItems = Object.values(localCfop);
  if (cfopItems.length > 0) {
    try {
      const cfopPayload = cfopItems.map((item) => ({
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
      }));
      await supabase
        .from("cfop_progress")
        .upsert(cfopPayload, { onConflict: "user_id,alg_id" });
    } catch {
      // ignore if table not migrated yet
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
      // ignore if table not migrated yet
    }
  }

  if (guestSolves.length === 0) {
    return { syncedSolves: 0 };
  }

  const usedSessionIds = new Set(guestSolves.map((s) => s.session_id));
  const sessionsToUpsert = guestSessions
    .filter((s) => usedSessionIds.has(s.id))
    .map((s) => ({
      id: s.id,
      user_id: userId,
      name: s.name === "Session 1" ? "Guest Imported" : s.name,
      puzzle: s.puzzle,
      created_at: s.created_at,
    }));

  if (sessionsToUpsert.length > 0) {
    const { error: sErr } = await supabase
      .from("cube_sessions")
      .upsert(sessionsToUpsert, { onConflict: "id" });
    if (sErr) {
      return { syncedSolves: 0, error: sErr.message };
    }
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < guestSolves.length; i += CHUNK_SIZE) {
    const chunk = guestSolves.slice(i, i + CHUNK_SIZE).map((sv) => {
      const row: Record<string, unknown> = {
        id: sv.id,
        user_id: userId,
        session_id: sv.session_id,
        puzzle: sv.puzzle,
        time_ms: sv.time_ms,
        penalty: sv.penalty,
        scramble: sv.scramble,
        comment: sv.comment || "",
        solved_at: sv.solved_at,
      };
      if (sv.splits_ms) row.splits_ms = sv.splits_ms;
      if (sv.reconstruction) row.reconstruction = sv.reconstruction;
      return row;
    });

    const { error: svErr } = await supabase
      .from("solves")
      .upsert(chunk, { onConflict: "id" });

    if (svErr) {
      return { syncedSolves: i, error: svErr.message };
    }
  }

  clearGuestSolvesAfterSync();
  return { syncedSolves: guestSolves.length };
}

// ============================================================================
// Universal Export / Import Utilities (RukTimer v3 JSON, csTimer, Twisty CSV)
// ============================================================================

export function exportDataAsJson(
  sessions: CubeSession[],
  solves: Solve[],
  cfopProgress?: Record<string, CfopProgressItem>,
  practiceSetIds?: string[]
): string {
  return exportBackupJsonV3({
    sessions,
    solves,
    cfopProgress: cfopProgress ?? loadLocalCfopProgress(),
    practiceSetIds: practiceSetIds ?? loadLocalPracticeSet(),
  });
}

export function exportSolvesAsCsv(
  solves: Solve[],
  sessionsMap: Map<string, string>
): string {
  return exportSolvesCsvV2(solves, sessionsMap);
}
