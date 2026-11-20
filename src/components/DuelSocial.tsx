"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, MessageCircle, Search, Swords, X } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import DuelChat, { duelRequest, useDuelRefresh } from "@/components/DuelChat";
import type { FriendLink, FriendSearchResult } from "@/lib/duel/social";

const url = "/api/duel/social";
const control = "min-h-11 w-full min-w-0 rounded-lg border border-white/15 bg-[var(--rk-canvas)] px-3 text-base";
type SocialState = {
  profile: { display_name: string; friend_code: string; discoverable: boolean } | null;
  friends: FriendLink[];
  invites: { id: string; room_id: string; name: string }[];
};

export default function DuelSocial({ room, lobby = false }: { room?: string; lobby?: boolean }) {
  const [data, setData] = useState<SocialState>();
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [display, setDisplay] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ term: string; results: FriendSearchResult[]; error?: string }>();
  const [searchRetry, setSearchRetry] = useState(0);
  const term = query.trim();
  const [selected, setSelected] = useState<string>();
  const conversation = useRef<HTMLElement>(null);
  const messageTrigger = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationKey, setConversationKey] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      if (signal?.aborted) return;
      if (response.status === 401) {
        setNeedsLogin(true);
        setLoadError("");
        setData(undefined);
        return;
      }
      if (!response.ok) throw new Error("Chưa tải được mục Bạn bè.");
      setData(await response.json());
      setNeedsLogin(false);
      setLoadError("");
    } catch (failure) {
      if (!signal?.aborted) setLoadError(failure instanceof Error ? failure.message : "Chưa kết nối được.");
    }
  }, []);
  useDuelRefresh(load, 12000, !needsLogin);

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await duelRequest<{ results: FriendSearchResult[] }>(
          `${url}?q=${encodeURIComponent(term)}`, undefined, controller.signal,
        );
        if (!controller.signal.aborted) setSearch({ term, results: response.results });
      } catch (failure) {
        if (!controller.signal.aborted) setSearch({
          term, results: [], error: failure instanceof Error ? failure.message : "Chưa tìm được người chơi.",
        });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, searchRetry]);

  async function action(body: object, text: string) {
    if (busy) return false;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await duelRequest(url, body);
      setNotice(text);
      if ("action" in body && body.action === "invite") setConversationKey((value) => value + 1);
      await load();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không thực hiện được. Hãy thử lại.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const Subheading = lobby ? "h2" : "h3";
  const profile = data?.profile;
  const friend = data?.friends.find((item) => item.id === selected && item.status === "accepted");
  const friendId = friend?.id;
  useEffect(() => {
    if (friendId) conversation.current?.focus();
  }, [friendId]);

  return <div className="rk-duel-social mt-3 space-y-4 border-t border-white/10 pt-4">
    {needsLogin ? <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-slate-300">Đăng nhập để kết bạn, nhắn tin và gửi lời mời đấu.</p>
      <button type="button" className="rk-primary" onClick={() => setAuthOpen(true)}>Đăng nhập</button>
    </div> : !data ? (!loadError && <p role="status" className="text-sm text-slate-300">Đang tải bạn bè…</p>) : !profile ? (
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void action({ action: "profile", name: display, discoverable: true }, "Đã lưu tên hiển thị."); }}>
        <label className="min-w-0 grow basis-44 space-y-1 text-sm">Tên hiển thị cho Bạn bè
          <input className={control} value={display} maxLength={32} required onChange={(event) => setDisplay(event.target.value)} />
        </label>
        <button type="submit" className="rk-primary" disabled={busy}>Lưu tên</button>
        <p className="w-full text-sm text-slate-300">Người chơi RukTimer có thể tìm tên này. Bạn có thể ẩn tên sau.</p>
      </form>
    ) : <>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-[var(--rk-canvas)] px-3 py-1.5 text-sm">
          <span className="min-w-0 text-slate-300">Tên của bạn <strong className="break-words text-slate-100">{profile.display_name}</strong>
            {" "}<small className="text-slate-400">#{profile.friend_code.slice(0, 6)}</small>
          </span>
          <button type="button" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-cyan-200 hover:bg-white/5 disabled:opacity-50" disabled={busy}
            onClick={() => void action({ action: "discoverable", enabled: !profile.discoverable },
              profile.discoverable ? "Đã ẩn tên khỏi tìm kiếm." : "Người chơi khác có thể tìm tên bạn.")}>
            {profile.discoverable ? "Ẩn tên khỏi tìm kiếm" : "Cho phép tìm theo tên"}
          </button>
        </div>
      <div className="rk-duel-social-workspace grid items-start gap-4">
        <div className="min-w-0 space-y-2">
          <label className="block space-y-1 text-sm">Tìm người chơi
            <span className="relative block">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" className={`${control} pl-9`} value={query} maxLength={32}
                placeholder="Nhập tên hiển thị" onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
            </span>
          </label>
          {term.length >= 2 && <div aria-busy={search?.term !== term}>
            {search?.term !== term ? <p role="status" className="text-sm text-slate-300">Đang tìm…</p>
              : search.error ? <div className="flex flex-wrap items-center gap-2">
                <p role="status" className="text-sm text-rose-300">{search.error}</p>
                <button type="button" className="rk-control" onClick={() => { setSearch(undefined); setSearchRetry((value) => value + 1); }}>Thử lại</button>
              </div> : search.results.length === 0 ? <p role="status" className="text-sm text-slate-300">Chưa tìm thấy người chơi. Hãy thử phần đầu của tên.</p>
              : <ul aria-label="Kết quả tìm người chơi" className="divide-y divide-white/10 rounded-lg border border-white/10 px-3">
                {search.results.map((result) => <li key={result.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 break-words text-sm font-medium">{result.name} <small className="text-slate-400">#{result.tag}</small></span>
                  {result.status ? <span className="text-sm text-slate-300">
                    {result.status === "accepted" ? "Bạn bè" : result.incoming ? "Đã gửi lời mời cho bạn" : "Đã gửi lời mời"}
                  </span> : <button type="button" className="rk-control" disabled={busy} aria-label={`Kết bạn với ${result.name} #${result.tag}`}
                    onClick={async () => {
                      if (await action({ action: "request", player: result.id }, "Đã gửi lời mời kết bạn.")) {
                        setSearchRetry((value) => value + 1);
                      }
                    }}>Kết bạn</button>}
                </li>)}
              </ul>}
          </div>}
        </div>
        <div className="min-w-0 space-y-4">
          {data.invites.length > 0 && <section className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-3 py-2">
            <Subheading className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><Swords size={15} aria-hidden="true" /> Lời mời đấu</Subheading>
            <ul className="mt-1 divide-y divide-white/10">{data.invites.map((invite) => <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="min-w-0 break-words text-sm">{invite.name}</span>
              <Link className="rk-control" href={`/duel?room=${invite.room_id}`}>Mở phòng <ArrowRight size={15} aria-hidden="true" /></Link>
            </li>)}</ul>
          </section>}
          <section aria-labelledby="duel-friend-list">
            <Subheading id="duel-friend-list" className="text-sm font-semibold">Danh sách bạn bè</Subheading>
            {data.friends.length === 0 && <p className="mt-1 text-sm text-slate-300">Chưa có bạn bè. Tìm theo tên để gửi lời mời.</p>}
            <ul className="mt-1 divide-y divide-white/10">{data.friends.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200">{Array.from(item.name)[0]?.toLocaleUpperCase("vi-VN")}</span>
                  <span className="min-w-0 break-words">{item.name}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {item.status === "accepted" ? <>
                    <button type="button" className="rk-control" aria-pressed={selected === item.id}
                      onClick={(event) => {
                        messageTrigger.current = event.currentTarget;
                        setSelected((current) => current === item.id ? undefined : item.id);
                      }}>
                      <MessageCircle size={16} aria-hidden="true" /> Nhắn tin
                    </button>
                    {room && <button type="button" className="rk-control" disabled={busy} onClick={() => void action({ action: "invite", friend: item.id, room }, "Đã gửi lời mời đấu.")}>
                      <Swords size={16} aria-hidden="true" /> Mời đấu
                    </button>}
                  </> : item.incoming ? <>
                    <button type="button" className="rk-primary" disabled={busy} onClick={() => void action({ action: "accept", friend: item.id }, "Đã thêm bạn.")}>Đồng ý</button>
                    <button type="button" className="rk-control" disabled={busy} onClick={() => void action({ action: "decline", friend: item.id }, "Đã từ chối lời mời.")}>Từ chối</button>
                  </> : <span className="text-sm text-slate-400">Đã gửi lời mời</span>}
                </div>
              </li>)}</ul>
          </section>
        </div>
      </div>
      {friend && <section ref={conversation} tabIndex={-1} className="scroll-m-4 space-y-2 rounded-xl border border-white/10 p-3" aria-label={`Trò chuyện với ${friend.name}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Subheading className="min-w-0 break-words text-sm font-semibold">{friend.name}</Subheading>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rk-control text-rose-200" disabled={busy}
              onClick={() => { if (window.confirm(`Chặn ${friend.name} và ngừng nhận tin nhắn?`)) void action({ action: "remove", friend: friend.id }, "Đã chặn liên hệ."); }}>
              Chặn liên hệ
            </button>
            <button type="button" aria-label="Đóng trò chuyện" className="grid size-11 place-items-center rounded-lg text-slate-300 hover:bg-white/10"
              onClick={() => { setSelected(undefined); messageTrigger.current?.focus(); }}><X size={17} aria-hidden="true" /></button>
          </div>
        </div>
        <DuelChat key={friend.id + conversationKey} title={`Tin nhắn với ${friend.name}`} endpoint={`${url}?friend=${friend.id}`}
          messageContext={{ action: "message", friend: friend.id }} />
      </section>}
    </>}
    {loadError && <div className="flex flex-wrap items-center gap-2">
      <p role="status" className="text-sm text-amber-200">{loadError}</p>
      <button type="button" className="rk-control" onClick={() => void load()}>Thử lại</button>
    </div>}
    {notice && <p role="status" className="text-sm text-cyan-200">{notice}</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onAuthSuccess={() => { void load(); }} returnTo="/duel?friends=1" />
  </div>;
}
