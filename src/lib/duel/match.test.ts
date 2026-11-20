import { describe, expect, it } from "vitest";
import { approveResult, canSolve, createMatch, currentTurn, markReady, recordResult, resultFor, viewFor, type DuelMatch } from "./match";

function start(pointsToWin = 2, setsToWin = 2): DuelMatch {
  const match = createMatch({ puzzle: "3x3", setsToWin, pointsToWin });
  return { ...match, players: ["A", "B"], started: true, round: { ...match.round, scramble: "R U F" } };
}

const ok = (ms: number) => ({ ms, penalty: "OK" as const });

describe("đấu luân phiên", () => {
  it("khóa lượt ngoài thứ tự và đổi người giải trước trên mỗi Scramble", () => {
    const initial = start();
    expect(currentTurn(initial)).toBe(0);
    expect(() => recordResult(initial, 1, ok(12_000))).toThrow();
    const second = recordResult(initial, 0, ok(10_000));
    expect(currentTurn(second)).toBe(1);
    expect(second.round.scramble).toBe("R U F");
    const next = approveResult(recordResult(second, 1, ok(12_000)), null);
    expect(next.history[0].scramble).toBe("R U F");
    expect(resultFor(next, 1, 0)).toEqual(ok(10_000));
    expect(currentTurn(next)).toBe(1);
    expect(currentTurn(recordResult(next, 1, ok(11_000)))).toBe(0);
  });

  it("tính +2, DNF và hòa theo centisecond", () => {
    let match = recordResult(start(), 0, { ms: 10_004, penalty: "+2" });
    match = approveResult(recordResult(match, 1, ok(12_009)), null);
    expect(match.points).toEqual([0, 0]);
    match = recordResult(match, 1, { ms: 0, penalty: "DNF" });
    match = approveResult(recordResult(match, 0, ok(18_000)), null);
    expect(match.points).toEqual([1, 0]);
    match = recordResult(match, 0, { ms: 0, penalty: "DNF" });
    match = approveResult(recordResult(match, 1, { ms: 0, penalty: "DNF" }), null);
    expect(match.points).toEqual([1, 0]);
  });

  it("thắng set rồi đặt lại điểm và chỉ kết thúc khi đủ số set", () => {
    const afterSet = approveResult(recordResult(recordResult(start(1), 0, ok(8_000)), 1, ok(9_000)), null);
    expect(afterSet).toMatchObject({ sets: [1, 0], points: [0, 0], winner: null, round: { set: 2, first: 1 } });
    const final = approveResult(recordResult(recordResult(afterSet, 1, ok(9_000)), 0, ok(8_000)), null);
    expect(final).toMatchObject({ sets: [2, 0], winner: 0 });
    expect(currentTurn(final)).toBeNull();
  });

  it("giấu Scramble và kết quả chưa chốt khỏi người đang đợi và người xem", () => {
    const match = recordResult(start(), 0, ok(10_000));
    expect(viewFor(match, 1, "B", false, []).match.round).toMatchObject({
      scramble: "R U F", results: [null, null],
    });
    expect(viewFor(match, null, "C", false, ["C"]).match.round).toMatchObject({
      scramble: "", results: [null, null],
    });
    expect(viewFor(match, 0, "A", true, []).match.round).toMatchObject({
      scramble: "", results: [ok(10_000), null],
    });
  });
});

describe("đấu đồng thời và xác nhận", () => {
  it("cấp cùng Scramble cho hai người, chỉ mở đồng hồ khi cả hai sẵn sàng", () => {
    const initial = start();
    initial.settings.mode = "simultaneous";
    const oneReady = markReady(initial, 0);
    for (const seat of [0, 1] as const) {
      expect(viewFor(oneReady, seat, "Player", false, []).match.round.scramble).toBe("R U F");
      expect(canSolve(oneReady, seat)).toBe(false);
    }
    const bothReady = markReady(oneReady, 1);
    expect(canSolve(bothReady, 0)).toBe(true);
    expect(canSolve(bothReady, 1)).toBe(true);
    expect(viewFor(bothReady, null, "Viewer", false, []).match.round.scramble).toBe("");
  });

  it("giữ nguyên tỉ số cho đến khi có hai xác nhận hoặc một xác nhận của trọng tài", () => {
    const pending = recordResult(recordResult(start(), 0, ok(8000)), 1, ok(9000));
    expect(pending.points).toEqual([0, 0]);
    expect(pending.history).toHaveLength(0);
    const one = approveResult(pending, 1);
    expect(one.points).toEqual([0, 0]);
    expect(approveResult(one, 1).points).toEqual([0, 0]);
    expect(approveResult(one, 0).points).toEqual([1, 0]);
    expect(approveResult(pending, null).points).toEqual([1, 0]);
    expect(viewFor(pending, null, "Ref", false, ["Ref"], "Ref", true).match.round.results).toEqual([ok(8000), ok(9000)]);
    expect(viewFor(pending, null, "Viewer", false, []).match.round.results).toEqual([null, null]);
  });
});
