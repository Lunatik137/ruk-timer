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

export interface PuzzleMetadata {
  id: PuzzleType;
  label: string;
  shortLabel: string;
  cubeSize?: number; // For NxN 2D net simulation (2, 3, 4, 5)
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
  solved_at: string; // ISO string
}

export type ThemeId = "midnight" | "cyber" | "emerald" | "light";

export interface TimerSettings {
  inspectionEnabled: boolean;
  holdDelayMs: number; // e.g., 0, 300, 550 (WCA Stackmat standard)
  decimals: 2 | 3;
  hideUiWhileSolving: boolean;
  soundEnabled: boolean;
  manualInput: boolean;
  showCubePreview: boolean;
  theme: ThemeId;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  inspectionEnabled: false,
  holdDelayMs: 300,
  decimals: 2,
  hideUiWhileSolving: true,
  soundEnabled: true,
  manualInput: false,
  showCubePreview: true,
  theme: "midnight",
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
  currentAo100: number | "DNF" | null;
  bestAo100: number | null;
}

export interface SolveWithRollingStats extends Solve {
  indexNumber: number; // 1-based chronological #
  effectiveMs: number | "DNF";
  rollingAo5: number | "DNF" | null;
  rollingAo12: number | "DNF" | null;
}
