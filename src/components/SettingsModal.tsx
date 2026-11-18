"use client";

import React, { useRef } from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Sliders,
  Upload,
  X,
} from "lucide-react";
import { ThemeId, TimerSettings } from "@/types/cubing";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TimerSettings;
  onUpdateSettings: (patch: Partial<TimerSettings>) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImportJsonFile: (file: File) => void;
}

const THEMES: { id: ThemeId; label: string; preview: string }[] = [
  {
    id: "midnight",
    label: "Midnight Slate",
    preview: "from-slate-950 via-slate-900 to-indigo-950",
  },
  {
    id: "cyber",
    label: "Cyber Neon",
    preview: "from-zinc-950 via-purple-950 to-cyan-950",
  },
  {
    id: "emerald",
    label: "Forest Matrix",
    preview: "from-neutral-950 via-emerald-950 to-teal-950",
  },
  {
    id: "light",
    label: "Clean Dark Frost",
    preview: "from-slate-900 via-sky-950 to-slate-900",
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
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 text-white p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Cài đặt Timer & Dữ liệu</h2>
            <p className="text-xs text-slate-400">
              Tùy chỉnh chuẩn thi đấu WCA, giao diện và sao lưu
            </p>
          </div>
        </div>

        <div className="space-y-4 text-sm">
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
                Kiểm tra trạng thái màu Rubik sau khi tráo
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
                  onClick={() => onUpdateSettings({ theme: t.id })}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition ${
                    settings.theme === t.id
                      ? "border-cyan-400 bg-cyan-500/10 text-cyan-300"
                      : "border-white/10 bg-black/25 hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md bg-gradient-to-br ${t.preview} border border-white/20`}
                  />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Backup Import / Export */}
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5">
            <div className="font-medium flex items-center gap-1.5">
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Sao lưu & Khôi phục dữ liệu</span>
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
                <span>Nhập JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
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
          </div>

          {/* Keyboard Shortcuts Cheatsheet */}
          <div className="p-3 rounded-xl bg-black/30 border border-white/10 text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-white mb-1">Phím tắt nhanh:</div>
            <div className="grid grid-cols-2 gap-1">
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/10">Space</kbd>{" "}
                Bắt đầu / Dừng
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
