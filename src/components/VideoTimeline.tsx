"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { formatTimeMs } from "@/lib/stats";
import {
  videoPhaseLabels,
  videoPhases,
  type VideoMarks,
  type VideoMarkOrigins,
  type VideoPhase,
} from "@/lib/videoAnalysis";

interface VideoTimelineProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  duration: number | null;
  marks: VideoMarks;
  origins: VideoMarkOrigins;
  decimals: 2 | 3;
  playbackRate: number;
  selectedPhase?: VideoPhase;
  onSelectPhase?: (phase: VideoPhase) => void;
  onPlaybackRateChange: (rate: number) => void;
  onStamp: (phase: VideoPhase, time: number) => void;
}

const fallbackFrameStep = 1 / 30;
const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1] as const;

export default function VideoTimeline({
  videoRef,
  duration,
  marks,
  origins,
  decimals,
  playbackRate,
  selectedPhase,
  onSelectPhase,
  onPlaybackRateChange,
  onStamp,
}: VideoTimelineProps) {
  const [internalPhase, setInternalPhase] = useState<VideoPhase>("start");
  const phase = selectedPhase ?? internalPhase;
  const setPhase = (next: VideoPhase) => {
    setInternalPhase(next);
    onSelectPhase?.(next);
  };

  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const limit = duration ?? 0;
  const cursor = Math.min(time, limit);
  const frameStep = useRef(fallbackFrameStep);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setTime(video.currentTime);
      setSeeking(video.seeking);
      setIsPlaying(!video.paused && !video.ended);
    };
    const events = [
      "timeupdate",
      "seeking",
      "seeked",
      "play",
      "pause",
      "ended",
      "loadedmetadata",
    ] as const;
    events.forEach((event) => video.addEventListener(event, sync));
    sync();

    let previousFrame: VideoFrameCallbackMetadata | null = null;
    let callbackId: number | undefined;
    const resetSample = () => {
      previousFrame = null;
    };
    const sampleFrame: VideoFrameRequestCallback = (_, frame) => {
      if (previousFrame && !video.seeking && !video.paused) {
        const presented = frame.presentedFrames - previousFrame.presentedFrames;
        const interval = (frame.mediaTime - previousFrame.mediaTime) / presented;
        if (interval >= 1 / 240 && interval <= 1 / 5) {
          frameStep.current = interval;
        }
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
    setIsPlaying(false);
    video.currentTime = target;
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !duration) return;
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  return (
    <fieldset
      disabled={!duration}
      className="min-w-0 space-y-2.5 p-2.5 sm:p-3 disabled:opacity-60"
    >
      <legend className="sr-only">Timeline CFOP và điều khiển phát video</legend>

      {/* Shared Transport Bar: Play/Pause + Single Time Readout + Speed */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Tạm dừng video" : "Phát video"}
            className="min-h-11 min-w-11 rounded-lg border border-white/15 bg-white/10 hover:bg-white/15 text-white inline-flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
          <div className="text-xs font-mono tabular-nums text-slate-200 whitespace-nowrap">
            <span className="text-white font-semibold">
              {formatTimeMs(cursor * 1000, decimals)}
            </span>
            <span className="text-slate-400 mx-1">/</span>
            <span className="text-slate-300" title="Thời lượng video">
              {formatTimeMs(duration === null ? null : duration * 1000, decimals)}
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Tốc độ phát video"
        >
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              aria-pressed={playbackRate === rate}
              onClick={() => onPlaybackRateChange(rate)}
              className={`min-h-9 px-2 rounded-lg font-mono text-[11px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                playbackRate === rate
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold"
                  : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Shared Scrubber with CFOP Phase Markers */}
      <div className="space-y-1">
        <div
          aria-hidden="true"
          className="relative mx-2 h-2 rounded-full bg-white/10"
        >
          {duration &&
            videoPhases.map((key) => {
              const stamp = marks[key];
              return stamp === null ? null : (
                <span
                  key={key}
                  className={`absolute top-0 h-2 w-1.5 -translate-x-1/2 rounded-full ${
                    origins[key] === "user" ? "bg-emerald-300" : "bg-amber-200"
                  }`}
                  style={{ left: `${Math.min(100, (stamp / duration) * 100)}%` }}
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
          className="h-8 w-full cursor-pointer accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
        />
      </div>

      {/* Frame Step & Stamp Controls — Directly adjacent to video & scrubber */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
        <button
          type="button"
          onClick={() => seek(cursor - frameStep.current)}
          className="min-h-11 rounded-lg border border-white/10 bg-white/10 px-2.5 sm:px-3 text-slate-100 hover:bg-white/15 inline-flex items-center gap-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <SkipBack className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Lùi ~1 khung</span>
        </button>
        <button
          type="button"
          onClick={() => seek(cursor + frameStep.current)}
          className="min-h-11 rounded-lg border border-white/10 bg-white/10 px-2.5 sm:px-3 text-slate-100 hover:bg-white/15 inline-flex items-center gap-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <span>Tiến ~1 khung</span>
          <SkipForward className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={seeking}
          onClick={() => {
            const video = videoRef.current;
            if (!video || video.seeking || video.readyState < 2) return;
            video.pause();
            setIsPlaying(false);
            onStamp(phase, video.currentTime);
          }}
          className="min-h-11 flex-1 sm:flex-initial rounded-lg bg-cyan-500 px-3.5 font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Chốt mốc {videoPhaseLabels[phase]}
        </button>
      </div>

      {/* 5 CFOP Phase Mark Buttons */}
      <div className="grid grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-5 gap-1.5">
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
              className="min-w-0 min-h-12 rounded-lg border border-white/15 bg-white/5 px-1.5 py-1.5 text-center text-xs text-slate-200 hover:bg-white/10 aria-pressed:border-cyan-400 aria-pressed:bg-cyan-500/15 aria-pressed:text-cyan-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <span className="block font-semibold truncate">
                {videoPhaseLabels[key]}
              </span>
              <span className="block font-mono text-[11px] tabular-nums truncate">
                {stamp === null
                  ? "Chưa chốt"
                  : formatTimeMs(stamp * 1000, decimals)}
              </span>
              {origins[key] && (
                <span
                  className={`block text-[10px] leading-tight truncate ${
                    origins[key] === "user"
                      ? "text-emerald-300"
                      : "text-amber-200"
                  }`}
                >
                  {origins[key] === "user" ? "Bạn chốt" : "Hệ thống gợi ý"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
