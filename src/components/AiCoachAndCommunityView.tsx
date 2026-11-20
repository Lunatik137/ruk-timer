"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Camera,
  CheckCircle2,
  CloudUpload,
  Download,
  Eye,
  Flame,
  FolderLock,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  SwitchCamera,
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

import VideoTimeline from "@/components/VideoTimeline";
import VaultVideoPreviewModal from "@/components/VaultVideoPreviewModal";
import { loadVideoDraft, saveVideoDraft } from "@/lib/videoDraft";
import CubeNetPreview from "@/components/CubeNetPreview";
import { generateScramble } from "@/lib/scrambles";
import { uploadPrivateFile } from "@/lib/r2/uploadClient";
import {
  buildCameraConstraints,
  detectCameraFacing,
  getCameraFacingLabel,
  getOppositeFacingMode,
  isCameraSwitchLocked,
  normalizeVideoInputDevices,
  pickAlternateCameraDeviceId,
  triggerBlobDownload,
  type CameraFacingMode,
  type CameraSourceOption,
} from "@/lib/cameraDevices";
import {
  getRecentSplitMedians,
  getVideoSplits,
  resolveVideoDuration,
  seekVideo,
  suggestVideoMarks,
  videoPhases,
  type VideoMarks,
  type VideoMarkOrigins,
  type VideoPhase,
  type VideoSolveContext,
} from "@/lib/videoAnalysis";

