// Shared structural types for core modules (web + Expo). No framework imports.

export type Penalty = "OK" | "+2" | "DNF";

export interface SolveLike {
  id: string;
  session_id: string;
  puzzle: string;
  time_ms: number;
  penalty: Penalty;
  scramble: string;
  comment: string;
  splits_ms?: number[] | null;
  reconstruction?: string | null;
  solved_at: string;
  user_id?: string;
}

export interface SessionLike {
  id: string;
  name: string;
  puzzle: string;
  created_at: string;
  updated_at?: string;
  user_id?: string;
}

export type CfopMasteryStatus = "unlearned" | "learning" | "learned" | "mastered";

export interface CfopProgressItem {
  alg_id: string;
  status: CfopMasteryStatus;
  preferred_formula?: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string;
  last_drilled_at?: string;
  updated_at: string;
}
