"use client";

import React, { memo, useMemo, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  Layers,
  TrendingDown,
  Trophy,
} from "lucide-react";
import {
  computeConsistencyAndSubX,
  computeSplitBreakdown,
  computeTimeHistogram,
  formatTimeMs,
} from "@/lib/stats";
import { SolveWithRollingStats, StatSummary } from "@/types/cubing";

interface StatsPanelProps {
  summary: StatSummary;
  enrichedSolves: SolveWithRollingStats[];
  decimals: 2 | 3;
  targetGoalMs?: number;
  onInspectAverage: (
    label: string,
    avgValue: number | "DNF",
    endIndex: number,
    windowSize: number
  ) => void;
  onInspectSolveById: (id: string) => void;
  onOpenAiCoach?: () => void;
}

function StatsPanelInner({
  summary,
  enrichedSolves,
  decimals,
  targetGoalMs = 15000,
  onInspectAverage,
  onInspectSolveById,
  onOpenAiCoach,
}: StatsPanelProps) {
  const [chartTab, setChartTab] = useState<"trend" | "histogram" | "splits">(
    "trend"
  );
  const [trendScope, setTrendScope] = useState<"50" | "all">("50");

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
      bestEndIdx: summary.bestAo50Index,
    },
    {
      label: "Ao100",
      current: summary.currentAo100,
      best: summary.bestAo100,
      windowSize: 100,
      bestEndIdx: summary.bestAo100Index,
    },
  ];

  const chartData = useMemo(() => {
    const slice =
      trendScope === "50" ? enrichedSolves.slice(-50) : enrichedSolves;
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
  }, [enrichedSolves, decimals, trendScope]);

  const histogramBuckets = useMemo(
    () => computeTimeHistogram(enrichedSolves, 6, decimals),
    [enrichedSolves, decimals]
  );

  const consistency = useMemo(
    () => computeConsistencyAndSubX(enrichedSolves, targetGoalMs),
    [enrichedSolves, targetGoalMs]
  );

  const splitBreakdown = useMemo(
    () => computeSplitBreakdown(enrichedSolves),
    [enrichedSolves]
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Summary Header Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center">
          <div className="text-[11px] text-slate-400">Số lượt</div>
          <div className="font-mono font-bold text-sm sm:text-base mt-0.5 tabular-nums">
            {summary.validCount}/{summary.totalCount}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center">
          <div className="text-[11px] text-slate-400">Mean</div>
          <div className="font-mono font-bold text-sm sm:text-base mt-0.5 text-cyan-300 tabular-nums">
            {formatTimeMs(summary.mean, decimals)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center">
          <div className="text-[11px] text-slate-400">Độ lệch (σ)</div>
          <div className="font-mono font-bold text-sm sm:text-base mt-0.5 tabular-nums">
            {formatTimeMs(summary.stdDev, decimals)}
          </div>
        </div>
      </div>

      {/* Consistency & Sub-Goal Quick Row */}
      {consistency.consistencyScore !== null && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] py-1.5 px-2">
            <span className="text-[10px] text-slate-400 block">Độ ổn định</span>
            <strong className="font-mono text-emerald-300">
              {consistency.consistencyScore}/100
            </strong>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] py-1.5 px-2">
            <span className="text-[10px] text-slate-400 block">Không phạt</span>
            <strong className="font-mono text-cyan-300">
              {consistency.cleanRatePct}%
            </strong>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] py-1.5 px-2">
            <span className="text-[10px] text-slate-400 block">
              Sub-{Math.round(targetGoalMs / 1000)}s
            </span>
            <strong className="font-mono text-amber-300">
              {consistency.subGoalRatePct}%
            </strong>
          </div>
        </div>
      )}

      {/* WCA Stats Table */}
      <div className="rk-panel overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Thống kê WCA</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Bấm vào số để xem chi tiết
          </span>
        </div>

        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[11px] text-slate-400">
              <th className="py-2 pl-3.5 text-left font-medium">Chỉ số</th>
              <th className="py-2 text-right font-medium">Hiện tại</th>
              <th className="py-2 pr-3.5 text-right font-medium">PB (Best)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono tabular-nums">
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
                  <td className="py-2 pl-3.5 font-sans font-semibold text-xs text-slate-200">
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

      {/* Multi-Tab Analytics Box: Trend / Histogram / CFOP Splits */}
      <div className="rk-panel p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/35 border border-white/10 text-[11px]">
            <button
              type="button"
              onClick={() => setChartTab("trend")}
              className={`px-2 py-1 rounded-md font-medium inline-flex items-center gap-1 transition ${
                chartTab === "trend"
                  ? "bg-cyan-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <TrendingDown className="w-3 h-3" />
              <span>Xu hướng</span>
            </button>
            <button
              type="button"
              onClick={() => setChartTab("histogram")}
              className={`px-2 py-1 rounded-md font-medium inline-flex items-center gap-1 transition ${
                chartTab === "histogram"
                  ? "bg-cyan-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <BarChart3 className="w-3 h-3" />
              <span>Phân phối</span>
            </button>
            <button
              type="button"
              onClick={() => setChartTab("splits")}
              className={`px-2 py-1 rounded-md font-medium inline-flex items-center gap-1 transition ${
                chartTab === "splits"
                  ? "bg-cyan-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>4 Pha</span>
            </button>
          </div>

          {chartTab === "trend" && enrichedSolves.length > 50 && (
            <button
              type="button"
              onClick={() =>
                setTrendScope((s) => (s === "50" ? "all" : "50"))
              }
              className="text-[10px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 text-cyan-200 font-mono"
            >
              {trendScope === "50"
                ? "50 lượt cuối"
                : `Tất cả (${enrichedSolves.length})`}
            </button>
          )}
        </div>

        {chartTab === "trend" && (
          <>
            <div className="flex items-center justify-end gap-2.5 text-[10px]">
              <span className="inline-flex items-center gap-1 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-slate-400" /> Single
              </span>
              <span className="inline-flex items-center gap-1 text-cyan-300">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Ao5
              </span>
              <span className="inline-flex items-center gap-1 text-indigo-300">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> Ao12
              </span>
            </div>

            {chartData ? (
              <div className="relative">
                <svg
                  viewBox={`0 0 ${chartData.width} ${chartData.height}`}
                  className="w-full h-28 overflow-visible"
                  preserveAspectRatio="none"
                >
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
                <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                  <span>Best: {chartData.minLabel}</span>
                  <span>Max: {chartData.maxLabel}</span>
                </div>
              </div>
            ) : (
              <div className="h-24 flex flex-col items-center justify-center text-center text-slate-400 text-xs gap-1">
                <BarChart3 className="w-5 h-5" />
                <span>Giải ít nhất 2 lượt để hiển thị biểu đồ</span>
              </div>
            )}
          </>
        )}

        {chartTab === "histogram" && (
          <div className="space-y-1.5 pt-1">
            {histogramBuckets.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-xs text-slate-400 text-center">
                Cần ít nhất 3 lượt giải hợp lệ để vẽ phổ phân phối thời gian
              </div>
            ) : (
              histogramBuckets.map((b) => (
                <div key={b.label} className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-300">{b.label}</span>
                    <span className="text-cyan-300 font-semibold">
                      {b.count} lượt ({b.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full"
                      style={{ width: `${Math.max(4, b.percentage)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {chartTab === "splits" && (
          <div className="space-y-2 pt-1">
            {!splitBreakdown ? (
              <div className="h-24 flex flex-col items-center justify-center text-xs text-slate-400 text-center px-2">
                <span>Chưa có lượt giải Split Timer trong session này.</span>
                <span className="text-[11px] text-cyan-300 mt-1">
                  Hãy bật nút &ldquo;Split Timer (Cross/F2L/OLL/PLL)&rdquo; phía trên đồng hồ!
                </span>
              </div>
            ) : (
              <>
                <div className="text-[11px] text-slate-300 flex justify-between">
                  <span>Trung bình {splitBreakdown.sampleCount} lượt Split:</span>
                  <span className="text-slate-400">Thực tế vs Chuẩn CFOP</span>
                </div>
                {splitBreakdown.stages.map((st) => (
                  <div key={st.key} className="space-y-0.5 text-[11px]">
                    <div className="flex justify-between font-mono">
                      <span className="font-sans font-medium text-slate-200">
                        {st.label}
                      </span>
                      <span>
                        <strong className="text-cyan-300">
                          {formatTimeMs(st.avgMs, decimals)}
                        </strong>{" "}
                        <span className="text-slate-400">
                          ({st.actualPct}% / chuẩn {st.idealPct}%)
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          st.deltaPct >= 4 ? "bg-amber-400" : "bg-emerald-400"
                        }`}
                        style={{ width: `${Math.min(100, st.actualPct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* AI Practice Coach & Weakness Diagnostic Launch Button */}
      {onOpenAiCoach && (
        <button
          type="button"
          onClick={onOpenAiCoach}
          className="rk-control w-full justify-start text-left text-cyan-200"
        >
          <BrainCircuit className="size-4 shrink-0" aria-hidden="true" />
          Phân tích với AI Coach
        </button>
      )}
    </div>
  );
}

const StatsPanel = memo(StatsPanelInner);
export default StatsPanel;
