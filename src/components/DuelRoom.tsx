"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Eye, Link2, ShieldCheck, Swords } from "lucide-react";
import DuelTimer from "@/components/DuelTimer";
import DuelCamera from "@/components/DuelCamera";
import { isDuelRoomId, readDuelInvite } from "@/lib/duel/invite";
import { isDuelPuzzle, officialCentiseconds, otherSeat, type DuelActiveRoom, type DuelHistoryItem, type DuelMode, type DuelView, type Result, type Role } from "@/lib/duel/match";
import { formatTimeMs } from "@/lib/stats";
import { PUZZLES } from "@/types/cubing";

const input = "w-full min-h-11 rounded-lg border border-white/15 bg-[var(--rk-canvas)] px-3 text-sm";
const label = "block space-y-2 text-sm text-slate-200";
const disclosure = "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-2 text-sm font-medium [&::-webkit-details-marker]:hidden";
const roles = [
  { id: "player1", title: "Player 1" },
  { id: "player2", title: "Player 2" },
  { id: "spectator", title: "Người xem" },
  { id: "referee", title: "Trọng tài" },
] as const;

type Snapshot = { id: string; revision: number; view: DuelView };

async function readResponse<T = Snapshot>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Không kết nối được với phòng."), {
    retry: data.retry === true,
    activeRoom: typeof data.activeRoom === "string" && isDuelRoomId(data.activeRoom) ? data.activeRoom : null,
  });
  return data;
}

function textResult(result: Result | null) {
  if (!result) return "—";
  return result.penalty === "DNF" ? "DNF" :
    formatTimeMs(officialCentiseconds(result) * 10, 2) + (result.penalty === "+2" ? " (+2)" : "");
}

function ActiveRoomList({ rooms }: { rooms: DuelActiveRoom[] }) {
  return <ul className="divide-y divide-white/10">
    {rooms.map((active) => <li key={active.id}>
      <Link href={`/duel?room=${active.id}`} prefetch={false}
        className="flex min-h-11 items-center gap-3 rounded-lg py-2 hover:text-cyan-200">
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium">{active.players[0] ?? "Player 1"} – {active.players[1] ?? "Player 2"}</span>
          <span className="block text-sm text-slate-300">
            {PUZZLES.find((p) => p.id === active.puzzle)?.shortLabel} · <span className={active.started ? "text-cyan-200" : undefined}>
              {active.started ? "Đang đấu" : "Phòng chờ"}
            </span>
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    </li>)}
  </ul>;
}

function DuelHistoryList({ matches }: { matches: DuelHistoryItem[] }) {
  return <ul className="divide-y divide-white/10">{matches.map((item) => (
    <li key={item.id}>
      <Link href={`/duel?room=${item.id}`} prefetch={false} className="block min-h-11 rounded-lg py-2 hover:text-cyan-200">
        <span className="block break-words font-medium">{item.players[0]} {item.sets[0]}–{item.sets[1]} {item.players[1]}</span>
        <span className="block text-sm text-slate-300">
          {PUZZLES.find((p) => p.id === item.settings.puzzle)?.shortLabel} · {new Date(item.completedAt).toLocaleDateString("vi-VN")}
        </span>
      </Link>
    </li>
  ))}</ul>;
}

