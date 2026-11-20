import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isDuelRoomId } from "@/lib/duel/invite";
import {
  approveResult, awaitingApproval, canSolve, createMatch, DUEL_EVENTS, isDuelPuzzle, markReady, recordResult, resultFor, viewFor,
  type DuelHistoryItem, type DuelMatch, type DuelPuzzle, type Pair, type Role, type Seat,
} from "@/lib/duel/match";

const table = "duel_rooms";
const cookie = "ruk-duel";
const credential = /^[a-f0-9]{64}$/;

type Room = {
  id: string;
  host_key: string;
  host_name: string;
  seats: Pair<string | null>;
  spectators: { key: string; name: string }[];
  referee_key?: string | null;
  completed_at?: string | null;
  revision: number;
  state: DuelMatch;
};
type Body = Record<string, unknown>;
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const retry = () => NextResponse.json({ retry: true, error: "Phòng vừa thay đổi. Hãy thử lại." }, { status: 409, headers });

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing duel database configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function playerKey(token: string | undefined) {
  return token && credential.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

function seatFor(room: Room, key: string | null): Seat | null {
  if (key && key === room.seats[0]) return 0;
  if (key && key === room.seats[1]) return 1;
  return null;
}

function nameFor(room: Room, key: string | null) {
  const seat = seatFor(room, key);
  return seat === null ? room.spectators.find((viewer) => viewer.key === key)?.name : room.state.players[seat];
}

function response(room: Room, key: string | null, token?: string) {
  const spectators = room.spectators.map((viewer) => viewer.name);
  const name = nameFor(room, key);
  const refereeIndex = room.spectators.findIndex((viewer) => viewer.key === room.referee_key);
  const referee = room.spectators[refereeIndex];
  const view = name ? viewFor(room.state, seatFor(room, key), name, key === room.host_key, spectators,
    referee?.name ?? null, Boolean(key && referee?.key === key), refereeIndex) : {
    kind: "invite", settings: room.state.settings, host: room.host_name, spectators,
    slots: room.state.players.map(Boolean), started: room.state.started,
  };
  const res = NextResponse.json({ id: room.id, revision: room.revision, view }, { headers });
  if (token) res.cookies.set(cookie, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/api/duel", maxAge: 86_400 * 365,
  });
  return res;
}

async function fetchRoom(db: ReturnType<typeof database>, id: string): Promise<Room | null> {
  const { data, error } = await db.from(table).select("id,host_key,host_name,seats,spectators,revision,state,referee_key,completed_at")
    .eq("id", id).or(`expires_at.gt.${new Date().toISOString()},completed_at.not.is.null`).maybeSingle<Room>();
  if (error) throw error;
  return data;
}

async function updateRoom(db: ReturnType<typeof database>, room: Room, changes: Partial<Room>) {
  const { data, error } = await db.from(table).update({ ...changes, revision: room.revision + 1 })
    .eq("id", room.id).eq("revision", room.revision).gt("expires_at", new Date().toISOString())
    .select().maybeSingle<Room>();
  if (error) throw error;
  return data;
}

function asRole(value: unknown): Role | null {
  return value === "player1" || value === "player2" || value === "spectator" ? value : null;
}

