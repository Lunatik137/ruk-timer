"use client";

import React, { useMemo } from "react";
import { FaceColor, simulateCubeScramble } from "@/lib/scrambles";
import { PUZZLES, PuzzleType } from "@/types/cubing";

const FACE_COLOR_CLASSES: Record<FaceColor, string> = {
  W: "bg-[#f8fafc] border-slate-900/40",
  Y: "bg-[#facc15] border-slate-900/40",
  G: "bg-[#22c55e] border-slate-900/40",
  B: "bg-[#2563eb] border-slate-900/40",
  O: "bg-[#f97316] border-slate-900/40",
  R: "bg-[#ef4444] border-slate-900/40",
};

interface CubeNetPreviewProps {
  puzzle: PuzzleType;
  scramble: string;
  compact?: boolean;
}

function FaceGrid({
  grid,
  cellClass,
}: {
  grid: FaceColor[][];
  cellClass: string;
}) {
  const size = grid.length;
  return (
    <div
      className="grid gap-[1.5px] p-[2px] rounded bg-slate-950/90 shadow-inner"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
      }}
    >
      {grid.map((row, rIdx) =>
        row.map((color, cIdx) => (
          <div
            key={`${rIdx}-${cIdx}`}
            className={`${cellClass} rounded-[1.5px] border ${FACE_COLOR_CLASSES[color]}`}
          />
        ))
      )}
    </div>
  );
}

export default function CubeNetPreview({
  puzzle,
  scramble,
  compact = false,
}: CubeNetPreviewProps) {
  const meta = useMemo(() => PUZZLES.find((p) => p.id === puzzle), [puzzle]);
  const cubeSize = meta?.cubeSize;

  const net = useMemo(() => {
    if (!cubeSize) return null;
    return simulateCubeScramble(cubeSize, scramble);
  }, [cubeSize, scramble]);

  if (!net || !cubeSize) {
    return (
      <div className="flex flex-col items-center justify-center py-4 px-3 text-center rounded-xl border border-white/10 bg-white/[0.02]">
        <span className="text-xs font-medium uppercase tracking-wider opacity-60">
          {meta?.label || puzzle}
        </span>
        <span className="text-[11px] opacity-40 mt-1">
          2D Net hỗ trợ 2x2 – 7x7, OH & BLD
        </span>
      </div>
    );
  }

  // Pick crisp sticker cell size based on cube dimension
  const getCellClass = () => {
    if (compact) {
      if (cubeSize <= 2) return "w-3.5 h-3.5";
      if (cubeSize === 3) return "w-3 h-3";
      if (cubeSize === 4) return "w-2.5 h-2.5";
      if (cubeSize === 5) return "w-2 h-2";
      return "w-1.5 h-1.5";
    }
    if (cubeSize <= 2) return "w-5 h-5";
    if (cubeSize === 3) return "w-3.5 h-3.5 sm:w-4 sm:h-4";
    if (cubeSize === 4) return "w-2.5 h-2.5 sm:w-3 sm:h-3";
    if (cubeSize === 5) return "w-2 h-2 sm:w-2.5 sm:h-2.5";
    if (cubeSize === 6) return "w-2 h-2";
    return "w-1.5 h-1.5";
  };

  const cellClass = getCellClass();

  return (
    <div className="inline-grid grid-cols-4 gap-1.5 select-none">
      {/* Row 1: [ _, U, _, _ ] */}
      <div />
      <FaceGrid grid={net.U} cellClass={cellClass} />
      <div />
      <div />

      {/* Row 2: [ L, F, R, B ] */}
      <FaceGrid grid={net.L} cellClass={cellClass} />
      <FaceGrid grid={net.F} cellClass={cellClass} />
      <FaceGrid grid={net.R} cellClass={cellClass} />
      <FaceGrid grid={net.B} cellClass={cellClass} />

      {/* Row 3: [ _, D, _, _ ] */}
      <div />
      <FaceGrid grid={net.D} cellClass={cellClass} />
      <div />
      <div />
    </div>
  );
}
