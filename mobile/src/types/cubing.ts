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
  cubeSize?: number;
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
  time_ms: number;
  penalty: PenaltyType;
  scramble: string;
  comment: string;
  solved_at: string;
}

export interface MobileSettings {
  inspectionEnabled: boolean;
  holdDelayMs: number;
  decimals: 2 | 3;
  hapticsEnabled: boolean;
}

export const DEFAULT_MOBILE_SETTINGS: MobileSettings = {
  inspectionEnabled: false,
  holdDelayMs: 300,
  decimals: 2,
  hapticsEnabled: true,
};

export interface StatSummary {
  totalCount: number;
  validCount: number;
  dnfCount: number;
  mean: number | null;
  stdDev: number | null;
  currentSingle: number | "DNF" | null;
  bestSingle: number | null;
  bestSingleSolveId: string | null;
  currentMo3: number | "DNF" | null;
  bestMo3: number | null;
  currentAo5: number | "DNF" | null;
  bestAo5: number | null;
  currentAo12: number | "DNF" | null;
  bestAo12: number | null;
  currentAo50: number | "DNF" | null;
  bestAo50: number | null;
  currentAo100: number | "DNF" | null;
  bestAo100: number | null;
}

export interface SolveWithRollingStats extends Solve {
  indexNumber: number;
  effectiveMs: number | "DNF";
  rollingAo5: number | "DNF" | null;
  rollingAo12: number | "DNF" | null;
}
