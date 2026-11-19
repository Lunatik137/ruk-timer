// Backup export, universal import parser (RukTimer v1/v2/v3, csTimer, Twisty/CSV),
// deterministic IDs and dry-run deduplication preview. Shared by web and Expo.

import type { CfopProgressItem, Penalty, SessionLike, SolveLike } from "./types";

export type BackupFormat = "RukTimer JSON" | "csTimer" | "CSV";

export interface ParsedBackup {
  sourceFormat: BackupFormat;
  sessions: SessionLike[];
  solves: SolveLike[];
  cfopProgress: Record<string, CfopProgressItem>;
  practiceSetIds: string[];
  invalidRowCount: number;
  warnings: string[];
}

export interface ImportPlan {
  sourceFormat: BackupFormat;
  newSessions: SessionLike[];
  existingSessionMatches: number;
  newSolves: SolveLike[];
  duplicateSolves: number;
  invalidRows: number;
  cfopProgressCount: number;
  practiceSetCount: number;
  warnings: string[];
  /** Merged state ready to apply (non-destructive merge). */
  mergedSessions: SessionLike[];
  mergedSolves: SolveLike[];
  mergedCfopProgress: Record<string, CfopProgressItem>;
  mergedPracticeSetIds: string[];
}

/**
 * Deterministic UUID-like v5-style ID derived from content (FNV-1a 128-bit split)
 * so re-importing csTimer or CSV files produces identical IDs and never duplicates solves.
 */
