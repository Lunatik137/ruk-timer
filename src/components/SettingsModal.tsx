"use client";

import React, { useEffect, useId, useRef } from "react";
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

type SettingCopy = { title: string; description: string };

function SettingDescription({ id, children }: { id: string; children: React.ReactNode }) {
  return <span id={id} className="mt-1 block text-sm leading-snug text-slate-300">{children}</span>;
}

function ToggleSetting({ title, description, ...input }: SettingCopy & React.ComponentPropsWithoutRef<"input">) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <label className="grid min-h-11 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
      <span className="min-w-0">
        <span id={id} className="block font-medium">{title}</span>
        <SettingDescription id={descriptionId}>{description}</SettingDescription>
      </span>
      <input {...input} type="checkbox" aria-labelledby={id} aria-describedby={descriptionId} className="size-5 shrink-0 cursor-pointer accent-cyan-300" />
    </label>
  );
}

function SelectSetting({ title, description, children, ...select }: SettingCopy & React.ComponentPropsWithoutRef<"select">) {
  const id = useId();
  return (
    <div className="rk-setting-select grid min-w-0 items-center gap-2 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block font-medium">{title}</label>
        <SettingDescription id={`${id}-description`}>{description}</SettingDescription>
      </div>
      <select {...select} id={id} aria-describedby={`${id}-description`}
        className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-white/15 bg-[var(--rk-canvas)] px-3 text-base">
        {children}
      </select>
    </div>
  );
}

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
      className="rk-settings-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/75"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="rk-dialog flex max-h-full w-full min-w-0 max-w-2xl flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-b border-white/10 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-3 sm:px-6">
          <Sliders size={21} aria-hidden="true" className="mt-1 hidden text-cyan-300 sm:block" />
          <div className="min-w-0">
            <h2 id="settings-modal-title" className="text-balance text-xl font-semibold leading-tight">Cài đặt Timer &amp; Dữ liệu</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng"
            className="grid size-11 shrink-0 place-items-center rounded-lg bg-white/5 hover:bg-white/10">
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="rk-settings-body min-h-0 min-w-0 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 text-sm sm:px-6">
          <section aria-labelledby="settings-timing">
            <h3 id="settings-timing" className="border-b border-white/10 pb-2 text-base font-semibold">Bấm giờ</h3>
            <div className="divide-y divide-white/10">
              <ToggleSetting
                title="WCA Inspection (15 giây)"
                description="Đếm ngược trước khi giải. +2 từ 15 giây, DNF từ 17 giây."
                checked={settings.inspectionEnabled}
                onChange={(e) =>
                  onUpdateSettings({ inspectionEnabled: e.target.checked })
                }
              />
              <ToggleSetting
                title="Giọng trọng tài WCA"
                description="Nhắc ở mốc 8 và 12 giây trong Inspection."
                checked={Boolean(settings.voiceAlertsEnabled)}
                onChange={(e) =>
                  onUpdateSettings({ voiceAlertsEnabled: e.target.checked })
                }
              />
              <SelectSetting
                title="Split Timer"
                description="Nhấn Space để ghi từng pha Cross, F2L, OLL và PLL."
                value={settings.splitMode || "off"}
                onChange={(e) =>
                  onUpdateSettings({ splitMode: e.target.value as SplitMode })
                }
              >
                <option value="off">Tắt</option>
                <option value="cfop4">4 pha CFOP</option>
              </SelectSetting>
              <SelectSetting
                title="Thời gian nhấn giữ"
                description="Thời gian giữ Space hoặc chạm trước khi thả để bắt đầu."
                value={settings.holdDelayMs}
                onChange={(e) =>
                  onUpdateSettings({ holdDelayMs: Number(e.target.value) })
                }
              >
                <option value={0}>0.0s (Tức thì)</option>
                <option value={300}>0.30s (Mặc định)</option>
                <option value={550}>0.55s (Chuẩn WCA)</option>
              </SelectSetting>
              <SelectSetting
                title="Mục tiêu cá nhân (Sub-X)"
                description="Dùng để tính tỷ lệ đạt mục tiêu và thời gian cần trong vòng WCA."
                value={settings.targetGoalMs || 15000}
                onChange={(e) =>
                  onUpdateSettings({ targetGoalMs: Number(e.target.value) })
                }
              >
                <option value={8000}>Sub-8 giây</option>
                <option value={10000}>Sub-10 giây</option>
                <option value={12000}>Sub-12 giây</option>
                <option value={15000}>Sub-15 giây</option>
                <option value={20000}>Sub-20 giây</option>
                <option value={30000}>Sub-30 giây</option>
                <option value={45000}>Sub-45 giây</option>
              </SelectSetting>
              <ToggleSetting
                title="Nhập thời gian bằng tay"
                description="Nhập số từ bàn phím khi dùng đồng hồ ngoài."
                checked={settings.manualInput}
                onChange={(e) =>
                  onUpdateSettings({ manualInput: e.target.checked })
                }
              />
              <ToggleSetting
                title="Âm báo Inspection và PB"
                description="Phát tiếng bíp ở mốc 8 và 12 giây và khi có PB mới."
                checked={settings.soundEnabled}
                onChange={(e) =>
                  onUpdateSettings({ soundEnabled: e.target.checked })
                }
              />
            </div>
          </section>

          <section aria-labelledby="settings-display">
            <h3 id="settings-display" className="border-b border-white/10 pb-2 text-base font-semibold">Hiển thị</h3>
            <div className="divide-y divide-white/10">
              <SelectSetting
                title="Đồng hồ khi đang giải"
                description="Hiện đầy đủ, chỉ hiện giây hoặc ẩn khi đang giải."
                value={settings.timerUpdateMode || "live"}
                onChange={(e) =>
                  onUpdateSettings({
                    timerUpdateMode: e.target.value as TimerUpdateMode,
                  })
                }
              >
                <option value="live">Cập nhật liên tục</option>
                <option value="seconds">Chỉ hiện số giây (1s)</option>
                <option value="hidden">Ẩn số (&ldquo;GIẢI...&rdquo;)</option>
              </SelectSetting>
              <SelectSetting
                title="Chữ số thập phân"
                description="Độ chi tiết của thời gian hiển thị."
                value={settings.decimals}
                onChange={(e) =>
                  onUpdateSettings({
                    decimals: Number(e.target.value) as 2 | 3,
                  })
                }
              >
                <option value={2}>2 chữ số (0.00)</option>
                <option value={3}>3 chữ số (0.000)</option>
              </SelectSetting>
              <ToggleSetting
                title="Ẩn bảng phụ khi đang giải"
                description="Giữ đồng hồ ở trung tâm khi đang bấm giờ."
                checked={settings.hideUiWhileSolving}
                onChange={(e) =>
                  onUpdateSettings({ hideUiWhileSolving: e.target.checked })
                }
              />
              <ToggleSetting
                title="Hình trải 2D Scramble"
                description="Xem trạng thái màu sau khi xáo."
                checked={settings.showCubePreview}
                onChange={(e) =>
                  onUpdateSettings({ showCubePreview: e.target.checked })
                }
              />
            </div>
            {/* Theme Selector */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="font-medium">Màu giao diện</div>
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
                      aria-hidden="true"
                      className={`size-5 shrink-0 rounded-md ${t.preview} border border-white/20`}
                    />
                    <span className="min-w-0 text-left [overflow-wrap:anywhere]">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Sao lưu và nhập dữ liệu */}
          <section aria-labelledby="settings-data" className="min-w-0 space-y-3 border-t border-white/10 pt-4">
            <div>
              <h3 id="settings-data" className="flex items-center gap-2 text-base font-semibold">
                <Download aria-hidden="true" className="size-4 shrink-0 text-cyan-300" />
                Sao lưu và nhập dữ liệu
              </h3>
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
                className="min-h-11 px-3 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-medium inline-flex items-center gap-1.5 transition"
              >
                <FileJson className="w-3.5 h-3.5 text-cyan-400" />
                <span>Xuất JSON</span>
              </button>
              <button
                type="button"
                onClick={onExportCsv}
                className="min-h-11 px-3 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-medium inline-flex items-center gap-1.5 transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Xuất CSV (Excel)</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-11 px-3 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs font-medium inline-flex items-center gap-1.5 transition"
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
              <div className="min-w-0 space-y-3 rounded-xl border border-cyan-300/30 bg-[var(--rk-canvas)] p-3">
                <div className="min-w-0">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Xem trước bản nhập ({pendingImportPlan.sourceFormat})
                      </span>
                    </div>
                    {importFileName && (
                      <div className="mt-1 text-xs text-slate-300 [overflow-wrap:anywhere]">
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
                    <span className="min-w-0 [overflow-wrap:anywhere]">{pendingImportPlan.warnings.join(" • ")}</span>
                  </div>
                )}

                <p className="text-[11px] text-slate-400">
                  Chế độ nhập gộp an toàn (không xóa dữ liệu hiện có). Các lượt trùng ID hoặc trùng dấu vân tay sẽ tự động bỏ qua.
                </p>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={onCancelImport}
                    className="min-h-11 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium transition disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={onConfirmImport}
                    className="min-h-11 px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-60"
                  >
                    {isImporting && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>Xác nhận nhập dữ liệu</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          <details className="border-t border-white/10 text-sm text-slate-300">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-white">Phím tắt bàn phím</summary>
            <div className="grid gap-2 sm:grid-cols-2">
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
          </details>
        </div>
      </div>
    </div>
  );
}
