"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  BrainCircuit,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Flame,
  Layers,
  Play,
  Share2,
  Sparkles,
  Target,
  Trophy,
  Upload,
  Video,
} from "lucide-react";
import {
  buildDeterministicCoachReport,
  PracticeRecommendation,
} from "@/lib/analytics/coach";
import { CFOP_ALGORITHMS, CfopAlgorithm } from "@/lib/cfop";
import { generateDailyScrambles } from "@/lib/scrambles";
import {
  computePersonalAchievements,
  computeStreakAndHeatmap,
  computeTrimmedAverage,
  formatTimeMs,
  parseManualTimeInput,
} from "@/lib/stats";
import {
  fetchDailyLeaderboard,
  submitDailyChallengeRecord,
} from "@/lib/storage";
import {
  CfopProgressItem,
  CubeSession,
  DailySubmissionRecord,
  PenaltyType,
  PuzzleType,
  Solve,
  TimerSettings,
  TrainingSubset,
} from "@/types/cubing";

export type HubSubTab = "coach" | "weekly" | "daily" | "video";

interface AiCoachAndCommunityViewProps {
  initialTab?: HubSubTab;
  sessions: CubeSession[];
  solves: Solve[];
  settings: TimerSettings;
  cfopProgress: Record<string, CfopProgressItem>;
  userId: string | null;
  userEmail: string | null;
  onExecuteRecommendation: (rec: PracticeRecommendation) => void;
  onOpenAlgDrill: (alg: CfopAlgorithm) => void;
  onLoadScrambleInMainTimer: (
    scramble: string,
    subset?: TrainingSubset
  ) => void;
  onSaveVideoAnalyzedSolve: (
    timeMs: number,
    splitsMs: number[],
    comment: string
  ) => void;
}

