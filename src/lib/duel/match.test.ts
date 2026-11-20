import { describe, expect, it } from "vitest";
import { createMatch, currentTurn, recordResult, resultFor, viewFor, type DuelMatch } from "./match";

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
    const next = recordResult(second, 1, ok(12_000));
    expect(next.history[0].scramble).toBe("R U F");
    expect(resultFor(next, 1, 0)).toEqual(ok(10_000));
    expect(currentTurn(next)).toBe(1);
    expect(currentTurn(recordResult(next, 1, ok(11_000)))).toBe(0);
  });

  it("tính +2, DNF và hòa theo centisecond", () => {
    let match = recordResult(start(), 0, { ms: 10_004, penalty: "+2" });
    match = recordResult(match, 1, ok(12_009));
    expect(match.points).toEqual([0, 0]);
    match = recordResult(match, 1, { ms: 0, penalty: "DNF" });
    match = recordResult(match, 0, ok(18_000));
    expect(match.points).toEqual([1, 0]);
    match = recordResult(match, 0, { ms: 0, penalty: "DNF" });
    match = recordResult(match, 1, { ms: 0, penalty: "DNF" });
    expect(match.points).toEqual([1, 0]);
  });

  it("thắng set rồi đặt lại điểm và chỉ kết thúc khi đủ số set", () => {
    const afterSet = recordResult(recordResult(start(1), 0, ok(8_000)), 1, ok(9_000));
    expect(afterSet).toMatchObject({ sets: [1, 0], points: [0, 0], winner: null, round: { set: 2, first: 1 } });
    const final = recordResult(recordResult(afterSet, 1, ok(9_000)), 0, ok(8_000));
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
