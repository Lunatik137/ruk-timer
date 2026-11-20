"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Link2, Swords } from "lucide-react";
import DuelTimer from "@/components/DuelTimer";
import { isDuelPuzzle, officialCentiseconds, otherSeat, type DuelHistoryItem, type DuelMode, type DuelView, type Result, type Role } from "@/lib/duel/match";
import { formatTimeMs } from "@/lib/stats";
import { PUZZLES } from "@/types/cubing";

const input = "w-full min-h-11 rounded-lg border border-white/15 bg-[var(--rk-canvas)] px-3 text-sm";
const label = "block space-y-2 text-sm text-slate-200";
const roles = [
  { id: "player1", title: "Player 1" },
  { id: "player2", title: "Player 2" },
  { id: "spectator", title: "Người xem" },
] as const;

type Snapshot = { id: string; revision: number; view: DuelView };

async function readResponse<T = Snapshot>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Không kết nối được với phòng."), { retry: data.retry === true });
  return data;
}

function textResult(result: Result | null) {
  if (!result) return "—";
  return result.penalty === "DNF" ? "DNF" :
    formatTimeMs(officialCentiseconds(result) * 10, 2) + (result.penalty === "+2" ? " (+2)" : "");
}

export default function DuelRoom({ initialRoom }: { initialRoom: string }) {
  const [room, setRoom] = useState(initialRoom);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [name, setName] = useState("");
  const [puzzle, setPuzzle] = useState("3x3");
  const [setsToWin, setSets] = useState(1);
  const [pointsToWin, setPoints] = useState(3);
  const [role, setRole] = useState<Role>("player1");
  const [mode, setMode] = useState<DuelMode>("alternating");
  const [inspection, setInspection] = useState(true);
  const [history, setHistory] = useState<DuelHistoryItem[]>();
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [invite, setInvite] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const view = snapshot?.view;
  const member = view?.kind === "member" ? view : null;
  const match = member?.match;
  const settings = match?.settings ?? (view?.kind === "invite" ? view.settings : null);
  const initialInvite = view?.kind === "invite" ? view : null;
  const spectators = view?.spectators ?? [];
  const started = match?.started ?? initialInvite?.started ?? false;
  const simultaneous = settings?.mode === "simultaneous";

  function receive(next: Snapshot) {
    setSnapshot((current) => !current || current.id !== next.id || next.revision >= current.revision ? next : current);
  }

  useEffect(() => {
    if (room) return;
    const controller = new AbortController();
    void fetch("/api/duel?history=1", { signal: controller.signal, cache: "no-store" })
      .then(readResponse<{ history: DuelHistoryItem[] }>)
      .then((data) => { if (!controller.signal.aborted) { setHistory(data.history); setHistoryError(""); } })
      .catch((err) => { if (!controller.signal.aborted) setHistoryError(err.message); });
    return () => controller.abort();
  }, [room]);

  useEffect(() => {
    if (!room) return;
    setInvite(new URL(`/duel?room=${encodeURIComponent(room)}`, window.location.origin).href);
  }, [room]);

  useEffect(() => {
    if (!room) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(`/api/duel?room=${encodeURIComponent(room)}`, { signal: controller.signal, cache: "no-store" });
        const next = await readResponse(response);
        if (!controller.signal.aborted) {
          receive(next);
          setConnection("");
        }
      } catch (err) {
        if (!controller.signal.aborted) setConnection(err instanceof Error ? err.message : "Mất kết nối với phòng.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 1200);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [room]);

  async function action(values: Record<string, unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const send = async (): Promise<Snapshot> => readResponse(await fetch("/api/duel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, ...values }),
      }));
      let next: Snapshot;
      try {
        next = await send();
      } catch (err) {
        if (!(err instanceof Error) || !("retry" in err) || !err.retry) throw err;
        next = await send();
      }
      receive(next);
      setConnection("");
      if (!room) {
        window.history.replaceState(null, "", `/duel?room=${next.id}`);
        setRoom(next.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được. Hãy thử lại.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite);
      setCopyStatus("Đã sao chép link");
    } catch {
      linkInput.current?.select();
      setCopyStatus("Hãy sao chép link đã chọn");
    }
  }

  const myTurn = member?.canTime ?? false;
  const mySeat = member?.seat ?? null;
  const canReady = simultaneous && match?.started && match.winner === null && !member?.reviewing &&
    mySeat !== null && !match.round.ready?.[mySeat];
  const canApprove = member?.reviewing && (member.referee ? member.canReferee : mySeat !== null);
  const playerLabel = (seat: 0 | 1) => match?.players[seat] ?? `Player ${seat + 1}`;

  return (
    <div className="rk-shell min-h-dvh">
      <main className="mx-auto max-w-4xl space-y-5 px-3 py-4 sm:px-6 sm:py-8">
        <header className="space-y-2">
          <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-slate-300 hover:text-white">
            <ArrowLeft aria-hidden="true" size={16} /> Về Timer
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Swords aria-hidden="true" className="size-5 text-cyan-300" /> Đấu 1v1
          </h1>
          {settings && <p className="text-sm text-slate-300">
            {PUZZLES.find((item) => item.id === settings.puzzle)?.label} · Thắng {settings.setsToWin} set · {settings.pointsToWin} điểm/set · {simultaneous ? "Đồng thời" : "Luân phiên"} · {settings.inspection !== false ? "Inspection 15 giây" : "Không Inspection"}
          </p>}
        </header>

        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        {connection && <p role="status" className="text-sm text-amber-200">{connection}</p>}

        {!room && <form className="rk-panel max-w-xl space-y-4 p-4 sm:p-5" onSubmit={(event) => {
          event.preventDefault();
          void action({ action: "create", name, puzzle, setsToWin, pointsToWin, role, mode, inspection });
        }}>
          <h2 className="text-lg font-semibold">Tạo phòng riêng</h2>
          <p className="text-sm text-slate-300">Hai người dùng cùng Scramble và xác nhận kết quả trước khi tính điểm.</p>
          <label className={label}>Tên hiển thị<input className={input} required maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className={label}>Loại Rubik<select className={input} value={puzzle} onChange={(e) => setPuzzle(e.target.value)}>
            {PUZZLES.filter((item) => isDuelPuzzle(item.id)).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Set cần thắng<select className={input} value={setsToWin} onChange={(e) => setSets(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} set</option>)}
            </select></label>
            <label className={label}>Điểm để thắng set<select className={input} value={pointsToWin} onChange={(e) => setPoints(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} điểm</option>)}
            </select></label>
          </div>
          <label className={label}>Chỗ của bạn<select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
          </select></label>
          <label className={label}>Thể thức<select className={input} value={mode} onChange={(e) => setMode(e.target.value as DuelMode)}>
            <option value="alternating">Luân phiên</option>
            <option value="simultaneous">Đồng thời</option>
          </select></label>
          <p className="text-sm text-slate-300">{mode === "simultaneous"
            ? "Cả hai cùng thấy Scramble. Đồng hồ mở khi cả hai đã xáo xong."
            : "Mỗi lượt đổi người giải trước."}</p>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={inspection} onChange={(e) => setInspection(e.target.checked)} /> WCA Inspection 15 giây
          </label>
          <button disabled={busy} className="rk-primary disabled:opacity-50">{busy ? "Đang tạo…" : "Tạo phòng"}</button>
        </form>}

        {!room && <section className="rk-panel max-w-xl space-y-3 p-4 sm:p-5" aria-labelledby="duel-history">
          <h2 id="duel-history" className="text-lg font-semibold">Lịch sử đấu</h2>
          {historyError ? <p role="status" className="text-sm text-rose-300">{historyError}</p> : !history
            ? <p role="status" className="text-sm text-slate-300">Đang tải lịch sử…</p>
            : history.length === 0 ? <p className="text-sm text-slate-300">Chưa có trận đã hoàn thành trên trình duyệt này.</p>
            : <ul className="divide-y divide-white/10">{history.map((item) => (
              <li key={item.id}>
                <Link href={`/duel?room=${item.id}`} prefetch={false} className="block min-h-11 rounded py-3 hover:text-cyan-200">
                  <span className="block break-words font-medium">{item.players[0]} {item.sets[0]}–{item.sets[1]} {item.players[1]}</span>
                  <span className="mt-1 block text-xs text-slate-300">
                    {PUZZLES.find((p) => p.id === item.settings.puzzle)?.shortLabel} · {new Date(item.completedAt).toLocaleDateString("vi-VN")} · Xem chi tiết
                  </span>
                </Link>
              </li>
            ))}</ul>}
        </section>}

        {room && !view && !connection && <p role="status">Đang tải phòng…</p>}

        {view && (!started || initialInvite) && <section className="rk-panel space-y-4 p-4 sm:p-5" aria-labelledby="duel-lobby">
          <div>
            <h2 id="duel-lobby" className="text-lg font-semibold">{started ? "Trận đã bắt đầu" : "Phòng chờ"}</h2>
            {initialInvite ? <p className="mt-1 text-sm text-slate-300">Phòng của {initialInvite.host}. Chọn chỗ để tham gia.</p>
              : <p className="mt-1 text-sm text-slate-300">Bạn là {member?.name}{member?.host ? " · Chủ phòng" : ""}</p>}
          </div>

          {initialInvite && <label className={label}>Tên hiển thị<input className={input} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <div className="grid grid-cols-2 gap-2">
            {([0, 1] as const).map((seat) => {
              const occupied = Boolean(match?.players[seat] || initialInvite?.slots[seat]);
              const mine = member?.seat === seat;
              return <button key={seat} type="button" aria-pressed={mine}
                disabled={busy || started || occupied || (!member && !name.trim())}
                onClick={() => void action({ action: "seat", name, role: seat === 0 ? "player1" : "player2" })}
                className={`min-h-20 min-w-0 rounded-lg border px-3 py-2 text-left hover:bg-white/5 ${mine ? "border-cyan-300 text-cyan-200" : "border-white/15"}`}>
                <span className="block text-xs text-slate-300">Player {seat + 1}</span>
                <span className="mt-1 block break-words font-semibold">{match?.players[seat] ?? (occupied ? "Đã có người" : "Chọn chỗ")}</span>
              </button>;
            })}
          </div>
          <div className="space-y-2 border-t border-white/10 pt-3">
            <p className="flex items-center gap-2 text-sm font-medium"><Eye size={16} aria-hidden="true" /> Người xem ({spectators.length}/2)</p>
            {spectators.length > 0 && <ul className="space-y-2 text-sm text-slate-300">
              {spectators.map((viewer, index) => <li className="flex flex-wrap items-center justify-between gap-2" key={index}>
                <span className="break-all">{viewer}{member?.refereeIndex === index ? " · Trọng tài" : ""}</span>
                {member?.host && !started && <button type="button" className="rk-control" disabled={busy}
                  onClick={() => void action({ action: "referee", index: member.refereeIndex === index ? null : index, revision: snapshot?.revision })}>
                  {member.refereeIndex === index ? "Bỏ vai trò trọng tài" : "Chọn làm trọng tài"}
                </button>}
              </li>)}
            </ul>}
            {!(member && member.seat === null) && <button type="button" className="rk-control disabled:opacity-50"
              disabled={busy || spectators.length >= 2 || (!member && !name.trim())}
              onClick={() => void action({ action: "seat", name, role: "spectator" })}>Chọn Người xem</button>}
          </div>
          {member && !started && <>
            <div className="space-y-2">
              <label className={label}>Link mời<input ref={linkInput} readOnly value={invite} className={input} onFocus={(e) => e.target.select()} /></label>
              <button type="button" onClick={copyInvite} className="rk-control"><Link2 aria-hidden="true" size={16} /> Sao chép link</button>
              <span role="status" className="ml-2 text-sm text-slate-300">{copyStatus}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {member.canStart ? <button type="button" disabled={busy || !match?.players.every(Boolean)} className="rk-primary disabled:opacity-50"
                onClick={() => void action({ action: "start" })}>{busy ? "Đang xử lý…" : "Bắt đầu trận"}</button>
                : <><p className="text-sm text-slate-300">{member.referee ? `Chờ trọng tài ${member.referee} bắt đầu.` : "Chờ chủ phòng bắt đầu."}</p>
                  {!member.host && <button type="button" disabled={busy} className="rk-control" onClick={() => void action({ action: "leave" })}>Rời chỗ</button>}</>}
            </div>
          </>}
        </section>}

        {member && match?.started && <>
          <section className="rk-panel space-y-4 p-4 sm:p-5" aria-labelledby="duel-score">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="duel-score" className="text-lg font-semibold">Set {match.round.set} · Lượt {match.round.number}</h2>
              <p className="text-sm text-slate-300">Người xem ({spectators.length}/2)</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-white/10 rounded-lg border border-white/10">
              {([0, 1] as const).map((seat) => <div key={seat} className="min-w-0 p-3">
                <p className="break-words font-semibold">{playerLabel(seat)}{seat === member.seat ? " (bạn)" : ""}</p>
                <p className="mt-1 font-mono text-sm tabular-nums text-slate-300">{match.sets[seat]} set · {match.points[seat]} điểm</p>
              </div>)}
            </div>
            <p role="status" className="font-medium text-cyan-200">
              {match.winner !== null ? `${playerLabel(match.winner)} thắng trận` :
                member.reviewing ? (member.referee ? `Chờ trọng tài ${member.referee} xác nhận` : "Chờ hai người chơi xác nhận") :
                simultaneous ? (match.round.ready?.every(Boolean) ? (myTurn ? "Có thể bắt đầu giải" : "Đang chờ kết quả") : "Chờ cả hai xáo xong") :
                myTurn ? "Đến lượt bạn" : member.turn !== null ? `Đang chờ ${playerLabel(member.turn)} giải` : "Đang chờ kết quả"}
            </p>
            {match.winner === null && !simultaneous && <p className="text-xs text-slate-300">{playerLabel(match.round.first)} → {playerLabel(otherSeat(match.round.first))}</p>}
          </section>
          {match.winner === null && !member.reviewing && match.round.scramble && (myTurn || (simultaneous && !match.round.ready?.every(Boolean))) && <section className="rk-panel space-y-4 p-4 sm:p-5" aria-labelledby="duel-scramble">
            <div>
              <h2 id="duel-scramble" className="text-sm font-medium text-slate-300">Scramble</h2>
              <p className="mt-2 break-words font-mono text-lg leading-relaxed">{match.round.scramble}</p>
            </div>
            {simultaneous && !match.round.ready?.every(Boolean) && <>
              <p className="text-sm text-slate-300">{match.round.ready?.filter(Boolean).length ?? 0}/2 người đã xáo xong</p>
              {canReady && <button type="button" disabled={busy} className="rk-primary disabled:opacity-50"
                onClick={() => void action({ action: "ready", round: match.round.number })}>Đã xáo xong</button>}
            </>}
            {myTurn && <DuelTimer key={match.round.number} inspection={match.settings.inspection !== false} busy={busy}
              submit={(result) => void action({ action: "submit", round: match.round.number, ...result })} />}
          </section>}
          {member.reviewing && (mySeat !== null || member.canReferee) && <section className="rk-panel space-y-3 p-4 sm:p-5" aria-labelledby="duel-review">
            <h2 id="duel-review" className="text-lg font-semibold">Xác nhận kết quả lượt {match.round.number}</h2>
            <dl className="grid grid-cols-2 gap-3">
              {([0, 1] as const).map((seat) => <div key={seat} className="min-w-0">
                <dt className="break-words text-sm text-slate-300">{playerLabel(seat)}</dt>
                <dd className="font-mono tabular-nums">{textResult(match.round.results[seat])}</dd>
              </div>)}
            </dl>
            {!member.referee && <p className="text-sm text-slate-300">{match.round.approvals?.filter(Boolean).length ?? 0}/2 người đã xác nhận</p>}
            {canApprove && (mySeat === null || !match.round.approvals?.[mySeat]) &&
              <button type="button" disabled={busy} className="rk-primary disabled:opacity-50"
                onClick={() => void action({ action: "approve", round: match.round.number })}>Xác nhận kết quả</button>}
          </section>}
          {match.history.length > 0 && <section className="rk-panel space-y-3 p-4 sm:p-5" aria-labelledby="duel-results">
            <h2 id="duel-results" className="text-lg font-semibold">Kết quả từng lượt</h2>
            <ul className="divide-y divide-white/10 text-sm">
              {[...match.history].reverse().map((round) => <li key={round.number} className="space-y-1 py-2">
                <p className="font-medium">Set {round.set} · Lượt {round.number} · {round.winner === null ? "Hòa" : `${playerLabel(round.winner)} +1 điểm`}</p>
                <p className="break-words text-slate-300">{playerLabel(0)} {textResult(round.results[0])} · {playerLabel(1)} {textResult(round.results[1])}</p>
                <details className="text-sm text-slate-300">
                  <summary className="w-fit cursor-pointer rounded py-2">Scramble</summary>
                  <p className="break-words pb-2 font-mono">{round.scramble}</p>
                </details>
              </li>)}
            </ul>
          </section>}
          {member.seat === null && !member.host && !member.canReferee && match.winner === null && <button type="button" disabled={busy} className="rk-control" onClick={() => void action({ action: "leave" })}>Rời phòng xem</button>}
          {match.winner !== null && <Link href="/duel" prefetch={false} className="rk-primary">Về lịch sử đấu</Link>}
        </>}
      </main>
    </div>
  );
}
