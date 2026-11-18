import type { Solve, SolveWithRollingStats, StatSummary } from "@/types/cubing";

/**
 * Returns effective solve time in ms, or "DNF".
 */
export function getEffectiveMs(solve: Pick<Solve, "time_ms" | "penalty">): number | "DNF" {
  if (solve.penalty === "DNF") return "DNF";
  if (solve.penalty === "+2") return solve.time_ms + 2000;
  return solve.time_ms;
}

/**
 * Formats milliseconds into standard cubing time display (e.g. 9.42, 1:04.28).
 */
export function formatTimeMs(
  ms: number | "DNF" | null | undefined,
  decimals: 2 | 3 = 2
): string {
  if (ms === null || ms === undefined) return "—";
  if (ms === "DNF") return "DNF";

  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const remainderMs = safeMs % 1000;

  const frac =
    decimals === 3
      ? String(remainderMs).padStart(3, "0")
      : String(Math.floor(remainderMs / 10)).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}.${frac}`;
  }
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${frac}`;
  }
  return `${seconds}.${frac}`;
}

/**
 * Formats a solve including its "+2" suffix if applicable.
 */
export function formatSolveDisplay(
  solve: Pick<Solve, "time_ms" | "penalty">,
  decimals: 2 | 3 = 2
): string {
  if (solve.penalty === "DNF") {
    return `DNF(${formatTimeMs(solve.time_ms, decimals)})`;
  }
  const eff = getEffectiveMs(solve);
  const base = formatTimeMs(eff, decimals);
  return solve.penalty === "+2" ? `${base}+` : base;
}

/**
 * Parses manual cubing input (csTimer style):
 * - "9.45" -> 9450ms
 * - "1:05.23" -> 65230ms
 * - "945" (digits only) -> 9.45s -> 9450ms
 * - "10523" (digits only) -> 1:05.23 -> 65230ms
 */
export function parseManualTimeInput(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  // Format with colon or dot: e.g., 1:12.34 or 12.34
  if (cleaned.includes(":") || cleaned.includes(".")) {
    const parts = cleaned.split(":");
    if (parts.length > 3) return null;
    let totalSec = 0;
    for (let i = 0; i < parts.length; i++) {
      const val = Number(parts[i]);
      if (Number.isNaN(val) || val < 0) return null;
      totalSec = totalSec * 60 + val;
    }
    return Math.round(totalSec * 1000);
  }

  // Digits-only csTimer shorthand: e.g. "1234" => 12.34s, "10523" => 1m 05.23s
  if (/^\d+$/.test(cleaned)) {
    const padded = cleaned.padStart(3, "0");
    const centis = Number(padded.slice(-2));
    const secPart = padded.slice(0, -2);
    let seconds = 0;
    let minutes = 0;
    let hours = 0;

    if (secPart.length <= 2) {
      seconds = Number(secPart);
    } else if (secPart.length <= 4) {
      seconds = Number(secPart.slice(-2));
      minutes = Number(secPart.slice(0, -2));
    } else {
      seconds = Number(secPart.slice(-2));
      minutes = Number(secPart.slice(-4, -2));
      hours = Number(secPart.slice(0, -4));
    }

    return ((hours * 3600 + minutes * 60 + seconds) * 100 + centis) * 10;
  }

  return null;
}

/**
 * Calculates Mean of N (no trimming; any DNF makes result DNF).
 */
export function computeMeanOfN(window: (number | "DNF")[]): number | "DNF" | null {
  if (window.length === 0) return null;
  let sum = 0;
  for (const v of window) {
    if (v === "DNF") return "DNF";
    sum += v;
  }
  return Math.round(sum / window.length);
}

/**
 * Calculates WCA Trimmed Average of N (Ao5, Ao12, Ao50, Ao100).
 * Trims ceil(N * 0.05) best and worst solves (minimum 1 each when N >= 5).
 */
export function computeTrimmedAverage(
  window: (number | "DNF")[],
  n: number
): number | "DNF" | null {
  if (window.length < n) return null;
  const slice = window.slice(window.length - n);
  const trimCount = Math.max(1, Math.ceil(n * 0.05));

  let dnfCount = 0;
  const numericValues: number[] = [];

  for (const v of slice) {
    if (v === "DNF") {
      dnfCount++;
    } else {
      numericValues.push(v);
    }
  }

  // If DNFs exceed trimCount, at least one DNF remains in the counted middle
  if (dnfCount > trimCount) return "DNF";

  numericValues.sort((a, b) => a - b);

  // Drop `trimCount` smallest values, and `trimCount - dnfCount` largest numeric values
  // (since DNFs act as +Infinity and occupy `dnfCount` of the upper trim slots)
  const upperNumericDrop = trimCount - dnfCount;
  const counted = numericValues.slice(
    trimCount,
    numericValues.length - upperNumericDrop
  );

  if (counted.length === 0) return "DNF";
  const sum = counted.reduce((acc, x) => acc + x, 0);
  return Math.round(sum / counted.length);
}

/**
 * Computes full session statistics and rolling averages from an array of solves
 * sorted in chronological order (oldest -> newest).
 */
