"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Copy, MessageCircle, Swords } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import DuelChat, { duelRequest, useDuelRefresh } from "@/components/DuelChat";
import type { FriendLink } from "@/lib/duel/social";

const url = "/api/duel/social";
const control = "min-h-11 w-full min-w-0 rounded-lg border border-white/15 bg-[var(--rk-canvas)] px-3 text-base";
type SocialState = {
  profile: { friend_code: string; display_name: string } | null;
  friends: FriendLink[];
  invites: { id: string; room_id: string; name: string }[];
};

export default function DuelSocial({ room }: { room?: string }) {
  const [data, setData] = useState<SocialState>();
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [display, setDisplay] = useState("");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<string>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationKey, setConversationKey] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      if (signal?.aborted) return;
      if (response.status === 401) {
        setNeedsLogin(true);
        setData(undefined);
        return;
      }
      if (!response.ok) throw new Error("Chưa tải được mục Bạn bè.");
      setData(await response.json());
      setNeedsLogin(false);
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Chưa kết nối được.");
    }
  }, []);
  useDuelRefresh(load, 12000, !needsLogin);

  async function action(body: object, text: string) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await duelRequest(url, body);
      setNotice(text);
      if ("action" in body && body.action === "request") setCode("");
      if ("action" in body && body.action === "invite") setConversationKey((value) => value + 1);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không thực hiện được. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  }

  const profile = data?.profile;
  const friend = data?.friends.find((item) => item.id === selected && item.status === "accepted");

  return <div className="space-y-4 border-t border-white/10 pt-3">
    {needsLogin ? <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-slate-300">Đăng nhập để kết bạn, nhắn tin và gửi lời mời đấu.</p>
      <button type="button" className="rk-primary" onClick={() => setAuthOpen(true)}>Đăng nhập</button>
    </div> : !data ? <p className="text-sm text-slate-300">Đang tải bạn bè…</p> : !profile ? (
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void action({ action: "profile", name: display }, "Đã tạo mã bạn bè."); }}>
        <label className="min-w-0 grow basis-44 space-y-1 text-sm">Tên bạn bè sẽ thấy
          <input className={control} value={display} maxLength={32} required onChange={(event) => setDisplay(event.target.value)} />
        </label>
        <button type="submit" className="rk-primary" disabled={busy}>Tạo mã bạn bè</button>
      </form>
    ) : <>
      {data.invites.length > 0 && <section>
        <h3 className="text-sm font-semibold">Lời mời đấu</h3>
        <ul className="mt-1 divide-y divide-white/10">{data.invites.map((invite) => <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
          <span className="min-w-0 break-words text-sm">{invite.name}</span>
          <Link className="rk-control" href={`/duel?room=${invite.room_id}`}>Mở phòng</Link>
        </li>)}</ul>
      </section>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 grow basis-48 space-y-1 text-sm">Mã của bạn
          <input className={control} readOnly value={profile.friend_code} onFocus={(event) => event.target.select()} />
        </label>
        <button type="button" className="rk-control" onClick={async () => {
          try { await navigator.clipboard.writeText(profile.friend_code); setNotice("Đã sao chép mã."); }
          catch { setNotice("Chọn và sao chép mã từ ô bên cạnh."); }
        }}><Copy size={16} aria-hidden="true" /> Sao chép</button>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void action({ action: "request", code: code.trim().toLowerCase() }, "Đã gửi lời mời kết bạn."); }}>
        <label className="min-w-0 grow basis-44 space-y-1 text-sm">Mã của người bạn muốn thêm
          <input className={control} value={code} maxLength={36} required onChange={(event) => setCode(event.target.value)} autoCapitalize="none" spellCheck={false} />
        </label>
        <button type="submit" className="rk-primary" disabled={busy}>Kết bạn</button>
      </form>
      {data.friends.length === 0 && <p className="text-sm text-slate-300">Chưa có bạn bè.</p>}
      <ul className="divide-y divide-white/10">{data.friends.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="min-w-0 break-words text-sm font-medium">{item.name}</span>
        <div className="flex flex-wrap gap-2">
          {item.status === "accepted" ? <>
            <button type="button" className="rk-control" aria-pressed={selected === item.id}
              onClick={() => setSelected((current) => current === item.id ? undefined : item.id)}>
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
      {friend && <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 break-words text-sm font-semibold">{friend.name}</h3>
          <button type="button" className="rk-control text-rose-200" disabled={busy}
            onClick={() => { if (window.confirm(`Chặn ${friend.name} và ngừng nhận tin nhắn?`)) void action({ action: "remove", friend: friend.id }, "Đã chặn liên hệ."); }}>
            Chặn liên hệ
          </button>
        </div>
        <DuelChat key={friend.id + conversationKey} title={`Tin nhắn với ${friend.name}`} endpoint={`${url}?friend=${friend.id}`}
          messageContext={{ action: "message", friend: friend.id }} />
      </div>}
    </>}
    {notice && <p role="status" className="text-sm text-cyan-200">{notice}</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onAuthSuccess={() => { void load(); }} returnTo="/duel?friends=1" />
  </div>;
}
