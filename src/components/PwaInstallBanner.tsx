"use client";

import React, { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register offline Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const wasDismissed = sessionStorage.getItem("ruktimer_pwa_dismissed");
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;

    if (isStandalone) return;

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    if (isIos && isSafari) {
      setShowIosGuide(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  if (dismissed || (!deferredPrompt && !showIosGuide)) return null;

  const dismiss = () => {
    sessionStorage.setItem("ruktimer_pwa_dismissed", "1");
    setDismissed(true);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-cyan-500/15 via-indigo-500/15 to-emerald-500/15 border-b border-cyan-400/25 px-3 sm:px-6 py-2">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
          {deferredPrompt ? (
            <span>
              Cài đặt <strong>RukTimer</strong> lên màn hình chính điện thoại để
              dùng toàn màn hình & offline!
            </span>
          ) : (
            <span>
              Trên iPhone/iPad: Nhấn nút <strong>Chia sẻ (Share)</strong> trên
              Safari → chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>{" "}
              để dùng như App gốc!
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {deferredPrompt && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-2.5 py-1 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold inline-flex items-center gap-1 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Cài App</span>
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Đóng thông báo"
            className="p-1 rounded hover:bg-white/10 opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
