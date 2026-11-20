import type { PenaltyType, PuzzleType } from "@/types/cubing";

export const DUEL_EVENTS = {
  "2x2": "222", "3x3": "333", "4x4": "444", "5x5": "555", "6x6": "666", "7x7": "777",
  "3x3oh": "333oh", pyraminx: "pyram", megaminx: "minx", skewb: "skewb", sq1: "sq1", clock: "clock",
} as const satisfies Partial<Record<PuzzleType, string>>;

export type DuelPuzzle = keyof typeof DUEL_EVENTS;
export type Seat = 0 | 1;
export type AccessRole = "spectator" | "referee";
export type Role = "player1" | "player2" | AccessRole;
export type AccessRequest = { id: string; name: string; role: AccessRole };
export type Pair<T> = [T, T];
export type DuelMode = "alternating" | "simultaneous";
export type DuelSettings = {
  puzzle: DuelPuzzle;
  setsToWin: number;
  pointsToWin: number;
  mode?: DuelMode;
  inspection?: boolean;
};
export type Result = { ms: number; penalty: PenaltyType };
export type DuelRound = {
  number: number;
  set: number;
  first: Seat;
  scramble: string;
  results: Pair<Result | null>;
  ready?: Pair<boolean>;
  approvals?: Pair<boolean>;
  winner: Seat | null;
};
export type DuelMatch = {
  settings: DuelSettings;
  players: Pair<string | null>;
  started: boolean;
  sets: Pair<number>;
  points: Pair<number>;
  round: DuelRound;
  history: DuelRound[];
  winner: Seat | null;
};

export type DuelView =
  | { kind: "invite"; settings: DuelSettings; host: string; slots: Pair<boolean>; spectators: string[];
    started: boolean; referee: string | null; accessAvailable: boolean;
    access: { role: AccessRole; status: "pending" | "denied" } | null }
  | {
      kind: "member"; seat: Seat | null; name: string; host: boolean; spectators: string[];
      match: DuelMatch; turn: Seat | null; referee: string | null; canStart: boolean; canReferee: boolean;
      canTime: boolean; reviewing: boolean;
      canModerate: boolean; accessRequests: AccessRequest[]; isReferee: boolean; reviewOfficial: string | null;
      accessAvailable: boolean;
    };

export type DuelHistoryItem = {
  id: string;
  completedAt: string;
  settings: DuelSettings;
  players: DuelMatch["players"];
  sets: Pair<number>;
  winner: Seat;
};

export type DuelActiveRoom = Pick<DuelHistoryItem, "id" | "players"> & {
  puzzle: DuelPuzzle;
  started: boolean;
};

export type DuelPublicRoom = {
  id: string;
  host: string;
  settings: DuelSettings;
  players: DuelMatch["players"];
};

export function isDuelPuzzle(value: unknown): value is DuelPuzzle {
  return typeof value === "string" && Object.hasOwn(DUEL_EVENTS, value);
}

export function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

export function currentTurn(match: DuelMatch): Seat | null {
  if (!match.started || match.winner !== null || match.settings.mode === "simultaneous" || awaitingApproval(match)) return null;
  return match.round.results[match.round.first] ? otherSeat(match.round.first) : match.round.first;
}

export function awaitingApproval(match: DuelMatch): boolean {
  return match.winner === null && match.round.results.every(Boolean);
}

export function canSolve(match: DuelMatch, seat: Seat): boolean {
  if (!match.started || match.winner !== null || match.round.results[seat]) return false;
  return match.settings.mode === "simultaneous"
    ? Boolean(match.round.ready?.every(Boolean))
    : currentTurn(match) === seat && match.round.ready?.[seat] === true;
}

export function canMarkReady(match: DuelMatch, seat: Seat): boolean {
  if (!match.started || match.winner !== null || match.round.results[seat] || match.round.ready?.[seat]) return false;
  return match.settings.mode === "simultaneous" || currentTurn(match) === seat;
}

