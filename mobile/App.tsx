import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  useWindowDimensions,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { computePracticePeriod, getDeviceTimeZone } from "./src/lib/core/activity";
import ConfirmModal from "./src/components/ConfirmModal";
import CubeNetNative from "./src/components/CubeNetNative";
import {
  CFOP_ALGORITHMS,
  computeNextSm2Progress,
  getCfopSessionName,
  isCfopDueForReview,
  type CfopAlgorithm,
} from "./src/lib/core/cfop";
import {
  createPracticeQueue,
  drawNextFromPracticeQueue,
  type PracticeQueueState,
} from "./src/lib/core/practiceQueue";
import { generateScramble, invertAlgorithm } from "./src/lib/scrambles";
import {
  calculateSessionStats,
  formatSolveDisplay,
  formatTimeMs,
  getEffectiveMs,
} from "./src/lib/stats";
import {
  cloudDeleteMobileSession,
  cloudDeleteMobileSolve,
  cloudInsertMobileSession,
  cloudInsertMobileSolve,
  cloudSaveMobilePracticeSet,
  cloudUpdateMobileSolve,
  cloudUpsertMobileCfopProgress,
  createDefaultSession,
  fetchCloudMobileData,
  generateUuid,
  loadGuestMobileData,
  loadLocalMobileCfopProgress,
  loadLocalMobilePracticeSet,
  loadMobileSettings,
  loadMobileUserCache,
  saveGuestMobileSessions,
  saveGuestMobileSolves,
  saveLocalMobileCfopProgress,
  saveLocalMobilePracticeSet,
  saveMobileSettings,
  saveMobileUserCache,
  syncGuestMobileToCloud,
  type CfopProgressItem,
} from "./src/lib/storage";
import { supabase } from "./src/lib/supabase";
import {
  CubeSession,
  DEFAULT_MOBILE_SETTINGS,
  MobileSettings,
  PenaltyType,
  PUZZLES,
  PuzzleType,
  Solve,
  SolveWithRollingStats,
} from "./src/types/cubing";

const cfopSessionNames = new Set(CFOP_ALGORITHMS.map(getCfopSessionName));

type TimerPhase =
  | "idle"
  | "ready_inspect"
  | "inspecting"
  | "holding"
  | "ready"
  | "running"
  | "just_stopped";

const getNowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export default function App() {
  useKeepAwake();

  const [readyApp, setReadyApp] = useState(false);
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<"timer" | "cfop" | "cube" | "history" | "stats">("timer");

  // Data state
  const [settings, setSettings] = useState<MobileSettings>(DEFAULT_MOBILE_SETTINGS);
  const [sessions, setSessions] = useState<CubeSession[]>([createDefaultSession()]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [solves, setSolves] = useState<Solve[]>([]);
  const [scramble, setScramble] = useState<string>("");
  const [cfopProgress, setCfopProgress] = useState<
    Record<string, CfopProgressItem>
  >({});
  const [practiceSetIds, setPracticeSetIds] = useState<string[]>([]);
  const [cfopFilter, setCfopFilter] = useState<
    "DUE" | "ALL" | "F2L" | "OLL" | "PLL"
  >("DUE");
  const [practiceQueue, setPracticeQueue] = useState<PracticeQueueState | null>(
    null
  );
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    scopeNote?: string;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Auth & Cloud state
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Modals
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [cubeModalOpen, setCubeModalOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [selectedSolve, setSelectedSolve] = useState<SolveWithRollingStats | null>(
    null
  );
  const [commentDraft, setCommentDraft] = useState("");

  // Timer state
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [displayMs, setDisplayMs] = useState<number>(0);
  const [inspectLeft, setInspectLeft] = useState<number>(15);
  const [inspectPenalty, setInspectPenalty] = useState<PenaltyType>("OK");
  const [isNewPb, setIsNewPb] = useState(false);

  const phaseRef = useRef<TimerPhase>("idle");
  const startMsRef = useRef<number>(0);
  const inspectStartRef = useRef<number>(0);
  const inspectPenaltyRef = useRef<PenaltyType>("OK");
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inspectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerHaptic = useCallback(
    (kind: "light" | "medium" | "success") => {
      if (!settings.hapticsEnabled) return;
      if (kind === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {}
        );
      } else if (kind === "medium") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    },
    [settings.hapticsEnabled]
  );

  const hydrateCloud = useCallback(async (uid: string, email: string | null) => {
    setUserId(uid);
    setUserEmail(email);
    setSyncing(true);
    const cached = await loadMobileUserCache(uid);
    if (cached) {
      setSessions(cached.sessions);
      setSolves(cached.solves);
      setCfopProgress(cached.cfopProgress);
      setPracticeSetIds(cached.practiceSetIds);
    }
    const res = await fetchCloudMobileData(uid);
    setSyncing(false);
    if (res.error) {
      Alert.alert("Chế độ Offline Cache", res.error);
      return;
    }
    setSessions(res.sessions);
    setSolves(res.solves);
    const localCfop = await loadLocalMobileCfopProgress();
    const mergedCfop = { ...localCfop, ...(res.cfopProgress ?? {}) };
    setCfopProgress(mergedCfop);
    await saveLocalMobileCfopProgress(mergedCfop);
    const nextPracticeSet = Array.isArray(res.practiceSetIds)
      ? res.practiceSetIds
      : await loadLocalMobilePracticeSet();
    setPracticeSetIds(nextPracticeSet);
    await saveLocalMobilePracticeSet(nextPracticeSet);
    await saveMobileUserCache(uid, {
      sessions: res.sessions,
      solves: res.solves,
      cfopProgress: mergedCfop,
      practiceSetIds: nextPracticeSet,
    });
    const target = res.sessions[0];
    if (target) {
      setActiveSessionId(target.id);
      setScramble(generateScramble(target.puzzle));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [loadedSettings, guest, localCfop, localSet] = await Promise.all([
        loadMobileSettings(),
        loadGuestMobileData(),
        loadLocalMobileCfopProgress(),
        loadLocalMobilePracticeSet(),
      ]);
      setSettings(loadedSettings);
      setSessions(guest.sessions);
      setSolves(guest.solves);
      setCfopProgress(localCfop);
      setPracticeSetIds(localSet);
      setActiveSessionId(guest.sessions[0].id);
      setScramble(generateScramble(guest.sessions[0].puzzle));
      setReadyApp(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        hydrateCloud(session.user.id, session.user.email ?? null);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && event === "SIGNED_IN") {
        hydrateCloud(session.user.id, session.user.email ?? null);
      } else if (event === "SIGNED_OUT") {
        setUserId(null);
        setUserEmail(null);
        loadGuestMobileData().then((g) => {
          setSessions(g.sessions);
          setSolves(g.solves);
          setActiveSessionId(g.sessions[0].id);
          setScramble(generateScramble(g.sessions[0].puzzle));
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [hydrateCloud]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  // Keep scramble and 2D cube net in sync whenever the active puzzle changes
  // (session switch, cloud hydration, sign-out, import...).
  const scramblePuzzleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!readyApp || !activeSession) return;
    if (scramblePuzzleRef.current === null) {
      scramblePuzzleRef.current = activeSession.puzzle;
      return;
    }
    if (scramblePuzzleRef.current !== activeSession.puzzle) {
      scramblePuzzleRef.current = activeSession.puzzle;
      setScramble(generateScramble(activeSession.puzzle));
    }
  }, [readyApp, activeSession]);

  const sessionSolves = useMemo(
    () =>
      solves
        .filter((s) => s.session_id === activeSession.id)
        .sort(
          (a, b) =>
            new Date(a.solved_at).getTime() - new Date(b.solved_at).getTime()
        ),
    [solves, activeSession.id]
  );

  const practice = useMemo(() => {
    if (tab !== "stats") return null;
    const drillSessionIds = new Set(sessions.filter(({ name }) => cfopSessionNames.has(name)).map(({ id }) => id));
    const report = computePracticePeriod(solves, { now: Date.now(), tz: getDeviceTimeZone(), days: 7, drillSessionIds });
    return { ...report, max: Math.max(1, ...report.days.map(({ count }) => count)) };
  }, [tab, sessions, solves]);

  const { summary, enrichedSolves } = useMemo(
    () => calculateSessionStats(sessionSolves),
    [sessionSolves]
  );

  const lastSolve =
    sessionSolves.length > 0 ? sessionSolves[sessionSolves.length - 1] : null;

  // ==========================================================================
  // CRUD Operations (Cloud + Guest AsyncStorage)
  // ==========================================================================
  const handleRecordSolve = useCallback(
    async (timeMs: number, initialPenalty: PenaltyType) => {
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
      const brokePb =
        typeof eff === "number" &&
        sessionSolves.length >= 1 &&
        (prevBest === null || eff < prevBest);
      setIsNewPb(brokePb);
      if (brokePb) triggerHaptic("success");

      setSolves((prev) => {
        const next = [...prev, newSolve];
        if (!userId) saveGuestMobileSolves(next);
        return next;
      });

      setScramble(generateScramble(activeSession.puzzle));

      if (userId) {
        setSyncing(true);
        await cloudInsertMobileSolve(userId, newSolve);
        setSyncing(false);
      }
    },
    [
      activeSession.id,
      activeSession.puzzle,
      scramble,
      sessionSolves.length,
      summary.bestSingle,
      triggerHaptic,
      userId,
    ]
  );

  const handleUpdatePenalty = async (solveId: string, penalty: PenaltyType) => {
    setSolves((prev) => {
      const next = prev.map((s) => (s.id === solveId ? { ...s, penalty } : s));
      if (!userId) saveGuestMobileSolves(next);
      return next;
    });
    if (selectedSolve?.id === solveId) {
      setSelectedSolve((prev) => (prev ? { ...prev, penalty } : null));
    }
    if (userId) {
      await cloudUpdateMobileSolve(userId, solveId, { penalty });
    }
  };

  const handleUpdateComment = async (solveId: string, comment: string) => {
    setSolves((prev) => {
      const next = prev.map((s) => (s.id === solveId ? { ...s, comment } : s));
      if (!userId) saveGuestMobileSolves(next);
      return next;
    });
    if (userId) {
      await cloudUpdateMobileSolve(userId, solveId, { comment });
    }
  };

  const performDeleteSolve = async (solveId: string) => {
    setIsNewPb(false);
    setSolves((prev) => {
      const next = prev.filter((s) => s.id !== solveId);
      if (!userId) saveGuestMobileSolves(next);
      return next;
    });
    if (selectedSolve?.id === solveId) setSelectedSolve(null);
    if (userId) {
      await cloudDeleteMobileSolve(userId, solveId);
    }
  };

  const handleDeleteSolve = (solveId: string) => {
    const target = solves.find((s) => s.id === solveId);
    const label = target ? formatSolveDisplay(target, settings.decimals) : "1 lượt";
    setConfirmState({
      title: "Xóa lượt giải này?",
      description: `Bạn sắp xóa lượt giải ${label}${target ? ` (${target.puzzle.toUpperCase()})` : ""}.`,
      scopeNote: userId
        ? "Tài khoản đang đồng bộ Cloud — lượt giải này sẽ bị xóa trên mọi thiết bị."
        : undefined,
      confirmLabel: "Xác nhận xóa",
      onConfirm: () => performDeleteSolve(solveId),
    });
  };

  const performDeleteSession = async (sessionId: string) => {
    if (sessions.length <= 1) return;
    const nextSessions = sessions.filter((s) => s.id !== sessionId);
    const nextSolves = solves.filter((sv) => sv.session_id !== sessionId);
    setSessions(nextSessions);
    setSolves(nextSolves);
    const fallback = nextSessions[0];
    setActiveSessionId(fallback.id);
    setScramble(generateScramble(fallback.puzzle));
    if (userId) {
      await cloudDeleteMobileSession(userId, sessionId);
    } else {
      await saveGuestMobileSessions(nextSessions);
      await saveGuestMobileSolves(nextSolves);
    }
  };

  const handleDeleteSession = (sess: CubeSession) => {
    if (sessions.length <= 1) return;
    const count = solves.filter((sv) => sv.session_id === sess.id).length;
    setConfirmState({
      title: `Xóa phiên "${sess.name}"?`,
      description: `Phiên "${sess.name}" (${sess.puzzle.toUpperCase()}) và toàn bộ ${count} lượt giải bên trong sẽ bị xóa.`,
      scopeNote: userId
        ? "Tài khoản đang đồng bộ Cloud — phiên này sẽ bị xóa trên tất cả thiết bị."
        : undefined,
      confirmLabel: "Xác nhận xóa",
      onConfirm: () => performDeleteSession(sess.id),
    });
  };

  const handleUpdateCfopProgress = async (item: CfopProgressItem) => {
    const next = { ...cfopProgress, [item.alg_id]: item };
    setCfopProgress(next);
    await saveLocalMobileCfopProgress(next);
    if (userId) {
      await cloudUpsertMobileCfopProgress(userId, item);
    }
  };

  const handleTogglePracticeSet = async (algId: string) => {
    const exists = practiceSetIds.includes(algId);
    const next = exists
      ? practiceSetIds.filter((id) => id !== algId)
      : [...practiceSetIds, algId];
    setPracticeSetIds(next);
    await saveLocalMobilePracticeSet(next);
    if (userId) {
      await cloudSaveMobilePracticeSet(userId, next);
    }
  };

  const handleOpenCfopAlgOnTimer = async (alg: CfopAlgorithm) => {
    const targetName = getCfopSessionName(alg);
    let targetSess = sessions.find((s) => s.name === targetName);
    if (!targetSess) {
      targetSess = {
        id: generateUuid(),
        user_id: userId ?? undefined,
        name: targetName,
        puzzle: "3x3",
        created_at: new Date().toISOString(),
      };
      const next = [...sessions, targetSess];
      setSessions(next);
      if (userId) {
        await cloudInsertMobileSession(userId, targetSess);
      } else {
        await saveGuestMobileSessions(next);
      }
    }
    const formula = cfopProgress[alg.id]?.preferred_formula || alg.formula;
    setActiveSessionId(targetSess.id);
    setScramble(`z2 ${invertAlgorithm(formula)}`);
    setTab("timer");
  };

  const handleStartRandomPracticeSet = async () => {
    if (practiceSetIds.length === 0) return;
    const queue =
      practiceQueue &&
      practiceQueue.caseIds.length === practiceSetIds.length &&
      practiceSetIds.every((id) => practiceQueue.caseIds.includes(id))
        ? practiceQueue
        : createPracticeQueue(practiceSetIds);
    const { caseId, nextState } = drawNextFromPracticeQueue(queue);
    setPracticeQueue(nextState);
    const alg = CFOP_ALGORITHMS.find((a) => a.id === caseId);
    if (alg) {
      await handleOpenCfopAlgOnTimer(alg);
    }
  };

  useEffect(() => {
    if (!readyApp || !userId || sessions.length === 0) return;
    saveMobileUserCache(userId, {
      sessions,
      solves,
      cfopProgress,
      practiceSetIds,
    });
  }, [readyApp, userId, sessions, solves, cfopProgress, practiceSetIds]);

  const handleChangePuzzle = async (puzzle: PuzzleType) => {
    const nextSessions = sessions.map((s) =>
      s.id === activeSession.id ? { ...s, puzzle } : s
    );
    setSessions(nextSessions);
    setIsNewPb(false);
    setScramble(generateScramble(puzzle));
    if (userId) {
      await supabase
        .from("cube_sessions")
        .update({ puzzle })
        .eq("id", activeSession.id)
        .eq("user_id", userId);
    } else {
      await saveGuestMobileSessions(nextSessions);
    }
  };

  const handleCreateSession = async () => {
    const name = newSessionName.trim() || `Session ${sessions.length + 1}`;
    const created: CubeSession = {
      id: generateUuid(),
      user_id: userId ?? undefined,
      name,
      puzzle: activeSession.puzzle,
      created_at: new Date().toISOString(),
    };
    const next = [...sessions, created];
    setSessions(next);
    setActiveSessionId(created.id);
    setNewSessionName("");
    setSessionModalOpen(false);
    setScramble(generateScramble(created.puzzle));

    if (userId) {
      await cloudInsertMobileSession(userId, created);
    } else {
      await saveGuestMobileSessions(next);
    }
  };

  // ==========================================================================
  // High-Precision Touch Timer Engine
  // ==========================================================================
  const setPhaseBoth = (next: TimerPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const stopAllTimers = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (inspectIntervalRef.current) {
      clearInterval(inspectIntervalRef.current);
      inspectIntervalRef.current = null;
    }
  };

  const startInspection = () => {
    stopAllTimers();
    inspectStartRef.current = getNowMs();
    inspectPenaltyRef.current = "OK";
    setInspectPenalty("OK");
    setInspectLeft(15);
    setPhaseBoth("inspecting");
    let alert8 = false;
    let alert12 = false;

    inspectIntervalRef.current = setInterval(() => {
      const sec = (getNowMs() - inspectStartRef.current) / 1000;
      if (sec >= 8 && !alert8) {
        alert8 = true;
        triggerHaptic("medium");
      }
      if (sec >= 12 && !alert12) {
        alert12 = true;
        triggerHaptic("success");
      }
      if (sec < 15) {
        setInspectLeft(Math.ceil(15 - sec));
        inspectPenaltyRef.current = "OK";
        setInspectPenalty("OK");
      } else if (sec < 17) {
        setInspectLeft(0);
        inspectPenaltyRef.current = "+2";
        setInspectPenalty("+2");
      } else {
        setInspectLeft(-1);
        inspectPenaltyRef.current = "DNF";
        setInspectPenalty("DNF");
      }
    }, 50);
  };

  const startRunning = () => {
    stopAllTimers();
    startMsRef.current = getNowMs();
    setDisplayMs(0);
    setPhaseBoth("running");
    triggerHaptic("light");

    timerIntervalRef.current = setInterval(() => {
      setDisplayMs(getNowMs() - startMsRef.current);
    }, 16);
  };

  const onPadPressIn = () => {
    const cur = phaseRef.current;

    if (cur === "running") {
      const finalMs = Math.max(10, Math.round(getNowMs() - startMsRef.current));
      stopAllTimers();
      setDisplayMs(finalMs);
      const pen = settings.inspectionEnabled ? inspectPenaltyRef.current : "OK";
      inspectPenaltyRef.current = "OK";
      setInspectPenalty("OK");
      setPhaseBoth("just_stopped");
      triggerHaptic("medium");
      handleRecordSolve(finalMs, pen);
      return;
    }

    if (cur === "idle") {
      if (settings.inspectionEnabled) {
        setPhaseBoth("ready_inspect");
        triggerHaptic("light");
      } else if (settings.holdDelayMs <= 0) {
        setPhaseBoth("ready");
        triggerHaptic("medium");
      } else {
        setPhaseBoth("holding");
        holdTimeoutRef.current = setTimeout(() => {
          if (phaseRef.current === "holding") {
            setPhaseBoth("ready");
            triggerHaptic("medium");
          }
        }, settings.holdDelayMs);
      }
      return;
    }

    if (cur === "inspecting") {
      if (settings.holdDelayMs <= 0) {
        setPhaseBoth("ready");
        triggerHaptic("medium");
      } else {
        setPhaseBoth("holding");
        holdTimeoutRef.current = setTimeout(() => {
          if (phaseRef.current === "holding") {
            setPhaseBoth("ready");
            triggerHaptic("medium");
          }
        }, settings.holdDelayMs);
      }
    }
  };

  const onPadPressOut = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    const cur = phaseRef.current;

    if (cur === "just_stopped") {
      setPhaseBoth("idle");
      return;
    }
    if (cur === "ready_inspect") {
      startInspection();
      return;
    }
    if (cur === "holding") {
      if (settings.inspectionEnabled && inspectIntervalRef.current) {
        setPhaseBoth("inspecting");
      } else {
        setPhaseBoth("idle");
      }
      return;
    }
    if (cur === "ready") {
      startRunning();
    }
  };

  // ==========================================================================
  // Cloud Auth Handlers
  // ==========================================================================
  const handleEmailAuth = async () => {
    if (!emailInput.trim() || passwordInput.length < 6) {
      Alert.alert("Thông báo", "Vui lòng nhập email và mật khẩu từ 6 ký tự.");
      return;
    }
    setAuthLoading(true);
    try {
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailInput.trim(),
          password: passwordInput,
        });
        if (error) Alert.alert("Đăng nhập thất bại", error.message);
        else {
          setEmailInput("");
          setPasswordInput("");
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: emailInput.trim(),
          password: passwordInput,
        });
        if (error) Alert.alert("Đăng ký thất bại", error.message);
        else if (!data.session) {
          Alert.alert(
            "Kiểm tra Email",
            "Đã gửi link xác nhận tới hộp thư của bạn!"
          );
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSyncGuest = async () => {
    if (!userId) return;
    setSyncing(true);
    const res = await syncGuestMobileToCloud(userId);
    if (res.error) {
      setSyncing(false);
      Alert.alert("Lỗi đồng bộ", res.error);
      return;
    }
    await hydrateCloud(userId, userEmail);
    Alert.alert("Thành công", `Đã đồng bộ ${res.count} lượt giải lên Cloud!`);
  };

  const updateSettings = (patch: Partial<MobileSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveMobileSettings(next);
      return next;
    });
  };

  if (!readyApp) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#22d3ee" size="large" />
      </View>
    );
  }

  const isBusySolving =
    phase === "running" ||
    phase === "inspecting" ||
    phase === "holding" ||
    phase === "ready";

  const clockColor =
    phase === "holding"
      ? "#fb7185"
      : phase === "ready" || phase === "ready_inspect"
      ? "#34d399"
      : phase === "inspecting"
      ? "#fcd34d"
      : "#f8fafc";

  const renderMainDigits = () => {
    if (
      phase === "inspecting" ||
      ((phase === "holding" || phase === "ready") && inspectIntervalRef.current)
    ) {
      if (inspectPenalty === "DNF") return "DNF";
      if (inspectPenalty === "+2") return "+2";
      return String(inspectLeft);
    }
    if (phase === "running") return formatTimeMs(displayMs, settings.decimals);
    if (phase === "holding" || phase === "ready" || phase === "ready_inspect") {
      return formatTimeMs(0, settings.decimals);
    }
    if (lastSolve) return formatSolveDisplay(lastSolve, settings.decimals);
    return formatTimeMs(0, settings.decimals);
  };

  const mainDigits = renderMainDigits();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Top Header (hidden during active solve for zero distraction) */}
      {!isBusySolving && (
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.brandText}>
              Ruk<Text style={{ color: "#22d3ee" }}>Timer</Text>
            </Text>
            <View
              style={[
                styles.syncBadge,
                { backgroundColor: userId ? "#064e3b" : "#451a03" },
              ]}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: userId ? "#6ee7b7" : "#fcd34d",
                }}
              >
                {syncing ? "Syncing..." : userId ? "Cloud" : "Guest"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.sessionBtn}
            onPress={() => setSessionModalOpen(true)}
          >
            <Text style={styles.sessionBtnText} numberOfLines={1}>
              {activeSession.name} ({activeSession.puzzle.toUpperCase()})
            </Text>
            <Text style={styles.sessionChevron} accessible={false}>▾</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TAB 1: TIMER */}
      {tab === "timer" && (
        <View style={styles.flex1}>
          {!isBusySolving && (
            <>
              {/* Horizontal Puzzle Selector */}
              <View style={{ height: 42 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.puzzleChipsRow}
                >
                  {PUZZLES.map((p) => {
                    const selected = activeSession.puzzle === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => handleChangePuzzle(p.id)}
                        style={[
                          styles.puzzleChip,
                          selected && styles.puzzleChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.puzzleChipText,
                            selected && styles.puzzleChipTextActive,
                          ]}
                        >
                          {p.shortLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Scramble Box */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setScramble(generateScramble(activeSession.puzzle))}
                style={styles.scrambleCard}
              >
                <Text style={styles.scrambleText}>{scramble}</Text>
                <Text style={styles.scrambleHint}>
                  Chạm vào scramble để tạo công thức mới
                </Text>
              </TouchableOpacity>

              {/* Main-screen 2D Cube button (replaces the bottom nav tab) */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setCubeModalOpen(true)}
                style={styles.cubeOpenBtn}
                accessibilityRole="button"
                accessibilityLabel="Xem hình trải 2D Cube"
              >
                <Text style={styles.cubeOpenBtnText}>
                  Xem hình 2D Cube ({activeSession.puzzle.toUpperCase()})
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Giant Touch Pad */}
          <Pressable
            onPressIn={onPadPressIn}
            onPressOut={onPadPressOut}
            style={styles.touchPad}
          >
            {isNewPb && !isBusySolving && lastSolve && (
              <View style={styles.pbPill}>
                <Text style={styles.pbPillText}>★ Kỷ lục mới (PB)!</Text>
              </View>
            )}

            <Text style={[styles.clockDigits, { color: clockColor, fontSize: Math.min(74, (width - 32) / (mainDigits.length * 0.64)) }]} numberOfLines={1} adjustsFontSizeToFit>
              {mainDigits}
            </Text>

            <Text style={styles.padHint}>
              {phase === "running"
                ? "Chạm bất kỳ đâu để DỪNG"
                : phase === "holding"
                ? "Tiếp tục giữ..."
                : phase === "ready"
                ? "THẢ TAY ĐỂ BẮT ĐẦU!"
                : phase === "inspecting"
                ? "Chạm giữ màn hình để bắt đầu giải"
                : settings.inspectionEnabled
                ? "Chạm 1 lần để bắt đầu 15s Inspection"
                : "Chạm giữ màn hình để sẵn sàng"}
            </Text>

            {!isBusySolving && (
              <View style={styles.inlineAvgRow}>
                <Text style={styles.inlineAvgLabel}>
                  Ao5:{" "}
                  <Text style={styles.inlineAvgVal}>
                    {formatTimeMs(summary.currentAo5, settings.decimals)}
                  </Text>
                </Text>
                <Text style={styles.inlineAvgDivider}>|</Text>
                <Text style={styles.inlineAvgLabel}>
                  Ao12:{" "}
                  <Text style={[styles.inlineAvgVal, { color: "#a5b4fc" }]}>
                    {formatTimeMs(summary.currentAo12, settings.decimals)}
                  </Text>
                </Text>
              </View>
            )}
          </Pressable>

          {/* Post-Solve Quick Bar */}
          {!isBusySolving && lastSolve && (
            <View style={styles.postSolveBar}>
              <TouchableOpacity
                onPress={() =>
                  handleUpdatePenalty(
                    lastSolve.id,
                    lastSolve.penalty === "+2" ? "OK" : "+2"
                  )
                }
                style={[
                  styles.actionPill,
                  lastSolve.penalty === "+2" && { backgroundColor: "#f59e0b" },
                ]}
              >
                <Text
                  style={[
                    styles.actionPillText,
                    lastSolve.penalty === "+2" && { color: "#020617" },
                  ]}
                >
                  +2
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  handleUpdatePenalty(
                    lastSolve.id,
                    lastSolve.penalty === "DNF" ? "OK" : "DNF"
                  )
                }
                style={[
                  styles.actionPill,
                  lastSolve.penalty === "DNF" && { backgroundColor: "#ef4444" },
                ]}
              >
                <Text style={styles.actionPillText}>DNF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const enriched = enrichedSolves[enrichedSolves.length - 1];
                  if (enriched) {
                    setCommentDraft(enriched.comment || "");
                    setSelectedSolve(enriched);
                  }
                }}
                style={styles.actionPill}
              >
                <Text style={styles.actionPillText}>Chi tiết / Ghi chú</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleDeleteSolve(lastSolve.id)}
                style={styles.actionPill}
              >
                <Text style={[styles.actionPillText, { color: "#fda4af" }]}>
                  Xóa
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* TAB 2: CFOP TRAINER (Shared 79-case catalog + Due SRS + Custom Practice Set) */}
      {tab === "cfop" && (() => {
        const dueAlgs = CFOP_ALGORITHMS.filter((a) =>
          isCfopDueForReview(cfopProgress[a.id])
        );
        const visibleAlgs =
          cfopFilter === "DUE"
            ? dueAlgs
            : cfopFilter === "ALL"
            ? CFOP_ALGORITHMS
            : CFOP_ALGORITHMS.filter((a) => a.stage === cfopFilter);

        return (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text style={styles.sectionTitle}>
              Học viện CFOP & Lịch ôn SRS (Đồng bộ Web)
            </Text>

            {/* Filter Pills including Đến hạn ôn */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {(
                [
                  { id: "DUE", label: `Đến hạn ôn (${dueAlgs.length})` },
                  { id: "ALL", label: `Tất cả (${CFOP_ALGORITHMS.length})` },
                  { id: "F2L", label: "F2L" },
                  { id: "OLL", label: "OLL" },
                  { id: "PLL", label: "PLL" },
                ] as const
              ).map((f) => {
                const active = cfopFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setCfopFilter(f.id)}
                    style={[
                      styles.actionPill,
                      active && { backgroundColor: "#22d3ee" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionPillText,
                        active && { color: "#020617", fontWeight: "700" },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Custom Practice Set Launcher */}
            <View style={styles.card}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text style={{ color: "#e2e8f0", fontSize: 12, flex: 1 }}>
                  Bộ tự chọn: <Text style={{ color: "#22d3ee", fontWeight: "700" }}>{practiceSetIds.length} case</Text>
                  {practiceSetIds.length === 0
                    ? " — Bấm 'Chọn' trên thẻ để tạo bộ luyện ngẫu nhiên."
                    : ""}
                </Text>
                <TouchableOpacity
                  disabled={practiceSetIds.length === 0}
                  onPress={handleStartRandomPracticeSet}
                  style={[
                    styles.primaryBtn,
                    practiceSetIds.length === 0 && { opacity: 0.4 },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>Luyện ngẫu nhiên</Text>
                </TouchableOpacity>
              </View>
            </View>

            {visibleAlgs.length === 0 ? (
              <View style={styles.card}>
                <Text style={{ color: "#94a3b8", fontSize: 13 }}>
                  {cfopFilter === "DUE"
                    ? "Hiện chưa có công thức nào đến hạn ôn SRS. Hãy chọn tab F2L/OLL/PLL để đánh dấu công thức đã học!"
                    : "Không có công thức phù hợp."}
                </Text>
              </View>
            ) : (
              visibleAlgs.map((alg) => {
                const prog = cfopProgress[alg.id];
                const isSelected = practiceSetIds.includes(alg.id);
                const activeFormula = prog?.preferred_formula || alg.formula;
                return (
                  <View key={alg.id} style={styles.card}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: "#22d3ee",
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        {alg.code} • {alg.stage}
                        {prog?.status === "mastered"
                          ? " • Thành thạo"
                          : prog?.status === "learned"
                          ? " • Đã thuộc"
                          : ""}
                      </Text>

                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => handleTogglePracticeSet(alg.id)}
                          style={[
                            styles.actionPill,
                            isSelected && { backgroundColor: "#06b6d4" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.actionPillText,
                              isSelected && { color: "#020617", fontWeight: "700" },
                            ]}
                          >
                            {isSelected ? "✓ Đã chọn" : "+ Chọn"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.primaryBtn}
                          onPress={() => handleOpenCfopAlgOnTimer(alg)}
                        >
                          <Text style={styles.primaryBtnText}>Luyện</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text
                      style={{
                        color: "#f8fafc",
                        fontWeight: "700",
                        fontSize: 14,
                        marginTop: 6,
                      }}
                    >
                      {alg.name}
                    </Text>
                    <Text
                      style={{
                        color: "#67e8f9",
                        fontWeight: "700",
                        fontSize: 13,
                        marginTop: 6,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                    >
                      {activeFormula}
                    </Text>
                    <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                      {alg.recognition}
                    </Text>

                    {/* SM-2 SRS Quick Self-Grading Row */}
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 10,
                      }}
                    >
                      {(
                        [
                          { q: 1, label: "Quên" },
                          { q: 2, label: "Khó" },
                          { q: 4, label: "Thuộc" },
                          { q: 5, label: "Thành thạo" },
                        ] as const
                      ).map((g) => (
                        <TouchableOpacity
                          key={g.q}
                          onPress={() =>
                            handleUpdateCfopProgress(
                              computeNextSm2Progress(
                                alg.id,
                                prog,
                                g.q,
                                activeFormula
                              )
                            )
                          }
                          style={styles.actionPill}
                        >
                          <Text style={styles.actionPillText}>{g.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        );
      })()}

      {/* TAB 2B: 2D CUBE NET */}
      {tab === "cube" && (
        <ScrollView contentContainerStyle={styles.cubeTabContainer}>
          <Text style={styles.sectionTitle}>
            Hình trải 2D Scramble ({activeSession.puzzle.toUpperCase()})
          </Text>
          <Text style={styles.scrambleText}>{scramble}</Text>
          <View style={{ marginVertical: 18 }}>
            <CubeNetNative puzzle={activeSession.puzzle} scramble={scramble} />
          </View>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setScramble(generateScramble(activeSession.puzzle))}
          >
            <Text style={styles.primaryBtnText}>Đổi Scramble mới</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* TAB 3: HISTORY */}
      {tab === "history" && (
        <View style={styles.flex1}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>
              Lịch sử ({enrichedSolves.length} lượt)
            </Text>
          </View>

          <FlatList
            data={[...enrichedSolves].reverse()}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                Phiên này chưa có lượt giải.
              </Text>
            }
            renderItem={({ item }) => {
              const isPb = item.id === summary.bestSingleSolveId;
              return (
                <TouchableOpacity
                  onPress={() => {
                    setCommentDraft(item.comment || "");
                    setSelectedSolve(item);
                  }}
                  style={styles.historyRow}
                >
                  <Text style={styles.historyIndex}>#{item.indexNumber}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      <Text
                        style={[
                          styles.historyTime,
                          item.penalty === "DNF" && { color: "#fb7185" },
                          item.penalty === "+2" && { color: "#fcd34d" },
                          isPb && { color: "#34d399" },
                        ]}
                      >
                        {formatSolveDisplay(item, settings.decimals)}
                      </Text>
                      {isPb && <Text style={styles.pbMiniTag}>PB</Text>}
                    </View>
                    {item.comment ? (
                      <Text style={styles.historyComment} numberOfLines={1}>
                        “{item.comment}”
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.historyAverage}>
                    <Text style={styles.historyAverageLabel}>Ao5</Text>
                    <Text style={styles.historyAo5}>{formatTimeMs(item.rollingAo5, settings.decimals)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* TAB 4: STATS, CLOUD AUTH & SETTINGS */}
      {tab === "stats" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {practice && <View style={[styles.card, styles.activityCard]}>
            <Text style={styles.sectionTitle}>Nhịp luyện tập</Text>
            <Text style={styles.activityValue}>{practice.current.mainCount}<Text style={styles.activityLabel}> lượt giải tiêu chuẩn</Text></Text>
            <Text style={styles.activityCaption}>
              7 ngày gần nhất · Hôm nay {practice.days[6].count} lượt
            </Text>
            <View style={styles.activityChart}>
              {practice.days.map((day) => {
                const label = `${day.date.slice(8)}/${day.date.slice(5, 7)}`;
                return (
                  <View key={day.date} style={styles.activityColumn} accessible accessibilityLabel={`${label}, ${day.count} lượt giải tiêu chuẩn`}>
                    <View style={styles.activityTrack}>
                      <View style={[styles.activityBar, { height: day.count ? `${day.count / practice.max * 100}%` : 2 },
                        day.date === practice.end && styles.activityBarToday]} />
                    </View>
                    <Text style={styles.activityDay}>{day.date.slice(8)}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.activityCaption}>{practice.current.mainCount ? "Tính cả DNF. Lượt luyện CFOP được tính riêng." : "Một lượt giải là đủ để bắt đầu hôm nay."}</Text>
          </View>}
          {/* Stats Summary Cards */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Hoàn thành</Text>
              <Text style={styles.kpiValue}>
                {summary.validCount}/{summary.totalCount}
              </Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Mean</Text>
              <Text style={[styles.kpiValue, { color: "#22d3ee" }]}>
                {formatTimeMs(summary.mean, settings.decimals)}
              </Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Độ lệch σ</Text>
              <Text style={styles.kpiValue}>
                {formatTimeMs(summary.stdDev, settings.decimals)}
              </Text>
            </View>
          </View>

          {/* WCA Table */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Thống kê phiên hiện tại</Text>
            <View style={styles.statLine}>
              <Text style={styles.statLineLabel}>Chỉ số</Text>
              <Text style={styles.statColumnHeading}>Hiện tại</Text>
              <Text style={styles.statColumnHeading}>Tốt nhất</Text>
            </View>
            {[
              { l: "Single", c: summary.currentSingle, b: summary.bestSingle },
              { l: "Mo3", c: summary.currentMo3, b: summary.bestMo3 },
              { l: "Ao5", c: summary.currentAo5, b: summary.bestAo5 },
              { l: "Ao12", c: summary.currentAo12, b: summary.bestAo12 },
              { l: "Ao50", c: summary.currentAo50, b: summary.bestAo50 },
              { l: "Ao100", c: summary.currentAo100, b: summary.bestAo100 },
            ].map((r) => (
              <View key={r.l} style={styles.statLine} accessible accessibilityLabel={`${r.l}, hiện tại ${formatTimeMs(r.c, settings.decimals)}, tốt nhất ${formatTimeMs(r.b, settings.decimals)}`}>
                <Text style={styles.statLineLabel}>{r.l}</Text>
                <Text style={styles.statLineCur}>
                  {formatTimeMs(r.c, settings.decimals)}
                </Text>
                <Text style={styles.statLineBest}>
                  {formatTimeMs(r.b, settings.decimals)}
                </Text>
              </View>
            ))}
          </View>

          {/* Cloud Account Sync */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              Tài khoản Cloud (Đồng bộ với Web)
            </Text>
            {userId ? (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Text style={{ color: "#cbd5e1", fontSize: 13 }}>
                  Đang đăng nhập:{" "}
                  <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                    {userEmail}
                  </Text>
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1 }]}
                    onPress={() => hydrateCloud(userId, userEmail)}
                  >
                    <Text style={styles.primaryBtnText}>Làm mới từ Cloud</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      { flex: 1, backgroundColor: "#f59e0b" },
                    ]}
                    onPress={handleSyncGuest}
                  >
                    <Text style={styles.primaryBtnText}>Đẩy lượt Guest</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[
                    styles.actionPill,
                    { alignSelf: "flex-start", marginTop: 4 },
                  ]}
                  onPress={() => supabase.auth.signOut()}
                >
                  <Text style={{ color: "#fda4af", fontSize: 12, fontWeight: "600" }}>
                    Đăng xuất
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setAuthMode("signin")}
                    style={[
                      styles.actionPill,
                      authMode === "signin" && { backgroundColor: "#22d3ee" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionPillText,
                        authMode === "signin" && { color: "#020617" },
                      ]}
                    >
                      Đăng nhập
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setAuthMode("signup")}
                    style={[
                      styles.actionPill,
                      authMode === "signup" && { backgroundColor: "#22d3ee" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionPillText,
                        authMode === "signup" && { color: "#020617" },
                      ]}
                    >
                      Đăng ký
                    </Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  value={emailInput}
                  onChangeText={setEmailInput}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Email tài khoản..."
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <TextInput
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                  secureTextEntry
                  placeholder="Mật khẩu (tối thiểu 6 ký tự)..."
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <TouchableOpacity
                  disabled={authLoading}
                  onPress={handleEmailAuth}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>
                    {authLoading
                      ? "Đang xử lý..."
                      : authMode === "signin"
                      ? "Đăng nhập Cloud"
                      : "Tạo tài khoản"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Mobile Settings */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Cài đặt bấm giờ</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>WCA Inspection (15s)</Text>
              <Switch
                value={settings.inspectionEnabled}
                onValueChange={(v) => updateSettings({ inspectionEnabled: v })}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Rung phản hồi (Haptics)</Text>
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={(v) => updateSettings({ hapticsEnabled: v })}
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Hiển thị 3 số lẻ (0.000)</Text>
              <Switch
                value={settings.decimals === 3}
                onValueChange={(v) => updateSettings({ decimals: v ? 3 : 2 })}
              />
            </View>

            <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.settingLabel}>Độ trễ chạm giữ</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[0, 300, 550].map((ms) => (
                  <TouchableOpacity
                    key={ms}
                    onPress={() => updateSettings({ holdDelayMs: ms })}
                    style={[
                      styles.actionPill,
                      settings.holdDelayMs === ms && {
                        backgroundColor: "#22d3ee",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionPillText,
                        settings.holdDelayMs === ms && { color: "#020617" },
                      ]}
                    >
                      {ms === 0 ? "0s" : `${ms / 1000}s`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Bottom Tab Navigation */}
      {!isBusySolving && (
        <View style={styles.bottomBar}>
          {(
            [
              { id: "timer", label: "Timer" },
              { id: "cfop", label: "CFOP" },
              { id: "history", label: "Lịch sử" },
              { id: "stats", label: "Thống kê" },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => setTab(item.id)}
                accessibilityRole="tab"
                accessibilityLabel={item.id === "history" ? `Lịch sử, ${enrichedSolves.length} lượt` : item.label}
                accessibilityState={{ selected: active }}
                style={[styles.bottomTabBtn, active && styles.bottomTabBtnActive]}
              >
                <Text
                  style={[
                    styles.bottomTabText,
                    active && styles.bottomTabTextActive,
                  ]}
                >
                  {item.label}
                </Text>
                {item.id === "history" && <Text style={styles.historyTabCount}>{enrichedSolves.length > 99 ? "99+" : enrichedSolves.length}</Text>}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.bottomTabBtn} accessibilityRole="link" accessibilityLabel="Mở Đấu 1v1 trên web"
            onPress={() => void Linking.openURL("https://ruk-timer.vercel.app/duel").catch(() =>
              Alert.alert("Chưa mở được sảnh đấu", "Hãy thử lại khi có kết nối mạng."))}>
            <Text style={styles.bottomTabText}>Đấu 1v1</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Session Switcher Modal */}
      <Modal
        visible={cubeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCubeModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modalBox} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            <Text style={styles.sectionTitle}>
              Hình trải 2D ({activeSession.puzzle.toUpperCase()})
            </Text>
            <Text style={[styles.scrambleText, { fontSize: 13, marginVertical: 8 }]}>
              {scramble}
            </Text>
            <View style={{ alignItems: "center", marginVertical: 10 }}>
              <CubeNetNative
                key={`${activeSession.puzzle}-${scramble}`}
                puzzle={activeSession.puzzle}
                scramble={scramble}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }]}
                onPress={() => setScramble(generateScramble(activeSession.puzzle))}
              >
                <Text style={styles.primaryBtnText}>Scramble mới</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionPill, { justifyContent: "center" }]}
                onPress={() => setCubeModalOpen(false)}
              >
                <Text style={styles.actionPillText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Session Switcher Modal */}
      <Modal
        visible={sessionModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSessionModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modalBox} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            <Text style={styles.sectionTitle}>Chọn hoặc tạo phiên</Text>
            <ScrollView style={{ maxHeight: 220, marginVertical: 10 }}>
              {sessions.map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.sessionOption,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    },
                    s.id === activeSession.id && {
                      borderColor: "#22d3ee",
                      backgroundColor: "rgba(34,211,238,0.12)",
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => {
                      setActiveSessionId(s.id);
                      setScramble(generateScramble(s.puzzle));
                      setSessionModalOpen(false);
                    }}
                  >
                    <Text style={{ color: "#f8fafc", fontWeight: "600" }}>
                      {s.name} ({s.puzzle.toUpperCase()})
                    </Text>
                  </TouchableOpacity>
                  {sessions.length > 1 && (
                    <TouchableOpacity
                      onPress={() => {
                        setSessionModalOpen(false);
                        handleDeleteSession(s);
                      }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                    >
                      <Text style={{ color: "#fb7185", fontSize: 12, fontWeight: "700" }}>
                        Xóa
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={newSessionName}
                onChangeText={setNewSessionName}
                placeholder="Tên phiên mới"
                placeholderTextColor="#64748b"
                style={[styles.input, { flex: 1 }]}
              />
              <TouchableOpacity
                onPress={handleCreateSession}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>+ Tạo</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setSessionModalOpen(false)}
              style={{ marginTop: 14, alignSelf: "center" }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 13 }}>Đóng</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Solve Detail Modal */}
      <Modal
        visible={!!selectedSolve}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedSolve(null)}
      >
        <View style={styles.modalBackdrop}>
          {selectedSolve && (
            <ScrollView style={styles.modalBox} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              <Text style={styles.sectionTitle}>
                Lượt giải #{selectedSolve.indexNumber} (
                {selectedSolve.puzzle.toUpperCase()})
              </Text>
              <Text style={[styles.clockDigits, { fontSize: 42, marginVertical: 6 }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatSolveDisplay(selectedSolve, settings.decimals)}
              </Text>
              <Text style={[styles.scrambleText, { marginVertical: 8 }]}>
                {selectedSolve.scramble}
              </Text>
              <View style={{ alignItems: "center", marginVertical: 6 }}>
                <CubeNetNative
                  puzzle={selectedSolve.puzzle}
                  scramble={selectedSolve.scramble}
                  compact
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  marginVertical: 10,
                }}
              >
                {(["OK", "+2", "DNF"] as PenaltyType[]).map((pen) => (
                  <TouchableOpacity
                    key={pen}
                    onPress={() => handleUpdatePenalty(selectedSolve.id, pen)}
                    style={[
                      styles.actionPill,
                      selectedSolve.penalty === pen && {
                        backgroundColor: "#22d3ee",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionPillText,
                        selectedSolve.penalty === pen && { color: "#020617" },
                      ]}
                    >
                      {pen}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={commentDraft}
                  onChangeText={setCommentDraft}
                  placeholder="Ghi chú lượt giải..."
                  placeholderTextColor="#64748b"
                  style={[styles.input, { flex: 1 }]}
                />
                <TouchableOpacity
                  onPress={() => {
                    handleUpdateComment(selectedSolve.id, commentDraft.trim());
                    setSelectedSolve(null);
                  }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Lưu</Text>
                </TouchableOpacity>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 14,
                }}
              >
                <TouchableOpacity
                  onPress={() => handleDeleteSolve(selectedSolve.id)}
                >
                  <Text style={{ color: "#fb7185", fontWeight: "600" }}>
                    Xóa lượt này
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedSolve(null)}>
                  <Text style={{ color: "#94a3b8" }}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
      {/* Centralized Confirmation Modal for all destructive actions */}
      <ConfirmModal
        visible={confirmState !== null}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        scopeNote={confirmState?.scopeNote}
        confirmLabel={confirmState?.confirmLabel ?? "Xác nhận xóa"}
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
    </SafeAreaView>
  );
}

const colors = {
  canvas: "#101214",
  surface: "#181b1e",
  dialog: "#202428",
  muted: "#a5b4c4",
  accent: "#67e8f9",
  border: "rgba(255,255,255,0.12)",
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight || 0 : 0,
  },
  flex1: { flex: 1 },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  brandRow: {
    flexShrink: 1,
    flexWrap: "wrap",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandText: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  syncBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  sessionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    maxWidth: "48%",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sessionChevron: { color: colors.muted, fontSize: 12 },
  sessionBtnText: {
    flexShrink: 1,
    minWidth: 0,
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "600",
  },
  puzzleChipsRow: {
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 6,
  },
  puzzleChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  puzzleChipActive: {
    backgroundColor: "#22d3ee",
    borderColor: "#22d3ee",
  },
  puzzleChipText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  puzzleChipTextActive: {
    color: "#020617",
    fontWeight: "800",
  },
  scrambleCard: {
    marginHorizontal: 12,
    marginTop: 6,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrambleText: {
    color: "#f1f5f9",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  scrambleHint: {
    color: colors.muted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 5,
  },
  cubeOpenBtn: {
    alignSelf: "center",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
  },
  cubeOpenBtnText: {
    color: "#a5f3fc",
    fontSize: 12,
    fontWeight: "700",
  },
  touchPad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  clockDigits: {
    color: "#f8fafc",
    fontSize: 74,
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  padHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
  },
  pbPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "rgba(251,191,36,0.18)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.45)",
    marginBottom: 8,
  },
  pbPillText: {
    color: "#fde68a",
    fontSize: 12,
    fontWeight: "700",
  },
  inlineAvgRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 22,
  },
  inlineAvgLabel: {
    color: "#94a3b8",
    fontSize: 13,
  },
  inlineAvgVal: {
    color: "#67e8f9",
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  inlineAvgDivider: {
    color: "rgba(255,255,255,0.18)",
  },
  postSolveBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  actionPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionPillText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
  },
  cubeTabContainer: {
    padding: 18,
    alignItems: "center",
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  primaryBtn: {
    minHeight: 44,
    backgroundColor: "#22d3ee",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#020617",
    fontWeight: "800",
    fontSize: 13,
  },
  historyHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 48,
    fontSize: 13,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    gap: 10,
  },
  historyIndex: {
    color: colors.muted,
    flexShrink: 1,
    minWidth: 28,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  historyTime: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  pbMiniTag: {
    backgroundColor: "rgba(52,211,153,0.2)",
    color: "#6ee7b7",
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  historyComment: {
    color: "#67e8f9",
    fontSize: 11,
    marginTop: 2,
  },
  historyAverage: {
    maxWidth: "36%",
    alignItems: "flex-end",
  },
  historyAverageLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  historyAo5: {
    textAlign: "right",
    color: "#94a3b8",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  activityCard: { gap: 6, padding: 16 },
  activityValue: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  activityLabel: { color: "#e2e8f0", fontSize: 14, fontWeight: "500" },
  activityCaption: { color: colors.muted, fontSize: 12 },
  activityChart: { flexDirection: "row", gap: 6, marginVertical: 8 },
  activityColumn: { flex: 1, minWidth: 0, gap: 5 },
  activityTrack: {
    height: 66,
    justifyContent: "flex-end",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  activityBar: { borderRadius: 4, backgroundColor: "rgba(103,232,249,0.45)" },
  activityBarToday: { backgroundColor: colors.accent },
  activityDay: { color: colors.muted, fontSize: 11, textAlign: "center", fontVariant: ["tabular-nums"] },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  kpiLabel: {
    color: "#94a3b8",
    fontSize: 11,
  },
  kpiValue: {
    textAlign: "center",
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  statLineLabel: {
    color: "#cbd5e1",
    fontWeight: "600",
    flex: 1,
    minWidth: 0,
  },
  statColumnHeading: { flex: 1.25, minWidth: 0, color: colors.muted, fontSize: 12, textAlign: "right" },
  statLineCur: {
    flex: 1.25,
    minWidth: 0,
    textAlign: "right",
    color: "#f8fafc",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  statLineBest: {
    flex: 1.25,
    minWidth: 0,
    textAlign: "right",
    color: "#34d399",
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  input: {
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    color: "#f8fafc",
    fontSize: 13,
  },
  settingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  settingLabel: {
    color: "#e2e8f0",
    fontSize: 13,
  },
  bottomBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  bottomTabBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  bottomTabBtnActive: {
    backgroundColor: "rgba(103,232,249,0.12)",
  },
  historyTabCount: {
    color: colors.muted,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  bottomTabText: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  bottomTabTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 18,
  },
  modalBox: {
    flexGrow: 0,
    maxHeight: "100%",
    backgroundColor: colors.dialog,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalContent: { padding: 18 },
  sessionOption: {
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
});
