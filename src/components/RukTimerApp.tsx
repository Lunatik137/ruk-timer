"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart2,
  Box,
  BrainCircuit,
  Clock,
  GraduationCap,
  ListOrdered,
  Shuffle,
  Swords,
  X,
} from "lucide-react";
import AiCoachAndCommunityView, {
  HubSubTab,
} from "@/components/AiCoachAndCommunityView";
import AuthModal from "@/components/AuthModal";
import CfopTrainerView from "@/components/CfopTrainerView";
import ConfirmDialog from "@/components/ConfirmDialog";
import CubeNetPreview from "@/components/CubeNetPreview";
import Header, { MainAppView } from "@/components/Header";
import HistoryPanel from "@/components/HistoryPanel";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import ScrambleBar from "@/components/ScrambleBar";
import SettingsModal from "@/components/SettingsModal";
import SolveDetailModal, {
  DetailModalTarget,
} from "@/components/SolveDetailModal";
import StatsPanel from "@/components/StatsPanel";
import TimerDisplay, { TimerPhase } from "@/components/TimerDisplay";
import { PracticeRecommendation } from "@/lib/analytics/coach";
import { CfopAlgorithm, getCfopSessionName } from "@/lib/cfop";
import {
  createF2lWorkout,
  evaluateWorkoutOutcome,
  recordWorkoutSolve,
  type GuidedWorkoutState,
} from "@/lib/core/workout";
import {
  generateScramble,
  generateTrainingSubsetScramble,
  invertAlgorithm,
} from "@/lib/scrambles";
import { playPbCelebration } from "@/lib/sound";
import {
  calculateSessionStats,
  computeSessionFatigueAlert,
  computeStreakAndHeatmap,
  formatSolveDisplay,
  getEffectiveMs,
} from "@/lib/stats";
import {
  cloudClearSessionSolves,
  cloudDeleteSession,
  cloudDeleteSolve,
  cloudInsertSession,
  cloudInsertSolve,
  cloudSavePracticeSet,
  cloudSaveUserSettings,
  cloudUpdateSession,
  cloudUpdateSolve,
  cloudUpsertCfopProgress,
  createDefaultSession,
  exportDataAsJson,
  exportSolvesAsCsv,
  fetchCloudData,
  flushSyncOutbox,
  generateUuid,
  getGuestSolveCount,
  getPendingOutboxCount,
  loadActiveSessionId,
  loadGuestData,
  loadGuidedWorkoutRaw,
  loadLocalCfopProgress,
  loadLocalPracticeSet,
  loadLocalSettings,
  loadUserLocalCache,
  parseBackup,
  planImport,
  saveActiveSessionId,
  saveGuestSessions,
  saveGuestSolves,
  saveGuidedWorkoutRaw,
  saveLocalCfopProgress,
  saveLocalPracticeSet,
  saveLocalSettings,
  saveUserLocalCache,
  syncGuestToCloud,
  type ImportPlan,
} from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  CfopProgressItem,
  CubeSession,
  DEFAULT_SETTINGS,
  PenaltyType,
  PuzzleType,
  ScrambleSource,
  Solve,
  TimerSettings,
  TrainingSubset,
} from "@/types/cubing";

