"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { CFOP_ALGORITHMS, getCfopSessionName } from "@/lib/cfop";
import { computePracticePeriod, getDeviceTimeZone, weekdayMon0 } from "@/lib/core/activity";
import { computeStreakAndHeatmap, formatTimeMs } from "@/lib/stats";
import type { CubeSession, PersonalAchievement, Solve, TimerSettings } from "@/types/cubing";

const periods = [7, 14, 30, 84] as const;
const drillNames = new Set(CFOP_ALGORITHMS.map(getCfopSessionName));
type Period = typeof periods[number];

function shortDate(day: string) {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

export default function PracticeProgress({ solves, sessions, achievements, decimals }: {
  solves: Solve[];
  sessions: CubeSession[];
  achievements: PersonalAchievement[];
  decimals: TimerSettings["decimals"];
}) {
  const [period, setPeriod] = useState<Period>(7);
  const drillSessionIds = useMemo(() => new Set(sessions.filter((session) => drillNames.has(session.name)).map((session) => session.id)), [sessions]);
  const report = useMemo(() => computePracticePeriod(solves, {
    now: Date.now(), tz: getDeviceTimeZone(), days: period, drillSessionIds,
  }), [solves, period, drillSessionIds]);
  const streak = useMemo(() => computeStreakAndHeatmap(solves), [solves]);
  const max = Math.max(1, ...report.days.map((day) => day.count));
  const activeDays = report.days.filter((day) => day.count > 0).length;
  const metrics = [
    { title: "Lượt luyện tập", value: report.current.practiceCount, context: `Kỳ trước: ${report.previous.practiceCount} lượt` },
    { title: "Ngày có luyện", value: `${activeDays}/${period}`, context: `Chuỗi: ${streak.currentStreak} ngày · Kỷ lục: ${streak.longestStreak}` },
    { title: "Mean phiên chính", value: formatTimeMs(report.current.meanMs, decimals), context: `Kỳ trước: ${formatTimeMs(report.previous.meanMs, decimals)}` },
    { title: "Single tốt nhất", value: formatTimeMs(report.current.bestSingleMs, decimals), context: `Độ lệch chuẩn: ${formatTimeMs(report.current.stdDevMs, decimals)}` },
  ];

  return (
    <section className="space-y-4" aria-labelledby="practice-title">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="space-y-1">
          <h1 id="practice-title" className="text-xl font-semibold">Tiến độ luyện tập</h1>
          <p className="font-mono text-sm tabular-nums text-slate-300">{report.start} → {report.end}</p>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
          Khoảng thời gian
          <select className="rk-control bg-[var(--rk-surface)]" value={period} onChange={(event) => setPeriod(Number(event.target.value) as Period)}>
            {periods.map((value) => <option key={value} value={value}>{value} ngày gần nhất</option>)}
          </select>
        </label>
      </header>

      <dl className="rk-panel grid grid-cols-2 overflow-hidden [&>div]:min-w-0 [&>div]:p-3 sm:[&>div]:p-4 lg:grid-cols-4">
        {metrics.map((metric, index) => <div key={metric.title} className={`border-white/10 ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b lg:border-b-0" : ""} ${index === 1 ? "lg:border-r" : ""}`}>
          <dt className="text-xs text-slate-300">{metric.title}</dt>
          <dd className="mt-1 break-words font-mono text-xl font-semibold tabular-nums">{metric.value}</dd>
          <dd className="mt-1 text-xs text-slate-400">{metric.context}</dd>
        </div>)}
      </dl>

      <section className="rk-panel rk-report-section space-y-3 p-4 sm:p-5" aria-labelledby="solves-by-day">
        <h2 id="solves-by-day" className="text-base font-semibold">Số lượt giải theo ngày</h2>
        {report.current.practiceCount === 0 && <p role="status" className="text-sm text-slate-300">Chưa có lượt luyện trong khoảng này.</p>}
        <div className="flex gap-2" aria-hidden="true">
          <div className="flex h-36 shrink-0 flex-col justify-between text-right font-mono text-xs tabular-nums text-slate-400">
            <span>{max}</span><span>0</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className={`flex h-36 items-end border-y border-white/10 ${period <= 14 ? "gap-1 sm:gap-2" : "gap-px"}`}>
              {report.days.map((day) => (
                <div key={day.date} className={`min-w-0 flex-1 rounded-t-sm ${day.date === report.end ? "bg-cyan-200" : "bg-cyan-300/55"}`}
                  style={{ height: `${day.count / max * 100}%` }} title={`${shortDate(day.date)}: ${day.count} lượt`} />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-xs text-slate-400">
              <span>{shortDate(report.start)}</span><span>{shortDate(report.days[Math.floor(period / 2)].date)}</span><span>{shortDate(report.end)}</span>
            </div>
          </div>
        </div>
        <details className="text-sm text-slate-300">
          <summary className="w-fit cursor-pointer rounded py-2 hover:underline">Xem số liệu từng ngày</summary>
          <table className="w-full max-w-sm text-left">
            <thead className="border-b border-white/10"><tr><th scope="col" className="py-2">Ngày</th><th scope="col" className="py-2 text-right">Lượt giải</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {report.days.map((day) => <tr key={day.date}><th scope="row" className="py-1 font-normal">{day.date}</th><td className="py-1 text-right font-mono tabular-nums">{day.count}</td></tr>)}
            </tbody>
          </table>
        </details>
        <details className="text-sm text-slate-300">
          <summary className="w-fit cursor-pointer rounded py-2 hover:underline">Lịch luyện theo tuần</summary>
          <div className="mt-2 flex max-w-xl gap-2" aria-hidden="true">
            <div className="grid grid-rows-7 gap-1 text-xs text-slate-400">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
                <span key={day} className="self-center">{day}</span>
              ))}
            </div>
            <div className="grid flex-1 auto-cols-fr grid-flow-col grid-rows-7 gap-1">
              {report.days.map((day, index) => (
                <div key={day.date} title={`${shortDate(day.date)}: ${day.count} lượt`}
                  style={index === 0 ? { gridRowStart: weekdayMon0(day.date) + 1 } : undefined}
                  className={`relative min-h-4 overflow-hidden rounded-sm bg-white/5 ${day.date === report.end ? "outline outline-1 outline-offset-[-1px] outline-white/70" : ""}`}>
                  {day.count > 0 && <span className="absolute inset-0 bg-cyan-300" style={{ opacity: Math.max(0.25, day.count / max) }} />}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">Ô sáng hơn có nhiều lượt hơn. Xem số liệu từng ngày ở bảng phía trên.</p>
        </details>
        <p className="text-xs text-slate-400">Biểu đồ tính mọi lượt luyện, kể cả CFOP và DNF. Mean và Single chỉ tính lượt hợp lệ ở phiên giải chính.</p>
      </section>

      <section className="rk-panel p-4 sm:p-5" aria-labelledby="practice-achievements">
        <h2 id="practice-achievements" className="text-base font-semibold">Thành tựu</h2>
        <p className="mt-1 text-xs text-slate-400">Tính trên toàn bộ lịch sử luyện tập</p>
        <ul role="list" className="mt-2 divide-y divide-white/10">
          {achievements.map((ach) => (
            <li key={ach.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{ach.title}</p>
                <p className="mt-1 text-xs text-slate-400">{ach.description}</p>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-slate-300">
                {ach.unlocked && <CheckCircle2 aria-label="Đã đạt" className="size-4 shrink-0 text-emerald-300" />}
                {ach.progressText}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
