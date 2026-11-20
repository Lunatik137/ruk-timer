"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { ChatMessage } from "@/lib/duel/social";

export async function duelRequest<T>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store", signal,
    ...(body && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Chưa kết nối được. Hãy thử lại.");
  }
  return response.status === 204 ? undefined as T : response.json();
}

export function useDuelRefresh(load: (signal: AbortSignal) => Promise<void>, delay: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    async function tick() {
      if (document.hidden || inFlight || controller.signal.aborted) return;
      clearTimeout(timer);
      inFlight = true;
      try {
        await load(controller.signal);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) timer = setTimeout(tick, delay);
      }
    }
    void tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load, delay, enabled]);
}

export default function DuelChat({ endpoint, messageContext, title, canSend = true }: {
  endpoint: string;
  messageContext: object;
  title: string;
  canSend?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>();
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const destination = endpoint.split("?")[0];

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await duelRequest<{ messages: ChatMessage[] }>(endpoint, undefined, signal);
      if (signal?.aborted) return;
      setMessages(data.messages);
      setLoadError("");
    } catch (failure) {
      if (signal?.aborted) return;
      setLoadError(failure instanceof Error ? failure.message : "Chưa tải được tin nhắn.");
    }
  }, [endpoint]);
  useDuelRefresh(load, canSend ? 4000 : 30000);

  useEffect(() => {
    if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages?.at(-1)?.id]);

  async function send() {
    if (!draft.trim() || sending) return;
    setError("");
    setSending(true);
    try {
      await duelRequest(destination, { ...messageContext, message: draft });
      setDraft("");
      follow.current = true;
      await load();
      composer.current?.focus({ preventScroll: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa gửi được tin nhắn.");
    } finally {
      setSending(false);
    }
  }

  return <section className="min-w-0 space-y-2" aria-label={title}>
    <div ref={log} role="log" aria-label={title} tabIndex={0}
      onScroll={(event) => {
        const target = event.currentTarget;
        follow.current = target.scrollHeight - target.scrollTop - target.clientHeight < 32;
      }}
      className="max-h-60 min-h-24 space-y-2 overflow-y-auto overscroll-contain rounded-lg bg-[var(--rk-canvas)] p-3 text-sm">
      {!messages?.length && <p className="text-slate-400">{messages ? "Chưa có tin nhắn." : "Đang tải tin nhắn…"}</p>}
      {messages?.map((message) => <div key={message.id} className={`w-fit max-w-full rounded-lg px-2.5 py-1.5 ${message.mine ? "ml-auto bg-cyan-300/10" : "bg-white/5"}`}>
        <div className="flex flex-wrap gap-x-2 text-xs text-slate-300">
          <span className="[overflow-wrap:anywhere]">{message.mine ? "Bạn" : message.sender_name}</span>
          <time dateTime={message.sent_at}>{new Date(message.sent_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
        {message.room_id ? <Link href={`/duel?room=${message.room_id}`} className="mt-1 inline-flex min-h-11 items-center text-cyan-200 underline underline-offset-4">
          Lời mời đấu · Mở phòng
        </Link> : <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>}
      </div>)}
    </div>
    {canSend && <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <textarea ref={composer} className="min-h-11 min-w-0 flex-1 resize-y rounded-lg border border-white/15 bg-[var(--rk-canvas)] px-2.5 py-2 text-base"
        value={draft} rows={1} maxLength={400} aria-label="Tin nhắn" placeholder="Nhập tin nhắn"
        onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" aria-label="Gửi tin nhắn" disabled={sending || !draft.trim()} className="rk-primary size-11 shrink-0 justify-center px-0 disabled:opacity-50">
        <Send size={16} aria-hidden="true" />
      </button>
    </form>}
    {(error || loadError) && <p role="status" className="text-sm text-rose-300">{error || loadError}</p>}
  </section>;
}
