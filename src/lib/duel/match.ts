import type { PenaltyType, PuzzleType } from "@/types/cubing";

export const DUEL_EVENTS = {
  "2x2": "222", "3x3": "333", "4x4": "444", "5x5": "555", "6x6": "666", "7x7": "777",
  "3x3oh": "333oh", pyraminx: "pyram", megaminx: "minx", skewb: "skewb", sq1: "sq1", clock: "clock",
} as const satisfies Partial<Record<PuzzleType, string>>;

export type DuelPuzzle = keyof typeof DUEL_EVENTS;
export type Seat = 0 | 1;
export type Role = "player1" | "player2" | "spectator";
export type Pair<T> = [T, T];
export type DuelSettings = { puzzle: DuelPuzzle; setsToWin: number; pointsToWin: number };
export type Result = { ms: number; penalty: PenaltyType };
export type DuelRound = {
  number: number;
  set: number;
  first: Seat;
  scramble: string;
  results: Pair<Result | null>;
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
  | { kind: "invite"; settings: DuelSettings; host: string; slots: Pair<boolean>; spectators: string[]; started: boolean }
  | { kind: "member"; seat: Seat | null; name: string; host: boolean; spectators: string[]; match: DuelMatch; turn: Seat | null };

export function isDuelPuzzle(value: unknown): value is DuelPuzzle {
  return typeof value === "string" && Object.hasOwn(DUEL_EVENTS, value);
}

export function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

export function currentTurn(match: DuelMatch): Seat | null {
  if (!match.started || match.winner !== null) return null;
  return match.round.results[match.round.first] ? otherSeat(match.round.first) : match.round.first;
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
  if (currentTurn(match) !== seat) throw new Error("Chưa đến lượt bạn.");
  const results: Pair<Result | null> = [...match.round.results];
  results[seat] = result;
  if (!results[0] || !results[1]) return { ...match, round: { ...match.round, results } };

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

export function viewFor(match: DuelMatch, seat: Seat | null, name: string, host: boolean, spectators: string[]): Extract<DuelView, { kind: "member" }> {
  const turn = currentTurn(match);
  return {
    kind: "member", seat, name, host, spectators, turn,
    match: {
      ...match,
      round: {
        ...match.round,
        scramble: (seat !== null && turn === seat) || match.winner !== null ? match.round.scramble : "",
        results: match.winner !== null ? match.round.results :
          [seat === 0 ? match.round.results[0] : null, seat === 1 ? match.round.results[1] : null],
      },
    },
  };
}
