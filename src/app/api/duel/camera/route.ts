import { createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isDuelRoomId } from "@/lib/duel/invite";
import type { CameraDescription, CameraSignals, CameraSnapshot } from "@/lib/duel/camera";
import { MAX_SPECTATORS, type Room } from "@/lib/duel/room";

type SignalRow = { peer_id: string; session_id: string; publishing: boolean; signals: CameraSignals; updated_at: string };
const peerId = (room: string, key: string) => createHash("sha256").update(`duel-camera:${room}:${key}`).digest("hex").slice(0, 32);
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

function description(data: unknown): CameraDescription | undefined {
  if (!data || typeof data !== "object") return;
  const value = data as Partial<CameraDescription>;
  if (typeof value.id !== "string" || !isDuelRoomId(value.id) || typeof value.sdp !== "string" ||
      value.sdp.length > 24_000 || !value.sdp.startsWith("v=0") || !/^m=(audio|video) /m.test(value.sdp) ||
      /^m=(?!(audio|video) )/m.test(value.sdp)) return;
  return { id: value.id, sdp: value.sdp };
}

function iceServers(id: string): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const urls = process.env.DUEL_TURN_URLS?.split(",").map((url) => url.trim()).filter((url) => /^turns?:/.test(url));
  const secret = process.env.DUEL_TURN_SHARED_SECRET;
  if (urls?.length && secret) {
    const username = `${Math.floor(Date.now() / 3600000) * 3600 + 7200}:${id}`;
    servers.push({ urls, username, credential: createHmac("sha1", secret).update(username).digest("base64") });
  }
  return servers;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return reply({}, 403);
  const token = request.cookies.get("ruk-duel")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return reply({}, 403);
  if (Number(request.headers.get("content-length")) > 800_000) return reply({}, 413);
  const raw = await request.text();
  if (raw.length > 200_000) return reply({}, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return reply({}, 400); }
  if (!body || typeof body.room !== "string" || !isDuelRoomId(body.room) ||
      typeof body.session !== "string" || !isDuelRoomId(body.session) ||
      typeof body.publishing !== "boolean" || !body.signals || typeof body.signals !== "object" ||
      Array.isArray(body.signals) || Object.keys(body.signals).length > MAX_SPECTATORS + 2) return reply({}, 400);

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) return reply({}, 503);
    const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const id = peerId(body.room, createHash("sha256").update(token).digest("hex"));
    if (body.close === true) {
      const { error: closeError } = await db.from("duel_camera_signals").delete()
        .eq("room_id", body.room).eq("peer_id", id).eq("session_id", body.session);
      return reply({}, closeError ? 503 : 200);
    }
    const { data: room, error } = await db.from("duel_rooms").select("seats,spectators,state,referee_key,referee_name")
      .eq("id", body.room).gt("expires_at", new Date().toISOString()).is("completed_at", null)
      .maybeSingle<Pick<Room, "seats" | "spectators" | "state" | "referee_key" | "referee_name">>();
    if (error) return reply({}, 503);
    if (!room) return reply({}, 404);
    const members = [
      ...room.seats.flatMap((key, index) => key ? [{ key, name: room.state.players[index] ?? `Player ${index + 1}`, player: true }] : []),
      ...room.spectators.map((viewer) => ({ ...viewer, player: false })),
      ...(room.referee_key && room.referee_name ? [{ key: room.referee_key, name: room.referee_name, player: false }] : []),
    ].map(({ key, ...member }) => ({ ...member, id: peerId(body.room, key) }));
    const member = members.find((item) => item.id === id);
    if (!member || (body.publishing && !member.player)) return reply({}, 403);
    const signals: CameraSignals = {};
    for (const target of members) {
      if (target.id === id) continue;
      const data = body.signals[target.id];
      if (!data || typeof data.session !== "string" || !isDuelRoomId(data.session)) continue;
      const offer = target.player ? description(data.offer) : undefined;
      const answer = member.player && body.publishing ? description(data.answer) : undefined;
      if (offer || answer) signals[target.id] = { session: data.session, offer, answer };
    }
    const now = new Date().toISOString();
    const { error: writeError } = await db.from("duel_camera_signals").upsert({
      room_id: body.room, peer_id: id, session_id: body.session,
      publishing: body.publishing, signals, updated_at: now,
    }, { onConflict: "room_id,peer_id" });
    if (writeError) return reply({}, 503);
    const otherPeers = members.filter((item) => item.id !== id).map((item) => item.id);
    if (!otherPeers.length) return reply({ peers: [], iceServers: iceServers(id) } satisfies CameraSnapshot);
    const { data: rows, error: readError } = await db.from("duel_camera_signals")
      .select("peer_id,session_id,publishing,signals,updated_at").eq("room_id", body.room)
      .in("peer_id", otherPeers)
      .gt("updated_at", new Date(Date.now() - 12_000).toISOString()).returns<SignalRow[]>();
    if (readError) return reply({}, 503);
    const peers = (rows ?? []).flatMap((row) => {
      const sender = members.find((item) => item.id === row.peer_id);
      if (!sender) return [];
      const directed = row.signals[id];
      return [{ id: sender.id, session: row.session_id, name: sender.name, publishing: sender.player && row.publishing,
        ...(directed?.session === body.session ? { offer: directed.offer, answer: directed.answer } : {}) }];
    });
    return reply({ peers, iceServers: iceServers(id) } satisfies CameraSnapshot);
  } catch {
    return reply({}, 503);
  }
}
