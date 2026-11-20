"use client";

import React, { memo, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  History,
  Layers,
  MessageSquare,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatSolveDisplay, formatTimeMs } from "@/lib/stats";
import { PenaltyType, SolveWithRollingStats } from "@/types/cubing";

interface HistoryPanelProps {
  enrichedSolves: SolveWithRollingStats[];
  bestSingleSolveId: string | null;
  decimals: 2 | 3;
  onSelectSolve: (solve: SolveWithRollingStats) => void;
  onTogglePenalty: (solveId: string, nextPenalty: PenaltyType) => void;
  onDeleteSolve: (solveId: string) => void;
  onClearSession: () => void;
}

const PAGE_WINDOW_STEP = 120;

function HistoryPanelInner({
  enrichedSolves,
  bestSingleSolveId,
  decimals,
  onSelectSolve,
  onTogglePenalty,
  onDeleteSolve,
  onClearSession,
}: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_WINDOW_STEP);

  // Reverse chronological so newest solve is on top
  const reversedSolves = useMemo(() => {
    const rev = [...enrichedSolves].reverse();
    if (!searchQuery.trim()) return rev;
    const q = searchQuery.toLowerCase();
    return rev.filter(
      (s) =>
        s.comment.toLowerCase().includes(q) ||
        s.scramble.toLowerCase().includes(q) ||
        formatSolveDisplay(s, decimals).toLowerCase().includes(q)
    );
  }, [enrichedSolves, searchQuery, decimals]);

  // Windowed slice prevents rendering thousands of DOM nodes during 60fps timer operation
  const visibleSolves = useMemo(
    () => reversedSolves.slice(0, visibleLimit),
    [reversedSolves, visibleLimit]
  );

  return (
    <div className="rk-panel rk-history flex flex-col lg:h-full lg:max-h-[calc(100dvh-140px)]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>Lịch sử giải ({enrichedSolves.length})</span>
        </div>

        {enrichedSolves.length > 0 && (
          <button
            type="button"
            onClick={() => onClearSession()}
            className="min-h-11 text-xs px-2 py-1 rounded-lg border inline-flex items-center gap-1 transition bg-white/[0.05] hover:bg-rose-500/20 hover:text-rose-300 border-white/10 text-slate-300"
          >
            <Trash2 className="w-3 h-3" />
            <span>Xóa hết</span>
          </button>
        )}
      </div>

      {/* Filter Input */}
      {enrichedSolves.length > 4 && (
        <div className="px-3 py-2 border-b border-white/5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="Tìm lượt giải"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleLimit(PAGE_WINDOW_STEP);
              }}
              placeholder="Tìm thời gian, ghi chú, scramble..."
              className="w-full min-h-11 pl-8 pr-12 rounded-lg bg-black/25 border border-white/10 text-xs focus:outline-none focus:border-cyan-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Xóa từ khóa tìm kiếm"
                onClick={() => setSearchQuery("")}
                className="absolute right-0 top-0 grid h-full w-11 place-items-center text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 divide-y divide-white/[0.04] lg:overflow-y-auto">
        <div className="rk-history-line border-b border-white/5 px-3 py-2 text-xs font-medium text-slate-400">
          <div className="rk-history-values">
            <span>#</span>
            <span>Time</span>
            <span className="text-right">Ao5</span>
          </div>
          <span className="rk-history-actions text-right">Thao tác</span>
        </div>
        {visibleSolves.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs text-slate-400">
            {enrichedSolves.length === 0
              ? "Lượt giải đã lưu sẽ hiện ở đây."
              : "Không tìm thấy kết quả phù hợp."}
          </div>
        ) : (
          <>
            {visibleSolves.map((s) => {
              const isPb = s.id === bestSingleSolveId;
              const hasSplits =
                Array.isArray(s.splits_ms) && s.splits_ms.length === 4;
              return (
                <div
                  key={s.id}
                  className="rk-history-line group items-center px-3 text-xs hover:bg-white/[0.05]"
                >
                  <button
                    type="button"
                    aria-label={`Chi tiết lượt #${s.indexNumber}`}
                    onClick={() => onSelectSolve(s)}
                    className="rk-history-values min-h-11 items-center rounded-lg py-2 text-left font-mono tabular-nums"
                  >
                    <span className="text-slate-400 [overflow-wrap:anywhere]">{s.indexNumber}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-1 font-semibold">
                      <span className={`[overflow-wrap:anywhere] ${s.penalty === "DNF" ? "text-rose-400"
                        : s.penalty === "+2" ? "text-amber-300" : isPb ? "text-emerald-400" : ""}`}>
                        {formatSolveDisplay(s, decimals)}
                      </span>
                      {isPb && <span className="rounded border border-emerald-500/30 bg-emerald-500/20 px-1 font-sans text-[10px] text-emerald-300">PB</span>}
                      {hasSplits && (
                        <span title="Có dữ liệu 4 pha CFOP Split">
                          <Layers aria-hidden="true" className="size-3 shrink-0 text-indigo-400" />
                        </span>
                      )}
                      {s.comment && <MessageSquare aria-hidden="true" className="size-3 shrink-0 text-cyan-400" />}
                    </span>
                    <span className="text-right text-slate-300 [overflow-wrap:anywhere]">
                      {formatTimeMs(s.rollingAo5, decimals)}
                    </span>
                    <ChevronRight aria-hidden="true" className="rk-history-chevron size-4 text-slate-400" />
                  </button>

                  <div className="rk-history-actions items-center justify-end gap-1">
                    <button
                      type="button"
                      title="Phạt +2s"
                      aria-pressed={s.penalty === "+2"}
                      aria-label={`Phạt +2 giây cho lượt #${s.indexNumber}`}
                      onClick={() =>
                        onTogglePenalty(
                          s.id,
                          s.penalty === "+2" ? "OK" : "+2"
                        )
                      }
                      className={`min-h-[26px] px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                        s.penalty === "+2"
                          ? "bg-amber-400 text-slate-950"
                          : "bg-white/[0.06] hover:bg-amber-400/20 opacity-70 group-hover:opacity-100"
                      }`}
                    >
                      +2
                    </button>
                    <button
                      type="button"
                      title="Phạt DNF"
                      aria-pressed={s.penalty === "DNF"}
                      aria-label={`Đánh dấu DNF cho lượt #${s.indexNumber}`}
                      onClick={() =>
                        onTogglePenalty(
                          s.id,
                          s.penalty === "DNF" ? "OK" : "DNF"
                        )
                      }
                      className={`min-h-[26px] px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                        s.penalty === "DNF"
                          ? "bg-rose-500 text-white"
                          : "bg-white/[0.06] hover:bg-rose-500/20 opacity-70 group-hover:opacity-100"
                      }`}
                    >
                      DNF
                    </button>
                    <button
                      type="button"
                      title="Xóa lượt giải"
                      aria-label={`Xóa lượt #${s.indexNumber}`}
                      onClick={() => onDeleteSolve(s.id)}
                      className="min-h-[26px] min-w-[26px] inline-flex items-center justify-center p-1 rounded hover:bg-rose-500/20 hover:text-rose-400 opacity-60 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            {reversedSolves.length > visibleLimit && (
              <div className="p-2.5 text-center">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleLimit((l) => l + PAGE_WINDOW_STEP)
                  }
                  className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs text-cyan-300 font-medium inline-flex items-center gap-1 transition"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>
                    Tải thêm ({reversedSolves.length - visibleLimit} lượt cũ hơn)
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const HistoryPanel = memo(HistoryPanelInner);
export default HistoryPanel;
