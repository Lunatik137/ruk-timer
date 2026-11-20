import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isDuelRoomId } from "@/lib/duel/invite";
import {
  approveResult, awaitingApproval, canMarkReady, canSolve, createMatch, DUEL_EVENTS, isDuelPuzzle, markReady, recordResult, resultFor, viewFor,
  type DuelHistoryItem, type DuelMatch, type DuelPuzzle, type Role,
} from "@/lib/duel/match";
import { canModerate, nameFor, place, resultOfficial, seatFor, type Room } from "@/lib/duel/room";

const table = "duel_rooms";
const cookie = "ruk-duel";
const credential = /^[a-f0-9]{64}$/;

type Body = Record<string, unknown>;
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const retry = () => NextResponse.json({ retry: true, error: "Phòng vừa thay đổi. Hãy thử lại." }, { status: 409, headers });
const admissionUnavailable = () => fail("Tính năng duyệt vào phòng đang được cập nhật.", 503);

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing duel database configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function playerKey(token: string | undefined) {
  return token && credential.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

function response(room: Room, key: string | null, token?: string) {
  const spectators = room.spectators.map((viewer) => viewer.name);
  const name = nameFor(room, key);
  const official = resultOfficial(room);
  const requests = room.access_requests ?? [];
  const ownRequest = requests.find((request) => request.key === key);
  const pending = canModerate(room, key) ? requests.flatMap(({ id, name, role, status }) =>
    status === "pending" ? [{ id, name, role }] : []) : [];
  const referee = room.referee_key ? nameFor(room, room.referee_key) ?? null : null;
  const accessAvailable = Array.isArray(room.access_requests);
  const view = name ? {
    ...viewFor(room.state, seatFor(room, key), name, key === room.host_key, spectators,
      official?.name ?? null, official?.key === key, pending),
    referee, isReferee: room.referee_key === key, accessAvailable,
  } : {
    kind: "invite", settings: room.state.settings, host: room.host_name, spectators,
    slots: room.state.players.map(Boolean), started: room.state.started,
    referee, accessAvailable,
    access: ownRequest ? { role: ownRequest.role, status: ownRequest.status } : null,
  };
  const res = NextResponse.json({ id: room.id, revision: room.revision, view }, { headers });
  if (token) res.cookies.set(cookie, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/api/duel", maxAge: 86_400 * 365,
  });
  return res;
}

async function fetchRoom(db: ReturnType<typeof database>, id: string): Promise<Room | null> {
  const { data, error } = await db.from(table).select()
    .eq("id", id).or(`expires_at.gt.${new Date().toISOString()},completed_at.not.is.null`).maybeSingle<Room>();
  if (error) throw error;
  return data;
}

async function updateRoom(db: ReturnType<typeof database>, room: Room, changes: Partial<Room>) {
  const update = { ...changes, revision: room.revision + 1 };
  if (!Array.isArray(room.access_requests)) {
    delete update.referee_name;
    delete update.access_requests;
  }
  const { data, error } = await db.from(table).update(update)
    .eq("id", room.id).eq("revision", room.revision).gt("expires_at", new Date().toISOString())
    .select().maybeSingle<Room>();
  if (error) throw error;
  return data;
}

function asRole(value: unknown): Role | null {
  return value === "player1" || value === "player2" || value === "spectator" || value === "referee" ? value : null;
}

async function scrambleFor(puzzle: DuelPuzzle) {
  const { randomScrambleForEvent } = await import("cubing/scramble");
  return (await randomScrambleForEvent(DUEL_EVENTS[puzzle])).toString().trim();
}

function unavailable(error: unknown) {
  console.error("Duel storage or scramble unavailable", error instanceof Error ? error.message : "request failed");
  return fail("Phòng đấu tạm thời chưa kết nối được. Hãy thử lại.", 503);
}

