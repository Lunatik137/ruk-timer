"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Flag,
  Keyboard,
  MessageSquarePlus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  formatSolveDisplay,
  formatTimeMs,
  parseManualTimeInput,
} from "@/lib/stats";
import { playInspection12s, playInspection8s } from "@/lib/sound";
import { PenaltyType, Solve, TimerSettings } from "@/types/cubing";

export type TimerPhase =
  | "idle"
  | "holding_pre_inspect"
  | "ready_inspect"
  | "inspecting"
  | "holding"
  | "ready"
  | "running"
  | "just_stopped";

interface TimerDisplayProps {
  settings: TimerSettings;
  lastSolve: Solve | null;
  currentAo5: number | "DNF" | null;
  currentAo12: number | "DNF" | null;
  isNewPb: boolean;
  isModalOpen: boolean;
  onPhaseChange: (phase: TimerPhase) => void;
  onSolveComplete: (timeMs: number, initialPenalty: PenaltyType) => void;
  onUpdateLastPenalty: (penalty: PenaltyType) => void;
  onDeleteLastSolve: () => void;
  onCommentLastSolve: (comment: string) => void;
}

export default function TimerDisplay({
  settings,
  lastSolve,
  currentAo5,
  currentAo12,
  isNewPb,
  isModalOpen,
  onPhaseChange,
  onSolveComplete,
  onUpdateLastPenalty,
  onDeleteLastSolve,
  onCommentLastSolve,
}: TimerDisplayProps) {
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [displayMs, setDisplayMs] = useState<number>(0);
  const [inspectSecondsLeft, setInspectSecondsLeft] = useState<number>(15);
  const [inspectPenalty, setInspectPenalty] = useState<PenaltyType>("OK");
  const [manualText, setManualText] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [commentText, setCommentText] = useState("");

  const phaseRef = useRef<TimerPhase>("idle");
  const startTimeRef = useRef<number>(0);
  const inspectStartRef = useRef<number>(0);
  const inspectPenaltyRef = useRef<PenaltyType>("OK");
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const inspectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alert8PlayedRef = useRef<boolean>(false);
  const alert12PlayedRef = useRef<boolean>(false);

  const updatePhase = useCallback(
    (next: TimerPhase) => {
      phaseRef.current = next;
      setPhase(next);
      onPhaseChange(next);

      // Mobile haptic feedback on state transitions
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        if (next === "ready" || next === "ready_inspect") {
          navigator.vibrate?.(20);
        } else if (next === "just_stopped") {
          navigator.vibrate?.(35);
        }
      }
    },
    [onPhaseChange]
  );

  // Keep mobile screen awake during inspection and solving
  useEffect(() => {
    const active =
      phase === "inspecting" ||
      phase === "running" ||
      phase === "holding" ||
      phase === "ready";
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let sentinel: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as {
      wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      .request("screen")
      .then((lock) => {
        sentinel = lock;
      })
      .catch(() => {});

    return () => {
      sentinel?.release().catch(() => {});
    };
  }, [phase]);

  // Sync display when lastSolve updates externally (e.g. session change or delete)
  useEffect(() => {
    if (phaseRef.current === "idle") {
      setDisplayMs(lastSolve ? lastSolve.time_ms : 0);
      setCommentText(lastSolve?.comment || "");
    }
  }, [lastSolve]);

  const clearHoldTimeout = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const stopInspectionLoop = () => {
    if (inspectIntervalRef.current) {
      clearInterval(inspectIntervalRef.current);
      inspectIntervalRef.current = null;
    }
  };

  const stopSolveRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearHoldTimeout();
      stopInspectionLoop();
      stopSolveRaf();
    };
  }, []);

  const beginInspection = useCallback(() => {
    stopInspectionLoop();
    inspectStartRef.current = performance.now();
    inspectPenaltyRef.current = "OK";
    setInspectPenalty("OK");
    setInspectSecondsLeft(15);
    alert8PlayedRef.current = false;
    alert12PlayedRef.current = false;
    updatePhase("inspecting");

    inspectIntervalRef.current = setInterval(() => {
      const elapsedSec = (performance.now() - inspectStartRef.current) / 1000;

      if (settings.soundEnabled) {
        if (elapsedSec >= 8 && !alert8PlayedRef.current) {
          alert8PlayedRef.current = true;
          playInspection8s();
        }
        if (elapsedSec >= 12 && !alert12PlayedRef.current) {
          alert12PlayedRef.current = true;
          playInspection12s();
        }
      }

      if (elapsedSec < 15) {
        setInspectSecondsLeft(Math.ceil(15 - elapsedSec));
        inspectPenaltyRef.current = "OK";
        setInspectPenalty("OK");
      } else if (elapsedSec < 17) {
        setInspectSecondsLeft(0);
        inspectPenaltyRef.current = "+2";
        setInspectPenalty("+2");
      } else {
        setInspectSecondsLeft(-1);
        inspectPenaltyRef.current = "DNF";
        setInspectPenalty("DNF");
      }
    }, 50);
  }, [settings.soundEnabled, updatePhase]);

  const beginRunningTimer = useCallback(() => {
    stopInspectionLoop();
    stopSolveRaf();
    startTimeRef.current = performance.now();
    setDisplayMs(0);
    setShowCommentBox(false);
    updatePhase("running");

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      setDisplayMs(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [updatePhase]);

  const finishRunningTimer = useCallback(() => {
    const finalMs = Math.max(10, Math.round(performance.now() - startTimeRef.current));
    stopSolveRaf();
    setDisplayMs(finalMs);
    const appliedPenalty = settings.inspectionEnabled
      ? inspectPenaltyRef.current
      : "OK";
    inspectPenaltyRef.current = "OK";
    setInspectPenalty("OK");
    updatePhase("just_stopped");
    onSolveComplete(finalMs, appliedPenalty);
  }, [onSolveComplete, settings.inspectionEnabled, updatePhase]);

  const cancelEverything = useCallback(() => {
    clearHoldTimeout();
    stopInspectionLoop();
    stopSolveRaf();
    inspectPenaltyRef.current = "OK";
    setInspectPenalty("OK");
    setDisplayMs(lastSolve ? lastSolve.time_ms : 0);
    updatePhase("idle");
  }, [lastSolve, updatePhase]);

  // Unified press-down handler (Spacebar or Touch start)
  const handlePressDown = useCallback(() => {
    const current = phaseRef.current;

    if (current === "running") {
      finishRunningTimer();
      return;
    }

    if (current === "idle") {
      if (settings.inspectionEnabled) {
        // Quick tap starts inspection
        updatePhase("ready_inspect");
      } else {
        if (settings.holdDelayMs <= 0) {
          updatePhase("ready");
        } else {
          updatePhase("holding");
          clearHoldTimeout();
          holdTimerRef.current = setTimeout(() => {
            if (phaseRef.current === "holding") {
              updatePhase("ready");
            }
          }, settings.holdDelayMs);
        }
      }
      return;
    }

    if (current === "inspecting") {
      if (settings.holdDelayMs <= 0) {
        updatePhase("ready");
      } else {
        updatePhase("holding");
        clearHoldTimeout();
        holdTimerRef.current = setTimeout(() => {
          if (phaseRef.current === "holding") {
            updatePhase("ready");
          }
        }, settings.holdDelayMs);
      }
    }
  }, [
    finishRunningTimer,
    settings.holdDelayMs,
    settings.inspectionEnabled,
    updatePhase,
  ]);

  // Unified release handler (Spacebar keyup or Touch end)
  const handlePressUp = useCallback(() => {
    const current = phaseRef.current;
    clearHoldTimeout();

    if (current === "just_stopped") {
      updatePhase("idle");
      return;
    }

    if (current === "ready_inspect") {
      beginInspection();
      return;
    }

    if (current === "holding") {
      // Released too early before holdDelayMs elapsed
      if (settings.inspectionEnabled && inspectIntervalRef.current) {
        updatePhase("inspecting");
      } else {
        updatePhase("idle");
      }
      return;
    }

    if (current === "ready") {
      beginRunningTimer();
    }
  }, [beginInspection, beginRunningTimer, settings.inspectionEnabled, updatePhase]);

  // Global Keyboard Listeners
  useEffect(() => {
    if (settings.manualInput || isModalOpen) return;

    const isTypingInInput = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingInInput(e.target)) return;

      // Escape cancels inspection or running timer
      if (e.key === "Escape") {
        if (phaseRef.current !== "idle") {
          e.preventDefault();
          cancelEverything();
        }
        return;
      }

      // If timer is running, ANY non-modifier key stops the timer (WCA/csTimer feel)
      if (phaseRef.current === "running") {
        if (!e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handlePressDown();
        }
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        handlePressDown();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isTypingInInput(e.target)) return;

      if (phaseRef.current === "just_stopped") {
        e.preventDefault();
        handlePressUp();
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handlePressUp();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    cancelEverything,
    handlePressDown,
    handlePressUp,
    isModalOpen,
    settings.manualInput,
  ]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseManualTimeInput(manualText);
    if (parsed !== null && parsed > 0) {
      onSolveComplete(parsed, "OK");
      setManualText("");
    }
  };

  // Determine timer color class
  const getTimerColorClass = () => {
    if (phase === "holding") return "text-rose-400 scale-[0.99]";
    if (phase === "ready" || phase === "ready_inspect")
      return "text-emerald-400 scale-[1.03]";
    if (phase === "inspecting") {
      if (inspectPenalty === "DNF") return "text-rose-500";
      if (inspectPenalty === "+2") return "text-amber-400";
      return "text-amber-300";
    }
    if (phase === "running") return "text-white";
    if (lastSolve?.penalty === "DNF") return "text-rose-400";
    if (lastSolve?.penalty === "+2") return "text-amber-300";
    return "text-white";
  };

  // Determine displayed text inside main clock
  const renderMainClockText = () => {
    if (
      phase === "inspecting" ||
      ((phase === "holding" || phase === "ready") && inspectIntervalRef.current)
    ) {
      if (inspectPenalty === "DNF") return "DNF";
      if (inspectPenalty === "+2") return "+2";
      return String(inspectSecondsLeft);
    }

    if (phase === "running") {
      return formatTimeMs(displayMs, settings.decimals);
    }

    if (phase === "holding" || phase === "ready" || phase === "ready_inspect") {
      return formatTimeMs(0, settings.decimals);
    }

    if (lastSolve) {
      return formatSolveDisplay(lastSolve, settings.decimals);
    }

    return formatTimeMs(0, settings.decimals);
  };

  const isSolvingOrInspecting =
    phase === "running" ||
    phase === "inspecting" ||
    phase === "holding" ||
    phase === "ready";

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full select-none relative px-4 py-4">
      {settings.manualInput ? (
        <form
          onSubmit={handleManualSubmit}
          className="w-full max-w-md flex flex-col items-center gap-3 my-6"
        >
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400 font-semibold">
            <Keyboard className="w-4 h-4" />
            <span>Chế độ nhập thời gian thủ công</span>
          </div>
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Nhập VD: 945 (= 9.45s) hoặc 12.34 rồi Enter"
            className="w-full text-center font-mono text-3xl sm:text-4xl py-4 px-5 rounded-2xl bg-white/[0.06] border border-white/15 focus:border-cyan-400 focus:outline-none transition"
          />
          <p className="text-xs opacity-60 text-center">
            Gõ liền số (VD: <code className="text-cyan-300">1052</code> = 10.52s)
            hoặc định dạng <code className="text-cyan-300">1:05.23</code> và nhấn{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-white/10">Enter</kbd>.
          </p>
        </form>
      ) : (
        /* Interactive Touch / Spacebar Zone */
        <div
          role="button"
          tabIndex={-1}
          onTouchStart={(e) => {
            // Allow clicking quick action buttons underneath without triggering touch zone
            if ((e.target as HTMLElement).closest("[data-timer-action]")) return;
            e.preventDefault();
            handlePressDown();
          }}
          onTouchEnd={(e) => {
            if ((e.target as HTMLElement).closest("[data-timer-action]")) return;
            e.preventDefault();
            handlePressUp();
          }}
          className="w-full flex-1 min-h-[210px] sm:min-h-[260px] flex flex-col items-center justify-center cursor-pointer rounded-3xl transition"
        >
          {/* PB Celebration Pill */}
          {isNewPb && !isSolvingOrInspecting && lastSolve && (
            <div className="mb-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400/20 via-emerald-400/20 to-cyan-400/20 border border-amber-400/40 text-amber-300 text-xs font-semibold animate-bounce">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Kỷ lục mới (Personal Best)!</span>
            </div>
          )}

          {/* Inspection Status Label */}
          {settings.inspectionEnabled && !isSolvingOrInspecting && (
            <div className="mb-1 text-[11px] uppercase tracking-widest text-amber-300/80 font-medium">
              WCA Inspection 15s đang bật
            </div>
          )}

          {/* Giant Timer Digits */}
          <div
            className={`font-mono font-bold tracking-tight transition-transform duration-100 leading-none text-[4.25rem] sm:text-[6.5rem] md:text-[7.5rem] lg:text-[8.5rem] tabular-nums ${getTimerColorClass()}`}
          >
            {renderMainClockText()}
          </div>

          {/* Hint Caption */}
          <p className="mt-3 text-xs sm:text-sm opacity-55 text-center">
            {phase === "running"
              ? "Nhấn phím bất kỳ hoặc chạm màn hình để dừng"
              : phase === "inspecting"
              ? "Nhấn giữ Space (hoặc chạm giữ) để bắt đầu giải • ESC để hủy"
              : phase === "holding"
              ? "Tiếp tục giữ..."
              : phase === "ready"
              ? "Thả tay để bắt đầu!"
              : settings.inspectionEnabled
              ? "Nhấn Space (hoặc chạm) để bắt đầu 15s Inspection"
              : "Nhấn giữ Space (hoặc chạm giữ màn hình) để sẵn sàng"}
          </p>

          {/* Post-Solve Quick Penalty & Note Controls */}
          {!isSolvingOrInspecting && lastSolve && (
            <div
              data-timer-action="true"
              className="mt-5 flex flex-col items-center gap-2.5"
            >
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    onUpdateLastPenalty(
                      lastSolve.penalty === "+2" ? "OK" : "+2"
                    );
                    e.currentTarget.blur();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                    lastSolve.penalty === "+2"
                      ? "bg-amber-400 text-slate-950 border-amber-400"
                      : "bg-white/[0.06] hover:bg-amber-400/20 text-amber-300 border-white/10"
                  }`}
                >
                  +2
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    onUpdateLastPenalty(
                      lastSolve.penalty === "DNF" ? "OK" : "DNF"
                    );
                    e.currentTarget.blur();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition inline-flex items-center gap-1 ${
                    lastSolve.penalty === "DNF"
                      ? "bg-rose-500 text-white border-rose-500"
                      : "bg-white/[0.06] hover:bg-rose-500/20 text-rose-300 border-white/10"
                  }`}
                >
                  <Flag className="w-3 h-3" />
                  DNF
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    setCommentText(lastSolve.comment || "");
                    setShowCommentBox((v) => !v);
                    e.currentTarget.blur();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition inline-flex items-center gap-1 ${
                    lastSolve.comment
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                      : "bg-white/[0.06] hover:bg-white/[0.12] border-white/10 opacity-85"
                  }`}
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span>{lastSolve.comment ? "Sửa ghi chú" : "Ghi chú"}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    if (window.confirm("Xóa lượt giải vừa rồi?")) {
                      onDeleteLastSolve();
                    }
                    e.currentTarget.blur();
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/[0.06] hover:bg-rose-500/20 hover:text-rose-300 border border-white/10 transition inline-flex items-center gap-1 opacity-85"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa</span>
                </button>
              </div>

              {lastSolve.comment && !showCommentBox && (
                <p className="text-xs text-cyan-300/90 italic">
                  “{lastSolve.comment}”
                </p>
              )}

              {showCommentBox && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onCommentLastSolve(commentText.trim());
                    setShowCommentBox(false);
                  }}
                  className="flex items-center gap-1.5 mt-1"
                >
                  <input
                    type="text"
                    autoFocus
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Ghi chú (VD: PLL skip, trượt tay...)"
                    className="h-8 w-56 rounded-lg bg-slate-900 border border-cyan-500/50 px-2.5 text-xs text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="h-8 px-2.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs"
                  >
                    Lưu
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Quick Inline Rolling Averages Summary */}
          {!isSolvingOrInspecting && (
            <div className="mt-6 flex items-center gap-6 text-sm sm:text-base font-mono">
              <div className="flex items-center gap-2">
                <span className="opacity-50 font-sans text-xs uppercase tracking-wider">
                  Ao5:
                </span>
                <span className="font-semibold text-cyan-300">
                  {formatTimeMs(currentAo5, settings.decimals)}
                </span>
              </div>
              <div className="w-px h-4 bg-white/15" />
              <div className="flex items-center gap-2">
                <span className="opacity-50 font-sans text-xs uppercase tracking-wider">
                  Ao12:
                </span>
                <span className="font-semibold text-indigo-300">
                  {formatTimeMs(currentAo12, settings.decimals)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
