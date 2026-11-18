"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  KeyRound,
  Loader2,
  Mail,
  X,
} from "lucide-react";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const configured = isSupabaseConfigured();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg(
        "Chưa cấu hình biến môi trường NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          setErrorMsg(error.message);
        } else {
          onAuthSuccess();
          onClose();
        }
      } else {
        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) {
          setErrorMsg(error.message);
        } else if (data.session) {
          onAuthSuccess();
          onClose();
        } else {
          setInfoMsg(
            "Đăng ký thành công! Vui lòng kiểm tra hộp thư email để xác nhận tài khoản (hoặc tắt Confirm Email trong Supabase Auth để đăng nhập ngay)."
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoading(true);
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 text-white p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg">
              {mode === "signin" ? "Đăng nhập Cloud" : "Tạo tài khoản mới"}
            </h2>
            <p className="text-xs text-slate-400">
              Đồng bộ lịch sử giải Rubik trên mọi thiết bị
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200 space-y-2">
            <div className="font-semibold flex items-center gap-1.5 text-amber-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Chưa kết nối Supabase Cloud DB</span>
            </div>
            <p>
              Hiện tại ứng dụng đang chạy ở <strong>Chế độ Guest</strong> (tự
              động lưu lịch sử trên trình duyệt của bạn).
            </p>
            <p>Để kích hoạt Đăng nhập & Cloud DB khi chạy local hoặc trên Vercel:</p>
            <ol className="list-decimal pl-4 space-y-1 text-amber-100/90">
              <li>Tạo project miễn phí tại <strong>supabase.com</strong></li>
              <li>
                Chạy file <code className="text-cyan-300">supabase/schema.sql</code>{" "}
                trong SQL Editor
              </li>
              <li>
                Điền <code className="text-cyan-300">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
                và <code className="text-cyan-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                vào <code className="text-cyan-300">.env.local</code> hoặc Vercel
                Environment Variables.
              </li>
            </ol>
          </div>
        ) : (
          <>
            {/* Mode Switch Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/40 border border-white/10 mb-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`py-2 rounded-lg transition ${
                  mode === "signin"
                    ? "bg-cyan-500 text-slate-950"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`py-2 rounded-lg transition ${
                  mode === "signup"
                    ? "bg-cyan-500 text-slate-950"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Đăng ký
              </button>
            </div>

            {errorMsg && (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {infoMsg && (
              <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{infoMsg}</span>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-medium">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cuber@example.com"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-black/40 border border-white/15 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1 font-medium">
                  Mật khẩu (tối thiểu 6 ký tự)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-black/40 border border-white/15 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>
                  {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
                </span>
              </button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[11px] uppercase tracking-wider text-slate-400">
                hoặc
              </span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full h-10 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/15 text-sm font-medium flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"
                />
              </svg>
              <span>Tiếp tục với Google</span>
            </button>

            <p className="mt-4 text-[11px] text-center text-slate-400">
              Mọi lượt giải ở chế độ Guest sẽ có thể đồng bộ 1 chạm lên Cloud
              ngay sau khi đăng nhập.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
