"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Flame,
  HelpCircle,
  ListChecks,
  Play,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import CfopCaseDiagram from "@/components/CfopCaseDiagram";
import { buildCfopTutorGuidance } from "@/lib/analytics/coach";
import {
  createPracticeQueue,
  drawNextFromPracticeQueue,
  type PracticeQueueState,
} from "@/lib/core/practiceQueue";
import {
  CFOP_ALGORITHMS,
  CFOP_LEARNING_PATH_TIERS,
  CFOP_STAGE_META,
  CfopAlgorithm,
  CfopLearningTier,
  CfopStage,
  computeNextSm2Progress,
  getAlgLearningTier,
  getCfopSessionName,
  isCfopDueForReview,
  selectAdaptiveCfopCase,
  simulateCfopCaseState,
} from "@/lib/cfop";
import { tokenizeAlgorithm } from "@/lib/scrambles";
import { playPbCelebration } from "@/lib/sound";
import {
  calculateSessionStats,
  formatSolveDisplay,
  formatTimeMs,
  getEffectiveMs,
} from "@/lib/stats";
import {
  CfopProgressItem,
  CubeSession,
  PenaltyType,
  Solve,
  TimerSettings,
} from "@/types/cubing";

interface CfopTrainerViewProps {
  sessions: CubeSession[];
  solves: Solve[];
  settings: TimerSettings;
  cfopProgress: Record<string, CfopProgressItem>;
  practiceSetIds: string[];
  onUpdatePracticeSetIds: (ids: string[]) => void;
  onUpdateCfopProgress: (item: CfopProgressItem) => void;
  onRequestConfirmResetProgress?: (alg: CfopAlgorithm, onConfirm: () => void) => void;
  onEnsureAlgSession: (alg: CfopAlgorithm) => CubeSession;
  onRecordAlgSolve: (
    sessionId: string,
    timeMs: number,
    scrambleSetup: string,
    penalty: PenaltyType
  ) => void;
  onUpdateSolvePenalty: (solveId: string, penalty: PenaltyType) => void;
  onDeleteSolve: (solveId: string) => void;
  onOpenInMainTimer: (alg: CfopAlgorithm) => void;
}

type DrillPhase = "idle" | "holding" | "ready" | "running" | "just_stopped";

