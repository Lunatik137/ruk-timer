"use client";

import React, { memo, useMemo, useState } from "react";
import {
  ChevronDown,
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
  const [confirmClear, setConfirmClear] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_WINDOW_STEP);

  React.useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

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
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] flex flex-col h-full max-h-[560px] lg:max-h-[calc(100vh-140px)] overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>Lịch sử giải ({enrichedSolves.length})</span>
        </div>

        {enrichedSolves.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirmClear) {
                setConfirmClear(false);
                onClearSession();
              } else {
                setConfirmClear(true);
              }
            }}
            className={`text-[11px] px-2 py-1 rounded-lg border inline-flex items-center gap-1 transition ${
              confirmClear
                ? "bg-rose-500 text-white border-rose-400 font-semibold"
                : "bg-white/[0.05] hover:bg-rose-500/20 hover:text-rose-300 border-white/10 text-slate-300"
            }`}
          >
            <Trash2 className="w-3 h-3" />
            <span>{confirmClear ? "Xác nhận xóa?" : "Xóa hết"}</span>
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
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleLimit(PAGE_WINDOW_STEP);
              }}
              placeholder="Tìm thời gian, ghi chú, scramble..."
              className="w-full h-8 pl-8 pr-7 rounded-lg bg-black/25 border border-white/10 text-xs focus:outline-none focus:border-cyan-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Xóa từ khóa tìm kiếm"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Column Headers */}
      <div className="grid grid-cols-12 px-3.5 py-1.5 border-b border-white/5 text-[11px] text-slate-400 font-medium">
        <div className="col-span-2">#</div>
        <div className="col-span-4">Time</div>
        <div className="col-span-3 text-right">Ao5</div>
        <div className="col-span-3 text-right">Thao tác</div>
      </div>

      {/* Scrollable Windowed List */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
        {visibleSolves.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs text-slate-400">
            {enrichedSolves.length === 0
              ? "Chưa có lượt giải nào trong session này. Nhấn Space để bắt đầu!"
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
                  onClick={() => onSelectSolve(s)}
                  className="grid grid-cols-12 items-center px-3.5 py-2 text-xs hover:bg-white/[0.05] cursor-pointer transition group"
                >
                  <div className="col-span-2 font-mono tabular-nums text-slate-400">
                    {s.indexNumber}
                  </div>

                  <div className="col-span-4 font-mono tabular-nums font-semibold flex items-center gap-1">
                    <span
                      className={
                        s.penalty === "DNF"
                          ? "text-rose-400"
                          : s.penalty === "+2"
                          ? "text-amber-300"
                          : isPb
                          ? "text-emerald-400"
                          : ""
                      }
                    >
                      {formatSolveDisplay(s, decimals)}
                    </span>
                    {isPb && (
                      <span className="text-[9px] font-sans px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        PB
                      </span>
                    )}
                    {hasSplits && (
                      <span title="Có dữ liệu 4 pha CFOP Split">
                        <Layers className="w-3 h-3 text-indigo-400 shrink-0" />
                      </span>
                    )}
                    {s.comment && (
                      <MessageSquare className="w-3 h-3 text-cyan-400 shrink-0" />
                    )}
                  </div>

                  <div className="col-span-3 text-right font-mono tabular-nums text-slate-300">
                    {formatTimeMs(s.rollingAo5, decimals)}
                  </div>

                  <div
                    className="col-span-3 flex items-center justify-end gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="Phạt +2s"
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