function place(room: Room, key: string, name: string, role: Role) {
  const seats: Room["seats"] = [...room.seats];
  const players: DuelMatch["players"] = [...room.state.players];
  const spectators = room.spectators.filter((viewer) => viewer.key !== key);
  const previous = seatFor(room, key);
  if (previous !== null) { seats[previous] = null; players[previous] = null; }
  if (role === "spectator") {
    if (spectators.length >= 2) return null;
    spectators.push({ key, name });
  } else {
    const seat = role === "player1" ? 0 : 1;
    if (seats[seat]) return null;
    seats[seat] = key;
    players[seat] = name;
  }
  return { seats, spectators, state: { ...room.state, players } };
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
      const room = { ...empty, ...place(empty, key, name, role) };
      const { error } = await db.from(table).insert(room);
      if (error) throw error;
      return response(room, key, token);
    }

    if (typeof body.room !== "string" || !isDuelRoomId(body.room)) return fail("Link phòng không hợp lệ.", 400);
    const room = await fetchRoom(db, body.room);
    if (!room) return fail("Phòng không tồn tại hoặc đã hết hạn.", 404);
    const seat = seatFor(room, key);
    const isReferee = room.referee_key === key;

    if (body.action === "referee") {
      if (key !== room.host_key || room.state.started) return fail("Chỉ chủ phòng được chọn trọng tài trong phòng chờ.", 403);
      if (body.revision !== room.revision) return fail("Danh sách người xem đã đổi. Hãy chọn lại.", 409);
      const index = body.index;
      const viewer = typeof index === "number" && Number.isInteger(index) ? room.spectators[index] : null;
      if (index !== null && !viewer) return fail("Người xem này không còn trong phòng.", 409);
      const data = await updateRoom(db, room, { referee_key: viewer?.key ?? null });
      return data ? response(data, key) : fail("Danh sách người xem đã đổi. Hãy chọn lại.", 409);
    }

    if (body.action === "seat") {
      if (room.state.winner !== null) return fail("Trận đã kết thúc.", 409);
      const role = asRole(body.role);
      const name = nameFor(room, key) || readName(body.name);
      if (!name || !role) return fail("Nhập tên và chọn chỗ trong phòng.", 400);
      if (room.state.started && (seat !== null || role !== "spectator")) {
        return fail("Trận đã bắt đầu. Chỗ của hai người chơi đã khóa.", 409);
      }
      const changes = place(room, key, name, role);
      if (!changes) return fail("Chỗ này đã có người. Hãy chọn chỗ khác.", 409);
      const data = await updateRoom(db, room, { ...changes, ...(isReferee && role !== "spectator" ? { referee_key: null } : {}) });
      if (!data) return retry();
      return response(data, key, token);
    }

    if (body.action === "leave") {
      if (!nameFor(room, key)) return response(room, key);
      if (key === room.host_key) return fail("Chủ phòng có thể đổi chỗ trước khi bắt đầu.", 409);
      if (isReferee && room.state.started && room.state.winner === null) return fail("Trọng tài cần ở lại cho đến khi trận kết thúc.", 409);
      if (room.state.started && seat !== null) return fail("Chỗ của người chơi đã khóa.", 409);
      const seats: Room["seats"] = [...room.seats];
      const players: DuelMatch["players"] = [...room.state.players];
      if (seat !== null) { seats[seat] = null; players[seat] = null; }
      const spectators = room.spectators.filter((viewer) => viewer.key !== key);
      const data = await updateRoom(db, room, { seats, spectators, state: { ...room.state, players }, ...(isReferee ? { referee_key: null } : {}) });
      return data ? response(data, key) : retry();
    }

    if (body.action === "start") {
      if (room.referee_key ? !isReferee : key !== room.host_key) return fail("Chỉ người phụ trách phòng mới bắt đầu được trận.", 403);
      if (room.state.started) return response(room, key);
      if (!room.seats[0] || !room.seats[1]) return fail("Cần đủ hai người chơi.", 409);
      const scramble = await scrambleFor(room.state.settings.puzzle);
      const state = { ...room.state, started: true, round: { ...room.state.round, scramble } };
      const data = await updateRoom(db, room, { state });
      return data ? response(data, key) : retry();
    }

    if (body.action === "ready") {
      if (seat === null || room.state.settings.mode !== "simultaneous") return fail("Chỉ người chơi ở chế độ đồng thời mới xác nhận xáo.", 403);
      if (!room.state.started || room.state.winner !== null || body.round !== room.state.round.number) return fail("Lượt này đã thay đổi.", 409);
      if (room.state.round.ready?.[seat]) return response(room, key);
      const data = await updateRoom(db, room, { state: markReady(room.state, seat) });
      return data ? response(data, key) : retry();
    }

    if (body.action === "approve") {
      if (room.referee_key ? !isReferee : seat === null) return fail("Bạn không có quyền xác nhận kết quả.", 403);
      if (room.state.history.some((item) => item.number === body.round)) return response(room, key);
      if (body.round !== room.state.round.number || !awaitingApproval(room.state)) return fail("Chưa đủ hai kết quả để xác nhận.", 409);
      if (seat !== null && room.state.round.approvals?.[seat]) return response(room, key);
      const state = approveResult(room.state, isReferee ? null : seat);
      if (state.round.number !== room.state.round.number) state.round.scramble = await scrambleFor(state.settings.puzzle);
      const data = await updateRoom(db, room, { state, ...(state.winner !== null ? { completed_at: new Date().toISOString() } : {}) });
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
