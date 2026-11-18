import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import {
  CubeSession,
  DEFAULT_MOBILE_SETTINGS,
  MobileSettings,
  Solve,
} from "../types/cubing";

const AS_SESSIONS_KEY = "ruktimer_mobile_guest_sessions_v1";
const AS_SOLVES_KEY = "ruktimer_mobile_guest_solves_v1";
const AS_SETTINGS_KEY = "ruktimer_mobile_settings_v1";

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
    return raw ? { ...DEFAULT_MOBILE_SETTINGS, ...JSON.parse(raw) } : DEFAULT_MOBILE_SETTINGS;
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

export async function saveGuestMobileSessions(sessions: CubeSession[]): Promise<void> {
  await AsyncStorage.setItem(AS_SESSIONS_KEY, JSON.stringify(sessions));
}

export async function saveGuestMobileSolves(solves: Solve[]): Promise<void> {
  await AsyncStorage.setItem(AS_SOLVES_KEY, JSON.stringify(solves));
}

export async function fetchCloudMobileData(userId: string): Promise<{
  sessions: CubeSession[];
  solves: Solve[];
  error?: string;
}> {
  const sessionsRes = await supabase
    .from("cube_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (sessionsRes.error) {
    return { sessions: [], solves: [], error: sessionsRes.error.message };
  }

  // Paginated fetch of ALL solves (>1,000 rows support)
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

  return { sessions, solves };
}

export async function syncGuestMobileToCloud(userId: string): Promise<{
  count: number;
  error?: string;
}> {
  const { sessions, solves } = await loadGuestMobileData();
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
