"use client";

import React, { useMemo } from "react";
import { BarChart3, Trophy, TrendingDown } from "lucide-react";
import { formatTimeMs } from "@/lib/stats";
import { SolveWithRollingStats, StatSummary } from "@/types/cubing";

interface StatsPanelProps {
  summary: StatSummary;
  enrichedSolves: SolveWithRollingStats[];
  decimals: 2 | 3;
  onInspectAverage: (
    label: string,
    avgValue: number | "DNF",
    endIndex: number,
    windowSize: number
  ) => void;
  onInspectSolveById: (id: string) => void;
}

export default function StatsPanel({
  summary,
  enrichedSolves,
  decimals,
  onInspectAverage,
  onInspectSolveById,
}: StatsPanelProps) {
  const rows: {
    label: string;
    current: number | "DNF" | null;
    best: number | null;
    windowSize?: number;
    bestEndIdx?: number | null;
    isSingle?: boolean;
  }[] = [
    {
      label: "Time",
      current: summary.currentSingle,
      best: summary.bestSingle,
      isSingle: true,
    },
    { label: "Mo3", current: summary.currentMo3, best: summary.bestMo3 },
    {
      label: "Ao5",
      current: summary.currentAo5,
      best: summary.bestAo5,
      windowSize: 5,
      bestEndIdx: summary.bestAo5Index,
    },
    {
      label: "Ao12",
      current: summary.currentAo12,
      best: summary.bestAo12,
      windowSize: 12,
      bestEndIdx: summary.bestAo12Index,
    },
    {
      label: "Ao50",
      current: summary.currentAo50,
      best: summary.bestAo50,
      windowSize: 50,
    },
    {
      label: "Ao100",
      current: summary.currentAo100,
      best: summary.bestAo100,
      windowSize: 100,
    },
  ];

  // Prepare SVG trend chart data (last 50 valid solves for clean readability)
  const chartData = useMemo(() => {
    const slice = enrichedSolves.slice(-50);
    const validNums: number[] = [];

    for (const s of slice) {
      if (typeof s.effectiveMs === "number") validNums.push(s.effectiveMs);
      if (typeof s.rollingAo5 === "number") validNums.push(s.rollingAo5);
      if (typeof s.rollingAo12 === "number") validNums.push(s.rollingAo12);
    }

    if (validNums.length < 2) return null;

    const minVal = Math.min(...validNums);
    const maxVal = Math.max(...validNums);
    const range = Math.max(200, maxVal - minVal);
    const padMin = Math.max(0, minVal - range * 0.1);
    const padMax = maxVal + range * 0.1;

    const width = 300;
    const height = 110;

    const toX = (idx: number) =>
      slice.length <= 1 ? width / 2 : (idx / (slice.length - 1)) * width;
    const toY = (ms: number) =>
      height - ((ms - padMin) / (padMax - padMin)) * height;

    const buildPath = (
      getter: (item: SolveWithRollingStats) => number | "DNF" | null
    ) => {
      const pts: string[] = [];
      slice.forEach((item, idx) => {
        const val = getter(item);
        if (typeof val === "number") {
          pts.push(
            `${pts.length === 0 ? "M" : "L"}${toX(idx).toFixed(1)},${toY(
              val
            ).toFixed(1)}`
          );
        }
      });
      return pts.length >= 2 ? pts.join(" ") : "";
    };

    return {
      width,
      height,
      minLabel: formatTimeMs(minVal, decimals),
      maxLabel: formatTimeMs(maxVal, decimals),
      singlePath: buildPath((s) => s.effectiveMs),
      ao5Path: buildPath((s) => s.rollingAo5),
      ao12Path: buildPath((s) => s.rollingAo12),
    };
  }, [enrichedSolves, decimals]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Summary Header Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center">
          <div className="text-[11px] uppercase tracking-wider opacity-55">
            Số lượt
          </div>
          <div className="font-mono font-bold text-sm sm:text-base mt-0.5">
            {summary.validCount}/{summary.totalCount}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center">
          <div className="text-[11px] uppercase tracking-wider opacity-55">
            Mean
          </div>
          <div className="font-mono font-bold text-sm sm:text-base mt-0.5 text-cyan-300">
            {formatTimeMs(summary.mean, decimals)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center">
          <div className="text-[11px] uppercase tracking-wider opacity-55">
            Độ lệch (σ)
          </div>
          <div className="font-mono font-bold text-sm sm:text-base mt-0.5 opacity-90">
            {formatTimeMs(summary.stdDev, decimals)}
          </div>
        </div>
      </div>

      {/* WCA Stats Table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider opacity-80">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Thống kê WCA</span>
          </div>
          <span className="text-[11px] opacity-45">Bấm vào số để xem chi tiết</span>
        </div>

        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider opacity-55">
              <th className="py-2 pl-3.5 text-left font-medium">Chỉ số</th>
              <th className="py-2 text-right font-medium">Hiện tại</th>
              <th className="py-2 pr-3.5 text-right font-medium">PB (Best)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
            {rows.map((r) => {
              const canClickCurrent =
                r.windowSize &&
                r.current !== null &&
                enrichedSolves.length >= r.windowSize;
              const canClickBest =
                (r.isSingle && summary.bestSingleSolveId) ||
                (r.windowSize &&
                  r.best !== null &&
                  typeof r.bestEndIdx === "number");

              return (
                <tr key={r.label} className="hover:bg-white/[0.03] transition">
                  <td className="py-2 pl-3.5 font-sans font-semibold text-xs opacity-80">
                    {r.label}
                  </td>
                  <td className="py-2 text-right">
                    {canClickCurrent ? (
                      <button
                        type="button"
                        onClick={() =>
                          onInspectAverage(
                            `Current ${r.label}`,
                            r.current!,
                            enrichedSolves.length - 1,
                            r.windowSize!
                          )
                        }
                        className="hover:text-cyan-300 underline decoration-white/20 underline-offset-2 transition"
                      >
                        {formatTimeMs(r.current, decimals)}
                      </button>
                    ) : (
                      <span>{formatTimeMs(r.current, decimals)}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3.5 text-right text-emerald-400 font-semibold">
                    {canClickBest ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (r.isSingle && summary.bestSingleSolveId) {
                            onInspectSolveById(summary.bestSingleSolveId);
                          } else if (
                            r.windowSize &&
                            typeof r.bestEndIdx === "number" &&
                            r.best !== null
                          ) {
                            onInspectAverage(
                              `Best ${r.label}`,
                              r.best,
                              r.bestEndIdx,
                              r.windowSize
                            );
                          }
                        }}
                        className="hover:text-emerald-300 underline decoration-emerald-500/30 underline-offset-2 transition"
                      >
                        {formatTimeMs(r.best, decimals)}
                      </button>
                    ) : (
                      <span>{formatTimeMs(r.best, decimals)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Progression Trend Chart */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider opacity-80">
            <TrendingDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>Biểu đồ tiến độ</span>
          </div>
          <div className="flex items-center gap-2.5 text-[10px]">
            <span className="inline-flex items-center gap-1 opacity-75">
              <span className="w-2 h-2 rounded-full bg-slate-400" /> Single
            </span>
            <span className="inline-flex items-center gap-1 text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400" /> Ao5
            </span>
            <span className="inline-flex items-center gap-1 text-indigo-300">
              <span className="w-2 h-2 rounded-full bg-indigo-400" /> Ao12
            </span>
          </div>
        </div>

        {chartData ? (
          <div className="relative">
            <svg
              viewBox={`0 0 ${chartData.width} ${chartData.height}`}
              className="w-full h-28 overflow-visible"
              preserveAspectRatio="none"
            >
              {/* Subtle horizontal guide lines */}
              <line
                x1="0"
                y1="15"
                x2={chartData.width}
                y2="15"
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
              <line
                x1="0"
                y1={chartData.height / 2}
                x2={chartData.width}
                y2={chartData.height / 2}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
              <line
                x1="0"
                y1={chartData.height - 15}
                x2={chartData.width}
                y2={chartData.height - 15}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />

              {chartData.singlePath && (
                <path
                  d={chartData.singlePath}
                  fill="none"
                  stroke="rgba(148,163,184,0.45)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {chartData.ao5Path && (
                <path
                  d={chartData.ao5Path}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {chartData.ao12Path && (
                <path
                  d={chartData.ao12Path}
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
            <div className="flex justify-between text-[10px] font-mono opacity-45 mt-1">
              <span>Best: {chartData.minLabel}</span>
              <span>Max: {chartData.maxLabel}</span>
            </div>
          </div>
        ) : (
          <div className="h-24 flex flex-col items-center justify-center text-center opacity-45 text-xs gap-1">
            <BarChart3 className="w-5 h-5" />
            <span>Giải ít nhất 2 lượt để hiển thị biểu đồ</span>
          </div>
        )}
      </div>
    </div>
  );
}
