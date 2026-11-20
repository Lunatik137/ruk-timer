import type { AccessRequest, DuelMatch, Pair, Role, Seat } from "./match";

export const MAX_SPECTATORS = 2;

type Guest = { key: string; name: string };
export type StoredAccess = AccessRequest & { key: string; status: "pending" | "denied" };
export type Room = {
  id: string;
  host_key: string;
  host_name: string;
  seats: Pair<string | null>;
  spectators: Guest[];
  referee_key?: string | null;
  referee_name?: string | null;
  access_requests?: StoredAccess[];
  completed_at?: string | null;
  revision: number;
  state: DuelMatch;
};

export function seatFor(room: Room, key: string | null): Seat | null {
  if (key && key === room.seats[0]) return 0;
  if (key && key === room.seats[1]) return 1;
  return null;
}

export function nameFor(room: Room, key: string | null) {
  if (!key) return null;
  if (key === room.referee_key && room.referee_name) return room.referee_name;
  const seat = seatFor(room, key);
  return seat === null ? room.spectators.find((viewer) => viewer.key === key)?.name : room.state.players[seat];
}

export function canModerate(room: Room, key: string | null) {
  return Boolean(key && (key === room.host_key || key === room.referee_key));
}

export function resultOfficial(room: Room) {
  return room.referee_key ? { key: room.referee_key, name: nameFor(room, room.referee_key) ?? "Trọng tài" }
    : seatFor(room, room.host_key) === null ? { key: room.host_key, name: room.host_name } : null;
}

export function place(room: Room, key: string, name: string, role: Role) {
  const seats: Room["seats"] = [...room.seats];
  const players: DuelMatch["players"] = [...room.state.players];
  const spectators = room.spectators.filter((viewer) => viewer.key !== key);
  const previous = seatFor(room, key);
  let referee_key = room.referee_key === key ? null : room.referee_key ?? null;
  let referee_name = referee_key ? room.referee_name ?? null : null;
  if (previous !== null) { seats[previous] = null; players[previous] = null; }
  if (role === "spectator") {
    if (spectators.length >= MAX_SPECTATORS) return null;
    spectators.push({ key, name });
  } else if (role === "referee") {
    if (referee_key) return null;
    referee_key = key;
    referee_name = name;
  } else {
    const seat = role === "player1" ? 0 : 1;
    if (seats[seat]) return null;
    seats[seat] = key;
    players[seat] = name;
  }
  return { seats, spectators, referee_key, referee_name, state: { ...room.state, players } };
}