export function deterministicUuid(seed: string): string {
  const fnv = (str: string, init: number) => {
    let h = init >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  const a = fnv(`a:${seed}`, 2166136261);
  const b = fnv(`b:${seed}`, 2166136261 ^ 0x9e3779b9);
  const c = fnv(`c:${seed}`, 2166136261 ^ 0x85ebca6b);
  const d = fnv(`d:${seed}`, 2166136261 ^ 0xc2b2ae35);
  // Format as valid RFC4122 UUID v4-shaped hex string
  const part3 = "4" + b.slice(5, 8);
  const variantNibble = ((parseInt(c[0], 16) & 0x3) | 0x8).toString(16);
  const part4 = variantNibble + c.slice(1, 4);
  return `${a}-${b.slice(0, 4)}-${part3}-${part4}-${c.slice(4)}${d}`;
}

export function solveFingerprint(
  solve: Pick<
    SolveLike,
    "puzzle" | "time_ms" | "penalty" | "scramble" | "solved_at"
  >
): string {
  const sec = Math.floor(new Date(solve.solved_at).getTime() / 1000) || 0;
  return `${solve.puzzle}|${solve.time_ms}|${solve.penalty}|${solve.scramble.trim()}|${sec}`;
}

function mapCsTimerScrType(scrType?: string): string {
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

function sanitizeSplits(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const nums = raw
    .map((v) => Math.round(Number(v)))
    .filter((v) => Number.isFinite(v) && v >= 0);
  return nums.length > 0 ? nums : undefined;
}

export function exportBackupJsonV3(params: {
  sessions: SessionLike[];
  solves: SolveLike[];
  cfopProgress: Record<string, CfopProgressItem>;
  practiceSetIds: string[];
}): string {
  return JSON.stringify(
    {
      app: "RukTimer",
      version: 3,
      exportedAt: new Date().toISOString(),
      sessions: params.sessions,
      solves: params.solves,
      cfopProgress: params.cfopProgress,
      practiceSetIds: params.practiceSetIds,
    },
    null,
    2
  );
}

export function exportSolvesCsvV2(
  solves: SolveLike[],
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
    "Reconstruction",
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
      escapeCsv(s.splits_ms && s.splits_ms.length > 0 ? s.splits_ms.join("|") : ""),
      escapeCsv(s.reconstruction || ""),
      escapeCsv(s.solved_at),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

function parseCsvLine(line: string): string[] {
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
}

export function parseBackup(raw: string): ParsedBackup | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const warnings: string[] = [];
  let invalidRowCount = 0;

  // 1 & 2. JSON (RukTimer v1/v2/v3 or csTimer)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);

      // Native RukTimer JSON (v1, v2, v3)
      if (Array.isArray(parsed.sessions) && Array.isArray(parsed.solves)) {
        const sessions: SessionLike[] = parsed.sessions.map(
          (s: Partial<SessionLike>, idx: number) => {
            const name = String(s.name || `Imported Session ${idx + 1}`);
            const puzzle = String(s.puzzle || "3x3");
            const createdAt = s.created_at || new Date().toISOString();
            return {
              id: s.id || deterministicUuid(`rt-sess:${name}:${puzzle}:${createdAt}`),
              name,
              puzzle,
              created_at: createdAt,
            };
          }
        );

        const fallbackSessionId =
          sessions[0]?.id || deterministicUuid("rt-sess:default");
        if (sessions.length === 0) {
          sessions.push({
            id: fallbackSessionId,
            name: "Imported Session",
            puzzle: "3x3",
            created_at: new Date().toISOString(),
          });
        }

        const solves: SolveLike[] = [];
        for (const sv of parsed.solves as Partial<SolveLike>[]) {
          if (typeof sv.time_ms !== "number" || !Number.isFinite(sv.time_ms) || sv.time_ms < 0) {
            invalidRowCount++;
            continue;
          }
          const timeMs = Math.max(0, Math.round(sv.time_ms));
          const penalty: Penalty = ["OK", "+2", "DNF"].includes(String(sv.penalty))
            ? (sv.penalty as Penalty)
            : "OK";
          const scramble = String(sv.scramble || "");
          const solvedAt = sv.solved_at || new Date().toISOString();
          const puzzle = String(sv.puzzle || "3x3");
          solves.push({
            id:
              sv.id ||
              deterministicUuid(
                `rt-solve:${puzzle}:${timeMs}:${penalty}:${scramble}:${solvedAt}`
              ),
            session_id: sv.session_id || fallbackSessionId,
            puzzle,
            time_ms: timeMs,
            penalty,
            scramble,
            comment: String(sv.comment || ""),
            splits_ms: sanitizeSplits(sv.splits_ms),
            reconstruction: sv.reconstruction ? String(sv.reconstruction) : undefined,
            solved_at: solvedAt,
          });
        }

        const cfopProgress: Record<string, CfopProgressItem> = {};
        if (parsed.cfopProgress && typeof parsed.cfopProgress === "object") {
          for (const [k, v] of Object.entries(parsed.cfopProgress)) {
            const item = v as Partial<CfopProgressItem>;
            if (item && typeof item.alg_id === "string") {
              cfopProgress[k] = {
                alg_id: item.alg_id,
                status: item.status ?? "learning",
                preferred_formula: item.preferred_formula,
                ease_factor: Number(item.ease_factor ?? 2.5),
                interval_days: Number(item.interval_days ?? 0),
                repetitions: Number(item.repetitions ?? 0),
                next_review_at: item.next_review_at || new Date().toISOString(),
                last_drilled_at: item.last_drilled_at,
                updated_at: item.updated_at || new Date().toISOString(),
              };
            }
          }
        }

        const practiceSetIds: string[] = Array.isArray(parsed.practiceSetIds)
          ? parsed.practiceSetIds.filter((x: unknown): x is string => typeof x === "string")
          : [];

        return {
          sourceFormat: "RukTimer JSON",
          sessions,
          solves,
          cfopProgress,
          practiceSetIds,
          invalidRowCount,
          warnings,
        };
      }

      // csTimer format
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
            warnings.push("Không đọc được metadata tên phiên csTimer, dùng tên mặc định.");
          }
        }

        const sessions: SessionLike[] = [];
        const solves: SolveLike[] = [];

        for (const key of sessionKeys) {
          const arr = parsed[key];
          if (!Array.isArray(arr) || arr.length === 0) continue;
          const idxStr = key.replace("session", "");
          const meta = sessionMetaMap[idxStr];
          const sName = meta?.name
            ? `csTimer • ${meta.name}`
            : `csTimer Session ${idxStr}`;
          const puzzle = mapCsTimerScrType(meta?.opt?.scrType || meta?.scrType);
          const sessionId = deterministicUuid(`cstimer-sess:${key}:${sName}:${puzzle}`);

          sessions.push({
            id: sessionId,
            name: sName,
            puzzle,
            created_at: new Date().toISOString(),
          });

          for (let i = 0; i < arr.length; i++) {
            const item = arr[i];
            if (!Array.isArray(item) || !Array.isArray(item[0])) {
              invalidRowCount++;
              continue;
            }
            const timeArr = item[0];
            const penFlag = Number(timeArr[0]);
            const rawMs = Math.round(Number(timeArr[1] || 0));
            if (!Number.isFinite(rawMs) || rawMs <= 0) {
              invalidRowCount++;
              continue;
            }
            const penalty: Penalty =
              penFlag === -1 ? "DNF" : penFlag === 2000 ? "+2" : "OK";
            const scramble = String(item[1] || "");
            const comment = String(item[2] || "");
            const unixSec = Number(item[3]);
            const solvedAt =
              Number.isFinite(unixSec) && unixSec > 100000
                ? new Date(unixSec * 1000).toISOString()
                : new Date(0).toISOString();

            // Multi-phase splits in csTimer live at indices >= 1 if length > 2
            let splitsMs: number[] | undefined;
            if (timeArr.length === 5) {
              // csTimer stores cumulative splits in reverse order: [penalty, total, p3, p2, p1]
              const c1 = Number(timeArr[4]);
              const c2 = Number(timeArr[3]);
              const c3 = Number(timeArr[2]);
              const c4 = Number(timeArr[1]);
              if (c1 > 0 && c2 >= c1 && c3 >= c2 && c4 >= c3) {
                splitsMs = [c1, c2 - c1, c3 - c2, c4 - c3];
              }
            }

            solves.push({
              id: deterministicUuid(
                `cstimer:${sessionId}:${i}:${rawMs}:${penalty}:${scramble}:${solvedAt}`
              ),
              session_id: sessionId,
              puzzle,
              time_ms: rawMs,
              penalty,
              scramble,
              comment,
              splits_ms: splitsMs,
              solved_at: solvedAt,
            });
          }
        }

        if (sessions.length > 0) {
          return {
            sourceFormat: "csTimer",
            sessions,
            solves,
            cfopProgress: {},
            practiceSetIds: [],
            invalidRowCount,
            warnings,
          };
        }
      }
    } catch {
      return null;
    }
  }

  // 3. CSV (RukTimer v1/v2 CSV, Twisty Timer CSV, CubeDesk CSV)
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    const headerCols = parseCsvLine(lines[0]).map((c) => c.toLowerCase());
    const hasHeader =
      headerCols.some((c) => c.includes("time") || c.includes("scramble")) ||
      Number.isNaN(Number(headerCols[0]));
    const startRow = hasHeader ? 1 : 0;

    const isRukCsv =
      headerCols[1] === "session" && headerCols[3]?.includes("time");
    const splitsColIdx = headerCols.findIndex((c) => c.includes("split"));
    const reconColIdx = headerCols.findIndex((c) => c.includes("recon"));
    const solvedAtColIdx = headerCols.findIndex(
      (c) => c.includes("solvedat") || c === "date"
    );

    const sessionsByKey = new Map<string, SessionLike>();
    const solves: SolveLike[] = [];

    for (let i = startRow; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 2) {
        invalidRowCount++;
        continue;
      }

      let sessionName = "CSV Imported";
      let puzzle = "3x3";
      let timeMs = 0;
      let penalty: Penalty = "OK";
      let scramble = "";
      let comment = "";
      let splitsMs: number[] | undefined;
      let reconstruction: string | undefined;
      let solvedAt = new Date(0).toISOString();

      if (isRukCsv && cols.length >= 6) {
        sessionName = cols[1] || "CSV Imported";
        puzzle = cols[2] || "3x3";
        timeMs = Math.round(Number(cols[3]));
        penalty = (["OK", "+2", "DNF"].includes(cols[4])
          ? cols[4]
          : "OK") as Penalty;
        scramble = cols[5] || "";
        comment = cols[6] || "";
        if (splitsColIdx >= 0 && cols[splitsColIdx]) {
          splitsMs = sanitizeSplits(cols[splitsColIdx].split("|"));
        }
        if (reconColIdx >= 0 && cols[reconColIdx]) {
          reconstruction = cols[reconColIdx];
        }
        if (solvedAtColIdx >= 0 && cols[solvedAtColIdx]) {
          solvedAt = cols[solvedAtColIdx];
        } else if (cols[cols.length - 1]) {
          solvedAt = cols[cols.length - 1];
        }
      } else {
        const numericCol = cols.find((c) => /^\d+(\.\d+)?$/.test(c));
        if (!numericCol) {
          invalidRowCount++;
          continue;
        }
        const val = Number(numericCol);
        timeMs =
          val < 600 && numericCol.includes(".")
            ? Math.round(val * 1000)
            : Math.round(val);
        scramble =
          cols.find((c) => /[RLUDFB]['2]?\s+[RLUDFB]/.test(c)) || cols[1] || "";
        if (cols.some((c) => c.toUpperCase() === "DNF" || c === "2")) {
          penalty = "DNF";
        } else if (cols.some((c) => c === "+2" || c === "1")) {
          penalty = "+2";
        }
        const isoCol = cols.find((c) => /^\d{4}-\d{2}-\d{2}/.test(c));
        if (isoCol) solvedAt = isoCol;
      }

      if (!Number.isFinite(timeMs) || timeMs <= 0) {
        invalidRowCount++;
        continue;
      }

      const sessKey = `${sessionName}|${puzzle}`;
      let sess = sessionsByKey.get(sessKey);
      if (!sess) {
        sess = {
          id: deterministicUuid(`csv-sess:${sessKey}`),
          name: sessionName,
          puzzle,
          created_at: new Date().toISOString(),
        };
        sessionsByKey.set(sessKey, sess);
      }

      solves.push({
        id: deterministicUuid(
          `csv:${sess.id}:${timeMs}:${penalty}:${scramble}:${solvedAt}:${i}`
        ),
        session_id: sess.id,
        puzzle: sess.puzzle,
        time_ms: timeMs,
        penalty,
        scramble,
        comment,
        splits_ms: splitsMs,
        reconstruction,
        solved_at: solvedAt,
      });
    }

    if (solves.length > 0) {
      return {
        sourceFormat: "CSV",
        sessions: [...sessionsByKey.values()],
        solves,
        cfopProgress: {},
        practiceSetIds: [],
        invalidRowCount,
        warnings,
      };
    }
  }

  return null;
}