export function calculateSessionStats(chronologicalSolves: Solve[]): {
  summary: StatSummary;
  enrichedSolves: SolveWithRollingStats[];
} {
  const totalCount = chronologicalSolves.length;
  let validCount = 0;
  let dnfCount = 0;
  let validSum = 0;

  let bestSingle: number | null = null;
  let bestSingleSolveId: string | null = null;
  let bestMo3: number | null = null;
  let bestAo5: number | null = null;
  let bestAo5Index: number | null = null;
  let bestAo12: number | null = null;
  let bestAo12Index: number | null = null;
  let bestAo50: number | null = null;
  let bestAo100: number | null = null;

  const effectiveList: (number | "DNF")[] = [];
  const validValues: number[] = [];
  const enrichedSolves: SolveWithRollingStats[] = [];

  for (let i = 0; i < totalCount; i++) {
    const solve = chronologicalSolves[i];
    const eff = getEffectiveMs(solve);
    effectiveList.push(eff);

    if (eff === "DNF") {
      dnfCount++;
    } else {
      validCount++;
      validSum += eff;
      validValues.push(eff);
      if (bestSingle === null || eff < bestSingle) {
        bestSingle = eff;
        bestSingleSolveId = solve.id;
      }
    }

    const mo3 =
      i >= 2 ? computeMeanOfN(effectiveList.slice(i - 2, i + 1)) : null;
    if (typeof mo3 === "number" && (bestMo3 === null || mo3 < bestMo3)) {
      bestMo3 = mo3;
    }

    const ao5 =
      i >= 4 ? computeTrimmedAverage(effectiveList.slice(i - 4, i + 1), 5) : null;
    if (typeof ao5 === "number" && (bestAo5 === null || ao5 < bestAo5)) {
      bestAo5 = ao5;
      bestAo5Index = i;
    }

    const ao12 =
      i >= 11 ? computeTrimmedAverage(effectiveList.slice(i - 11, i + 1), 12) : null;
    if (typeof ao12 === "number" && (bestAo12 === null || ao12 < bestAo12)) {
      bestAo12 = ao12;
      bestAo12Index = i;
    }

    const ao50 =
      i >= 49 ? computeTrimmedAverage(effectiveList.slice(i - 49, i + 1), 50) : null;
    if (typeof ao50 === "number" && (bestAo50 === null || ao50 < bestAo50)) {
      bestAo50 = ao50;
    }

    const ao100 =
      i >= 99 ? computeTrimmedAverage(effectiveList.slice(i - 99, i + 1), 100) : null;
    if (typeof ao100 === "number" && (bestAo100 === null || ao100 < bestAo100)) {
      bestAo100 = ao100;
    }

    enrichedSolves.push({
      ...solve,
      indexNumber: i + 1,
      effectiveMs: eff,
      rollingAo5: ao5,
      rollingAo12: ao12,
    });
  }

  const mean = validCount > 0 ? Math.round(validSum / validCount) : null;

  let stdDev: number | null = null;
  if (validValues.length >= 2 && mean !== null) {
    const variance =
      validValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
      validValues.length;
    stdDev = Math.round(Math.sqrt(variance));
  }

  const lastIdx = totalCount - 1;
  const currentSingle = lastIdx >= 0 ? effectiveList[lastIdx] : null;
  const currentMo3 =
    totalCount >= 3
      ? computeMeanOfN(effectiveList.slice(totalCount - 3))
      : null;
  const currentAo5 =
    totalCount >= 5 ? enrichedSolves[lastIdx].rollingAo5 : null;
  const currentAo12 =
    totalCount >= 12 ? enrichedSolves[lastIdx].rollingAo12 : null;
  const currentAo50 =
    totalCount >= 50 ? computeTrimmedAverage(effectiveList, 50) : null;
  const currentAo100 =
    totalCount >= 100 ? computeTrimmedAverage(effectiveList, 100) : null;

  return {
    summary: {
      totalCount,
      validCount,
      dnfCount,
      mean,
      stdDev,
      currentSingle,
      bestSingle,
      bestSingleSolveId,
      currentMo3,
      bestMo3,
      currentAo5,
      bestAo5,
      bestAo5Index,
      currentAo12,
      bestAo12,
      bestAo12Index,
      currentAo50,
      bestAo50,
      currentAo100,
      bestAo100,
    },
    enrichedSolves,
  };
}

/**
 * Generates standard cubing share text (compatible with Discord/Reddit/Facebook cubing communities).
 */
export function generateAverageShareText(
  label: string,
  avgValue: number | "DNF",
  solvesWindow: Solve[],
  decimals: 2 | 3 = 2
): string {
  const dateStr = new Date().toLocaleDateString("vi-VN");
  const effs = solvesWindow.map((s) => ({
    s,
    eff: getEffectiveMs(s),
  }));

  // Identify best and worst index for parentheses (WCA convention)
  let minIdx = -1;
  let maxIdx = -1;

  if (solvesWindow.length >= 5) {
    let minVal = Infinity;
    for (let i = 0; i < effs.length; i++) {
      const v = effs[i].eff === "DNF" ? Infinity : (effs[i].eff as number);
      if (v < minVal) {
        minVal = v;
        minIdx = i;
      }
    }
    let maxVal = -1;
    for (let i = 0; i < effs.length; i++) {
      if (i === minIdx) continue;
      const v = effs[i].eff === "DNF" ? Infinity : (effs[i].eff as number);
      if (v >= maxVal) {
        maxVal = v;
        maxIdx = i;
      }
    }
  }

  const lines: string[] = [
    `Generated by RukTimer (${dateStr})`,
    `${label}: ${formatTimeMs(avgValue, decimals)}`,
    "",
    "Time List:",
  ];

  effs.forEach(({ s }, idx) => {
    const disp = formatSolveDisplay(s, decimals);
    const wrapped = idx === minIdx || idx === maxIdx ? `(${disp})` : disp;
    const commentSuffix = s.comment ? ` [${s.comment}]` : "";
    lines.push(`${idx + 1}. ${wrapped}${commentSuffix}   ${s.scramble}`);
  });

  return lines.join("\n");
}
