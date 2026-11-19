"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { formatTimeMs } from "@/lib/stats";
import { videoPhaseLabels, videoPhases, type VideoMarks, type VideoMarkOrigins, type VideoPhase } from "@/lib/videoAnalysis";

interface VideoTimelineProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  duration: number | null;
  marks: VideoMarks;
  origins: VideoMarkOrigins;
  decimals: 2 | 3;
  onStamp: (phase: VideoPhase, time: number) => void;
}

const fallbackFrameStep = 1 / 30;

export default function VideoTimeline({ videoRef, duration, marks, origins, decimals, onStamp }: VideoTimelineProps) {
  const [phase, setPhase] = useState<VideoPhase>("start");
  const [time, setTime] = useState(0);
  const limit = duration ?? 0;
  const cursor = Math.min(time, limit);

  const [seeking, setSeeking] = useState(false);
  const frameStep = useRef(fallbackFrameStep);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setTime(video.currentTime);
      setSeeking(video.seeking);
    };
    const events = ["timeupdate", "seeking", "seeked"] as const;
    events.forEach((event) => video.addEventListener(event, sync));
    sync();

    let previousFrame: VideoFrameCallbackMetadata | null = null;
    let callbackId: number | undefined;
    const resetSample = () => { previousFrame = null; };
    const sampleFrame: VideoFrameRequestCallback = (_, frame) => {
      if (previousFrame && !video.seeking && !video.paused) {
        const presented = frame.presentedFrames - previousFrame.presentedFrames;
        const interval = (frame.mediaTime - previousFrame.mediaTime) / presented;
        if (interval >= 1 / 240 && interval <= 1 / 5) frameStep.current = interval;
      }
      previousFrame = video.paused ? null : frame;
      callbackId = video.requestVideoFrameCallback(sampleFrame);
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      video.addEventListener("seeking", resetSample);
      callbackId = video.requestVideoFrameCallback(sampleFrame);
    }
    return () => {
      events.forEach((event) => video.removeEventListener(event, sync));
      video.removeEventListener("seeking", resetSample);
      if (callbackId !== undefined) video.cancelVideoFrameCallback(callbackId);
    };
  }, [videoRef]);

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.pause();
    const target = Math.max(0, Math.min(duration, value));
    setTime(target);
    video.currentTime = target;
  };

  return (
    <fieldset
      disabled={!duration}
      className="min-w-0 space-y-3 rounded-xl border border-white/10 bg-black/25 p-3 disabled:opacity-60"
    >
      <legend className="px-1 text-sm font-semibold text-white">Timeline CFOP</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {videoPhases.map((key) => {
          const stamp = marks[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={phase === key}
              onClick={() => {
                setPhase(key);
                if (stamp !== null) seek(stamp);
              }}
              className="min-h-12 rounded-lg border border-white/15 bg-white/5 px-1 py-2 text-xs text-slate-200 hover:bg-white/10 aria-pressed:border-cyan-400 aria-pressed:text-cyan-200"
            >
              <span className="block font-semibold">{videoPhaseLabels[key]}</span>
              <span className="block tabular-nums">
                {stamp === null ? "Chưa có mốc" : formatTimeMs(stamp * 1000, decimals)}
              </span>
              {origins[key] && (
                <span className={origins[key] === "user" ? "text-emerald-300" : "text-amber-200"}>
                  {origins[key] === "user" ? "Bạn chốt" : "Hệ thống gợi ý"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="space-y-1">
        <div aria-hidden="true" className="relative mx-2 h-2 rounded-full bg-white/10">
          {duration && videoPhases.map((key) => {
            const stamp = marks[key];
            return stamp === null ? null : (
              <span
                key={key}
                className={`absolute top-0 h-2 w-1 -translate-x-1/2 rounded-full ${
                  origins[key] === "user" ? "bg-emerald-300" : "bg-amber-200"
                }`}
                style={{ left: `${Math.min(100, stamp / duration * 100)}%` }}
              />
            );
          })}
        </div>
        <input
          aria-label="Vị trí trên video"
          type="range"
          min={0}
          max={limit}
          step="any"
          value={cursor}
          onChange={(event) => seek(event.currentTarget.valueAsNumber)}
          className="h-8 w-full accent-cyan-400"
        />
        <div className="flex justify-between text-xs tabular-nums text-slate-300">
          <span>{formatTimeMs(cursor * 1000, decimals)}</span>
          <span>{formatTimeMs(duration === null ? null : duration * 1000, decimals)}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => seek(cursor - frameStep.current)} className="min-h-11 rounded-lg bg-white/10 px-3 hover:bg-white/15">
          Lùi ~1 khung
        </button>
        <button type="button" onClick={() => seek(cursor + frameStep.current)} className="min-h-11 rounded-lg bg-white/10 px-3 hover:bg-white/15">
          Tiến ~1 khung
        </button>
        <button
          type="button"
          disabled={seeking}
          onClick={() => {
            const video = videoRef.current;
            if (!video || video.seeking || video.readyState < 2) return;
            video.pause();
            onStamp(phase, video.currentTime);
          }}
          className="min-h-11 rounded-lg bg-cyan-500 px-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          Chốt mốc {videoPhaseLabels[phase]}
        </button>
      </div>
    </fieldset>
  );
}
