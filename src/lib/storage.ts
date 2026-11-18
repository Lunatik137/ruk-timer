import {
  CfopProgressItem,
  CubeSession,
  DailySubmissionRecord,
  DEFAULT_SETTINGS,
  PenaltyType,
  PuzzleType,
  Solve,
  TimerSettings,
} from "@/types/cubing";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const LS_SESSIONS_KEY = "ruktimer_guest_sessions_v1";
const LS_SOLVES_KEY = "ruktimer_guest_solves_v1";
const LS_ACTIVE_SESSION_KEY = "ruktimer_active_session_v1";
const LS_SETTINGS_KEY = "ruktimer_settings_v1";
const LS_CFOP_PROGRESS_KEY = "ruktimer_cfop_progress_v2";
const LS_LEGACY_LEARNED_CFOP_KEY = "ruktimer_cfop_learned_v1";
const LS_OUTBOX_KEY = "ruktimer_sync_outbox_v1";
const LS_DAILY_LOCAL_KEY = "ruktimer_daily_submissions_v1";

export interface OutboxMutation {
  id: string;
  type:
    | "upsert_session"
    | "delete_session"
    | "upsert_solve"
    | "delete_solve"
    | "clear_session"
    | "upsert_cfop";
  payload: Record<string, unknown>;
  createdAt: string;
}

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
// LocalStorage Helpers (Guest Mode, Offline Outbox & User Preferences)
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

    // Migrate legacy v1 array (`ruktimer_cfop_learned_v1`) if present
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
    // Keep legacy key in sync for backward compatibility
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
// Offline Outbox Queue Helpers
// ============================================================================

export function loadSyncOutbox(): OutboxMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSyncOutbox(queue: OutboxMutation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_OUTBOX_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export function enqueueOutboxMutation(
  type: OutboxMutation["type"],
  payload: Record<string, unknown>
): void {
  const queue = loadSyncOutbox();
  queue.push({
    id: generateUuid(),
    type,
    payload,
    createdAt: new Date().toISOString(),
  });
  saveSyncOutbox(queue);
}

// ============================================================================
// Supabase Cloud DB Operations (Paginated >1,000 Rows + Resilient Fallbacks)
// ============================================================================

export async function fetchCloudData(userId: string): Promise<{
  sessions: CubeSession[];
  solves: Solve[];
  cfopProgress?: Record<string, CfopProgressItem>;
  remoteSettings?: Partial<TimerSettings>;
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { sessions: [], solves: [], error: "Supabase chưa được cấu hình" };
  }

  // 1. Fetch sessions
  const sessionsRes = await supabase
    .from("cube_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (sessionsRes.error) {
    return { sessions: [], solves: [], error: sessionsRes.error.message };
  }

  // 2. Paginated fetch of ALL solves (batches of 1,000 rows to overcome PostgREST default limit)
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

  // If brand-new account has no session yet, create Session 1 in Cloud DB
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

  // 3. Optionally fetch cfop_progress & user_settings (non-blocking if tables are not migrated yet)
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
    // Table may not exist yet on older deployments
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
    // Ignore if table not created yet
  }

  return {
    sessions,
    solves: allSolves,
    cfopProgress,
    remoteSettings,
  };
}

export async function cloudInsertSession(
  userId: string,
  session: CubeSession
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const payload = {
    id: session.id,
    user_id: userId,
    name: session.name,
    puzzle: session.puzzle,
    created_at: session.created_at,
  };
  const { error } = await supabase
    .from("cube_sessions")
    .upsert(payload, { onConflict: "id" });
  if (error) {
    enqueueOutboxMutation("upsert_session", payload);
    return error.message;
  }
  return null;
}

export async function cloudUpdateSession(
  userId: string,
  sessionId: string,
  updates: Partial<Pick<CubeSession, "name" | "puzzle">>
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { error } = await supabase
    .from("cube_sessions")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
  return error ? error.message : null;
}

export async function cloudDeleteSession(
  userId: string,
  sessionId: string
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { error } = await supabase
    .from("cube_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) {
    enqueueOutboxMutation("delete_session", { id: sessionId, user_id: userId });
    return error.message;
  }
  return null;
}

