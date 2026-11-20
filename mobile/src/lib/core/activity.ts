// Calendar/activity rules shared by Header, Coach, weekly report and Expo.
//
// Conventions (see IMPLEMENTATION_PLAN.md D3/D4):
//  - A "day" is the calendar date in the user's IANA time zone (DST-safe, via Intl).
//  - Weeks start on Monday.
//  - Activity & streak count EVERY recorded attempt (OK, +2, DNF, any puzzle, CFOP drill),
//    de-duplicated by solve id.
//  - Weekly performance stats (mean / best / sigma) only use VALID solves of regular
//    sessions (CFOP drill sessions are excluded because setup times are not comparable).

import { getEffectiveMs } from "./solveMath";
import type { SolveLike } from "./types";

export type ActivitySolve = Pick<
  SolveLike,
  "id" | "session_id" | "puzzle" | "time_ms" | "penalty" | "solved_at"
> & Partial<Pick<SolveLike, "scramble">>;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function getFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

/** `YYYY-MM-DD` of an instant in the given time zone. */
export function dayKey(input: number | string | Date, tz: string): string {
  const d = input instanceof Date ? input : new Date(input);
  const parts = getFormatter(tz).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole-day index of a `YYYY-MM-DD` key (days since 1970-01-01, calendar based, DST-free). */
export function dayIndex(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function addDays(key: string, n: number): string {
  return new Date((dayIndex(key) + n) * 86400000).toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6. */
export function weekdayMon0(key: string): number {
  return (new Date(dayIndex(key) * 86400000).getUTCDay() + 6) % 7;
}

export function weekStartKey(key: string): string {
  return addDays(key, -weekdayMon0(key));
}

export interface ActivityOptions {
  tz: string;
  now: number | Date;
  heatmapDays?: number;
}

export interface ActivityResult {
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  activeDaysCount: number;
  heatmapDays: { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }[];
}

function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count < 10) return 1;
  if (count < 30) return 2;
  if (count < 60) return 3;
  return 4;
}

export function countByDay(
  solves: ActivitySolve[],
  tz: string
): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const s of solves) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const t = new Date(s.solved_at).getTime();
    if (Number.isNaN(t)) continue;
    const k = dayKey(t, tz);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

export function computeActivity(
  solves: ActivitySolve[],
  opts: ActivityOptions
): ActivityResult {
  const { tz } = opts;
  const heatmapLen = opts.heatmapDays ?? 84;
  const counts = countByDay(solves, tz);
  const today = dayKey(opts.now, tz);
  const todayCount = counts.get(today) || 0;

  // Current streak: today counts if practised; otherwise the streak is still alive
  // through yesterday (the user has until the end of today to continue it).
  let cursor = todayCount > 0 ? today : addDays(today, -1);
  let currentStreak = 0;
  while ((counts.get(cursor) || 0) > 0) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  const keys = [...counts.keys()].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of keys) {
    const idx = dayIndex(k);
    run = prev !== null && idx - prev === 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = idx;
  }

  const heatmapDays: ActivityResult["heatmapDays"] = [];
  for (let i = heatmapLen - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    const c = counts.get(k) || 0;
    heatmapDays.push({ date: k, count: c, level: levelFor(c) });
  }

  return {
    currentStreak,
    longestStreak,
    todayCount,
    activeDaysCount: counts.size,
    heatmapDays,
  };
}

export interface WeekStats {
  practiceCount: number; // every attempt (activity)
  mainCount: number; // attempts in regular sessions
  validCount: number; // valid (non-DNF) attempts in regular sessions
  dnfCount: number;
  meanMs: number | null;
  bestSingleMs: number | null;
  stdDevMs: number | null;
}

export interface WeeklyReport {
  weekStart: string; // Monday of the current week
  today: string;
  elapsedDays: number; // 1..7 (days of the current week elapsed, including today)
  thisWeek: WeekStats;
  lastWeekToDate: WeekStats; // previous week, same elapsed days (fair comparison)
  lastWeekFull: WeekStats;
  meanDeltaPct: number | null; // negative = faster
  isCurrentWeekComplete: boolean; // false until Sunday ends
}