export async function GET(req: NextRequest) {
  const key = playerKey(req.cookies.get(cookie)?.value);
  if (req.nextUrl.searchParams.has("history")) {
    if (!key) return NextResponse.json({ history: [] }, { headers });
    try {
      const { data, error } = await database().from(table).select("id,completed_at,state")
        .not("completed_at", "is", null).or(`host_key.eq.${key},seats.cs.["${key}"]`)
        .order("completed_at", { ascending: false }).limit(50)
        .returns<{ id: string; completed_at: string; state: DuelMatch }[]>();
      if (error) throw error;
      const history: DuelHistoryItem[] = (data ?? []).flatMap(({ id, completed_at, state }) => state.winner === null ? [] : [{
        id, completedAt: completed_at, settings: state.settings, players: state.players, sets: state.sets, winner: state.winner,
      }]);
      return NextResponse.json({ history }, { headers });
    } catch (error) {
      return unavailable(error);
    }
  }
  const id = req.nextUrl.searchParams.get("room") ?? "";
  if (!isDuelRoomId(id)) return fail("Link phòng không hợp lệ.", 400);
  try {
    const room = await fetchRoom(database(), id);
    if (!room || (room.completed_at && !nameFor(room, key))) return fail("Phòng không tồn tại hoặc đã hết hạn.", 404);
    return response(room, key);
  } catch (error) {
    return unavailable(error);
  }
}

function readName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 32) : "";
}

