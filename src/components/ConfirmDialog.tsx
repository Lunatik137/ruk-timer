"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, Cloud, Loader2, X } from "lucide-react";

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  affectedSummary?: string;
  syncScopeWarning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmDialogProps {
  open: boolean;
  options: ConfirmDialogOptions | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDialog({
  open,
  options,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // Default focus to "Hủy" whenever the dialog opens to prevent accidental Enter deletes
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 10);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, busy, onCancel]);

  if (!open || !options) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-md rk-dialog text-white p-5 sm:p-6 relative space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          aria-label="Đóng hộp thoại"
          className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-40 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2
              id="confirm-dialog-title"
              className="font-bold text-base sm:text-lg leading-snug"
            >
              {options.title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="text-xs sm:text-sm text-slate-300 leading-relaxed"
            >
              {options.description}
            </p>
          </div>
        </div>

        {options.affectedSummary && (
          <div className="rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-xs text-slate-200 font-medium">
            {options.affectedSummary}
          </div>
        )}

        {options.syncScopeWarning && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 px-3.5 py-2.5 text-xs text-amber-200 flex items-start gap-2">
            <Cloud className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{options.syncScopeWarning}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            ref={cancelBtnRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs sm:text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-40 transition"
          >
            {options.cancelLabel || "Hủy"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition ${
              options.destructive === false
                ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                : "bg-rose-500 hover:bg-rose-400 text-white"
            }`}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{options.confirmLabel || "Xác nhận xóa"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