export default function CfopTrainerView({
  sessions,
  solves,
  settings,
  cfopProgress,
  practiceSetIds,
  onUpdatePracticeSetIds,
  onUpdateCfopProgress,
  onRequestConfirmResetProgress,
  onEnsureAlgSession,
  onRecordAlgSolve,
  onUpdateSolvePenalty,
  onDeleteSolve,
  onOpenInMainTimer,
}: CfopTrainerViewProps) {
  const [stageFilter, setStageFilter] = useState<"ALL" | CfopStage>("PLL");
  const [tierFilter, setTierFilter] = useState<"ALL" | CfopLearningTier>("ALL");
  const [onlyTwoLook, setOnlyTwoLook] = useState(false);
  const [onlyUnlearned, setOnlyUnlearned] = useState(false);
  const [onlyDueReview, setOnlyDueReview] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Active Algorithm in Dedicated Drill Studio Modal
  const [drillingAlg, setDrillingAlg] = useState<CfopAlgorithm | null>(null);
  const [activeDrillSessionId, setActiveDrillSessionId] = useState<string>("");
  const [blindMode, setBlindMode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Adaptive Random Drill Mode state
  const [adaptiveMode, setAdaptiveMode] = useState(false);
  const [adaptiveRevealed, setAdaptiveRevealed] = useState(true);
  const [adaptiveReason, setAdaptiveReason] = useState<string>("");
  const [adaptiveAuf, setAdaptiveAuf] = useState<"" | "U" | "U'" | "U2">("");

  // Custom Practice Set Random Mode (multi-group round-robin shuffle)
  const [showPracticeSetDrawer, setShowPracticeSetDrawer] = useState(false);
  const [customSetMode, setCustomSetMode] = useState(false);
  const [customQueue, setCustomQueue] = useState<PracticeQueueState | null>(null);

  // Step-by-Step Trigger Scrubber & AI Tutor inside Drill Studio
  const [scrubberStep, setScrubberStep] = useState<number | null>(null);
  const [showTutorPanel, setShowTutorPanel] = useState(false);
  const [tutorQuestion, setTutorQuestion] = useState("");
  const [tutorAiReply, setTutorAiReply] = useState<string | null>(null);
  const [tutorLoading, setTutorLoading] = useState(false);

  // Flash Recognition Quiz Mode
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizTarget, setQuizTarget] = useState<CfopAlgorithm | null>(null);
  const [quizChoices, setQuizChoices] = useState<CfopAlgorithm[]>([]);
  const [quizAuf, setQuizAuf] = useState<string>("");
  const [quizStartMs, setQuizStartMs] = useState<number>(0);
  const [quizResult, setQuizResult] = useState<{
    correct: boolean;
    pickedId: string;
    reactionMs: number;
  } | null>(null);
  const [quizStreak, setQuizStreak] = useState(0);

  // Drill Timer State
  const [drillPhase, setDrillPhase] = useState<DrillPhase>("idle");
  const [drillMs, setDrillMs] = useState<number>(0);
  const [isDrillPb, setIsDrillPb] = useState(false);

  const drillPadRef = useRef<HTMLDivElement | null>(null);
  const pressedKeyRef = useRef<string | null>(null);
  const drillPhaseRef = useRef<DrillPhase>("idle");
  const startTimeRef = useRef<number>(0);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const isAlgLearned = useCallback(
    (algId: string) => {
      const p = cfopProgress[algId];
      return Boolean(p && (p.status === "learned" || p.status === "mastered"));
    },
    [cfopProgress]
  );

  const toggleLearned = (alg: CfopAlgorithm) => {
    const existing = cfopProgress[alg.id];
    const currentlyLearned =
      existing &&
      (existing.status === "learned" || existing.status === "mastered");

    if (currentlyLearned) {
      const doReset = () => {
        const nowIso = new Date().toISOString();
        onUpdateCfopProgress({
          alg_id: alg.id,
          status: "unlearned",
          preferred_formula: existing?.preferred_formula,
          ease_factor: 2.5,
          interval_days: 0,
          repetitions: 0,
          next_review_at: nowIso,
          updated_at: nowIso,
        });
      };
      if (onRequestConfirmResetProgress) {
        onRequestConfirmResetProgress(alg, doReset);
      } else {
        doReset();
      }
    } else {
      const next = computeNextSm2Progress(alg.id, existing, 4);
      onUpdateCfopProgress(next);
    }
  };

  const practiceSetLookup = useMemo(
    () => new Set(practiceSetIds),
    [practiceSetIds]
  );

  const selectedPracticeAlgs = useMemo(() => {
    const byId = new Map(CFOP_ALGORITHMS.map((a) => [a.id, a]));
    return practiceSetIds
      .map((id) => byId.get(id))
      .filter((a): a is CfopAlgorithm => Boolean(a));
  }, [practiceSetIds]);

  const togglePracticeSetItem = useCallback(
    (algId: string) => {
      if (practiceSetLookup.has(algId)) {
        onUpdatePracticeSetIds(practiceSetIds.filter((id) => id !== algId));
      } else {
        onUpdatePracticeSetIds([...practiceSetIds, algId]);
      }
    },
    [onUpdatePracticeSetIds, practiceSetIds, practiceSetLookup]
  );

  // Precompute stats per CFOP session name
  const sessionStatsByName = useMemo(() => {
    const sessionByName = new Map<string, CubeSession>();
    for (const s of sessions) {
      sessionByName.set(s.name, s);
    }

    const solvesBySessionId = new Map<string, Solve[]>();
    for (const sv of solves) {
      const list = solvesBySessionId.get(sv.session_id);
      if (list) list.push(sv);
      else solvesBySessionId.set(sv.session_id, [sv]);
    }

    const map = new Map<
      string,
      ReturnType<typeof calculateSessionStats> & { sessionId: string }
    >();

    for (const alg of CFOP_ALGORITHMS) {
      const sName = getCfopSessionName(alg);
      const sess = sessionByName.get(sName);
      if (!sess) continue;
      const list = (solvesBySessionId.get(sess.id) || [])
        .slice()
        .sort(
          (a, b) =>
            new Date(a.solved_at).getTime() - new Date(b.solved_at).getTime()
        );
      map.set(sName, {
        sessionId: sess.id,
        ...calculateSessionStats(list),
      });
    }

    return map;
  }, [sessions, solves]);

  // Due for SRS review count
  const dueReviewCount = useMemo(
    () =>
      CFOP_ALGORITHMS.filter((alg) => isCfopDueForReview(cfopProgress[alg.id]))
        .length,
    [cfopProgress]
  );

  // Filtered CFOP algorithm cards
  const filteredAlgs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return CFOP_ALGORITHMS.filter((alg) => {
      if (stageFilter !== "ALL" && alg.stage !== stageFilter) return false;
      if (tierFilter !== "ALL" && getAlgLearningTier(alg) !== tierFilter)
        return false;
      if (onlyTwoLook && !alg.isTwoLook) return false;
      if (onlyUnlearned && isAlgLearned(alg.id)) return false;
      if (onlyDueReview && !isCfopDueForReview(cfopProgress[alg.id]))
        return false;
      if (q) {
        return (
          alg.name.toLowerCase().includes(q) ||
          alg.code.toLowerCase().includes(q) ||
          alg.group.toLowerCase().includes(q) ||
          alg.formula.toLowerCase().includes(q) ||
          alg.recognition.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [
    stageFilter,
    tierFilter,
    onlyTwoLook,
    onlyUnlearned,
    onlyDueReview,
    isAlgLearned,
    cfopProgress,
    searchQuery,
  ]);

  // Progress counts
  const progressByStage = useMemo(() => {
    const counts: Record<string, { learned: number; total: number }> = {
      ALL: { learned: 0, total: CFOP_ALGORITHMS.length },
      CROSS: { learned: 0, total: 0 },
      F2L: { learned: 0, total: 0 },
      OLL: { learned: 0, total: 0 },
      PLL: { learned: 0, total: 0 },
    };
    for (const alg of CFOP_ALGORITHMS) {
      counts[alg.stage].total++;
      if (isAlgLearned(alg.id)) {
        counts.ALL.learned++;
        counts[alg.stage].learned++;
      }
    }
    return counts;
  }, [isAlgLearned]);

  const handleOpenDrill = useCallback(
    (
      alg: CfopAlgorithm,
      isAdaptive = false,
      opts?: { customSet?: boolean; preserveBlind?: boolean }
    ) => {
      const sess = onEnsureAlgSession(alg);
      setActiveDrillSessionId(sess.id);
      setDrillingAlg(alg);
      setDrillMs(0);
      setIsDrillPb(false);
      if (!opts?.preserveBlind) {
        setBlindMode(isAdaptive);
      }
      setAdaptiveMode(isAdaptive);
      setCustomSetMode(Boolean(opts?.customSet));
      setAdaptiveRevealed(!isAdaptive && !opts?.customSet);
      setScrubberStep(null);
      setTutorAiReply(null);
      drillPhaseRef.current = "idle";
      setDrillPhase("idle");
    },
    [onEnsureAlgSession]
  );

  // Start Custom Practice Set Random Drill (round-robin shuffle, supports 1-case set)
  const handleStartCustomSetDrill = useCallback(() => {
    if (selectedPracticeAlgs.length === 0) return;
    const initialQueue = createPracticeQueue(
      selectedPracticeAlgs.map((a) => a.id)
    );
    const { caseId, nextState } = drawNextFromPracticeQueue(initialQueue);
    if (!caseId) return;
    const alg = selectedPracticeAlgs.find((a) => a.id === caseId);
    if (!alg) return;
    const aufs: ("" | "U" | "U'" | "U2")[] = ["", "U", "U'", "U2"];
    setAdaptiveAuf(aufs[Math.floor(Math.random() * aufs.length)]);
    setCustomQueue(nextState);
    handleOpenDrill(alg, false, { customSet: true });
  }, [handleOpenDrill, selectedPracticeAlgs]);

  const handleNextCustomSetCase = useCallback(() => {
    if (!customQueue || selectedPracticeAlgs.length === 0) return;
    const { caseId, nextState } = drawNextFromPracticeQueue(customQueue);
    if (!caseId) return;
    const alg = selectedPracticeAlgs.find((a) => a.id === caseId);
    if (!alg) return;
    const aufs: ("" | "U" | "U'" | "U2")[] = ["", "U", "U'", "U2"];
    setAdaptiveAuf(aufs[Math.floor(Math.random() * aufs.length)]);
    setCustomQueue(nextState);
    handleOpenDrill(alg, false, { customSet: true, preserveBlind: true });
  }, [customQueue, handleOpenDrill, selectedPracticeAlgs]);

  // Start Adaptive Random Drill across currently filtered algorithms
  const handleStartAdaptiveDrill = useCallback(
    (previousAlgId?: string) => {
      const pool = filteredAlgs.length > 0 ? filteredAlgs : CFOP_ALGORITHMS;
      const picked = selectAdaptiveCfopCase(
        pool,
        sessionStatsByName,
        cfopProgress,
        previousAlgId
      );
      setAdaptiveReason(picked.reason);
      setAdaptiveAuf(picked.randomAuf);
      setCustomQueue(null);
      handleOpenDrill(picked.alg, true);
    },
    [cfopProgress, filteredAlgs, handleOpenDrill, sessionStatsByName]
  );

  // Start Recognition Quiz Round
  const generateNextQuizQuestion = useCallback(() => {
    const pool =
      filteredAlgs.length >= 4
        ? filteredAlgs
        : CFOP_ALGORITHMS.filter((a) => a.stage === "PLL" || a.stage === "OLL");
    const target = pool[Math.floor(Math.random() * pool.length)];
    const distractors = pool
      .filter((a) => a.id !== target.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const choices = [target, ...distractors].sort(() => Math.random() - 0.5);
    const aufs = ["", "U", "U'", "U2"];
    setQuizTarget(target);
    setQuizChoices(choices);
    setQuizAuf(aufs[Math.floor(Math.random() * aufs.length)]);
    setQuizResult(null);
    setQuizStartMs(performance.now());
    setQuizOpen(true);
  }, [filteredAlgs]);

  const handleAnswerQuiz = (picked: CfopAlgorithm) => {
    if (!quizTarget || quizResult) return;
    const reactionMs = Math.max(
      50,
      Math.round(performance.now() - quizStartMs)
    );
    const correct = picked.id === quizTarget.id;
    setQuizResult({
      correct,
      pickedId: picked.id,
      reactionMs,
    });
    setQuizStreak((s) => (correct ? s + 1 : 0));
  };

  // Active formula (respecting user's preferred variant)
  const activeDrillingFormula = useMemo(() => {
    if (!drillingAlg) return "";
    return cfopProgress[drillingAlg.id]?.preferred_formula || drillingAlg.formula;
  }, [drillingAlg, cfopProgress]);

  const activeDrillCaseInfo = useMemo(() => {
    if (!drillingAlg) return null;
    const base = simulateCfopCaseState(activeDrillingFormula);
    const setupWithAuf = adaptiveMode && adaptiveAuf
      ? `${base.setupMoves} ${adaptiveAuf}`
      : base.setupMoves;
    return {
      ...base,
      setupMoves: setupWithAuf,
    };
  }, [drillingAlg, activeDrillingFormula, adaptiveMode, adaptiveAuf]);

  const activeDrillTokens = useMemo(
    () => tokenizeAlgorithm(activeDrillingFormula),
    [activeDrillingFormula]
  );

  const tutorGuidance = useMemo(() => {
    if (!drillingAlg) return null;
    return buildCfopTutorGuidance(
      drillingAlg,
      activeDrillingFormula,
      tutorQuestion
    );
  }, [drillingAlg, activeDrillingFormula, tutorQuestion]);

  const activeDrillSolves = useMemo(() => {
    if (!activeDrillSessionId) return [];
    return solves
      .filter((s) => s.session_id === activeDrillSessionId)
      .sort(
        (a, b) =>
          new Date(a.solved_at).getTime() - new Date(b.solved_at).getTime()
      );
  }, [solves, activeDrillSessionId]);

  const activeDrillStats = useMemo(
    () => calculateSessionStats(activeDrillSolves),
    [activeDrillSolves]
  );

  const lastDrillSolve =
    activeDrillSolves.length > 0
      ? activeDrillSolves[activeDrillSolves.length - 1]
      : null;

  // ==========================================================================
  // Dedicated Drill Timer Engine (Spacebar + Touch)
  // ==========================================================================
  const setDrillPhaseBoth = useCallback((next: DrillPhase) => {
    drillPhaseRef.current = next;
    setDrillPhase(next);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      if (next === "ready") navigator.vibrate?.(20);
      else if (next === "just_stopped") navigator.vibrate?.(35);
    }
  }, []);

  const stopDrillLoops = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopDrillLoops();
  }, [stopDrillLoops]);

  const finishDrillSolve = useCallback(() => {
    if (!drillingAlg || !activeDrillSessionId || !activeDrillCaseInfo) return;
    const finalMs = Math.max(
      10,
      Math.round(performance.now() - startTimeRef.current)
    );
    stopDrillLoops();
    setDrillMs(finalMs);
    setDrillPhaseBoth("just_stopped");
    setAdaptiveRevealed(true);

    const prevBest = activeDrillStats.summary.bestSingle;
    const brokePb =
      activeDrillSolves.length >= 1 &&
      (prevBest === null || finalMs < prevBest);
    setIsDrillPb(brokePb);
    if (brokePb && settings.soundEnabled) {
      playPbCelebration();
    }

    onRecordAlgSolve(
      activeDrillSessionId,
      finalMs,
      `Setup: ${activeDrillCaseInfo.setupMoves}  |  Alg: ${activeDrillingFormula}`,
      "OK"
    );

    // Auto-update SM-2 Spaced Repetition progress based on TPS performance
    const tps = activeDrillCaseInfo.moveCount / (finalMs / 1000);
    const autoGrade: 1 | 2 | 4 | 5 =
      tps >= 5.5 && blindMode ? 5 : tps >= 3.5 ? 4 : 2;
    const nextProg = computeNextSm2Progress(
      drillingAlg.id,
      cfopProgress[drillingAlg.id],
      autoGrade,
      activeDrillingFormula
    );
    onUpdateCfopProgress(nextProg);
  }, [
    activeDrillCaseInfo,
    activeDrillSessionId,
    activeDrillSolves.length,
    activeDrillStats.summary.bestSingle,
    activeDrillingFormula,
    blindMode,
    cfopProgress,
    drillingAlg,
    onRecordAlgSolve,
    onUpdateCfopProgress,
    setDrillPhaseBoth,
    settings.soundEnabled,
    stopDrillLoops,
  ]);

  const handleDrillPressDown = useCallback(() => {
    const cur = drillPhaseRef.current;
    if (cur === "running") {
      finishDrillSolve();
      return;
    }
    if (cur === "idle") {
      const holdMs = Math.min(settings.holdDelayMs, 300);
      if (holdMs <= 0) {
        setDrillPhaseBoth("ready");
      } else {
        setDrillPhaseBoth("holding");
        holdTimeoutRef.current = setTimeout(() => {
          if (drillPhaseRef.current === "holding") {
            setDrillPhaseBoth("ready");
          }
        }, holdMs);
      }
    }
  }, [finishDrillSolve, setDrillPhaseBoth, settings.holdDelayMs]);

  const handleDrillPressUp = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    const cur = drillPhaseRef.current;
    if (cur === "just_stopped") {
      setDrillPhaseBoth("idle");
      return;
    }
    if (cur === "holding") {
      setDrillPhaseBoth("idle");
      return;
    }
    if (cur === "ready") {
      startTimeRef.current = performance.now();
      setDrillMs(0);
      setDrillPhaseBoth("running");
      const tick = () => {
        setDrillMs(performance.now() - startTimeRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [setDrillPhaseBoth]);

  const cancelPendingPress = useCallback(() => {
    pressedKeyRef.current = null;
    if (drillPhaseRef.current === "running") return;
    stopDrillLoops();
    setDrillPhaseBoth("idle");
  }, [setDrillPhaseBoth, stopDrillLoops]);

  const drillOpen = drillingAlg !== null;
  useEffect(() => {
    if (!drillOpen) return;
    const previousFocus = document.activeElement;
    drillPadRef.current?.focus({ preventScroll: true });
    return () => {
      pressedKeyRef.current = null;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [drillOpen]);

  useEffect(() => {
    if (!drillOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.matches("input, textarea, select") || target?.isContentEditable) return;

      if (e.key === "Escape") {
        e.preventDefault();
        pressedKeyRef.current = null;
        if (drillPhaseRef.current !== "idle") {
          stopDrillLoops();
          setDrillPhaseBoth("idle");
        } else {
          setDrillingAlg(null);
        }
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (drillPhaseRef.current !== "running") {
        if (e.code !== "Space" || target?.closest("button, a[href], [role='button'], summary")) return;
      }

      e.preventDefault();
      if (e.repeat || pressedKeyRef.current !== null) return;
      pressedKeyRef.current = e.code;
      handleDrillPressDown();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (pressedKeyRef.current !== e.code) return;
      e.preventDefault();
      pressedKeyRef.current = null;
      handleDrillPressUp();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", cancelPendingPress);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", cancelPendingPress);
    };
  }, [cancelPendingPress, drillOpen, handleDrillPressDown, handleDrillPressUp, setDrillPhaseBoth, stopDrillLoops]);

  const copyFormula = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // ignore
    }
  };

  const askServerAiTutor = async () => {
    if (!drillingAlg) return;
    setTutorLoading(true);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "tutor",
          algContext: {
            code: drillingAlg.code,
            name: drillingAlg.name,
            stage: drillingAlg.stage,
            formula: activeDrillingFormula,
            recognition: drillingAlg.recognition,
          },
          userQuestion: tutorQuestion,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        const fallback =
          tutorGuidance?.questionAnswer ||
          tutorGuidance?.fingertrickCoach ||
          "";
        setTutorAiReply(
          `${fallback}\n\n(Đăng nhập tài khoản để dùng thêm giải thích nâng cao từ Gemini AI — chế độ hướng dẫn cục bộ vẫn hoạt động bình thường.)`
        );
      } else if (data?.aiEnhancedText) {
        setTutorAiReply(data.aiEnhancedText);
      } else if (tutorGuidance?.questionAnswer) {
        setTutorAiReply(tutorGuidance.questionAnswer);
      } else {
        setTutorAiReply(tutorGuidance?.fingertrickCoach || null);
      }
    } catch {
      setTutorAiReply(
        tutorGuidance?.questionAnswer ||
          tutorGuidance?.fingertrickCoach ||
          null
      );
    } finally {
      setTutorLoading(false);
    }
  };

  const lastDrillTps = useMemo(() => {
    if (!lastDrillSolve || !activeDrillCaseInfo) return null;
    const eff = getEffectiveMs(lastDrillSolve);
    if (eff === "DNF" || eff <= 0) return null;
    return (activeDrillCaseInfo.moveCount / (eff / 1000)).toFixed(2);
  }, [lastDrillSolve, activeDrillCaseInfo]);

  return (
    <main className="rk-view space-y-4">
      {/* Top Banner & Stage Selector */}
      <div className="rk-panel p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Học CFOP</h1>
            <p className="mt-1 text-sm text-slate-300">
              Tìm công thức, ôn bài đến hạn hoặc luyện từng case có bấm giờ.
            </p>
          </div>

          {/* Interactive Practice Launchers + Overall Progress */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleStartAdaptiveDrill()}
              className="rk-primary"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Luyện theo tiến độ</span>
            </button>

            <button
              type="button"
              onClick={generateNextQuizQuestion}
              className="rk-control"
            >
              <HelpCircle className="w-3.5 h-3.5 text-indigo-300" />
              <span>Quiz nhận diện</span>
            </button>

            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-black/30 border border-white/10">
              <div className="text-xs">
                <span className="text-slate-400">Đã thuộc: </span>
                <strong className="text-emerald-400 font-mono">
                  {progressByStage.ALL.learned}/{progressByStage.ALL.total}
                </strong>
              </div>
              <div className="w-20 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{
                    width: `${Math.round(
                      (progressByStage.ALL.learned /
                        progressByStage.ALL.total) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 4-Tier Structured CFOP Learning Path Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {CFOP_LEARNING_PATH_TIERS.map((t) => {
            const active = tierFilter === t.tier;
            return (
              <button
                key={t.tier}
                type="button"
                onClick={() =>
                  setTierFilter((prev) => (prev === t.tier ? "ALL" : t.tier))
                }
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                  active
                    ? "bg-cyan-500/15 border-cyan-400 text-white"
                    : "bg-black/25 hover:bg-white/[0.06] border-white/10 text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-cyan-300">
                    {t.title}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-amber-300 shrink-0">
                    {t.targetBadge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  {t.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Stage Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "CROSS", "F2L", "OLL", "PLL"] as const).map((st) => {
            const active = stageFilter === st;
            const prog = progressByStage[st];
            const label =
              st === "ALL"
                ? "Tất cả CFOP"
                : st === "CROSS"
                ? "1. Cross & Trigger"
                : st === "F2L"
                ? "2. F2L (2 tầng đầu)"
                : st === "OLL"
                ? "3. OLL (Mặt vàng)"
                : "4. PLL (Đầy đủ 21/21)";
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStageFilter(st)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition flex items-center gap-2 ${
                  active
                    ? "bg-cyan-500 text-slate-950 border-cyan-400"
                    : "bg-white/[0.05] hover:bg-white/[0.1] border-white/10"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`text-[11px] font-mono px-1.5 py-0.5 rounded-md ${
                    active
                      ? "bg-slate-950/20 text-slate-950"
                      : "bg-black/35 text-slate-300"
                  }`}
                >
                  {prog.learned}/{prog.total}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Smart Filters (Including SRS Due Review Filter) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <div className="relative flex-1 min-w-0 basis-52">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên (VD: Sune, T Perm, Jb, Sexy, H Perm, OLL 27, F2L 17)..."
              className="w-full h-9 pl-9 pr-8 rounded-xl bg-black/35 border border-white/10 text-xs sm:text-sm focus:outline-none focus:border-cyan-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOnlyDueReview((v) => !v)}
            className={`h-9 px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition ${
              onlyDueReview
                ? "bg-rose-500/20 text-rose-200 border-rose-400/50"
                : "bg-white/[0.05] hover:bg-white/[0.1] border-white/10 text-slate-200"
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 text-rose-400" />
            <span>Đến hạn ôn SRS ({dueReviewCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setOnlyTwoLook((v) => !v)}
            className={`h-9 px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition ${
              onlyTwoLook
                ? "bg-amber-400/20 text-amber-300 border-amber-400/50"
                : "bg-white/[0.05] hover:bg-white/[0.1] border-white/10 text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>2-Look CFOP</span>
          </button>

          <button
            type="button"
            onClick={() => setOnlyUnlearned((v) => !v)}
            className={`h-9 px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition ${
              onlyUnlearned
                ? "bg-indigo-500/25 text-indigo-200 border-indigo-400/50"
                : "bg-white/[0.05] hover:bg-white/[0.1] border-white/10 text-slate-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Chưa thuộc</span>
          </button>
        </div>

        {/* Custom Multi-Group Practice Set Bar */}
        <div className="rounded-xl bg-black/30 border border-white/10 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-300">
                <ListChecks className="w-4 h-4" />
                <span>Bộ case luyện ngẫu nhiên:</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-400/30 font-mono text-cyan-200 font-semibold">
                {selectedPracticeAlgs.length} case đã chọn
              </span>
              {selectedPracticeAlgs.length === 0 && (
                <span className="text-slate-400">
                  Tích ô <strong>Chọn luyện</strong> trên từng thẻ (có thể trộn F2L, OLL, PLL cùng lúc) để tạo bộ luyện riêng.
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedPracticeAlgs.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPracticeSetDrawer((v) => !v)}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-slate-200 transition"
                  >
                    {showPracticeSetDrawer
                      ? "Ẩn danh sách"
                      : `Xem danh sách (${selectedPracticeAlgs.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdatePracticeSetIds([])}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 hover:text-rose-300 border border-white/10 text-xs text-slate-300 transition"
                  >
                    Bỏ chọn hết
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={selectedPracticeAlgs.length === 0}
                onClick={handleStartCustomSetDrill}
                className="h-8 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Luyện ngẫu nhiên</span>
              </button>
            </div>
          </div>

          {showPracticeSetDrawer && selectedPracticeAlgs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/10">
              {selectedPracticeAlgs.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-xs"
                >
                  <span className="font-mono font-bold text-cyan-300">
                    {a.code}
                  </span>
                  <span className="text-slate-300 max-w-[140px] truncate">
                    {a.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Bỏ chọn ${a.code}`}
                    onClick={() => togglePracticeSetItem(a.id)}
                    className="text-slate-400 hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Algorithm Cards Grid */}
      {filteredAlgs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-16 text-center text-sm text-slate-400">
          Không tìm thấy công thức CFOP nào khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredAlgs.map((alg) => {
            const sName = getCfopSessionName(alg);
            const algStats = sessionStatsByName.get(sName);
            const prog = cfopProgress[alg.id];
            const isLearned = isAlgLearned(alg.id);
            const isDue = isCfopDueForReview(prog);
            const activeFormula = prog?.preferred_formula || alg.formula;
            const stageMeta = CFOP_STAGE_META[alg.stage];

            return (
              <div
                key={alg.id}
                className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition ${
                  isLearned
                    ? "border-emerald-500/35 bg-emerald-500/[0.04]"
                    : "border-white/10 bg-white/[0.04] hover:border-white/20"
                }`}
              >
                {/* Top Row: Diagram + Meta */}
                <div className="flex items-start gap-3.5">
                  <CfopCaseDiagram stage={alg.stage} formula={activeFormula} />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${stageMeta.badgeColor}`}
                      >
                        {alg.code}
                      </span>
                      {alg.isTwoLook && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-400/15 text-amber-300 border border-amber-400/30">
                          2-Look
                        </span>
                      )}
                      {prog?.status === "mastered" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Thành thạo
                        </span>
                      )}
                      {isDue && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Cần ôn SRS
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-sm sm:text-base leading-snug">
                      {alg.name}
                    </h3>

                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {alg.recognition}
                    </p>
                  </div>

                  {/* Selection Checkbox + Learned Toggle */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-pressed={practiceSetLookup.has(alg.id)}
                      title={
                        practiceSetLookup.has(alg.id)
                          ? "Bỏ khỏi bộ luyện ngẫu nhiên"
                          : "Thêm vào bộ luyện ngẫu nhiên"
                      }
                      onClick={() => togglePracticeSetItem(alg.id)}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition ${
                        practiceSetLookup.has(alg.id)
                          ? "bg-cyan-500/20 border-cyan-400/60 text-cyan-200"
                          : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      {practiceSetLookup.has(alg.id) ? (
                        <CheckSquare className="w-3.5 h-3.5 text-cyan-300" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                      <span>{practiceSetLookup.has(alg.id) ? "Đã chọn" : "Chọn"}</span>
                    </button>

                    <button
                      type="button"
                      title={
                        isLearned
                          ? "Đặt lại trạng thái chưa thuộc (cần xác nhận)"
                          : "Đánh dấu đã thuộc (Lên lịch SRS)"
                      }
                      onClick={() => toggleLearned(alg)}
                      className={`p-1.5 rounded-lg border transition ${
                        isLearned
                          ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
                          : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Formula Box */}
                <div className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono text-xs sm:text-sm font-bold text-cyan-300 break-words">
                      {activeFormula}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyFormula(alg.id, activeFormula)}
                      title="Copy công thức"
                      className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white shrink-0"
                    >
                      {copiedId === alg.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {alg.altFormula && alg.altFormula !== activeFormula && (
                    <div className="text-[11px] font-mono text-slate-400">
                      Biến thể 2: {alg.altFormula}
                    </div>
                  )}
                </div>

                {/* Footer: Dedicated Session Stats + Practice Button */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {algStats && algStats.summary.totalCount > 0 ? (
                    <div className="flex items-center gap-2.5 text-xs font-mono tabular-nums">
                      <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                        <Trophy className="w-3 h-3" />
                        PB:{" "}
                        {formatTimeMs(
                          algStats.summary.bestSingle,
                          settings.decimals
                        )}
                      </span>
                      <span className="text-slate-300">
                        Ao5:{" "}
                        {formatTimeMs(
                          algStats.summary.currentAo5,
                          settings.decimals
                        )}
                      </span>
                      <span className="text-slate-400 font-sans text-[11px]">
                        ({algStats.summary.totalCount} lần)
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      Chưa có lịch sử bấm giờ
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenDrill(alg, false)}
                    className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition shrink-0"
                  >
                    <Timer className="w-3.5 h-3.5" />
                    <span>Luyện bấm giờ</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* FLASH RECOGNITION QUIZ MODAL                                         */}
      {/* ==================================================================== */}
      {quizOpen && quizTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setQuizOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Quiz nhận diện nhanh CFOP"
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 text-white p-6 space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setQuizOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pr-8">
              <div>
                <h2 className="text-lg font-bold">
                  Quiz Luyện Phản Xạ Nhận Diện CFOP
                </h2>
                <p className="text-xs text-slate-400">
                  Quan sát hình khối (đã xoay AUF ngẫu nhiên) và chọn đúng tên trường hợp
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono text-xs font-bold">
                Chuỗi đúng: {quizStreak}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center py-4 rounded-xl bg-black/40 border border-white/10">
              <CfopCaseDiagram
                stage={quizTarget.stage}
                formula={quizTarget.formula}
                appliedMoves={quizAuf}
                size="lg"
              />
              <span className="text-[11px] text-slate-400 mt-2">
                Nhóm: {CFOP_STAGE_META[quizTarget.stage].title}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {quizChoices.map((choice) => {
                const isTarget = choice.id === quizTarget.id;
                const isPicked = quizResult?.pickedId === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={Boolean(quizResult)}
                    onClick={() => handleAnswerQuiz(choice)}
                    className={`p-3 rounded-xl border text-left transition ${
                      !quizResult
                        ? "bg-white/[0.05] hover:bg-white/[0.12] border-white/10"
                        : isTarget
                        ? "bg-emerald-500/25 border-emerald-400 text-emerald-200"
                        : isPicked
                        ? "bg-rose-500/25 border-rose-400 text-rose-200"
                        : "bg-black/25 border-white/5 opacity-50"
                    }`}
                  >
                    <div className="font-bold text-xs text-cyan-300">
                      {choice.code}
                    </div>
                    <div className="text-sm font-semibold mt-0.5">
                      {choice.name}
                    </div>
                  </button>
                );
              })}
            </div>

            {quizResult && (
              <div className="rounded-xl bg-black/45 border border-white/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <strong
                    className={
                      quizResult.correct ? "text-emerald-400" : "text-rose-400"
                    }
                  >
                    {quizResult.correct
                      ? `Chính xác! Phản xạ: ${(
                          quizResult.reactionMs / 1000
                        ).toFixed(2)}s`
                      : `Chưa đúng! Đáp án là ${quizTarget.code}: ${quizTarget.name}`}
                  </strong>
                  <p className="text-slate-300 mt-0.5">
                    Công thức: <code className="text-cyan-300">{quizTarget.formula}</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={generateNextQuizQuestion}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                >
                  Câu tiếp theo →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DEDICATED ALGORITHM DRILL TIMER STUDIO MODAL                         */}
      {/* ==================================================================== */}
      {drillingAlg && activeDrillCaseInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6"
          onClick={() => {
            if (drillPhaseRef.current === "idle") setDrillingAlg(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Phòng luyện bấm giờ ${drillingAlg.name}`}
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 text-white p-4 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Studio Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                      CFOP_STAGE_META[drillingAlg.stage].badgeColor
                    }`}
                  >
                    {adaptiveMode && !adaptiveRevealed
                      ? "??? (Chế độ Ẩn Tên Bài)"
                      : drillingAlg.code}
                  </span>
                  {adaptiveMode && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                      Adaptive Drill: {adaptiveReason}
                    </span>
                  )}
                  {customSetMode && customQueue && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-emerald-200 font-mono">
                      Bộ tự chọn • Vòng #{customQueue.roundNumber} • Case{" "}
                      {customQueue.completedInRound}/{customQueue.caseIds.length}
                    </span>
                  )}
                </div>
                <h2 className="text-lg sm:text-xl font-bold mt-1">
                  {(adaptiveMode || customSetMode) && !adaptiveRevealed
                    ? "Tráo theo Setup Moves bên dưới, tự nhìn khối Rubik và giải!"
                    : drillingAlg.name}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {customSetMode && (
                  <button
                    type="button"
                    onClick={handleNextCustomSetCase}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1 transition"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Case tiếp theo trong bộ</span>
                  </button>
                )}
                {adaptiveMode && (
                  <button
                    type="button"
                    onClick={() => handleStartAdaptiveDrill(drillingAlg.id)}
                    className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1 transition"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Bốc bài ngẫu nhiên kế tiếp</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowTutorPanel((v) => !v)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                    showTutorPanel
                      ? "bg-indigo-500/25 border-indigo-400 text-indigo-200"
                      : "bg-white/[0.07] hover:bg-white/[0.14] border-white/10"
                  }`}
                >
                  <BrainCircuit className="w-3.5 h-3.5 text-cyan-400" />
                  <span>AI CFOP Tutor & So sánh Biến thể</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const targetAlg = drillingAlg;
                    setDrillingAlg(null);
                    onOpenInMainTimer(targetAlg);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-medium inline-flex items-center gap-1 transition"
                >
                  <span>Mở ở Bàn Timer chính</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopDrillLoops();
                    setDrillPhaseBoth("idle");
                    setDrillingAlg(null);
                  }}
                  className="p-2 rounded-xl bg-white/[0.07] hover:bg-white/15 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Top Section: Case Diagram + Step-by-Step Scrubber + Formula + Setup Scramble */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center rounded-2xl bg-white/[0.03] border border-white/10 p-4">
              <div className="md:col-span-3 flex flex-col items-center gap-2">
                <CfopCaseDiagram
                  stage={drillingAlg.stage}
                  formula={activeDrillingFormula}
                  appliedMoves={
                    scrubberStep !== null
                      ? activeDrillTokens.slice(0, scrubberStep).join(" ")
                      : adaptiveMode && !adaptiveRevealed
                      ? adaptiveAuf
                      : undefined
                  }
                  size="lg"
                />
                <span className="text-[11px] text-slate-400">
                  Vàng ở trên (U) • {activeDrillCaseInfo.moveCount} nước STM
                </span>

                {/* Step-by-Step Move Scrubber Controls */}
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setScrubberStep(0)}
                    className="p-1 rounded bg-white/10 hover:bg-white/20"
                    title="Về thế cờ bắt đầu"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setScrubberStep((s) =>
                        Math.max(0, (s ?? activeDrillTokens.length) - 1)
                      )
                    }
                    className="p-1 rounded bg-white/10 hover:bg-white/20"
                    title="Lùi 1 nước"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="font-mono text-[11px] px-1.5 text-cyan-300">
                    {scrubberStep === null
                      ? "Thế cờ"
                      : `${scrubberStep}/${activeDrillTokens.length}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setScrubberStep((s) =>
                        Math.min(activeDrillTokens.length, (s ?? 0) + 1)
                      )
                    }
                    className="p-1 rounded bg-white/10 hover:bg-white/20"
                    title="Tiến 1 nước"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="md:col-span-9 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-400">
                    Công thức thực hiện:
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      setBlindMode((v) => !v);
                      setAdaptiveRevealed(true);
                      e.currentTarget.blur();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs inline-flex items-center gap-1.5 transition"
                  >
                    {blindMode ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-amber-300" />
                        <span className="text-amber-300">Hiện công thức</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Ẩn để tự nhớ</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="rounded-xl bg-black/50 border border-cyan-500/30 px-4 py-3">
                  {blindMode ? (
                    <p className="font-mono text-base sm:text-lg text-amber-300/80 italic select-none">
                      ••• Đang bật chế độ kiểm tra phản xạ & trí nhớ (Giải xong sẽ tự hiện kết quả) •••
                    </p>
                  ) : (
                    <p className="font-mono text-lg sm:text-2xl font-bold text-cyan-300 tracking-wide">
                      {activeDrillingFormula}
                    </p>
                  )}
                </div>

                <div className="text-xs bg-black/30 rounded-xl px-3 py-2 border border-white/5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-400">
                      Setup tạo thế cờ này từ khối Rubik đã giải (để Vàng lên trên):{" "}
                    </span>
                    <code className="font-mono text-amber-300 font-semibold">
                      {activeDrillCaseInfo.setupMoves}
                    </code>
                  </div>

                  {/* Quick SM-2 Spaced Repetition Self-Grading Buttons */}
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400 mr-1">
                      Độ nhớ SRS:
                    </span>
                    {(
                      [
                        { q: 1, label: "Quên", cls: "hover:bg-rose-500/20 text-rose-300" },
                        { q: 2, label: "Khó", cls: "hover:bg-amber-500/20 text-amber-300" },
                        { q: 4, label: "Thuộc", cls: "hover:bg-cyan-500/20 text-cyan-300" },
                        { q: 5, label: "Thành thạo", cls: "hover:bg-emerald-500/20 text-emerald-300" },
                      ] as const
                    ).map((btn) => (
                      <button
                        key={btn.q}
                        type="button"
                        onClick={() => {
                          const updated = computeNextSm2Progress(
                            drillingAlg.id,
                            cfopProgress[drillingAlg.id],
                            btn.q,
                            activeDrillingFormula
                          );
                          onUpdateCfopProgress(updated);
                        }}
                        className={`px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] font-medium transition ${btn.cls}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Collapsible AI CFOP Tutor & Algorithm Variant Comparison Panel */}
            {showTutorPanel && tutorGuidance && (
              <div className="rounded-2xl bg-indigo-950/30 border border-indigo-400/30 p-4 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-indigo-200 flex items-center gap-1.5">
                    <BrainCircuit className="w-4 h-4 text-cyan-400" />
                    <span>
                      Gia sư AI CFOP & So sánh Biến thể Công thức ({drillingAlg.code})
                    </span>
                  </strong>
                  <span className="text-[11px] text-slate-400">
                    Chọn công thức hợp tay nhất để tính đúng STM & TPS
                  </span>
                </div>

                {/* Variant Comparator */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {tutorGuidance.variants.map((v) => {
                    const isSelected = v.formula === activeDrillingFormula;
                    return (
                      <div
                        key={v.label}
                        className={`rounded-xl p-3 border flex flex-col justify-between gap-2 ${
                          isSelected
                            ? "bg-cyan-500/15 border-cyan-400"
                            : "bg-black/40 border-white/10"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">
                              {v.label}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white/10 font-mono text-[11px] text-cyan-300">
                              {v.stmMoves} STM • {v.styleTag}
                            </span>
                          </div>
                          <code className="block font-mono text-sm font-bold text-white mt-1.5">
                            {v.formula}
                          </code>
                          <p className="text-[11px] text-slate-300 mt-1">
                            {v.ergonomics}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const existing = cfopProgress[drillingAlg.id];
                            const nowIso = new Date().toISOString();
                            onUpdateCfopProgress({
                              alg_id: drillingAlg.id,
                              status: existing?.status || "learning",
                              preferred_formula: v.formula,
                              ease_factor: existing?.ease_factor ?? 2.5,
                              interval_days: existing?.interval_days ?? 1,
                              repetitions: existing?.repetitions ?? 0,
                              next_review_at: existing?.next_review_at || nowIso,
                              updated_at: nowIso,
                            });
                          }}
                          className={`self-start px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                            isSelected
                              ? "bg-cyan-400 text-slate-950"
                              : "bg-white/10 hover:bg-white/20 text-slate-200"
                          }`}
                        >
                          {isSelected
                            ? "✓ Đang dùng làm công thức chính"
                            : "Chọn làm công thức chính"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Trigger Breakdown Steps */}
                <div className="space-y-1.5">
                  <div className="font-semibold text-cyan-300">
                    Phân tách cấu trúc Trigger & Hướng dẫn Fingertrick:
                  </div>
                  <p className="text-slate-200 leading-relaxed">
                    {tutorGuidance.fingertrickCoach}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {tutorGuidance.triggers.map((tr, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg bg-black/35 border border-white/10 p-2.5"
                      >
                        <div className="text-[11px] font-semibold text-amber-300">
                          {tr.label}
                        </div>
                        <code className="font-mono text-xs font-bold text-white">
                          {tr.moves}
                        </code>
                        <p className="text-[11px] text-slate-300 mt-1">
                          {tr.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Interactive Ask AI Tutor Input */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={tutorQuestion}
                    onChange={(e) => setTutorQuestion(e.target.value)}
                    placeholder="Hỏi thêm AI Gia sư (VD: Mẹo nhớ công thức này? Cách nhận diện 2 mặt?)..."
                    className="flex-1 min-w-0 basis-52 h-8 rounded-lg bg-black/50 border border-white/15 px-3 text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    disabled={tutorLoading}
                    onClick={askServerAiTutor}
                    className="h-8 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                  >
                    {tutorLoading ? "Đang phân tích..." : "Hỏi AI Gia sư"}
                  </button>
                </div>

                {tutorAiReply && (
                  <div className="rounded-xl bg-black/50 border border-cyan-500/30 p-3 text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {tutorAiReply}
                  </div>
                )}
              </div>
            )}

            {/* Interactive Spacebar / Touch Drill Pad */}
            <div
              ref={drillPadRef}
              role="group"
              aria-label="Vùng bấm giờ CFOP"
              tabIndex={0}
              onTouchCancel={cancelPendingPress}
              onTouchStart={(e) => {
                if ((e.target as HTMLElement).closest("[data-drill-action]"))
                  return;
                e.preventDefault();
                handleDrillPressDown();
              }}
              onTouchEnd={(e) => {
                if ((e.target as HTMLElement).closest("[data-drill-action]"))
                  return;
                e.preventDefault();
                handleDrillPressUp();
              }}
              className="rounded-2xl border border-white/15 bg-white/[0.03] py-8 px-4 flex flex-col items-center justify-center select-none cursor-pointer"
            >
              {isDrillPb && drillPhase === "idle" && lastDrillSolve && (
                <div className="mb-2 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 transition-all duration-300 ease-out">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>PB mới cho {drillingAlg.name}!</span>
                </div>
              )}

              <div
                className={`font-mono font-bold tabular-nums leading-none text-6xl sm:text-7xl transition-transform ${
                  drillPhase === "holding"
                    ? "text-rose-400 scale-[0.98]"
                    : drillPhase === "ready"
                    ? "text-emerald-400 scale-[1.04]"
                    : lastDrillSolve?.penalty === "DNF" && drillPhase === "idle"
                    ? "text-rose-400"
                    : lastDrillSolve?.penalty === "+2" && drillPhase === "idle"
                    ? "text-amber-300"
                    : "text-white"
                }`}
              >
                {drillPhase === "running"
                  ? formatTimeMs(drillMs, settings.decimals)
                  : drillPhase === "holding" || drillPhase === "ready"
                  ? formatTimeMs(0, settings.decimals)
                  : lastDrillSolve
                  ? formatSolveDisplay(lastDrillSolve, settings.decimals)
                  : formatTimeMs(0, settings.decimals)}
              </div>

              {/* Live TPS Badge */}
              {drillPhase === "idle" && lastDrillTps && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span>
                    Tốc độ ngón tay: {lastDrillTps} TPS (
                    {activeDrillCaseInfo.moveCount} nước STM)
                  </span>
                </div>
              )}

              <p className="mt-3 text-xs text-slate-400 text-center">
                {drillPhase === "running"
                  ? "Nhấn phím bất kỳ hoặc chạm màn hình để DỪNG"
                  : drillPhase === "holding"
                  ? "Tiếp tục giữ..."
                  : drillPhase === "ready"
                  ? "Thả tay để bắt đầu!"
                  : "Nhấn giữ Space (hoặc chạm giữ vùng này trên điện thoại) để luyện công thức"}
              </p>

              {/* Quick Penalty / Delete for Last Drill Solve */}
              {drillPhase === "idle" && lastDrillSolve && (
                <div
                  data-drill-action="true"
                  className="mt-4 flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      onUpdateSolvePenalty(
                        lastDrillSolve.id,
                        lastDrillSolve.penalty === "+2" ? "OK" : "+2"
                      );
                      e.currentTarget.blur();
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                      lastDrillSolve.penalty === "+2"
                        ? "bg-amber-400 text-slate-950 border-amber-400"
                        : "bg-white/5 border-white/10 text-amber-300 hover:bg-amber-400/20"
                    }`}
                  >
                    +2
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      onUpdateSolvePenalty(
                        lastDrillSolve.id,
                        lastDrillSolve.penalty === "DNF" ? "OK" : "DNF"
                      );
                      e.currentTarget.blur();
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                      lastDrillSolve.penalty === "DNF"
                        ? "bg-rose-500 text-white border-rose-500"
                        : "bg-white/5 border-white/10 text-rose-300 hover:bg-rose-500/20"
                    }`}
                  >
                    DNF
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      onDeleteSolve(lastDrillSolve.id);
                      e.currentTarget.blur();
                    }}
                    className="px-3 py-1 rounded-lg text-xs bg-white/5 hover:bg-rose-500/20 hover:text-rose-300 border border-white/10 inline-flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa lượt cuối</span>
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Section: Algorithm Session Stats & Mini History */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
                  <div className="text-[11px] text-slate-400">Kỷ lục PB</div>
                  <div className="font-mono text-lg font-bold text-emerald-400 mt-0.5 tabular-nums">
                    {formatTimeMs(
                      activeDrillStats.summary.bestSingle,
                      settings.decimals
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
                  <div className="text-[11px] text-slate-400">Ao5 hiện tại</div>
                  <div className="font-mono text-lg font-bold text-cyan-300 mt-0.5 tabular-nums">
                    {formatTimeMs(
                      activeDrillStats.summary.currentAo5,
                      settings.decimals
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
                  <div className="text-[11px] text-slate-400">Ao12 hiện tại</div>
                  <div className="font-mono text-lg font-bold text-indigo-300 mt-0.5 tabular-nums">
                    {formatTimeMs(
                      activeDrillStats.summary.currentAo12,
                      settings.decimals
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
                  <div className="text-[11px] text-slate-400">
                    Mean ({activeDrillStats.summary.validCount} lần)
                  </div>
                  <div className="font-mono text-lg font-bold mt-0.5 tabular-nums">
                    {formatTimeMs(
                      activeDrillStats.summary.mean,
                      settings.decimals
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Solves for this Algorithm Session */}
              <div className="md:col-span-7 rounded-xl bg-white/[0.04] border border-white/10 p-3 flex flex-col max-h-40">
                <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5">
                    <Play className="w-3 h-3 text-cyan-400" />
                    Lịch sử riêng của {drillingAlg.code} (
                    {activeDrillStats.enrichedSolves.length} lần)
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto flex flex-wrap gap-1.5 content-start">
                  {activeDrillStats.enrichedSolves.length === 0 ? (
                    <span className="text-xs text-slate-400">
                      Chưa có lượt tập nào. Nhấn Space để lưu lượt đầu tiên vào session riêng này!
                    </span>
                  ) : (
                    [...activeDrillStats.enrichedSolves]
                      .reverse()
                      .map((sv) => {
                        const isPb =
                          sv.id === activeDrillStats.summary.bestSingleSolveId;
                        return (
                          <span
                            key={sv.id}
                            className={`px-2 py-1 rounded-lg text-xs font-mono border inline-flex items-center gap-1.5 ${
                              isPb
                                ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-300 font-bold"
                                : "bg-black/35 border-white/10"
                            }`}
                          >
                            <span className="text-slate-400">
                              #{sv.indexNumber}
                            </span>
                            <span>
                              {formatSolveDisplay(sv, settings.decimals)}
                            </span>
                            <button
                              type="button"
                              onClick={() => onDeleteSolve(sv.id)}
                              className="text-slate-400 hover:text-rose-400"
                              title="Xóa"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
