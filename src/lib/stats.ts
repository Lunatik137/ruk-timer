import type {
  HistogramBucket,
  PersonalAchievement,
  Solve,
  SolveWithRollingStats,
  SplitStageBreakdown,
  StatSummary,
} from "@/types/cubing";

/**
 * Returns effective solve time in ms, or "DNF".
 */
export function getEffectiveMs(
  solve: Pick<Solve, "time_ms" | "penalty">
): number | "DNF" {
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
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}.${frac}`;
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
export function computeMeanOfN(
  window: (number | "DNF")[]
): number | "DNF" | null {
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
  let bestAo50Index: number | null = null;
  let bestAo100: number | null = null;
  let bestAo100Index: number | null = null;

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
      i >= 4
        ? computeTrimmedAverage(effectiveList.slice(i - 4, i + 1), 5)
        : null;
    if (typeof ao5 === "number" && (bestAo5 === null || ao5 < bestAo5)) {
      bestAo5 = ao5;
      bestAo5Index = i;
    }

    const ao12 =
      i >= 11
        ? computeTrimmedAverage(effectiveList.slice(i - 11, i + 1), 12)
        : null;
    if (typeof ao12 === "number" && (bestAo12 === null || ao12 < bestAo12)) {
      bestAo12 = ao12;
      bestAo12Index = i;
    }

    const ao50 =
      i >= 49
        ? computeTrimmedAverage(effectiveList.slice(i - 49, i + 1), 50)
        : null;
    if (typeof ao50 === "number" && (bestAo50 === null || ao50 < bestAo50)) {
      bestAo50 = ao50;
      bestAo50Index = i;
    }

    const ao100 =
      i >= 99
        ? computeTrimmedAverage(effectiveList.slice(i - 99, i + 1), 100)
        : null;
    if (typeof ao100 === "number" && (bestAo100 === null || ao100 < bestAo100)) {
      bestAo100 = ao100;
      bestAo100Index = i;
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
      bestAo50Index,
      currentAo100,
      bestAo100,
      bestAo100Index,
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

// ============================================================================
// Advanced Analytics: Histogram, Consistency Score, Split Breakdown & BPA/WPA
// ============================================================================

export function computeTimeHistogram(
  solves: Solve[],
  bucketCount = 6,
  decimals: 2 | 3 = 2
): HistogramBucket[] {
  const validMs: number[] = [];
  for (const s of solves) {
    const eff = getEffectiveMs(s);
    if (typeof eff === "number") validMs.push(eff);
  }
  if (validMs.length < 3) return [];

  const minVal = Math.min(...validMs);
  const maxVal = Math.max(...validMs);
  const span = Math.max(500, maxVal - minVal);
  const step = Math.ceil(span / bucketCount / 50) * 50;

  const buckets: HistogramBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const bMin = minVal + i * step;
    const bMax = i === bucketCount - 1 ? Math.max(maxVal + 1, bMin + step) : bMin + step;
    buckets.push({
      label: `${formatTimeMs(bMin, decimals)}–${formatTimeMs(bMax, decimals)}`,
      minMs: bMin,
      maxMs: bMax,
      count: 0,
      percentage: 0,
    });
  }

  for (const v of validMs) {
    const idx = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((v - minVal) / step))
    );
    buckets[idx].count++;
  }

  for (const b of buckets) {
    b.percentage = Math.round((b.count / validMs.length) * 100);
  }

  return buckets;
}

export function computeConsistencyAndSubX(
  solves: Solve[],
  targetGoalMs = 15000
): {
  consistencyScore: number | null; // 0..100
  cleanRatePct: number | null;
  subGoalRatePct: number | null;
  medianMs: number | null;
  iqrMs: number | null;
} {
  if (solves.length === 0) {
    return {
      consistencyScore: null,
      cleanRatePct: null,
      subGoalRatePct: null,
      medianMs: null,
      iqrMs: null,
    };
  }

  const validMs: number[] = [];
  let cleanCount = 0;
  let subGoalCount = 0;

  for (const s of solves) {
    if (s.penalty === "OK") cleanCount++;
    const eff = getEffectiveMs(s);
    if (typeof eff === "number") {
      validMs.push(eff);
      if (eff < targetGoalMs) subGoalCount++;
    }
  }

  const cleanRatePct = Math.round((cleanCount / solves.length) * 100);
  const subGoalRatePct = Math.round((subGoalCount / solves.length) * 100);

  if (validMs.length < 2) {
    return {
      consistencyScore: null,
      cleanRatePct,
      subGoalRatePct,
      medianMs: validMs[0] ?? null,
      iqrMs: null,
    };
  }

  const sorted = [...validMs].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqrMs = q3 - q1;

  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance =
    sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sorted.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  // CV of 0.05 => ~95 score; CV of 0.25 => ~65 score
  const consistencyScore = Math.max(
    10,
    Math.min(100, Math.round(100 - cv * 140))
  );

  return {
    consistencyScore,
    cleanRatePct,
    subGoalRatePct,
    medianMs,
    iqrMs,
  };
}

/**
 * Analyzes CFOP 4-stage splits ([Cross, F2L, OLL, PLL] durations in ms) against WCA ideal ratios.
 */
export function computeSplitBreakdown(
  solves: Solve[]
): SplitStageBreakdown | null {
  const splitSolves = solves.filter(
    (s) =>
      s.penalty !== "DNF" &&
      Array.isArray(s.splits_ms) &&
      s.splits_ms.length === 4
  );

  if (splitSolves.length === 0) return null;

  const sums = [0, 0, 0, 0];
  for (const s of splitSolves) {
    const sp = s.splits_ms!;
    sums[0] += sp[0];
    sums[1] += sp[1];
    sums[2] += sp[2];
    sums[3] += sp[3];
  }

  const n = splitSolves.length;
  const avgs = sums.map((sum) => Math.round(sum / n));
  const totalAvg = Math.max(1, avgs[0] + avgs[1] + avgs[2] + avgs[3]);
  const ideals = [12, 50, 16, 22]; // Benchmark CFOP distribution %
  const keys: ("CROSS" | "F2L" | "OLL" | "PLL")[] = [
    "CROSS",
    "F2L",
    "OLL",
    "PLL",
  ];
  const labels = ["1. Cross", "2. F2L (4 cặp)", "3. OLL", "4. PLL"];

  return {
    sampleCount: n,
    stages: keys.map((key, idx) => {
      const actualPct = Math.round((avgs[idx] / totalAvg) * 100);
      return {
        key,
        label: labels[idx],
        avgMs: avgs[idx],
        actualPct,
        idealPct: ideals[idx],
        deltaPct: actualPct - ideals[idx],
      };
    }),
  };
}

/**
 * Calculates Best Possible Average (BPA), Worst Possible Average (WPA), and Target Needed
 * after 4 solves in a WCA Ao5 Competition Round.
 */
export function computeBpaWpa(
  firstFourSolves: Solve[],
  targetAvgMs: number
): {
  bpa: number | "DNF" | null;
  wpa: number | "DNF" | null;
  neededForTargetMs: number | "IMPOSSIBLE" | "GUARANTEED" | null;
} {
  if (firstFourSolves.length !== 4) {
    return { bpa: null, wpa: null, neededForTargetMs: null };
  }
  const eff4 = firstFourSolves.map(getEffectiveMs);
  const bpa = computeTrimmedAverage([...eff4, 1], 5);
  const wpa = computeTrimmedAverage([...eff4, "DNF"], 5);

  if (typeof wpa === "number" && wpa <= targetAvgMs) {
    return { bpa, wpa, neededForTargetMs: "GUARANTEED" };
  }
  if (bpa === "DNF" || (typeof bpa === "number" && bpa > targetAvgMs)) {
    return { bpa, wpa, neededForTargetMs: "IMPOSSIBLE" };
  }

  // Binary search exact max 5th solve time that yields Ao5 <= targetAvgMs
  let lo = 10;
  let hi = targetAvgMs * 3;
  let bestAllowed = 10;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const avg = computeTrimmedAverage([...eff4, mid], 5);
    if (typeof avg === "number" && avg <= targetAvgMs) {
      bestAllowed = mid;
      lo = mid + 10;
    } else {
      hi = mid - 10;
    }
  }

  return { bpa, wpa, neededForTargetMs: bestAllowed };
}

/**
 * Computes daily training streak and 84-day (12-week) activity heatmap.
 */
export function computeStreakAndHeatmap(allSolves: Solve[]): {
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  activeDaysCount: number;
  heatmapDays: { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }[];
} {
  const countsByDate = new Map<string, number>();

  const toLocalDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  for (const s of allSolves) {
    const dt = new Date(s.solved_at);
    if (!Number.isNaN(dt.getTime())) {
      const k = toLocalDateKey(dt);
      countsByDate.set(k, (countsByDate.get(k) || 0) + 1);
    }
  }

  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const todayCount = countsByDate.get(todayKey) || 0;

  // Calculate current streak (counting back from today or yesterday)
  let currentStreak = 0;
  const cursor = new Date(today);
  if ((countsByDate.get(toLocalDateKey(cursor)) || 0) === 0) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while ((countsByDate.get(toLocalDateKey(cursor)) || 0) > 0) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Calculate longest streak over sorted dates
  const sortedDates = [...countsByDate.keys()].sort();
  let longestStreak = currentStreak;
  let running = 0;
  let prevTime: number | null = null;

  for (const dStr of sortedDates) {
    const t = new Date(`${dStr}T00:00:00`).getTime();
    if (prevTime !== null && Math.round((t - prevTime) / 86400000) === 1) {
      running++;
    } else {
      running = 1;
    }
    if (running > longestStreak) longestStreak = running;
    prevTime = t;
  }

  // 84-day (12 weeks) heatmap
  const heatmapDays: { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toLocalDateKey(d);
    const count = countsByDate.get(key) || 0;
    const level: 0 | 1 | 2 | 3 | 4 =
      count === 0
        ? 0
        : count < 10
        ? 1
        : count < 30
        ? 2
        : count < 60
        ? 3
        : 4;
    heatmapDays.push({ date: key, count, level });
  }

  return {
    currentStreak,
    longestStreak,
    todayCount,
    activeDaysCount: countsByDate.size,
    heatmapDays,
  };
}

/**
 * Smart Session Fatigue & Tilt Detector (CUSUM/EWMA trend anomaly detection).
 */
export function computeSessionFatigueAlert(
  chronologicalSolves: Solve[]
): string | null {
  if (chronologicalSolves.length < 20) return null;
  const recent10 = chronologicalSolves.slice(-10);
  const baseline = chronologicalSolves.slice(0, -10);

  const baselineValid = baseline
    .map(getEffectiveMs)
    .filter((v): v is number => typeof v === "number");
  if (baselineValid.length < 10) return null;

  const baseMean =
    baselineValid.reduce((a, b) => a + b, 0) / baselineValid.length;
  const recentValid = recent10
    .map(getEffectiveMs)
    .filter((v): v is number => typeof v === "number");
  const recentPenalties = recent10.filter((s) => s.penalty !== "OK").length;

  if (recentPenalties >= 4) {
    return "Phát hiện 4+ lượt bị phạt (+2/DNF) trong 10 lượt gần nhất. Hãy hít thở sâu, tận dụng trọn 15s Inspection hoặc nghỉ tay 2 phút!";
  }

  if (recentValid.length >= 6) {
    const recentMean =
      recentValid.reduce((a, b) => a + b, 0) / recentValid.length;
    if (recentMean > baseMean * 1.12) {
      const slowPct = Math.round(((recentMean - baseMean) / baseMean) * 100);
      return `Tốc độ 10 lượt gần nhất đang chậm hơn trung bình phiên ${slowPct}% (dấu hiệu mỏi mắt lookahead). Bạn có thể nghỉ ngơi ngắn hoặc chuyển sang ôn nhẹ CFOP Drill!`;
    }
  }

  return null;
}

/**
 * Compares the last 7 days of practice with the previous 7 days for the Weekly Progress Report.
 */
export function computeWeeklyComparison(allSolves: Solve[]): {
  thisWeekCount: number;
  lastWeekCount: number;
  thisWeekMeanMs: number | null;
  lastWeekMeanMs: number | null;
  thisWeekBestSingleMs: number | null;
  lastWeekBestSingleMs: number | null;
  thisWeekStdDevMs: number | null;
  lastWeekStdDevMs: number | null;
  meanDeltaPct: number | null; // negative means faster (improvement)
} {
  const now = Date.now();
  const sevenDaysMs = 7 * 86400 * 1000;
  const fourteenDaysMs = 14 * 86400 * 1000;

  const thisWeek: Solve[] = [];
  const lastWeek: Solve[] = [];

  for (const s of allSolves) {
    const t = new Date(s.solved_at).getTime();
    if (Number.isNaN(t)) continue;
    const age = now - t;
    if (age <= sevenDaysMs) thisWeek.push(s);
    else if (age <= fourteenDaysMs) lastWeek.push(s);
  }

  const sThis = calculateSessionStats(thisWeek).summary;
  const sLast = calculateSessionStats(lastWeek).summary;

  let meanDeltaPct: number | null = null;
  if (sThis.mean && sLast.mean && sLast.mean > 0) {
    meanDeltaPct = Number(
      (((sThis.mean - sLast.mean) / sLast.mean) * 100).toFixed(1)
    );
  }

  return {
    thisWeekCount: thisWeek.length,
    lastWeekCount: lastWeek.length,
    thisWeekMeanMs: sThis.mean,
    lastWeekMeanMs: sLast.mean,
    thisWeekBestSingleMs: sThis.bestSingle,
    lastWeekBestSingleMs: sLast.bestSingle,
    thisWeekStdDevMs: sThis.stdDev,
    lastWeekStdDevMs: sLast.stdDev,
    meanDeltaPct,
  };
}

/**
 * Evaluates unlocked Personal Achievements & Milestones.
 */
export function computePersonalAchievements(
  allSolves: Solve[],
  learnedAlgCount: number,
  totalAlgCount: number
): PersonalAchievement[] {
  const threeByThree = allSolves.filter((s) => s.puzzle === "3x3");
  const stats3x3 = calculateSessionStats(threeByThree).summary;
  const totalSolves = allSolves.length;
  const splitCount = allSolves.filter(
    (s) => Array.isArray(s.splits_ms) && s.splits_ms.length === 4
  ).length;

  return [
    {
      id: "vol-100",
      title: "Khởi đầu Tốc độ (100 Solves)",
      description: "Hoàn thành 100 lượt bấm giờ trên RukTimer",
      unlocked: totalSolves >= 100,
      progressText: `${Math.min(100, totalSolves)}/100 lượt`,
      category: "volume",
    },
    {
      id: "vol-1000",
      title: "Câu lạc bộ Nghìn Lượt (1,000 Solves)",
      description: "Tích lũy 1,000 lượt giải trên mọi bộ môn WCA",
      unlocked: totalSolves >= 1000,
      progressText: `${Math.min(1000, totalSolves)}/1000 lượt`,
      category: "volume",
    },
    {
      id: "spd-sub20",
      title: "Phá Rào Cản Sub-20 (3x3 Single)",
      description: "Đạt thành tích đơn 3x3 dưới 20.00 giây",
      unlocked:
        stats3x3.bestSingle !== null && stats3x3.bestSingle < 20000,
      progressText: stats3x3.bestSingle
        ? `Best: ${formatTimeMs(stats3x3.bestSingle)}`
        : "Chưa có lượt 3x3",
      category: "speed",
    },
    {
      id: "spd-sub15-ao5",
      title: "Cao Thủ Sub-15 (3x3 Ao5)",
      description: "Đạt trung bình Ao5 bộ môn 3x3 dưới 15.00 giây",
      unlocked: stats3x3.bestAo5 !== null && stats3x3.bestAo5 < 15000,
      progressText: stats3x3.bestAo5
        ? `Best Ao5: ${formatTimeMs(stats3x3.bestAo5)}`
        : "Cần ít nhất 5 lượt 3x3",
      category: "speed",
    },
    {
      id: " spd-sub10",
      title: "Đẳng Cấp Sub-10 (3x3 Single)",
      description: "Chạm mốc giải đơn 3x3 dưới 10.00 giây",
      unlocked:
        stats3x3.bestSingle !== null && stats3x3.bestSingle < 10000,
      progressText: stats3x3.bestSingle
        ? `Best: ${formatTimeMs(stats3x3.bestSingle)}`
        : "Chưa mở khóa",
      category: "speed",
    },
    {
      id: "cfop-2look",
      title: "Tốt Nghiệp 2-Look CFOP (16+ Algs)",
      description: "Thuộc ít nhất 16 công thức nền tảng trong Học viện CFOP",
      unlocked: learnedAlgCount >= 16,
      progressText: `${learnedAlgCount}/${totalAlgCount} công thức`,
      category: "cfop",
    },
    {
      id: "cfop-master",
      title: "Bậc Thầy Thuật Toán CFOP (50+ Algs)",
      description: "Làm chủ từ 50 công thức CFOP trở lên",
      unlocked: learnedAlgCount >= 50,
      progressText: `${learnedAlgCount}/${totalAlgCount} công thức`,
      category: "cfop",
    },
    {
      id: "split-analyst",
      title: "Chuyên Gia Phân Tích Giai Đoạn",
      description: "Thực hiện 10 lượt giải bằng chế độ Split Timer 4 pha CFOP",
      unlocked: splitCount >= 10,
      progressText: `${Math.min(10, splitCount)}/10 lượt Split`,
      category: "consistency",
    },
  ];
}
