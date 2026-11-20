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
    <div className="w-full border-b border-white/10 bg-[var(--rk-surface)] px-3 sm:px-6">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Smartphone aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
          {deferredPrompt ? (
            <span>
              Cài RukTimer để tập cả khi mất mạng
            </span>
          ) : (
            <span>
              Trong Safari, mở <strong>Chia sẻ</strong> rồi chọn{" "}
              <strong>Thêm vào màn hình chính</strong>.
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {deferredPrompt && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-slate-100 transition-colors hover:bg-white/10"
            >
              <Download aria-hidden="true" className="size-4" />
              <span>Cài app</span>
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Đóng thông báo"
            className="grid min-h-11 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
