import { describe, expect, it } from "vitest";
import { getVideoSplits, resolveVideoDuration, suggestVideoMarks } from "./videoAnalysis";

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