export async function POST(req: NextRequest) {
  if (req.headers.get("sec-fetch-site") === "cross-site") return fail("Yêu cầu không hợp lệ.", 403);
  const raw: unknown = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Dữ liệu không hợp lệ.", 400);
  const body = raw as Body;
  const existingToken = req.cookies.get(cookie)?.value;
  const token = existingToken && credential.test(existingToken) ? existingToken : randomBytes(32).toString("hex");
  const key = playerKey(token)!;

  try {
    const db = database();
    if (body.action === "create") {
      const { puzzle, setsToWin, pointsToWin, mode = "alternating", inspection = true } = body;
      const name = readName(body.name);
      const role = asRole(body.role);
      if (!name || !role || !isDuelPuzzle(puzzle) || (mode !== "alternating" && mode !== "simultaneous") || typeof inspection !== "boolean" ||
          typeof setsToWin !== "number" || !Number.isInteger(setsToWin) || setsToWin < 1 || setsToWin > 5 ||
          typeof pointsToWin !== "number" || !Number.isInteger(pointsToWin) || pointsToWin < 1 || pointsToWin > 7) {
        return fail("Hãy kiểm tra tên và thể thức phòng.", 400);
      }
      const id = randomUUID();
      const empty: Room = {
        id, host_key: key, host_name: name, seats: [null, null], spectators: [], revision: 0,
        state: createMatch({ puzzle, setsToWin, pointsToWin, mode, inspection }),
      };
      const placement = place(empty, key, name, role)!;
      const room = { ...empty, seats: placement.seats, spectators: placement.spectators, state: placement.state,
        ...(role === "referee" ? { referee_key: placement.referee_key, referee_name: placement.referee_name } : {}) };
      const { data, error } = await db.from(table).insert(room).select().single<Room>();
      if (error?.code === "PGRST204" && role === "referee") return admissionUnavailable();
      if (error) throw error;
      return response(data, key, token);
    }

    if (typeof body.room !== "string" || !isDuelRoomId(body.room)) return fail("Link phòng không hợp lệ.", 400);
    const room = await fetchRoom(db, body.room);
    if (!room) return fail("Phòng không tồn tại hoặc đã hết hạn.", 404);
    const seat = seatFor(room, key);
    const isReferee = room.referee_key === key;
    const name = nameFor(room, key);
    const requests = room.access_requests ?? [];

    if (!Array.isArray(room.access_requests) &&
      (["promote-referee", "release-referee", "review-access", "cancel-access"].includes(String(body.action))
        || (body.action === "seat" && (body.role === "referee" || (!name && body.role === "spectator"))))) {
      return admissionUnavailable();
    }

    if (body.action === "promote-referee") {
      if (key !== room.host_key || room.state.started) return fail("Chỉ chủ phòng được chọn trọng tài trong phòng chờ.", 403);
      if (body.revision !== room.revision) return fail("Danh sách người xem đã đổi. Hãy chọn lại.", 409);
      const index = body.index;
      const viewer = typeof index === "number" && Number.isInteger(index) ? room.spectators[index] : null;
      if (!viewer) return fail("Người xem này không còn trong phòng.", 409);
      const changes = place(room, viewer.key, viewer.name, "referee");
      if (!changes) return fail("Ghế trọng tài đã có người.", 409);
      const data = await updateRoom(db, room, changes);
      return data ? response(data, key) : fail("Danh sách người xem đã đổi. Hãy chọn lại.", 409);
    }

    if (body.action === "release-referee") {
      if (key !== room.host_key || room.state.started) return fail("Chỉ chủ phòng được đổi trọng tài trong phòng chờ.", 403);
      if (!room.referee_key || !room.referee_name) return response(room, key);
      if (body.revision !== room.revision) return fail("Vai trò trong phòng đã đổi. Hãy chọn lại.", 409);
      const changes = place(room, room.referee_key, room.referee_name, "spectator");
      if (!changes) return fail("Cần một ghế người xem trống để đổi vai trò.", 409);
      const data = await updateRoom(db, room, changes);
      return data ? response(data, key) : fail("Vai trò trong phòng đã đổi. Hãy chọn lại.", 409);
    }

    if (body.action === "review-access") {
      if (!canModerate(room, key)) return fail("Chỉ chủ phòng và trọng tài được duyệt yêu cầu.", 403);
      if (room.state.winner !== null) return fail("Trận đã kết thúc.", 409);
      if (typeof body.allow !== "boolean") return fail("Chọn cho vào hoặc từ chối.", 400);
      const request = requests.find((item) => item.id === body.requestId && item.status === "pending");
      if (!request) return response(room, key);
      const changes = body.allow ? place(room, request.key, request.name, request.role) : {};
      if (!changes) return fail(request.role === "referee" ? "Ghế trọng tài đã có người." : "Phòng đã đủ hai người xem.", 409);
      const access_requests = requests.flatMap((item) => item.id !== request.id ? [item] :
        body.allow ? [] : [{ ...item, status: "denied" as const }]);
      const data = await updateRoom(db, room, { ...changes, access_requests });
      return data ? response(data, key) : retry();
    }

    if (body.action === "cancel-access") {
      const access_requests = requests.filter((item) => item.key !== key || item.status !== "pending");
      if (access_requests.length === requests.length) return response(room, key);
      const data = await updateRoom(db, room, { access_requests });
      return data ? response(data, key) : retry();
    }

    if (body.action === "seat") {
      if (room.state.winner !== null) return fail("Trận đã kết thúc.", 409);
      const role = asRole(body.role);
      const displayName = name || readName(body.name);
      if (!displayName || !role) return fail("Nhập tên và chọn chỗ trong phòng.", 400);
      const ownRequest = requests.find((item) => item.key === key);
      if (ownRequest) return response(room, key);
      if (room.state.started && (name || role === "player1" || role === "player2")) {
        return fail("Trận đã bắt đầu. Chỗ của hai người chơi đã khóa.", 409);
      }
      if (!name && (role === "spectator" || role === "referee")) {
        if (role === "referee" && room.referee_key) return fail("Ghế trọng tài đã có người.", 409);
        if (requests.length >= 32) return fail("Phòng đã nhận tối đa số yêu cầu.", 429);
        const data = await updateRoom(db, room, { access_requests: [...requests, {
          id: randomUUID(), key, name: displayName, role, status: "pending",
        }] });
        return data ? response(data, key, token) : retry();
      }
      if (role === "referee" && key !== room.host_key) return fail("Chủ phòng cần duyệt vai trò trọng tài.", 403);
      const changes = place(room, key, displayName, role);
      if (!changes) return fail("Chỗ này đã có người. Hãy chọn chỗ khác.", 409);
      const data = await updateRoom(db, room, changes);
      if (!data) return retry();
      return response(data, key, token);
    }

    if (body.action === "leave") {
      if (!name) return response(room, key);
      if (key === room.host_key) return fail("Chủ phòng có thể đổi chỗ trước khi bắt đầu.", 409);
      if (isReferee && room.state.started && room.state.winner === null) return fail("Trọng tài cần ở lại cho đến khi trận kết thúc.", 409);
      if (room.state.started && seat !== null) return fail("Chỗ của người chơi đã khóa.", 409);
      const seats: Room["seats"] = [...room.seats];
      const players: DuelMatch["players"] = [...room.state.players];
      if (seat !== null) { seats[seat] = null; players[seat] = null; }
      const spectators = room.spectators.filter((viewer) => viewer.key !== key);
      const data = await updateRoom(db, room, { seats, spectators, state: { ...room.state, players }, ...(isReferee ? { referee_key: null, referee_name: null } : {}) });
      return data ? response(data, key) : retry();
    }

    if (body.action === "start") {
      if (!canModerate(room, key)) return fail("Chỉ chủ phòng và trọng tài được bắt đầu trận.", 403);
      if (room.state.started) return response(room, key);
      if (!room.seats[0] || !room.seats[1]) return fail("Cần đủ hai người chơi.", 409);
      const scramble = await scrambleFor(room.state.settings.puzzle);
      const state = { ...room.state, started: true, round: { ...room.state.round, scramble } };
      const data = await updateRoom(db, room, { state });
      return data ? response(data, key) : retry();
    }

    if (body.action === "ready") {
      if (seat === null) return fail("Chỉ người chơi mới xác nhận xáo.", 403);
      if (!room.state.started || room.state.winner !== null || body.round !== room.state.round.number) return fail("Lượt này đã thay đổi.", 409);
      if (room.state.round.ready?.[seat]) return response(room, key);
      if (!canMarkReady(room.state, seat)) return fail("Chưa đến lượt bạn xáo Scramble.", 409);
      const data = await updateRoom(db, room, { state: markReady(room.state, seat) });
      return data ? response(data, key) : retry();
    }

    if (body.action === "approve") {
      const official = resultOfficial(room);
      if (official ? official.key !== key : seat === null) return fail("Bạn không có quyền xác nhận kết quả.", 403);
      if (room.state.history.some((item) => item.number === body.round)) return response(room, key);
      if (body.round !== room.state.round.number || !awaitingApproval(room.state)) return fail("Chưa đủ hai kết quả để xác nhận.", 409);
      if (seat !== null && room.state.round.approvals?.[seat]) return response(room, key);
      const state = approveResult(room.state, official ? null : seat);
      if (state.round.number !== room.state.round.number) state.round.scramble = await scrambleFor(state.settings.puzzle);
      const data = await updateRoom(db, room, { state, ...(state.winner !== null ? { completed_at: new Date().toISOString(), access_requests: [] } : {}) });
      return data ? response(data, key) : retry();
    }

    if (body.action !== "submit") return fail("Thao tác không hợp lệ.", 400);
    if (seat === null) return fail("Bạn không phải thành viên của phòng.", 403);
    const { round, ms, penalty } = body;
    if (typeof round !== "number" || !Number.isSafeInteger(round) || round < 1 ||
        typeof ms !== "number" || !Number.isInteger(ms) || ms < 0 || ms >= 600_000 ||
        (penalty !== "OK" && penalty !== "+2" && penalty !== "DNF") || (penalty !== "DNF" && ms < 10)) {
      return fail("Kết quả không hợp lệ.", 400);
    }
    const prior = resultFor(room.state, round, seat);
    if (prior?.ms === ms && prior.penalty === penalty) return response(room, key);
    if (round !== room.state.round.number || !canSolve(room.state, seat)) {
      return fail("Lượt này đã chốt hoặc chưa đến lượt bạn.", 409);
    }

    const state = recordResult(room.state, seat, { ms, penalty });
    const data = await updateRoom(db, room, { state });
    if (!data) {
      const latest = await fetchRoom(db, room.id);
      const saved = latest && resultFor(latest.state, round, seat);
      if (latest && saved?.ms === ms && saved.penalty === penalty) return response(latest, key);
      return retry();
    }
    return response(data, key);
  } catch (error) {
    return unavailable(error);
  }
}
