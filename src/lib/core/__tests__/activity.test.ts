import { describe, expect, it } from "vitest";
import {
  computeActivity,
  computeWeeklyReport,
  dayKey,
  weekStartKey,
  type ActivitySolve,
} from "../activity";

function makeSolve(
  id: string,
  solved_at: string,
  opts?: Partial<ActivitySolve>
): ActivitySolve {
  return {
    id,
    session_id: opts?.session_id ?? "main-3x3",
    puzzle: opts?.puzzle ?? "3x3",
    time_ms: opts?.time_ms ?? 12000,
    penalty: opts?.penalty ?? "OK",
    solved_at,
  };
}

describe("activity & weekly report (Monday-start, IANA TZ, DST-safe)", () => {
  it("handles midnight boundary in Asia/Ho_Chi_Minh (+07:00)", () => {
    const tz = "Asia/Ho_Chi_Minh";
    // 2026-05-04 23:59 +07:00 (Monday) & 2026-05-05 00:01 +07:00 (Tuesday)
    const s1 = makeSolve("s1", "2026-05-04T16:59:00.000Z");
    const s2 = makeSolve("s2", "2026-05-04T17:01:00.000Z");

    expect(dayKey(s1.solved_at, tz)).toBe("2026-05-04");
    expect(dayKey(s2.solved_at, tz)).toBe("2026-05-05");

    const res = computeActivity([s1, s2], {
      tz,
      now: new Date("2026-05-05T10:00:00+07:00"),
    });
    expect(res.currentStreak).toBe(2);
    expect(res.longestStreak).toBe(2);
    expect(res.todayCount).toBe(1);
    expect(res.activeDaysCount).toBe(2);
  });

  it("starts weeks on Monday and compares partial current week fairly with same elapsed days last week", () => {
    const tz = "Asia/Ho_Chi_Minh";
    // Now = Wednesday 2026-05-06 (elapsedDays = 3: Mon 4, Tue 5, Wed 6)
    // Last week = Mon Apr 27 .. Sun May 3; lastWeekToDate = Apr 27, 28, 29
    expect(weekStartKey("2026-05-06")).toBe("2026-05-04");
    expect(weekStartKey("2026-05-03")).toBe("2026-04-27"); // Sunday belongs to previous Monday

    const solves: ActivitySolve[] = [
      // Last week Mon-Wed (lastWeekToDate): 20000ms mean
      makeSolve("lw1", "2026-04-27T10:00:00+07:00", { time_ms: 20000 }),
      makeSolve("lw2", "2026-04-29T10:00:00+07:00", { time_ms: 20000 }),
      // Last week Sun (outside lastWeekToDate, inside lastWeekFull)
      makeSolve("lw3", "2026-05-03T23:55:00+07:00", { time_ms: 10000 }),
      // This week Mon-Wed: 18000ms mean (-10% faster vs lastWeekToDate)
      makeSolve("tw1", "2026-05-04T00:05:00+07:00", { time_ms: 18000 }),
      makeSolve("tw2", "2026-05-06T09:00:00+07:00", { time_ms: 18000 }),
    ];

    const report = computeWeeklyReport(solves, {
      tz,
      now: new Date("2026-05-06T12:00:00+07:00"),
    });

    expect(report.weekStart).toBe("2026-05-04");
    expect(report.today).toBe("2026-05-06");
    expect(report.elapsedDays).toBe(3);
    expect(report.isCurrentWeekComplete).toBe(false);
    expect(report.thisWeek.practiceCount).toBe(2);
    expect(report.lastWeekToDate.practiceCount).toBe(2);
    expect(report.lastWeekFull.practiceCount).toBe(3);
    expect(report.thisWeek.meanMs).toBe(18000);
    expect(report.lastWeekToDate.meanMs).toBe(20000);
    expect(report.meanDeltaPct).toBe(-10);
  });

  it("handles DST spring-forward and fall-back in America/New_York without breaking streak", () => {
    const tz = "America/New_York";
    // Spring-forward: 2025-03-09 (23h day)
    const springSolves = [
      makeSolve("sp1", "2025-03-08T12:00:00-05:00"),
      makeSolve("sp2", "2025-03-09T12:00:00-04:00"),
      makeSolve("sp3", "2025-03-10T12:00:00-04:00"),
    ];
    const spRes = computeActivity(springSolves, {
      tz,
      now: new Date("2025-03-10T18:00:00-04:00"),
    });
    expect(spRes.currentStreak).toBe(3);
    expect(spRes.longestStreak).toBe(3);

    // Fall-back: 2025-11-02 (25h day)
    const fallSolves = [
      makeSolve("fb1", "2025-11-01T12:00:00-04:00"),
      makeSolve("fb2", "2025-11-02T12:00:00-05:00"),
      makeSolve("fb3", "2025-11-03T12:00:00-05:00"),
    ];
    const fbRes = computeActivity(fallSolves, {
      tz,
      now: new Date("2025-11-03T18:00:00-05:00"),
    });
    expect(fbRes.currentStreak).toBe(3);
    expect(fbRes.longestStreak).toBe(3);
  });

  it("keeps streak alive when today is unpracticed if yesterday was practiced, and breaks after 1 missed day", () => {
    const tz = "Asia/Ho_Chi_Minh";
    const solves = [
      makeSolve("d1", "2026-05-03T10:00:00+07:00"),
      makeSolve("d2", "2026-05-04T10:00:00+07:00"),
    ];
    const onMay5 = computeActivity(solves, {
      tz,
      now: new Date("2026-05-05T15:00:00+07:00"),
    });
    expect(onMay5.todayCount).toBe(0);
    expect(onMay5.currentStreak).toBe(2);

    const onMay6 = computeActivity(solves, {
      tz,
      now: new Date("2026-05-06T15:00:00+07:00"),
    });
    expect(onMay6.currentStreak).toBe(0);
    expect(onMay6.longestStreak).toBe(2);
  });

  it("counts +2, DNF, CFOP drill in activity/streak, excludes drill from weekly speed mean, and deduplicates by id", () => {
    const tz = "Asia/Ho_Chi_Minh";
    const drillIds = new Set(["cfop-pll-t"]);
    const solves: ActivitySolve[] = [
      makeSolve("a1", "2026-05-04T09:00:00+07:00", {
        time_ms: 10000,
        penalty: "+2", // effective 12000
      }),
      makeSolve("a1", "2026-05-04T09:00:00+07:00", {
        time_ms: 10000,
        penalty: "+2", // duplicate ID -> must be ignored
      }),
      makeSolve("a2", "2026-05-05T09:00:00+07:00", {
        time_ms: 9000,
        penalty: "DNF", // counts for activity/streak, excluded from valid mean
      }),
      makeSolve("a3", "2026-05-06T09:00:00+07:00", {
        session_id: "cfop-pll-t",
        time_ms: 1500, // fast CFOP drill -> counts for activity/streak, excluded from weekly performance
      }),
    ];

    const act = computeActivity(solves, {
      tz,
      now: new Date("2026-05-06T12:00:00+07:00"),
    });
    expect(act.currentStreak).toBe(3);
    expect(act.activeDaysCount).toBe(3);
    expect(act.todayCount).toBe(1);

    const rep = computeWeeklyReport(solves, {
      tz,
      now: new Date("2026-05-06T12:00:00+07:00"),
      drillSessionIds: drillIds,
    });
    expect(rep.thisWeek.practiceCount).toBe(3); // deduplicated a1, a2, a3
    expect(rep.thisWeek.mainCount).toBe(2); // a1, a2 (a3 excluded)
    expect(rep.thisWeek.validCount).toBe(1); // only a1
    expect(rep.thisWeek.dnfCount).toBe(1); // a2
    expect(rep.thisWeek.meanMs).toBe(12000); // a1 with +2 applied
  });

  it("handles multi-year history including leap year Feb 29", () => {
    const tz = "UTC";
    const solves = [
      makeSolve("y1", "2024-02-28T10:00:00Z"),
      makeSolve("y2", "2024-02-29T10:00:00Z"),
      makeSolve("y3", "2024-03-01T10:00:00Z"),
      makeSolve("y4", "2025-12-31T23:50:00Z"),
      makeSolve("y5", "2026-01-01T00:10:00Z"),
    ];
    const act = computeActivity(solves, {
      tz,
      now: new Date("2026-01-01T12:00:00Z"),
    });
    expect(act.currentStreak).toBe(2);
    expect(act.longestStreak).toBe(3);
    expect(act.activeDaysCount).toBe(5);
  });
});
