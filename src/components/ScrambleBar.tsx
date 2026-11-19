"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Compass,
  Copy,
  Edit2,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import {
  solveOptimalCross,
  validateScramble,
} from "@/lib/scrambles";
import { PuzzleType, ScrambleSource, TrainingSubset } from "@/types/cubing";

interface ScrambleBarProps {
  puzzle: PuzzleType;
  scramble: string;
  previousScramble: string | null;
  trainingSubset: TrainingSubset;
  scrambleSource?: ScrambleSource;
  isGeneratingScramble?: boolean;
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
  scrambleSource = "random-move",
  isGeneratingScramble = false,
  onChangeTrainingSubset,
  onNextScramble,
  onRestorePreviousScramble,
  onSetCustomScramble,
}: ScrambleBarProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
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
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
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
    <div className="w-full max-w-4xl mx-auto pt-1 sm:pt-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:px-5 sm:py-4">
        {!isEditing ? (
          <div className="space-y-2">
            <p
              aria-label="Công thức scramble"
              className="max-w-full select-all break-words text-center font-mono text-base font-semibold leading-relaxed text-slate-50 sm:text-xl"
            >
              {scramble || "Đang chuẩn bị scramble…"}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {is3x3Family && (
                <select
                  aria-label="Chế độ bài tập Scramble 3x3"
                  value={trainingSubset}
                  onChange={(event) => onChangeTrainingSubset(event.target.value as TrainingSubset)}
                  className="h-11 min-w-0 max-w-48 flex-[1_1_0%] rounded-lg sm:flex-none border border-white/15 bg-slate-950 px-2 text-xs text-slate-200"
                >
                  {SUBSET_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              )}

              <button
                type="button"
                disabled={isGeneratingScramble}
                onClick={() => {
                  setCopyStatus("idle");
                  onNextScramble();
                }}
                title="Tạo scramble mới (Alt+N)"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/15 px-2.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/25 disabled:opacity-60"
              >
                <Shuffle aria-hidden="true" className="size-4" />
                {isGeneratingScramble ? "Đang tạo…" : "Scramble mới"}
              </button>
            </div>

            {(isGeneratingScramble || !validation.valid || scrambleSource === "random-state") && (
              <p role="status" className={`text-center text-xs ${validation.valid ? "text-slate-300" : "text-amber-200"}`}>
                {isGeneratingScramble ? "Đang tạo scramble WCA…" :
                  !validation.valid ? validation.message : "WCA Random-State"}
              </p>
            )}

            <details className="group">
              <summary className="mx-auto flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                <ChevronDown aria-hidden="true" className="size-4 group-open:rotate-180" />
                Tùy chọn scramble
              </summary>
              <div className="flex flex-wrap justify-center gap-2 border-t border-white/10 pt-2 text-xs">
                {previousScramble && (
                  <button
                    type="button"
                    onClick={() => {
                      setCopyStatus("idle");
                      onRestorePreviousScramble();
                    }}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 hover:bg-white/10"
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    Scramble trước
                  </button>
                )}
                {is3x3Family && (
                  <button
                    type="button"
                    aria-pressed={showCrossCoach}
                    onClick={() => setShowCrossCoach((visible) => !visible)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 hover:bg-white/10 aria-pressed:border-cyan-400/60 aria-pressed:text-cyan-200"
                  >
                    <Compass aria-hidden="true" className="size-4" />
                    Gợi ý Cross & F2L
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 hover:bg-white/10"
                >
                  {copyStatus === "success" ? <Check aria-hidden="true" className="size-4 text-emerald-300" /> :
                    <Copy aria-hidden="true" className="size-4" />}
                  Sao chép
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCopyStatus("idle");
                    setDraftScramble(scramble);
                    setIsEditing(true);
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 hover:bg-white/10"
                >
                  <Edit2 aria-hidden="true" className="size-4" />
                  Tùy chỉnh
                </button>
              </div>
              {copyStatus !== "idle" && (
                <p role="status" className="mt-2 text-center text-xs text-slate-300">
                  {copyStatus === "success" ? "Đã sao chép scramble." : "Không thể sao chép. Hãy chọn và sao chép công thức."}
                </p>
              )}

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
            </details>
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
                className="min-h-11 px-3 rounded-lg bg-white/10 text-xs font-medium"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="min-h-11 px-3 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold"
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
