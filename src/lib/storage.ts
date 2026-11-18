import {
  CubeSession,
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

export function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// LocalStorage Helpers (Guest Mode & User Preferences)
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
  localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify(sessions));
}

export function saveGuestSolves(solves: Solve[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_SOLVES_KEY, JSON.stringify(solves));
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
// Supabase Cloud DB Operations
// ============================================================================

export async function fetchCloudData(userId: string): Promise<{
  sessions: CubeSession[];
  solves: Solve[];
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { sessions: [], solves: [], error: "Supabase chưa được cấu hình" };
  }

  const [sessionsRes, solvesRes] = await Promise.all([
    supabase
      .from("cube_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("solves")
      .select("*")
      .eq("user_id", userId)
      .order("solved_at", { ascending: true }),
  ]);

  if (sessionsRes.error) {
    return { sessions: [], solves: [], error: sessionsRes.error.message };
  }
  if (solvesRes.error) {
    return { sessions: [], solves: [], error: solvesRes.error.message };
  }

  let sessions = (sessionsRes.data ?? []) as CubeSession[];
  const solves = (solvesRes.data ?? []) as Solve[];

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

  return { sessions, solves };
}

export async function cloudInsertSession(
  userId: string,
  session: CubeSession
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { error } = await supabase.from("cube_sessions").insert({
    id: session.id,
    user_id: userId,
    name: session.name,
    puzzle: session.puzzle,
    created_at: session.created_at,
  });
  return error ? error.message : null;
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
  return error ? error.message : null;
}

export async function cloudInsertSolve(
  userId: string,
  solve: Solve
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { error } = await supabase.from("solves").insert({
    id: solve.id,
    user_id: userId,
    session_id: solve.session_id,
    puzzle: solve.puzzle,
    time_ms: solve.time_ms,
    penalty: solve.penalty,
    scramble: solve.scramble,
    comment: solve.comment,
    solved_at: solve.solved_at,
  });
  return error ? error.message : null;
}

export async function cloudUpdateSolve(
  userId: string,
  solveId: string,
  updates: Partial<Pick<Solve, "penalty" | "comment" | "time_ms">>
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
  return error ? error.message : null;
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

/**
 * Syncs Guest Mode localStorage sessions & solves into the authenticated user's Cloud DB.
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
  if (guestSolves.length === 0) {
    return { syncedSolves: 0 };
  }

  // Only upload guest sessions that actually contain solves
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

  const solvesPayload = guestSolves.map((sv) => ({
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

  if (svErr) {
    return { syncedSolves: 0, error: svErr.message };
  }

  clearGuestSolvesAfterSync();
  return { syncedSolves: solvesPayload.length };
}

// ============================================================================
// Export / Import Backup Utilities (JSON & CSV)
// ============================================================================

export function exportDataAsJson(
  sessions: CubeSession[],
  solves: Solve[]
): string {
  return JSON.stringify(
    {
      app: "RukTimer",
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions,
      solves,
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
      escapeCsv(s.solved_at),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

export function parseImportedJson(raw: string): {
  sessions: CubeSession[];
  solves: Solve[];
} | null {
  try {
    const parsed = JSON.parse(raw);
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
          solved_at: sv.solved_at || new Date().toISOString(),
        }));

      return { sessions: validSessions, solves: validSolves };
    }
    return null;
  } catch {
    return null;
  }
}
