import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { duelDatabase } from "@/lib/duel/database";
import { isDuelRoomId } from "@/lib/duel/invite";
import { nameFor, type Room } from "@/lib/duel/room";
import { chatBody, friendSearchPrefix } from "@/lib/duel/social";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";

const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const json = (data: object) => NextResponse.json(data, { headers });
const done = () => new NextResponse(null, { status: 204, headers });
const profiles = "duel_social_profiles";
const friendships = "duel_friendships";
const messages = "duel_friend_chat";
type Edge = { id: string; requester: string; recipient: string; status: "pending" | "accepted" | "blocked" };

function peers(db: ReturnType<typeof duelDatabase>, user: string) {
  return db.from(friendships).select("id,requester,recipient,status")
    .or(`requester.eq.${user},recipient.eq.${user}`);
}

async function accepted(db: ReturnType<typeof duelDatabase>, user: string, friend: string) {
  const { data, error } = await peers(db, user).eq("id", friend).eq("status", "accepted").maybeSingle<Edge>();
  if (error) throw error;
  return data;
}

function unavailable(error: unknown) {
  console.error("Duel social request failed", typeof error === "object" && error && "code" in error ? error.code : "");
  return fail("Chưa kết nối được mục Bạn bè. Hãy thử lại.", 503);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedServerContext(request);
    if (!auth?.user || auth.user.is_anonymous) return fail("Đăng nhập để dùng Bạn bè.", 401);
    const user = auth.user.id;
    const db = duelDatabase();
    const search = request.nextUrl.searchParams.get("q");
    if (search !== null) {
      const term = search.trim();
      if (term.length < 2 || term.length > 32 || /[*\p{C}]/u.test(term)) {
        return fail("Nhập tên từ 2 đến 32 ký tự.", 400);
      }
      const prefix = friendSearchPrefix(term);
      if (prefix.length < 2) return json({ results: [] });
      const { data: candidates, error } = await db.from(profiles)
        .select("user_id,display_name,friend_code").eq("discoverable", true).neq("user_id", user)
        .like("search_name", `${prefix}%`).order("search_name").order("friend_code").limit(16);
      if (error) throw error;
      if (!candidates?.length) return json({ results: [] });
      const userIds = candidates.map(({ user_id }) => user_id).join(",");
      const { data: edges, error: linksError } = await db.from(friendships).select("id,requester,recipient,status")
        .or(`and(requester.eq.${user},recipient.in.(${userIds})),and(recipient.eq.${user},requester.in.(${userIds}))`).returns<Edge[]>();
      if (linksError) throw linksError;
      const relationships = new Map(edges?.map((edge) => [edge.requester === user ? edge.recipient : edge.requester, edge]));
      const results = candidates.flatMap(({ user_id, display_name, friend_code }) => {
        const relationship = relationships.get(user_id);
        return relationship?.status === "blocked" ? [] : [{
          id: friend_code, name: display_name, tag: friend_code.slice(0, 6),
          status: relationship?.status ?? null, incoming: relationship?.recipient === user,
        }];
      });
      return json({ results: results.slice(0, 8) });
    }
    const friend = request.nextUrl.searchParams.get("friend");
    if (friend !== null) {
      if (!isDuelRoomId(friend)) return fail("Cuộc trò chuyện không hợp lệ.", 400);
      if (!await accepted(db, user, friend)) return fail("Bạn không còn quyền mở cuộc trò chuyện này.", 403);
      const { data, error } = await db.from(messages).select("id,sender_id,body,room_id,sent_at")
        .eq("friendship_id", friend).order("sent_at", { ascending: false }).order("id", { ascending: false }).limit(50);
      if (error) throw error;
      return json({ messages: (data ?? []).reverse().map(({ sender_id, ...message }) => ({ ...message, mine: sender_id === user })) });
    }

    const [profile, links] = await Promise.all([
      db.from(profiles).select("friend_code,display_name,discoverable").eq("user_id", user).maybeSingle(),
      peers(db, user).neq("status", "blocked").order("created_at", { ascending: false }).limit(100).returns<Edge[]>(),
    ]);
    if (profile.error || links.error) throw profile.error ?? links.error;
    const rows = links.data ?? [];
    const opposite = (edge: Edge) => edge.requester === user ? edge.recipient : edge.requester;
    const friendIds = rows.filter((edge) => edge.status === "accepted").map(({ id }) => id);
    const [names, invites] = await Promise.all([
      rows.length ? db.from(profiles).select("user_id,display_name").in("user_id", rows.map(opposite)) : null,
      friendIds.length ? db.from(messages).select("id,room_id,friendship_id,duel_rooms!inner(expires_at)")
        .in("friendship_id", friendIds).neq("sender_id", user).not("room_id", "is", null)
        .is("duel_rooms.completed_at", null).eq("duel_rooms.state->>started", "false")
        .gt("duel_rooms.expires_at", new Date().toISOString()).order("sent_at", { ascending: false }).limit(10) : null,
    ]);
    if (names?.error || invites?.error) throw names?.error ?? invites?.error;
    const namesById = new Map(names?.data?.map(({ user_id, display_name }) => [user_id, display_name]));
    const friends = rows.map((edge) => ({
      id: edge.id, name: namesById.get(opposite(edge)) ?? "Người chơi",
      status: edge.status, incoming: edge.recipient === user,
    }));
    const linksById = new Map(friends.map((edge) => [edge.id, edge.name]));
    return json({
      profile: profile.data, friends,
      invites: (invites?.data ?? []).map(({ id, room_id, friendship_id }) => ({ id, room_id, name: linksById.get(friendship_id) })),
    });
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail("Yêu cầu không hợp lệ.", 403);
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || !body || Array.isArray(body)) return fail("Dữ liệu không hợp lệ.", 400);
  try {
    const auth = await getAuthenticatedServerContext(request);
    if (!auth?.user || auth.user.is_anonymous) return fail("Đăng nhập để dùng Bạn bè.", 401);
    const user = auth.user.id;
    const db = duelDatabase();
    if (body.action === "profile") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 32) return fail("Tên hiển thị cần từ 1 đến 32 ký tự.", 400);
      const { error } = await db.from(profiles).upsert({
        user_id: user, display_name: name.normalize("NFC"),
        ...(typeof body.discoverable === "boolean" && { discoverable: body.discoverable }),
      });
      if (error) throw error;
      return done();
    }

    if (body.action === "discoverable" && typeof body.enabled === "boolean") {
      const { error } = await db.from(profiles).update({ discoverable: body.enabled }).eq("user_id", user);
      if (error) throw error;
      return done();
    }

    if (body.action === "request") {
      const target = body.player ?? body.code;
      if (typeof target !== "string" || !isDuelRoomId(target)) return fail("Người chơi không hợp lệ.", 400);
      let lookup = db.from(profiles).select("user_id").eq("friend_code", target);
      if (body.player) lookup = lookup.eq("discoverable", true);
      const { data, error } = await lookup.maybeSingle();
      if (error) throw error;
      if (!data || data.user_id === user) return fail("Không tìm thấy người chơi này.", 404);
      const result = await db.from(friendships).insert({ requester: user, recipient: data.user_id });
      if (result.error?.code === "23505") return fail("Đã có lời mời hoặc bạn vừa gửi một yêu cầu. Hãy thử lại sau.", 409);
      if (result.error) throw result.error;
      return done();
    }

    if (typeof body.friend !== "string" || !isDuelRoomId(body.friend)) return fail("Cuộc trò chuyện không hợp lệ.", 400);
    if (body.action === "accept" || body.action === "decline" || body.action === "remove") {
      const status = body.action === "accept" ? "accepted" : "blocked";
      let change = db.from(friendships).update({ status }).eq("id", body.friend);
      change = body.action === "remove"
        ? change.or(`requester.eq.${user},recipient.eq.${user}`).eq("status", "accepted")
        : change.eq("recipient", user).eq("status", "pending");
      const { data, error } = await change.select("id").maybeSingle();
      if (error) throw error;
      return data ? done() : fail("Yêu cầu này không còn hiệu lực.", 409);
    }

    if (body.action !== "message" && body.action !== "invite") return fail("Thao tác không hợp lệ.", 400);
    if (!await accepted(db, user, body.friend)) return fail("Chỉ bạn bè mới có thể nhắn tin và mời nhau.", 403);
    const message = chatBody(body.message);
    let roomId: string | null = null;
    if (body.action === "invite") {
      const cookie = request.cookies.get("ruk-duel")?.value;
      if (!cookie || !/^[a-f0-9]{64}$/.test(cookie) || typeof body.room !== "string" || !isDuelRoomId(body.room)) {
        return fail("Hãy vào phòng chờ trước khi mời bạn.", 400);
      }
      const key = createHash("sha256").update(cookie).digest("hex");
      const { data: room, error } = await db.from("duel_rooms").select("id,host_key,seats,spectators,referee_key,referee_name,state")
        .eq("id", body.room).is("completed_at", null).gt("expires_at", new Date().toISOString())
        .eq("state->>started", "false").maybeSingle<Room>();
      if (error) throw error;
      if (!room || !nameFor(room, key) || !room.seats.includes(null)) return fail("Phòng đã đóng, đủ người hoặc trận đã bắt đầu.", 403);
      roomId = room.id;
    } else if (!message) return fail("Tin nhắn cần từ 1 đến 400 ký tự.", 400);
    const { error } = await db.from(messages).insert({
      friendship_id: body.friend, sender_id: user, body: roomId ? null : message, room_id: roomId,
    });
    if (error?.code === "23505") return fail("Hãy đợi một chút rồi gửi lại.", 429);
    if (error) throw error;
    return done();
  } catch (error) {
    return unavailable(error);
  }
}
