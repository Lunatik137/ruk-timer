"use client";

import React, { useState } from "react";
import { Check, Copy, Trash2, X } from "lucide-react";
import CubeNetPreview from "@/components/CubeNetPreview";
import {
  formatSolveDisplay,
  formatTimeMs,
  generateAverageShareText,
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
  onUpdateSolveComment: (solveId: string, comment: string) => void;
  onDeleteSolve: (solveId: string) => void;
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

  React.useEffect(() => {
    if (target?.type === "solve") {
      setCommentDraft(target.solve.comment || "");
    }
    setCopied(false);
  }, [target]);

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

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 text-white p-6 shadow-2xl relative space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div>
            <span className="text-xs uppercase tracking-wider text-cyan-400 font-semibold">
              Chi tiết lượt giải {indexNumber ? `#${indexNumber}` : ""} •{" "}
              {solve.puzzle.toUpperCase()}
            </span>
            <div className="font-mono text-4xl font-bold mt-1">
              {formatSolveDisplay(solve, decimals)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {new Date(solve.solved_at).toLocaleString("vi-VN")}
            </div>
          </div>

          {/* Penalty Buttons */}
          <div className="flex items-center gap-2">
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
                  <span>Copy kết quả</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.confirm("Xóa lượt giải này?")) {
                  onDeleteSolve(solve.id);
                  onClose();
                }
              }}
              className="p-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition"
              title="Xóa"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Scramble & Cube Net */}
          <div className="rounded-xl bg-black/35 border border-white/10 p-3.5 space-y-3">
            <div className="text-[11px] uppercase tracking-wider opacity-55 font-semibold">
              Scramble
            </div>
            <p className="font-mono text-sm leading-relaxed select-all">
              {solve.scramble}
            </p>
            <div className="flex justify-center pt-1">
              <CubeNetPreview
                puzzle={solve.puzzle}
                scramble={solve.scramble}
                compact
              />
            </div>
          </div>

          {/* Comment */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onUpdateSolveComment(solve.id, commentDraft.trim());
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Thêm ghi chú cho lượt giải này..."
              className="flex-1 h-9 rounded-lg bg-black/40 border border-white/15 px-3 text-xs focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="h-9 px-3 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs"
            >
              Lưu ghi chú
            </button>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-white/15 bg-slate-900 text-white p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center justify-between pr-8 mb-4">
          <div>
            <span className="text-xs uppercase tracking-wider text-cyan-400 font-semibold">
              Bảng thành tích {target.label}
            </span>
            <div className="font-mono text-3xl font-bold mt-0.5">
              {formatTimeMs(target.avgValue, decimals)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => copyText(shareBlock)}
            className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Đã copy Share Text!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy để chia sẻ</span>
              </>
            )}
          </button>
        </div>

        <pre className="flex-1 overflow-y-auto rounded-xl bg-black/50 border border-white/10 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
          {shareBlock}
        </pre>
      </div>
    </div>
  );
}
