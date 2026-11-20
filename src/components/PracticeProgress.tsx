"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, CheckCircle2, Flame, Target } from "lucide-react";
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
  const [selectedDate, setSelectedDate] = useState<string>();
  const drillSessionIds = useMemo(() => new Set(sessions.filter((session) => drillNames.has(session.name)).map((session) => session.id)), [sessions]);
  const report = useMemo(() => computePracticePeriod(solves, {
    now: Date.now(), tz: getDeviceTimeZone(), days: period, drillSessionIds,
  }), [solves, period, drillSessionIds]);
  const streak = useMemo(() => computeStreakAndHeatmap(solves), [solves]);
  const max = Math.max(1, ...report.days.map((day) => day.count));
  const activeDays = report.days.filter((day) => day.count > 0).length;
  const today = report.days.at(-1)!;
  const selectedIndex = report.days.findIndex((day) => day.date === selectedDate);
  const dayIndex = selectedIndex < 0 ? report.days.length - 1 : selectedIndex;
  const selected = report.days[dayIndex];
  const countDelta = report.current.mainCount - report.previous.mainCount;
  const milestone = achievements.find((item) => !item.unlocked && item.progress);
  const metrics = [
    { title: "Lượt giải tiêu chuẩn", value: report.current.mainCount, context: countDelta > 0 ? `Tăng ${countDelta} lượt so với kỳ trước` : `Kỳ trước: ${report.previous.mainCount} lượt` },
    { title: "Ngày có giải tiêu chuẩn", value: `${activeDays}/${period}`, context: "Trong khoảng đã chọn" },
    { title: "Mean tiêu chuẩn", value: formatTimeMs(report.current.meanMs, decimals), context: `Kỳ trước: ${formatTimeMs(report.previous.meanMs, decimals)}` },
    { title: "Single tiêu chuẩn tốt nhất", value: formatTimeMs(report.current.bestSingleMs, decimals), context: `Độ lệch chuẩn: ${formatTimeMs(report.current.stdDevMs, decimals)}` },
  ];

  return (
    <section className="space-y-5" aria-labelledby="practice-title">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 id="practice-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Tiến độ luyện tập</h1>
          <p className="font-mono text-sm tabular-nums text-slate-300">{shortDate(report.start)} – {shortDate(report.end)}</p>
        </div>
        <div role="group" aria-label="Khoảng thời gian" className="grid w-full grid-cols-4 gap-1.5 rounded-xl border border-white/10 bg-[var(--rk-surface)] p-1.5 sm:w-auto">
          {periods.map((value) => (
            <button key={value} type="button" aria-pressed={period === value}
              className="min-h-11 min-w-0 rounded-lg px-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 aria-pressed:bg-cyan-300/15 aria-pressed:text-cyan-200 sm:px-3"
              onClick={() => { setPeriod(value); setSelectedDate(undefined); }}>
              {value} ngày
            </button>
          ))}
        </div>
      </header>

      <div className="rk-panel grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <section className="min-w-0 space-y-3 p-4 sm:p-5" aria-labelledby="practice-today">
          <h2 id="practice-today" className="flex items-center gap-2 text-base font-semibold">
            <BarChart3 size={18} aria-hidden="true" className="text-cyan-300" /> Hôm nay
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-4xl font-semibold tabular-nums text-cyan-200 sm:text-5xl">{today.count}</span>
            <span className="text-sm text-slate-300">lượt giải tiêu chuẩn</span>
          </div>
          <p className="text-sm text-slate-300">
            {today.count ? `Hôm qua: ${report.days[report.days.length - 2].count} lượt tiêu chuẩn` : "Một lượt giải là đủ để bắt đầu hôm nay."}
          </p>
        </section>
        <section className="min-w-0 space-y-3 border-t border-white/10 bg-[var(--rk-canvas)] p-4 sm:p-5 md:border-l md:border-t-0" aria-labelledby="practice-streak">
          <h2 id="practice-streak" className="flex items-center gap-2 text-base font-semibold">
            <Flame size={18} aria-hidden="true" className="text-amber-300" /> Chuỗi luyện tập
          </h2>
          <p className="text-sm text-slate-300"><strong className="font-mono text-2xl tabular-nums text-amber-200">{streak.currentStreak}</strong> ngày · Kỷ lục {streak.longestStreak} ngày</p>
          <ol className="grid grid-cols-7 gap-1.5" aria-label="Lượt giải tiêu chuẩn trong 7 ngày gần nhất">
            {report.days.slice(-7).map((day) => (
              <li key={day.date} className={`grid min-h-8 min-w-0 place-items-center rounded border font-mono text-xs tabular-nums ${day.count ? "border-cyan-300/35 bg-cyan-300/15 text-cyan-200" : "border-white/10 text-slate-400"}`}
                aria-label={`${shortDate(day.date)}: ${day.count} lượt giải tiêu chuẩn`}>
                {day.date.slice(8)}
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-300">Chuỗi tính cả CFOP. Ô sáng đánh dấu ngày có lượt giải tiêu chuẩn.</p>
        </section>
      </div>

      <dl className="rk-panel grid grid-cols-2 overflow-hidden [&>div]:min-w-0 [&>div]:p-3 sm:[&>div]:p-4 lg:grid-cols-4">
        {metrics.map((metric, index) => <div key={metric.title} className={`border-white/10 ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b lg:border-b-0" : ""} ${index === 1 ? "lg:border-r" : ""}`}>
          <dt className="text-xs text-slate-300">{metric.title}</dt>
          <dd className="mt-1 font-mono text-xl font-semibold tabular-nums [overflow-wrap:anywhere]">{metric.value}</dd>
          <dd className="mt-1 text-xs text-slate-300">{metric.context}</dd>
        </div>)}
      </dl>

      <section className="rk-panel rk-report-section space-y-3 p-4 sm:p-5" aria-labelledby="solves-by-day">
        <div className="space-y-1">
          <h2 id="solves-by-day" className="text-base font-semibold">Lượt giải tiêu chuẩn theo ngày</h2>
          <p className="text-sm text-slate-300">Tính cả DNF. Các bài luyện CFOP được loại khỏi biểu đồ.</p>
        </div>
        {report.current.mainCount === 0 && <p role="status" className="text-sm text-slate-300">Chưa có lượt giải tiêu chuẩn trong khoảng này.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[var(--rk-canvas)] px-3 py-1.5">
          <p role="status" className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-slate-300">
            {selected.date === report.end ? "Hôm nay" : shortDate(selected.date)}
            <strong className="font-mono text-base tabular-nums text-cyan-200">{selected.count} lượt</strong>
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="rk-control size-11 justify-center px-0 disabled:opacity-40" aria-label="Ngày trước"
              disabled={dayIndex === 0} onClick={() => setSelectedDate(report.days[dayIndex - 1].date)}><ArrowLeft size={17} aria-hidden="true" /></button>
            <button type="button" className="rk-control size-11 justify-center px-0 disabled:opacity-40" aria-label="Ngày sau"
              disabled={dayIndex === report.days.length - 1} onClick={() => setSelectedDate(report.days[dayIndex + 1].date)}><ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="flex gap-2">
          <div aria-hidden="true" className="flex h-44 shrink-0 flex-col justify-between text-right font-mono text-xs tabular-nums text-slate-400">
            <span>{max}</span><span>0</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className={`flex h-44 border-y border-white/10 ${period <= 14 ? "gap-1 sm:gap-2" : "gap-px"}`} role="group" aria-label="Số lượt giải theo ngày">
              {report.days.map((day, index) => (
                <button key={day.date} type="button" tabIndex={index === dayIndex ? 0 : -1}
                  aria-label={`${shortDate(day.date)}: ${day.count} lượt giải tiêu chuẩn`} aria-pressed={index === dayIndex}
                  className="relative flex min-w-0 flex-1 items-end rounded-sm hover:bg-white/10 focus-visible:z-10 focus-visible:-outline-offset-2 aria-pressed:bg-cyan-300/10"
                  onClick={() => setSelectedDate(day.date)}
                  onKeyDown={(event) => {
                    const offsets = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: report.days.length - 1 };
                    if (!(event.key in offsets)) return;
                    event.preventDefault();
                    const next = Math.max(0, Math.min(report.days.length - 1, offsets[event.key as keyof typeof offsets]));
                    setSelectedDate(report.days[next].date);
                    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
                  }}>
                  <span aria-hidden="true" className={`w-full rounded-t-sm ${index === dayIndex ? "bg-cyan-200" : "bg-cyan-300/60"}`}
                    style={{ height: day.count ? `${day.count / max * 100}%` : "2px" }} />
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-xs text-slate-400" aria-hidden="true">
              <span>{shortDate(report.start)}</span><span>{shortDate(report.days[Math.floor(period / 2)].date)}</span><span>{shortDate(report.end)}</span>
            </div>
          </div>
        </div>
        <details className="text-sm text-slate-300">
          <summary className="w-fit cursor-pointer rounded py-2 hover:underline">Xem số liệu từng ngày</summary>
          <table className="w-full max-w-sm text-left">
            <thead className="border-b border-white/10"><tr><th scope="col" className="py-2">Ngày</th><th scope="col" className="py-2 text-right">Lượt giải tiêu chuẩn</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {report.days.map((day) => <tr key={day.date}><th scope="row" className="py-1 font-normal">{day.date}</th><td className="py-1 text-right font-mono tabular-nums">{day.count}</td></tr>)}
            </tbody>
          </table>
        </details>
        <details className="text-sm text-slate-300">
          <summary className="w-fit cursor-pointer rounded py-2 hover:underline">Lịch giải tiêu chuẩn theo tuần</summary>
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
        <p className="text-xs text-slate-400">Mean và Single tính các lượt giải tiêu chuẩn hợp lệ.</p>
      </section>

      <section className="rk-panel p-4 sm:p-5" aria-labelledby="practice-achievements">
        <h2 id="practice-achievements" className="text-base font-semibold">Thành tựu</h2>
        <p className="mt-1 text-xs text-slate-400">Tính trên toàn bộ lịch sử luyện tập</p>
        {milestone?.progress && <div className="mt-3 space-y-2 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium"><Target size={17} aria-hidden="true" className="shrink-0 text-cyan-300" /> {milestone.title}</p>
          <progress className="rk-practice-progress block h-2 w-full" aria-label={`Tiến độ ${milestone.title}`}
            value={milestone.progress.current} max={milestone.progress.target} />
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-300">
            <p>{milestone.description}</p>
            <p className="font-mono tabular-nums">{milestone.progress.current}/{milestone.progress.target}</p>
          </div>
        </div>}
        <ul role="list" className="mt-2 divide-y divide-white/10">
          {achievements.filter((ach) => ach.id !== milestone?.id).map((ach) => (
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
