"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  BrainCircuit,
  Calendar,
  Camera,
  CheckCircle2,
  CloudUpload,
  Download,
  Flame,
  FolderLock,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import {
  buildDeterministicCoachReport,
  PracticeRecommendation,
} from "@/lib/analytics/coach";
import { CFOP_ALGORITHMS, CfopAlgorithm } from "@/lib/cfop";
import {
  evaluateWorkoutOutcome,
  type GuidedWorkoutState,
} from "@/lib/core/workout";
import {
  computePersonalAchievements,
  computeStreakAndHeatmap,
  formatTimeMs,
} from "@/lib/stats";
import {
  CfopProgressItem,
  CubeSession,
  Solve,
  TimerSettings,
  UserFileRecord,
} from "@/types/cubing";

import CubeNetPreview from "@/components/CubeNetPreview";
import { generateScramble } from "@/lib/scrambles";
import { uploadPrivateFile } from "@/lib/r2/uploadClient";
import {
  getVideoSplits,
  resolveVideoDuration,
  seekVideo,
  suggestVideoMarks,
  videoPhases,
  type VideoMarks,
  type VideoSolveContext,
} from "@/lib/videoAnalysis";

export type HubSubTab = "coach" | "weekly" | "video" | "files";

type MarkOrigin = "user" | "suggested" | null;

