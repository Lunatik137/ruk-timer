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
  MoreHorizontal,
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

  const sessionActions = [
    { label: "Tạo phiên mới", Icon: FolderPlus, onClick: () => setIsCreating(true) },
    { label: "Đổi tên phiên", Icon: Edit3, onClick: () => {
      setRenameValue(activeSession.name);
      setIsRenaming(true);
    } },
    ...(sessions.length > 1 ? [{
      label: "Xóa phiên hiện tại", Icon: Trash2, onClick: () => onDeleteSession(activeSession.id),
    }] : []),
  ];

  return (
    <header className="w-full border-b border-white/10 bg-slate-950/80 px-3 sm:px-6 py-2.5">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5">
        {/* Brand + Selectors */}
        <div className="contents min-w-0 lg:flex lg:flex-wrap lg:items-center lg:gap-2.5">
          <div className="order-1 flex items-center gap-2 select-none lg:order-none lg:mr-1">
            <div className="w-7 h-7 rounded-lg border border-cyan-300/60 bg-slate-950 p-px">
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
          <nav aria-label="Chế độ luyện tập" className="hidden items-center rounded-xl border border-white/10 bg-white/[0.06] p-0.5 lg:flex">
            <button
              type="button"
              aria-pressed={mainView === "timer"}
              onClick={(event) => {
                onChangeMainView("timer");
                if (event.detail > 0) event.currentTarget.blur();
              }}
              className={`h-8 px-2.5 2xl:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
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
              onClick={() => onChangeMainView("cfop")}
              className={`h-8 px-2.5 2xl:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
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
              onClick={() => onChangeMainView("coach")}
              className={`h-8 px-2.5 2xl:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                mainView === "coach"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>AI Coach & Video</span>
            </button>
          </nav>

          <div className={`order-3 grid w-full gap-2 lg:contents ${
            isCreating || isRenaming ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
          }`}>
            <select
              aria-label="Chọn loại Rubik"
              value={activeSession.puzzle}
              onChange={(e) => {
                onChangePuzzle(e.target.value as PuzzleType);
              }}
              className={`h-11 min-w-0 rounded-lg border border-white/15 bg-white/[0.06] px-2 text-sm hover:bg-white/10 lg:h-9 lg:w-36 2xl:w-auto ${isCreating || isRenaming ? "hidden lg:block" : ""}`}
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
              <div className="flex min-w-0 items-center gap-2">
                <select
                  aria-label="Chọn phiên giải"
                  value={activeSession.id}
                  onChange={(e) => onSelectSession(e.target.value)}
                  className="h-11 min-w-0 flex-1 truncate rounded-lg border border-white/15 bg-white/[0.06] px-2 text-sm hover:bg-white/10 lg:h-9 lg:max-w-[8.5rem] 2xl:max-w-48"
                >
                  {sessions.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      className="bg-slate-900 text-white"
                    >
                      {s.name}
                    </option>
                  ))}
                </select>

                <details
                  className="relative shrink-0 lg:hidden"
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && event.currentTarget.open) {
                      event.preventDefault();
                      event.currentTarget.open = false;
                      event.currentTarget.querySelector("summary")?.focus();
                    }
                  }}
                >
                  <summary
                    aria-label="Quản lý phiên giải"
                    className="grid size-11 cursor-pointer list-none place-items-center rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/10 [&::-webkit-details-marker]:hidden"
                  >
                    <MoreHorizontal aria-hidden="true" className="size-5" />
                  </summary>
                  <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-white/15 bg-slate-900 p-1 shadow-lg">
                    {sessionActions.map(({ label, Icon, onClick }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={(event) => {
                          const details = event.currentTarget.closest("details");
                          if (details) {
                            details.open = false;
                            details.querySelector("summary")?.focus();
                          }
                          onClick();
                        }}
                        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-white/10"
                      >
                        <Icon aria-hidden="true" className="size-4 text-cyan-200" />
                        {label}
                      </button>
                    ))}
                  </div>
                </details>
                <div className="hidden items-center gap-1 lg:flex">
                  {sessionActions.map(({ label, Icon, onClick }) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      title={label}
                      onClick={onClick}
                      className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10"
                    >
                      <Icon aria-hidden="true" className="size-4" />
                    </button>
                  ))}
                </div>
              </div>
            ) : isRenaming ? (
              <form
                onSubmit={handleRenameSubmit}
                className="flex min-w-0 items-center gap-2"
              >
                <input
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  aria-label="Tên phiên"
                  placeholder="Tên phiên"
                  className="h-11 min-w-0 flex-1 lg:h-9 lg:w-44 rounded-lg bg-slate-900 border border-cyan-500/50 px-2.5 text-base text-white lg:text-sm"
                />
                <button
                  type="submit"
                  className="h-11 shrink-0 px-2.5 lg:h-9 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Lưu
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="min-h-11 shrink-0 rounded-lg bg-white/10 px-3 text-xs lg:min-h-9"
                >
                  Hủy
                </button>
              </form>
            ) : (
              <form
                onSubmit={handleCreateSubmit}
                className="flex min-w-0 items-center gap-2"
              >
                <input
                  type="text"
                  autoFocus
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  aria-label="Tên phiên mới"
                  placeholder={`Session ${sessions.length + 1}`}
                  className="h-11 min-w-0 flex-1 lg:h-9 lg:w-44 rounded-lg bg-slate-900 border border-emerald-500/50 px-2.5 text-base text-white lg:text-sm"
                />
                <button
                  type="submit"
                  className="h-11 shrink-0 px-2.5 lg:h-9 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Tạo
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="min-h-11 shrink-0 rounded-lg bg-white/10 px-3 text-xs lg:min-h-9"
                >
                  Hủy
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Controls: Streak Pill + Sync Badge + Auth + Settings */}
        <div className="order-2 flex min-w-0 items-center gap-2 lg:order-none lg:ml-auto">
          {/* Training Streak Badge */}
          <button
            type="button"
            onClick={onOpenStreakTab}
            title="Xem chuỗi ngày luyện tập & Biểu đồ nhiệt"
            className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 transition"
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span>{currentStreakDays}d</span>
          </button>

          {/* Sync Status Pill */}
          <div
            className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
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
                <span>Guest · Trên máy</span>
              </>
            )}
          </div>

          {/* Sync Guest Solves Prompt Button */}
          {userEmail && guestPendingCount > 0 && (
            <button
              type="button"
              onClick={onSyncGuestData}
              title="Đồng bộ lịch sử giải lúc chưa đăng nhập lên Cloud"
              className="h-11 shrink-0 px-2.5 lg:h-9 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-medium inline-flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="sr-only lg:not-sr-only">Đồng bộ +{guestPendingCount} lượt Guest</span>
            </button>
          )}

          {/* Account / Login */}
          {userEmail ? (
            <div className="flex items-center gap-1.5">
              <div className="h-11 shrink-0 px-2.5 lg:h-9 rounded-lg bg-white/[0.06] border border-white/10 inline-flex items-center gap-1.5 text-xs">
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
                className="h-11 w-11 lg:h-9 lg:w-9 inline-flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-rose-500/20 hover:text-rose-300 border border-white/10 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="h-11 lg:h-9 px-3 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/10 text-slate-100 font-semibold text-xs sm:text-sm inline-flex items-center gap-1.5 transition"
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
            className="h-11 w-11 lg:h-9 lg:w-9 inline-flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
