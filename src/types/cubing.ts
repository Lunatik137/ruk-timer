export type PuzzleType =
  | "2x2"
  | "3x3"
  | "4x4"
  | "5x5"
  | "6x6"
  | "7x7"
  | "3x3oh"
  | "3x3bld"
  | "pyraminx"
  | "megaminx"
  | "skewb"
  | "sq1"
  | "clock";

export type PenaltyType = "OK" | "+2" | "DNF";

export type SplitMode = "off" | "cfop4";

export type TimerUpdateMode = "live" | "seconds" | "hidden";

export type TrainingSubset =
  | "wca"
  | "cross_easy"
  | "cross_hard"
  | "f2l_only"
  | "ll_only";

export interface PuzzleMetadata {
  id: PuzzleType;
  label: string;
  shortLabel: string;
  cubeSize?: number; // For NxN 2D net simulation (2..7)
}

export const PUZZLES: PuzzleMetadata[] = [
  { id: "3x3", label: "3x3x3 Cube", shortLabel: "3x3", cubeSize: 3 },
  { id: "2x2", label: "2x2x2 Cube", shortLabel: "2x2", cubeSize: 2 },
  { id: "4x4", label: "4x4x4 Cube", shortLabel: "4x4", cubeSize: 4 },
  { id: "5x5", label: "5x5x5 Cube", shortLabel: "5x5", cubeSize: 5 },
  { id: "6x6", label: "6x6x6 Cube", shortLabel: "6x6", cubeSize: 6 },
  { id: "7x7", label: "7x7x7 Cube", shortLabel: "7x7", cubeSize: 7 },
  { id: "3x3oh", label: "3x3x3 One-Handed", shortLabel: "3x3 OH", cubeSize: 3 },
  { id: "3x3bld", label: "3x3x3 Blindfolded", shortLabel: "3x3 BLD", cubeSize: 3 },
  { id: "pyraminx", label: "Pyraminx", shortLabel: "Pyra" },
  { id: "megaminx", label: "Megaminx", shortLabel: "Mega" },
  { id: "skewb", label: "Skewb", shortLabel: "Skewb" },
  { id: "sq1", label: "Square-1", shortLabel: "Sq-1" },
  { id: "clock", label: "Rubik's Clock", shortLabel: "Clock" },
];

export interface CubeSession {
  id: string;
  user_id?: string;
  name: string;
  puzzle: PuzzleType;
  created_at: string;
  updated_at?: string;
}

export interface Solve {
  id: string;
  user_id?: string;
  session_id: string;
  puzzle: PuzzleType;
  time_ms: number; // Raw solve time in milliseconds (before +2)
  penalty: PenaltyType;
  scramble: string;
  comment: string;
  splits_ms?: number[]; // Cumulative or phase duration ms for [Cross, F2L, OLL, PLL]
  reconstruction?: string; // Move sequence for solve replay
  solved_at: string; // ISO string
}

export type ThemeId = "midnight" | "cyber" | "emerald" | "light";

export interface TimerSettings {
  inspectionEnabled: boolean;
  holdDelayMs: number; // e.g., 0, 300, 550 (WCA Stackmat standard)
  decimals: 2 | 3;
  hideUiWhileSolving: boolean;
  soundEnabled: boolean;
  voiceAlertsEnabled: boolean; // WCA Referee voice "8 seconds", "12 seconds"
  manualInput: boolean;
  showCubePreview: boolean;
  theme: ThemeId;
  splitMode: SplitMode;
  timerUpdateMode: TimerUpdateMode;
  targetGoalMs: number; // Default target average goal in ms (e.g., 15000 for Sub-15)
}

export const DEFAULT_SETTINGS: TimerSettings = {
  inspectionEnabled: false,
  holdDelayMs: 300,
  decimals: 2,
  hideUiWhileSolving: true,
  soundEnabled: true,
  voiceAlertsEnabled: false,
  manualInput: false,
  showCubePreview: true,
  theme: "midnight",
  splitMode: "off",
  timerUpdateMode: "live",
  targetGoalMs: 15000,
};

export interface StatSummary {
  totalCount: number;
  validCount: number;
  dnfCount: number;
  mean: number | null; // null if no valid solves
  stdDev: number | null;
  currentSingle: number | "DNF" | null;
  bestSingle: number | null;
  bestSingleSolveId: string | null;
  currentMo3: number | "DNF" | null;
  bestMo3: number | null;
  currentAo5: number | "DNF" | null;
  bestAo5: number | null;
  bestAo5Index: number | null; // index in chronological array (end of window)
  currentAo12: number | "DNF" | null;
  bestAo12: number | null;
  bestAo12Index: number | null;
  currentAo50: number | "DNF" | null;
  bestAo50: number | null;
  bestAo50Index: number | null;
  currentAo100: number | "DNF" | null;
  bestAo100: number | null;
  bestAo100Index: number | null;
}

export interface SolveWithRollingStats extends Solve {
  indexNumber: number; // 1-based chronological #
  effectiveMs: number | "DNF";
  rollingAo5: number | "DNF" | null;
  rollingAo12: number | "DNF" | null;
}

export type CfopMasteryStatus =
  | "unlearned"
  | "learning"
  | "learned"
  | "mastered";

export interface CfopProgressItem {
  alg_id: string;
  status: CfopMasteryStatus;
  preferred_formula?: string;
  ease_factor: number; // SM-2 default 2.5
  interval_days: number;
  repetitions: number;
  next_review_at: string; // ISO timestamp
  last_drilled_at?: string;
  updated_at: string;
}

export interface HistogramBucket {
  label: string;
  minMs: number;
  maxMs: number;
  count: number;
  percentage: number;
}

export interface SplitStageBreakdown {
  sampleCount: number;
  stages: {
    key: "CROSS" | "F2L" | "OLL" | "PLL";
    label: string;
    avgMs: number;
    actualPct: number;
    idealPct: number;
    deltaPct: number; // positive means slower than ideal ratio
  }[];
}

export interface PersonalAchievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progressText: string;
  progress?: { current: number; target: number };
  category: "volume" | "speed" | "cfop" | "consistency";
}

export type ScrambleSource = "random-state" | "random-move";

export interface UserFileRecord {
  id: string;
  user_id?: string;
  object_key?: string;
  kind: "video" | "backup" | "other";
  filename: string;
  content_type: string;
  size_bytes: number;
  status: "pending" | "ready";
  solve_id?: string | null;
  created_at: string;
}
