import { describe, expect, it } from "vitest";
import {
  createPracticeQueue,
  drawNextFromPracticeQueue,
} from "../practiceQueue";
import {
  createF2lWorkout,
  evaluateWorkoutOutcome,
  recordWorkoutSolve,
} from "../workout";
import type { SolveLike } from "../types";

function makeSplitSolve(
  id: string,
  f2lMs: number,
  totalMs = 15000
): SolveLike {
  return {
    id,
    session_id: "main",
    puzzle: "3x3",
    time_ms: totalMs,
    penalty: "OK",
    scramble: "R U R' U'",
    comment: "",
    splits_ms: [2000, f2lMs, 2500, totalMs - 4500 - f2lMs],
    solved_at: new Date().toISOString(),
  };
}

describe("custom CFOP practice queue & guided F2L workout", () => {
  it("visits every case once per round without consecutive boundary repeat, and supports 1-case set", () => {
    let q = createPracticeQueue(["f2l-01", "oll-27", "pll-t"]);
    const round1: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = drawNextFromPracticeQueue(q);
      round1.push(res.caseId!);
      q = res.nextState;
    }
    expect(new Set(round1).size).toBe(3);
    expect(q.roundNumber).toBe(1);

    // Next draw starts round 2 and does not immediately repeat the last case of round 1
    const firstOfRound2 = drawNextFromPracticeQueue(q);
    expect(firstOfRound2.nextState.roundNumber).toBe(2);
    expect(firstOfRound2.caseId).not.toBe(round1[2]);

    // 1-case set works cleanly across multiple rounds
    let singleQ = createPracticeQueue(["pll-jb"]);
    for (let i = 0; i < 3; i++) {
      const r = drawNextFromPracticeQueue(singleQ);
      expect(r.caseId).toBe("pll-jb");
      singleQ = r.nextState;
    }
    expect(singleQ.roundNumber).toBe(3);
  });

  it("runs guided F2L workout baseline -> 10 drills -> 5 split remeasures and guards against noise", () => {
    const baselineSolves = [
      makeSplitSolve("b1", 8000),
      makeSplitSolve("b2", 8100),
      makeSplitSolve("b3", 7900),
      makeSplitSolve("b4", 8000),
      makeSplitSolve("b5", 8000),
    ];

    let w = createF2lWorkout(baselineSolves);
    expect(w.baseline.metric).toBe("f2l_split_median");
    expect(w.baseline.baselineMs).toBe(8000);
    expect(w.phase).toBe("drill_f2l");

    for (let i = 0; i < 10; i++) {
      w = recordWorkoutSolve(w, makeSplitSolve(`d${i}`, 6000, 10000));
    }
    expect(w.phase).toBe("remeasure_splits");

    // 5 remeasure split solves at 7000ms (-12.5% improvement -> "improved")
    for (let i = 0; i < 5; i++) {
      w = recordWorkoutSolve(w, makeSplitSolve(`r${i}`, 7000, 14000));
    }
    expect(w.phase).toBe("done");
    const verdict = evaluateWorkoutOutcome(w);
    expect(verdict.status).toBe("improved");
    expect(verdict.deltaPct).toBe(-12.5);
  });

  it("returns no_baseline when fewer than 5 valid solves exist", () => {
    const w = createF2lWorkout([makeSplitSolve("only1", 8000)]);
    expect(w.baseline.metric).toBe("none");
    expect(evaluateWorkoutOutcome(w).status).toBe("no_baseline");
  });
});