interface ConfirmRequest {
  title: string;
  description: string;
  scopeNote?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

interface AiCoachAndCommunityViewProps {
  active: boolean;
  initialTab?: HubSubTab;
  sessions: CubeSession[];
  activeSession: CubeSession;
  solves: Solve[];
  settings: TimerSettings;
  cfopProgress: Record<string, CfopProgressItem>;
  userId: string | null;
  userEmail: string | null;
  guidedWorkout: GuidedWorkoutState | null;
  onStartGuidedWorkout: () => void;
  onResumeGuidedWorkout: () => void;
  onResetGuidedWorkout: () => void;
  onExecuteRecommendation: (rec: PracticeRecommendation) => void;
  onOpenAlgDrill: (alg: CfopAlgorithm) => void;
  onSaveVideoAnalyzedSolve: (
    timeMs: number,
    splitsMs: number[],
    comment: string,
    context: VideoSolveContext
  ) => void;
  onExportBackupBlob: () => Blob;
  onRequestConfirm: (req: ConfirmRequest) => void;
  onOpenAuth: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AiCoachAndCommunityView({
  active,
  initialTab = "coach",
  sessions,
  activeSession,
  solves,
  settings,
  cfopProgress,
  userId,
  userEmail,
  guidedWorkout,
  onStartGuidedWorkout,
  onResumeGuidedWorkout,
  onResetGuidedWorkout,
  onExecuteRecommendation,
  onOpenAlgDrill,
  onSaveVideoAnalyzedSolve,
  onExportBackupBlob,
  onRequestConfirm,
  onOpenAuth,
}: AiCoachAndCommunityViewProps) {
  const [subTab, setSubTab] = useState<HubSubTab>(initialTab);
  const videoActive = active && subTab === "video";

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  // 1. Deterministic AI Coach Report
  const coachReport = useMemo(
    () => buildDeterministicCoachReport(sessions, solves, cfopProgress),
    [sessions, solves, cfopProgress]
  );

  const workoutOutcome = useMemo(
    () => (guidedWorkout ? evaluateWorkoutOutcome(guidedWorkout) : null),
    [guidedWorkout]
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
            splits: coachReport.hasEnoughSplitSamples
              ? coachReport.splitBreakdown
              : null,
            splitSampleCount: coachReport.splitSampleCount,
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
      const deterministicFallback = `${coachReport.headlineDiagnosis}\n\n• ${coachReport.keyFindings.join("\n• ")}`;
      if (res.status === 401) {
        setAiCoachReply(
          `${deterministicFallback}\n\n(Đăng nhập để sử dụng thêm hỏi-đáp nâng cao từ Gemini AI. Báo cáo phân tích toán học ở trên luôn hoạt động miễn phí cho Guest.)`
        );
      } else if (res.status === 429) {
        setAiCoachReply(
          `${deterministicFallback}\n\n(${data?.error || "Đã đạt hạn mức gọi AI trong ngày."} Timer và báo cáo toán học vẫn hoạt động bình thường.)`
        );
      } else if (data?.aiEnhancedText) {
        setAiCoachReply(data.aiEnhancedText);
      } else {
        setAiCoachReply(deterministicFallback);
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

  // 3. Video Analyzer + Direct Camera Recording (getUserMedia + MediaRecorder)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const livePreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraRequest = useRef(0);
  const scanRef = useRef<AbortController | null>(null);
  const recordingContext = useRef<VideoSolveContext | null>(null);
  const [clipContext, setClipContext] = useState<VideoSolveContext | null>(null);
  const [nextScramble, setNextScramble] = useState<VideoSolveContext | null>(null);
  const { id: sessionId, puzzle } = activeSession;
  useEffect(() => {
    if (videoActive) {
      setNextScramble((previous) => previous?.sessionId === sessionId && previous.puzzle === puzzle
        ? previous
        : { sessionId, puzzle, scramble: generateScramble(puzzle) });
    }
  }, [videoActive, sessionId, puzzle]);
  const currentContext = nextScramble?.sessionId === sessionId && nextScramble.puzzle === puzzle
    ? nextScramble
    : { sessionId, puzzle, scramble: "" };
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [videoMarksSec, setVideoMarksSec] = useState<VideoMarks>({
    start: null,
    cross: null,
    f2l: null,
    oll: null,
    pll: null,
  });
  const [markOrigins, setMarkOrigins] = useState<{
    start: MarkOrigin;
    cross: MarkOrigin;
    f2l: MarkOrigin;
    oll: MarkOrigin;
    pll: MarkOrigin;
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

  // Camera Recorder state
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [holdState, setHoldState] = useState<"idle" | "holding" | "ready">("idle");
  const recordStart = useRef<number | null>(null);
  const holdStart = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledSpace = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(
    null
  );
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHold = useCallback(() => {
    holdStart.current = null;
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHoldState("idle");
  }, []);

  const stopRecordClock = useCallback(() => {
    if (recordStart.current !== null) {
      setRecordMs(performance.now() - recordStart.current);
      recordStart.current = null;
    }
    if (recordTimerRef.current !== null) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
  }, []);

  const stopCameraTracks = useCallback(() => {
    cameraRequest.current += 1;
    handledSpace.current = false;
    clearHold();
    stopRecordClock();
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    if (livePreviewRef.current) {
      livePreviewRef.current.srcObject = null;
    }
    setIsRecording(false);
    setCameraReady(false);
  }, [clearHold, stopRecordClock]);

  useEffect(() => {
    if (cameraReady && !recordedPreviewUrl && livePreviewRef.current) {
      livePreviewRef.current.srcObject = mediaStreamRef.current;
    }
  }, [cameraReady, recordedPreviewUrl, cameraError]);

  useEffect(() => {
    return () => {
      if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
    };
  }, [recordedPreviewUrl]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Stop camera cleanly when switching sub-tab or unmounting
  useEffect(() => {
    if (!videoActive) {
      stopCameraTracks();
      setRecorderOpen(false);
      setRecordedBlob(null);
      setRecordedPreviewUrl(null);
      setAnalyzingVideo(false);
    }
  }, [videoActive, stopCameraTracks]);

  useEffect(() => {
    return () => {
      stopCameraTracks();
    };
  }, [stopCameraTracks]);

  const handleOpenCameraRecorder = async () => {
    stopCameraTracks();
    videoRef.current?.pause();
    const request = cameraRequest.current;
    setCameraError(null);
    setRecorderOpen(true);
    setRecordedBlob(null);
    setRecordedPreviewUrl(null);
    setRecordMs(0);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setCameraError(
        "Trình duyệt này chưa hỗ trợ quay video trực tiếp (thiếu MediaDevices hoặc MediaRecorder). Bạn vẫn có thể dùng nút 'Tải video lên'."
      );
      return;
    }

    try {
      // Request video only (no microphone permission needed for cubing split analysis)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (request !== cameraRequest.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      setCameraReady(true);
    } catch (err) {
      if (request !== cameraRequest.current) return;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError(
          "Bạn đã từ chối quyền truy cập camera. Hãy cấp quyền camera trong cài đặt trình duyệt rồi thử lại, hoặc chọn 'Tải video lên'."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraError(
          "Không tìm thấy camera khả dụng trên thiết bị này. Bạn có thể tải video có sẵn lên để phân tích."
        );
      } else {
        setCameraError(
          "Không thể mở camera lúc này (có thể đang được ứng dụng khác sử dụng). Hãy thử lại hoặc tải video lên."
        );
      }
    }
  };

  const handleStartRecording = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream || mediaRecorderRef.current || !currentContext.scramble) return;
    setCameraError(null);
    clearHold();
    const chunks: Blob[] = [];

    const mimeCandidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];
    const mimeType =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";

    try {
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data);
        }
      };
      recorder.onstart = () => {
        if (mediaRecorderRef.current !== recorder || recorder.state !== "recording") return;
        const started = performance.now();
        recordStart.current = started;
        recordTimerRef.current = setInterval(() => {
          setRecordMs(performance.now() - started);
        }, 40);
      };
      recorder.onstop = () => {
        if (mediaRecorderRef.current !== recorder) return;
        mediaRecorderRef.current = null;
        stopRecordClock();
        setIsRecording(false);
        const type = recorder.mimeType || chunks[0]?.type || "video/webm";
        const blob = new Blob(chunks, { type });
        if (blob.size === 0) {
          setCameraError("Clip chưa có dữ liệu. Hãy thử quay lại.");
          return;
        }
        setRecordedBlob(blob);
        setRecordedPreviewUrl(URL.createObjectURL(blob));
      };
      recorder.onerror = () => {
        if (mediaRecorderRef.current !== recorder) return;
        stopCameraTracks();
        setCameraError("Camera bị gián đoạn. Hãy mở lại camera và thử quay.");
      };
      mediaRecorderRef.current = recorder;
      recordingContext.current = currentContext;
      recorder.start(250);
      setRecordMs(0);
      setIsRecording(true);
    } catch {
      mediaRecorderRef.current = null;
      setCameraError(
        "Không thể khởi chạy bộ ghi hình trên trình duyệt này. Vui lòng thử tải video lên."
      );
    }
  }, [clearHold, currentContext, stopCameraTracks, stopRecordClock]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      stopRecordClock();
      mediaRecorderRef.current.stop();
    }
  }, [stopRecordClock]);

  useEffect(() => {
    if (!videoActive || !recorderOpen) return;
    const usesSpace = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        Boolean(target.closest("input, textarea, select, video, [role='textbox'], [role='dialog']")));

    const keydown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !cameraReady || recordedPreviewUrl || cameraError) return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (usesSpace(event.target)) return;

      event.preventDefault();
      handledSpace.current = true;
      if (event.repeat) return;
      if (mediaRecorderRef.current) {
        handleStopRecording();
        return;
      }
      holdStart.current = performance.now();
      if (settings.holdDelayMs === 0) {
        setHoldState("ready");
      } else {
        setHoldState("holding");
        holdTimer.current = setTimeout(() => setHoldState("ready"), settings.holdDelayMs);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !handledSpace.current) return;
      handledSpace.current = false;
      const started = holdStart.current;
      clearHold();
      if (usesSpace(event.target)) return;
      event.preventDefault();
      if (started !== null && performance.now() - started >= settings.holdDelayMs) {
        handleStartRecording();
      }
    };
    const blur = () => {
      handledSpace.current = false;
      clearHold();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    };
  }, [
    videoActive, recorderOpen, cameraReady, recordedPreviewUrl, cameraError,
    settings.holdDelayMs, clearHold, handleStartRecording, handleStopRecording,
  ]);

  const handleSelectVideoFile = (file: File, context: VideoSolveContext | null = null) => {
    scanRef.current?.abort();
    setAnalyzingVideo(false);
    setVideoDuration(null);
    setVideoError(null);
    setPlaybackRate(1);
    setClipContext(context ?? { ...currentContext, scramble: "" });
    const nextUrl = URL.createObjectURL(file);
    setVideoUrl(nextUrl);
    setVideoFile(file);
    setVideoName(file.name);
    setVideoMarksSec({
      start: 0,
      cross: null,
      f2l: null,
      oll: null,
      pll: null,
    });
    setMarkOrigins({
      start: "suggested",
      cross: null,
      f2l: null,
      oll: null,
      pll: null,
    });
    setMotionWaveform([]);
  };

  const handleUseRecordedClip = () => {
    if (!recordedBlob) return;
    const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    const file = new File(
      [recordedBlob],
      `ruktimer-solve-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`,
      { type: recordedBlob.type || "video/webm" }
    );
    stopCameraTracks();
    setRecorderOpen(false);
    setRecordedPreviewUrl(null);
    setRecordedBlob(null);
    handleSelectVideoFile(file, recordingContext.current);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!videoActive || !videoUrl || !video) return;
    const controller = new AbortController();
    void resolveVideoDuration(video, controller.signal).then((duration) => {
      if (controller.signal.aborted) return;
      setVideoDuration(duration);
      if (duration === null) {
        setVideoError("Chưa xác định được thời lượng clip. Hãy bấm quét để thử lại.");
      }
    });
    return () => {
      controller.abort();
      scanRef.current?.abort();
    };
  }, [videoActive, videoUrl]);

  // On-Device Computer Vision: Samples frames from video to detect hand/cube motion & lookahead pauses
  const runClientCvMotionScan = async () => {
    if (!videoUrl || analyzingVideo) return;
    const controller = new AbortController();
    scanRef.current = controller;
    const { signal } = controller;
    setAnalyzingVideo(true);
    setVideoError(null);

    const vid = document.createElement("video");
    vid.preload = "auto";
    vid.src = videoUrl;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    try {
      const duration = await resolveVideoDuration(vid, signal);
      if (signal.aborted) return;
      if (duration === null) throw new Error("Chưa xác định được thời lượng clip. Hãy thử quét lại.");
      setVideoDuration(duration);
      if (!ctx) throw new Error("Trình duyệt không hỗ trợ đọc khung hình.");

      const step = Math.max(0.25, duration / 180);
      let prevPixels: Uint8ClampedArray | null = null;
      const samples: typeof motionWaveform = [];
      for (let index = 0; index < 180; index++) {
        const timeSec = index * step;
        if (timeSec >= duration || signal.aborted) break;
        if (!await seekVideo(vid, timeSec, signal)) {
          prevPixels = null;
          continue;
        }
        if (signal.aborted) return;
        ctx.drawImage(vid, 0, 0, 64, 64);
        const pixels = ctx.getImageData(0, 0, 64, 64).data;
        let diffSum = 0;
        if (prevPixels) {
          for (let i = 0; i < pixels.length; i += 16) {
            diffSum += Math.abs(pixels[i] - prevPixels[i]) +
              Math.abs(pixels[i + 1] - prevPixels[i + 1]) +
              Math.abs(pixels[i + 2] - prevPixels[i + 2]);
          }
        }
        const energy = Math.min(100, Math.round(diffSum / 140));
        samples.push({ timeSec, energy, isPause: prevPixels !== null && energy < 12 });
        prevPixels = pixels;
      }
      if (signal.aborted) return;
      if (!samples.length) throw new Error("Không đọc được khung hình. Hãy thử quét lại.");
      setMotionWaveform(samples);
      if (duration >= 3) {
        setVideoMarksSec((prev) => suggestVideoMarks(prev, duration));
        setMarkOrigins((prev) => ({
          ...prev,
          ...Object.fromEntries(videoPhases.filter((phase) => !prev[phase]).map((phase) => [phase, "suggested"])),
        }));
      }
    } catch (error) {
      if (!signal.aborted) {
        setVideoError(error instanceof Error ? error.message : "Không quét được clip. Hãy thử lại.");
      }
    } finally {
      vid.removeAttribute("src");
      vid.load();
      if (scanRef.current === controller) {
        scanRef.current = null;
        if (!signal.aborted) setAnalyzingVideo(false);
      }
    }
  };

  const { result: videoStageDurationsMs, error: markError } =
    getVideoSplits(videoMarksSec, videoDuration);
  const targetSession = clipContext && sessions.find((session) => session.id === clipContext.sessionId);
  const scrambleLocked = isRecording || Boolean(recorderOpen && recordedPreviewUrl);
  const displayedContext = scrambleLocked ? recordingContext.current ?? currentContext : currentContext;

  const hasUnconfirmedSuggestedMarks = Object.values(markOrigins).some(
    (o) => o === "suggested"
  );

  // 4. Private Personal File Storage (Cloudflare R2)
  const [r2Files, setR2Files] = useState<UserFileRecord[]>([]);
  const [r2Mode, setR2Mode] = useState<"r2" | "mock" | null>(null);
  const [r2Loading, setR2Loading] = useState(false);
  const [r2Uploading, setR2Uploading] = useState(false);
  const [r2StatusMessage, setR2StatusMessage] = useState<string | null>(null);

  const loadR2Files = useCallback(async () => {
    if (!userId) return;
    setR2Loading(true);
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      if (res.ok) {
        setR2Files(data.files ?? []);
        setR2Mode(data.storageMode ?? null);
      } else {
        setR2StatusMessage(data.error || "Không tải được danh sách tệp");
      }
    } catch {
      setR2StatusMessage("Lỗi kết nối tới kho lưu trữ");
    } finally {
      setR2Loading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (active && subTab === "files" && userId) {
      loadR2Files();
    }
  }, [active, subTab, userId, loadR2Files]);

  const uploadBlobToR2 = async (
    blob: Blob,
    filename: string,
    kind: "video" | "backup" | "other"
  ) => {
    if (!userId) {
      onOpenAuth();
      return;
    }
    setR2Uploading(true);
    setR2StatusMessage(null);
    try {
      const error = await uploadPrivateFile(blob, filename, kind);
      if (error) {
        setR2StatusMessage(error);
        return;
      }

      setR2StatusMessage(`Đã lưu riêng tư "${filename}" thành công.`);
      await loadR2Files();
    } catch {
      setR2StatusMessage("Lỗi mạng khi tải tệp lên kho cá nhân.");
    } finally {
      setR2Uploading(false);
    }
  };

  const handleDownloadR2File = async (file: UserFileRecord) => {
    try {
      const res = await fetch(`/api/files/${file.id}/download`);
      const data = await res.json();
      if (res.ok && data.downloadUrl) {
        window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
      } else {
        setR2StatusMessage(data.error || "Không lấy được liên kết tải xuống");
      }
    } catch {
      setR2StatusMessage("Lỗi khi yêu cầu liên kết tải xuống");
    }
  };

  const handleDeleteR2File = (file: UserFileRecord) => {
    onRequestConfirm({
      title: `Xóa tệp "${file.filename}"?`,
      description: `Tệp ${
        file.kind === "video" ? "video" : file.kind === "backup" ? "sao lưu" : "cá nhân"
      } (${formatBytes(file.size_bytes)}) sẽ bị xóa khỏi kho lưu trữ riêng tư của bạn.`,
      scopeNote:
        "Thao tác này xóa vĩnh viễn tệp trên kho lưu trữ đám mây và không thể hoàn tác.",
      confirmLabel: "Xác nhận xóa",
      onConfirm: async () => {
        const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) {
          setR2StatusMessage(data.error || "Xóa tệp thất bại");
        } else {
          setR2Files((prev) => prev.filter((f) => f.id !== file.id));
          setR2StatusMessage(`Đã xóa "${file.filename}".`);
        }
      },
    });
  };

  if (!active) return null;

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
              AI Practice Coach, Báo cáo Tuần, Phân tích Video & Kho tệp
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Chẩn đoán điểm yếu từ dữ liệu thật, theo dõi chuỗi ngày luyện tập, quay/phân tích video và lưu tệp riêng tư
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "coach", label: "AI Practice Coach", icon: BrainCircuit },
              { id: "weekly", label: "Báo cáo Tuần & Streak", icon: Flame },
              { id: "video", label: "Video Analyzer", icon: Video },
              { id: "files", label: "Kho tệp cá nhân", icon: FolderLock },
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
      {/* TAB 1: HYBRID AI PRACTICE COACH & GUIDED F2L WORKOUT                 */}
      {/* ==================================================================== */}
      {subTab === "coach" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Diagnosis Summary & Actionable Practice Plan */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl border border-cyan-500/30 bg-white/[0.04] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <span>Chẩn đoán Phong độ & Điểm yếu Cốt lõi</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded-lg bg-white/[0.06] border border-white/10 font-mono text-[11px] text-slate-200">
                    Split: {coachReport.splitSampleCount}/
                    {coachReport.minSplitDiagnosticSamples} lượt
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono text-xs font-bold">
                    {coachReport.cuberTierLabel}
                  </span>
                </div>
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

            {/* Guided F2L Workout MVP Card (Select -> Drill 10 F2L -> Remeasure 5 Split) */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold flex items-center gap-2 text-white">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <span>Bài tập đo kiểm F2L (Luyện 10 lượt + Đo lại 5 Split)</span>
                </h2>
                {guidedWorkout && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 font-mono text-[11px] text-emerald-200">
                    {guidedWorkout.phase === "drill_f2l"
                      ? `Pha 1/2 • F2L Drill ${guidedWorkout.drillSolveIds.length}/${guidedWorkout.targetDrillCount}`
                      : guidedWorkout.phase === "remeasure_splits"
                      ? `Pha 2/2 • Đo lại Split ${guidedWorkout.remeasureSolveIds.length}/${guidedWorkout.targetRemeasureCount}`
                      : "Hoàn thành chu trình"}
                  </span>
                )}
              </div>

              {!guidedWorkout ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
                  <p className="flex-1 min-w-[220px] leading-relaxed">
                    Ghi mốc F2L ban đầu từ các lượt có split gần nhất, chuyển sang{" "}
                    <strong>10 lượt Luyện F2L (Cross giải sẵn)</strong>, sau đó đo lại{" "}
                    <strong>5 lượt Split Timer</strong> để kiểm chứng tiến bộ thực tế.
                  </p>
                  <button
                    type="button"
                    onClick={onStartGuidedWorkout}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 transition shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Bắt đầu bài tập F2L</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="rounded-xl bg-black/35 border border-white/10 p-3">
                      <div className="text-slate-400 text-[11px]">Mốc ban đầu</div>
                      <div className="font-mono font-bold text-white text-sm mt-0.5">
                        {guidedWorkout.baseline.baselineMs !== null
                          ? `${formatTimeMs(guidedWorkout.baseline.baselineMs, settings.decimals)} (${guidedWorkout.baseline.sampleCount} mẫu)`
                          : "Chưa đủ mẫu mốc"}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {guidedWorkout.baseline.label}
                      </div>
                    </div>
                    <div className="rounded-xl bg-black/35 border border-white/10 p-3">
                      <div className="text-slate-400 text-[11px]">Tiến độ luyện F2L</div>
                      <div className="font-mono font-bold text-cyan-300 text-sm mt-0.5">
                        {guidedWorkout.drillSolveIds.length}/{guidedWorkout.targetDrillCount} lượt
                      </div>
                    </div>
                    <div className="rounded-xl bg-black/35 border border-white/10 p-3">
                      <div className="text-slate-400 text-[11px]">Đo lại Split 4 pha</div>
                      <div className="font-mono font-bold text-emerald-300 text-sm mt-0.5">
                        {guidedWorkout.remeasureSolveIds.length}/{guidedWorkout.targetRemeasureCount} lượt
                      </div>
                    </div>
                  </div>

                  {workoutOutcome && guidedWorkout.phase === "done" && (
                    <div className="rounded-xl bg-black/45 border border-emerald-400/35 p-3 text-emerald-100 leading-relaxed">
                      <strong>Kết quả đo lại:</strong> {workoutOutcome.message}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {guidedWorkout.phase !== "done" && (
                      <button
                        type="button"
                        onClick={onResumeGuidedWorkout}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 transition"
                      >
                        <span>Tiếp tục bài tập trên Timer</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onRequestConfirm({
                          title: "Đặt lại bài tập F2L đang thực hiện?",
                          description:
                            "Tiến độ đo kiểm của chu trình F2L hiện tại sẽ được đặt lại. Các lượt giải đã lưu trong lịch sử vẫn được giữ nguyên.",
                          confirmLabel: "Xác nhận đặt lại",
                          onConfirm: onResetGuidedWorkout,
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 inline-flex items-center gap-1.5 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Đặt lại bài tập</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3-Step Personalized Practice Plan */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Target className="w-5 h-5 text-emerald-400" />
                  <span>Giáo án Luyện tập Đề xuất Hôm nay</span>
                </h2>
                <span className="text-xs text-slate-400">
                  Mở thẳng bài luyện phù hợp
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

          {/* Right Column: Weakest Algorithms Table & Recommended Next Algs */}
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
                    Khi bạn bấm giờ các bài PLL/OLL/F2L trong Drill Studio, hệ thống sẽ tự động xếp hạng các bài có tốc độ ngón tay (TPS) thấp nhất tại đây.
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
      {/* TAB 2: WEEKLY REPORT (MONDAY-START), 84-DAY STREAK & ACHIEVEMENTS    */}
      {/* ==================================================================== */}
      {subTab === "weekly" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-black/30 border border-white/10 px-4 py-2.5 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
            <span>
              Tuần hiện tại (bắt đầu Thứ Hai):{" "}
              <strong className="text-cyan-300 font-mono">
                {coachReport.weeklyComparison.weekStart} →{" "}
                {coachReport.weeklyComparison.today}
              </strong>{" "}
              ({coachReport.weeklyComparison.elapsedDays}/7 ngày — so sánh cùng số ngày với tuần trước)
            </span>
            <span className="text-slate-400">
              Hoạt động & Streak tính mọi lượt (gồm +2, DNF, CFOP Drill); Mean tuần chỉ tính phiên giải chính.
            </span>
          </div>

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
                Tổng lượt luyện tuần này
              </div>
              <div className="font-mono text-2xl font-bold text-cyan-300 mt-1 tabular-nums">
                {coachReport.weeklyComparison.thisWeekPracticeCount} lượt
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Cùng kỳ tuần trước: {coachReport.weeklyComparison.lastWeekPracticeCount} lượt (cả tuần trước: {coachReport.weeklyComparison.lastWeekFullCount})
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs text-slate-400">
                Mean Phiên chính (Tuần này vs Cùng kỳ)
              </div>
              <div className="font-mono text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
                {formatTimeMs(
                  coachReport.weeklyComparison.thisWeekMeanMs,
                  settings.decimals
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Cùng kỳ tuần trước:{" "}
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
                      : "bg-black/30 border-white/10 opacity-70"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <strong className="text-xs font-bold text-white">
                        {ach.title}
                      </strong>
                      {ach.unlocked && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
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
      {/* TAB 3: VIDEO ANALYZER + DIRECT CAMERA RECORDING                      */}
      {/* ==================================================================== */}
      {subTab === "video" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Video className="w-5 h-5 text-cyan-400" />
                  <span>Video Solve Analyzer (Quay trực tiếp & Tách pha CFOP)</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Phân tích tại chỗ trên trình duyệt — chỉ tải clip lên kho cá nhân khi bạn chủ động chọn lưu
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={recorderOpen}
                  onClick={handleOpenCameraRecorder}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Quay video</span>
                </button>

                <label className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Tải video lên</span>
                  <input
                    type="file"
                    accept="video/*"
                    disabled={isRecording}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        stopCameraTracks();
                        setRecorderOpen(false);
                        setRecordedPreviewUrl(null);
                        setRecordedBlob(null);
                        handleSelectVideoFile(f);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="min-w-0 flex-[1_1_14rem] space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <span className="text-xs font-semibold text-slate-300">
                    Scramble · {sessions.find((session) => session.id === displayedContext.sessionId)?.name ?? activeSession.name}
                  </span>
                  <button
                    type="button"
                    disabled={scrambleLocked}
                    onClick={() => setNextScramble({ ...currentContext, scramble: generateScramble(puzzle) })}
                    className="min-h-11 rounded-lg px-2 text-xs font-semibold text-cyan-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    Scramble mới
                  </button>
                </div>
                <p className="break-words text-sm font-mono text-white">{displayedContext.scramble}</p>
              </div>
              {displayedContext.scramble && (
                <CubeNetPreview puzzle={displayedContext.puzzle} scramble={displayedContext.scramble} compact />
              )}
              <div className="space-y-1 text-right">
                <div className="text-xs text-slate-300">Thời gian quay</div>
                <div data-testid="recording-time" className="font-mono text-xl tabular-nums text-white">
                  {formatTimeMs(recordMs, settings.decimals)}
                </div>
              </div>
            </div>

            {/* Direct Camera Recorder Panel */}
            {recorderOpen && (
              <div className="rounded-xl bg-black/50 border border-emerald-500/35 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Camera className="w-4 h-4" />
                    <span>Quay clip lượt giải trực tiếp (không ghi âm)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraTracks();
                      setRecorderOpen(false);
                      setRecordedBlob(null);
                      setRecordedPreviewUrl(null);
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200"
                  >
                    Đóng camera
                  </button>
                </div>

                {cameraError ? (
                  <div className="rounded-xl bg-rose-500/15 border border-rose-400/35 p-3 text-xs text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                  </div>
                ) : recordedPreviewUrl ? (
                  <div className="space-y-3">
                    <video
                      src={recordedPreviewUrl}
                      controls
                      className="w-full max-h-[300px] rounded-xl bg-black object-contain"
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRecordedPreviewUrl(null);
                          setRecordedBlob(null);
                          setRecordMs(0);
                          if (!mediaStreamRef.current) {
                            handleOpenCameraRecorder();
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Quay lại</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleUseRecordedClip}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đưa clip vào Analyzer</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative rounded-xl overflow-hidden bg-black border border-white/10">
                      <video
                        ref={livePreviewRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full max-h-[min(28vh,300px)] sm:max-h-[300px] object-contain"
                      />
                      {isRecording && (
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-rose-600 text-white font-mono text-xs font-bold">
                          Đang quay
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      {!isRecording ? (
                        <button
                          type="button"
                          disabled={!cameraReady || !currentContext.scramble}
                          onClick={handleStartRecording}
                          className="min-h-11 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Bắt đầu quay</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStopRecording}
                          className="min-h-11 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Dừng quay</span>
                        </button>
                      )}
                    </div>
                    <p role="status" className={`text-center text-xs text-slate-300 ${cameraReady ? "[@media(pointer:coarse)]:sr-only" : ""}`}>
                      {!cameraReady ? "Đang chờ camera…" : isRecording ? "Bấm Space để dừng quay."
                        : holdState === "ready" ? "Nhả Space để bắt đầu quay."
                        : holdState === "holding" ? "Tiếp tục giữ Space…"
                        : "Giữ rồi nhả Space để bắt đầu quay."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!videoUrl ? !recorderOpen && (
              <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 py-14 px-4 text-center space-y-2">
                <Video className="w-8 h-8 text-cyan-400 mx-auto opacity-75" />
                <p className="text-sm font-semibold text-slate-200">
                  Chưa có video nào được nạp
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Chọn <strong>Quay video</strong> để ghi hình trực tiếp từ camera hoặc <strong>Tải video lên</strong> từ máy để phát chậm 0.25x/0.5x, quét điểm khựng tay và chốt 4 mốc Cross / F2L / OLL / PLL.
                </p>
              </div>
            ) : (
              <div hidden={recorderOpen} className="space-y-3">
                <div className="rounded-xl overflow-hidden bg-black border border-white/10">
                  <video
                    key={videoUrl}
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    className="w-full max-h-[340px] object-contain"
                  />
                </div>

                {clipContext && (
                  <div className="space-y-2 text-xs text-slate-300">
                    <p>Phiên đích: {targetSession?.name ?? "Phiên không còn khả dụng"} · {clipContext.puzzle.toUpperCase()}</p>
                    <p className="break-words">Scramble của clip: {clipContext.scramble || "Chưa gán"}</p>
                    {!clipContext.scramble && (
                      <button
                        type="button"
                        disabled={!currentContext.scramble || clipContext.puzzle !== puzzle || recorderOpen}
                        onClick={() => setClipContext({ ...clipContext, scramble: currentContext.scramble })}
                        className="min-h-11 rounded-lg bg-white/10 px-3 text-cyan-200 hover:bg-white/15 disabled:opacity-50"
                      >
                        Gán scramble đang hiển thị cho clip
                      </button>
                    )}
                  </div>
                )}
                {videoError && <p role="alert" className="text-xs text-rose-200">{videoError}</p>}

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
                        : "Quét Chuyển Động & Gợi ý Mốc (CV)"}
                    </span>
                  </button>
                </div>

                {/* 5 Phase Stamp Buttons while watching video */}
                <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-5">
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
                    const origin = markOrigins[st.key];
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => {
                          const video = videoRef.current;
                          if (!video || video.seeking || video.readyState < 2) return;
                          const cur = video.currentTime;
                          setVideoMarksSec((prev) => ({
                            ...prev,
                            [st.key]: cur,
                          }));
                          setMarkOrigins((prev) => ({
                            ...prev,
                            [st.key]: "user",
                          }));
                        }}
                        className="p-2 rounded-xl bg-black/40 hover:bg-white/10 border border-white/15 text-center transition"
                      >
                        <div className="font-semibold text-cyan-300">
                          {st.label}
                        </div>
                        <div className="font-mono text-[11px] text-white mt-0.5">
                          {val !== null ? `${val.toFixed(2)}s` : "Bấm chốt"}
                        </div>
                        {origin && (
                          <div
                            className={`text-[9px] mt-0.5 ${
                              origin === "user"
                                ? "text-emerald-300"
                                : "text-amber-300"
                            }`}
                          >
                            {origin === "user" ? "Bạn chốt" : "Hệ thống gợi ý"}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: CV Motion Waveform, Stage Breakdown & Optional R2 Upload */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span>Kết quả Bóc tách Video & Phát hiện Điểm khựng</span>
            </h2>

            {markError && <p role="alert" className="text-xs text-rose-200">{markError}</p>}
            {clipContext && !targetSession && (
              <p role="alert" className="text-xs text-rose-200">Phiên đích không còn tồn tại.</p>
            )}

            {motionWaveform.length > 0 && (
              <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-300">
                    Biểu đồ Cường độ Chuyển động Tay (CV Motion)
                  </span>
                  <span className="text-[11px] text-rose-300">
                    Đỏ = Gợi ý đoạn khựng
                  </span>
                </div>
                <div className="h-20 flex items-end gap-[2px] pt-2">
                  {motionWaveform.map((pt, idx) => (
                    <div
                      key={idx}
                      title={`${pt.timeSec}s: Cường độ ${pt.energy}% ${
                        pt.isPause ? "(Gợi ý khựng tay)" : ""
                      }`}
                      style={{ height: `${Math.max(12, pt.energy)}%` }}
                      className={`flex-1 rounded-t ${
                        pt.isPause ? "bg-rose-500" : "bg-cyan-400/80"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-slate-300">
                  Hệ thống gợi ý{" "}
                  <strong className="text-rose-300">
                    {motionWaveform.filter((p) => p.isPause).length} khoảng giảm tốc/dừng tay
                  </strong>
                  . Hãy tua chậm để kiểm tra và chốt lại các mốc nếu cần.
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

                {hasUnconfirmedSuggestedMarks && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-400/30 px-2.5 py-1.5 text-[11px] text-amber-200">
                    Một số mốc đang là <strong>gợi ý ước lượng của hệ thống</strong> (chưa do bạn tự bấm chốt). Bạn có thể tua video và bấm lại từng nút mốc để chỉnh chính xác.
                  </div>
                )}

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
                  disabled={!targetSession || analyzingVideo}
                  onClick={() =>
                    clipContext && targetSession && onSaveVideoAnalyzedSolve(
                      videoStageDurationsMs.totalMs,
                      videoStageDurationsMs.splitsMs,
                      `Phân tích Video: ${videoName || "Solve"}`,
                      clipContext
                    )
                  }
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition disabled:opacity-50"
                >
                  Lưu lượt giải & 4 mốc Split
                </button>
              </div>
            ) : (
              <div className="rounded-xl bg-black/30 border border-white/10 p-4 text-xs text-slate-400 leading-relaxed">
                Hướng dẫn: Sau khi quay hoặc tải video lên, bạn có thể bấm{" "}
                <strong className="text-indigo-200">
                  &ldquo;Quét Chuyển Động & Gợi ý Mốc (CV)&rdquo;
                </strong>{" "}
                để xem đoạn khựng gợi ý, hoặc tự bấm 5 nút mốc bên dưới video khi xem tới cuối mỗi pha{" "}
                <code>Cross → F2L → OLL → PLL</code>.
              </div>
            )}

            {/* Optional Save Video to Private R2 Storage */}
            {videoFile && (
              <div className="rounded-xl bg-black/35 border border-white/10 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-200 truncate">
                    Clip hiện tại: {videoName} ({formatBytes(videoFile.size)})
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Clip đang nằm tại máy của bạn. Chỉ tải lên kho cá nhân riêng tư (Cloudflare R2) nếu bạn muốn lưu lâu dài.
                </p>
                <button
                  type="button"
                  disabled={r2Uploading}
                  onClick={() =>
                    uploadBlobToR2(videoFile, videoFile.name, "video")
                  }
                  className="w-full py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-cyan-200 font-semibold inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  {r2Uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {userId
                      ? r2Uploading
                        ? "Đang tải lên kho cá nhân..."
                        : "Lưu clip vào kho cá nhân (R2)"
                      : "Đăng nhập để lưu clip lên kho cá nhân"}
                  </span>
                </button>
                {r2StatusMessage && (
                  <p className="text-[11px] text-cyan-300">{r2StatusMessage}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: PRIVATE PERSONAL FILE STORAGE (CLOUDFLARE R2)                 */}
      {/* ==================================================================== */}
      {subTab === "files" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <FolderLock className="w-5 h-5 text-cyan-400" />
                <span>Kho tệp cá nhân riêng tư (Cloudflare R2)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Lưu riêng tư video lượt giải và bản sao lưu JSON của riêng tài khoản bạn qua URL ký ngắn hạn
                {r2Mode && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-white/10 text-cyan-300 font-mono text-[10px]">
                    Chế độ: {r2Mode === "r2" ? "Cloudflare R2" : "Mock cục bộ (Dev)"}
                  </span>
                )}
              </p>
            </div>

            {userId && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={r2Uploading}
                  onClick={() => {
                    const blob = onExportBackupBlob();
                    const fname = `ruktimer-backup-${new Date()
                      .toISOString()
                      .slice(0, 10)}.json`;
                    uploadBlobToR2(blob, fname, "backup");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition"
                >
                  {r2Uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5" />
                  )}
                  <span>Sao lưu JSON hiện tại lên kho R2</span>
                </button>
              </div>
            )}
          </div>

          {r2StatusMessage && (
            <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/30 px-3.5 py-2 text-xs text-cyan-200">
              {r2StatusMessage}
            </div>
          )}

          {!userId ? (
            <div className="rounded-xl bg-black/35 border border-white/10 p-6 text-center space-y-3">
              <FolderLock className="w-8 h-8 text-cyan-400 mx-auto opacity-80" />
              <p className="text-sm font-semibold text-white">
                Đăng nhập để sử dụng Kho tệp cá nhân riêng tư
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Mọi video và bản sao lưu trong kho được phân quyền theo tài khoản đăng nhập. Bạn vẫn có thể phân tích video và xuất file sao lưu trực tiếp trên máy ở chế độ Guest.
              </p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                Đăng nhập tài khoản
              </button>
            </div>
          ) : r2Loading ? (
            <div className="py-10 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Đang tải danh sách tệp cá nhân...</span>
            </div>
          ) : r2Files.length === 0 ? (
            <div className="rounded-xl bg-black/30 border border-white/10 p-6 text-center text-xs text-slate-400">
              Chưa có tệp nào trong kho riêng tư ({userEmail}). Bạn có thể lưu bản sao lưu JSON ở nút phía trên hoặc lưu clip từ tab Video Analyzer.
            </div>
          ) : (
            <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/30 overflow-hidden">
              {r2Files.map((file) => (
                <div
                  key={file.id}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate max-w-[360px]">
                      {file.filename}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Loại: {file.kind.toUpperCase()} •{" "}
                      {formatBytes(file.size_bytes)} •{" "}
                      {new Date(file.created_at).toLocaleString("vi-VN")}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadR2File(file)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-cyan-200 font-medium inline-flex items-center gap-1 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải xuống</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteR2File(file)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 font-medium inline-flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