function statsFor(solves: ActivitySolve[], isDrill: (solve: ActivitySolve) => boolean): WeekStats {
  const mainValid: number[] = [];
  let main = 0;
  let dnf = 0;
  for (const s of solves) {
    if (isDrill(s)) continue;
    main++;
    const eff = getEffectiveMs(s);
    if (eff === "DNF") dnf++;
    else mainValid.push(eff);
  }
  const mean = mainValid.length
    ? Math.round(mainValid.reduce((a, b) => a + b, 0) / mainValid.length)
    : null;
  let std: number | null = null;
  if (mainValid.length >= 2 && mean !== null) {
    const variance =
      mainValid.reduce((a, v) => a + (v - mean) ** 2, 0) / mainValid.length;
    std = Math.round(Math.sqrt(variance));
  }
  return {
    practiceCount: solves.length,
    mainCount: main,
    validCount: mainValid.length,
    dnfCount: dnf,
    meanMs: mean,
    bestSingleMs: mainValid.length ? Math.min(...mainValid) : null,
    stdDevMs: std,
  };
}

export function computeWeeklyReport(
  solves: ActivitySolve[],
  opts: ActivityOptions & { drillSessionIds?: Set<string> }
): WeeklyReport {
  const { tz } = opts;
  const drill = opts.drillSessionIds ?? new Set<string>();
  const today = dayKey(opts.now, tz);
  const thisStart = weekStartKey(today);
  const elapsed = dayIndex(today) - dayIndex(thisStart) + 1;
  const lastStart = addDays(thisStart, -7);
  const lastToDateEndExclusive = addDays(lastStart, elapsed);

  const seen = new Set<string>();
  const thisWeek: ActivitySolve[] = [];
  const lastToDate: ActivitySolve[] = [];
  const lastFull: ActivitySolve[] = [];

  for (const s of solves) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const t = new Date(s.solved_at).getTime();
    if (Number.isNaN(t)) continue;
    const k = dayKey(t, tz);
    if (k >= thisStart && k <= today) thisWeek.push(s);
    else if (k >= lastStart && k < thisStart) {
      lastFull.push(s);
      if (k < lastToDateEndExclusive) lastToDate.push(s);
    }
  }

  const isDrill = (solve: ActivitySolve) => drill.has(solve.session_id);
  const a = statsFor(thisWeek, isDrill);
  const b = statsFor(lastToDate, isDrill);
  const meanDeltaPct =
    a.meanMs !== null && b.meanMs !== null && b.meanMs > 0
      ? Number((((a.meanMs - b.meanMs) / b.meanMs) * 100).toFixed(1))
      : null;

  return {
    weekStart: thisStart,
    today,
    elapsedDays: elapsed,
    thisWeek: a,
    lastWeekToDate: b,
    lastWeekFull: statsFor(lastFull, isDrill),
    meanDeltaPct,
    isCurrentWeekComplete: false,
  };
}

export function computePracticePeriod(
  solves: ActivitySolve[],
  opts: { tz: string; now: number; days: number; drillSessionIds: Set<string> },
) {
  const end = dayKey(opts.now, opts.tz);
  const start = addDays(end, 1 - opts.days);
  const previousStart = addDays(start, -opts.days);
  const days = Array.from({ length: opts.days }, (_, i) => ({ date: addDays(start, i), count: 0 }));
  const current: ActivitySolve[] = [];
  const previous: ActivitySolve[] = [];
  const seen = new Set<string>();
  // Built-in 3x3 training subsets prefix their setup with z2. Standard generated scrambles do not.
  const isDrill = (solve: ActivitySolve) => opts.drillSessionIds.has(solve.session_id)
    || (solve.puzzle === "3x3" && /^z2(?:\s|$)/i.test(solve.scramble?.trim() ?? ""));
  for (const solve of solves) {
    const at = Date.parse(solve.solved_at);
    if (seen.has(solve.id) || !Number.isFinite(at)) continue;
    seen.add(solve.id);
    const date = dayKey(at, opts.tz);
    if (date >= start && date <= end) {
      current.push(solve);
      if (!isDrill(solve)) days[dayIndex(date) - dayIndex(start)].count++;
    } else if (date >= previousStart && date < start) {
      previous.push(solve);
    }
  }
  return { start, end, days, current: statsFor(current, isDrill), previous: statsFor(previous, isDrill) };
}
