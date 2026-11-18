"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Edit2,
  Filter,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import {
  solveOptimalCross,
  validateScramble,
} from "@/lib/scrambles";
import { PuzzleType, TrainingSubset } from "@/types/cubing";

interface ScrambleBarProps {
  puzzle: PuzzleType;
  scramble: string;
  previousScramble: string | null;
  trainingSubset: TrainingSubset;
  onChangeTrainingSubset: (subset: TrainingSubset) => void;
  onNextScramble: () => void;
  onRestorePreviousScramble: () => void;
  onSetCustomScramble: (custom: string) => void;
}

const SUBSET_OPTIONS: { id: TrainingSubset; label: string }[] = [
  { id: "wca", label: "Scramble Chuẩn WCA" },
  { id: "cross_easy", label: "Luyện Cross (3–5 nước)" },
  { id: "cross_hard", label: "Luyện Cross (6–8 nước)" },
  { id: "f2l_only", label: "Luyện F2L (Cross giải sẵn)" },
  { id: "ll_only", label: "Tầng Cuối (OLL + PLL)" },
];

export default function ScrambleBar({
  puzzle,
  scramble,
  previousScramble,
  trainingSubset,
  onChangeTrainingSubset,
  onNextScramble,
  onRestorePreviousScramble,
  onSetCustomScramble,
}: ScrambleBarProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftScramble, setDraftScramble] = useState(scramble);
  const [showCrossCoach, setShowCrossCoach] = useState(false);

  const validation = useMemo(
    () => validateScramble(puzzle, scramble),
    [puzzle, scramble]
  );

  const crossSolutions = useMemo(() => {
    if (!showCrossCoach || (puzzle !== "3x3" && puzzle !== "3x3oh")) {
      return [];
    }
    return solveOptimalCross(scramble);
  }, [showCrossCoach, puzzle, scramble]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scramble);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftScramble.trim()) {
      onSetCustomScramble(draftScramble.trim());
    }
    setIsEditing(false);
  };

  const is3x3Family = puzzle === "3x3" || puzzle === "3x3oh";

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md px-4 py-3 sm:px-6 sm:py-4">
        {!isEditing ? (
          <div className="flex flex-col items-center gap-2.5">
            {/* Top Bar: Validation Status + 3x3 Training Subset Picker */}
            <div className="w-full flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/30 border border-white/10 text-slate-300">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    validation.valid ? "text-emerald-400" : "text-amber-400"
                  }`}
                />
                <span>{validation.message}</span>
              </div>

              {is3x3Family && (
                <div className="inline-flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-cyan-400" />
                  <select
                    aria-label="Chế độ bài tập Scramble 3x3"
                    value={trainingSubset}
                    onChange={(e) => {
                      onChangeTrainingSubset(e.target.value as TrainingSubset);
                      e.currentTarget.blur();
                    }}
                    className="h-7 rounded-lg bg-slate-900 border border-white/15 px-2 text-xs text-cyan-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                  >
                    {SUBSET_OPTIONS.map((opt) => (
                      <option
                        key={opt.id}
                        value={opt.id}
                        className="bg-slate-900 text-white"
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Scramble Moves */}
            <p className="font-mono text-center text-base sm:text-xl md:text-2xl font-medium tracking-wide leading-relaxed select-all break-words max-w-full">
              {scramble}
            </p>

            {/* Action Controls */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              {previousScramble && (
                <button
                  type="button"
                  onClick={(e) => {
                    onRestorePreviousScramble();
                    e.currentTarget.blur();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 inline-flex items-center gap-1 text-slate-200 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Scramble trước</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  onNextScramble();
                  e.currentTarget.blur();
                }}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 inline-flex items-center gap-1 font-medium transition"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Scramble mới (Alt+N)</span>
              </button>

              {is3x3Family && (
                <button
                  type="button"
                  onClick={(e) => {
                    setShowCrossCoach((v) => !v);
                    e.currentTarget.blur();
                  }}
                  className={`px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 font-medium transition ${
                    showCrossCoach
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-white/[0.06] hover:bg-white/[0.12] border-white/10 text-slate-200"
                  }`}
                >
                  <Compass className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {showCrossCoach ? "Ẩn gợi ý Cross" : "Gợi ý Cross & F2L #1"}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  handleCopy();
                  e.currentTarget.blur();
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 inline-flex items-center gap-1 text-slate-200 transition"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Đã copy</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDraftScramble(scramble);
                  setIsEditing(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 inline-flex items-center gap-1 text-slate-200 transition"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Tùy chỉnh</span>
              </button>
            </div>

            {/* Collapsible Deterministic Scramble Coach (Cross + First Pair) */}
            {showCrossCoach && is3x3Family && crossSolutions.length > 0 && (
              <div className="w-full mt-2 rounded-xl bg-black/40 border border-emerald-500/25 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <strong className="text-emerald-300 font-semibold">
                    Phân tích Scramble Coach (Cross Đáy Trắng & F2L Đầu Tiên)
                  </strong>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {crossSolutions[0].orientation}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {crossSolutions.slice(0, 2).map((sol, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200">
                          Phương án #{idx + 1} ({sol.moveCount} nước)
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">
                          {sol.solvedEdgesCount}/4 cạnh khớp
                        </span>
                      </div>
                      <code className="block font-mono text-sm font-bold text-cyan-300">
                        z2 {sol.moves}
                      </code>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {sol.firstPairAdvice}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleCustomSubmit} className="flex flex-col gap-2.5">
            <label
              htmlFor="custom-scramble-input"
              className="text-xs text-slate-300 font-semibold"
            >
              Nhập công thức Scramble tùy chỉnh:
            </label>
            <textarea
              id="custom-scramble-input"
              rows={2}
              autoFocus
              value={draftScramble}
              onChange={(e) => setDraftScramble(e.target.value)}
              className="w-full rounded-xl bg-slate-950/80 border border-cyan-500/50 px-3 py-2 font-mono text-sm text-white focus:outline-none"
              placeholder="Ví dụ: R U R' U' F' U2 F..."
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-medium"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold"
              >
                Áp dụng Scramble
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