export default function DuelRoom({ initialRoom }: { initialRoom: string }) {
  const router = useRouter();
  const [room, setRoom] = useState(initialRoom);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [name, setName] = useState("");
  const [puzzle, setPuzzle] = useState("3x3");
  const [setsToWin, setSets] = useState(1);
  const [pointsToWin, setPoints] = useState(3);
  const [role, setRole] = useState<Role>("player1");
  const [selectedSeat, setSelectedSeat] = useState<Role | null>(null);
  const [roomLink, setRoomLink] = useState("");
  const [roomLinkError, setRoomLinkError] = useState("");
  const [mode, setMode] = useState<DuelMode>("alternating");
  const [inspection, setInspection] = useState(true);
  const [activeRooms, setActiveRooms] = useState<DuelActiveRoom[]>([]);
  const [activeError, setActiveError] = useState(false);
  const [history, setHistory] = useState<DuelHistoryItem[]>();
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeRoomConflict, setActiveRoomConflict] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [connection, setConnection] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [invite, setInvite] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const joinInput = useRef<HTMLInputElement>(null);
  const guestNameInput = useRef<HTMLInputElement>(null);
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
    let checkingRooms = false;
    let roomsToWatch = false;
    async function refreshRooms() {
      if (checkingRooms) return;
      checkingRooms = true;
      try {
        const response = await fetch("/api/duel?active=1", { signal: controller.signal, cache: "no-store" });
        const { active } = await readResponse<{ active: DuelActiveRoom[] }>(response);
        if (!controller.signal.aborted) {
          setActiveRooms(active);
          roomsToWatch = active.length > 0;
          setActiveError(false);
        }
      } catch {
        if (!controller.signal.aborted) setActiveError(true);
      } finally {
        checkingRooms = false;
      }
    }
    void refreshRooms();
    window.addEventListener("focus", refreshRooms);
    window.addEventListener("online", refreshRooms);
    const roomRefresh = setInterval(() => {
      if (roomsToWatch && document.visibilityState === "visible") void refreshRooms();
    }, 15_000);
    void fetch("/api/duel?history=1", { signal: controller.signal, cache: "no-store" })
      .then(readResponse<{ history: DuelHistoryItem[] }>)
      .then((data) => { if (!controller.signal.aborted) { setHistory(data.history); setHistoryError(""); } })
      .catch((err) => { if (!controller.signal.aborted) setHistoryError(err.message); });
    return () => {
      controller.abort();
      clearInterval(roomRefresh);
      window.removeEventListener("focus", refreshRooms);
      window.removeEventListener("online", refreshRooms);
    };
  }, [room]);

  useEffect(() => {
    if (!room) return;
    setInvite(new URL(`/duel?room=${encodeURIComponent(room)}`, window.location.origin).href);
  }, [room]);

  useEffect(() => {
    if (!room) return;
    const reconnecting = "Đang kết nối lại với phòng…";
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    let stopped = false;

    async function refresh() {
      if (stopped || request) return;
      clearTimeout(timer);
      if (!navigator.onLine) {
        setConnection(reconnecting);
        return;
      }
      const current = new AbortController();
      request = current;
      const deadline = setTimeout(() => current.abort(), 5000);
      try {
        const response = await fetch(`/api/duel?room=${encodeURIComponent(room)}`, { signal: current.signal, cache: "no-store" });
        if (stopped) return;
        if (response.status === 404 || response.status === 400) {
          stopped = true;
          setSnapshot(undefined);
          setConnection(response.status === 404 ? "Phòng không tồn tại hoặc đã hết hạn." : "Link phòng không hợp lệ.");
          return;
        }
        const next = await readResponse(response);
        if (!stopped) {
          receive(next);
          setConnection("");
        }
      } catch {
        if (!stopped) setConnection(reconnecting);
      } finally {
        clearTimeout(deadline);
        request = null;
        if (!stopped && navigator.onLine) timer = setTimeout(refresh, 1200);
      }
    }
    function onOffline() {
      if (stopped) return;
      clearTimeout(timer);
      request?.abort();
      setConnection(reconnecting);
    }
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    window.addEventListener("online", refresh);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    void refresh();
    return () => {
      stopped = true;
      request?.abort();
      clearTimeout(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [room]);

  async function action(values: Record<string, unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setActiveRoomConflict(null);
    try {
      const send = async (): Promise<Snapshot> => {
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 7000);
        try {
          return await readResponse(await fetch("/api/duel", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({ room, ...values }),
          }));
        } catch (error) {
          if (controller.signal.aborted || error instanceof TypeError) {
            throw new Error(values.action === "create"
              ? "Chưa xác nhận được phòng mới. Tải lại sảnh đấu để kiểm tra trước khi tạo lại."
              : "Chưa xác nhận được thao tác. Kiểm tra kết nối rồi thử lại.");
          }
          throw error;
        } finally {
          clearTimeout(deadline);
        }
      };
      let next: Snapshot;
      try {
        next = await send();
      } catch (err) {
        if (!(err instanceof Error) || !("retry" in err) || !err.retry) throw err;
        next = await send();
      }
      receive(next);
      if (values.action === "seat") setSelectedSeat(null);
      setConnection("");
      if (values.action === "close") {
        router.replace("/duel");
        return;
      }
      if (!room) {
        window.history.replaceState(null, "", `/duel?room=${next.id}`);
        setRoom(next.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được. Hãy thử lại.");
      if (err instanceof Error && "activeRoom" in err && typeof err.activeRoom === "string") {
        setActiveRoomConflict(err.activeRoom);
      }
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

  function chooseSeat(nextRole: Role) {
    if (member) {
      void action({ action: "seat", role: nextRole });
    } else {
      setError("");
      setActiveRoomConflict(null);
      setSelectedSeat(nextRole);
      guestNameInput.current?.focus();
    }
  }

  const myTurn = member?.canTime ?? false;
  const mySeat = member?.seat ?? null;
  const canReady = match?.started && match.winner === null && !member?.reviewing &&
    mySeat !== null && !match.round.ready?.[mySeat] && (simultaneous || member?.turn === mySeat);
  const canApprove = member?.reviewing && (member.reviewOfficial ? member.canReferee : mySeat !== null);
  const access = initialInvite?.access;
  const accessAvailable = view?.accessAvailable === true;
  const referee = initialInvite?.referee ?? member?.referee ?? null;
  const canChooseReferee = accessAvailable && !referee && (Boolean(initialInvite) || member?.host);
  const sortedRooms = [...activeRooms].sort((a, b) => Number(b.started) - Number(a.started));
  const modeLabel = mode === "simultaneous" ? "Đồng thời" : "Luân phiên";
  const missingPlayers = match?.players.filter((player) => !player).length ?? 0;
  const canClose = member?.canModerate && match?.winner === null;
  const playerLabel = (seat: 0 | 1) => match?.players[seat] ?? `Player ${seat + 1}`;
  const inviteControls = <div className="space-y-2">
    <label className={label}>Link mời<input ref={linkInput} readOnly value={invite} className={input} onFocus={(e) => e.target.select()} /></label>
    <button type="button" onClick={copyInvite} className="rk-control"><Link2 aria-hidden="true" size={16} /> Sao chép link</button>
    <span role="status" className="ml-2 text-sm text-slate-300">{copyStatus}</span>
  </div>;

  return (
    <div className="rk-shell min-h-dvh">
      <main className="mx-auto max-w-4xl space-y-5 px-3 py-4 sm:px-6 sm:py-8">
        <header className="space-y-2">
          <nav aria-label="Điều hướng khu đấu" className="mb-3 flex flex-wrap gap-2 border-b border-white/10">
            <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-slate-300 hover:text-white">
              <ArrowLeft aria-hidden="true" size={16} /> Về Timer
            </Link>
            <Link href="/duel" aria-current={room ? undefined : "page"} prefetch={false} className="inline-flex min-h-11 items-center border-b-2 border-transparent px-2 text-sm text-slate-300 hover:text-white aria-[current=page]:border-cyan-300 aria-[current=page]:text-white">
              Sảnh đấu
            </Link>
          </nav>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Swords aria-hidden="true" className="size-5 text-cyan-300" /> Đấu 1v1
          </h1>
          {settings && <p className="text-sm text-slate-300">
            {PUZZLES.find((item) => item.id === settings.puzzle)?.label} · Thắng {settings.setsToWin} set · {settings.pointsToWin} điểm/set · {simultaneous ? "Đồng thời" : "Luân phiên"} · {settings.inspection !== false ? "Inspection 15 giây" : "Không Inspection"}
          </p>}
        </header>

        {error && <div className="space-y-2">
          <p role="alert" className="text-sm text-rose-300">{error}</p>
          {activeRoomConflict && <Link href={`/duel?room=${activeRoomConflict}`} prefetch={false} className="rk-control">
            Quay lại phòng đang giữ ghế
          </Link>}
        </div>}
        {connection && <p role="status" className="text-sm text-amber-200">{connection}</p>}

        {!room && (sortedRooms.length > 0 || activeError) && <section className="rk-panel space-y-2 p-4 sm:p-5" aria-labelledby="duel-active">
          <h2 id="duel-active" className="text-lg font-semibold">Quay lại trận</h2>
          {activeError && <p role="status" className="text-sm text-amber-200">Chưa tải được các phòng của bạn. Bạn vẫn có thể mở bằng link mời.</p>}
          <ActiveRoomList rooms={sortedRooms.slice(0, 2)} />
          {sortedRooms.length > 2 && <details className="group border-t border-white/10">
            <summary className={disclosure}>Xem {sortedRooms.length - 2} phòng khác
              <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ActiveRoomList rooms={sortedRooms.slice(2)} />
          </details>}
        </section>}

        {!room && <div className="grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <form className="rk-panel space-y-3 p-4 sm:p-5 md:col-start-1 md:row-start-1" aria-labelledby="duel-join" onSubmit={(event) => {
            event.preventDefault();
            const id = readDuelInvite(roomLink, window.location.origin);
            if (!id) {
              setRoomLinkError("Dán link mời RukTimer hoặc mã phòng hợp lệ.");
              joinInput.current?.focus();
              return;
            }
            router.push(`/duel?room=${id}`);
          }}>
            <h2 id="duel-join" className="text-lg font-semibold">Vào phòng</h2>
            <label className={label}>Link mời hoặc mã phòng
              <input ref={joinInput} className={input} name="room-link" autoComplete="off" autoCapitalize="none" spellCheck={false}
                aria-invalid={Boolean(roomLinkError)} aria-describedby={roomLinkError ? "duel-link-error" : undefined}
                value={roomLink} onChange={(event) => { setRoomLink(event.target.value); setRoomLinkError(""); }}
                placeholder="Dán link hoặc mã phòng" />
            </label>
            {roomLinkError && <p id="duel-link-error" role="alert" className="text-sm text-rose-300">{roomLinkError}</p>}
            <button className="rk-primary">Mở phòng</button>
          </form>
          <form className="rk-panel space-y-4 p-4 sm:p-5 md:col-start-2 md:row-span-2 md:row-start-1" aria-labelledby="duel-create" onSubmit={(event) => {
            event.preventDefault();
            void action({ action: "create", name, puzzle, setsToWin, pointsToWin, role, mode, inspection });
          }}>
            <h2 id="duel-create" className="text-lg font-semibold">Tạo phòng riêng</h2>
            <label className={label}>Tên hiển thị<input className={input} required maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className={label}>Loại Rubik<select className={input} value={puzzle} onChange={(e) => setPuzzle(e.target.value)}>
              {PUZZLES.filter((item) => isDuelPuzzle(item.id)).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select></label>
            <details className="group border-y border-white/10">
              <summary className={disclosure}>
                <span>
                  <span className="block">Tùy chỉnh thể thức</span>
                  <span className="mt-1 block font-normal text-slate-300">{modeLabel} · {setsToWin} set · {pointsToWin} điểm/set</span>
                </span>
                <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-3 pb-3">
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
              </div>
            </details>
            <button disabled={busy} className="rk-primary w-full disabled:opacity-50 sm:w-auto">{busy ? "Đang tạo…" : "Tạo phòng"}</button>
          </form>

          <section className="rk-panel space-y-3 p-4 sm:p-5 md:col-start-1 md:row-start-2" aria-labelledby="duel-history">
            <h2 id="duel-history" className="text-lg font-semibold">Lịch sử đấu</h2>
            {historyError ? <p role="status" className="text-sm text-rose-300">{historyError}</p> : !history
              ? <p role="status" className="text-sm text-slate-300">Đang tải lịch sử…</p>
              : history.length === 0 ? <p className="text-sm text-slate-300">Chưa có trận đã hoàn thành trên trình duyệt này.</p>
              : <>
                <DuelHistoryList matches={history.slice(0, 3)} />
                {history.length > 3 && <details className="group border-t border-white/10">
                  <summary className={disclosure}>Xem {history.length - 3} trận cũ hơn
                    <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <DuelHistoryList matches={history.slice(3)} />
                </details>}
              </>}
          </section>
        </div>}

        {room && !view && !connection && <p role="status">Đang tải phòng…</p>}

        {view && (!started || initialInvite) && <section className="rk-panel space-y-4 p-4 sm:p-5" aria-labelledby="duel-lobby">
          <div>
            <h2 id="duel-lobby" className="text-lg font-semibold">{started ? "Trận đã bắt đầu" : "Phòng chờ"}</h2>
            {initialInvite ? <p className="mt-1 text-sm text-slate-300">Phòng của {initialInvite.host}. Chọn chỗ để tham gia.</p>
              : <p className="mt-1 text-sm text-slate-300">Bạn là {member?.name}{member?.host ? " · Chủ phòng" : ""}{member?.isReferee ? " · Trọng tài" : ""}</p>}
            {member && !started && <p role="status" className="mt-2 text-sm text-cyan-200">
              {missingPlayers > 0 ? `Đang chờ ${missingPlayers} người chơi.`
                : member.canStart ? "Đã đủ hai người chơi. Có thể bắt đầu trận."
                  : member.referee ? `Chờ trọng tài ${member.referee} hoặc chủ phòng bắt đầu.` : "Chờ chủ phòng bắt đầu."}
            </p>}
          </div>

          {access ? <div className="space-y-3 border-t border-white/10 pt-3">
            <p role="status" className="text-sm text-slate-200">{access.status === "pending"
              ? `Đang chờ duyệt vào ${access.role === "referee" ? "làm trọng tài" : "xem trận"}.`
              : "Yêu cầu vào phòng đã bị từ chối."}</p>
            {access.status === "pending" && <button type="button" className="rk-control" disabled={busy}
              onClick={() => void action({ action: "cancel-access" })}>Rút yêu cầu</button>}
          </div> : <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (selectedSeat && name.trim()) void action({ action: "seat", name, role: selectedSeat });
          }}>
          <div className="grid grid-cols-2 gap-2">
            {([0, 1] as const).map((seat) => {
              const occupied = Boolean(match?.players[seat] || initialInvite?.slots[seat]);
              const seatRole = seat === 0 ? "player1" : "player2";
              const mine = member?.seat === seat || selectedSeat === seatRole;
              return <button key={seat} type="button" aria-pressed={mine}
                disabled={busy || started || occupied}
                onClick={() => chooseSeat(seatRole)}
                className={`min-h-20 min-w-0 rounded-lg border px-3 py-2 text-left enabled:hover:bg-white/5 disabled:text-slate-400 ${mine ? "border-cyan-300 text-cyan-200" : "border-white/15"}`}>
                <span className="block text-xs text-slate-300">Player {seat + 1}</span>
                <span className="mt-1 block break-words font-semibold">{match?.players[seat] ?? (occupied ? "Đã có người" : started ? "Đã khóa" : mine ? "Đã chọn" : "Chọn chỗ")}</span>
              </button>;
            })}
          </div>
          <div className="space-y-2 border-t border-white/10 pt-3">
            <p className="flex items-center gap-2 text-sm font-medium"><Eye size={16} aria-hidden="true" /> Người xem ({spectators.length}/2)</p>
            {spectators.length > 0 && <ul className="space-y-2 text-sm text-slate-300">
              {spectators.map((viewer, index) => <li className="flex flex-wrap items-center justify-between gap-2" key={index}>
                <span className="break-words">{viewer}</span>
                {accessAvailable && member?.host && !started && !referee && <button type="button" className="rk-control" disabled={busy}
                  onClick={() => void action({ action: "promote-referee", index, revision: snapshot?.revision })}>
                  Chọn làm trọng tài
                </button>}
              </li>)}
            </ul>}
            {(!member || member.seat !== null || member.isReferee) && <button type="button" className="rk-control disabled:opacity-50"
              aria-pressed={selectedSeat === "spectator"} disabled={busy || Boolean(member ? spectators.length >= 2 : !accessAvailable)}
              onClick={() => chooseSeat("spectator")}>Chọn Người xem</button>}
            {initialInvite && !accessAvailable && <p className="text-sm text-slate-300">Tính năng duyệt vào xem đang được cập nhật.</p>}
          </div>
          <div className="space-y-2 border-t border-white/10 pt-3">
            <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16} aria-hidden="true" /> Trọng tài</p>
            <p className="break-words text-sm text-slate-300">{referee ?? "Còn trống"}</p>
            {canChooseReferee && <button type="button" className="rk-control" aria-pressed={selectedSeat === "referee"}
              disabled={busy} onClick={() => chooseSeat("referee")}>Chọn Trọng tài</button>}
            {accessAvailable && member?.host && referee && <button type="button" className="rk-control" disabled={busy || spectators.length >= 2}
              onClick={() => void action({ action: "release-referee", revision: snapshot?.revision })}>Chuyển trọng tài thành người xem</button>}
          </div>
          {initialInvite && <div className="space-y-3 border-t border-white/10 pt-3">
            <label className={label}>Tên hiển thị<input ref={guestNameInput} className={input} name="display-name" autoComplete="nickname" required maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></label>
            {selectedSeat ? <button className="rk-primary disabled:opacity-50" disabled={busy}>
              {busy ? "Đang gửi…" : `${selectedSeat === "spectator" || selectedSeat === "referee" ? "Xin vào" : "Vào phòng"} · ${roles.find((entry) => entry.id === selectedSeat)?.title}`}
            </button> : <p className="text-sm text-slate-300">Chọn ghế người chơi hoặc Người xem ở trên.</p>}
          </div>}
          </form>}
          {member && !started && <>
            {inviteControls}
            <div className="flex flex-wrap items-center gap-2">
              {member.canStart && <button type="button" disabled={busy || missingPlayers > 0} className="rk-primary disabled:opacity-50"
                onClick={() => void action({ action: "start" })}>{busy ? "Đang xử lý…" : "Bắt đầu trận"}</button>}
              {!member.host && <button type="button" disabled={busy} className="rk-control" onClick={() => void action({ action: "leave" })}>Rời chỗ</button>}
            </div>
          </>}
        </section>}

        {member && match?.started && <>
          <section className="rk-panel space-y-4 p-4 sm:p-5" aria-labelledby="duel-score">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="duel-score" className="text-lg font-semibold">Set {match.round.set} · Lượt {match.round.number}</h2>
              <p className="break-words text-sm text-slate-300">Người xem ({spectators.length}/2){referee ? ` · Trọng tài: ${referee}` : ""}</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-white/10 rounded-lg border border-white/10">
              {([0, 1] as const).map((seat) => <div key={seat} className="min-w-0 p-3">
                <p className="break-words font-semibold">{playerLabel(seat)}{seat === member.seat ? " (bạn)" : ""}</p>
                <p className="mt-1 font-mono text-sm tabular-nums text-slate-300">{match.sets[seat]} set · {match.points[seat]} điểm</p>
              </div>)}
            </div>
            <p role="status" className="font-medium text-cyan-200">
              {match.winner !== null ? `${playerLabel(match.winner)} thắng trận` :
                member.reviewing ? (member.reviewOfficial ? `Chờ ${member.reviewOfficial} xác nhận` : "Chờ hai người chơi xác nhận") :
                simultaneous ? (match.round.ready?.every(Boolean) ? (myTurn ? "Có thể bắt đầu giải" : "Đang chờ kết quả") : "Chờ cả hai xáo xong") :
                myTurn ? "Đến lượt bạn" : canReady ? "Đến lượt bạn xáo Scramble" : member.turn !== null ? `Đang chờ ${playerLabel(member.turn)} giải` : "Đang chờ kết quả"}
            </p>
            {match.winner === null && !simultaneous && <p className="text-xs text-slate-300">{playerLabel(match.round.first)} → {playerLabel(otherSeat(match.round.first))}</p>}
          </section>
          {match.winner === null && !member.reviewing && match.round.scramble && (myTurn || canReady || (simultaneous && !match.round.ready?.every(Boolean))) && <section className="rk-panel space-y-4 p-4 sm:p-5" aria-labelledby="duel-scramble">
            <div>
              <h2 id="duel-scramble" className="text-sm font-medium text-slate-300">Scramble</h2>
              <p className="mt-2 break-words font-mono text-lg leading-relaxed">{match.round.scramble}</p>
            </div>
            {simultaneous && !match.round.ready?.every(Boolean) && <>
              <p className="text-sm text-slate-300">{match.round.ready?.filter(Boolean).length ?? 0}/2 người đã xáo xong</p>
            </>}
            {canReady && <button type="button" disabled={busy} className="rk-primary disabled:opacity-50"
              onClick={() => void action({ action: "ready", round: match.round.number })}>Đã xáo xong</button>}
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
            {!member.reviewOfficial && <p className="text-sm text-slate-300">{match.round.approvals?.filter(Boolean).length ?? 0}/2 người đã xác nhận</p>}
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
        {accessAvailable && member?.canModerate && <section className="rk-panel space-y-3 p-4 sm:p-5" aria-labelledby="duel-access">
          <h2 id="duel-access" className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck size={18} aria-hidden="true" /> Duyệt vào phòng
          </h2>
          <p role="status" className="text-sm text-slate-300">{member.accessRequests.length
            ? `${member.accessRequests.length} yêu cầu đang chờ.` : "Chưa có yêu cầu nào."}</p>
          {member.accessRequests.length > 0 && <ul className="divide-y divide-white/10">
            {member.accessRequests.map((request) => {
              const full = request.role === "referee" ? Boolean(referee) : spectators.length >= 2;
              return <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">{request.name}</p>
                  <p className="text-sm text-slate-300">{request.role === "referee" ? "Trọng tài" : "Người xem"}{full ? " · Hết chỗ" : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rk-primary disabled:opacity-50" disabled={busy || full}
                    aria-label={`Cho ${request.name} vào`} onClick={() => void action({ action: "review-access", requestId: request.id, allow: true })}>Cho vào</button>
                  <button type="button" className="rk-control" disabled={busy}
                    aria-label={`Từ chối ${request.name}`} onClick={() => void action({ action: "review-access", requestId: request.id, allow: false })}>Từ chối</button>
                </div>
              </li>;
            })}
          </ul>}
          {started && inviteControls}
        </section>}
        {accessAvailable && ((member && match?.winner === null) || (initialInvite && !access && (selectedSeat === "player1" || selectedSeat === "player2"))) &&
          <DuelCamera key={room} room={room} player={member ? mySeat !== null : true} canJoin={Boolean(member)} />}
        {canClose && <div className="space-y-2">
          {confirmClose ? <>
            <p className="text-sm text-slate-300">Đóng phòng sẽ kết thúc phiên của mọi người. Trận dở sẽ không tính thắng thua.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rk-control text-rose-200" disabled={busy}
                onClick={() => void action({ action: "close" })}>Xác nhận đóng phòng</button>
              <button type="button" className="rk-control" disabled={busy} onClick={() => setConfirmClose(false)}>Giữ phòng</button>
            </div>
          </> : <button type="button" className="rk-control text-rose-200" disabled={busy}
            onClick={() => setConfirmClose(true)}>Đóng phòng</button>}
        </div>}
      </main>
    </div>
  );
}