export function markReady(match: DuelMatch, seat: Seat): DuelMatch {
  const ready: Pair<boolean> = [...(match.round.ready ?? [false, false])];
  ready[seat] = true;
  return { ...match, round: { ...match.round, ready } };
}

export function createMatch(settings: DuelSettings): DuelMatch {
  return {
    settings, started: false, players: [null, null], sets: [0, 0], points: [0, 0], winner: null,
    round: { number: 1, set: 1, first: 0, scramble: "", results: [null, null], winner: null },
    history: [],
  };
}

export function officialCentiseconds(result: Result): number {
  return result.penalty === "DNF" ? Infinity : Math.floor(result.ms / 10) + (result.penalty === "+2" ? 200 : 0);
}

export function resultFor(match: DuelMatch, round: number, seat: Seat) {
  const attempt = match.round.number === round ? match.round : match.history.find((item) => item.number === round);
  return attempt?.results[seat] ?? null;
}

export function recordResult(match: DuelMatch, seat: Seat, result: Result): DuelMatch {
  if (!canSolve(match, seat)) throw new Error("Chưa đến lượt bạn.");
  const results: Pair<Result | null> = [...match.round.results];
  results[seat] = result;
  return { ...match, round: { ...match.round, results } };
}

export function approveResult(match: DuelMatch, seat: Seat | null): DuelMatch {
  const results = match.round.results;
  if (match.winner !== null || !results[0] || !results[1]) throw new Error("Chưa có đủ hai kết quả.");
  if (seat !== null) {
    const approvals: Pair<boolean> = [...(match.round.approvals ?? [false, false])];
    approvals[seat] = true;
    if (!approvals.every(Boolean)) return { ...match, round: { ...match.round, approvals } };
  }

  const a = officialCentiseconds(results[0]);
  const b = officialCentiseconds(results[1]);
  const winner: Seat | null = a === b ? null : a < b ? 0 : 1;
  const points: Pair<number> = [...match.points];
  const sets: Pair<number> = [...match.sets];
  if (winner !== null) points[winner]++;
  const setWon = winner !== null && points[winner] === match.settings.pointsToWin;
  if (setWon) sets[winner]++;
  const matchWon = setWon && sets[winner] === match.settings.setsToWin;
  const completed = { ...match.round, results, winner };

  return {
    ...match, points: setWon && !matchWon ? [0, 0] : points, sets,
    winner: matchWon ? winner : null,
    history: [...match.history, completed],
    round: matchWon ? completed : {
      number: completed.number + 1, set: completed.set + Number(setWon),
      first: otherSeat(completed.first), scramble: "",
      results: [null, null], winner: null,
    },
  };
}

export function viewFor(
  match: DuelMatch, seat: Seat | null, name: string, host: boolean, spectators: string[],
  referee: string | null = null, canReferee = false, accessRequests: AccessRequest[] = [],
): Extract<DuelView, { kind: "member" }> {
  const turn = currentTurn(match);
  const exposeScramble = seat !== null && match.started && (match.settings.mode === "simultaneous" || turn === seat);
  const exposeResults = match.winner !== null || (awaitingApproval(match) && (seat !== null || canReferee));
  return {
    kind: "member", seat, name, host, spectators, turn, referee, canReferee, accessRequests,
    isReferee: canReferee, reviewOfficial: referee, accessAvailable: true,
    canStart: !match.started && (host || canReferee),
    canModerate: match.winner === null && (host || canReferee),
    canTime: seat !== null && canSolve(match, seat),
    reviewing: awaitingApproval(match),
    match: {
      ...match,
      round: {
        ...match.round,
        scramble: exposeScramble || match.winner !== null ? match.round.scramble : "",
        results: exposeResults ? match.round.results :
          [seat === 0 ? match.round.results[0] : null, seat === 1 ? match.round.results[1] : null],
      },
    },
  };
}