/**
 * Dry-run import planner: computes exact new/duplicate/invalid counts and produces
 * a non-destructive merged state.
 */
export function planImport(
  current: {
    sessions: SessionLike[];
    solves: SolveLike[];
    cfopProgress: Record<string, CfopProgressItem>;
    practiceSetIds: string[];
  },
  parsed: ParsedBackup
): ImportPlan {
  const existingSessById = new Map(current.sessions.map((s) => [s.id, s]));
  const existingSessByNamePuzzle = new Map(
    current.sessions.map((s) => [`${s.name}|${s.puzzle}`, s])
  );

  // Remap imported session IDs to existing sessions when name+puzzle match
  const sessionIdMap = new Map<string, string>();
  const newSessions: SessionLike[] = [];
  let existingSessionMatches = 0;

  for (const s of parsed.sessions) {
    if (existingSessById.has(s.id)) {
      sessionIdMap.set(s.id, s.id);
      existingSessionMatches++;
    } else {
      const byName = existingSessByNamePuzzle.get(`${s.name}|${s.puzzle}`);
      if (byName) {
        sessionIdMap.set(s.id, byName.id);
        existingSessionMatches++;
      } else {
        sessionIdMap.set(s.id, s.id);
        newSessions.push(s);
      }
    }
  }

  const existingSolveIds = new Set(current.solves.map((s) => s.id));
  const existingFingerprints = new Set(current.solves.map(solveFingerprint));

  const newSolves: SolveLike[] = [];
  let duplicateSolves = 0;

  for (const sv of parsed.solves) {
    const mappedSessionId = sessionIdMap.get(sv.session_id) || sv.session_id;
    const fp = solveFingerprint(sv);
    if (existingSolveIds.has(sv.id) || existingFingerprints.has(fp)) {
      duplicateSolves++;
      continue;
    }
    existingSolveIds.add(sv.id);
    existingFingerprints.add(fp);
    newSolves.push({
      ...sv,
      session_id: mappedSessionId,
    });
  }

  // Merge CFOP progress keeping the newer updated_at record
  const mergedCfopProgress: Record<string, CfopProgressItem> = {
    ...current.cfopProgress,
  };
  let cfopProgressCount = 0;
  for (const [algId, incoming] of Object.entries(parsed.cfopProgress)) {
    const cur = mergedCfopProgress[algId];
    if (
      !cur ||
      new Date(incoming.updated_at).getTime() >=
        new Date(cur.updated_at).getTime()
    ) {
      mergedCfopProgress[algId] = incoming;
      cfopProgressCount++;
    }
  }

  const mergedPracticeSetIds = Array.from(
    new Set([...current.practiceSetIds, ...parsed.practiceSetIds])
  );

  return {
    sourceFormat: parsed.sourceFormat,
    newSessions,
    existingSessionMatches,
    newSolves,
    duplicateSolves,
    invalidRows: parsed.invalidRowCount,
    cfopProgressCount,
    practiceSetCount: parsed.practiceSetIds.length,
    warnings: parsed.warnings,
    mergedSessions: [...current.sessions, ...newSessions],
    mergedSolves: [...current.solves, ...newSolves],
    mergedCfopProgress,
    mergedPracticeSetIds,
  };
}
