import { describe, expect, it } from "vitest";
import type { Solve } from "@/types/cubing";
import { getRecentSplitMedians, getVideoSplits, resolveVideoDuration, suggestVideoMarks } from "./videoAnalysis";

describe("Video Analyzer timeline", () => {
  const marks = { start: 2, cross: 4, f2l: 12, oll: 15, pll: 20 };

  it("uses the real clip endpoint and preserves user marks when scanning again", () => {
    const suggested = suggestVideoMarks({ ...marks, cross: null, pll: null }, 20);
    expect(suggested).toMatchObject({ start: 2, f2l: 12, oll: 15, pll: 20 });
    expect(suggested.cross).toBeCloseTo(4.52);
    expect(getVideoSplits(marks, 20).result).toEqual({
      totalMs: 18_000,
      splitsMs: [2000, 8000, 3000, 5000],
    });
  });

  it.each([{ cross: 2 }, { f2l: 3 }, { pll: 20.01 }, { start: -1 }])(
    "rejects invalid marks %j",
    (override) => {
      expect(getVideoSplits({ ...marks, ...override }, 20)).toEqual({
        result: null,
        error: expect.any(String),
      });
    }
  );

  it("waits for metadata and recovers an initially unbounded duration from the media", async () => {
    class FakeWebM extends EventTarget {
      readyState = 0;
      duration = NaN;
      time = 0;
      get currentTime() { return this.time; }
      set currentTime(value: number) {
        this.time = Math.min(value, 20);
        queueMicrotask(() => {
          this.duration = 20;
          this.dispatchEvent(new Event("seeked"));
        });
      }
    }
    const video = new FakeWebM();
    const duration = resolveVideoDuration(
      video as unknown as HTMLVideoElement,
      new AbortController().signal
    );
    video.readyState = 2;
    video.duration = Infinity;
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(await duration).toBe(20);
    expect(video.currentTime).toBe(0);
  });

  it("rejects Infinity when seeking does not establish a real end", async () => {
    const video = Object.assign(new EventTarget(), {
      readyState: 2,
      duration: Infinity,
      get currentTime() { return 0; },
    });
    Object.defineProperty(video, "currentTime", {
      get: () => 0,
      set: () => video.dispatchEvent(new Event("seeked")),
    });
    expect(await resolveVideoDuration(
      video as unknown as HTMLVideoElement,
      new AbortController().signal
    )).toBeNull();
  });
});

describe("recent Video Analyzer split comparison", () => {
  const cutoff = Date.UTC(2026, 0, 31);
  const solved = (day: number, f2l: number, overrides: Partial<Solve> = {}): Solve => ({
    id: String(day),
    session_id: "practice",
    puzzle: "3x3",
    time_ms: 6000 + f2l,
    penalty: "OK",
    scramble: "",
    comment: "",
    solved_at: new Date(Date.UTC(2026, 0, day)).toISOString(),
    splits_ms: [1000, f2l, 2000, 3000],
    ...overrides,
  });

  it("uses the median of the latest 20 eligible solves before the draft", () => {
    const history = Array.from({ length: 22 }, (_, i) => solved(i + 1, 3000 + i * 100));
    history.push(
      solved(25, 500, { puzzle: "2x2" }),
      solved(26, 500, { penalty: "DNF" }),
      solved(27, 500, { splits_ms: [1000, 1500, 3500, 6500] }),
      solved(28, 500, { splits_ms: undefined }),
      solved(31, 500),
    );
    expect(getRecentSplitMedians(history.reverse(), "3x3", cutoff)).toEqual({
      count: 20,
      medians: [1000, 4150, 2000, 3000],
    });
  });

  it("returns no comparison without eligible history for this puzzle", () => {
    expect(getRecentSplitMedians([solved(1, 3000)], "2x2", cutoff)).toBeNull();
  });
});
