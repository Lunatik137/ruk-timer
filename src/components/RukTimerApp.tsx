"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart2,
  Box,
  Clock,
  GraduationCap,
  ListOrdered,
} from "lucide-react";
import AuthModal from "@/components/AuthModal";
import CfopTrainerView from "@/components/CfopTrainerView";
import CubeNetPreview from "@/components/CubeNetPreview";
import Header from "@/components/Header";
import HistoryPanel from "@/components/HistoryPanel";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import ScrambleBar from "@/components/ScrambleBar";
import SettingsModal from "@/components/SettingsModal";
import SolveDetailModal, {
  DetailModalTarget,
} from "@/components/SolveDetailModal";
import StatsPanel from "@/components/StatsPanel";
import TimerDisplay, { TimerPhase } from "@/components/TimerDisplay";
import { CfopAlgorithm, getCfopSessionName } from "@/lib/cfop";
import { generateScramble, invertAlgorithm } from "@/lib/scrambles";
import { playPbCelebration } from "@/lib/sound";
import { calculateSessionStats, getEffectiveMs } from "@/lib/stats";
import {
  cloudClearSessionSolves,
  cloudDeleteSession,
  cloudDeleteSolve,
  cloudInsertSession,
  cloudInsertSolve,
  cloudUpdateSession,
  cloudUpdateSolve,
  createDefaultSession,
  exportDataAsJson,
  exportSolvesAsCsv,
  fetchCloudData,
  generateUuid,
  getGuestSolveCount,
  loadActiveSessionId,
  loadGuestData,
  loadLocalSettings,
  parseImportedJson,
  saveActiveSessionId,
  saveGuestSessions,
  saveGuestSolves,
  saveLocalSettings,
  syncGuestToCloud,
} from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  CubeSession,
  DEFAULT_SETTINGS,
  PenaltyType,
  PuzzleType,
  Solve,
  ThemeId,
  TimerSettings,
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

  const [scramble, setScramble] = useState<string>("Đang tạo scramble...");
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
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modals & Mobile Tabs
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DetailModalTarget | null>(
    null
  );
  const [mainView, setMainView] = useState<"timer" | "cfop">("timer");
  const [mobileTab, setMobileTab] = useState<
    "timer" | "history" | "stats" | "cube"
  >("timer");

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Load initial local state + subscribe to Supabase Auth
  useEffect(() => {
    const loadedSettings = loadLocalSettings();
    setSettings(loadedSettings);

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

      const res = await fetchCloudData(uid);
      if (res.error) {
        setSyncStatus("error");
        showToast(`Lỗi tải Cloud DB: ${res.error}`);
        return;
      }

      setSessions(res.sessions);
      setSolves(res.solves);
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

  const activeSession: CubeSession = useMemo(() => {
    return (
      sessions.find((s) => s.id === activeSessionId) ||
      sessions[0] ||
      createDefaultSession()
    );
  }, [sessions, activeSessionId]);

  // Solves belonging to the active session sorted chronologically (oldest -> newest)
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

  const lastSolve: Solve | null =
    sessionSolves.length > 0 ? sessionSolves[sessionSolves.length - 1] : null;

  // Keep detail modal solve in sync if user edits penalty/comment inside modal
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

  // Persist helper for Guest vs Cloud
  const runCloudMutation = useCallback(
    async (task: () => Promise<string | null>) => {
      if (!userId) return;
      setSyncStatus("syncing");
      const err = await task();
      if (err) {
        setSyncStatus("error");
        showToast(`Lỗi lưu Cloud DB: ${err}`);
      } else {
        setSyncStatus("synced");
      }
    },
    [userId, showToast]
  );

  // ==========================================================================
  // Scramble Controls
  // ==========================================================================
  const handleNextScramble = useCallback(
    (forPuzzle?: PuzzleType) => {
      setPreviousScramble(scramble);
      setScramble(generateScramble(forPuzzle ?? activeSession.puzzle));
    },
    [scramble, activeSession.puzzle]
  );

  const handleRestorePreviousScramble = useCallback(() => {
    if (previousScramble) {
      setScramble(previousScramble);
      setPreviousScramble(null);
    }
  }, [previousScramble]);

  // ==========================================================================
  // Session & Puzzle Handlers
  // ==========================================================================
  const handleSelectSession = (id: string) => {
    const found = sessions.find((s) => s.id === id);
    if (!found) return;
    setActiveSessionId(id);
    saveActiveSessionId(id);
    setIsNewPb(false);
    setScramble(generateScramble(found.puzzle));
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
    setScramble(generateScramble(puzzle));

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
    setScramble(generateScramble(fallback.puzzle));

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
    setScramble(generateScramble(puzzle));

    if (userId) {
      runCloudMutation(() =>
        cloudUpdateSession(userId, activeSession.id, { puzzle })
      );
    } else {
      saveGuestSessions(nextSessions);
    }
  };

  // ==========================================================================
  // Dedicated CFOP Algorithm Session & Solve Handlers
  // ==========================================================================
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
      setScramble(`z2 ${invertAlgorithm(alg.formula)}`);
      setMainView("timer");
      setMobileTab("timer");
      showToast(`Đang luyện "${alg.name}" trên Bàn Timer chính`);
    },
    [handleEnsureAlgSession, showToast]
  );

  // ==========================================================================
  // Solve CRUD Handlers
  // ==========================================================================
  const handleSolveComplete = useCallback(
    (timeMs: number, initialPenalty: PenaltyType) => {
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

      // Generate next scramble automatically
      setPreviousScramble(scramble);
      setScramble(generateScramble(activeSession.puzzle));
    },
    [
      activeSession.id,
      activeSession.puzzle,
      runCloudMutation,
      scramble,
      sessionSolves.length,
      settings.soundEnabled,
      summary.bestSingle,
      userId,
    ]
  );

  const handleUpdateSolvePenalty = useCallback(
    (solveId: string, penalty: PenaltyType) => {
      setSolves((prev) => {
        const next = prev.map((s) => (s.id === solveId ? { ...s, penalty } : s));
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
    (solveId: string, comment: string) => {
      setSolves((prev) => {
        const next = prev.map((s) => (s.id === solveId ? { ...s, comment } : s));
        if (!userId) saveGuestSolves(next);
        return next;
      });

      if (userId) {
        runCloudMutation(() => cloudUpdateSolve(userId, solveId, { comment }));
      }
      showToast("Đã lưu ghi chú");
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
  // Guest Sync, Auth, Settings & Backup Handlers
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
    downloadBlob(csv, `ruktimer-solves-${stamp}.csv`, "text/csv;charset=utf-8");
    showToast("Đã xuất file CSV");
  };

  const handleImportJsonFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseImportedJson(text);
    if (!parsed) {
      showToast("File JSON không hợp lệ!");
      return;
    }

    if (userId) {
      setSyncStatus("syncing");
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const sPayload = parsed.sessions.map((s) => ({
          ...s,
          user_id: userId,
        }));
        const svPayload = parsed.solves.map((sv) => ({
          ...sv,
          user_id: userId,
        }));
        await supabase
          .from("cube_sessions")
          .upsert(sPayload, { onConflict: "id" });
        await supabase.from("solves").upsert(svPayload, { onConflict: "id" });
        const refreshed = await fetchCloudData(userId);
        if (!refreshed.error) {
          setSessions(refreshed.sessions);
          setSolves(refreshed.solves);
          setActiveSessionId(refreshed.sessions[0].id);
        }
      }
      setSyncStatus("synced");
    } else {
      setSessions(parsed.sessions);
      setSolves(parsed.solves);
      setActiveSessionId(parsed.sessions[0].id);
      saveGuestSessions(parsed.sessions);
      saveGuestSolves(parsed.solves);
    }

    showToast(`Đã nhập ${parsed.solves.length} lượt giải thành công!`);
  };

  const isAnyModalOpen =
    authModalOpen || settingsModalOpen || detailTarget !== null;

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
          onSyncGuestData={handleSyncGuestData}
          onOpenAuth={() => setAuthModalOpen(true)}
          onSignOut={handleSignOut}
          onOpenSettings={() => setSettingsModalOpen(true)}
        />
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-16 lg:bottom-6 right-4 z-50 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-cyan-500/40 text-cyan-200 text-xs font-medium shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* Main Content Grid (Desktop 3-column / Mobile Tabbed) */}
      {mainView === "cfop" ? (
        <CfopTrainerView
          sessions={sessions}
          solves={solves}
          settings={settings}
          onEnsureAlgSession={handleEnsureAlgSession}
          onRecordAlgSolve={handleRecordAlgSolve}
          onUpdateSolvePenalty={handleUpdateSolvePenalty}
          onDeleteSolve={handleDeleteSolve}
          onOpenInMainTimer={handleOpenInMainTimer}
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
              scramble={scramble}
              previousScramble={previousScramble}
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
          />

          {settings.showCubePreview && (
            <div
              className={`hidden sm:flex flex-col items-center pb-2 transition-opacity duration-200 ${
                focusDimActive ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <CubeNetPreview
                  puzzle={activeSession.puzzle}
                  scramble={scramble}
                />
              </div>
            </div>
          )}
        </section>

        {/* Mobile-only 2D Cube Tab */}
        {mobileTab === "cube" && (
          <section className="lg:hidden flex flex-col items-center justify-center gap-4 py-8">
            <div className="text-xs uppercase tracking-wider opacity-60 font-semibold">
              Trạng thái Scramble ({activeSession.puzzle.toUpperCase()})
            </div>
            <p className="font-mono text-sm text-center px-4 opacity-90">
              {scramble}
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <CubeNetPreview
                puzzle={activeSession.puzzle}
                scramble={scramble}
              />
            </div>
          </section>
        )}

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
            aria-current={mainView === "timer" && mobileTab === "timer" ? "page" : undefined}
            onClick={() => {
              setMainView("timer");
              setMobileTab("timer");
            }}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "timer" && mobileTab === "timer"
                ? "text-cyan-400 font-semibold"
                : "opacity-65"
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
                : "opacity-65"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Học CFOP</span>
          </button>
          <button
            type="button"
            aria-current={mainView === "timer" && mobileTab === "history" ? "page" : undefined}
            onClick={() => {
              setMainView("timer");
              setMobileTab("history");
            }}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "timer" && mobileTab === "history"
                ? "text-cyan-400 font-semibold"
                : "opacity-65"
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>Lịch sử ({enrichedSolves.length})</span>
          </button>
          <button
            type="button"
            aria-current={mainView === "timer" && mobileTab === "stats" ? "page" : undefined}
            onClick={() => {
              setMainView("timer");
              setMobileTab("stats");
            }}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "timer" && mobileTab === "stats"
                ? "text-cyan-400 font-semibold"
                : "opacity-65"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>Thống kê</span>
          </button>
          <button
            type="button"
            aria-current={mainView === "timer" && mobileTab === "cube" ? "page" : undefined}
            onClick={() => {
              setMainView("timer");
              setMobileTab("cube");
            }}
            className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
              mainView === "timer" && mobileTab === "cube"
                ? "text-cyan-400 font-semibold"
                : "opacity-65"
            }`}
          >
            <Box className="w-4 h-4" />
            <span>2D Cube</span>
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
    </div>
  );
}
