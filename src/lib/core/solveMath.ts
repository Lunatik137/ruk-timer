import type { Penalty } from "./types";

export function getEffectiveMs(solve: {
  time_ms: number;
  penalty: Penalty;
}): number | "DNF" {
  if (solve.penalty === "DNF") return "DNF";
  if (solve.penalty === "+2") return solve.time_ms + 2000;
  return solve.time_ms;
}

/** Mean of N (no trimming; any DNF makes the result DNF). */
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
 * WCA trimmed average of the last `n` values (Ao5, Ao12, Ao50, Ao100).
 * Drops ceil(n * 5%) best and worst (min 1 each). DNF counts as the worst.
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
