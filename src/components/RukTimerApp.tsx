"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart2,
  Box,
  BrainCircuit,
  Clock,
  GraduationCap,
  ListOrdered,
  Shuffle,
  X,
} from "lucide-react";
import AiCoachAndCommunityView, {
  HubSubTab,
} from "@/components/AiCoachAndCommunityView";
import AuthModal from "@/components/AuthModal";
import CfopTrainerView from "@/components/CfopTrainerView";
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
  generateScramble,
  generateTrainingSubsetScramble,
  invertAlgorithm,
} from "@/lib/scrambles";
import { playPbCelebration } from "@/lib/sound";
import {
  calculateSessionStats,
  computeSessionFatigueAlert,
  computeStreakAndHeatmap,
  getEffectiveMs,
} from "@/lib/stats";
import {
  cloudClearSessionSolves,
  cloudDeleteSession,
  cloudDeleteSolve,
  cloudInsertSession,
  cloudInsertSolve,
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
  loadActiveSessionId,
  loadGuestData,
  loadLocalCfopProgress,
  loadLocalSettings,
  loadSyncOutbox,
  parseUniversalImport,
  saveActiveSessionId,
  saveGuestSessions,
  saveGuestSolves,
  saveLocalCfopProgress,
  saveLocalSettings,
  syncGuestToCloud,
} from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  CfopProgressItem,
  CubeSession,
  DEFAULT_SETTINGS,
  PenaltyType,
  PuzzleType,
  Solve,
  ThemeId,
  TimerSettings,
  TrainingSubset,
} from "@/types/cubing";

const THEME_BG_CLASSES: Record<ThemeId, string> = {
  midnight:
    "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-[#050814] text-slate-100",
  cyber:
    "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-fuchsia-950/60 via-zinc-950 to-[#06040d] text-slate-100",
  emerald:
    "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/65 via-neutral-950 to-[#040a08] text-slate-100",
  light:
    "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-950/70 via-slate-900 to-slate-950 text-slate-100",
};

