"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ImageDown,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import CubeNetPreview from "@/components/CubeNetPreview";
import {
  countAlgMoves,
  solveOptimalCross,
  tokenizeAlgorithm,
} from "@/lib/scrambles";
import {
  formatSolveDisplay,
  formatTimeMs,
  generateAverageShareText,
  getEffectiveMs,
} from "@/lib/stats";
import { PenaltyType, Solve } from "@/types/cubing";

export type DetailModalTarget =
  | { type: "solve"; solve: Solve; indexNumber?: number }
  | {
      type: "average";
      label: string;
      avgValue: number | "DNF";
      solves: Solve[];
    };

interface SolveDetailModalProps {
  target: DetailModalTarget | null;
  decimals: 2 | 3;
  onClose: () => void;
  onUpdateSolvePenalty: (solveId: string, penalty: PenaltyType) => void;
  onUpdateSolveComment: (
    solveId: string,
    comment: string,
    reconstruction?: string
  ) => void;
  onDeleteSolve: (solveId: string) => void;
}

const SPLIT_STAGE_NAMES = ["1. Cross", "2. F2L", "3. OLL", "4. PLL"] as const;

/**
 * Generates and downloads a crisp 1080x580 PNG Visual Share Card using HTML5 Canvas.
 */
function downloadAchievementPngCard(opts: {
  title: string;
  mainTimeText: string;
  subtitle: string;
  scrambleOrList: string;
  footerMeta: string;
}) {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 580;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 1080, 580);
  grad.addColorStop(0, "#020617");
  grad.addColorStop(0.5, "#0f172a");
  grad.addColorStop(1, "#082f49");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 580);

  // Border frame
  ctx.strokeStyle = "rgba(34, 211, 238, 0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 1032, 532);

  // Brand header
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 30px monospace";
  ctx.fillText("RukTimer • WCA Speedcubing & CFOP Platform", 60, 82);

  // Title badge
  ctx.fillStyle = "#22d3ee";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(opts.title, 60, 145);

  // Giant Time Display
  ctx.fillStyle = "#34d399";
  ctx.font = "bold 118px monospace";
  ctx.fillText(opts.mainTimeText, 60, 275);

  // Subtitle
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "22px sans-serif";
  ctx.fillText(opts.subtitle, 60, 325);

  // Scramble / Times Box
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(60, 355, 960, 130);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "20px monospace";

  const words = opts.scrambleOrList.split(/\s+/);
  let line = "";
  let y = 395;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > 910) {
      ctx.fillText(line, 82, y);
      line = w;
      y += 32;
      if (y > 465) break;
    } else {
      line = test;
    }
  }
  if (line && y <= 465) {
    ctx.fillText(line, 82, y);
  }

  // Footer
  ctx.fillStyle = "#94a3b8";
  ctx.font = "18px sans-serif";
  ctx.fillText(opts.footerMeta, 60, 525);

  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `ruktimer-${Date.now()}.png`;
  a.click();
}

