// Structured "Bài tập hôm nay" (Select → Drill → Re-measure) MVP for Coach.
// Default workout: F2L focused drill (10 F2L-only solves → 5 3x3 split solves to compare against baseline).

import { getEffectiveMs } from "./solveMath";
import type { SolveLike } from "./types";

export const MIN_BASELINE_SAMPLES = 5;
export const MIN_SPLIT_DIAGNOSTIC_SAMPLES = 8;

export type WorkoutPhase = "idle" | "drill_f2l" | "remeasure_splits" | "done";

export interface WorkoutBaseline {
  metric: "f2l_split_median" | "overall_3x3_mean" | "none";
  baselineMs: number | null;
  stdDevMs: number | null;
  sampleCount: number;
  label: string;
}

export interface GuidedWorkoutState {
  id: string;
  startedAt: string;
  phase: WorkoutPhase;
  targetDrillCount: number; // default 10 F2L solves
  targetRemeasureCount: number; // default 5 split solves
  drillSolveIds: string[];
  remeasureSolveIds: string[];
  remeasureF2lMs: number[];
  remeasureTotalMs: number[];
  baseline: WorkoutBaseline;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance));
}

/**
 * Selects a transparent baseline from the user's recent regular 3x3 solves:
 *  1. Prefer median F2L split duration of up to 10 recent split solves (requires >= 5).
 *  2. Otherwise fall back to mean of up to 12 recent valid 3x3 solves (requires >= 5).
 *  3. If fewer than 5 valid solves exist, return `metric: "none"` (no strong claims).
 */
export function computeWorkoutBaseline(
  recentRegular3x3Solves: SolveLike[]
): WorkoutBaseline {
  const splitF2l = recentRegular3x3Solves
    .filter(
      (s) =>
        s.penalty !== "DNF" &&
        Array.isArray(s.splits_ms) &&
        s.splits_ms.length === 4 &&
        s.splits_ms[1] > 0
    )
    .slice(-10)
    .map((s) => s.splits_ms![1]);

  if (splitF2l.length >= MIN_BASELINE_SAMPLES) {
    return {
      metric: "f2l_split_median",
      baselineMs: median(splitF2l),
      stdDevMs: stdDev(splitF2l),
      sampleCount: splitF2l.length,
      label: `Trung vị F2L của ${splitF2l.length} lượt có Split gần nhất`,
    };
  }

  const validTotals = recentRegular3x3Solves
    .map(getEffectiveMs)
    .filter((v): v is number => typeof v === "number")
    .slice(-12);

  if (validTotals.length >= MIN_BASELINE_SAMPLES) {
    const mean = Math.round(
      validTotals.reduce((a, b) => a + b, 0) / validTotals.length
    );
    return {
      metric: "overall_3x3_mean",
      baselineMs: mean,
      stdDevMs: stdDev(validTotals),
      sampleCount: validTotals.length,
      label: `Trung bình ${validTotals.length} lượt 3x3 gần nhất (chưa đủ 5 lượt Split để lấy mốc F2L)`,
    };
  }

  return {
    metric: "none",
    baselineMs: null,
    stdDevMs: null,
    sampleCount: validTotals.length,
    label: `Chưa đủ mẫu chọn mốc (${validTotals.length}/${MIN_BASELINE_SAMPLES} lượt hợp lệ)`,
  };
}

export function createF2lWorkout(
  recentRegular3x3Solves: SolveLike[]
): GuidedWorkoutState {
  return {
    id: `workout_${Date.now()}`,
    startedAt: new Date().toISOString(),
    phase: "drill_f2l",
    targetDrillCount: 10,
    targetRemeasureCount: 5,
    drillSolveIds: [],
    remeasureSolveIds: [],
    remeasureF2lMs: [],
    remeasureTotalMs: [],
    baseline: computeWorkoutBaseline(recentRegular3x3Solves),
  };
}

