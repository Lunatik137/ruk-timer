import type { CubeSession } from "@/types/cubing";

export type VideoSolveContext = {
  sessionId: CubeSession["id"];
  puzzle: CubeSession["puzzle"];
  scramble: string;
};

export const videoPhases = ["start", "cross", "f2l", "oll", "pll"] as const;
export type VideoPhase = (typeof videoPhases)[number];
export type VideoMarks = Record<VideoPhase, number | null>;

export function suggestVideoMarks(marks: VideoMarks, duration: number): VideoMarks {
  const start = marks.start ?? 0;
  const span = (marks.pll ?? duration) - start;
  return {
    start,
    cross: marks.cross ?? start + span * 0.14,
    f2l: marks.f2l ?? start + span * 0.64,
    oll: marks.oll ?? start + span * 0.8,
    pll: marks.pll ?? duration,
  };
}

export function getVideoSplits(marks: VideoMarks, duration: number | null) {
  const times = videoPhases.map((phase) => marks[phase]);
  const invalid = "Các mốc phải nằm trong clip và theo thứ tự Start → Cross → F2L → OLL → PLL.";
  if (duration === null || !Number.isFinite(duration) || duration <= 0) {
    return { result: null, error: null };
  }
  let previous: number | null = null;
  for (const time of times) {
    if (time === null) continue;
    if (!Number.isFinite(time) || time < 0 || time > duration ||
        (previous !== null && time <= previous)) {
      return { result: null, error: invalid };
    }
    previous = time;
  }
  if (!times.every((time): time is number => time !== null)) {
    return { result: null, error: null };
  }
  const start = times[0];
  const totalMs = Math.min(Math.round((times[4] - start) * 1000), Math.floor(duration * 1000));
  const elapsed = [0, ...times.slice(1, -1).map((time) => Math.round((time - start) * 1000)), totalMs];
  const splitsMs = elapsed.slice(1).map((time, index) => time - elapsed[index]);
  if (splitsMs.some((split) => split <= 0)) {
    return { result: null, error: "Hai mốc quá gần nhau. Hãy chọn lại khung hình." };
  }
  return { result: { totalMs, splitsMs }, error: null };
}

function waitForMedia(
  video: HTMLVideoElement,
  event: "loadedmetadata" | "seeked" | "loadeddata",
  signal: AbortSignal,
  action?: () => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted || video.error) {
      resolve(false);
      return;
    }
    const loaded = () => finish(true);
    const failed = () => finish(false);
    const timeout = setTimeout(failed, 4000);
    function finish(ok: boolean) {
      clearTimeout(timeout);
      video.removeEventListener(event, loaded);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", failed);
      resolve(ok);
    }
    video.addEventListener(event, loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", failed, { once: true });
    try {
      action?.();
    } catch {
      failed();
    }
  });
}

export async function seekVideo(video: HTMLVideoElement, time: number, signal: AbortSignal) {
  if (signal.aborted) return false;
  if (video.seeking || Math.abs(video.currentTime - time) > 0.001) {
    if (!await waitForMedia(video, "seeked", signal, () => { video.currentTime = time; })) {
      return false;
    }
  }
  if (Math.abs(video.currentTime - time) > 0.04 || video.seeking) return false;
  return video.readyState >= 2 || await waitForMedia(video, "loadeddata", signal);
}

export async function resolveVideoDuration(video: HTMLVideoElement, signal: AbortSignal) {
  if (signal.aborted) return null;
  if (video.readyState < 1 && !await waitForMedia(video, "loadedmetadata", signal)) {
    return null;
  }
  if (video.duration === Infinity) {
    // Unindexed MediaRecorder WebM can expose its duration only after decoding up to EOF.
    const originalTime = video.currentTime;
    await waitForMedia(video, "seeked", signal, () => { video.currentTime = Number.MAX_SAFE_INTEGER; });
    if (!signal.aborted) await seekVideo(video, originalTime, signal);
  }
  return !signal.aborted && Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : null;
}
