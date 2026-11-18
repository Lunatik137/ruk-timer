"use client";

import React, { useState } from "react";
import { Check, Copy, Edit2, RotateCcw, Shuffle } from "lucide-react";

interface ScrambleBarProps {
  scramble: string;
  previousScramble: string | null;
  onNextScramble: () => void;
  onRestorePreviousScramble: () => void;
  onSetCustomScramble: (custom: string) => void;
}

export default function ScrambleBar({
  scramble,
  previousScramble,
  onNextScramble,
  onRestorePreviousScramble,
  onSetCustomScramble,
}: ScrambleBarProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftScramble, setDraftScramble] = useState(scramble);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scramble);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftScramble.trim()) {
      onSetCustomScramble(draftScramble.trim());
    }
    setIsEditing(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md px-4 py-3 sm:px-6 sm:py-4 shadow-lg">
        {!isEditing ? (
          <div className="flex flex-col items-center gap-2.5">
            <p className="font-mono text-center text-base sm:text-xl md:text-2xl font-medium tracking-wide leading-relaxed select-all break-words max-w-full">
              {scramble}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              {previousScramble && (
                <button
                  type="button"
                  onClick={(e) => {
                    onRestorePreviousScramble();
                    e.currentTarget.blur();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 inline-flex items-center gap-1 opacity-80 hover:opacity-100 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Scramble trước</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  onNextScramble();
                  e.currentTarget.blur();
                }}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 inline-flex items-center gap-1 font-medium transition"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Scramble mới (Alt+N)</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  handleCopy();
                  e.currentTarget.blur();
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 inline-flex items-center gap-1 opacity-80 hover:opacity-100 transition"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Đã copy</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDraftScramble(scramble);
                  setIsEditing(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 inline-flex items-center gap-1 opacity-80 hover:opacity-100 transition"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Tùy chỉnh</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCustomSubmit} className="flex flex-col gap-2.5">
            <label className="text-xs uppercase tracking-wider opacity-60 font-semibold">
              Nhập công thức Scramble tùy chỉnh:
            </label>
            <textarea
              rows={2}
              autoFocus
              value={draftScramble}
              onChange={(e) => setDraftScramble(e.target.value)}
              className="w-full rounded-xl bg-slate-950/80 border border-cyan-500/50 px-3 py-2 font-mono text-sm text-white focus:outline-none"
              placeholder="Ví dụ: R U R' U' F' U2 F..."
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-medium"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold"
              >
                Áp dụng Scramble
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
