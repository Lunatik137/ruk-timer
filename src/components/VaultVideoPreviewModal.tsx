"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Loader2,
  RefreshCw,
  Video,
  X,
} from "lucide-react";
import type { UserFileRecord } from "@/types/cubing";

interface VaultVideoPreviewModalProps {
  file: UserFileRecord | null;
  onClose: () => void;
  onDownload: (file: UserFileRecord) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function VaultVideoPreviewModal({
  file,
  onClose,
  onDownload,
}: VaultVideoPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [expiresInSec, setExpiresInSec] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const stopPlayback = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  const handleClose = useCallback(() => {
    stopPlayback();
    onClose();
  }, [onClose, stopPlayback]);

  useEffect(() => {
    if (!file) {
      stopPlayback();
      setViewUrl(null);
      setExpiresAt(null);
      setExpiresInSec(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setViewUrl(null);

    void fetch(`/api/files/${file.id}/view`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!res.ok || !data.viewUrl) {
          setError(data.error || "Không thể tạo liên kết xem video.");
          return;
        }
        const ttl = Number(data.expiresInSec || 300);
        setViewUrl(data.viewUrl);
        setExpiresInSec(ttl);
        setExpiresAt(Date.now() + ttl * 1000);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Lỗi kết nối khi yêu cầu liên kết xem video.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      stopPlayback();
    };
  }, [file, reloadCount, stopPlayback]);

  useEffect(() => {
    if (!file) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [file, handleClose]);

  if (!file) return null;

  const handleVideoError = () => {
    const expired = expiresAt !== null && Date.now() >= expiresAt;
    if (expired) {
      setError(
        "Liên kết xem video đã hết hạn. Hãy bấm 'Tải lại liên kết' để tiếp tục xem."
      );
    } else {
      setError(
        "Không thể phát video này (liên kết có thể đã hết hạn hoặc định dạng không tương thích). Hãy tải lại liên kết hoặc tải xuống thiết bị."
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vault-video-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <div className="min-w-0 flex items-center gap-2">
            <Video className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h3
                id="vault-video-modal-title"
                className="text-sm font-bold text-white truncate"
              >
                {file.filename}
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {file.content_type} • {formatFileSize(file.size_bytes)}
                {expiresInSec
                  ? ` • Liên kết riêng tư có hiệu lực ${Math.round(expiresInSec / 60)} phút`
                  : ""}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            aria-label="Đóng trình phát video"
            className="min-h-11 min-w-11 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 inline-flex items-center justify-center shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Video Body */}
        <div className="p-3 sm:p-4 bg-black/50 flex-1 overflow-y-auto flex flex-col justify-center">
          {loading ? (
            <div
              role="status"
              className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-slate-300"
            >
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" aria-hidden="true" />
              <span>Đang xác thực và tạo liên kết xem video...</span>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-400/35 bg-rose-500/10 p-4 space-y-3 text-xs text-rose-100"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
                <p>{error}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReloadCount((c) => c + 1)}
                  className="min-h-11 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold inline-flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Tải lại liên kết</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDownload(file)}
                  className="min-h-11 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100 font-medium inline-flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Tải xuống</span>
                </button>
              </div>
            </div>
          ) : viewUrl ? (
            <video
              ref={videoRef}
              key={viewUrl}
              src={viewUrl}
              controls
              playsInline
              preload="metadata"
              onError={handleVideoError}
              className="w-full max-h-[60dvh] rounded-xl bg-black object-contain"
            />
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-white/10 bg-slate-900">
          <button
            type="button"
            onClick={() => onDownload(file)}
            className="min-h-11 px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-cyan-200 text-xs font-medium inline-flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tải xuống</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-11 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