export default function RukTimerApp() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<CubeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [solves, setSolves] = useState<Solve[]>([]);
  const [cfopProgress, setCfopProgress] = useState<
    Record<string, CfopProgressItem>
  >({});

  const [trainingSubset, setTrainingSubset] = useState<TrainingSubset>("wca");
  const [scramble, setScramble] = useState<string>("Đang tạo scramble...");
  const [scramblePuzzle, setScramblePuzzle] = useState<PuzzleType>("3x3");
  const [previousScramble, setPreviousScramble] = useState<string | null>(null);
  const [timerPhase, setTimerPhase] = useState<TimerPhase>("idle");
  const [isNewPb, setIsNewPb] = useState<boolean>(false);

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
    setOutboxCount(loadSyncOutbox().length);

    const guest = loadGuestData();
    const savedActiveId = loadActiveSessionId();
    const validSession =
      guest.sessions.find((s) => s.id === savedActiveId) || guest.sessions[0];

    setSessions(guest.sessions);
    setActiveSessionId(validSession.id);
    setSolves(guest.solves);
    setScramble(generateScramble(validSession.puzzle));
    setMounted(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const hydrateCloudUser = async (uid: string, email: string | null) => {
      setUserId(uid);
      setUserEmail(email);
      setGuestPendingCount(getGuestSolveCount());
      setSyncStatus("syncing");

      // First flush any pending offline mutations
      await flushSyncOutbox(uid);
      setOutboxCount(loadSyncOutbox().length);

      const res = await fetchCloudData(uid);
      if (res.error) {
        setSyncStatus("error");
        showToast(`Đang chạy chế độ Offline Cache: ${res.error}`);
        return;
      }

      setSessions(res.sessions);
      setSolves(res.solves);

      if (res.cfopProgress && Object.keys(res.cfopProgress).length > 0) {
        setCfopProgress((prev) => {
          const merged = { ...prev, ...res.cfopProgress };
          saveLocalCfopProgress(merged);
          return merged;
        });
      }

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
      }
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

  // Listen to browser online recovery to automatically flush offline outbox
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const handleOnline = async () => {
      const flushed = await flushSyncOutbox(userId);
      setOutboxCount(loadSyncOutbox().length);
      if (flushed > 0) {
        setSyncStatus("synced");
        showToast(`Đã tự động đồng bộ ${flushed} thao tác Offline lên Cloud!`);
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
      setOutboxCount(loadSyncOutbox().length);
      if (err) {
        setSyncStatus("error");
        showToast("Đã lưu vào bộ nhớ đệm Offline (Sẽ tự đồng bộ khi có mạng)");
      } else {
        setSyncStatus("synced");
      }
    },
    [userId, showToast]
  );

  // ==========================================================================
  // Scramble Controls
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

  const handleNextScramble = useCallback(
    (forPuzzle?: PuzzleType, forSubset?: TrainingSubset) => {
      setPreviousScramble(scramble);
      const targetPuzzle = forPuzzle ?? activeSession.puzzle;
      const targetSubset = forSubset ?? trainingSubset;
      setScramble(generateNextScrambleForState(targetPuzzle, targetSubset));
    },
    [
      scramble,
      activeSession.puzzle,
      trainingSubset,
      generateNextScrambleForState,
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

    if (userId) {
      runCloudMutation(() => cloudUpdateSession(userId, id, { name }));
    } else {
      saveGuestSessions(nextSessions);
    }
  };

  const handleDeleteSession = (id: string) => {
    if (sessions.length <= 1) return;
    const nextSessions = sessions.filter((s) => s.id !== id);
    const nextSolves = solves.filter((sv) => sv.session_id !== id);
    setSessions(nextSessions);
    setSolves(nextSolves);

    const fallback = nextSessions[0];
    setActiveSessionId(fallback.id);
    saveActiveSessionId(fallback.id);
    setScramble(generateNextScrambleForState(fallback.puzzle, trainingSubset));

    if (userId) {
      runCloudMutation(() => cloudDeleteSession(userId, id));
    } else {
      saveGuestSessions(nextSessions);
      saveGuestSolves(nextSolves);
    }
    showToast("Đã xóa session");
  };

  const handleChangePuzzle = (puzzle: PuzzleType) => {
    const nextSessions = sessions.map((s) =>
      s.id === activeSession.id ? { ...s, puzzle } : s
    );
    setSessions(nextSessions);
    setIsNewPb(false);
    setScramble(generateNextScrambleForState(puzzle, trainingSubset));

    if (userId) {
      runCloudMutation(() =>
        cloudUpdateSession(userId, activeSession.id, { puzzle })
      );
    } else {
      saveGuestSessions(nextSessions);
    }
  };

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

      setPreviousScramble(scramble);
      setScramble(
        generateNextScrambleForState(activeSession.puzzle, trainingSubset)
      );
    },
    [
      activeSession.id,
      activeSession.puzzle,
      generateNextScrambleForState,
      runCloudMutation,
      scramble,
      sessionSolves.length,
      settings.soundEnabled,
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

  const handleDeleteSolve = useCallback(
    (solveId: string) => {
      setIsNewPb(false);
      setSolves((prev) => {
        const next = prev.filter((s) => s.id !== solveId);
        if (!userId) saveGuestSolves(next);
        return next;
      });

      if (userId) {
        runCloudMutation(() => cloudDeleteSolve(userId, solveId));
      }
    },
    [runCloudMutation, userId]
  );

  const handleClearSession = useCallback(() => {
    setIsNewPb(false);
    setSolves((prev) => {
      const next = prev.filter((s) => s.session_id !== activeSession.id);
      if (!userId) saveGuestSolves(next);
      return next;
    });

    if (userId) {
      runCloudMutation(() => cloudClearSessionSolves(userId, activeSession.id));
    }
    showToast("Đã xóa toàn bộ lượt giải trong session");
  }, [activeSession.id, runCloudMutation, showToast, userId]);

  // Global Alt+ Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || timerPhase !== "idle") return;

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
        if (window.confirm("Xóa lượt giải vừa rồi?")) {
          handleDeleteSolve(lastSolve.id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
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
    const json = exportDataAsJson(sessions, solves);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(json, `ruktimer-backup-${stamp}.json`, "application/json");
    showToast("Đã xuất file sao lưu JSON");
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
    const parsed = parseUniversalImport(text);
    if (!parsed) {
      showToast(
        "File không hợp lệ! Hỗ trợ định dạng RukTimer (.json), csTimer (.txt/.json) và CSV (.csv)"
      );
      return;
    }

    if (userId) {
      setSyncStatus("syncing");
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const sPayload = parsed.sessions.map((s) => ({
          id: s.id,
          user_id: userId,
          name: s.name,
          puzzle: s.puzzle,
          created_at: s.created_at,
        }));
        await supabase
          .from("cube_sessions")
          .upsert(sPayload, { onConflict: "id" });

        const CHUNK = 500;
        for (let i = 0; i < parsed.solves.length; i += CHUNK) {
          const svPayload = parsed.solves.slice(i, i + CHUNK).map((sv) => ({
            id: sv.id,
            user_id: userId,
            session_id: sv.session_id,
            puzzle: sv.puzzle,
            time_ms: sv.time_ms,
            penalty: sv.penalty,
            scramble: sv.scramble,
            comment: sv.comment,
            solved_at: sv.solved_at,
          }));
          await supabase
            .from("solves")
            .upsert(svPayload, { onConflict: "id" });
        }

        const refreshed = await fetchCloudData(userId);
        if (!refreshed.error) {
          setSessions(refreshed.sessions);
          setSolves(refreshed.solves);
          setActiveSessionId(refreshed.sessions[0].id);
        }
      }
      setSyncStatus("synced");
    } else {
      const mergedSessions = [...sessions];
      for (const s of parsed.sessions) {
        if (!mergedSessions.some((ex) => ex.id === s.id)) {
          mergedSessions.push(s);
        }
      }
      const existingIds = new Set(solves.map((sv) => sv.id));
      const mergedSolves = [
        ...solves,
        ...parsed.solves.filter((sv) => !existingIds.has(sv.id)),
      ];
      setSessions(mergedSessions);
      setSolves(mergedSolves);
      setActiveSessionId(parsed.sessions[0].id);
      saveGuestSessions(mergedSessions);
      saveGuestSolves(mergedSolves);
    }

    showToast(
      `Đã nhập ${parsed.solves.length} lượt giải từ ${parsed.sourceFormat} thành công!`
    );
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
    detailTarget !== null;

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
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        THEME_BG_CLASSES[settings.theme]
      }`}
    >
      {/* Top Navigation Header */}
      <div
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
          onUpdateCfopProgress={handleUpdateCfopProgress}
          onEnsureAlgSession={handleEnsureAlgSession}
          onRecordAlgSolve={handleRecordAlgSolve}
          onUpdateSolvePenalty={handleUpdateSolvePenalty}
          onDeleteSolve={handleDeleteSolve}
          onOpenInMainTimer={handleOpenInMainTimer}
        />
      ) : mainView === "coach" ? (
        <AiCoachAndCommunityView
          initialTab={hubSubTab}
          sessions={sessions}
          solves={solves}
          settings={settings}
          cfopProgress={cfopProgress}
          userId={userId}
          userEmail={userEmail}
          onExecuteRecommendation={handleExecuteCoachRecommendation}
          onOpenAlgDrill={(alg) => handleOpenInMainTimer(alg)}
          onLoadScrambleInMainTimer={(customScramble) => {
            setScramble(customScramble);
            setMainView("timer");
            setMobileTab("timer");
            showToast("Đã nạp Scramble thử thách vào Bàn Timer chính!");
          }}
          onSaveVideoAnalyzedSolve={(timeMs, splitsMs, comment) => {
            const newSolve: Solve = {
              id: generateUuid(),
              user_id: userId ?? undefined,
              session_id: activeSession.id,
              puzzle: activeSession.puzzle,
              time_ms: timeMs,
              penalty: "OK",
              scramble,
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
        />
      ) : (
        <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-6 py-3 pb-20 lg:pb-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Left Sidebar: Statistics & Chart */}
          <aside
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
            className={`lg:col-span-6 flex flex-col justify-between ${
              mobileTab === "timer" ? "flex" : "hidden lg:flex"
            }`}
          >
            <div
              className={`transition-opacity duration-200 ${
                focusDimActive ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              <ScrambleBar
                puzzle={activeSession.puzzle}
                scramble={scramble}
                previousScramble={previousScramble}
                trainingSubset={trainingSubset}
                onChangeTrainingSubset={handleChangeTrainingSubset}
                onNextScramble={() => handleNextScramble()}
                onRestorePreviousScramble={handleRestorePreviousScramble}
                onSetCustomScramble={(custom) => setScramble(custom)}
              />
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
                      className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-cyan-500/35 text-cyan-200 text-xs font-semibold inline-flex items-center gap-2 transition"
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
      )}

      {/* Mobile Bottom Tab Bar */}
      {!focusDimActive && (
        <nav
          aria-label="Điều hướng chính"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-slate-950/90 backdrop-blur-md grid grid-cols-5 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] px-1.5 text-[10px]"
        >
          <button
            type="button"
            aria-current={
              mainView === "timer" && mobileTab === "timer" ? "page" : undefined
            }
            onClick={() => {
              setMainView("timer");
              setMobileTab("timer");
            }}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "timer" && mobileTab === "timer"
                ? "text-cyan-400 font-semibold"
                : "text-slate-400"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Timer</span>
          </button>
          <button
            type="button"
            aria-current={mainView === "cfop" ? "page" : undefined}
            onClick={() => setMainView("cfop")}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "cfop"
                ? "text-cyan-400 font-semibold"
                : "text-slate-400"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Học CFOP</span>
          </button>
          <button
            type="button"
            aria-current={mainView === "coach" ? "page" : undefined}
            onClick={() => setMainView("coach")}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "coach"
                ? "text-cyan-400 font-semibold"
                : "text-slate-400"
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            <span>AI Coach</span>
          </button>
          <button
            type="button"
            aria-current={
              mainView === "timer" && mobileTab === "history"
                ? "page"
                : undefined
            }
            onClick={() => {
              setMainView("timer");
              setMobileTab("history");
            }}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "timer" && mobileTab === "history"
                ? "text-cyan-400 font-semibold"
                : "text-slate-400"
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>Lịch sử ({enrichedSolves.length})</span>
          </button>
          <button
            type="button"
            aria-current={
              mainView === "timer" && mobileTab === "stats" ? "page" : undefined
            }
            onClick={() => {
              setMainView("timer");
              setMobileTab("stats");
            }}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "timer" && mobileTab === "stats"
                ? "text-cyan-400 font-semibold"
                : "text-slate-400"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>Thống kê</span>
          </button>
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
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onExportJson={handleExportJson}
        onExportCsv={handleExportCsv}
        onImportJsonFile={handleImportJsonFile}
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
