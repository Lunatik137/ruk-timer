import type { Solve, SolveWithRollingStats, StatSummary } from "../types/cubing";

export function getEffectiveMs(solve: Pick<Solve, "time_ms" | "penalty">): number | "DNF" {
  if (solve.penalty === "DNF") return "DNF";
  if (solve.penalty === "+2") return solve.time_ms + 2000;
  return solve.time_ms;
}

export function formatTimeMs(
  ms: number | "DNF" | null | undefined,
  decimals: 2 | 3 = 2
): string {
  if (ms === null || ms === undefined) return "—";
  if (ms === "DNF") return "DNF";

  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remainderMs = safeMs % 1000;

  const frac =
    decimals === 3
      ? String(remainderMs).padStart(3, "0")
      : String(Math.floor(remainderMs / 10)).padStart(2, "0");

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${frac}`;
  }
  return `${seconds}.${frac}`;
}

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

export function computeMeanOfN(window: (number | "DNF")[]): number | "DNF" | null {
  if (window.length === 0) return null;
  let sum = 0;
  for (const v of window) {
    if (v === "DNF") return "DNF";
    sum += v;
  }
  return Math.round(sum / window.length);
}

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
    if (v === "DNF") dnfCount++;
    else numericValues.push(v);
  }
  if (dnfCount > trimCount) return "DNF";

  numericValues.sort((a, b) => a - b);
  const upperNumericDrop = trimCount - dnfCount;
  const counted = numericValues.slice(
    trimCount,
    numericValues.length - upperNumericDrop
  );
  if (counted.length === 0) return "DNF";
  const sum = counted.reduce((acc, x) => acc + x, 0);
  return Math.round(sum / counted.length);
}

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
  let bestAo12: number | null = null;
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

    const mo3 = i >= 2 ? computeMeanOfN(effectiveList.slice(i - 2, i + 1)) : null;
    if (typeof mo3 === "number" && (bestMo3 === null || mo3 < bestMo3)) {
      bestMo3 = mo3;
    }

    const ao5 =
      i >= 4 ? computeTrimmedAverage(effectiveList.slice(i - 4, i + 1), 5) : null;
    if (typeof ao5 === "number" && (bestAo5 === null || ao5 < bestAo5)) {
      bestAo5 = ao5;
    }

    const ao12 =
      i >= 11 ? computeTrimmedAverage(effectiveList.slice(i - 11, i + 1), 12) : null;
    if (typeof ao12 === "number" && (bestAo12 === null || ao12 < bestAo12)) {
      bestAo12 = ao12;
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
  return {
    summary: {
      totalCount,
      validCount,
      dnfCount,
      mean,
      stdDev,
      currentSingle: lastIdx >= 0 ? effectiveList[lastIdx] : null,
      bestSingle,
      bestSingleSolveId,
      currentMo3:
        totalCount >= 3 ? computeMeanOfN(effectiveList.slice(totalCount - 3)) : null,
      bestMo3,
      currentAo5: totalCount >= 5 ? enrichedSolves[lastIdx].rollingAo5 : null,
      bestAo5,
      currentAo12: totalCount >= 12 ? enrichedSolves[lastIdx].rollingAo12 : null,
      bestAo12,
      currentAo50:
        totalCount >= 50 ? computeTrimmedAverage(effectiveList, 50) : null,
      bestAo50,
      currentAo100:
        totalCount >= 100 ? computeTrimmedAverage(effectiveList, 100) : null,
      bestAo100,
    },
    enrichedSolves,
  };
}
