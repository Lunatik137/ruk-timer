"use client";

import React, { useState } from "react";
import {
  BrainCircuit,
  Check,
  Clock,
  Cloud,
  CloudOff,
  Edit3,
  Flame,
  FolderPlus,
  GraduationCap,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Settings,
  Trash2,
  User,
} from "lucide-react";
import { CubeSession, PUZZLES, PuzzleType } from "@/types/cubing";

export type MainAppView = "timer" | "cfop" | "coach";

interface HeaderProps {
  mainView: MainAppView;
  onChangeMainView: (view: MainAppView) => void;
  sessions: CubeSession[];
  activeSession: CubeSession;
  onSelectSession: (id: string) => void;
  onCreateSession: (name: string, puzzle: PuzzleType) => void;
  onRenameSession: (id: string, name: string) => void;
  onDeleteSession: (id: string) => void;
  onChangePuzzle: (puzzle: PuzzleType) => void;
  userEmail: string | null;
  syncStatus: "guest" | "synced" | "syncing" | "error";
  guestPendingCount: number;
  outboxPendingCount?: number;
  currentStreakDays?: number;
  onSyncGuestData: () => void;
  onOpenStreakTab?: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
}

export default function Header({
  mainView,
  onChangeMainView,
  sessions,
  activeSession,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onChangePuzzle,
  userEmail,
  syncStatus,
  guestPendingCount,
  outboxPendingCount = 0,
  currentStreakDays = 0,
  onSyncGuestData,
  onOpenStreakTab,
  onOpenAuth,
  onSignOut,
  onOpenSettings,
}: HeaderProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(activeSession.name);
  const [isCreating, setIsCreating] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameValue.trim()) {
      onRenameSession(activeSession.id, renameValue.trim());
    }
    setIsRenaming(false);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName =
      newSessionName.trim() || `Session ${sessions.length + 1}`;
    onCreateSession(finalName, activeSession.puzzle);
    setNewSessionName("");
    setIsCreating(false);
  };

  return (
    <header className="w-full border-b border-white/10 bg-black/25 backdrop-blur-md px-3 sm:px-6 py-2.5">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* Brand + Selectors */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="flex items-center gap-2 mr-1 select-none">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-cyan-400 to-emerald-400 p-[2px]">
              <div className="w-full h-full bg-slate-950 rounded-[6px] grid grid-cols-2 gap-[1.5px] p-[3px]">
                <span className="bg-rose-500 rounded-[1px]" />
                <span className="bg-emerald-400 rounded-[1px]" />
                <span className="bg-amber-400 rounded-[1px]" />
                <span className="bg-sky-400 rounded-[1px]" />
              </div>
            </div>
            <span className="font-bold tracking-tight text-base sm:text-lg">
              Ruk<span className="text-cyan-400">Timer</span>
            </span>
          </div>

          {/* Primary Mode Switcher: Timer vs CFOP Academy vs AI Coach & Daily Challenge */}
          <div className="flex items-center p-0.5 rounded-xl bg-white/[0.06] border border-white/10">
            <button
              type="button"
              aria-pressed={mainView === "timer"}
              onClick={(e) => {
                onChangeMainView("timer");
                e.currentTarget.blur();
              }}
              className={`h-8 px-2.5 sm:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                mainView === "timer"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Timer</span>
            </button>
            <button
              type="button"
              aria-pressed={mainView === "cfop"}
              onClick={(e) => {
                onChangeMainView("cfop");
                e.currentTarget.blur();
              }}
              className={`h-8 px-2.5 sm:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                mainView === "cfop"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Học & Luyện CFOP</span>
            </button>
            <button
              type="button"
              aria-pressed={mainView === "coach"}
              onClick={(e) => {
                onChangeMainView("coach");
                e.currentTarget.blur();
              }}
              className={`h-8 px-2.5 sm:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                mainView === "coach"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>AI Coach & Thử thách</span>
            </button>
          </div>

          {/* Puzzle Selector */}
          <select
            aria-label="Chọn loại Rubik"
            value={activeSession.puzzle}
            onChange={(e) => {
              onChangePuzzle(e.target.value as PuzzleType);
              e.currentTarget.blur();
            }}
            className="h-9 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 px-2.5 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition cursor-pointer"
          >
            {PUZZLES.map((p) => (
              <option
                key={p.id}
                value={p.id}
                className="bg-slate-900 text-white"
              >
                {p.label}
              </option>
            ))}
          </select>

          {/* Session Selector & Actions */}
          {!isRenaming && !isCreating ? (
            <div className="flex items-center gap-1">
              <select
                aria-label="Chọn phiên giải"
                value={activeSession.id}
                onChange={(e) => {
                  onSelectSession(e.target.value);
                  e.currentTarget.blur();
                }}
                className="h-9 max-w-[155px] sm:max-w-[195px] rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 px-2.5 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition cursor-pointer"
              >
                {sessions.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                    className="bg-slate-900 text-white"
                  >
                    {s.name} ({s.puzzle.toUpperCase()})
                  </option>
                ))}
              </select>

              <button
                type="button"
                title="Tạo Session mới"
                aria-label="Tạo Session mới"
                onClick={() => setIsCreating(true)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 transition"
              >
                <FolderPlus className="w-4 h-4 text-cyan-400" />
              </button>

              <button
                type="button"
                title="Đổi tên Session"
                aria-label="Đổi tên Session"
                onClick={() => {
                  setRenameValue(activeSession.name);
                  setIsRenaming(true);
                }}
                className="h-9 w-9 hidden sm:inline-flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 transition"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-300" />
              </button>

              {sessions.length > 1 && (
                <button
                  type="button"
                  title="Xóa Session hiện tại"
                  aria-label="Xóa Session hiện tại"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Xóa session "${activeSession.name}" và toàn bộ lịch sử trong session này?`
                      )
                    ) {
                      onDeleteSession(activeSession.id);
                    }
                  }}
                  className="h-9 w-9 hidden sm:inline-flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-rose-500/20 hover:text-rose-400 border border-white/10 transition"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-300" />
                </button>
              )}
            </div>
          ) : isRenaming ? (
            <form
              onSubmit={handleRenameSubmit}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Tên session..."
                className="h-9 w-36 sm:w-44 rounded-lg bg-slate-900 border border-cyan-500/50 px-2.5 text-xs sm:text-sm text-white focus:outline-none"
              />
              <button
                type="submit"
                className="h-9 px-2.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Lưu
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="h-9 px-2 rounded-lg bg-white/10 text-xs"
              >
                Hủy
              </button>
            </form>
          ) : (
            <form
              onSubmit={handleCreateSubmit}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                autoFocus
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder={`Session ${sessions.length + 1}`}
                className="h-9 w-36 sm:w-44 rounded-lg bg-slate-900 border border-emerald-500/50 px-2.5 text-xs sm:text-sm text-white focus:outline-none"
              />
              <button
                type="submit"
                className="h-9 px-2.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Tạo
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="h-9 px-2 rounded-lg bg-white/10 text-xs"
              >
                Hủy
              </button>
            </form>
          )}
        </div>

        {/* Right Controls: Streak Pill + Sync Badge + Auth + Settings */}
        <div className="flex items-center gap-2">
          {/* Training Streak Badge */}
          <button
            type="button"
            onClick={onOpenStreakTab}
            title="Xem chuỗi ngày luyện tập & Biểu đồ nhiệt"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 transition"
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span>{currentStreakDays}d</span>
          </button>

          {/* Sync Status Pill */}
          <div
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
              syncStatus === "synced"
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                : syncStatus === "syncing"
                ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/25"
                : syncStatus === "error"
                ? "bg-rose-500/10 text-rose-300 border-rose-500/25"
                : "bg-amber-500/10 text-amber-300 border-amber-500/25"
            }`}
          >
            {syncStatus === "syncing" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang đồng bộ Cloud...</span>
              </>
            ) : syncStatus === "synced" ? (
              <>
                <Cloud className="w-3.5 h-3.5" />
                <span>
                  {outboxPendingCount > 0
                    ? `Chờ đồng bộ (${outboxPendingCount})`
                    : "Cloud DB đã lưu"}
                </span>
              </>
            ) : syncStatus === "error" ? (
              <>
                <CloudOff className="w-3.5 h-3.5" />
                <span>
                  Lưu Offline ({outboxPendingCount > 0 ? outboxPendingCount : 1})
                </span>
              </>
            ) : (
              <>
                <CloudOff className="w-3.5 h-3.5" />
                <span>Guest (Lưu trên máy)</span>
              </>
            )}
          </div>

          {/* Sync Guest Solves Prompt Button */}
          {userEmail && guestPendingCount > 0 && (
            <button
              type="button"
              onClick={onSyncGuestData}
              title="Đồng bộ lịch sử giải lúc chưa đăng nhập lên Cloud"
              className="h-9 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-medium inline-flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Đồng bộ +{guestPendingCount} lượt Guest</span>
            </button>
          )}

          {/* Account / Login */}
          {userEmail ? (
            <div className="flex items-center gap-1.5">
              <div className="h-9 px-2.5 rounded-lg bg-white/[0.06] border border-white/10 inline-flex items-center gap-1.5 text-xs">
                <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="max-w-[100px] sm:max-w-[145px] truncate text-slate-200">
                  {userEmail}
                </span>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Đăng xuất"
                aria-label="Đăng xuất"
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-rose-500/20 hover:text-rose-300 border border-white/10 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="h-9 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 transition"
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng nhập</span>
            </button>
          )}

          {/* Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Cài đặt & Sao lưu"
            aria-label="Cài đặt & Sao lưu"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