export default function SolveDetailModal({
  target,
  decimals,
  onClose,
  onUpdateSolvePenalty,
  onUpdateSolveComment,
  onDeleteSolve,
}: SolveDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [commentDraft, setCommentDraft] = useState(
    target?.type === "solve" ? target.solve.comment : ""
  );
  const [reconDraft, setReconDraft] = useState(
    target?.type === "solve" ? target.solve.reconstruction || "" : ""
  );
  const [replayStep, setReplayStep] = useState<number>(0);
  const [isPlayingReplay, setIsPlayingReplay] = useState(false);

  useEffect(() => {
    if (target?.type === "solve") {
      setCommentDraft(target.solve.comment || "");
      const initialRecon = target.solve.reconstruction || "";
      setReconDraft(initialRecon);
      setReplayStep(tokenizeAlgorithm(initialRecon).length);
      setIsPlayingReplay(false);
    }
    setCopied(false);
  }, [target]);

  const reconTokens = useMemo(
    () => tokenizeAlgorithm(reconDraft),
    [reconDraft]
  );

  // Auto-advance step when Solve Replay is playing
  useEffect(() => {
    if (!isPlayingReplay) return;
    if (replayStep >= reconTokens.length) {
      setIsPlayingReplay(false);
      return;
    }
    const timer = setTimeout(() => {
      setReplayStep((s) => Math.min(reconTokens.length, s + 1));
    }, 450);
    return () => clearTimeout(timer);
  }, [isPlayingReplay, replayStep, reconTokens.length]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [target, onClose]);

  if (!target) return null;

  const copyText = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  if (target.type === "solve") {
    const { solve, indexNumber } = target;
    const shareLine = `${formatSolveDisplay(solve, decimals)} — ${
      solve.scramble
    }${solve.comment ? ` [${solve.comment}]` : ""}`;

    const replayScrambleState =
      reconTokens.length > 0
        ? `${solve.scramble} ${reconTokens.slice(0, replayStep).join(" ")}`
        : solve.scramble;

    const effMs = getEffectiveMs(solve);
    const reconStm = countAlgMoves(reconDraft);
    const reconTps =
      typeof effMs === "number" && effMs > 0 && reconStm > 0
        ? (reconStm / (effMs / 1000)).toFixed(2)
        : null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết lượt giải ${solve.puzzle.toUpperCase()}`}
          className="w-full max-w-xl max-h-[90vh] overflow-y-auto rk-dialog text-white p-5 sm:p-6 relative space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-wrap items-baseline justify-between gap-2 pr-8">
            <div>
              <div className="font-mono text-4xl font-bold tabular-nums">
                {formatSolveDisplay(solve, decimals)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Lượt giải {indexNumber ? `#${indexNumber}` : ""} •{" "}
                {solve.puzzle.toUpperCase()} •{" "}
                {new Date(solve.solved_at).toLocaleString("vi-VN")}
              </div>
            </div>

            {reconTps && (
              <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-semibold">
                {reconStm} STM • {reconTps} TPS
              </span>
            )}
          </div>

          {/* Penalty, Share Text & PNG Card Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {(["OK", "+2", "DNF"] as PenaltyType[]).map((pen) => (
              <button
                key={pen}
                type="button"
                onClick={() => onUpdateSolvePenalty(solve.id, pen)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                  solve.penalty === pen
                    ? pen === "DNF"
                      ? "bg-rose-500 text-white border-rose-500"
                      : pen === "+2"
                      ? "bg-amber-400 text-slate-950 border-amber-400"
                      : "bg-emerald-400 text-slate-950 border-emerald-400"
                    : "bg-white/5 border-white/10 hover:bg-white/10"
                }`}
              >
                {pen}
              </button>
            ))}

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => copyText(shareLine)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium inline-flex items-center gap-1.5 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Đã copy</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                downloadAchievementPngCard({
                  title: `THÀNH TÍCH GIẢI ĐƠN (${solve.puzzle.toUpperCase()})`,
                  mainTimeText: formatSolveDisplay(solve, decimals),
                  subtitle: solve.comment
                    ? `Ghi chú: "${solve.comment}"`
                    : `Lượt giải #${indexNumber || 1} trên RukTimer`,
                  scrambleOrList: `Scramble: ${solve.scramble}`,
                  footerMeta: `Ngày giải: ${new Date(
                    solve.solved_at
                  ).toLocaleString("vi-VN")} • ruk-timer.vercel.app`,
                })
              }
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <ImageDown className="w-3.5 h-3.5" />
              <span>Tải Ảnh PNG</span>
            </button>

            <button
              type="button"
              onClick={() => onDeleteSolve(solve.id)}
              className="p-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition"
              title="Xóa lượt giải"
              aria-label="Xóa lượt giải"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* 4-Stage CFOP Split Breakdown (if recorded) */}
          {Array.isArray(solve.splits_ms) && solve.splits_ms.length === 4 && (
            <div className="rounded-xl bg-black/35 border border-white/10 p-3 space-y-2">
              <div className="text-xs font-semibold text-cyan-300">
                Phân tách 4 Giai đoạn CFOP (Split Timer)
              </div>
              <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs">
                {solve.splits_ms.map((ms, idx) => {
                  const total = Math.max(
                    1,
                    solve.splits_ms!.reduce((a, b) => a + b, 0)
                  );
                  const pct = Math.round((ms / total) * 100);
                  return (
                    <div
                      key={idx}
                      className="rounded-lg bg-white/[0.04] border border-white/10 p-2"
                    >
                      <div className="text-[10px] font-sans text-slate-400">
                        {SPLIT_STAGE_NAMES[idx]}
                      </div>
                      <div className="font-bold text-white mt-0.5">
                        {formatTimeMs(ms, decimals)}
                      </div>
                      <div className="text-[10px] text-cyan-300">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scramble & Interactive 2D Cube Net + Step-by-Step Replay */}
          <div className="rounded-xl bg-black/35 border border-white/10 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-semibold">
                Scramble & Mô phỏng Trạng thái
              </span>
              {(solve.puzzle === "3x3" || solve.puzzle === "3x3oh") &&
                !reconDraft && (
                  <button
                    type="button"
                    onClick={() => {
                      const opt = solveOptimalCross(solve.scramble)[0];
                      if (opt && opt.moveCount > 0) {
                        const demo = `z2 ${opt.moves}`;
                        setReconDraft(demo);
                        setReplayStep(0);
                      }
                    }}
                    className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition"
                  >
                    + Nạp bước giải Cross mẫu vào Replay
                  </button>
                )}
            </div>

            <p className="font-mono text-sm leading-relaxed select-all text-slate-200">
              {solve.scramble}
            </p>

            <div className="flex justify-center pt-1">
              <CubeNetPreview
                puzzle={solve.puzzle}
                scramble={replayScrambleState}
                compact
              />
            </div>

            {/* Interactive Solve Replay Timeline if reconstruction moves exist */}
            {reconTokens.length > 0 && (
              <div className="rounded-xl bg-slate-950/80 border border-cyan-500/30 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-300">
                    Phát lại lượt giải (Solve Replay: Bước {replayStep}/
                    {reconTokens.length})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlayingReplay(false);
                        setReplayStep(0);
                      }}
                      className="p-1 rounded bg-white/10 hover:bg-white/20"
                      title="Về trạng thái Scramble ban đầu"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlayingReplay(false);
                        setReplayStep((s) => Math.max(0, s - 1));
                      }}
                      className="p-1 rounded bg-white/10 hover:bg-white/20"
                      title="Lùi 1 bước"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (replayStep >= reconTokens.length) {
                          setReplayStep(0);
                        }
                        setIsPlayingReplay((p) => !p);
                      }}
                      className="px-2.5 py-1 rounded bg-cyan-500 text-slate-950 font-bold inline-flex items-center gap-1"
                    >
                      {isPlayingReplay ? (
                        <>
                          <Pause className="w-3 h-3" />
                          <span>Dừng</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          <span>Phát</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlayingReplay(false);
                        setReplayStep((s) =>
                          Math.min(reconTokens.length, s + 1)
                        );
                      }}
                      className="p-1 rounded bg-white/10 hover:bg-white/20"
                      title="Tiến 1 bước"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Highlighted Move Tokens */}
                <div className="flex flex-wrap gap-1 font-mono text-xs">
                  {reconTokens.map((tok, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setIsPlayingReplay(false);
                        setReplayStep(idx + 1);
                      }}
                      className={`px-1.5 py-0.5 rounded transition ${
                        idx + 1 === replayStep
                          ? "bg-cyan-400 text-slate-950 font-bold"
                          : idx < replayStep
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "bg-white/5 text-slate-400"
                      }`}
                    >
                      {tok}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Comment & Reconstruction Editor Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onUpdateSolveComment(
                solve.id,
                commentDraft.trim(),
                reconDraft.trim() || undefined
              );
            }}
            className="space-y-2.5"
          >
            <div>
              <label
                htmlFor="solve-recon-input"
                className="block text-[11px] text-slate-400 mb-1"
              >
                Chuỗi nước đi giải (Reconstruction / Replay Moves):
              </label>
              <input
                id="solve-recon-input"
                type="text"
                value={reconDraft}
                onChange={(e) => {
                  setReconDraft(e.target.value);
                  setReplayStep(tokenizeAlgorithm(e.target.value).length);
                }}
                placeholder="VD: z2 D' R' F D2 (Cross) U R U' R' (F2L 1)..."
                className="w-full h-9 rounded-lg bg-black/40 border border-white/15 px-3 font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Thêm ghi chú cho lượt giải này (VD: OLL Skip, X-Cross)..."
                className="flex-1 h-9 rounded-lg bg-black/40 border border-white/15 px-3 text-xs focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                className="h-9 px-3.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition"
              >
                Lưu chi tiết
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Average Details Mode (Ao5 / Ao12 / Ao50 / Ao100)
  const shareBlock = generateAverageShareText(
    target.label,
    target.avgValue,
    target.solves,
    decimals
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Bảng thành tích ${target.label}`}
        className="w-full max-w-xl max-h-[85vh] flex flex-col rk-dialog text-white p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2 pr-8 mb-4">
          <div>
            <div className="font-mono text-3xl font-bold tabular-nums">
              {target.label}: {formatTimeMs(target.avgValue, decimals)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Tổng hợp {target.solves.length} lượt giải chuẩn WCA
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyText(shareBlock)}
              className="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Đã copy Text!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Share Text</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                downloadAchievementPngCard({
                  title: `KỶ LỤC TRUNG BÌNH ${target.label.toUpperCase()}`,
                  mainTimeText: formatTimeMs(target.avgValue, decimals),
                  subtitle: `Chuỗi ${target.solves.length} lượt giải chuẩn WCA trên RukTimer`,
                  scrambleOrList: target.solves
                    .slice(0, 12)
                    .map(
                      (s, idx) => `#${idx + 1}: ${formatSolveDisplay(s, decimals)}`
                    )
                    .join("  •  "),
                  footerMeta: `RukTimer (${new Date().toLocaleDateString(
                    "vi-VN"
                  )}) • ruk-timer.vercel.app`,
                })
              }
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <ImageDown className="w-4 h-4 text-cyan-400" />
              <span>Tải Ảnh PNG</span>
            </button>
          </div>
        </div>

        <pre className="flex-1 overflow-y-auto rounded-xl bg-black/50 border border-white/10 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
          {shareBlock}
        </pre>
      </div>
    </div>
  );
}