export default function AiCoachAndCommunityView({
  initialTab = "coach",
  sessions,
  solves,
  settings,
  cfopProgress,
  userId,
  userEmail,
  onExecuteRecommendation,
  onOpenAlgDrill,
  onLoadScrambleInMainTimer,
  onSaveVideoAnalyzedSolve,
}: AiCoachAndCommunityViewProps) {
  const [subTab, setSubTab] = useState<HubSubTab>(initialTab);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  // 1. Deterministic AI Coach Report
  const coachReport = useMemo(
    () => buildDeterministicCoachReport(sessions, solves, cfopProgress),
    [sessions, solves, cfopProgress]
  );

  const [coachQuestion, setCoachQuestion] = useState("");
  const [aiCoachReply, setAiCoachReply] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const handleAskAiCoach = async () => {
    setCoachLoading(true);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "coach",
          deterministicReport: {
            tier: coachReport.cuberTierLabel,
            summary: coachReport.active3x3Summary,
            splits: coachReport.splitBreakdown,
            weakestAlgs: coachReport.weakestAlgorithms.map((w) => ({
              code: w.alg.code,
              tps: w.estimatedTps,
              meanMs: w.meanMs,
            })),
          },
          userQuestion: coachQuestion,
        }),
      });
      const data = await res.json();
      if (data?.aiEnhancedText) {
        setAiCoachReply(data.aiEnhancedText);
      } else {
        setAiCoachReply(
          `${coachReport.headlineDiagnosis}\n\n• ${coachReport.keyFindings.join(
            "\n• "
          )}`
        );
      }
    } catch {
      setAiCoachReply(
        `${coachReport.headlineDiagnosis}\n\n• ${coachReport.keyFindings.join(
          "\n• "
        )}`
      );
    } finally {
      setCoachLoading(false);
    }
  };

  // 2. Streak Heatmap & Personal Achievements
  const streakData = useMemo(() => computeStreakAndHeatmap(solves), [solves]);

  const learnedAlgCount = useMemo(
    () =>
      Object.values(cfopProgress).filter(
        (p) => p.status === "learned" || p.status === "mastered"
      ).length,
    [cfopProgress]
  );

  const achievements = useMemo(
    () =>
      computePersonalAchievements(
        solves,
        learnedAlgCount,
        CFOP_ALGORITHMS.length
      ),
    [solves, learnedAlgCount]
  );

  // 3. Daily Global Scramble Challenge & Friend Room Seed
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [challengeSeed, setChallengeSeed] = useState<string>(todayStr);
  const [customRoomInput, setCustomRoomInput] = useState<string>("");
  const [challengePuzzle, setChallengePuzzle] = useState<PuzzleType>("3x3");
  const [dailyInputs, setDailyInputs] = useState<string[]>([
    "",
    "",
    "",
    "",
    "",
  ]);
  const [leaderboard, setLeaderboard] = useState<DailySubmissionRecord[]>([]);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);

  const dailyScrambles = useMemo(
    () => generateDailyScrambles(challengeSeed, challengePuzzle, 5),
    [challengeSeed, challengePuzzle]
  );

  useEffect(() => {
    fetchDailyLeaderboard(challengeSeed, challengePuzzle).then(setLeaderboard);
  }, [challengeSeed, challengePuzzle]);

  const parsedDailyMs = useMemo(
    () => dailyInputs.map((raw) => parseManualTimeInput(raw)),
    [dailyInputs]
  );

  const dailyComputedAo5 = useMemo(() => {
    if (parsedDailyMs.some((v) => v === null || v <= 0)) return null;
    return computeTrimmedAverage(parsedDailyMs as number[], 5);
  }, [parsedDailyMs]);

  const handleSubmitDailyAo5 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof dailyComputedAo5 !== "number") return;
    const validTimes = parsedDailyMs.filter(
      (v): v is number => typeof v === "number" && v > 0
    );
    if (validTimes.length !== 5) return;

    const bestSingle = Math.min(...validTimes);
    const division: DailySubmissionRecord["division"] =
      dailyComputedAo5 < 12000
        ? "sub12"
        : dailyComputedAo5 < 18000
        ? "sub18"
        : dailyComputedAo5 < 25000
        ? "sub25"
        : "open";

    const displayName = userEmail
      ? userEmail.split("@")[0]
      : "Guest Cuber";

    const record: DailySubmissionRecord = {
      challenge_date: challengeSeed,
      puzzle: challengePuzzle,
      display_name: displayName,
      division,
      ao5_ms: dailyComputedAo5,
      best_single_ms: bestSingle,
      times_ms: validTimes,
      penalties: ["OK", "OK", "OK", "OK", "OK"],
      created_at: new Date().toISOString(),
    };

    await submitDailyChallengeRecord(userId, record);
    const updated = await fetchDailyLeaderboard(challengeSeed, challengePuzzle);
    setLeaderboard(updated);
  };

  // 4. AI Video Solve Analyzer (Client-side CV Frame-Difference Motion & Phase Marker)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [videoMarksSec, setVideoMarksSec] = useState<{
    start: number | null;
    cross: number | null;
    f2l: number | null;
    oll: number | null;
    pll: number | null;
  }>({
    start: null,
    cross: null,
    f2l: null,
    oll: null,
    pll: null,
  });
  const [motionWaveform, setMotionWaveform] = useState<
    { timeSec: number; energy: number; isPause: boolean }[]
  >([]);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);

  const handleSelectVideoFile = (file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const nextUrl = URL.createObjectURL(file);
    setVideoUrl(nextUrl);
    setVideoName(file.name);
    setVideoMarksSec({
      start: 0,
      cross: null,
      f2l: null,
      oll: null,
      pll: null,
    });
    setMotionWaveform([]);
  };

  // On-Device Computer Vision: Samples frames from video to detect hand/cube motion & lookahead pauses
  const runClientCvMotionScan = async () => {
    const vid = videoRef.current;
    if (!vid || !vid.duration || Number.isNaN(vid.duration)) return;

    setAnalyzingVideo(true);
    const duration = Math.min(45, vid.duration);
    const sampleStep = 0.25; // 4 samples per second
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setAnalyzingVideo(false);
      return;
    }

    const origTime = vid.currentTime;
    vid.pause();

    let prevPixels: Uint8ClampedArray | null = null;
    const samples: { timeSec: number; energy: number; isPause: boolean }[] = [];

    for (let t = 0; t <= duration; t += sampleStep) {
      vid.currentTime = t;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          vid.removeEventListener("seeked", onSeeked);
          resolve();
        };
        vid.addEventListener("seeked", onSeeked);
        setTimeout(resolve, 120);
      });

      ctx.drawImage(vid, 0, 0, 64, 64);
      const imgData = ctx.getImageData(0, 0, 64, 64).data;

      let diffSum = 0;
      if (prevPixels) {
        for (let i = 0; i < imgData.length; i += 16) {
          diffSum +=
            Math.abs(imgData[i] - prevPixels[i]) +
            Math.abs(imgData[i + 1] - prevPixels[i + 1]) +
            Math.abs(imgData[i + 2] - prevPixels[i + 2]);
        }
      }
      prevPixels = new Uint8ClampedArray(imgData);
      const normEnergy = Math.min(100, Math.round(diffSum / 140));
      samples.push({
        timeSec: Number(t.toFixed(2)),
        energy: normEnergy,
        isPause: t > 0.5 && normEnergy < 12,
      });
    }

    vid.currentTime = origTime;
    setMotionWaveform(samples);

    // Auto-suggest 4 CFOP stage split timestamps if not manually marked yet
    if (videoMarksSec.pll === null && duration >= 3) {
      const s0 = videoMarksSec.start ?? 0;
      const span = Math.max(2, duration - s0);
      setVideoMarksSec({
        start: s0,
        cross: Number((s0 + span * 0.14).toFixed(2)),
        f2l: Number((s0 + span * 0.64).toFixed(2)),
        oll: Number((s0 + span * 0.8).toFixed(2)),
        pll: Number((s0 + span).toFixed(2)),
      });
    }

    setAnalyzingVideo(false);
  };

  const videoStageDurationsMs = useMemo(() => {
    const { start, cross, f2l, oll, pll } = videoMarksSec;
    if (
      start === null ||
      cross === null ||
      f2l === null ||
      oll === null ||
      pll === null
    ) {
      return null;
    }
    const dCross = Math.max(50, Math.round((cross - start) * 1000));
    const dF2l = Math.max(50, Math.round((f2l - cross) * 1000));
    const dOll = Math.max(50, Math.round((oll - f2l) * 1000));
    const dPll = Math.max(50, Math.round((pll - oll) * 1000));
    return {
      splitsMs: [dCross, dF2l, dOll, dPll],
      totalMs: dCross + dF2l + dOll + dPll,
    };
  }, [videoMarksSec]);

  return (
    <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-6 py-4 pb-24 lg:pb-8 space-y-4">
      {/* Sub-navigation Banner */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">
              Trung tâm AI Practice Coach, Thử thách Hàng ngày & Phân tích Video
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Chẩn đoán điểm yếu bằng toán học xác định, theo dõi Streak 84 ngày, thi đấu Daily Ao5 & bóc tách Video
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "coach", label: "AI Practice Coach", icon: BrainCircuit },
              { id: "weekly", label: "Báo cáo Tuần & Streak", icon: Flame },
              { id: "daily", label: "Daily Ao5 Challenge", icon: Trophy },
              { id: "video", label: "AI Video Analyzer", icon: Video },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = subTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 transition ${
                  active
                    ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold"
                    : "bg-white/[0.05] hover:bg-white/[0.1] border-white/10 text-slate-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: HYBRID AI PRACTICE COACH & WEAKNESS DETECTOR                  */}
      {/* ==================================================================== */}
      {subTab === "coach" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Diagnosis Summary & Actionable 3-Step Practice Plan */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl border border-cyan-500/30 bg-white/[0.04] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <span>Chẩn đoán Phong độ & Điểm yếu Cốt lõi</span>
                </h2>
                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono text-xs font-bold">
                  {coachReport.cuberTierLabel}
                </span>
              </div>

              <p className="text-sm text-cyan-100 font-medium leading-relaxed">
                {coachReport.headlineDiagnosis}
              </p>

              <ul className="space-y-1.5 text-xs text-slate-300">
                {coachReport.keyFindings.map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>

              {/* Interactive Ask AI Coach */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={coachQuestion}
                    onChange={(e) => setCoachQuestion(e.target.value)}
                    placeholder="Hỏi thêm AI Coach (VD: Làm sao giảm pause khi chuyển từ Cross sang F2L?)..."
                    className="flex-1 min-w-[220px] h-9 rounded-xl bg-black/40 border border-white/15 px-3 text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    disabled={coachLoading}
                    onClick={handleAskAiCoach}
                    className="h-9 px-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                  >
                    {coachLoading ? "Đang tổng hợp..." : "Nhận tư vấn AI Coach"}
                  </button>
                </div>

                {aiCoachReply && (
                  <div className="rounded-xl bg-black/50 border border-cyan-500/30 p-3.5 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {aiCoachReply}
                  </div>
                )}
              </div>
            </div>

            {/* 3-Step Personalized Practice Plan */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Target className="w-5 h-5 text-emerald-400" />
                  <span>Giáo án Luyện tập Đề xuất Hôm nay (25 Phút)</span>
                </h2>
                <span className="text-xs text-slate-400">
                  Cá nhân hóa từ dữ liệu thật
                </span>
              </div>

              <div className="space-y-2.5">
                {coachReport.practicePlan.map((rec, idx) => (
                  <div
                    key={rec.id}
                    className="rounded-xl bg-black/35 border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-[220px] space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold">
                          Bài #{idx + 1} • {rec.durationMinutes} phút
                        </span>
                        <span className="text-[11px] text-amber-300 font-medium">
                          {rec.badgeText}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-white">
                        {rec.title}
                      </h3>
                      <p className="text-xs text-slate-300">{rec.reason}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onExecuteRecommendation(rec)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition shrink-0"
                    >
                      <span>Bắt đầu bài tập</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Weakest Algorithms Table & CFOP Stage Breakdown */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-rose-400" />
                <span>Phát hiện Thuật toán CFOP Chậm / TPS Thấp</span>
              </h2>

              {coachReport.weakestAlgorithms.length === 0 ? (
                <div className="rounded-xl bg-black/30 border border-white/10 p-4 text-xs text-slate-300 space-y-2">
                  <p>
                    Bạn chưa có lịch sử bấm giờ riêng cho từng thuật toán trong{" "}
                    <strong>Học viện CFOP</strong>.
                  </p>
                  <p className="text-slate-400">
                    Khi bạn bấm giờ các bài PLL/OLL/F2L trong Drill Studio, hệ thống sẽ tự động xếp hạng các bài có tốc độ ngón tay (TPS) thấp nhất tại đây!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {coachReport.weakestAlgorithms.map((w) => (
                    <div
                      key={w.alg.id}
                      className="rounded-xl bg-black/35 border border-white/10 p-3 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-cyan-300 font-mono">
                            {w.alg.code}
                          </strong>
                          <span className="font-semibold text-white">
                            {w.alg.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Mean: {formatTimeMs(w.meanMs, settings.decimals)} •{" "}
                          <strong className="text-amber-300">
                            {w.estimatedTps} TPS
                          </strong>{" "}
                          ({w.solveCount} lượt)
                        </div>
                        <div className="text-[11px] text-rose-300 mt-0.5">
                          {w.issueSummary}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenAlgDrill(w.alg)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-cyan-500 hover:text-slate-950 font-semibold transition shrink-0"
                      >
                        Luyện ngay
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recommended Next Algorithms to Learn */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <span>Công thức Hiệu quả Cao Nên Học Tiếp Theo</span>
              </h2>
              <div className="space-y-2">
                {coachReport.recommendedNextToLearn.map((alg) => (
                  <div
                    key={alg.id}
                    className="rounded-xl bg-black/35 border border-white/10 p-3 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-indigo-300">
                        {alg.code} • {alg.name}
                      </div>
                      <code className="text-[11px] font-mono text-cyan-300 block mt-0.5">
                        {alg.formula}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenAlgDrill(alg)}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/40 text-indigo-200 font-semibold transition shrink-0"
                    >
                      Học bài này
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: WEEKLY REPORT, 84-DAY STREAK HEATMAP & ACHIEVEMENTS           */}
      {/* ==================================================================== */}
      {subTab === "weekly" && (
        <div className="space-y-4">
          {/* Top KPI Row: Weekly Comparison & Streak */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs text-slate-400">Chuỗi ngày luyện tập</div>
              <div className="font-mono text-2xl font-bold text-amber-300 mt-1 flex items-center gap-1.5">
                <Flame className="w-6 h-6 text-orange-400" />
                <span>{streakData.currentStreak} ngày</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Kỷ lục chuỗi dài nhất: {streakData.longestStreak} ngày • Hôm nay:{" "}
                {streakData.todayCount} lượt
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs text-slate-400">
                Số lượt giải 7 ngày qua
              </div>
              <div className="font-mono text-2xl font-bold text-cyan-300 mt-1 tabular-nums">
                {coachReport.weeklyComparison.thisWeekCount} lượt
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                7 ngày trước đó: {coachReport.weeklyComparison.lastWeekCount} lượt
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs text-slate-400">
                Mean Tuần Này vs Tuần Trước
              </div>
              <div className="font-mono text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
                {formatTimeMs(
                  coachReport.weeklyComparison.thisWeekMeanMs,
                  settings.decimals
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Tuần trước:{" "}
                {formatTimeMs(
                  coachReport.weeklyComparison.lastWeekMeanMs,
                  settings.decimals
                )}
                {coachReport.weeklyComparison.meanDeltaPct !== null && (
                  <span
                    className={`ml-1 font-semibold ${
                      coachReport.weeklyComparison.meanDeltaPct <= 0
                        ? "text-emerald-300"
                        : "text-amber-300"
                    }`}
                  >
                    ({coachReport.weeklyComparison.meanDeltaPct > 0 ? "+" : ""}
                    {coachReport.weeklyComparison.meanDeltaPct}%)
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs text-slate-400">
                Kỷ lục Single Tuần Này
              </div>
              <div className="font-mono text-2xl font-bold text-white mt-1 tabular-nums">
                {formatTimeMs(
                  coachReport.weeklyComparison.thisWeekBestSingleMs,
                  settings.decimals
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Độ lệch chuẩn tuần:{" "}
                {formatTimeMs(
                  coachReport.weeklyComparison.thisWeekStdDevMs,
                  settings.decimals
                )}
              </div>
            </div>
          </div>

          {/* 12-Week (84 Days) Activity Heatmap */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                <span>Biểu đồ Nhiệt Tần suất Luyện tập (84 Ngày Gần Nhất)</span>
              </h2>
              <span className="text-xs text-slate-400">
                Tổng cộng {streakData.activeDaysCount} ngày hoạt động
              </span>
            </div>

            <div className="grid grid-cols-12 sm:grid-cols-21 md:grid-cols-28 gap-1.5 pt-1">
              {streakData.heatmapDays.map((d) => {
                const bg =
                  d.level === 0
                    ? "bg-white/[0.05] border-white/5"
                    : d.level === 1
                    ? "bg-emerald-900/70 border-emerald-700/50"
                    : d.level === 2
                    ? "bg-emerald-700/80 border-emerald-500/50"
                    : d.level === 3
                    ? "bg-emerald-500 border-emerald-300/60"
                    : "bg-cyan-400 border-white";
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count} lượt giải`}
                    className={`h-5 rounded border ${bg} transition hover:scale-110`}
                  />
                );
              })}
            </div>
          </div>

          {/* Personal Achievements & Badges */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <span>Huy hiệu Cột mốc & Thành tựu Cá nhân</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {achievements.map((ach) => (
                <div
                  key={ach.id}
                  className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2 ${
                    ach.unlocked
                      ? "bg-emerald-500/10 border-emerald-400/40"
                      : "bg-black/30 border-white/10 opacity-75"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-bold ${
                          ach.unlocked ? "text-emerald-300" : "text-slate-300"
                        }`}
                      >
                        {ach.title}
                      </span>
                      {ach.unlocked && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {ach.description}
                    </p>
                  </div>
                  <div className="text-[11px] font-mono text-cyan-300">
                    {ach.progressText}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: DAILY GLOBAL SCRAMBLE Ao5 CHALLENGE & FRIEND ROOM             */}
      {/* ==================================================================== */}
      {subTab === "daily" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: 5 Official Seeded Scrambles & Result Entry */}
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>
                    Bộ 5 Scramble Cố Định ({challengeSeed} •{" "}
                    {challengePuzzle.toUpperCase()})
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Mọi người chơi nhập cùng mã ngày/phòng đều nhận đúng 5 công thức Scramble giống hệt nhau!
                </p>
              </div>

              <select
                value={challengePuzzle}
                onChange={(e) =>
                  setChallengePuzzle(e.target.value as PuzzleType)
                }
                className="h-8 rounded-lg bg-slate-900 border border-white/15 px-2.5 text-xs"
              >
                <option value="3x3">3x3x3 Cube</option>
                <option value="2x2">2x2x2 Cube</option>
                <option value="4x4">4x4x4 Cube</option>
                <option value="3x3oh">3x3x3 One-Handed</option>
                <option value="pyraminx">Pyraminx</option>
              </select>
            </div>

            {/* Friend Challenge Room Seed Bar */}
            <div className="rounded-xl bg-black/35 border border-white/10 p-3 flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                value={customRoomInput}
                onChange={(e) => setCustomRoomInput(e.target.value)}
                placeholder="Nhập mã Phòng Thách Đấu Bạn Bè (VD: solo-match-01)..."
                className="flex-1 min-w-[180px] h-8 rounded-lg bg-slate-950 border border-white/15 px-2.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (customRoomInput.trim()) {
                    setChallengeSeed(customRoomInput.trim());
                  }
                }}
                className="h-8 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-semibold"
              >
                Vào Phòng
              </button>
              <button
                type="button"
                onClick={() => {
                  setChallengeSeed(todayStr);
                  setCustomRoomInput("");
                }}
                className="h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300"
              >
                Về Hôm Nay
              </button>
              <button
                type="button"
                onClick={async () => {
                  const shareTxt = `Thách đấu RukTimer Ao5 (Mã phòng: ${challengeSeed} • ${challengePuzzle.toUpperCase()})\n${dailyScrambles
                    .map((s, i) => `${i + 1}. ${s}`)
                    .join("\n")}`;
                  try {
                    await navigator.clipboard.writeText(shareTxt);
                    setCopiedRoomLink(true);
                    setTimeout(() => setCopiedRoomLink(false), 1800);
                  } catch {
                    // ignore
                  }
                }}
                className="h-8 px-2.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 inline-flex items-center gap-1"
              >
                {copiedRoomLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Đã copy 5 Scramble</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Copy Đề Thi</span>
                  </>
                )}
              </button>
            </div>

            {/* 5 Scrambles + Time Input Form */}
            <form onSubmit={handleSubmitDailyAo5} className="space-y-2.5">
              {dailyScrambles.map((scr, idx) => (
                <div
                  key={idx}
                  className="rounded-xl bg-black/35 border border-white/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-cyan-300">
                        Lượt #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => onLoadScrambleInMainTimer(scr)}
                        className="text-[11px] text-amber-300 hover:underline inline-flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        <span>Nạp vào Bàn Timer chính</span>
                      </button>
                    </div>
                    <code className="font-mono text-slate-200 break-words">
                      {scr}
                    </code>
                  </div>

                  <input
                    type="text"
                    value={dailyInputs[idx]}
                    onChange={(e) => {
                      const next = [...dailyInputs];
                      next[idx] = e.target.value;
                      setDailyInputs(next);
                    }}
                    placeholder="VD: 12.45 / 1245"
                    className="w-28 h-9 rounded-lg bg-slate-950 border border-white/15 px-2.5 text-center font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              ))}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-mono">
                  <span className="text-slate-400">Kết quả Ao5 của bạn: </span>
                  <strong className="text-emerald-400 text-lg">
                    {formatTimeMs(dailyComputedAo5, settings.decimals)}
                  </strong>
                </div>

                <button
                  type="submit"
                  disabled={typeof dailyComputedAo5 !== "number"}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition"
                >
                  Ghi danh lên Bảng Xếp Hạng Ngày
                </button>
              </div>
            </form>
          </div>

          {/* Right: Tiered Daily Leaderboard */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Award className="w-5 h-5 text-cyan-400" />
              <span>
                Bảng Xếp Hạng ({challengeSeed} • {challengePuzzle.toUpperCase()})
              </span>
            </h2>

            {leaderboard.length === 0 ? (
              <div className="rounded-xl bg-black/30 border border-white/10 p-6 text-center text-xs text-slate-400">
                Chưa có kết quả nào cho mã thử thách này. Hãy là người đầu tiên hoàn thành 5 lượt giải và ghi danh!
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((row, idx) => (
                  <div
                    key={row.id || `${row.display_name}-${idx}`}
                    className="rounded-xl bg-black/35 border border-white/10 p-3 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold ${
                          idx === 0
                            ? "bg-amber-400 text-slate-950"
                            : idx === 1
                            ? "bg-slate-300 text-slate-950"
                            : idx === 2
                            ? "bg-amber-700 text-white"
                            : "bg-white/10 text-slate-300"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-white">
                          {row.display_name}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase">
                          Hạng: {row.division} • Best Single:{" "}
                          {formatTimeMs(row.best_single_ms, settings.decimals)}
                        </div>
                      </div>
                    </div>

                    <div className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                      Ao5: {formatTimeMs(row.ao5_ms, settings.decimals)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: AI VIDEO SOLVE ANALYZER (CLIENT CV + PHASE TIMELINE)          */}
      {/* ==================================================================== */}
      {subTab === "video" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Video className="w-5 h-5 text-cyan-400" />
                  <span>
                    AI Video Solve Analyzer (Quét Chuyển Động Tay & Tách Pha CFOP)
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Xử lý trực tiếp trên trình duyệt (On-device Computer Vision): phát hiện đoạn dừng tay (Pause) và đo thời gian 4 pha CFOP
                </p>
              </div>

              <label className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" />
                <span>Chọn Video Lượt Giải (.mp4/.mov)</span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSelectVideoFile(f);
                  }}
                />
              </label>
            </div>

            {!videoUrl ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 py-16 px-4 text-center space-y-2">
                <Video className="w-8 h-8 text-cyan-400 mx-auto opacity-75" />
                <p className="text-sm font-semibold text-slate-200">
                  Chưa có video nào được nạp
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Hãy chọn một video quay lượt giải Rubik của bạn để xem chậm 0.25x/0.5x, quét biểu đồ vận tốc tay phát hiện điểm khựng (Lookahead Pause) và bấm chốt 4 mốc Cross / F2L / OLL / PLL.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden bg-black border border-white/10">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full max-h-[340px] object-contain"
                  />
                </div>

                {/* Playback Rate & CV Scan Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Tốc độ phát:</span>
                    {[0.25, 0.5, 0.75, 1].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => {
                          setPlaybackRate(rate);
                          if (videoRef.current) {
                            videoRef.current.playbackRate = rate;
                          }
                        }}
                        className={`px-2 py-1 rounded-lg font-mono border ${
                          playbackRate === rate
                            ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold"
                            : "bg-white/5 border-white/10 text-slate-300"
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={analyzingVideo}
                    onClick={runClientCvMotionScan}
                    className="px-3 py-1.5 rounded-xl bg-indigo-500/25 hover:bg-indigo-500/35 border border-indigo-400/50 text-indigo-200 font-semibold inline-flex items-center gap-1.5 transition"
                  >
                    <BrainCircuit className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      {analyzingVideo
                        ? "Đang quét khung hình CV..."
                        : "Quét Chuyển Động & Phát Hiện Pause (CV)"}
                    </span>
                  </button>
                </div>

                {/* 5 Phase Stamp Buttons while watching video */}
                <div className="grid grid-cols-5 gap-1.5 text-xs">
                  {(
                    [
                      { key: "start", label: "0. Bắt đầu" },
                      { key: "cross", label: "1. Xong Cross" },
                      { key: "f2l", label: "2. Xong F2L" },
                      { key: "oll", label: "3. Xong OLL" },
                      { key: "pll", label: "4. Xong PLL" },
                    ] as const
                  ).map((st) => {
                    const val = videoMarksSec[st.key];
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => {
                          const cur = videoRef.current?.currentTime ?? 0;
                          setVideoMarksSec((prev) => ({
                            ...prev,
                            [st.key]: Number(cur.toFixed(2)),
                          }));
                        }}
                        className="p-2 rounded-xl bg-black/40 hover:bg-white/10 border border-white/15 text-center transition"
                      >
                        <div className="font-semibold text-cyan-300">
                          {st.label}
                        </div>
                        <div className="font-mono text-[11px] text-white mt-0.5">
                          {val !== null ? `${val}s` : "Bấm chốt"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: CV Motion Waveform, Pause Detection & Stage Breakdown */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span>Kết quả Bóc tách Video & Phát hiện Điểm khựng</span>
            </h2>

            {motionWaveform.length > 0 && (
              <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-300">
                    Biểu đồ Cường độ Chuyển động Tay (CV Motion)
                  </span>
                  <span className="text-[11px] text-rose-300">
                    Đỏ = Khựng tay (Pause)
                  </span>
                </div>
                <div className="h-20 flex items-end gap-[2px] pt-2">
                  {motionWaveform.map((pt, idx) => (
                    <div
                      key={idx}
                      title={`${pt.timeSec}s: Cường độ ${pt.energy}% ${
                        pt.isPause ? "(Khựng tay / Pause)" : ""
                      }`}
                      style={{ height: `${Math.max(12, pt.energy)}%` }}
                      className={`flex-1 rounded-t ${
                        pt.isPause ? "bg-rose-500" : "bg-cyan-400/80"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-slate-300">
                  Phát hiện{" "}
                  <strong className="text-rose-300">
                    {motionWaveform.filter((p) => p.isPause).length} khoảng giảm tốc/dừng tay
                  </strong>{" "}
                  trong quá trình chuyển giai đoạn.
                </p>
              </div>
            )}

            {videoStageDurationsMs ? (
              <div className="rounded-xl bg-black/35 border border-emerald-500/30 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-300">
                    Tổng thời gian lượt giải trong Video:
                  </span>
                  <strong className="font-mono text-xl text-white">
                    {formatTimeMs(
                      videoStageDurationsMs.totalMs,
                      settings.decimals
                    )}
                  </strong>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono">
                  {["1. Cross", "2. F2L", "3. OLL", "4. PLL"].map(
                    (label, idx) => {
                      const ms = videoStageDurationsMs.splitsMs[idx];
                      const pct = Math.round(
                        (ms / videoStageDurationsMs.totalMs) * 100
                      );
                      return (
                        <div
                          key={label}
                          className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5"
                        >
                          <div className="text-[11px] font-sans text-slate-400">
                            {label}
                          </div>
                          <div className="text-sm font-bold text-cyan-300 mt-0.5">
                            {formatTimeMs(ms, settings.decimals)} ({pct}%)
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onSaveVideoAnalyzedSolve(
                      videoStageDurationsMs.totalMs,
                      videoStageDurationsMs.splitsMs,
                      `Phân tích Video: ${videoName || "Solve"}`
                    )
                  }
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                >
                  Lưu lượt giải & 4 mốc Split này vào Session hiện tại
                </button>
              </div>
            ) : (
              <div className="rounded-xl bg-black/30 border border-white/10 p-4 text-xs text-slate-400 leading-relaxed">
                Hướng dẫn: Sau khi chọn video, bạn có thể bấm nút{" "}
                <strong className="text-indigo-200">
                  &ldquo;Quét Chuyển Động & Phát Hiện Pause (CV)&rdquo;
                </strong>{" "}
                để tự động phân đoạn, hoặc bấm vào 5 nút mốc thời gian bên dưới video khi xem tới cuối mỗi pha{" "}
                <code>Cross → F2L → OLL → PLL</code>.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
