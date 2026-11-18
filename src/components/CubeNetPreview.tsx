"use client";

import React, { useMemo } from "react";
import {
  FaceColor,
  simulateClockState,
  simulateCubeScramble,
  simulateSquare1State,
} from "@/lib/scrambles";
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

/**
 * Renders Rubik's Clock 2D Dual-Face 9-Dial SVG Diagram.
 */
function ClockNetDiagram({ scramble }: { scramble: string }) {
  const state = useMemo(() => simulateClockState(scramble), [scramble]);

  const renderClockFace = (dials: number[], title: string, isFront: boolean) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">
        {title}
      </span>
      <div className="relative grid grid-cols-3 gap-1.5 p-2 rounded-full bg-slate-950 border border-cyan-500/30">
        {dials.map((hour, idx) => {
          const angleDeg = (hour % 12) * 30;
          return (
            <div
              key={idx}
              className="w-7 h-7 rounded-full bg-slate-900 border border-white/20 flex items-center justify-center relative"
              title={`Kim #${idx + 1}: ${hour === 0 ? 12 : hour}h`}
            >
              <div
                className="w-0.5 h-3 bg-amber-400 origin-bottom rounded-full"
                style={{
                  transform: `translateY(-50%) rotate(${angleDeg}deg)`,
                }}
              />
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 absolute" />
            </div>
          );
        })}
        {isFront && (
          <div className="col-span-3 flex justify-center gap-2 pt-0.5">
            {state.pins.map((up, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full border ${
                  up
                    ? "bg-amber-400 border-amber-200"
                    : "bg-slate-800 border-white/20"
                }`}
                title={`Chốt ${["UL", "UR", "DL", "DR"][i]}: ${
                  up ? "Nổi (UP)" : "Chìm (DOWN)"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-4 select-none py-1">
      {renderClockFace(state.frontDials, "Mặt Trước", true)}
      {renderClockFace(state.backDials, "Mặt Sau (y2)", false)}
    </div>
  );
}

/**
 * Renders Square-1 Shape-Valid Top/Bottom Layer SVG Wheel Diagram.
 */
function Square1NetDiagram({ scramble }: { scramble: string }) {
  const state = useMemo(() => simulateSquare1State(scramble), [scramble]);

  const renderLayerWheel = (
    pieces: typeof state.top,
    title: string,
    centerColor: string
  ) => {
    let curUnit = 0;
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">
          {title}
        </span>
        <svg viewBox="-55 -55 110 110" className="w-24 h-24">
          {pieces.map((p, idx) => {
            const startDeg = curUnit * 30 - 90;
            const endDeg = (curUnit + p.width) * 30 - 90;
            curUnit += p.width;
            const r = p.width === 2 ? 48 : 40;
            const rad1 = (startDeg * Math.PI) / 180;
            const rad2 = (endDeg * Math.PI) / 180;
            const x1 = Math.cos(rad1) * r;
            const y1 = Math.sin(rad1) * r;
            const x2 = Math.cos(rad2) * r;
            const y2 = Math.sin(rad2) * r;
            return (
              <polygon
                key={idx}
                points={`0,0 ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(
                  1
                )},${y2.toFixed(1)}`}
                fill={p.isTopOrigin ? "#f8fafc" : "#facc15"}
                stroke="#020617"
                strokeWidth="2"
              />
            );
          })}
          {/* Slice line indicator */}
          <line
            x1="0"
            y1="-50"
            x2="0"
            y2="50"
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
          <circle cx="0" cy="0" r="10" fill={centerColor} stroke="#020617" strokeWidth="1.5" />
        </svg>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-4 select-none py-1">
      {renderLayerWheel(state.top, "Tầng Trên (U)", "#f8fafc")}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-mono opacity-60">Tầng Giữa</span>
        <div className="flex h-4 w-14 rounded overflow-hidden border border-white/20">
          <div className="w-1/3 bg-green-500" />
          <div
            className={`w-2/3 ${
              state.middleFlipped ? "bg-orange-500" : "bg-green-500"
            }`}
          />
        </div>
      </div>
      {renderLayerWheel(state.bottom, "Tầng Dưới (D)", "#facc15")}
    </div>
  );
}

/**
 * Renders 2D Polygon Diagram for Pyraminx, Skewb, and Megaminx based on deterministic scramble hash.
 */
function NonCubicPolygonDiagram({
  puzzle,
  scramble,
}: {
  puzzle: "pyraminx" | "skewb" | "megaminx";
  scramble: string;
}) {
  const palette = ["#22c55e", "#ef4444", "#2563eb", "#facc15", "#f8fafc", "#f97316"];
  const colors = useMemo(() => {
    const out: string[] = [];
    let h = 17;
    for (let i = 0; i < scramble.length; i++) {
      h = (h * 31 + scramble.charCodeAt(i)) % 9973;
    }
    for (let i = 0; i < 36; i++) {
      out.push(palette[(h + i * 7 + scramble.charCodeAt(i % Math.max(1, scramble.length))) % palette.length]);
    }
    return out;
  }, [scramble]);

  if (puzzle === "pyraminx") {
    return (
      <div className="flex flex-col items-center gap-1 select-none">
        <svg viewBox="0 0 220 115" className="w-52 h-28">
          {/* Left, Front, Right, Bottom Triangular Faces */}
          {[
            { cx: 45, cy: 55, flip: false, label: "L", offset: 0 },
            { cx: 110, cy: 55, flip: false, label: "F", offset: 4 },
            { cx: 175, cy: 55, flip: false, label: "R", offset: 8 },
            { cx: 110, cy: 88, flip: true, label: "D", offset: 12 },
          ].map((face, fIdx) => {
            const dir = face.flip ? -1 : 1;
            return (
              <g key={fIdx}>
                <polygon
                  points={`${face.cx},${face.cy - 28 * dir} ${face.cx - 26},${
                    face.cy + 18 * dir
                  } ${face.cx + 26},${face.cy + 18 * dir}`}
                  fill={colors[face.offset]}
                  stroke="#020617"
                  strokeWidth="2"
                />
                <polygon
                  points={`${face.cx},${face.cy - 8 * dir} ${face.cx - 13},${
                    face.cy + 15 * dir
                  } ${face.cx + 13},${face.cy + 15 * dir}`}
                  fill={colors[face.offset + 1]}
                  stroke="#020617"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}
        </svg>
        <span className="text-[10px] font-mono opacity-60">
          Sơ đồ 4 mặt Pyraminx (L • F • R • D)
        </span>
      </div>
    );
  }

  if (puzzle === "skewb") {
    return (
      <div className="flex items-center gap-2 select-none py-1">
        {["U", "L", "F", "R", "B", "D"].map((face, idx) => (
          <svg key={face} viewBox="0 0 40 40" className="w-9 h-9 rounded bg-slate-950 border border-white/15">
            <polygon points="0,0 20,0 0,20" fill={colors[idx * 5]} stroke="#020617" />
            <polygon points="20,0 40,0 40,20" fill={colors[idx * 5 + 1]} stroke="#020617" />
            <polygon points="40,20 40,40 20,40" fill={colors[idx * 5 + 2]} stroke="#020617" />
            <polygon points="0,20 20,40 0,40" fill={colors[idx * 5 + 3]} stroke="#020617" />
            <polygon points="20,0 40,20 20,40 0,20" fill={colors[idx]} stroke="#020617" strokeWidth="1.5" />
          </svg>
        ))}
      </div>
    );
  }

  // Megaminx 12-pentagon representation
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 12 }).map((_, idx) => (
          <svg key={idx} viewBox="-22 -22 44 44" className="w-8 h-8">
            <polygon
              points="0,-19 18,-6 11,16 -11,16 -18,-6"
              fill={colors[idx]}
              stroke="#020617"
              strokeWidth="2"
            />
            <polygon
              points="0,-9 9,-3 5,8 -5,8 -9,-3"
              fill={palette[idx % palette.length]}
              stroke="#020617"
              strokeWidth="1.5"
            />
          </svg>
        ))}
      </div>
      <span className="text-[10px] font-mono opacity-60">
        Sơ đồ 12 mặt ngũ giác Megaminx
      </span>
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

  if (!cubeSize) {
    if (puzzle === "clock") return <ClockNetDiagram scramble={scramble} />;
    if (puzzle === "sq1") return <Square1NetDiagram scramble={scramble} />;
    if (puzzle === "pyraminx" || puzzle === "skewb" || puzzle === "megaminx") {
      return <NonCubicPolygonDiagram puzzle={puzzle} scramble={scramble} />;
    }
  }

  if (!net || !cubeSize) {
    return null;
  }

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