export default function RukTimerApp() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<CubeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [solves, setSolves] = useState<Solve[]>([]);
  const [cfopProgress, setCfopProgress] = useState<
    Record<string, CfopProgressItem>
  >({});
  const [practiceSetIds, setPracticeSetIds] = useState<string[]>([]);
  const [guidedWorkout, setGuidedWorkout] = useState<GuidedWorkoutState | null>(
    null
  );

  const [trainingSubset, setTrainingSubset] = useState<TrainingSubset>("wca");
  const [scramble, setScramble] = useState<string>("Đang tạo scramble...");
  const [scramblePuzzle, setScramblePuzzle] = useState<PuzzleType>("3x3");
  const [scrambleSource, setScrambleSource] =
    useState<ScrambleSource>("random-move");
  const [isGeneratingScramble, setIsGeneratingScramble] = useState(false);
  const [previousScramble, setPreviousScramble] = useState<string | null>(null);
  const [timerPhase, setTimerPhase] = useState<TimerPhase>("idle");
  const [isNewPb, setIsNewPb] = useState<boolean>(false);
  const [compModeActive, setCompModeActive] = useState(false);
  const [compModeTrigger, setCompModeTrigger] = useState(0);

  // Centralized Confirmation Dialog State
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    scopeNote?: string;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const requestConfirm = useCallback(
    (req: {
      title: string;
      description: string;
      scopeNote?: string;
      confirmLabel?: string;
      onConfirm: () => void | Promise<void>;
    }) => {
      setConfirmState(req);
    },
    []
  );

  // Import Preview State
  const [pendingImportPlan, setPendingImportPlan] = useState<ImportPlan | null>(
    null
  );
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Auth & Cloud Sync State
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    "guest" | "synced" | "syncing" | "error"
  >("guest");
  const [guestPendingCount, setGuestPendingCount] = useState<number>(0);
  const [outboxCount, setOutboxCount] = useState<number>(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modals & Navigation Views
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [mobileCubeModalOpen, setMobileCubeModalOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DetailModalTarget | null>(
    null
  );
  const [mainView, setMainView] = useState<MainAppView>("timer");
  const [hubSubTab, setHubSubTab] = useState<HubSubTab>("coach");
  const [hasOpenedHub, setHasOpenedHub] = useState(false);
  useEffect(() => {
    if (mainView === "coach") setHasOpenedHub(true);
  }, [mainView]);
  const [mobileTab, setMobileTab] = useState<
    "timer" | "history" | "stats"
  >("timer");

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Load initial local state + subscribe to Supabase Auth + Auto-flush offline outbox
  useEffect(() => {
    const loadedSettings = loadLocalSettings();
    setSettings(loadedSettings);

    const localCfop = loadLocalCfopProgress();
    setCfopProgress(localCfop);
    setPracticeSetIds(loadLocalPracticeSet());
    try {
      const rawWorkout = loadGuidedWorkoutRaw();
      if (rawWorkout) setGuidedWorkout(JSON.parse(rawWorkout));
    } catch {
      // ignore corrupt workout
    }

    const guest = loadGuestData();
    const savedActiveId = loadActiveSessionId();
    const validSession =
      guest.sessions.find((s) => s.id === savedActiveId) || guest.sessions[0];

    setSessions(guest.sessions);
    setActiveSessionId(validSession.id);
    setSolves(guest.solves);
    setScramble(generateScramble(validSession.puzzle));
    setScramblePuzzle(validSession.puzzle);
    setMounted(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const hydrateCloudUser = async (uid: string, email: string | null) => {
      setUserId(uid);
      setUserEmail(email);
      setGuestPendingCount(getGuestSolveCount());
      setSyncStatus("syncing");

      // Load per-user offline cache immediately so app stays usable even without internet
      const cached = loadUserLocalCache(uid);
      if (cached) {
        setSessions(cached.sessions);
        setSolves(cached.solves);
        setCfopProgress(cached.cfopProgress);
        setPracticeSetIds(cached.practiceSetIds);
      }

      const flushRes = await flushSyncOutbox(uid);
      setOutboxCount(flushRes.remainingCount);

      const res = await fetchCloudData(uid);
      if (res.error) {
        setSyncStatus("error");
        showToast(`Đang chạy chế độ Offline Cache: ${res.error}`);
        return;
      }

      setSessions(res.sessions);
      setSolves(res.solves);

      const nextCfop =
        res.cfopProgress && Object.keys(res.cfopProgress).length > 0
          ? { ...loadLocalCfopProgress(), ...res.cfopProgress }
          : loadLocalCfopProgress();
      setCfopProgress(nextCfop);
      saveLocalCfopProgress(nextCfop);

      const nextPracticeSet = Array.isArray(res.practiceSetIds)
        ? res.practiceSetIds
        : loadLocalPracticeSet();
      setPracticeSetIds(nextPracticeSet);
      saveLocalPracticeSet(nextPracticeSet);

      saveUserLocalCache(uid, {
        sessions: res.sessions,
        solves: res.solves,
        cfopProgress: nextCfop,
        practiceSetIds: nextPracticeSet,
      });

      if (res.remoteSettings) {
        setSettings((prev) => {
          const merged = { ...prev, ...res.remoteSettings };
          saveLocalSettings(merged);
          return merged;
        });
      }

      const savedId = loadActiveSessionId();
      const targetSession =
        res.sessions.find((s) => s.id === savedId) || res.sessions[0];
      if (targetSession) {
        setActiveSessionId(targetSession.id);
        setScramble(generateScramble(targetSession.puzzle));
        setScramblePuzzle(targetSession.puzzle);
      }
      setOutboxCount(await getPendingOutboxCount(uid));
      setSyncStatus("synced");
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        hydrateCloudUser(session.user.id, session.user.email ?? null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          hydrateCloudUser(session.user.id, session.user.email ?? null);
        }
      } else if (event === "SIGNED_OUT") {
        setUserId(null);
        setUserEmail(null);
        setSyncStatus("guest");
        setGuestPendingCount(0);
        const localData = loadGuestData();
        setSessions(localData.sessions);
        setSolves(localData.solves);
        setActiveSessionId(localData.sessions[0].id);
        setScramble(generateScramble(localData.sessions[0].puzzle));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [showToast]);

  // Persist per-user local cache whenever authenticated state changes (offline close/reopen safety)
  useEffect(() => {
    if (!mounted || !userId || sessions.length === 0) return;
    saveUserLocalCache(userId, {
      sessions,
      solves,
      cfopProgress,
      practiceSetIds,
    });
  }, [mounted, userId, sessions, solves, cfopProgress, practiceSetIds]);

  // Listen to browser online recovery to automatically flush offline outbox
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const handleOnline = async () => {
      const res = await flushSyncOutbox(userId);
      setOutboxCount(res.remainingCount);
      if (res.flushedCount > 0) {
        setSyncStatus(res.remainingCount === 0 ? "synced" : "error");
        showToast(`Đã tự động đồng bộ ${res.flushedCount} thao tác Offline lên Cloud!`);
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [userId, showToast]);

  const activeSession: CubeSession = useMemo(() => {
    return (
      sessions.find((s) => s.id === activeSessionId) ||
      sessions[0] ||
      createDefaultSession()
    );
  }, [sessions, activeSessionId]);

  // Strict Scramble <-> 2D Cube synchronization guard:
  // Whenever the active session's puzzle changes (via switch, import, delete, or cloud hydration),
  // guarantee scramble matches activeSession.puzzle so 2D Cube Net can never desync.
  useEffect(() => {
    if (!mounted) return;
    if (scramblePuzzle !== activeSession.puzzle) {
      const next =
        (activeSession.puzzle === "3x3" || activeSession.puzzle === "3x3oh") &&
        trainingSubset !== "wca"
          ? generateTrainingSubsetScramble(trainingSubset)
          : generateScramble(activeSession.puzzle);
      setScramble(next);
      setScramblePuzzle(activeSession.puzzle);
      setPreviousScramble(null);
    }
  }, [mounted, activeSession.puzzle, scramblePuzzle, trainingSubset]);

  const sessionSolves = useMemo(() => {
    return solves
      .filter((s) => s.session_id === activeSession.id)
      .sort(
        (a, b) =>
          new Date(a.solved_at).getTime() - new Date(b.solved_at).getTime()
      );
  }, [solves, activeSession.id]);

  const { summary, enrichedSolves } = useMemo(
    () => calculateSessionStats(sessionSolves),
    [sessionSolves]
  );

  const fatigueAlert = useMemo(
    () => computeSessionFatigueAlert(sessionSolves),
    [sessionSolves]
  );

  const streakSummary = useMemo(
    () => computeStreakAndHeatmap(solves),
    [solves]
  );

  const lastSolve: Solve | null =
    sessionSolves.length > 0 ? sessionSolves[sessionSolves.length - 1] : null;

  useEffect(() => {
    if (detailTarget?.type === "solve") {
      const updated = enrichedSolves.find(
        (s) => s.id === detailTarget.solve.id
      );
      if (updated) {
        setDetailTarget({
          type: "solve",
          solve: updated,
          indexNumber: updated.indexNumber,
        });
      }
    }
  }, [enrichedSolves, detailTarget?.type]);

  const runCloudMutation = useCallback(
    async (task: () => Promise<string | null>) => {
      if (!userId) return;
      setSyncStatus("syncing");
      const err = await task();
      const pending = await getPendingOutboxCount(userId);
      setOutboxCount(pending);
      if (err || pending > 0) {
        setSyncStatus("error");
        showToast("Đã lưu vào hàng đợi Offline (Sẽ tự đồng bộ khi có mạng)");
      } else {
        setSyncStatus("synced");
      }
    },
    [userId, showToast]
  );

  // ==========================================================================
  // Scramble Controls (with WCA 3x3 Random-State for Competition Mode)
  // ==========================================================================
  const generateNextScrambleForState = useCallback(
    (puzzle: PuzzleType, subset: TrainingSubset) => {
      if ((puzzle === "3x3" || puzzle === "3x3oh") && subset !== "wca") {
        return generateTrainingSubsetScramble(subset);
      }
      return generateScramble(puzzle);
    },
    []
  );

  const requestScramble = useCallback(
    async (
      targetPuzzle: PuzzleType,
      targetSubset: TrainingSubset,
      preferRandomState: boolean
    ) => {
      setScramblePuzzle(targetPuzzle);
      if (
        preferRandomState &&
        targetPuzzle === "3x3" &&
        targetSubset === "wca"
      ) {
        setIsGeneratingScramble(true);
        try {
          const res = await fetch("/api/scramble?puzzle=3x3");
          const data = await res.json();
          if (res.ok && typeof data?.scramble === "string" && data.scramble) {
            setScramble(data.scramble);
            setScrambleSource(
              data.source === "random-state" ? "random-state" : "random-move"
            );
            setIsGeneratingScramble(false);
            return;
          }
        } catch {
          // Fallback to local generator when offline
        }
        setIsGeneratingScramble(false);
      }
      setScramble(generateNextScrambleForState(targetPuzzle, targetSubset));
      setScrambleSource("random-move");
    },
    [generateNextScrambleForState]
  );

  const handleNextScramble = useCallback(
    (forPuzzle?: PuzzleType, forSubset?: TrainingSubset) => {
      setPreviousScramble(scramble);
      const targetPuzzle = forPuzzle ?? activeSession.puzzle;
      const targetSubset = forSubset ?? trainingSubset;
      void requestScramble(targetPuzzle, targetSubset, compModeActive);
    },
    [
      scramble,
      activeSession.puzzle,
      trainingSubset,
      compModeActive,
      requestScramble,
    ]
  );

  const handleRestorePreviousScramble = useCallback(() => {
    if (previousScramble) {
      setScramble(previousScramble);
      setPreviousScramble(null);
    }
  }, [previousScramble]);

  const handleChangeTrainingSubset = useCallback(
    (subset: TrainingSubset) => {
      setTrainingSubset(subset);
      handleNextScramble(activeSession.puzzle, subset);
    },
    [activeSession.puzzle, handleNextScramble]
  );

  // ==========================================================================
  // Session & Puzzle Handlers
  // ==========================================================================
  const handleSelectSession = (id: string) => {
    const found = sessions.find((s) => s.id === id);
    if (!found) return;
    setActiveSessionId(id);
    saveActiveSessionId(id);
    setIsNewPb(false);
    setScramble(generateNextScrambleForState(found.puzzle, trainingSubset));
  };

  const handleCreateSession = (name: string, puzzle: PuzzleType) => {
    const newSess: CubeSession = {
      id: generateUuid(),
      user_id: userId ?? undefined,
      name,
      puzzle,
      created_at: new Date().toISOString(),
    };
    const nextSessions = [...sessions, newSess];
    setSessions(nextSessions);
    setActiveSessionId(newSess.id);
    saveActiveSessionId(newSess.id);
    setIsNewPb(false);
    setScramble(generateNextScrambleForState(puzzle, trainingSubset));

    if (userId) {
      runCloudMutation(() => cloudInsertSession(userId, newSess));
    } else {
      saveGuestSessions(nextSessions);
    }
    showToast(`Đã tạo "${name}"`);
  };

  const handleRenameSession = (id: string, name: string) => {
    const nextSessions = sessions.map((s) =>
      s.id === id ? { ...s, name } : s
    );
    setSessions(nextSessions);
    const updated = nextSessions.find((s) => s.id === id);

    if (userId && updated) {
      runCloudMutation(() => cloudUpdateSession(userId, updated));
    } else {
      saveGuestSessions(nextSessions);
    }
  };

  const performDeleteSession = useCallback(
    (id: string) => {
      if (sessions.length <= 1) return;
      const nextSessions = sessions.filter((s) => s.id !== id);
      const nextSolves = solves.filter((sv) => sv.session_id !== id);
      setSessions(nextSessions);
      setSolves(nextSolves);

      const fallback = nextSessions[0];
      setActiveSessionId(fallback.id);
      saveActiveSessionId(fallback.id);
      setScramble(generateNextScrambleForState(fallback.puzzle, trainingSubset));
      setScramblePuzzle(fallback.puzzle);

      if (userId) {
        runCloudMutation(() => cloudDeleteSession(userId, id));
      } else {
        saveGuestSessions(nextSessions);
        saveGuestSolves(nextSolves);
      }
      showToast("Đã xóa phiên giải");
    },
    [
      generateNextScrambleForState,
      runCloudMutation,
      sessions,
      showToast,
      solves,
      trainingSubset,
      userId,
    ]
  );

  const handleDeleteSession = (id: string) => {
    if (sessions.length <= 1) return;
    const target = sessions.find((s) => s.id === id);
    if (!target) return;
    const affectedCount = solves.filter((sv) => sv.session_id === id).length;
    requestConfirm({
      title: `Xóa phiên "${target.name}"?`,
      description: `Thao tác này sẽ xóa phiên "${target.name}" (${target.puzzle.toUpperCase()}) cùng toàn bộ ${affectedCount} lượt giải bên trong.`,
      scopeNote: userId
        ? "Dữ liệu đang đồng bộ Cloud — phiên này sẽ bị xóa trên tất cả thiết bị đăng nhập cùng tài khoản."
        : "Dữ liệu sẽ bị xóa khỏi trình duyệt này và không thể khôi phục nếu chưa sao lưu.",
      confirmLabel: "Xác nhận xóa",
      onConfirm: () => performDeleteSession(id),
    });
  };

  const handleChangePuzzle = (puzzle: PuzzleType) => {
    const nextSessions = sessions.map((s) =>
      s.id === activeSession.id ? { ...s, puzzle } : s
    );
    setSessions(nextSessions);
    setIsNewPb(false);
    setScramble(generateNextScrambleForState(puzzle, trainingSubset));
    setScramblePuzzle(puzzle);
    const updated = nextSessions.find((s) => s.id === activeSession.id);

    if (userId && updated) {
      runCloudMutation(() => cloudUpdateSession(userId, updated));
    } else {
      saveGuestSessions(nextSessions);
    }
  };

  const handleUpdatePracticeSetIds = useCallback(
    (ids: string[]) => {
      const unique = Array.from(new Set(ids));
      setPracticeSetIds(unique);
      saveLocalPracticeSet(unique);
      if (userId) {
        runCloudMutation(() => cloudSavePracticeSet(userId, unique));
      }
    },
    [runCloudMutation, userId]
  );

  const handleStartGuidedWorkout = useCallback(() => {
    const workout = createF2lWorkout(solves);
    setGuidedWorkout(workout);
    saveGuidedWorkoutRaw(JSON.stringify(workout));
    setTrainingSubset("f2l_only");
    setMainView("timer");
    setMobileTab("timer");
    void requestScramble("3x3", "f2l_only", false);
    showToast(
      "Đã bắt đầu Bài tập F2L: Pha 1/2 — Hoàn thành 10 lượt F2L Only!"
    );
  }, [requestScramble, showToast, solves]);

  const handleResumeGuidedWorkout = useCallback(() => {
    if (!guidedWorkout) return;
    if (guidedWorkout.phase === "drill_f2l") {
      setTrainingSubset("f2l_only");
      void requestScramble("3x3", "f2l_only", false);
    } else if (guidedWorkout.phase === "remeasure_splits") {
      setTrainingSubset("wca");
      setSettings((prev) => {
        const next = { ...prev, splitMode: "cfop4" as const };
        saveLocalSettings(next);
        return next;
      });
      void requestScramble("3x3", "wca", false);
    }
    setMainView("timer");
    setMobileTab("timer");
  }, [guidedWorkout, requestScramble]);

  const handleResetGuidedWorkout = useCallback(() => {
    setGuidedWorkout(null);
    saveGuidedWorkoutRaw(null);
    showToast("Đã đặt lại bài tập F2L");
  }, [showToast]);

  // ==========================================================================
  // Dedicated CFOP Algorithm Session, SRS Progress & Solve Handlers
  // ==========================================================================
  const handleUpdateCfopProgress = useCallback(
    (item: CfopProgressItem) => {
      setCfopProgress((prev) => {
        const next = { ...prev, [item.alg_id]: item };
        saveLocalCfopProgress(next);
        return next;
      });
      if (userId) {
        runCloudMutation(() => cloudUpsertCfopProgress(userId, item));
      }
    },
    [runCloudMutation, userId]
  );

  const handleEnsureAlgSession = useCallback(
    (alg: CfopAlgorithm): CubeSession => {
      const targetName = getCfopSessionName(alg);
      const existing = sessions.find((s) => s.name === targetName);
      if (existing) return existing;

      const created: CubeSession = {
        id: generateUuid(),
        user_id: userId ?? undefined,
        name: targetName,
        puzzle: "3x3",
        created_at: new Date().toISOString(),
      };

      setSessions((prev) => {
        if (prev.some((s) => s.name === targetName)) return prev;
        const next = [...prev, created];
        if (!userId) saveGuestSessions(next);
        return next;
      });

      if (userId) {
        runCloudMutation(() => cloudInsertSession(userId, created));
      }
      showToast(`Đã tạo Session riêng: "${targetName}"`);
      return created;
    },
    [runCloudMutation, sessions, showToast, userId]
  );

  const handleRecordAlgSolve = useCallback(
    (
      sessionId: string,
      timeMs: number,
      scrambleSetup: string,
      penalty: PenaltyType
    ) => {
      const newSolve: Solve = {
        id: generateUuid(),
        user_id: userId ?? undefined,
        session_id: sessionId,
        puzzle: "3x3",
        time_ms: timeMs,
        penalty,
        scramble: scrambleSetup,
        comment: "",
        solved_at: new Date().toISOString(),
      };

      setSolves((prev) => {
        const next = [...prev, newSolve];
        if (!userId) saveGuestSolves(next);
        return next;
      });

      if (userId) {
        runCloudMutation(() => cloudInsertSolve(userId, newSolve));
      }
    },
    [runCloudMutation, userId]
  );

  const handleOpenInMainTimer = useCallback(
    (alg: CfopAlgorithm) => {
      const sess = handleEnsureAlgSession(alg);
      setActiveSessionId(sess.id);
      saveActiveSessionId(sess.id);
      setIsNewPb(false);
      const activeFormula =
        cfopProgress[alg.id]?.preferred_formula || alg.formula;
      setScramble(`z2 ${invertAlgorithm(activeFormula)}`);
      setMainView("timer");
      setMobileTab("timer");
      showToast(`Đang luyện "${alg.name}" trên Bàn Timer chính`);
    },
    [cfopProgress, handleEnsureAlgSession, showToast]
  );

  // ==========================================================================
  // Solve CRUD Handlers
  // ==========================================================================
  const handleSolveComplete = useCallback(
    (timeMs: number, initialPenalty: PenaltyType, splitsMs?: number[]) => {
      const prevBest = summary.bestSingle;

      const newSolve: Solve = {
        id: generateUuid(),
        user_id: userId ?? undefined,
        session_id: activeSession.id,
        puzzle: activeSession.puzzle,
        time_ms: timeMs,
        penalty: initialPenalty,
        scramble,
        comment: "",
        splits_ms: splitsMs,
        solved_at: new Date().toISOString(),
      };

      const eff = getEffectiveMs(newSolve);
      const brokeSinglePb =
        typeof eff === "number" &&
        sessionSolves.length >= 1 &&
        (prevBest === null || eff < prevBest);

      setIsNewPb(brokeSinglePb);
      if (brokeSinglePb && settings.soundEnabled) {
        playPbCelebration();
      }

      setSolves((prev) => {
        const next = [...prev, newSolve];
        if (!userId) saveGuestSolves(next);
        return next;
      });

      if (userId) {
        runCloudMutation(() => cloudInsertSolve(userId, newSolve));
      }

      // Advance Guided F2L Workout if active
      if (guidedWorkout && guidedWorkout.phase !== "done") {
        const shouldCount =
          (guidedWorkout.phase === "drill_f2l" &&
            trainingSubset === "f2l_only") ||
          guidedWorkout.phase === "remeasure_splits";
        const updatedWorkout = shouldCount
          ? recordWorkoutSolve(guidedWorkout, newSolve)
          : guidedWorkout;
        if (updatedWorkout !== guidedWorkout) {
          setGuidedWorkout(updatedWorkout);
          saveGuidedWorkoutRaw(JSON.stringify(updatedWorkout));
          if (
            guidedWorkout.phase === "drill_f2l" &&
            updatedWorkout.phase === "remeasure_splits"
          ) {
            setTrainingSubset("wca");
            setSettings((prev) => {
              const next = { ...prev, splitMode: "cfop4" as const };
              saveLocalSettings(next);
              return next;
            });
            showToast(
              "Hoàn thành 10 lượt F2L! Chuyển sang Pha 2/2: giải 5 lượt Split Timer để đo lại."
            );
            setPreviousScramble(scramble);
            void requestScramble(activeSession.puzzle, "wca", compModeActive);
            return;
          }
          if (updatedWorkout.phase === "done") {
            const outcome = evaluateWorkoutOutcome(updatedWorkout);
            showToast(`Hoàn thành bài tập F2L! ${outcome.message}`);
          }
        }
      }

      setPreviousScramble(scramble);
      void requestScramble(activeSession.puzzle, trainingSubset, compModeActive);
    },
    [
      activeSession.id,
      activeSession.puzzle,
      compModeActive,
      guidedWorkout,
      requestScramble,
      runCloudMutation,
      scramble,
      sessionSolves.length,
      settings.soundEnabled,
      showToast,
      summary.bestSingle,
      trainingSubset,
      userId,
    ]
  );

  const handleUpdateSolvePenalty = useCallback(
    (solveId: string, penalty: PenaltyType) => {
      setSolves((prev) => {
        const next = prev.map((s) =>
          s.id === solveId ? { ...s, penalty } : s
        );
        if (!userId) saveGuestSolves(next);
        return next;
      });

      if (userId) {
        runCloudMutation(() => cloudUpdateSolve(userId, solveId, { penalty }));
      }
    },
    [runCloudMutation, userId]
  );

  const handleUpdateSolveComment = useCallback(
    (solveId: string, comment: string, reconstruction?: string) => {
      setSolves((prev) => {
        const next = prev.map((s) =>
          s.id === solveId
            ? {
                ...s,
                comment,
                reconstruction:
                  reconstruction !== undefined
                    ? reconstruction
                    : s.reconstruction,
              }
            : s
        );
        if (!userId) saveGuestSolves(next);
        return next;
      });

      if (userId) {
        runCloudMutation(() =>
          cloudUpdateSolve(userId, solveId, {
            comment,
            ...(reconstruction !== undefined ? { reconstruction } : {}),
          })
        );
      }
      showToast("Đã lưu chi tiết lượt giải");
    },
    [runCloudMutation, showToast, userId]
  );

  const performDeleteSolve = useCallback(
    (solveId: string) => {
      setIsNewPb(false);
      setSolves((prev) => {
        const next = prev.filter((s) => s.id !== solveId);
        if (!userId) saveGuestSolves(next);
        return next;
      });
      if (detailTarget?.type === "solve" && detailTarget.solve.id === solveId) {
        setDetailTarget(null);
      }

      if (userId) {
        runCloudMutation(() => cloudDeleteSolve(userId, solveId));
      }
      showToast("Đã xóa lượt giải");
    },
    [detailTarget, runCloudMutation, showToast, userId]
  );

  const handleDeleteSolve = useCallback(
    (solveId: string) => {
      const target = solves.find((s) => s.id === solveId);
      const disp = target ? formatSolveDisplay(target, settings.decimals) : "";
      requestConfirm({
        title: "Xóa lượt giải này?",
        description: target
          ? `Bạn sắp xóa lượt giải ${disp} (${target.puzzle.toUpperCase()}).`
          : "Bạn sắp xóa 1 lượt giải khỏi lịch sử.",
        scopeNote: userId
          ? "Dữ liệu đang đồng bộ Cloud — lượt giải này sẽ bị xóa trên tất cả thiết bị."
          : undefined,
        confirmLabel: "Xác nhận xóa",
        onConfirm: () => performDeleteSolve(solveId),
      });
    },
    [performDeleteSolve, requestConfirm, settings.decimals, solves, userId]
  );

  const performClearSession = useCallback(() => {
    setIsNewPb(false);
    setSolves((prev) => {
      const next = prev.filter((s) => s.session_id !== activeSession.id);
      if (!userId) saveGuestSolves(next);
      return next;
    });

    if (userId) {
      runCloudMutation(() => cloudClearSessionSolves(userId, activeSession.id));
    }
    showToast("Đã xóa toàn bộ lượt giải trong phiên");
  }, [activeSession.id, runCloudMutation, showToast, userId]);

  const handleClearSession = useCallback(() => {
    const count = sessionSolves.length;
    if (count === 0) return;
    requestConfirm({
      title: `Xóa toàn bộ ${count} lượt trong "${activeSession.name}"?`,
      description: `Toàn bộ ${count} lượt giải của phiên "${activeSession.name}" sẽ bị xóa sạch. Tên phiên vẫn được giữ lại.`,
      scopeNote: userId
        ? "Dữ liệu đang đồng bộ Cloud — thao tác này sẽ xóa trên mọi thiết bị của tài khoản."
        : "Thao tác này không thể hoàn tác nếu bạn chưa xuất file sao lưu.",
      confirmLabel: "Xác nhận xóa",
      onConfirm: performClearSession,
    });
  }, [
    activeSession.name,
    performClearSession,
    requestConfirm,
    sessionSolves.length,
    userId,
  ]);

  // Global Alt+ Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || timerPhase !== "idle" || confirmState !== null) return;

      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNextScramble();
      } else if (e.key === "2" && lastSolve) {
        e.preventDefault();
        handleUpdateSolvePenalty(
          lastSolve.id,
          lastSolve.penalty === "+2" ? "OK" : "+2"
        );
      } else if (e.key.toLowerCase() === "d" && lastSolve) {
        e.preventDefault();
        handleUpdateSolvePenalty(
          lastSolve.id,
          lastSolve.penalty === "DNF" ? "OK" : "DNF"
        );
      } else if (e.key.toLowerCase() === "z" && lastSolve) {
        e.preventDefault();
        handleDeleteSolve(lastSolve.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    confirmState,
    handleDeleteSolve,
    handleNextScramble,
    handleUpdateSolvePenalty,
    lastSolve,
    timerPhase,
  ]);

  // ==========================================================================
  // Guest Sync, Auth, Settings & Universal Backup Handlers
  // ==========================================================================
  const handleSyncGuestData = async () => {
    if (!userId) return;
    setSyncStatus("syncing");
    const res = await syncGuestToCloud(userId);
    if (res.error) {
      setSyncStatus("error");
      showToast(`Đồng bộ thất bại: ${res.error}`);
      return;
    }
    const refreshed = await fetchCloudData(userId);
    if (!refreshed.error) {
      setSessions(refreshed.sessions);
      setSolves(refreshed.solves);
    }
    setGuestPendingCount(0);
    setSyncStatus("synced");
    showToast(`Đã đồng bộ ${res.syncedSolves} lượt giải Guest lên Cloud!`);
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
      showToast("Đã đăng xuất (chuyển về chế độ Guest)");
    }
  };

  const handleUpdateSettings = (patch: Partial<TimerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveLocalSettings(next);
      if (userId) {
        cloudSaveUserSettings(userId, next);
      }
      return next;
    });
  };

  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const json = exportDataAsJson(
      sessions,
      solves,
      cfopProgress,
      practiceSetIds
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(json, `ruktimer-backup-${stamp}.json`, "application/json");
    showToast("Đã xuất file sao lưu JSON v3 (gồm Split, Reconstruction & CFOP)");
  };

  const handleExportCsv = () => {
    const map = new Map(sessions.map((s) => [s.id, s.name]));
    const csv = exportSolvesAsCsv(solves, map);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      csv,
      `ruktimer-solves-${stamp}.csv`,
      "text/csv;charset=utf-8"
    );
    showToast("Đã xuất file CSV");
  };

  const handleImportJsonFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed) {
      showToast(
        "File không hợp lệ! Hỗ trợ định dạng RukTimer (.json), csTimer (.txt/.json) và CSV (.csv)"
      );
      return;
    }

    const plan = planImport(
      {
        sessions,
        solves,
        cfopProgress,
        practiceSetIds,
      },
      parsed
    );
    setPendingImportPlan(plan);
    setImportFileName(file.name);
  };

  const handleCancelImport = () => {
    setPendingImportPlan(null);
    setImportFileName(null);
  };

  const handleConfirmImport = async () => {
    if (!pendingImportPlan || isImporting) return;
    setIsImporting(true);
    const plan = pendingImportPlan;
    try {
      const mergedSessions = plan.mergedSessions as CubeSession[];
      const mergedSolves = plan.mergedSolves as Solve[];
      const mergedCfop = plan.mergedCfopProgress;
      const mergedPracticeSet = plan.mergedPracticeSetIds;

      setSessions(mergedSessions);
      setSolves(mergedSolves);
      setCfopProgress(mergedCfop);
      saveLocalCfopProgress(mergedCfop);
      setPracticeSetIds(mergedPracticeSet);
      saveLocalPracticeSet(mergedPracticeSet);

      if (plan.newSessions.length > 0) {
        setActiveSessionId(plan.newSessions[0].id);
        saveActiveSessionId(plan.newSessions[0].id);
      }

      if (userId) {
        setSyncStatus("syncing");
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          if (plan.newSessions.length > 0) {
            const sPayload = plan.newSessions.map((s) => ({
              id: s.id,
              user_id: userId,
              name: s.name,
              puzzle: s.puzzle,
              created_at: s.created_at,
            }));
            await supabase
              .from("cube_sessions")
              .upsert(sPayload, { onConflict: "id" });
          }

          const CHUNK = 500;
          for (let i = 0; i < plan.newSolves.length; i += CHUNK) {
            const svPayload = plan.newSolves.slice(i, i + CHUNK).map((sv) => {
              const row: Record<string, unknown> = {
                id: sv.id,
                user_id: userId,
                session_id: sv.session_id,
                puzzle: sv.puzzle,
                time_ms: sv.time_ms,
                penalty: sv.penalty,
                scramble: sv.scramble,
                comment: sv.comment,
                solved_at: sv.solved_at,
              };
              if (sv.splits_ms) row.splits_ms = sv.splits_ms;
              if (sv.reconstruction) row.reconstruction = sv.reconstruction;
              return row;
            });
            await supabase
              .from("solves")
              .upsert(svPayload, { onConflict: "id" });
          }

          const cfopItems = Object.values(mergedCfop);
          if (cfopItems.length > 0) {
            try {
              await supabase.from("cfop_progress").upsert(
                cfopItems.map((item) => ({
                  user_id: userId,
                  alg_id: item.alg_id,
                  status: item.status,
                  preferred_formula: item.preferred_formula ?? null,
                  ease_factor: item.ease_factor,
                  interval_days: item.interval_days,
                  repetitions: item.repetitions,
                  next_review_at: item.next_review_at,
                  last_drilled_at: item.last_drilled_at ?? null,
                  updated_at: item.updated_at,
                })),
                { onConflict: "user_id,alg_id" }
              );
            } catch {
              // non-fatal
            }
          }

          if (mergedPracticeSet.length > 0) {
            await cloudSavePracticeSet(userId, mergedPracticeSet);
          }
        }
        setSyncStatus("synced");
      } else {
        saveGuestSessions(mergedSessions);
        saveGuestSolves(mergedSolves);
      }

      setPendingImportPlan(null);
      setImportFileName(null);
      showToast(
        `Đã nhập +${plan.newSolves.length} lượt mới từ ${plan.sourceFormat} (bỏ qua ${plan.duplicateSolves} trùng, ${plan.invalidRows} lỗi).`
      );
    } finally {
      setIsImporting(false);
    }
  };

  // Handler when user clicks an Action Card inside AI Practice Coach
  const handleExecuteCoachRecommendation = (rec: PracticeRecommendation) => {
    if (rec.actionType === "DRILL_ALG" && rec.targetAlg) {
      handleOpenInMainTimer(rec.targetAlg);
      return;
    }
    if (rec.actionType === "ADAPTIVE_CFOP") {
      setMainView("cfop");
      return;
    }
    if (rec.actionType === "GUIDED_F2L_WORKOUT") {
      handleStartGuidedWorkout();
      return;
    }
    if (rec.actionType === "COMPETITION_SIM") {
      setTrainingSubset("wca");
      setCompModeTrigger((n) => n + 1);
      setMainView("timer");
      setMobileTab("timer");
      void requestScramble(activeSession.puzzle, "wca", true);
      showToast("Đã mở vòng thi đấu mô phỏng WCA Ao5 (Scramble Random-State)!");
      return;
    }
    if (rec.actionType === "CROSS_TRAINER") {
      setMainView("timer");
      setMobileTab("timer");
      handleChangeTrainingSubset("cross_easy");
      showToast("Đã bật chế độ Luyện Cross (3–5 nước) trên Bàn Timer chính!");
      return;
    }
    if (rec.actionType === "SPLIT_TIMER") {
      handleUpdateSettings({ splitMode: "cfop4" });
      setMainView("timer");
      setMobileTab("timer");
      showToast("Đã bật chế độ Split Timer (4 pha CFOP)!");
      return;
    }
    setMainView("timer");
    setMobileTab("timer");
  };

  const isAnyModalOpen =
    authModalOpen ||
    settingsModalOpen ||
    mobileCubeModalOpen ||
    detailTarget !== null ||
    confirmState !== null;

  const focusDimActive =
    settings.hideUiWhileSolving &&
    (timerPhase === "running" ||
      timerPhase === "inspecting" ||
      timerPhase === "holding" ||
      timerPhase === "ready");

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 font-mono text-sm">
        Đang khởi tạo RukTimer...
      </div>
    );
  }

  return (
    <div
      className="rk-shell flex min-h-dvh flex-col text-slate-100"
      data-theme={settings.theme}
    >
      {/* Top Navigation Header */}
      <div
        inert={focusDimActive}
        className={`transition-opacity duration-200 ${
          focusDimActive ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <PwaInstallBanner />
        <Header
          mainView={mainView}
          onChangeMainView={setMainView}
          sessions={sessions}
          activeSession={activeSession}
          onSelectSession={(id) => {
            handleSelectSession(id);
            setMainView("timer");
          }}
          onCreateSession={handleCreateSession}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
          onChangePuzzle={handleChangePuzzle}
          userEmail={userEmail}
          syncStatus={syncStatus}
          guestPendingCount={guestPendingCount}
          outboxPendingCount={outboxCount}
          currentStreakDays={streakSummary.currentStreak}
          onSyncGuestData={handleSyncGuestData}
          onOpenStreakTab={() => {
            setHubSubTab("weekly");
            setMainView("coach");
          }}
          onOpenAuth={() => setAuthModalOpen(true)}
          onSignOut={handleSignOut}
          onOpenSettings={() => setSettingsModalOpen(true)}
        />
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-16 lg:bottom-6 right-4 z-50 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-cyan-500/40 text-cyan-200 text-xs font-medium">
          {toastMsg}
        </div>
      )}

      {/* Main Content Router */}
      {mainView === "cfop" ? (
        <CfopTrainerView
          sessions={sessions}
          solves={solves}
          settings={settings}
          cfopProgress={cfopProgress}
          practiceSetIds={practiceSetIds}
          onUpdatePracticeSetIds={handleUpdatePracticeSetIds}
          onUpdateCfopProgress={handleUpdateCfopProgress}
          onRequestConfirmResetProgress={(alg, onConfirm) =>
            requestConfirm({
              title: `Đặt lại tiến độ "${alg.code}: ${alg.name}"?`,
              description:
                "Trạng thái đã thuộc và lịch ôn ngắt quãng SRS của công thức này sẽ được đặt về Chưa thuộc. Lịch sử bấm giờ vẫn được giữ nguyên.",
              scopeNote: userId
                ? "Thay đổi sẽ được đồng bộ trên các thiết bị của tài khoản."
                : undefined,
              confirmLabel: "Xác nhận đặt lại",
              onConfirm,
            })
          }
          onEnsureAlgSession={handleEnsureAlgSession}
          onRecordAlgSolve={handleRecordAlgSolve}
          onUpdateSolvePenalty={handleUpdateSolvePenalty}
          onDeleteSolve={handleDeleteSolve}
          onOpenInMainTimer={handleOpenInMainTimer}
        />
      ) : mainView === "timer" ? (
        <main className="rk-view grid flex-1 grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
          {/* Left Sidebar: Statistics & Chart */}
          <aside
            inert={focusDimActive}
            className={`lg:col-span-3 transition-opacity duration-200 ${
              focusDimActive ? "opacity-0 pointer-events-none" : "opacity-100"
            } ${mobileTab === "stats" ? "block" : "hidden lg:block"}`}
          >
            <StatsPanel
              summary={summary}
              enrichedSolves={enrichedSolves}
              decimals={settings.decimals}
              targetGoalMs={settings.targetGoalMs}
              onInspectAverage={(label, avgVal, endIdx, winSize) => {
                const slice = sessionSolves.slice(
                  Math.max(0, endIdx - winSize + 1),
                  endIdx + 1
                );
                setDetailTarget({
                  type: "average",
                  label,
                  avgValue: avgVal,
                  solves: slice,
                });
              }}
              onInspectSolveById={(id) => {
                const found = enrichedSolves.find((s) => s.id === id);
                if (found) {
                  setDetailTarget({
                    type: "solve",
                    solve: found,
                    indexNumber: found.indexNumber,
                  });
                }
              }}
              onOpenAiCoach={() => {
                setHubSubTab("coach");
                setMainView("coach");
              }}
            />
          </aside>

          {/* Center Stage: Scramble + Timer + 2D Cube Preview */}
          <section
            className={`lg:col-span-6 min-w-0 flex flex-col justify-between ${
              mobileTab === "timer" ? "flex" : "hidden lg:flex"
            }`}
          >
            <div
              inert={focusDimActive}
              className={`transition-opacity duration-200 ${
                focusDimActive ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              <ScrambleBar
                puzzle={activeSession.puzzle}
                scramble={scramble}
                previousScramble={previousScramble}
                trainingSubset={trainingSubset}
                scrambleSource={scrambleSource}
                isGeneratingScramble={isGeneratingScramble}
                onChangeTrainingSubset={handleChangeTrainingSubset}
                onNextScramble={() => handleNextScramble()}
                onRestorePreviousScramble={handleRestorePreviousScramble}
                onSetCustomScramble={(custom) => {
                  setScramble(custom);
                  setScrambleSource("random-move");
                }}
              />

              {/* Active Guided F2L Workout HUD Banner */}
              {guidedWorkout && (
                <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 pt-2">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/35 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-emerald-200">
                      <strong>Bài tập F2L:</strong>{" "}
                      {guidedWorkout.phase === "drill_f2l"
                        ? `Pha 1/2 — Luyện F2L Only (${guidedWorkout.drillSolveIds.length}/${guidedWorkout.targetDrillCount} lượt)`
                        : guidedWorkout.phase === "remeasure_splits"
                        ? `Pha 2/2 — Đo lại 4 pha Split (${guidedWorkout.remeasureSolveIds.length}/${guidedWorkout.targetRemeasureCount} lượt)`
                        : evaluateWorkoutOutcome(guidedWorkout).message}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setHubSubTab("coach");
                        setMainView("coach");
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 font-semibold"
                    >
                      Xem chi tiết
                    </button>
                  </div>
                </div>
              )}
            </div>

            <TimerDisplay
              settings={settings}
              lastSolve={lastSolve}
              currentAo5={summary.currentAo5}
              currentAo12={summary.currentAo12}
              isNewPb={isNewPb}
              isModalOpen={isAnyModalOpen || mainView !== "timer"}
              fatigueAlert={fatigueAlert}
              onPhaseChange={setTimerPhase}
              onSolveComplete={handleSolveComplete}
              onUpdateLastPenalty={(pen) => {
                if (lastSolve) handleUpdateSolvePenalty(lastSolve.id, pen);
              }}
              onDeleteLastSolve={() => {
                if (lastSolve) handleDeleteSolve(lastSolve.id);
              }}
              onCommentLastSolve={(comment) => {
                if (lastSolve) handleUpdateSolveComment(lastSolve.id, comment);
              }}
              onToggleSplitMode={(splitMode) =>
                handleUpdateSettings({ splitMode })
              }
              compModeTrigger={compModeTrigger}
              onCompetitionModeChange={(active) => {
                setCompModeActive(active);
                if (active && activeSession.puzzle === "3x3") {
                  void requestScramble("3x3", "wca", true);
                }
              }}
            />

            {settings.showCubePreview && (
              <>
                {/* Desktop & Tablet inline 2D Cube Net */}
                <div
                  className={`hidden sm:flex flex-col items-center pb-2 transition-opacity duration-200 ${
                    focusDimActive
                      ? "opacity-0 pointer-events-none"
                      : "opacity-100"
                  }`}
                >
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <CubeNetPreview
                      key={`${activeSession.puzzle}-${scramble}`}
                      puzzle={activeSession.puzzle}
                      scramble={scramble}
                    />
                  </div>
                </div>

                {/* Mobile-only Main Screen 2D Cube Button (instead of Bottom Nav Bar tab) */}
                {!focusDimActive && (
                  <div className="sm:hidden flex justify-center pb-2">
                    <button
                      type="button"
                      onClick={() => setMobileCubeModalOpen(true)}
                      className="min-h-11 px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-cyan-500/35 text-cyan-200 text-xs font-semibold inline-flex items-center gap-2 transition"
                    >
                      <Box className="w-4 h-4 text-cyan-400" />
                      <span>
                        Xem hình 2D Cube ({activeSession.puzzle.toUpperCase()})
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Right Sidebar: Solve History */}
          <aside
            inert={focusDimActive}
            className={`lg:col-span-3 transition-opacity duration-200 ${
              focusDimActive ? "opacity-0 pointer-events-none" : "opacity-100"
            } ${mobileTab === "history" ? "block" : "hidden lg:block"}`}
          >
            <HistoryPanel
              enrichedSolves={enrichedSolves}
              bestSingleSolveId={summary.bestSingleSolveId}
              decimals={settings.decimals}
              onSelectSolve={(solve) =>
                setDetailTarget({
                  type: "solve",
                  solve,
                  indexNumber: solve.indexNumber,
                })
              }
              onTogglePenalty={handleUpdateSolvePenalty}
              onDeleteSolve={handleDeleteSolve}
              onClearSession={handleClearSession}
            />
          </aside>
        </main>
      ) : null}

      {(mainView === "coach" || hasOpenedHub) && (
        <AiCoachAndCommunityView
          active={mainView === "coach"}
          initialTab={hubSubTab}
          activeSession={activeSession}
          sessions={sessions}
          solves={solves}
          settings={settings}
          cfopProgress={cfopProgress}
          userId={userId}
          userEmail={userEmail}
          guidedWorkout={guidedWorkout}
          onStartGuidedWorkout={handleStartGuidedWorkout}
          onResumeGuidedWorkout={handleResumeGuidedWorkout}
          onResetGuidedWorkout={handleResetGuidedWorkout}
          onExecuteRecommendation={handleExecuteCoachRecommendation}
          onOpenAlgDrill={(alg) => handleOpenInMainTimer(alg)}
          onSaveVideoAnalyzedSolve={(timeMs, splitsMs, comment, context) => {
            const newSolve: Solve = {
              id: generateUuid(),
              user_id: userId ?? undefined,
              session_id: context.sessionId,
              puzzle: context.puzzle,
              time_ms: timeMs,
              penalty: "OK",
              scramble: context.scramble,
              comment,
              splits_ms: splitsMs,
              solved_at: new Date().toISOString(),
            };
            setSolves((prev) => {
              const next = [...prev, newSolve];
              if (!userId) saveGuestSolves(next);
              return next;
            });
            if (userId) {
              runCloudMutation(() => cloudInsertSolve(userId, newSolve));
            }
            showToast("Đã lưu lượt giải phân tích từ Video vào Session!");
          }}
          onExportBackupBlob={() => {
            const json = exportDataAsJson(
              sessions,
              solves,
              cfopProgress,
              practiceSetIds
            );
            return new Blob([json], { type: "application/json" });
          }}
          onRequestConfirm={requestConfirm}
          onOpenAuth={() => setAuthModalOpen(true)}
        />
      )}

      {/* Keep footer utilities outside the solve controls. */}
      <footer
        inert={focusDimActive}
        className={`border-t border-white/10 bg-[var(--rk-surface)] ${focusDimActive ? "invisible" : ""}`}
      >
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-3 pb-[calc(var(--rk-bottom-nav-height)+0.75rem)] pt-3 sm:px-6 lg:pb-3">
          <span className="hidden text-sm font-semibold text-slate-200 lg:block">RukTimer</span>
          <nav aria-label="Tài nguyên RukTimer" className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto">
            <a
              href="https://github.com/Lunatik137/ruk-timer#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-slate-300 underline-offset-4 hover:text-white hover:underline"
            >
              Tài liệu
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
            </a>
            <a
              href="https://github.com/Lunatik137/ruk-timer/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-slate-300 underline-offset-4 hover:text-white hover:underline"
            >
              Báo lỗi và góp ý
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
            </a>
          </nav>
        </div>
      </footer>

      {!focusDimActive && (
        <nav
          aria-label="Điều hướng chính"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 gap-1 border-t border-white/10 bg-[var(--rk-surface)] px-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 text-xs lg:hidden"
        >
          {([
            { view: "timer", tab: "timer", label: "Timer", Icon: Clock },
            { view: "cfop", label: "CFOP", Icon: GraduationCap },
            { view: "coach", label: "AI & Video", Icon: BrainCircuit },
            { view: "timer", tab: "history", label: "Lịch sử", Icon: ListOrdered },
            { view: "timer", tab: "stats", label: "Thống kê", Icon: BarChart2 },
          ] as const).map((item) => {
            const current = mainView === item.view && (!("tab" in item) || mobileTab === item.tab);
            const { view, label, Icon } = item;
            const isHistory = "tab" in item && item.tab === "history";
            const solveCount = enrichedSolves.length;
            return (
              <button
                key={label}
                type="button"
                aria-current={current ? "page" : undefined}
                aria-label={isHistory ? `Lịch sử (${solveCount} lượt)` : undefined}
                onClick={() => {
                  setMainView(view);
                  if ("tab" in item) setMobileTab(item.tab);
                }}
                className="group flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[11px] leading-tight text-slate-300 underline-offset-2 hover:bg-white/5 focus-visible:outline-offset-[-2px] aria-[current=page]:bg-cyan-300/10 aria-[current=page]:font-semibold aria-[current=page]:text-cyan-200"
              >
                <span className="flex h-6 items-center justify-center gap-0.5">
                  <Icon aria-hidden="true" className="size-4" />
                  {isHistory && (
                    <span aria-hidden="true" className="font-mono text-[11px] tabular-nums">
                      {solveCount > 99 ? "99+" : solveCount}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap group-aria-[current=page]:underline">{label}</span>
              </button>
            );
          })}
          <Link href="/duel" prefetch={false} className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[11px] leading-tight text-slate-300 hover:bg-white/5 focus-visible:outline-offset-[-2px]">
            <span className="grid h-6 place-items-center"><Swords aria-hidden="true" className="size-4" /></span>
            <span>Đấu 1v1</span>
          </Link>
        </nav>
      )}

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={() => showToast("Đăng nhập thành công!")}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => {
          setSettingsModalOpen(false);
          handleCancelImport();
        }}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onExportJson={handleExportJson}
        onExportCsv={handleExportCsv}
        onImportJsonFile={handleImportJsonFile}
        pendingImportPlan={pendingImportPlan}
        importFileName={importFileName}
        isImporting={isImporting}
        onConfirmImport={handleConfirmImport}
        onCancelImport={handleCancelImport}
      />

      <ConfirmDialog
        open={confirmState !== null}
        options={
          confirmState
            ? {
                title: confirmState.title,
                description: confirmState.description,
                syncScopeWarning: confirmState.scopeNote,
                confirmLabel: confirmState.confirmLabel ?? "Xác nhận xóa",
              }
            : null
        }
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setConfirmState(null);
        }}
        onConfirm={async () => {
          if (!confirmState || confirmBusy) return;
          setConfirmBusy(true);
          try {
            await confirmState.onConfirm();
          } finally {
            setConfirmBusy(false);
            setConfirmState(null);
          }
        }}
      />

      <SolveDetailModal
        target={detailTarget}
        decimals={settings.decimals}
        onClose={() => setDetailTarget(null)}
        onUpdateSolvePenalty={handleUpdateSolvePenalty}
        onUpdateSolveComment={handleUpdateSolveComment}
        onDeleteSolve={handleDeleteSolve}
      />

      {/* Mobile Main-Screen 2D Cube Preview Modal */}
      {mobileCubeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setMobileCubeModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Trạng thái 2D Cube Scramble"
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 text-white p-5 space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMobileCubeModalOpen(false)}
              aria-label="Đóng"
              className="absolute right-3.5 top-3.5 p-1.5 rounded-lg bg-white/5 hover:bg-white/15"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="pr-8">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Box className="w-4 h-4 text-cyan-400" />
                <span>Hình trải 2D ({activeSession.puzzle.toUpperCase()})</span>
              </h2>
              <p className="font-mono text-xs text-slate-300 mt-1.5 leading-relaxed select-all">
                {scramble}
              </p>
            </div>

            <div className="flex justify-center py-2 rounded-xl bg-black/35 border border-white/10">
              <CubeNetPreview
                key={`mobile-${activeSession.puzzle}-${scramble}`}
                puzzle={activeSession.puzzle}
                scramble={scramble}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleNextScramble()}
                className="flex-1 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Scramble mới</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileCubeModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
