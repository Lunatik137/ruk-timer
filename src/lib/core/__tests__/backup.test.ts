import { describe, expect, it } from "vitest";
import {
  exportBackupJsonV3,
  exportSolvesCsvV2,
  parseBackup,
  planImport,
} from "../backup";
import type { CfopProgressItem, SessionLike, SolveLike } from "../types";

const sampleSessions: SessionLike[] = [
  {
    id: "sess-1",
    name: "3x3 Main",
    puzzle: "3x3",
    created_at: "2026-05-01T10:00:00.000Z",
  },
];

const sampleSolves: SolveLike[] = [
  {
    id: "solve-1",
    session_id: "sess-1",
    puzzle: "3x3",
    time_ms: 11230,
    penalty: "+2",
    scramble: "R U R' U' F2 D L2 B2",
    comment: "Good F2L",
    splits_ms: [1400, 5600, 1900, 2330],
    reconstruction: "z2 D R' F D2 U R U' R'",
    solved_at: "2026-05-01T10:05:00.000Z",
  },
  {
    id: "solve-2",
    session_id: "sess-1",
    puzzle: "3x3",
    time_ms: 14500,
    penalty: "DNF",
    scramble: "F R U' R' U' R U R' F'",
    comment: "Pop",
    solved_at: "2026-05-01T10:08:00.000Z",
  },
];

const sampleCfop: Record<string, CfopProgressItem> = {
  "pll-t": {
    alg_id: "pll-t",
    status: "mastered",
    preferred_formula: "R U R' U' R' F R2 U' R' U' R U R' F'",
    ease_factor: 2.6,
    interval_days: 14,
    repetitions: 4,
    next_review_at: "2026-05-15T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
  },
};

describe("backup export, import preview & deduplication", () => {
  it("round-trips RukTimer v3 JSON preserving splits, penalties, reconstruction, CFOP SRS & practice set", () => {
    const json = exportBackupJsonV3({
      sessions: sampleSessions,
      solves: sampleSolves,
      cfopProgress: sampleCfop,
      practiceSetIds: ["pll-t", "oll-27", "f2l-01"],
    });

    const parsed = parseBackup(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.sourceFormat).toBe("RukTimer JSON");
    expect(parsed!.solves).toHaveLength(2);
    expect(parsed!.solves[0].splits_ms).toEqual([1400, 5600, 1900, 2330]);
    expect(parsed!.solves[0].penalty).toBe("+2");
    expect(parsed!.solves[0].reconstruction).toBe("z2 D R' F D2 U R U' R'");
    expect(parsed!.solves[1].penalty).toBe("DNF");
    expect(parsed!.cfopProgress["pll-t"].interval_days).toBe(14);
    expect(parsed!.practiceSetIds).toEqual(["pll-t", "oll-27", "f2l-01"]);

    // Import into empty state
    const plan1 = planImport(
      { sessions: [], solves: [], cfopProgress: {}, practiceSetIds: [] },
      parsed!
    );
    expect(plan1.newSolves).toHaveLength(2);
    expect(plan1.duplicateSolves).toBe(0);

    // Re-importing the exact same backup yields 0 new solves and 2 duplicates skipped
    const plan2 = planImport(
      {
        sessions: plan1.mergedSessions,
        solves: plan1.mergedSolves,
        cfopProgress: plan1.mergedCfopProgress,
        practiceSetIds: plan1.mergedPracticeSetIds,
      },
      parsed!
    );
    expect(plan2.newSolves).toHaveLength(0);
    expect(plan2.duplicateSolves).toBe(2);
  });

  it("round-trips RukTimer CSV v2 preserving splits, +2/DNF & reconstruction and deduplicates on re-import", () => {
    const csv = exportSolvesCsvV2(
      sampleSolves,
      new Map([["sess-1", "3x3 Main"]])
    );
    const parsed = parseBackup(csv);
    expect(parsed).not.toBeNull();
    expect(parsed!.sourceFormat).toBe("CSV");
    expect(parsed!.solves).toHaveLength(2);
    expect(parsed!.solves[0].splits_ms).toEqual([1400, 5600, 1900, 2330]);
    expect(parsed!.solves[0].reconstruction).toBe("z2 D R' F D2 U R U' R'");

    const first = planImport(
      { sessions: [], solves: [], cfopProgress: {}, practiceSetIds: [] },
      parsed!
    );
    expect(first.newSolves).toHaveLength(2);

    const second = planImport(
      {
        sessions: first.mergedSessions,
        solves: first.mergedSolves,
        cfopProgress: {},
        practiceSetIds: [],
      },
      parsed!
    );
    expect(second.newSolves).toHaveLength(0);
    expect(second.duplicateSolves).toBe(2);
  });

  it("imports csTimer export and prevents duplicates when imported twice", () => {
    const csTimer = JSON.stringify({
      session1: [
        [[0, 10450], "R U R' U' F2 D'", "clean", 1714500000],
        [[2000, 12300], "L D2 B2 R'", "+2", 1714500100],
        [[-1, 9800], "U2 F2 L2", "pop", 1714500200],
      ],
      properties: {
        sessionData: JSON.stringify({
          "1": { name: "3x3 WCA", opt: { scrType: "333" } },
        }),
      },
    });

    const parsed = parseBackup(csTimer);
    expect(parsed).not.toBeNull();
    expect(parsed!.sourceFormat).toBe("csTimer");
    expect(parsed!.solves.map((s) => s.penalty)).toEqual(["OK", "+2", "DNF"]);

    const first = planImport(
      { sessions: [], solves: [], cfopProgress: {}, practiceSetIds: [] },
      parsed!
    );
    expect(first.newSolves).toHaveLength(3);

    const second = planImport(
      {
        sessions: first.mergedSessions,
        solves: first.mergedSolves,
        cfopProgress: {},
        practiceSetIds: [],
      },
      parsed!
    );
    expect(second.newSolves).toHaveLength(0);
    expect(second.duplicateSolves).toBe(3);
  });
});
