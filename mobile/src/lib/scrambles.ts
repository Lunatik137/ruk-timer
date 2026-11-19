import type { PuzzleType } from "../types/cubing";
import {
  invertAlgorithm,
  simulateCubeScramble,
  type CubeNetState,
  type FaceColor,
} from "./core/cubeSim";

export { invertAlgorithm, simulateCubeScramble };
export type { CubeNetState, FaceColor };

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateNxNScramble(size: number, length: number): string {
  const faces = size === 2 ? ["U", "R", "F"] : ["U", "D", "L", "R", "F", "B"];
  const suffixes = ["", "'", "2"];
  const axisOf: Record<string, number> = {
    U: 0,
    D: 0,
    L: 1,
    R: 1,
    F: 2,
    B: 2,
  };

  const moveBases: { base: string; face: string }[] = [];
  for (const face of faces) {
    moveBases.push({ base: face, face });
    if (size >= 4) {
      if (size === 4) {
        if (face === "U" || face === "R" || face === "F") {
          moveBases.push({ base: `${face}w`, face });
        }
      } else {
        moveBases.push({ base: `${face}w`, face });
      }
    }
    if (size >= 6) {
      if (size === 6) {
        if (face === "U" || face === "R" || face === "F") {
          moveBases.push({ base: `3${face}w`, face });
        }
      } else {
        moveBases.push({ base: `3${face}w`, face });
      }
    }
  }

  const moves: string[] = [];
  let lastAxis = -1;
  let usedBasesOnAxis = new Set<string>();

  while (moves.length < length) {
    const candidate = randomItem(moveBases);
    const axis = axisOf[candidate.face];
    if (axis === lastAxis) {
      if (usedBasesOnAxis.has(candidate.base)) continue;
      usedBasesOnAxis.add(candidate.base);
    } else {
      lastAxis = axis;
      usedBasesOnAxis = new Set([candidate.base]);
    }
    moves.push(`${candidate.base}${randomItem(suffixes)}`);
  }

  return moves.join(" ");
}

function generatePyraminxScramble(): string {
  const faces = ["U", "L", "R", "B"];
  const tips = ["u", "l", "r", "b"];
  const suffixes = ["", "'"];
  const moves: string[] = [];
  let lastFace = "";
  for (let i = 0; i < 11; i++) {
    const face = randomItem(faces.filter((f) => f !== lastFace));
    lastFace = face;
    moves.push(`${face}${randomItem(suffixes)}`);
  }
  for (const tip of tips) {
    const roll = Math.floor(Math.random() * 3);
    if (roll === 1) moves.push(tip);
    else if (roll === 2) moves.push(`${tip}'`);
  }
  return moves.join(" ");
}

function generateSkewbScramble(): string {
  const faces = ["U", "L", "R", "B"];
  const suffixes = ["", "'"];
  const moves: string[] = [];
  let lastFace = "";
  for (let i = 0; i < 11; i++) {
    const face = randomItem(faces.filter((f) => f !== lastFace));
    lastFace = face;
    moves.push(`${face}${randomItem(suffixes)}`);
  }
  return moves.join(" ");
}

function generateMegaminxScramble(): string {
  const lines: string[] = [];
  for (let row = 0; row < 7; row++) {
    const rowMoves: string[] = [];
    for (let i = 0; i < 10; i++) {
      const face = i % 2 === 0 ? "R" : "D";
      const dir = Math.random() < 0.5 ? "++" : "--";
      rowMoves.push(`${face}${dir}`);
    }
    rowMoves.push(Math.random() < 0.5 ? "U" : "U'");
    lines.push(rowMoves.join(" "));
  }
  return lines.join(" / ");
}

