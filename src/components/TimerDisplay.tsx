"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  Flag,
  Keyboard,
  Layers,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  computeBpaWpa,
  computeTrimmedAverage,
  formatSolveDisplay,
  formatTimeMs,
  getEffectiveMs,
  parseManualTimeInput,
} from "@/lib/stats";
import {
  playInspection12s,
  playInspection8s,
  playSplitTick,
} from "@/lib/sound";
import {
  PenaltyType,
  Solve,
  SplitMode,
  TimerSettings,
} from "@/types/cubing";

export type TimerPhase =
  | "idle"
  | "holding_pre_inspect"
  | "ready_inspect"
  | "inspecting"
  | "holding"
  | "ready"
  | "running"
  | "just_stopped";

const CFOP_SPLIT_LABELS = ["1. Cross", "2. F2L", "3. OLL", "4. PLL"] as const;
const CFOP_SPLIT_COLORS = [
  "bg-emerald-400 text-slate-950",
  "bg-cyan-400 text-slate-950",
  "bg-amber-400 text-slate-950",
  "bg-indigo-400 text-slate-950",
] as const;

interface TimerDisplayProps {
  settings: TimerSettings;
  lastSolve: Solve | null;
  currentAo5: number | "DNF" | null;
  currentAo12: number | "DNF" | null;
  isNewPb: boolean;
  isModalOpen: boolean;
  fatigueAlert: string | null;
  onPhaseChange: (phase: TimerPhase) => void;
  onSolveComplete: (
    timeMs: number,
    initialPenalty: PenaltyType,
    splitsMs?: number[]
  ) => void;
  onUpdateLastPenalty: (penalty: PenaltyType) => void;
  onDeleteLastSolve: () => void;
  onCommentLastSolve: (comment: string) => void;
  onToggleSplitMode: (next: SplitMode) => void;
  compModeTrigger?: number;
  onCompetitionModeChange?: (active: boolean) => void;
}