export function recordWorkoutSolve(
  state: GuidedWorkoutState,
  solve: SolveLike
): GuidedWorkoutState {
  if (state.phase === "drill_f2l") {
    const nextIds = [...state.drillSolveIds, solve.id];
    const doneDrill = nextIds.length >= state.targetDrillCount;
    return {
      ...state,
      drillSolveIds: nextIds,
      phase: doneDrill ? "remeasure_splits" : "drill_f2l",
    };
  }

  if (state.phase === "remeasure_splits") {
    const eff = getEffectiveMs(solve);
    const hasF2lSplit =
      solve.penalty !== "DNF" &&
      Array.isArray(solve.splits_ms) &&
      solve.splits_ms.length === 4;

    // Only count valid split solves toward re-measurement when in remeasure_splits phase
    if (!hasF2lSplit || typeof eff !== "number") {
      return state;
    }

    const nextIds = [...state.remeasureSolveIds, solve.id];
    const nextF2l = [...state.remeasureF2lMs, solve.splits_ms![1]];
    const nextTotal = [...state.remeasureTotalMs, eff];
    const finished = nextIds.length >= state.targetRemeasureCount;

    return {
      ...state,
      remeasureSolveIds: nextIds,
      remeasureF2lMs: nextF2l,
      remeasureTotalMs: nextTotal,
      phase: finished ? "done" : "remeasure_splits",
    };
  }

  return state;
}

export interface WorkoutVerdict {
  status: "improved" | "slower" | "inconclusive" | "no_baseline";
  afterMs: number | null;
  deltaMs: number | null;
  deltaPct: number | null;
  message: string;
}

export function evaluateWorkoutOutcome(
  state: GuidedWorkoutState
): WorkoutVerdict {
  const { baseline } = state;
  if (baseline.metric === "none" || baseline.baselineMs === null) {
    return {
      status: "no_baseline",
      afterMs: state.remeasureF2lMs.length
        ? median(state.remeasureF2lMs)
        : null,
      deltaMs: null,
      deltaPct: null,
      message:
        "Đã hoàn thành bài tập, nhưng chưa đủ dữ liệu mốc ban đầu để kết luận mức cải thiện. Các lượt Split vừa rồi sẽ làm mốc cho lần tập sau.",
    };
  }

  const samples =
    baseline.metric === "f2l_split_median"
      ? state.remeasureF2lMs
      : state.remeasureTotalMs;

  if (samples.length < state.targetRemeasureCount) {
    return {
      status: "inconclusive",
      afterMs: samples.length ? median(samples) : null,
      deltaMs: null,
      deltaPct: null,
      message: `Cần đủ ${state.targetRemeasureCount} lượt đo lại có Split để so với mốc ban đầu.`,
    };
  }

  const afterMs =
    baseline.metric === "f2l_split_median"
      ? median(samples)
      : Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);

  const deltaMs = afterMs - baseline.baselineMs;
  const deltaPct = Number(((deltaMs / baseline.baselineMs) * 100).toFixed(1));
  // Guard against noise: require at least max(5% of baseline, 0.5 * baseline sigma)
  const thresholdMs = Math.max(
    baseline.baselineMs * 0.05,
    (baseline.stdDevMs ?? 0) * 0.5
  );

  if (deltaMs <= -thresholdMs) {
    return {
      status: "improved",
      afterMs,
      deltaMs,
      deltaPct,
      message: `Cải thiện rõ rệt (${deltaPct}% so với mốc ban đầu) trên ${samples.length} lượt đo lại.`,
    };
  }

  if (deltaMs >= thresholdMs) {
    return {
      status: "slower",
      afterMs,
      deltaMs,
      deltaPct,
      message: `Chậm hơn mốc ban đầu (${deltaPct > 0 ? "+" : ""}${deltaPct}%). Khi mới tập nhìn F2L chậm lại một chút là bình thường để quen Lookahead.`,
    };
  }

  return {
    status: "inconclusive",
    afterMs,
    deltaMs,
    deltaPct,
    message: `Chênh lệch nhỏ (${deltaPct > 0 ? "+" : ""}${deltaPct}%, nằm trong biên dao động tự nhiên). Chưa đủ bằng chứng kết luận — tiếp tục duy trì thêm 1–2 buổi.`,
  };
}