export async function cloudInsertSolve(
  userId: string,
  solve: Solve
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const fullPayload: Record<string, unknown> = {
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
  if (solve.splits_ms) fullPayload.splits_ms = solve.splits_ms;
  if (solve.reconstruction) fullPayload.reconstruction = solve.reconstruction;

  const { error } = await supabase
    .from("solves")
    .upsert(fullPayload, { onConflict: "id" });

  if (error) {
    // Fallback if splits_ms or reconstruction columns haven't been migrated yet
    if (
      error.message.includes("splits_ms") ||
      error.message.includes("reconstruction")
    ) {
      const basePayload = {
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
      const retry = await supabase
        .from("solves")
        .upsert(basePayload, { onConflict: "id" });
      if (!retry.error) return null;
    }

    enqueueOutboxMutation("upsert_solve", fullPayload);
    return error.message;
  }
  return null;
}

export async function cloudUpdateSolve(
  userId: string,
  solveId: string,
  updates: Partial<
    Pick<Solve, "penalty" | "comment" | "time_ms" | "reconstruction">
  >
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { error } = await supabase
    .from("solves")
    .update(updates)
    .eq("id", solveId)
    .eq("user_id", userId);
  return error ? error.message : null;
}

export async function cloudDeleteSolve(
  userId: string,
  solveId: string
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { error } = await supabase
    .from("solves")
    .delete()
    .eq("id", solveId)
    .eq("user_id", userId);
  if (error) {
    enqueueOutboxMutation("delete_solve", { id: solveId, user_id: userId });
    return error.message;
  }
  return null;
}

export async function cloudClearSessionSolves(
  userId: string,
  sessionId: string
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { error } = await supabase
    .from("solves")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);
  return error ? error.message : null;
}

export async function cloudUpsertCfopProgress(
  userId: string,
  item: CfopProgressItem
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  try {
    const payload = {
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
    };
    const { error } = await supabase
      .from("cfop_progress")
      .upsert(payload, { onConflict: "user_id,alg_id" });
    if (error && !error.message.includes("cfop_progress")) {
      return error.message;
    }
    return null;
  } catch {
    return null;
  }
}

export async function cloudSaveUserSettings(
  userId: string,
  settings: TimerSettings
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  try {
    await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch {
    // non-fatal if table isn't created yet
  }
}

/**
 * Flushes any queued offline mutations once internet connectivity is restored.
 */
export async function flushSyncOutbox(userId: string): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return 0;
  const queue = loadSyncOutbox();
  if (queue.length === 0) return 0;

  const remaining: OutboxMutation[] = [];
  let flushed = 0;

  for (const item of queue) {
    try {
      if (item.type === "upsert_session") {
        const { error } = await supabase
          .from("cube_sessions")
          .upsert({ ...item.payload, user_id: userId }, { onConflict: "id" });
        if (error) remaining.push(item);
        else flushed++;
      } else if (item.type === "upsert_solve") {
        const { error } = await supabase
          .from("solves")
          .upsert({ ...item.payload, user_id: userId }, { onConflict: "id" });
        if (error) remaining.push(item);
        else flushed++;
      } else if (item.type === "delete_solve") {
        const { error } = await supabase
          .from("solves")
          .delete()
          .eq("id", String(item.payload.id))
          .eq("user_id", userId);
        if (error) remaining.push(item);
        else flushed++;
      } else if (item.type === "delete_session") {
        const { error } = await supabase
          .from("cube_sessions")
          .delete()
          .eq("id", String(item.payload.id))
          .eq("user_id", userId);
        if (error) remaining.push(item);
        else flushed++;
      }
    } catch {
      remaining.push(item);
    }
  }

  saveSyncOutbox(remaining);
  return flushed;
}

/**
 * Syncs Guest Mode localStorage sessions, solves, and CFOP progress into the authenticated user's Cloud DB.
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

  // Sync local CFOP progress in parallel if any exists
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

  // Upsert solves in chunks of 500 for large guest histories
  const CHUNK_SIZE = 500;
  for (let i = 0; i < guestSolves.length; i += CHUNK_SIZE) {
    const chunk = guestSolves.slice(i, i + CHUNK_SIZE).map((sv) => ({
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
      .upsert(chunk, { onConflict: "id" });

    if (svErr) {
      return { syncedSolves: i, error: svErr.message };
    }
  }

  clearGuestSolvesAfterSync();
  return { syncedSolves: guestSolves.length };
}

// ============================================================================
// Daily Challenge Leaderboard Storage (Cloud + Local Fallback)
// ============================================================================

export async function fetchDailyLeaderboard(
  challengeDate: string,
  puzzle: PuzzleType = "3x3"
): Promise<DailySubmissionRecord[]> {
  const localRaw =
    typeof window !== "undefined"
      ? localStorage.getItem(LS_DAILY_LOCAL_KEY)
      : null;
  const localList: DailySubmissionRecord[] = localRaw
    ? JSON.parse(localRaw)
    : [];
  const filteredLocal = localList.filter(
    (r) => r.challenge_date === challengeDate && r.puzzle === puzzle
  );

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return filteredLocal;

  try {
    const { data, error } = await supabase
      .from("daily_submissions")
      .select("*")
      .eq("challenge_date", challengeDate)
      .eq("puzzle", puzzle)
      .order("ao5_ms", { ascending: true, nullsFirst: false })
      .limit(50);

    if (!error && Array.isArray(data) && data.length > 0) {
      return data as DailySubmissionRecord[];
    }
  } catch {
    // Fallback to local
  }
  return filteredLocal;
}

export async function submitDailyChallengeRecord(
  userId: string | null,
  record: DailySubmissionRecord
): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LS_DAILY_LOCAL_KEY);
      const list: DailySubmissionRecord[] = raw ? JSON.parse(raw) : [];
      const next = [
        ...list.filter(
          (r) =>
            !(
              r.challenge_date === record.challenge_date &&
              r.puzzle === record.puzzle
            )
        ),
        record,
      ];
      localStorage.setItem(LS_DAILY_LOCAL_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  if (!userId) return;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  try {
    await supabase.from("daily_submissions").upsert(
      {
        user_id: userId,
        challenge_date: record.challenge_date,
        puzzle: record.puzzle,
        display_name: record.display_name,
        division: record.division,
        ao5_ms: record.ao5_ms,
        best_single_ms: record.best_single_ms,
        times_ms: record.times_ms,
        penalties: record.penalties,
      },
      { onConflict: "user_id,challenge_date,puzzle" }
    );
  } catch {
    // non-fatal
  }
}

// ============================================================================
// Universal Export / Import Utilities (RukTimer JSON, csTimer TXT/JSON, Twisty CSV)
// ============================================================================

export function exportDataAsJson(
  sessions: CubeSession[],
  solves: Solve[]
): string {
  return JSON.stringify(
    {
      app: "RukTimer",
      version: 2,
      exportedAt: new Date().toISOString(),
      sessions,
      solves,
      cfopProgress: loadLocalCfopProgress(),
    },
    null,
    2
  );
}

export function exportSolvesAsCsv(
  solves: Solve[],
  sessionsMap: Map<string, string>
): string {
  const header = [
    "No",
    "Session",
    "Puzzle",
    "Time(ms)",
    "Penalty",
    "Scramble",
    "Comment",
    "Splits(ms)",
    "SolvedAt",
  ].join(",");

  const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

  const rows = solves.map((s, idx) =>
    [
      idx + 1,
      escapeCsv(sessionsMap.get(s.session_id) || "Session"),
      escapeCsv(s.puzzle),
      s.time_ms,
      s.penalty,
      escapeCsv(s.scramble),
      escapeCsv(s.comment || ""),
      escapeCsv(s.splits_ms ? s.splits_ms.join("|") : ""),
      escapeCsv(s.solved_at),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

function mapCsTimerScrTypeToPuzzle(scrType?: string): PuzzleType {
  if (!scrType) return "3x3";
  const t = scrType.toLowerCase();
  if (t.includes("222")) return "2x2";
  if (t.includes("444")) return "4x4";
  if (t.includes("555")) return "5x5";
  if (t.includes("666")) return "6x6";
  if (t.includes("777")) return "7x7";
  if (t.includes("pyr")) return "pyraminx";
  if (t.includes("mgm")) return "megaminx";
  if (t.includes("skb")) return "skewb";
  if (t.includes("sq1") || t.includes("sqrs")) return "sq1";
  if (t.includes("clk") || t.includes("clkwca")) return "clock";
  if (t.includes("333ni") || t.includes("bld")) return "3x3bld";
  if (t.includes("333oh")) return "3x3oh";
  return "3x3";
}

/**
 * Universal parser that automatically detects and imports:
 * 1. RukTimer native JSON backup
 * 2. csTimer export (.txt / .json with `session1`, `session2`, `properties.sessionData`)
 * 3. Twisty Timer / CubeDesk / RukTimer CSV files
 */
export function parseUniversalImport(raw: string): {
  sourceFormat: "RukTimer JSON" | "csTimer" | "CSV";
  sessions: CubeSession[];
  solves: Solve[];
} | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Attempt JSON parsing (RukTimer or csTimer)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);

      // 1. Native RukTimer JSON
      if (Array.isArray(parsed.sessions) && Array.isArray(parsed.solves)) {
        const validSessions: CubeSession[] = parsed.sessions.map(
          (s: Partial<CubeSession>) => ({
            id: s.id || generateUuid(),
            name: String(s.name || "Imported Session"),
            puzzle: (s.puzzle as PuzzleType) || "3x3",
            created_at: s.created_at || new Date().toISOString(),
          })
        );

        const fallbackSessionId =
          validSessions[0]?.id || createDefaultSession().id;
        if (validSessions.length === 0) {
          validSessions.push({
            id: fallbackSessionId,
            name: "Imported Session",
            puzzle: "3x3",
            created_at: new Date().toISOString(),
          });
        }

        const validSolves: Solve[] = parsed.solves
          .filter((sv: Partial<Solve>) => typeof sv.time_ms === "number")
          .map((sv: Partial<Solve>) => ({
            id: sv.id || generateUuid(),
            session_id: sv.session_id || fallbackSessionId,
            puzzle: (sv.puzzle as PuzzleType) || "3x3",
            time_ms: Math.max(0, Math.round(Number(sv.time_ms))),
            penalty: (["OK", "+2", "DNF"].includes(String(sv.penalty))
              ? sv.penalty
              : "OK") as PenaltyType,
            scramble: String(sv.scramble || ""),
            comment: String(sv.comment || ""),
            splits_ms: Array.isArray(sv.splits_ms) ? sv.splits_ms : undefined,
            reconstruction: sv.reconstruction
              ? String(sv.reconstruction)
              : undefined,
            solved_at: sv.solved_at || new Date().toISOString(),
          }));

        if (parsed.cfopProgress && typeof parsed.cfopProgress === "object") {
          const curCfop = loadLocalCfopProgress();
          saveLocalCfopProgress({ ...curCfop, ...parsed.cfopProgress });
        }

        return {
          sourceFormat: "RukTimer JSON",
          sessions: validSessions,
          solves: validSolves,
        };
      }

      // 2. csTimer Export Format (`session1`, `session2`, ..., `properties.sessionData`)
      const sessionKeys = Object.keys(parsed).filter((k) =>
        /^session\d+$/.test(k)
      );
      if (sessionKeys.length > 0) {
        let sessionMetaMap: Record<
          string,
          { name?: string; opt?: { scrType?: string }; scrType?: string }
        > = {};
        if (parsed.properties?.sessionData) {
          try {
            sessionMetaMap =
              typeof parsed.properties.sessionData === "string"
                ? JSON.parse(parsed.properties.sessionData)
                : parsed.properties.sessionData;
          } catch {
            // ignore
          }
        }

        const importedSessions: CubeSession[] = [];
        const importedSolves: Solve[] = [];

        for (const key of sessionKeys) {
          const arr = parsed[key];
          if (!Array.isArray(arr) || arr.length === 0) continue;

          const idxStr = key.replace("session", "");
          const meta = sessionMetaMap[idxStr];
          const sName = meta?.name
            ? `csTimer • ${meta.name}`
            : `csTimer Session ${idxStr}`;
          const puzzle = mapCsTimerScrTypeToPuzzle(
            meta?.opt?.scrType || meta?.scrType
          );
          const sessionId = generateUuid();

          importedSessions.push({
            id: sessionId,
            name: sName,
            puzzle,
            created_at: new Date().toISOString(),
          });

          for (const item of arr) {
            // csTimer solve format: [[penaltyFlag, timeMs, ...splits], scramble, comment, unixSec]
            if (!Array.isArray(item) || !Array.isArray(item[0])) continue;
            const timeArr = item[0];
            const penFlag = Number(timeArr[0]);
            const rawMs = Math.max(10, Math.round(Number(timeArr[1] || 0)));
            const penalty: PenaltyType =
              penFlag === -1 ? "DNF" : penFlag === 2000 ? "+2" : "OK";
            const scramble = String(item[1] || "");
            const comment = String(item[2] || "");
            const unixSec = Number(item[3]);
            const solvedAt =
              !Number.isNaN(unixSec) && unixSec > 100000
                ? new Date(unixSec * 1000).toISOString()
                : new Date().toISOString();

            importedSolves.push({
              id: generateUuid(),
              session_id: sessionId,
              puzzle,
              time_ms: rawMs,
              penalty,
              scramble,
              comment,
              solved_at: solvedAt,
            });
          }
        }

        if (importedSessions.length > 0) {
          return {
            sourceFormat: "csTimer",
            sessions: importedSessions,
            solves: importedSolves,
          };
        }
      }
    } catch {
      return null;
    }
  }

  // 3. CSV Import (Twisty Timer / CubeDesk / RukTimer CSV)
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    const parseCsvLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if ((ch === "," || ch === ";") && !inQuotes) {
          out.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    };

    const sessionsByName = new Map<string, CubeSession>();
    const solves: Solve[] = [];
    const headerCols = parseCsvLine(lines[0]).map((c) => c.toLowerCase());
    const hasHeader =
      headerCols.some((c) => c.includes("time") || c.includes("scramble")) ||
      Number.isNaN(Number(headerCols[0]));

    const startRow = hasHeader ? 1 : 0;

    for (let i = startRow; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 2) continue;

      let sessionName = "CSV Imported";
      let puzzle: PuzzleType = "3x3";
      let timeMs = 0;
      let penalty: PenaltyType = "OK";
      let scramble = "";
      let comment = "";
      let solvedAt = new Date().toISOString();

      // RukTimer CSV format: No,Session,Puzzle,Time(ms),Penalty,Scramble,Comment,...
      if (
        headerCols[1] === "session" &&
        headerCols[3]?.includes("time") &&
        cols.length >= 6
      ) {
        sessionName = cols[1] || "CSV Imported";
        puzzle = (cols[2] as PuzzleType) || "3x3";
        timeMs = Math.round(Number(cols[3]));
        penalty = (["OK", "+2", "DNF"].includes(cols[4])
          ? cols[4]
          : "OK") as PenaltyType;
        scramble = cols[5] || "";
        comment = cols[6] || "";
        solvedAt = cols[8] || cols[7] || solvedAt;
      } else {
        // Twisty Timer CSV format: Puzzle,Category,Time(ms or s),Date,Scramble,Penalty,Comment OR Time;Scramble;Date
        const numericCol = cols.find((c) => /^\d+(\.\d+)?$/.test(c));
        if (!numericCol) continue;
        const val = Number(numericCol);
        timeMs = val < 600 && numericCol.includes(".") ? Math.round(val * 1000) : Math.round(val);
        scramble =
          cols.find((c) => /[RLUDFB]['2]?\s+[RLUDFB]/.test(c)) || cols[1] || "";
        if (cols.some((c) => c.toUpperCase() === "DNF" || c === "2")) {
          penalty = "DNF";
        } else if (cols.some((c) => c === "+2" || c === "1")) {
          penalty = "+2";
        }
      }

      if (Number.isNaN(timeMs) || timeMs <= 0) continue;

      let sess = sessionsByName.get(sessionName);
      if (!sess) {
        sess = {
          id: generateUuid(),
          name: sessionName,
          puzzle,
          created_at: new Date().toISOString(),
        };
        sessionsByName.set(sessionName, sess);
      }

      solves.push({
        id: generateUuid(),
        session_id: sess.id,
        puzzle: sess.puzzle,
        time_ms: timeMs,
        penalty,
        scramble,
        comment,
        solved_at: solvedAt,
      });
    }

    if (solves.length > 0) {
      return {
        sourceFormat: "CSV",
        sessions: [...sessionsByName.values()],
        solves,
      };
    }
  }

  return null;
}

export function parseImportedJson(raw: string): {
  sessions: CubeSession[];
  solves: Solve[];
} | null {
  const res = parseUniversalImport(raw);
  return res ? { sessions: res.sessions, solves: res.solves } : null;
}