export type HubSubTab = "coach" | "weekly" | "video" | "files";

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
  const [markOrigins, setMarkOrigins] = useState<VideoMarkOrigins>({
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

  const [draftReady, setDraftReady] = useState(false);
  const [draftStartedAt, setDraftStartedAt] = useState<number | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!videoActive || draftReady) return;
    let cancelled = false;
    void loadVideoDraft().then((draft) => {
      if (cancelled || !draft) return;
      setVideoUrl(URL.createObjectURL(draft.file));
      setVideoFile(draft.file);
      setVideoName(draft.file.name);
      setClipContext(draft.context);
      setVideoMarksSec(draft.marks);
      setMarkOrigins(draft.origins);
      setDraftStartedAt(draft.startedAt);
    }).catch(() => {
      if (!cancelled) setDraftMessage("Không đọc được bản nháp trên trình duyệt này.");
    }).finally(() => {
      if (!cancelled) setDraftReady(true);
    });
    return () => { cancelled = true; };
  }, [videoActive, draftReady]);

  useEffect(() => {
    if (!draftReady || !videoFile || !clipContext || draftStartedAt === null) return;
    let current = true;
    setDraftMessage(null);
    void saveVideoDraft({
      file: videoFile,
      context: clipContext,
      marks: videoMarksSec,
      origins: markOrigins,
      startedAt: draftStartedAt,
    }).then(() => {
      if (current) setDraftMessage("Đã lưu bản nháp trên thiết bị này.");
    }).catch(() => {
      if (current) setDraftMessage("Không lưu được bản nháp. Hãy kiểm tra dung lượng trình duyệt.");
    });
    return () => { current = false; };
  }, [draftReady, videoFile, clipContext, videoMarksSec, markOrigins, draftStartedAt]);

  // Camera Recorder state
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<CameraSourceOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [cameraFacing, setCameraFacing] = useState<CameraFacingMode>("environment");
  const [activeCameraFacing, setActiveCameraFacing] =
    useState<CameraFacingMode | null>(null);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<VideoPhase>("start");
  const [isRecording, setIsRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [useCountdown, setUseCountdown] = useState(false);
  const [countdownDeadline, setCountdownDeadline] = useState<number | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
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
    setCountdownDeadline(null);
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
    setSwitchingCamera(false);
  }, [clearHold, stopRecordClock]);

  const refreshCameraDevices = useCallback(async (): Promise<CameraSourceOption[]> => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const normalized = normalizeVideoInputDevices(devices);
      setCameraDevices(normalized);
      return normalized;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (cameraReady && !recordedPreviewUrl && livePreviewRef.current) {
      livePreviewRef.current.srcObject = mediaStreamRef.current;
    }
  }, [cameraReady, recordedPreviewUrl, cameraError, selectedCameraId, activeCameraFacing]);

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

  // Release camera tracks when leaving browser tab or hiding page
  useEffect(() => {
    if (!videoActive || !recorderOpen) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      if (mediaRecorderRef.current?.state === "recording") {
        stopRecordClock();
        mediaRecorderRef.current.stop();
        return;
      }
      if (mediaStreamRef.current) {
        stopCameraTracks();
        setCameraError(
          "Camera đã tạm đóng khi bạn rời tab. Bấm 'Thử lại' để mở lại camera."
        );
      }
    };

    const handlePageHide = () => {
      stopCameraTracks();
    };

    const handleDeviceChange = () => {
      void refreshCameraDevices();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [videoActive, recorderOpen, refreshCameraDevices, stopCameraTracks, stopRecordClock]);

  const openCameraStream = useCallback(
    async (options?: {
      deviceId?: string;
      facingMode?: CameraFacingMode;
      exactFacing?: boolean;
      resetRecorded?: boolean;
    }) => {
      stopCameraTracks();
      videoRef.current?.pause();
      const request = cameraRequest.current;
      setCameraError(null);
      setRecorderOpen(true);
      setSwitchingCamera(true);
      if (options?.resetRecorded !== false) {
        setRecordedBlob(null);
        setRecordedPreviewUrl(null);
        setRecordMs(0);
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        setSwitchingCamera(false);
        setCameraError(
          "Trình duyệt này chưa hỗ trợ quay video trực tiếp (thiếu MediaDevices hoặc MediaRecorder). Bạn vẫn có thể dùng nút 'Tải video lên'."
        );
        return;
      }

      const targetFacing = options?.facingMode ?? cameraFacing;
      const targetDeviceId = options?.deviceId;

      const requestStream = async (
        constraints: MediaStreamConstraints
      ): Promise<MediaStream> => navigator.mediaDevices.getUserMedia(constraints);

      try {
        let stream: MediaStream;
        try {
          stream = await requestStream(
            buildCameraConstraints({
              deviceId: targetDeviceId,
              facingMode: targetFacing,
              exactFacing: options?.exactFacing,
            })
          );
        } catch (firstErr) {
          const firstName = firstErr instanceof Error ? firstErr.name : "";
          const canFallback =
            !targetDeviceId &&
            (firstName === "OverconstrainedError" || firstName === "NotFoundError");
          if (!canFallback) throw firstErr;

          const latestDevices =
            cameraDevices.length > 0 ? cameraDevices : await refreshCameraDevices();
          const altId = pickAlternateCameraDeviceId(
            latestDevices,
            selectedCameraId || null,
            targetFacing
          );
          if (altId) {
            stream = await requestStream(
              buildCameraConstraints({ deviceId: altId })
            );
          } else {
            stream = await requestStream(
              buildCameraConstraints({
                facingMode: targetFacing,
                exactFacing: false,
              })
            );
          }
        }

        if (request !== cameraRequest.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];
        const trackSettings = videoTrack?.getSettings?.();
        const detectedFacing = detectCameraFacing(
          trackSettings?.facingMode,
          videoTrack?.label
        );
        setActiveCameraFacing(detectedFacing);
        if (detectedFacing) {
          setCameraFacing(detectedFacing);
        } else if (!targetDeviceId) {
          setCameraFacing(targetFacing);
        }
        if (trackSettings?.deviceId) {
          setSelectedCameraId(trackSettings.deviceId);
        } else if (targetDeviceId) {
          setSelectedCameraId(targetDeviceId);
        }
        if (livePreviewRef.current) {
          livePreviewRef.current.srcObject = stream;
        }
        setCameraReady(true);
        setSwitchingCamera(false);
        void refreshCameraDevices();
      } catch (err) {
        if (request !== cameraRequest.current) return;
        setSwitchingCamera(false);
        void refreshCameraDevices();
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setCameraError(
            "Bạn đã từ chối quyền truy cập camera. Hãy cấp quyền camera trong cài đặt trình duyệt rồi thử lại, hoặc chọn 'Tải video lên'."
          );
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setCameraError(
            "Không tìm thấy camera phù hợp trên thiết bị này. Hãy thử chọn nguồn camera khác hoặc tải video lên."
          );
        } else if (name === "OverconstrainedError") {
          setCameraError(
            "Không thể chuyển sang camera yêu cầu trên thiết bị này. Hãy thử lại hoặc chọn nguồn camera khác."
          );
        } else {
          setCameraError(
            "Không thể mở camera lúc này (có thể đang được ứng dụng khác sử dụng). Hãy thử lại hoặc chọn nguồn camera khác."
          );
        }
      }
    },
    [cameraDevices, cameraFacing, refreshCameraDevices, selectedCameraId, stopCameraTracks]
  );

  const handleOpenCameraRecorder = () => {
    void openCameraStream({
      deviceId: selectedCameraId || undefined,
      facingMode: cameraFacing,
      resetRecorded: true,
    });
  };

  const cameraSwitchLocked = isCameraSwitchLocked({
    isRecording,
    countdownActive: countdownDeadline !== null,
    switching: switchingCamera,
  });

  const handleSwitchCameraFacing = () => {
    if (cameraSwitchLocked) return;
    const nextFacing = getOppositeFacingMode(activeCameraFacing ?? cameraFacing);
    setSelectedCameraId("");
    void openCameraStream({
      facingMode: nextFacing,
      exactFacing: true,
      resetRecorded: false,
    });
  };

  const handleSelectCameraDevice = (deviceId: string) => {
    if (cameraSwitchLocked) return;
    setSelectedCameraId(deviceId);
    void openCameraStream({
      deviceId: deviceId || undefined,
      facingMode: cameraFacing,
      resetRecorded: false,
    });
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

  useEffect(() => {
    if (!videoActive || !recorderOpen || countdownDeadline === null) return;
    const timer = setInterval(() => {
      const remaining = countdownDeadline - performance.now();
      if (remaining <= 0) {
        clearInterval(timer);
        setCountdownDeadline(null);
        handleStartRecording();
      } else {
        setCountdownSeconds(Math.ceil(remaining / 1000));
      }
    }, 50);
    const onVisibility = () => {
      if (document.hidden) setCountdownDeadline(null);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [videoActive, recorderOpen, countdownDeadline, handleStartRecording]);

  const startFromButton = () => {
    if (!useCountdown) {
      handleStartRecording();
      return;
    }
    clearHold();
    setCountdownSeconds(3);
    setCountdownDeadline(performance.now() + 3000);
  };

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
      if (event.code !== "Space" || !cameraReady || recordedPreviewUrl || cameraError || countdownDeadline !== null) return;
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
    settings.holdDelayMs, clearHold, handleStartRecording, handleStopRecording, countdownDeadline,
  ]);

  const cancelVideoScan = useCallback(() => {
    scanRef.current?.abort();
    scanRef.current = null;
  }, []);

  useEffect(() => {
    if (videoActive) return cancelVideoScan;
  }, [videoActive, cancelVideoScan]);

  const handleSelectVideoFile = (file: File, context: VideoSolveContext | null = null) => {
    cancelVideoScan();
    setAnalyzingVideo(false);
    setVideoDuration(null);
    setVideoError(null);
    setPlaybackRate(1);
    setDraftMessage(null);
    setDraftStartedAt(Date.now());
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
    return nextUrl;
  };

  const discardDraft = () => {
    onRequestConfirm({
      title: "Xóa bản nháp video?",
      description: "Clip và các mốc đã lưu trên thiết bị này sẽ bị xóa khỏi Video Analyzer.",
      confirmLabel: "Xóa bản nháp",
      onConfirm: async () => {
        cancelVideoScan();
        setAnalyzingVideo(false);
        try {
          await saveVideoDraft(null);
          setVideoUrl(null);
          setVideoFile(null);
          setVideoName("");
          setVideoDuration(null);
          setClipContext(null);
          setMotionWaveform([]);
          setVideoError(null);
          setDraftStartedAt(null);
          setDraftMessage(null);
        } catch {
          setDraftMessage("Không xóa được bản nháp. Hãy thử lại.");
        }
      },
    });
  };

  const stampVideoPhase = (phase: VideoPhase, time: number) => {
    setVideoMarksSec((prev) => ({ ...prev, [phase]: time }));
    setMarkOrigins((prev) => ({ ...prev, [phase]: "user" }));
  };

  const handleAnalyzeRecordedClip = () => {
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
    void runClientCvMotionScan(handleSelectVideoFile(file, recordingContext.current));
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!videoActive || !videoUrl || !video) return;
    const controller = new AbortController();
    const scanning = scanRef.current !== null;
    void resolveVideoDuration(video, controller.signal).then((duration) => {
      if (controller.signal.aborted) return;
      if (duration !== null) {
        setVideoDuration(duration);
      } else if (!scanning && !scanRef.current) {
        setVideoError("Chưa xác định được thời lượng clip. Hãy bấm Phân tích để thử lại.");
      }
    });
    return () => controller.abort();
  }, [videoActive, videoUrl]);

  // On-Device Computer Vision: Samples frames from video to detect hand/cube motion & lookahead pauses
  const runClientCvMotionScan = async (source: string) => {
    if (scanRef.current) return;
    const controller = new AbortController();
    scanRef.current = controller;
    const { signal } = controller;
    setAnalyzingVideo(true);
    setVideoError(null);

    const vid = document.createElement("video");
    vid.preload = "auto";
    vid.src = source;
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
  const clipPuzzle = clipContext?.puzzle;
  const splitBaseline = useMemo(() => clipPuzzle && draftStartedAt !== null
    ? getRecentSplitMedians(solves, clipPuzzle, draftStartedAt)
    : null, [solves, clipPuzzle, draftStartedAt]);

  const seekToPhase = (index: number) => {
    const phase = videoPhases[index];
    setSelectedPhase(phase);
    const video = videoRef.current;
    const stamp = videoMarksSec[phase];
    if (!video || stamp === null) return;
    video.pause();
    video.currentTime = stamp;
    video.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const handleDownloadRecordedClip = () => {
    if (!recordedBlob) return;
    const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    const filename = `ruktimer-solve-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-")}.${ext}`;
    triggerBlobDownload(recordedBlob, filename);
  };

  const handleDownloadCurrentVideo = () => {
    if (!videoFile) return;
    triggerBlobDownload(videoFile, videoName || videoFile.name || "ruktimer-clip.webm");
  };

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
  const [videoUploadMessage, setVideoUploadMessage] = useState<string | null>(null);
  const [previewVaultFile, setPreviewVaultFile] = useState<UserFileRecord | null>(
    null
  );

  useEffect(() => {
    if (!active || subTab !== "files") {
      setPreviewVaultFile(null);
    }
  }, [active, subTab]);

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
    kind: "video" | "backup" | "other",
    feedbackTarget: "video" | "files" = "files"
  ) => {
    if (!userId) {
      onOpenAuth();
      return;
    }
    const setFeedback =
      feedbackTarget === "video" ? setVideoUploadMessage : setR2StatusMessage;
    setR2Uploading(true);
    setFeedback(null);
    try {
      const error = await uploadPrivateFile(blob, filename, kind);
      if (error) {
        setFeedback(error);
        return;
      }

      setFeedback(`Đã lưu riêng tư "${filename}" lên kho R2.`);
      await loadR2Files();
    } catch {
      setFeedback("Không thể hoàn tất lưu tệp. Hãy thử lại.");
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
          setPreviewVaultFile((current) =>
            current?.id === file.id ? null : current
          );
          setR2StatusMessage(`Đã xóa "${file.filename}".`);
        }
      },
    });
  };

  const isVideoIntake = !recorderOpen && !videoUrl;
  const firstActivityDay = streakData.heatmapDays[0]?.date;
  const visibleActiveDays = streakData.heatmapDays.filter((day) => day.count > 0).length;
  const firstActivityRow = firstActivityDay
    ? ((new Date(firstActivityDay).getUTCDay() + 6) % 7) + 1
    : 1;

  if (!active) return null;

  return (
    <main className="rk-view space-y-4">
      <nav aria-label="Phân tích và luyện tập" className="grid grid-cols-2 gap-x-2 border-b border-white/10 sm:flex">
        {([
          { id: "coach", label: "AI Coach", icon: BrainCircuit },
          { id: "weekly", label: "Báo cáo tuần", icon: Flame },
          { id: "video", label: "Video Analyzer", icon: Video },
          { id: "files", label: "Kho tệp cá nhân", icon: FolderLock },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={subTab === id ? "page" : undefined}
            onClick={() => setSubTab(id)}
            className="flex min-h-11 items-center gap-2 border-b-2 border-transparent px-2 py-2 text-left text-sm font-medium text-slate-300 hover:text-white focus-visible:outline-offset-[-2px] aria-[current=page]:border-cyan-300 aria-[current=page]:text-white sm:px-3"
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* ==================================================================== */}
      {/* TAB 1: HYBRID AI PRACTICE COACH & GUIDED F2L WORKOUT                 */}
      {/* ==================================================================== */}
      {subTab === "coach" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Diagnosis Summary & Actionable Practice Plan */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rk-panel p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>Phân tích phong độ</span>
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
            <div className="rk-panel p-5 space-y-3">
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
            <div className="rk-panel p-5 space-y-3">
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

            <div className="rk-panel p-5 space-y-3">
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
        <section className="space-y-4" aria-labelledby="weekly-report-title">
          <header className="space-y-2 px-1">
            <h1 id="weekly-report-title" className="text-xl font-semibold text-white">Báo cáo tuần</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
              <span className="font-mono tabular-nums">
                {coachReport.weeklyComparison.weekStart} → {coachReport.weeklyComparison.today}
              </span>
              <span>{coachReport.weeklyComparison.elapsedDays}/7 ngày</span>
            </p>
          </header>

          <div className="rk-panel grid grid-cols-2 overflow-hidden [&>div]:min-w-0 [&>div]:p-3 sm:[&>div]:p-4 lg:grid-cols-4">
            <div className="border-b border-r border-white/10 lg:border-b-0">
              <div className="text-xs text-slate-400">Chuỗi ngày luyện tập</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white sm:text-2xl">
                <span>{streakData.currentStreak} ngày</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Kỷ lục chuỗi dài nhất: {streakData.longestStreak} ngày • Hôm nay:{" "}
                {streakData.todayCount} lượt
              </div>
            </div>

            <div className="border-b border-white/10 lg:border-b-0 lg:border-r">
              <div className="text-xs text-slate-400">
                Lượt luyện tuần này
              </div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-white sm:text-2xl">
                {coachReport.weeklyComparison.thisWeekPracticeCount} lượt
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Cùng kỳ tuần trước: {coachReport.weeklyComparison.lastWeekPracticeCount} lượt (cả tuần trước: {coachReport.weeklyComparison.lastWeekFullCount})
              </div>
            </div>

            <div className="border-r border-white/10">
              <div className="text-xs text-slate-400">
                Mean phiên chính
              </div>
              <div className="mt-1 break-words font-mono text-lg font-semibold tabular-nums text-white sm:text-2xl">
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

            <div>
              <div className="text-xs text-slate-400">
                Single tốt nhất tuần
              </div>
              <div className="mt-1 break-words font-mono text-lg font-semibold tabular-nums text-white sm:text-2xl">
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

          {coachReport.weeklyComparison.thisWeekPracticeCount === 0 && (
            <p className="px-1 text-sm text-slate-300">Chưa có lượt luyện trong tuần này.</p>
          )}
          <details className="px-1 text-sm text-slate-300">
            <summary className="w-fit cursor-pointer rounded py-2 underline-offset-4 hover:underline">Cách tính số liệu</summary>
            <p className="max-w-prose text-pretty pb-2">
              Tuần bắt đầu vào Thứ Hai và được so sánh cùng số ngày với tuần trước.
              Hoạt động và chuỗi luyện tập tính mọi lượt. Mean chỉ tính phiên giải chính.
            </p>
          </details>

          {/* 12-Week (84 Days) Activity Heatmap */}
          <div className="rk-panel rk-report-section space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Lịch luyện tập 84 ngày</h2>
              <span className="text-xs text-slate-400">{visibleActiveDays}/84 ngày có lượt luyện</span>
            </div>

            <div className="flex max-w-xl gap-2">
              <div aria-hidden="true" className="grid grid-rows-7 gap-1 text-xs text-slate-400">
                {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
                  <span key={day} className="self-center">{day}</span>
                ))}
              </div>
              <ul role="list" aria-label="Số lượt luyện theo ngày" className="grid flex-1 auto-cols-fr grid-flow-col grid-rows-7 gap-1">
                {streakData.heatmapDays.map((day, index) => (
                  <li
                    key={day.date}
                    style={index === 0 ? { gridRowStart: firstActivityRow } : undefined}
                    title={`${day.date}: ${day.count} lượt luyện`}
                    className={`min-h-4 rounded-sm sm:min-h-5 ${[
                      "bg-white/5",
                      "bg-cyan-300/25",
                      "bg-cyan-300/50",
                      "bg-cyan-300/75",
                      "bg-cyan-300",
                    ][day.level]} ${index === streakData.heatmapDays.length - 1 ? "ring-1 ring-inset ring-white/70" : ""}`}
                  >
                    <span className="sr-only">{day.date}: {day.count} lượt luyện</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-400">Ô sáng hơn có nhiều lượt luyện hơn. Viền trắng đánh dấu hôm nay.</p>
          </div>

          {/* Personal Achievements & Badges */}
          <div className="rk-panel p-4 sm:p-5">
            <h2 className="text-base font-semibold">Thành tựu</h2>
            <ul role="list" className="mt-2 divide-y divide-white/10">
              {achievements.map((ach) => (
                <li
                  key={ach.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{ach.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{ach.description}</p>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-slate-300">
                    {ach.unlocked && <CheckCircle2 aria-label="Đã đạt" className="size-4 shrink-0 text-emerald-300" />}
                    {ach.progressText}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: VIDEO ANALYZER + DIRECT CAMERA RECORDING                      */}
      {/* ==================================================================== */}
      {subTab === "video" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 min-w-0 rk-panel p-3 sm:p-5 space-y-3">
            <div className={isVideoIntake
              ? "space-y-4 border-b border-white/10 px-1 pb-4 sm:pb-5"
              : "flex flex-wrap items-center justify-between gap-2"}>
              <div className="min-w-0 space-y-1">
                <h1 className={isVideoIntake ? "text-xl font-semibold text-white sm:text-2xl" : "text-lg font-semibold text-white"}>
                  Video Analyzer
                </h1>
                {isVideoIntake && (
                  <p className="max-w-prose text-pretty text-sm text-slate-300">
                    RukTimer tự ước lượng các mốc CFOP khi bạn mở clip.
                  </p>
                )}
              </div>

              <div className={isVideoIntake
                ? "grid gap-2 min-[420px]:flex min-[420px]:flex-wrap"
                : "flex flex-wrap items-center gap-2"}>
                <label className={`${isVideoIntake ? "rk-primary justify-center" : "rk-control"} relative cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cyan-300 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`}>
                  <Upload className="size-4 shrink-0" aria-hidden="true" />
                  <span>Mở clip để phân tích</span>
                  <input
                    type="file"
                    accept="video/*"
                    disabled={isRecording || !draftReady}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        stopCameraTracks();
                        setRecorderOpen(false);
                        setRecordedPreviewUrl(null);
                        setRecordedBlob(null);
                        setVideoUploadMessage(null);
                        void runClientCvMotionScan(handleSelectVideoFile(f));
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={recorderOpen || !draftReady}
                  onClick={handleOpenCameraRecorder}
                  className="rk-control justify-center disabled:opacity-50"
                >
                  <Camera className="size-4 shrink-0" aria-hidden="true" />
                  <span>Quay video</span>
                </button>
              </div>
            </div>

            {/* Recording Scramble & Recording Clock — Shown when recording or before loading a clip */}
            {(recorderOpen || !videoUrl) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="min-w-0 flex-[1_1_13rem] space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2">
                    <span className="text-xs font-semibold text-slate-300">
                      Scramble quay mới ·{" "}
                      {sessions.find((session) => session.id === displayedContext.sessionId)?.name ??
                        activeSession.name}
                    </span>
                    <button
                      type="button"
                      disabled={scrambleLocked}
                      onClick={() =>
                        setNextScramble({
                          ...currentContext,
                          scramble: generateScramble(puzzle),
                        })
                      }
                      className="min-h-10 rounded-lg px-2 text-xs font-semibold text-cyan-200 hover:bg-white/10 disabled:opacity-50"
                    >
                      Scramble mới
                    </button>
                  </div>
                  <p className="break-words text-sm font-mono text-white">
                    {displayedContext.scramble}
                  </p>
                </div>
                {displayedContext.scramble && (
                  <CubeNetPreview
                    puzzle={displayedContext.puzzle}
                    scramble={displayedContext.scramble}
                    compact
                  />
                )}
                {recorderOpen && (
                  <div className="space-y-0.5 text-right">
                    <div className="text-xs text-slate-300">Thời gian ghi hình</div>
                    <div
                      data-testid="recording-time"
                      className="font-mono text-xl tabular-nums text-white"
                    >
                      {formatTimeMs(recordMs, settings.decimals)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Direct Camera Recorder Panel */}
            {recorderOpen && (
              <div className="rounded-xl bg-black/50 border border-emerald-500/35 p-3 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Quay trực tiếp (không ghi âm)</span>
                    </span>
                    {getCameraFacingLabel(activeCameraFacing) && (
                      <span
                        data-testid="active-camera-facing"
                        className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-[11px] font-medium text-cyan-200"
                      >
                        {getCameraFacingLabel(activeCameraFacing)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraTracks();
                      setRecorderOpen(false);
                      setRecordedBlob(null);
                      setRecordedPreviewUrl(null);
                    }}
                    className="min-h-10 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200"
                  >
                    Đóng camera
                  </button>
                </div>

                {/* Camera Switch (Mobile Front/Back) + Camera Source Selector (Desktop/Laptop) */}
                {!recordedPreviewUrl && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={cameraSwitchLocked}
                      onClick={handleSwitchCameraFacing}
                      aria-label="Đổi camera trước và sau"
                      className="min-h-11 px-3 py-2 rounded-lg border border-white/15 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs font-semibold text-slate-100 inline-flex items-center gap-1.5 transition"
                    >
                      <SwitchCamera className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />
                      <span>{switchingCamera ? "Đang đổi camera..." : "Đổi camera"}</span>
                    </button>

                    {cameraDevices.length > 0 && (
                      <label className="flex items-center gap-1.5 flex-1 min-w-[180px]">
                        <span className="sr-only">Chọn nguồn camera</span>
                        <select
                          aria-label="Chọn nguồn camera"
                          value={selectedCameraId}
                          disabled={cameraSwitchLocked}
                          onChange={(event) =>
                            handleSelectCameraDevice(event.currentTarget.value)
                          }
                          className="min-h-11 w-full rounded-lg border border-white/15 bg-slate-900 px-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                        >
                          <option value="">Tự động (Camera mặc định)</option>
                          {cameraDevices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}

                {cameraError ? (
                  <div
                    role="alert"
                    className="rounded-xl bg-rose-500/15 border border-rose-400/35 p-3 text-xs text-rose-200 space-y-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{cameraError}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={switchingCamera}
                        onClick={() =>
                          void openCameraStream({
                            deviceId: selectedCameraId || undefined,
                            facingMode: cameraFacing,
                            resetRecorded: false,
                          })
                        }
                        className="min-h-10 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/20 text-white font-semibold inline-flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Thử lại</span>
                      </button>
                    </div>
                  </div>
                ) : recordedPreviewUrl ? (
                  <div className="space-y-3">
                    <video
                      src={recordedPreviewUrl}
                      controls
                      playsInline
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
                        className="min-h-10 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Quay lại</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadRecordedClip}
                        className="min-h-10 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-cyan-200 text-xs font-medium inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Tải clip về máy</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAnalyzeRecordedClip}
                        className="rk-primary"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Phân tích clip</span>
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
                        className="w-full max-h-[min(32vh,300px)] sm:max-h-[300px] object-contain"
                      />
                      {isRecording && (
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-rose-600 text-white font-mono text-xs font-bold">
                          Đang quay
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      {countdownDeadline !== null ? (
                        <>
                          <output aria-live="polite" className="text-2xl font-bold tabular-nums">
                            {countdownSeconds}
                          </output>
                          <button
                            type="button"
                            onClick={() => setCountdownDeadline(null)}
                            className="min-h-11 rounded-lg bg-white/10 px-3 text-xs hover:bg-white/15"
                          >
                            Hủy đếm ngược
                          </button>
                        </>
                      ) : !isRecording ? (
                        <button
                          type="button"
                          disabled={!cameraReady || !currentContext.scramble || switchingCamera}
                          onClick={startFromButton}
                          className="min-h-11 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Bắt đầu quay</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStopRecording}
                          className="min-h-11 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Dừng quay</span>
                        </button>
                      )}
                    </div>
                    {cameraReady && !isRecording && countdownDeadline === null && (
                      <label className="flex min-h-11 items-center justify-center gap-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={useCountdown}
                          onChange={(event) => setUseCountdown(event.currentTarget.checked)}
                          className="h-4 w-4 accent-cyan-400"
                        />
                        Đếm ngược 3 giây khi bấm nút quay
                      </label>
                    )}
                    {countdownDeadline === null && (
                      <p
                        role="status"
                        className={`text-center text-xs text-slate-300 ${
                          cameraReady ? "[@media(pointer:coarse)]:sr-only" : ""
                        }`}
                      >
                        {!cameraReady
                          ? "Đang chờ camera…"
                          : isRecording
                          ? "Bấm Space để dừng quay."
                          : holdState === "ready"
                          ? "Nhả Space để bắt đầu quay."
                          : holdState === "holding"
                          ? "Tiếp tục giữ Space…"
                          : "Giữ rồi nhả Space để bắt đầu quay."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!videoUrl && draftMessage && (
              <p role="status" className="text-xs text-slate-300">
                {draftMessage}
              </p>
            )}
            {videoUrl && (
              <div hidden={recorderOpen} className="space-y-3">
                {/* Unified Video Player + Timeline CFOP Cluster */}
                <div className="rounded-xl overflow-hidden bg-black/45 border border-white/15">
                  <div className="bg-black">
                    <video
                      key={videoUrl}
                      ref={videoRef}
                      src={videoUrl}
                      playsInline
                      preload="metadata"
                      onClick={() => {
                        const video = videoRef.current;
                        if (!video || !videoDuration) return;
                        if (video.paused || video.ended) {
                          void video.play().catch(() => {});
                        } else {
                          video.pause();
                        }
                      }}
                      className="w-full max-h-[34svh] sm:max-h-[340px] object-contain cursor-pointer"
                    />
                  </div>
                  <div className="border-t border-white/10">
                    <VideoTimeline
                      key={videoUrl}
                      videoRef={videoRef}
                      duration={videoDuration}
                      marks={videoMarksSec}
                      origins={markOrigins}
                      decimals={settings.decimals}
                      playbackRate={playbackRate}
                      selectedPhase={selectedPhase}
                      onSelectPhase={setSelectedPhase}
                      onPlaybackRateChange={(rate) => {
                        setPlaybackRate(rate);
                        if (videoRef.current) {
                          videoRef.current.playbackRate = rate;
                        }
                      }}
                      onStamp={stampVideoPhase}
                    />
                  </div>
                </div>

                {videoError && (
                  <p role="alert" className="text-xs text-rose-200">
                    {videoError}
                  </p>
                )}

                <span role="status" className="sr-only">
                  {analyzingVideo ? "Đang phân tích clip." : motionWaveform.length > 0 ? "Đã phân tích clip. Có thể kiểm tra các mốc." : ""}
                </span>

                {/* Consolidated Clip Details & CV Scan */}
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate max-w-[260px] sm:max-w-[380px]">
                        {videoName || "Clip chưa đặt tên"}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {videoFile ? formatBytes(videoFile.size) : ""}
                        {videoDuration !== null
                          ? ` • Thời lượng video: ${formatTimeMs(
                              videoDuration * 1000,
                              settings.decimals
                            )}`
                          : ""}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={analyzingVideo}
                      onClick={() => void runClientCvMotionScan(videoUrl)}
                      className="min-h-10 px-3 py-1.5 rounded-xl bg-indigo-500/25 hover:bg-indigo-500/35 border border-indigo-400/50 text-indigo-200 font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <BrainCircuit className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
                      <span>
                        {analyzingVideo
                          ? "Đang phân tích…"
                          : motionWaveform.length ? "Phân tích lại" : "Phân tích"}
                      </span>
                    </button>
                  </div>

                  {clipContext && (
                    <div className="space-y-1 border-t border-white/10 pt-2 text-slate-300">
                      <p>
                        <span className="text-slate-400">Phiên đích:</span>{" "}
                        <span className={targetSession ? "text-slate-100" : "text-rose-300"}>
                          {targetSession?.name ?? "Phiên không còn khả dụng"}
                        </span>{" "}
                        · {clipContext.puzzle.toUpperCase()}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words flex-1 min-w-0">
                          <span className="text-slate-400">Scramble:</span>{" "}
                          <span className="font-mono text-slate-100">
                            {clipContext.scramble || "Chưa gán"}
                          </span>
                        </p>
                        {!clipContext.scramble && (
                          <button
                            type="button"
                            disabled={
                              !currentContext.scramble ||
                              clipContext.puzzle !== puzzle ||
                              recorderOpen
                            }
                            onClick={() =>
                              setClipContext({
                                ...clipContext,
                                scramble: currentContext.scramble,
                              })
                            }
                            className="min-h-9 rounded-lg bg-white/10 px-2.5 text-cyan-200 hover:bg-white/15 disabled:opacity-50"
                          >
                            Gán scramble hiện tại
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-slate-400">
                    <p role="status" className="text-[11px]">
                      {draftMessage ?? "Đang lưu bản nháp trên thiết bị…"}
                    </p>
                    <button
                      type="button"
                      onClick={discardDraft}
                      className="min-h-9 rounded-lg px-2 text-rose-300 hover:bg-rose-500/15 font-medium"
                    >
                      Xóa bản nháp
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: CV Motion Waveform, Stage Breakdown & Clip Export/R2 Save */}
          <div className="lg:col-span-5 min-w-0 rk-panel p-4 sm:p-5 space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Kết quả bóc tách CFOP</span>
            </h2>

            {markError && (
              <p role="alert" className="rounded-lg bg-rose-500/15 border border-rose-400/35 px-3 py-2 text-xs text-rose-200">
                {markError}
              </p>
            )}

            {motionWaveform.length > 0 && (
              <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="font-semibold text-cyan-300">
                    Cường độ chuyển động tay (CV)
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
                  Phát hiện{" "}
                  <strong className="text-rose-300">
                    {motionWaveform.filter((p) => p.isPause).length} khoảng giảm tốc/dừng tay
                  </strong>
                  .
                </p>
              </div>
            )}

            {videoStageDurationsMs ? (
              <div className="rounded-xl bg-black/35 border border-emerald-500/30 p-3.5 sm:p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-emerald-300">
                    Thời gian lượt giải:
                  </span>
                  <strong className="font-mono text-xl tabular-nums text-white">
                    {formatTimeMs(
                      videoStageDurationsMs.totalMs,
                      settings.decimals
                    )}
                  </strong>
                </div>

                {hasUnconfirmedSuggestedMarks && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-400/30 px-2.5 py-1.5 text-[11px] text-amber-200">
                    Một số mốc đang là <strong>Hệ thống gợi ý</strong>. Hãy kiểm tra và bấm chốt lại trên timeline nếu cần.
                  </div>
                )}

                <p className="text-xs text-slate-300">
                  {splitBaseline
                    ? `So với trung vị ${splitBaseline.count} lượt gần nhất có đủ split cùng bộ môn`
                    : "Chưa có lượt cùng bộ môn với đủ split để so sánh."}
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  {["1. Cross", "2. F2L", "3. OLL", "4. PLL"].map(
                    (label, idx) => {
                      const ms = videoStageDurationsMs.splitsMs[idx];
                      const pct = Math.round(
                        (ms / videoStageDurationsMs.totalMs) * 100
                      );
                      const delta = splitBaseline ? ms - splitBaseline.medians[idx] : null;
                      return (
                        <div
                          key={label}
                          className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5"
                        >
                          <div className="text-[11px] font-sans text-slate-400">
                            {label}
                          </div>
                          <div className="text-sm font-bold text-cyan-300 mt-0.5 tabular-nums">
                            {formatTimeMs(ms, settings.decimals)} ({pct}%)
                          </div>
                          {delta !== null && (
                            <p className="mt-1 text-[11px] font-sans text-slate-300">
                              {Math.abs(delta) < 10
                                ? "Ngang trung vị"
                                : `${delta > 0 ? "Chậm hơn" : "Nhanh hơn"} ${formatTimeMs(
                                    Math.abs(delta),
                                    2
                                  )}s`}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => seekToPhase(idx)}
                            disabled={recorderOpen}
                            className="mt-1 min-h-9 rounded-lg text-xs font-sans text-cyan-200 hover:underline disabled:opacity-50"
                          >
                            Xem pha {label.slice(3)}
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>

                <button
                  type="button"
                  disabled={!targetSession || analyzingVideo}
                  onClick={() =>
                    clipContext &&
                    targetSession &&
                    onSaveVideoAnalyzedSolve(
                      videoStageDurationsMs.totalMs,
                      videoStageDurationsMs.splitsMs,
                      `Phân tích Video: ${videoName || "Solve"}`,
                      clipContext
                    )
                  }
                  className="min-h-11 w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition disabled:opacity-50"
                >
                  Lưu lượt giải & 4 mốc Split
                </button>
              </div>
            ) : (
              <div className="rounded-xl bg-black/30 border border-white/10 p-4 text-xs text-slate-400 leading-relaxed">
                {videoUrl
                  ? "Chốt đủ 5 mốc Start → Cross → F2L → OLL → PLL trên timeline (hoặc bấm Quét chuyển động) để tính thời gian lượt giải."
                  : "Nạp hoặc quay một clip bên cạnh để bắt đầu tách 4 pha CFOP."}
              </div>
            )}

            {/* Distinct Clip Export (Device) & Private R2 Cloud Upload */}
            {videoFile && (
              <div className="rounded-xl bg-black/35 border border-white/10 p-3.5 space-y-2.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCurrentVideo}
                    className="min-h-11 px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-slate-100 font-semibold inline-flex items-center justify-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-300 shrink-0" aria-hidden="true" />
                    <span>Tải clip về máy</span>
                  </button>

                  <button
                    type="button"
                    disabled={r2Uploading}
                    onClick={() =>
                      uploadBlobToR2(videoFile, videoFile.name, "video", "video")
                    }
                    className="min-h-11 px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 font-semibold inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {r2Uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                    ) : (
                      <CloudUpload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      {userId
                        ? r2Uploading
                          ? "Đang lưu lên R2..."
                          : "Lưu clip lên kho R2"
                        : "Đăng nhập để lưu R2"}
                    </span>
                  </button>
                </div>
                {videoUploadMessage && (
                  <p role="status" className="text-[11px] text-cyan-300">
                    {videoUploadMessage}
                  </p>
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
        <div className="rk-panel p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <FolderLock className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
                <span>Kho tệp cá nhân</span>
              </h2>
              <p className="text-xs text-slate-400">
                Video và bản sao lưu của tài khoản này.
                {r2Mode && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-white/10 text-cyan-300 font-mono text-[10px]">
                    {r2Mode === "r2" ? "R2" : "Kho cục bộ"}
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
                    uploadBlobToR2(blob, fname, "backup", "files");
                  }}
                  className="min-h-10 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition"
                >
                  {r2Uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>Sao lưu JSON hiện tại lên kho R2</span>
                </button>
              </div>
            )}
          </div>

          {r2StatusMessage && (
            <div
              role="status"
              className="rounded-xl bg-cyan-500/10 border border-cyan-400/30 px-3.5 py-2 text-xs text-cyan-200"
            >
              {r2StatusMessage}
            </div>
          )}

          {!userId ? (
            <div className="rounded-xl bg-black/35 border border-white/10 p-6 text-center space-y-3">
              <FolderLock className="w-8 h-8 text-cyan-400 mx-auto opacity-80" aria-hidden="true" />
              <p className="text-sm font-semibold text-white">
                Đăng nhập để sử dụng Kho tệp cá nhân riêng tư
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Mọi video và bản sao lưu trong kho được phân quyền theo tài khoản đăng nhập. Bạn vẫn có thể phân tích video và xuất file sao lưu trực tiếp trên máy ở chế độ Guest.
              </p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="min-h-10 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                Đăng nhập tài khoản
              </button>
            </div>
          ) : r2Loading ? (
            <div className="py-10 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" aria-hidden="true" />
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
                  className="px-3.5 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate max-w-[360px]">
                      {file.filename}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Loại: {file.kind.toUpperCase()} •{" "}
                      {formatBytes(file.size_bytes)} •{" "}
                      {new Date(file.created_at).toLocaleString("vi-VN")}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {file.kind === "video" && (
                      <button
                        type="button"
                        onClick={() => setPreviewVaultFile(file)}
                        className="min-h-10 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-semibold inline-flex items-center gap-1.5 transition"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Xem video</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadR2File(file)}
                      className="min-h-10 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-cyan-200 font-medium inline-flex items-center gap-1.5 transition"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Tải xuống</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteR2File(file)}
                      className="min-h-10 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 font-medium inline-flex items-center gap-1.5 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <VaultVideoPreviewModal
        file={previewVaultFile}
        onClose={() => setPreviewVaultFile(null)}
        onDownload={handleDownloadR2File}
      />
    </main>
  );
}
