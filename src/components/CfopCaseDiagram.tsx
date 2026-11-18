"use client";

import React, { useMemo } from "react";
import { CfopStage, simulateCfopCaseState } from "@/lib/cfop";
import { FaceColor } from "@/lib/scrambles";

const REAL_COLOR_BG: Record<FaceColor, string> = {
  W: "bg-[#f8fafc]",
  Y: "bg-[#facc15]",
  G: "bg-[#22c55e]",
  B: "bg-[#2563eb]",
  O: "bg-[#f97316]",
  R: "bg-[#ef4444]",
};

interface CfopCaseDiagramProps {
  stage: CfopStage;
  formula: string;
  size?: "sm" | "lg";
}

export default function CfopCaseDiagram({
  stage,
  formula,
  size = "sm",
}: CfopCaseDiagramProps) {
  const { net } = useMemo(() => simulateCfopCaseState(formula), [formula]);

  const isLarge = size === "lg";
  const cellDim = isLarge ? "w-7 h-7" : "w-5 h-5";
  const barHoriz = isLarge ? "w-7 h-2" : "w-5 h-1.5";
  const barVert = isLarge ? "w-2 h-7" : "w-1.5 h-5";

  // Top-down OLL / PLL diagram with 12 surrounding side-facelet indicators
  if (stage === "OLL" || stage === "PLL") {
    const isOll = stage === "OLL";

    const getTopStickerClass = (c: FaceColor) => {
      if (isOll) {
        return c === "Y"
          ? "bg-[#facc15] border-slate-950/60"
          : "bg-slate-800 border-slate-950/60";
      }
      return `${REAL_COLOR_BG[c]} border-slate-950/60`;
    };

    const getSideBarClass = (c: FaceColor) => {
      if (isOll) {
        return c === "Y" ? "bg-[#facc15]" : "bg-slate-800/45";
      }
      return REAL_COLOR_BG[c];
    };

    // Exact geometric mapping around U (row 0 = Back, row 2 = Front, col 0 = Left, col 2 = Right)
    const topBars: FaceColor[] = [net.B[0][2], net.B[0][1], net.B[0][0]];
    const bottomBars: FaceColor[] = [net.F[0][0], net.F[0][1], net.F[0][2]];
    const leftBars: FaceColor[] = [net.L[0][0], net.L[0][1], net.L[0][2]];
    const rightBars: FaceColor[] = [net.R[0][2], net.R[0][1], net.R[0][0]];

    return (
      <div className="inline-flex flex-col items-center gap-[3px] p-1.5 rounded-xl bg-slate-950/90 border border-white/10 select-none shrink-0">
        {/* Top (Back) side bars */}
        <div className="flex gap-[2px]">
          {topBars.map((c, i) => (
            <div
              key={`t-${i}`}
              className={`${barHoriz} rounded-[2px] ${getSideBarClass(c)}`}
            />
          ))}
        </div>

        {/* Middle: Left bars + 3x3 U face + Right bars */}
        <div className="flex items-center gap-[3px]">
          <div className="flex flex-col gap-[2px]">
            {leftBars.map((c, i) => (
              <div
                key={`l-${i}`}
                className={`${barVert} rounded-[2px] ${getSideBarClass(c)}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-[2px] p-[2px] rounded bg-black">
            {net.U.map((row, rIdx) =>
              row.map((c, cIdx) => (
                <div
                  key={`${rIdx}-${cIdx}`}
                  className={`${cellDim} rounded-[2.5px] border ${getTopStickerClass(
                    c
                  )}`}
                />
              ))
            )}
          </div>

          <div className="flex flex-col gap-[2px]">
            {rightBars.map((c, i) => (
              <div
                key={`r-${i}`}
                className={`${barVert} rounded-[2px] ${getSideBarClass(c)}`}
              />
            ))}
          </div>
        </div>

        {/* Bottom (Front) side bars */}
        <div className="flex gap-[2px]">
          {bottomBars.map((c, i) => (
            <div
              key={`b-${i}`}
              className={`${barHoriz} rounded-[2px] ${getSideBarClass(c)}`}
            />
          ))}
        </div>
      </div>
    );
  }

  // F2L & CROSS Diagram: Show U (Top) above F (Front) & R (Right) so the FR slot is crystal clear!
  const miniCell = isLarge ? "w-5 h-5" : "w-3.5 h-3.5";

  const renderFace = (grid: FaceColor[][], label: string) => (
    <div className="flex flex-col items-center gap-0.5">
      <div className="grid grid-cols-3 gap-[1.5px] p-[2px] rounded bg-black border border-white/10">
        {grid.map((row, r) =>
          row.map((c, col) => (
            <div
              key={`${label}-${r}-${col}`}
              className={`${miniCell} rounded-[1.5px] ${REAL_COLOR_BG[c]}`}
            />
          ))
        )}
      </div>
      <span className="text-[9px] font-mono opacity-45">{label}</span>
    </div>
  );

  return (
    <div className="inline-flex flex-col items-center gap-1 p-1.5 rounded-xl bg-slate-950/90 border border-white/10 select-none shrink-0">
      {renderFace(net.U, "U")}
      <div className="flex items-center gap-1.5">
        {renderFace(net.F, "F")}
        {renderFace(net.R, "R")}
      </div>
    </div>
  );
}
