"use client";

import React, { useEffect, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Sliders,
  Upload,
  X,
} from "lucide-react";
import type { ImportPlan } from "@/lib/storage";
import {
  SplitMode,
  ThemeId,
  TimerSettings,
  TimerUpdateMode,
} from "@/types/cubing";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TimerSettings;
  onUpdateSettings: (patch: Partial<TimerSettings>) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImportJsonFile: (file: File) => void;
  pendingImportPlan?: ImportPlan | null;
  importFileName?: string | null;
  isImporting?: boolean;
  onConfirmImport?: () => void;
  onCancelImport?: () => void;
}

const THEMES: { id: ThemeId; label: string; preview: string }[] = [
  {
    id: "midnight",
    label: "Midnight Slate",
    preview: "bg-[#181b1e]",
  },
  {
    id: "cyber",
    label: "Cyber Neon",
    preview: "bg-[#201c2c]",
  },
  {
    id: "emerald",
    label: "Forest Matrix",
    preview: "bg-[#172420]",
  },
  {
    id: "light",
    label: "Clean Dark Frost",
    preview: "bg-[#212c3a]",
  },
];

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onExportJson,
  onExportCsv,
  onImportJsonFile,
  pendingImportPlan = null,
  importFileName = null,
  isImporting = false,
  onConfirmImport,
  onCancelImport,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rk-dialog text-white p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 id="settings-modal-title" className="font-bold text-lg">
              Cài đặt Timer & Dữ liệu
            </h2>
            <p className="text-xs text-slate-400">
              Tùy chỉnh chuẩn thi đấu WCA, Split Timer, giao diện và nhập dữ liệu csTimer
            </p>
          </div>
        </div>

        <div className="space-y-3.5 text-sm">
          {/* WCA Inspection */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">WCA Inspection (15 giây)</div>
              <div className="text-xs text-slate-400">
                Đếm ngược 15s trước khi giải (+2s ở 15–17s, DNF sau 17s)
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.inspectionEnabled}
              onChange={(e) =>
                onUpdateSettings({ inspectionEnabled: e.target.checked })
              }
              className="w-5 h-5 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* WCA Voice Referee */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">
                Giọng đọc Trọng tài WCA (8s / 12s)
              </div>
              <div className="text-xs text-slate-400">
                Đọc to &ldquo;Eight seconds&rdquo; và &ldquo;Twelve seconds&rdquo; khi đang Inspection
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(settings.voiceAlertsEnabled)}
              onChange={(e) =>
                onUpdateSettings({ voiceAlertsEnabled: e.target.checked })
              }
              className="w-5 h-5 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Multi-Phase Split Timer */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">
                Chế độ Split Timer (Tách giai đoạn)
              </div>
              <div className="text-xs text-slate-400">
                Nhấn Space sau mỗi bước để đo riêng Cross, F2L, OLL, PLL
              </div>
            </div>
            <select
              value={settings.splitMode || "off"}
              onChange={(e) =>
                onUpdateSettings({ splitMode: e.target.value as SplitMode })
              }
              className="h-9 rounded-lg bg-slate-950 border border-white/15 px-2.5 text-xs"
            >
              <option value="off">Tắt (1 pha tiêu chuẩn)</option>
              <option value="cfop4">4 Pha CFOP (Cross/F2L/OLL/PLL)</option>
            </select>
          </div>

          {/* Timer Display Update Mode */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">Hiển thị đồng hồ khi đang chạy</div>
              <div className="text-xs text-slate-400">
                Ẩn số nhảy liên tục giúp mắt tập trung tối đa vào Lookahead
              </div>
            </div>
            <select
              value={settings.timerUpdateMode || "live"}
              onChange={(e) =>
                onUpdateSettings({
                  timerUpdateMode: e.target.value as TimerUpdateMode,
                })
              }
              className="h-9 rounded-lg bg-slate-950 border border-white/15 px-2.5 text-xs"
            >
              <option value="live">Cập nhật liên tục (0.01s)</option>
              <option value="seconds">Chỉ hiện số giây (1s)</option>
              <option value="hidden">Ẩn số (&ldquo;GIẢI...&rdquo;)</option>
            </select>
          </div>

          {/* Hold Delay */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">Thời gian nhấn giữ Space</div>
              <div className="text-xs text-slate-400">
                0.55s là chuẩn Stackmat WCA; 0.3s phản hồi nhanh
              </div>
            </div>
            <select
              value={settings.holdDelayMs}
              onChange={(e) =>
                onUpdateSettings({ holdDelayMs: Number(e.target.value) })
              }
              className="h-9 rounded-lg bg-slate-950 border border-white/15 px-2.5 text-xs"
            >
              <option value={0}>0.0s (Tức thì)</option>
              <option value={300}>0.30s (Mặc định)</option>
              <option value={550}>0.55s (Chuẩn WCA)</option>
            </select>
          </div>

          {/* Target Sub-X Goal */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">Mục tiêu cá nhân (Sub-X Goal)</div>
              <div className="text-xs text-slate-400">
                Dùng để tính tỷ lệ đạt mục tiêu và thời gian cần ở vòng thi WCA
              </div>
            </div>
            <select
              value={settings.targetGoalMs || 15000}
              onChange={(e) =>
                onUpdateSettings({ targetGoalMs: Number(e.target.value) })
              }
              className="h-9 rounded-lg bg-slate-950 border border-white/15 px-2.5 text-xs"
            >
              <option value={8000}>Sub-8 giây</option>
              <option value={10000}>Sub-10 giây</option>
              <option value={12000}>Sub-12 giây</option>
              <option value={15000}>Sub-15 giây</option>
              <option value={20000}>Sub-20 giây</option>
              <option value={30000}>Sub-30 giây</option>
              <option value={45000}>Sub-45 giây</option>
            </select>
          </div>

          {/* Decimals */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">Chữ số thập phân</div>
              <div className="text-xs text-slate-400">
                Hiển thị 0.01s hoặc 0.001s
              </div>
            </div>
            <select
              value={settings.decimals}
              onChange={(e) =>
                onUpdateSettings({
                  decimals: Number(e.target.value) as 2 | 3,
                })
              }
              className="h-9 rounded-lg bg-slate-950 border border-white/15 px-2.5 text-xs"
            >
              <option value={2}>2 chữ số (0.00)</option>
              <option value={3}>3 chữ số (0.000)</option>
            </select>
          </div>

          {/* Manual Input */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">Chế độ nhập tay (Stackmat ngoài)</div>
              <div className="text-xs text-slate-400">
                Nhập số trực tiếp từ bàn phím thay vì bấm giờ Space
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.manualInput}
              onChange={(e) =>
                onUpdateSettings({ manualInput: e.target.checked })
              }
              className="w-5 h-5 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Focus Mode */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">Ẩn bảng phụ khi đang giải</div>
              <div className="text-xs text-slate-400">
                Giúp tập trung tối đa vào đồng hồ khi đang bấm giờ
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.hideUiWhileSolving}
              onChange={(e) =>
                onUpdateSettings({ hideUiWhileSolving: e.target.checked })
              }
              className="w-5 h-5 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Sound Alerts */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">Âm báo (8s / 12s & Kỷ lục PB)</div>
              <div className="text-xs text-slate-400">
                Phát tiếng bíp cảnh báo Inspection và âm mừng PB mới
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) =>
                onUpdateSettings({ soundEnabled: e.target.checked })
              }
              className="w-5 h-5 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Show Cube Preview */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <div>
              <div className="font-medium">Hiển thị hình trải 2D Scramble</div>
              <div className="text-xs text-slate-400">
                Kiểm tra trạng thái màu Rubik sau khi tráo (hỗ trợ đủ 13 bộ môn)
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.showCubePreview}
              onChange={(e) =>
                onUpdateSettings({ showCubePreview: e.target.checked })
              }
              className="w-5 h-5 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Theme Selector */}
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
            <div className="font-medium">Giao diện màu nền</div>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={settings.theme === t.id}
                  onClick={() => onUpdateSettings({ theme: t.id })}
                  className={`flex min-h-11 items-center gap-2 rounded-lg border p-2 text-xs font-medium transition-colors ${
                    settings.theme === t.id
                      ? "border-cyan-400 bg-cyan-500/10 text-cyan-300"
                      : "border-white/10 bg-black/25 hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`size-5 rounded-md ${t.preview} border border-white/20`}
                  />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Universal Backup Import / Export (RukTimer / csTimer / Twisty Timer) */}
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5">
            <div>
              <div className="font-medium flex items-center gap-1.5">
                <Download className="w-4 h-4 text-cyan-400" />
                <span>Sao lưu & Nhập dữ liệu Đa nền tảng</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Hỗ trợ nhập trực tiếp file sao lưu từ <strong>RukTimer (.json)</strong>,{" "}
                <strong>csTimer (.txt / .json)</strong> và{" "}
                <strong>Twisty Timer (.csv)</strong>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onExportJson}
                className="px-3 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-medium inline-flex items-center gap-1.5 transition"
              >
                <FileJson className="w-3.5 h-3.5 text-cyan-400" />
                <span>Xuất JSON</span>
              </button>
              <button
                type="button"
                onClick={onExportCsv}
                className="px-3 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-medium inline-flex items-center gap-1.5 transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Xuất CSV (Excel)</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs font-medium inline-flex items-center gap-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Nhập JSON / csTimer / CSV</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.txt,.csv,application/json,text/plain,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportJsonFile(file);
                    e.target.value = "";
                  }
                }}
              />
            </div>

            {pendingImportPlan && (
              <div className="rounded-xl bg-slate-950/90 border border-cyan-500/35 p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Xem trước bản nhập ({pendingImportPlan.sourceFormat})
                      </span>
                    </div>
                    {importFileName && (
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[320px]">
                        Tệp: {importFileName}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg bg-white/[0.04] border border-white/10 p-2">
                    <div className="text-[10px] text-slate-400">Phiên mới</div>
                    <div className="font-mono font-bold text-white">
                      +{pendingImportPlan.newSessions.length}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-2">
                    <div className="text-[10px] text-emerald-300">Lượt mới</div>
                    <div className="font-mono font-bold text-emerald-200">
                      +{pendingImportPlan.newSolves.length}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/[0.04] border border-white/10 p-2">
                    <div className="text-[10px] text-slate-400">Trùng (bỏ qua)</div>
                    <div className="font-mono font-bold text-slate-300">
                      {pendingImportPlan.duplicateSolves}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/[0.04] border border-white/10 p-2">
                    <div className="text-[10px] text-slate-400">Dòng lỗi</div>
                    <div className="font-mono font-bold text-amber-300">
                      {pendingImportPlan.invalidRows}
                    </div>
                  </div>
                </div>

                {(pendingImportPlan.cfopProgressCount > 0 ||
                  pendingImportPlan.practiceSetCount > 0) && (
                  <div className="text-[11px] text-slate-300">
                    Kèm tiến độ CFOP:{" "}
                    <strong>{pendingImportPlan.cfopProgressCount}</strong> mục • Bộ
                    luyện tùy chọn:{" "}
                    <strong>{pendingImportPlan.practiceSetCount}</strong> case.
                  </div>
                )}

                {pendingImportPlan.warnings.length > 0 && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2 text-[11px] text-amber-200 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{pendingImportPlan.warnings.join(" • ")}</span>
                  </div>
                )}

                <p className="text-[11px] text-slate-400">
                  Chế độ nhập gộp an toàn (không xóa dữ liệu hiện có). Các lượt trùng ID hoặc trùng dấu vân tay sẽ tự động bỏ qua.
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={onCancelImport}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium transition disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={onConfirmImport}
                    className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-60"
                  >
                    {isImporting && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>Xác nhận nhập dữ liệu</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Keyboard Shortcuts Cheatsheet */}
          <div className="p-3 rounded-xl bg-black/30 border border-white/10 text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-white mb-1">Phím tắt nhanh:</div>
            <div className="grid grid-cols-2 gap-1">
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10">Space</kbd>{" "}
                Bắt đầu / Chốt Split / Dừng
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10">Alt + N</kbd>{" "}
                Đổi Scramble
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10">Alt + 2</kbd>{" "}
                Phạt +2s lượt cuối
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10">Alt + D</kbd>{" "}
                DNF lượt cuối
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10">Alt + Z</kbd>{" "}
                Xóa lượt cuối
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10">Esc</kbd> Hủy
                đang giải
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