function generateSquare1Scramble(): string {
  // Shape-valid Square-1 scramble generator (ensures / never cuts across a 60° corner)
  let top = [1, 2, 1, 2, 1, 2, 1, 2];
  let bottom = [2, 1, 2, 1, 2, 1, 2, 1];

  const canSlice = (layer: number[]) => {
    let sum = 0;
    for (const w of layer) {
      sum += w;
      if (sum === 6) return true;
      if (sum > 6) return false;
    }
    return false;
  };

  const rotateLayer = (layer: number[], steps: number): number[] | null => {
    const n = ((steps % 12) + 12) % 12;
    if (n === 0) return [...layer];
    const target = (12 - n) % 12;
    let total = 0;
    let idx = -1;
    for (let i = 0; i < layer.length; i++) {
      if (total === target) {
        idx = i;
        break;
      }
      total += layer[i];
    }
    if (idx === -1) return null;
    const next = [...layer.slice(idx), ...layer.slice(0, idx)];
    return canSlice(next) ? next : null;
  };

  const slash = (tLayer: number[], bLayer: number[]) => {
    const split = (arr: number[]) => {
      let s = 0;
      const r: number[] = [];
      const l: number[] = [];
      for (const w of arr) {
        if (s < 6) {
          r.push(w);
          s += w;
        } else {
          l.push(w);
        }
      }
      return { r, l };
    };
    const ts = split(tLayer);
    const bs = split(bLayer);
    return {
      top: [...bs.r.reverse(), ...ts.l],
      bottom: [...ts.r.reverse(), ...bs.l],
    };
  };

  const ops: string[] = [];
  const candidates = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

  for (let i = 0; i < 12; i++) {
    const valid: { t: number; b: number; nt: number[]; nb: number[] }[] = [];
    for (const t of candidates) {
      const nt = rotateLayer(top, t);
      if (!nt) continue;
      for (const b of candidates) {
        if (t === 0 && b === 0) continue;
        const nb = rotateLayer(bottom, b);
        if (!nb) continue;
        valid.push({ t, b, nt, nb });
      }
    }
    if (valid.length === 0) break;
    const pick = randomItem(valid);
    ops.push(`(${pick.t},${pick.b})`);
    ops.push("/");
    const after = slash(pick.nt, pick.nb);
    top = after.top;
    bottom = after.bottom;
  }
  return ops.join(" ");
}

function generateClockScramble(): string {
  const dials1 = ["UR", "DR", "DL", "UL", "U", "R", "D", "L", "ALL"];
  const dials2 = ["U", "R", "D", "L", "ALL"];
  const pins = ["UR", "DR", "DL", "UL"];
  const fmtDial = (d: string) => {
    const val = Math.floor(Math.random() * 12) - 5;
    return val >= 0 ? `${d}${val}+` : `${d}${Math.abs(val)}-`;
  };
  const part1 = dials1.map(fmtDial).join(" ");
  const part2 = dials2.map(fmtDial).join(" ");
  const activePins = pins.filter(() => Math.random() < 0.5).join(" ");
  return `${part1} y2 ${part2}${activePins ? " " + activePins : ""}`;
}

export function generateScramble(puzzle: PuzzleType): string {
  switch (puzzle) {
    case "2x2":
      return generateNxNScramble(2, 9);
    case "3x3":
    case "3x3oh":
      return generateNxNScramble(3, 20);
    case "3x3bld": {
      const base = generateNxNScramble(3, 20);
      const wideSuffix = randomItem(["", " Rw", " Rw'", " Rw2", " Fw", " Fw'"]);
      const secondWide = randomItem(["", " Uw", " Uw'", " Uw2"]);
      return `${base}${wideSuffix}${secondWide}`;
    }
    case "4x4":
      return generateNxNScramble(4, 42);
    case "5x5":
      return generateNxNScramble(5, 60);
    case "6x6":
      return generateNxNScramble(6, 80);
    case "7x7":
      return generateNxNScramble(7, 100);
    case "pyraminx":
      return generatePyraminxScramble();
    case "megaminx":
      return generateMegaminxScramble();
    case "skewb":
      return generateSkewbScramble();
    case "sq1":
      return generateSquare1Scramble();
    case "clock":
      return generateClockScramble();
    default:
      return generateNxNScramble(3, 20);
  }
}