export default function TimerDisplay({
  settings,
  lastSolve,
  currentAo5,
  currentAo12,
  isNewPb,
  isModalOpen,
  fatigueAlert,
  onPhaseChange,
  onSolveComplete,
  onUpdateLastPenalty,
  onDeleteLastSolve,
  onCommentLastSolve,
  onToggleSplitMode,
  compModeTrigger = 0,
  onCompetitionModeChange,
}: TimerDisplayProps) {
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [displayMs, setDisplayMs] = useState<number>(0);
  const [inspectSecondsLeft, setInspectSecondsLeft] = useState<number>(15);
  const [inspectPenalty, setInspectPenalty] = useState<PenaltyType>("OK");
  const [manualText, setManualText] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [commentText, setCommentText] = useState("");

  // Multi-Phase Split Timer State (durations of completed stages during active solve)
  const [liveSplitsMs, setLiveSplitsMs] = useState<number[]>([]);
  const liveSplitsRef = useRef<number[]>([]);
  const lastSplitTimestampRef = useRef<number>(0);

  // WCA Competition Simulator Mode (5-solve Ao5 round with BPA/WPA)
  const [compModeActive, setCompModeActive] = useState(false);
  const [compRoundSolves, setCompRoundSolves] = useState<Solve[]>([]);

  useEffect(() => {
    if (compModeTrigger > 0) {
      setCompModeActive(true);
      setCompRoundSolves([]);
    }
  }, [compModeTrigger]);

  useEffect(() => {
    onCompetitionModeChange?.(compModeActive);
  }, [compModeActive, onCompetitionModeChange]);

  const phaseRef = useRef<TimerPhase>("idle");
  const startTimeRef = useRef<number>(0);
  const inspectStartRef = useRef<number>(0);
  const inspectPenaltyRef = useRef<PenaltyType>("OK");
  const pressedKeyRef = useRef<string | null>(null);
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

  // Keep the same lock as the timer moves through inspection and a solve.
  const keepScreenAwake =
    phase === "inspecting" ||
    phase === "running" ||
    phase === "holding" ||
    phase === "ready";

  useEffect(() => {
    if (
      !keepScreenAwake ||
      typeof navigator === "undefined" ||
      !("wakeLock" in navigator)
    ) {
      return;
    }

    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const nav = navigator as unknown as {
      wakeLock: {
        request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
      };
    };
    nav.wakeLock
      .request("screen")
      .then((lock) => {
        if (cancelled) return lock.release();
        sentinel = lock;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      sentinel?.release().catch(() => {});
    };
  }, [keepScreenAwake]);

  // Sync display when lastSolve updates externally
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

  const effectiveInspectionEnabled =
    settings.inspectionEnabled || compModeActive;

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
          playInspection8s(settings.voiceAlertsEnabled);
        }
        if (elapsedSec >= 12 && !alert12PlayedRef.current) {
          alert12PlayedRef.current = true;
          playInspection12s(settings.voiceAlertsEnabled);
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
  }, [settings.soundEnabled, settings.voiceAlertsEnabled, updatePhase]);

  const beginRunningTimer = useCallback(() => {
    stopInspectionLoop();
    stopSolveRaf();
    const now = performance.now();
    startTimeRef.current = now;
    lastSplitTimestampRef.current = now;
    liveSplitsRef.current = [];
    setLiveSplitsMs([]);
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

  const finishRunningTimer = useCallback(
    (finalSplits?: number[]) => {
      const now = performance.now();
      const finalMs = Math.max(10, Math.round(now - startTimeRef.current));
      stopSolveRaf();
      setDisplayMs(finalMs);
      const appliedPenalty = effectiveInspectionEnabled
        ? inspectPenaltyRef.current
        : "OK";
      inspectPenaltyRef.current = "OK";
      setInspectPenalty("OK");
      updatePhase("just_stopped");

      if (compModeActive) {
        setCompRoundSolves((prev) => {
          if (prev.length >= 5) return prev;
          const mockSolve: Solve = {
            id: `comp-${prev.length + 1}`,
            session_id: "comp",
            puzzle: "3x3",
            time_ms: finalMs,
            penalty: appliedPenalty,
            scramble: "",
            comment: "",
            splits_ms: finalSplits,
            solved_at: new Date().toISOString(),
          };
          return [...prev, mockSolve];
        });
      }

      onSolveComplete(finalMs, appliedPenalty, finalSplits);
    },
    [
      compModeActive,
      effectiveInspectionEnabled,
      onSolveComplete,
      updatePhase,
    ]
  );

  const cancelEverything = useCallback(() => {
    clearHoldTimeout();
    stopInspectionLoop();
    stopSolveRaf();
    inspectPenaltyRef.current = "OK";
    setInspectPenalty("OK");
    liveSplitsRef.current = [];
    setLiveSplitsMs([]);
    setDisplayMs(lastSolve ? lastSolve.time_ms : 0);
    updatePhase("idle");
  }, [lastSolve, updatePhase]);

  // Unified press-down handler (Spacebar or Touch start)
  const handlePressDown = useCallback(() => {
    const current = phaseRef.current;

    if (current === "running") {
      // Check if Multi-Phase CFOP Split Timer is enabled (4 stages: Cross, F2L, OLL, PLL)
      if (settings.splitMode === "cfop4") {
        const now = performance.now();
        const stageDuration = Math.max(
          10,
          Math.round(now - lastSplitTimestampRef.current)
        );
        lastSplitTimestampRef.current = now;
        const nextSplits = [...liveSplitsRef.current, stageDuration];
        liveSplitsRef.current = nextSplits;
        setLiveSplitsMs(nextSplits);

        if (nextSplits.length < 4) {
          if (settings.soundEnabled) playSplitTick();
          return;
        }
        finishRunningTimer(nextSplits);
        return;
      }

      finishRunningTimer(undefined);
      return;
    }

    if (current === "idle") {
      if (compModeActive && compRoundSolves.length >= 5) {
        // Reset competition round for a new 5-solve round
        setCompRoundSolves([]);
      }

      if (effectiveInspectionEnabled) {
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
    compModeActive,
    compRoundSolves.length,
    effectiveInspectionEnabled,
    finishRunningTimer,
    settings.holdDelayMs,
    settings.soundEnabled,
    settings.splitMode,
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
      if (effectiveInspectionEnabled && inspectIntervalRef.current) {
        updatePhase("inspecting");
      } else {
        updatePhase("idle");
      }
      return;
    }

    if (current === "ready") {
      beginRunningTimer();
    }
  }, [
    beginInspection,
    beginRunningTimer,
    effectiveInspectionEnabled,
    updatePhase,
  ]);

  const cancelPendingPress = useCallback(() => {
    pressedKeyRef.current = null;
    clearHoldTimeout();
    const current = phaseRef.current;
    if (current === "holding" || current === "ready" || current === "ready_inspect") {
      updatePhase(inspectIntervalRef.current !== null ? "inspecting" : "idle");
    } else if (current === "just_stopped") {
      updatePhase("idle");
    }
  }, [updatePhase]);

  useEffect(() => {
    if (settings.manualInput || isModalOpen) {
      cancelPendingPress();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.matches("input, textarea, select") || target?.isContentEditable) return;

      if (e.key === "Escape" && phaseRef.current !== "idle") {
        e.preventDefault();
        pressedKeyRef.current = null;
        cancelEverything();
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (phaseRef.current !== "running") {
        if (e.code !== "Space" || target?.closest("button, a[href], [role='button'], summary")) return;
      }

      e.preventDefault();
      if (e.repeat || pressedKeyRef.current !== null) return;
      pressedKeyRef.current = e.code;
      handlePressDown();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (pressedKeyRef.current !== e.code) return;
      e.preventDefault();
      pressedKeyRef.current = null;
      handlePressUp();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", cancelPendingPress);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", cancelPendingPress);
    };
  }, [cancelEverything, cancelPendingPress, handlePressDown, handlePressUp, isModalOpen, settings.manualInput]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseManualTimeInput(manualText);
    if (parsed !== null && parsed > 0) {
      onSolveComplete(parsed, "OK");
      setManualText("");
    }
  };

  // Competition Mode BPA / WPA & Round Average calculations
  const compBpaWpa = useMemo(() => {
    if (!compModeActive || compRoundSolves.length !== 4) return null;
    return computeBpaWpa(compRoundSolves, settings.targetGoalMs || 15000);
  }, [compModeActive, compRoundSolves, settings.targetGoalMs]);

  const compFinalAo5 = useMemo(() => {
    if (!compModeActive || compRoundSolves.length < 5) return null;
    return computeTrimmedAverage(compRoundSolves.map(getEffectiveMs), 5);
  }, [compModeActive, compRoundSolves]);

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
      if (settings.timerUpdateMode === "hidden") {
        return "GIẢI...";
      }
      if (settings.timerUpdateMode === "seconds") {
        return `${Math.floor(displayMs / 1000)}s`;
      }
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

  const displayedSplits =
    phase === "running"
      ? liveSplitsMs
      : lastSolve?.splits_ms && lastSolve.splits_ms.length === 4
      ? lastSolve.splits_ms
      : [];

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full select-none relative px-4 py-3">
      {/* WCA Competition Round Progress Card */}
      {compModeActive && !isSolvingOrInspecting && (
        <div className="w-full max-w-xl mb-2 rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] px-4 py-2.5 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-amber-200 inline-flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Vòng thi đấu WCA Ao5 (Tự động bật 15s Inspection • Mục tiêu:{" "}
                {formatTimeMs(settings.targetGoalMs || 15000, settings.decimals)})
              </span>
            </div>
            {compRoundSolves.length > 0 && (
              <button
                type="button"
                onClick={() => setCompRoundSolves([])}
                className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Thi lại vòng mới</span>
              </button>
            )}
          </div>

          {/* 5 Solve Slots */}
          <div className="grid grid-cols-5 gap-1.5 font-mono">
            {[0, 1, 2, 3, 4].map((idx) => {
              const sv = compRoundSolves[idx];
              const isCurrent = idx === compRoundSolves.length;
              return (
                <div
                  key={idx}
                  className={`rounded-lg py-1.5 px-2 text-center border ${
                    sv
                      ? "bg-black/40 border-emerald-500/30 text-emerald-300 font-bold"
                      : isCurrent
                      ? "bg-amber-400/15 border-amber-400/50 text-amber-200 font-semibold"
                      : "bg-black/20 border-white/10 text-slate-400"
                  }`}
                >
                  <div className="text-[10px] opacity-60">Lượt #{idx + 1}</div>
                  <div>
                    {sv ? formatSolveDisplay(sv, settings.decimals) : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* After Solve #4: Show Official BPA & WPA */}
          {compBpaWpa && (
            <div className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-slate-400">BPA (Tốt nhất có thể): </span>
                <strong className="font-mono text-emerald-300">
                  {formatTimeMs(compBpaWpa.bpa, settings.decimals)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">WPA (Tệ nhất nếu lượt 5 DNF): </span>
                <strong className="font-mono text-amber-300">
                  {formatTimeMs(compBpaWpa.wpa, settings.decimals)}
                </strong>
              </div>
              <div className="w-full text-[11px] text-cyan-300 font-medium">
                {compBpaWpa.neededForTargetMs === "GUARANTEED"
                  ? "Chúc mừng! Bạn đã chắc chắn đạt mục tiêu Ao5 dù kết quả lượt 5 ra sao!"
                  : compBpaWpa.neededForTargetMs === "IMPOSSIBLE"
                  ? "Không thể đạt mục tiêu Ao5 ở vòng này, hãy cố gắng phá PB Single ở lượt 5!"
                  : `Ở lượt #5 cuối cùng, bạn cần giải dưới ${formatTimeMs(
                      compBpaWpa.neededForTargetMs,
                      settings.decimals
                    )} để đạt mục tiêu!`}
              </div>
            </div>
          )}

          {/* After Solve #5: Final Official Round Result */}
          {compRoundSolves.length === 5 && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-3 py-2 flex items-center justify-between">
              <span className="font-semibold text-emerald-200">
                Kết quả chung cuộc WCA Round Ao5:
              </span>
              <span className="font-mono text-base font-bold text-emerald-300">
                {formatTimeMs(compFinalAo5, settings.decimals)}
              </span>
            </div>
          )}
        </div>
      )}

      {settings.manualInput ? (
        <form
          onSubmit={handleManualSubmit}
          className="w-full max-w-md flex flex-col items-center gap-3 my-4"
        >
          <div className="inline-flex items-center gap-2 text-xs text-cyan-400 font-semibold">
            <Keyboard className="w-4 h-4" />
            <span>Chế độ nhập thời gian thủ công</span>
          </div>
          <input
            type="text"
            aria-label="Thời gian lượt giải"
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
          role="group"
          aria-label="Vùng bấm giờ"
          tabIndex={0}
          onTouchCancel={cancelPendingPress}
          onTouchStart={(e) => {
            if ((e.target as HTMLElement).closest("[data-timer-action]")) return;
            e.preventDefault();
            handlePressDown();
          }}
          onTouchEnd={(e) => {
            if ((e.target as HTMLElement).closest("[data-timer-action]")) return;
            e.preventDefault();
            handlePressUp();
          }}
          className="w-full flex-1 min-h-[174px] sm:min-h-[250px] flex flex-col items-center justify-center cursor-pointer rounded-3xl transition"
        >
          {/* PB Celebration Pill */}
          {isNewPb && !isSolvingOrInspecting && lastSolve && (
            <div className="mb-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-semibold transition-all duration-300 ease-out">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Kỷ lục mới (Personal Best)!</span>
            </div>
          )}

          {/* Inspection Status Label */}
          {effectiveInspectionEnabled && !isSolvingOrInspecting && (
            <div className="mb-1 text-[11px] text-amber-300/80 font-medium">
              WCA Inspection 15s đang bật
              {settings.voiceAlertsEnabled ? " (Kèm giọng Trọng tài 8s/12s)" : ""}
            </div>
          )}

          {/* Giant Timer Digits */}
          <div
            className={`font-mono font-bold tracking-tight transition-transform duration-100 leading-none text-[clamp(2.6rem,11vw,5.75rem)] lg:text-[clamp(3rem,6vw,7.5rem)] tabular-nums ${getTimerColorClass()}`}
          >
            {renderMainClockText()}
          </div>

          {/* Live / Post-Solve CFOP 4-Stage Split Pills */}
          {(settings.splitMode === "cfop4" || displayedSplits.length === 4) && (
            <div className="mt-3 w-full max-w-md space-y-1.5">
              <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                {CFOP_SPLIT_LABELS.map((label, idx) => {
                  const stageMs = displayedSplits[idx];
                  const isActiveStage =
                    phase === "running" && liveSplitsMs.length === idx;
                  return (
                    <div
                      key={label}
                      className={`rounded-xl py-1.5 px-2 border transition ${
                        typeof stageMs === "number"
                          ? "bg-white/[0.07] border-cyan-500/40 text-white"
                          : isActiveStage
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 animate-pulse"
                          : "bg-black/30 border-white/10 text-slate-400"
                      }`}
                    >
                      <div className="text-[10px] font-sans font-semibold opacity-75">
                        {label}
                      </div>
                      <div className="font-bold">
                        {typeof stageMs === "number"
                          ? formatTimeMs(stageMs, settings.decimals)
                          : isActiveStage
                          ? "Đang giải..."
                          : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Proportional Stacked Progress Bar after solve completes */}
              {!isSolvingOrInspecting && displayedSplits.length === 4 && (
                <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-black/40 border border-white/10">
                  {displayedSplits.map((ms, idx) => {
                    const total = Math.max(
                      1,
                      displayedSplits.reduce((a, b) => a + b, 0)
                    );
                    const pct = Math.round((ms / total) * 100);
                    return (
                      <div
                        key={idx}
                        style={{ width: `${pct}%` }}
                        title={`${CFOP_SPLIT_LABELS[idx]}: ${formatTimeMs(
                          ms,
                          settings.decimals
                        )} (${pct}%)`}
                        className={`h-full ${CFOP_SPLIT_COLORS[idx]}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Hint Caption */}
          <p role="status" className="mt-3 max-w-xs text-center text-sm text-slate-300">
            {phase === "running"
              ? settings.splitMode === "cfop4"
                ? `Nhấn Space / Chạm màn hình để chốt pha ${
                    CFOP_SPLIT_LABELS[liveSplitsMs.length] || "PLL"
                  } (${liveSplitsMs.length + 1}/4)`
                : "Đang giải · Nhấn phím hoặc chạm để dừng"
              : phase === "inspecting"
              ? "Nhấn giữ Space (hoặc chạm giữ) để bắt đầu giải • ESC để hủy"
              : phase === "holding"
              ? "Đang giữ…"
              : phase === "ready"
              ? "Sẵn sàng · Nhả để bắt đầu"
              : effectiveInspectionEnabled
              ? "Nhấn Space (hoặc chạm) để bắt đầu 15s Inspection"
              : "Giữ Space hoặc chạm giữ để bắt đầu"}
          </p>

          {/* Post-Solve Quick Penalty & Note Controls */}
          {!isSolvingOrInspecting && lastSolve && (
            <div
              data-timer-action="true"
              className="mt-4 flex flex-col items-center gap-2.5"
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
                    onDeleteLastSolve();
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

          {/* Smart Session Fatigue Alert */}
          {!isSolvingOrInspecting && fatigueAlert && (
            <div className="mt-3 max-w-md rounded-xl bg-amber-500/10 border border-amber-400/30 px-3 py-2 text-[11px] text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{fatigueAlert}</span>
            </div>
          )}

          {/* Quick Inline Rolling Averages Summary */}
          {!isSolvingOrInspecting && (
            <div className="mt-4 flex items-center gap-6 text-sm sm:text-base font-mono tabular-nums">
              <div className="flex items-center gap-2">
                <span className="opacity-50 font-sans text-xs">Ao5:</span>
                <span className="font-semibold text-cyan-300">
                  {formatTimeMs(currentAo5, settings.decimals)}
                </span>
              </div>
              <div className="w-px h-4 bg-white/15" />
              <div className="flex items-center gap-2">
                <span className="opacity-50 font-sans text-xs">Ao12:</span>
                <span className="font-semibold text-indigo-300">
                  {formatTimeMs(currentAo12, settings.decimals)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Quick Mode Switch Bar (Split Timer & WCA Competition Simulator) */}
      {!isSolvingOrInspecting && !settings.manualInput && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
          <button
            type="button"
            aria-pressed={settings.splitMode === "cfop4"}
            onClick={(e) => {
              onToggleSplitMode(
                settings.splitMode === "cfop4" ? "off" : "cfop4"
              );
              e.currentTarget.blur();
            }}
            className={`min-h-11 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 transition ${
              settings.splitMode === "cfop4"
                ? "bg-cyan-500/20 text-cyan-200 border-cyan-400/50"
                : "bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-300"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {settings.splitMode === "cfop4"
                ? "Split Timer · Đang bật"
                : "Split Timer"}
            </span>
          </button>

          <button
            type="button"
            aria-pressed={compModeActive}
            onClick={(e) => {
              setCompModeActive((v) => !v);
              setCompRoundSolves([]);
              e.currentTarget.blur();
            }}
            className={`min-h-11 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 transition ${
              compModeActive
                ? "bg-amber-500/20 text-amber-200 border-amber-400/50"
                : "bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-300"
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {compModeActive
                ? `Phòng thi WCA (${compRoundSolves.length}/5 lượt)`
                : "Thi đấu WCA (Ao5)"}
            </span>
          </button>
        </div>
      )}

    </div>
  );
}
