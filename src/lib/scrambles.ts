import type { PuzzleType } from "@/types/cubing";

export type FaceColor = "W" | "Y" | "G" | "B" | "O" | "R";

export interface CubeNetState {
  size: number;
  U: FaceColor[][];
  D: FaceColor[][];
  F: FaceColor[][];
  B: FaceColor[][];
  L: FaceColor[][];
  R: FaceColor[][];
}

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates WCA-style non-cancelling scrambles for NxN cubes (2x2 through 7x7).
 */
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

  // Build valid move bases depending on cube size
  const moveBases: { base: string; face: string }[] = [];
  for (const face of faces) {
    moveBases.push({ base: face, face });
    if (size >= 4) {
      // On 4x4, WCA uses Uw, Rw, Fw (only 3 faces needed to avoid whole-cube rotation redundancy, or all 6 on 5x5+)
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
    const valid = faces.filter((f) => f !== lastFace);
    const face = randomItem(valid);
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
  const ops: string[] = [];
  for (let i = 0; i < 12; i++) {
    let top = 0;
    let bottom = 0;
    while (top === 0 && bottom === 0) {
      top = Math.floor(Math.random() * 12) - 5; // -5..6
      bottom = Math.floor(Math.random() * 12) - 5;
    }
    ops.push(`(${top},${bottom})`);
    ops.push("/");
  }
  if (Math.random() < 0.5) {
    const top = Math.floor(Math.random() * 12) - 5;
    const bottom = Math.floor(Math.random() * 12) - 5;
    if (top !== 0 || bottom !== 0) ops.push(`(${top},${bottom})`);
  }
  return ops.join(" ");
}

function generateClockScramble(): string {
  const dials1 = ["UR", "DR", "DL", "UL", "U", "R", "D", "L", "ALL"];
  const dials2 = ["U", "R", "D", "L", "ALL"];
  const pins = ["UR", "DR", "DL", "UL"];
  const fmtDial = (d: string) => {
    const val = Math.floor(Math.random() * 12) - 5; // -5..6
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

/**
 * Cleans grouping parentheses/brackets from human-readable CFOP formulas
 * and returns individual move tokens.
 */
export function tokenizeAlgorithm(alg: string): string[] {
  return alg
    .replace(/[()[\]]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Inverts a Rubik's cube move sequence (e.g. "R U R' F2" -> "F2 R U' R'").
 */
export function invertAlgorithm(alg: string): string {
  const tokens = tokenizeAlgorithm(alg);
  return tokens
    .slice()
    .reverse()
    .map((tok) => {
      if (tok.endsWith("2'") || tok.endsWith("'2")) {
        return tok.slice(0, -2) + "2";
      }
      if (tok.endsWith("2")) return tok;
      if (tok.endsWith("'")) return tok.slice(0, -1);
      return `${tok}'`;
    })
    .join(" ");
}

/**
 * Counts STM (Slice Turn Metric) moves in an algorithm (excludes x/y/z cube rotations).
 */
export function countAlgMoves(alg: string): number {
  const tokens = tokenizeAlgorithm(alg);
  let count = 0;
  for (const tok of tokens) {
    if (/^[xyzXYZ]['2]*$/.test(tok)) continue;
    count++;
  }
  return count;
}

interface Sticker3D {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  color: FaceColor;
}

/**
 * Simulates an NxN Rubik's Cube (2 <= size <= 7) starting from standard WCA orientation
 * (White Top = U, Green Front = F) and returns the 6 unfolded face color grids.
 */
export function simulateCubeScramble(size: number, scramble: string): CubeNetState {
  const coords: number[] = [];
  for (let i = 0; i < size; i++) {
    coords.push(2 * i - (size - 1));
  }
  const bound = size - 1; // outer face coordinate magnitude + 1 is not needed; stickers sit on plane = +-bound

  const stickers: Sticker3D[] = [];

  // Initialize all 6 faces
  for (const a of coords) {
    for (const b of coords) {
      // U (+y): White
      stickers.push({ x: a, y: bound, z: b, nx: 0, ny: 1, nz: 0, color: "W" });
      // D (-y): Yellow
      stickers.push({ x: a, y: -bound, z: b, nx: 0, ny: -1, nz: 0, color: "Y" });
      // F (+z): Green
      stickers.push({ x: a, y: b, z: bound, nx: 0, ny: 0, nz: 1, color: "G" });
      // B (-z): Blue
      stickers.push({ x: a, y: b, z: -bound, nx: 0, ny: 0, nz: -1, color: "B" });
      // R (+x): Red
      stickers.push({ x: bound, y: a, z: b, nx: 1, ny: 0, nz: 0, color: "R" });
      // L (-x): Orange
      stickers.push({ x: -bound, y: a, z: b, nx: -1, ny: 0, nz: 0, color: "O" });
    }
  }

  const rotateStickerCW = (s: Sticker3D, face: string) => {
    let x = s.x,
      y = s.y,
      z = s.z;
    let nx = s.nx,
      ny = s.ny,
      nz = s.nz;

    switch (face) {
      case "U":
        s.x = -z;
        s.z = x;
        s.nx = -nz;
        s.nz = nx;
        break;
      case "D":
        s.x = z;
        s.z = -x;
        s.nx = nz;
        s.nz = -nx;
        break;
      case "R":
        s.y = z;
        s.z = -y;
        s.ny = nz;
        s.nz = -ny;
        break;
      case "L":
        s.y = -z;
        s.z = y;
        s.ny = -nz;
        s.nz = ny;
        break;
      case "F":
        s.x = y;
        s.y = -x;
        s.nx = ny;
        s.ny = -nx;
        break;
      case "B":
        s.x = -y;
        s.y = x;
        s.nx = -ny;
        s.ny = nx;
        break;
    }
  };

  const tokens = tokenizeAlgorithm(scramble);

  // Match moves like: R, U', F2, Rw, Uw', 3Rw2, u, r', M, M', M2, E, S, x, y2, z'
  const moveRegex = /^(\d+)?([UDLRFBudlrfbMESxyz])(w)?(['2]+)?$/;

  for (const token of tokens) {
    const match = token.match(moveRegex);
    if (!match) continue;

    const [, prefixNum, rawFace, wideFlag, suffix] = match;
    const quarterTurns =
      suffix === "2" || suffix === "2'" || suffix === "'2"
        ? 2
        : suffix === "'"
        ? 3
        : 1;

    // Whole cube rotations
    if (rawFace === "x" || rawFace === "y" || rawFace === "z") {
      const rotFace = rawFace === "x" ? "R" : rawFace === "y" ? "U" : "F";
      for (let t = 0; t < quarterTurns; t++) {
        for (const s of stickers) rotateStickerCW(s, rotFace);
      }
      continue;
    }

    // Middle slice moves (M follows L, E follows D, S follows F)
    if (rawFace === "M" || rawFace === "E" || rawFace === "S") {
      const rotFace = rawFace === "M" ? "L" : rawFace === "E" ? "D" : "F";
      for (let t = 0; t < quarterTurns; t++) {
        for (const s of stickers) {
          if (
            (rawFace === "M" && s.x === 0) ||
            (rawFace === "E" && s.y === 0) ||
            (rawFace === "S" && s.z === 0)
          ) {
            rotateStickerCW(s, rotFace);
          }
        }
      }
      continue;
    }

    const isLowercase = rawFace === rawFace.toLowerCase();
    const face = rawFace.toUpperCase();

    let depth = 1;
    if (wideFlag || isLowercase) {
      depth = prefixNum ? Math.min(size, parseInt(prefixNum, 10)) : 2;
    } else if (prefixNum) {
      depth = Math.min(size, parseInt(prefixNum, 10));
    }

    // Threshold coordinate for depth layers from the outer face:
    // Outer layer index is size - 1 => coord = 2*(size - 1) - (size - 1) = bound.
    // Layer d (1-based) includes indices size - d .. size - 1 => minCoord = 2*(size - d) - (size - 1)
    const threshold = 2 * (size - depth) - (size - 1);

    const inLayer = (s: Sticker3D): boolean => {
      switch (face) {
        case "U":
          return s.y >= threshold;
        case "D":
          return s.y <= -threshold;
        case "R":
          return s.x >= threshold;
        case "L":
          return s.x <= -threshold;
        case "F":
          return s.z >= threshold;
        case "B":
          return s.z <= -threshold;
        default:
          return false;
      }
    };

    for (let t = 0; t < quarterTurns; t++) {
      for (const s of stickers) {
        if (inLayer(s)) {
          rotateStickerCW(s, face);
        }
      }
    }
  }

  const makeGrid = (): FaceColor[][] =>
    Array.from({ length: size }, () => Array<FaceColor>(size).fill("W"));

  const net: CubeNetState = {
    size,
    U: makeGrid(),
    D: makeGrid(),
    F: makeGrid(),
    B: makeGrid(),
    L: makeGrid(),
    R: makeGrid(),
  };

  // Convert coordinate value back to 0..size-1 index
  const toAscIdx = (c: number) => Math.round((c + (size - 1)) / 2);
  const toDescIdx = (c: number) => size - 1 - toAscIdx(c);

  for (const s of stickers) {
    if (s.ny === 1) {
      net.U[toAscIdx(s.z)][toAscIdx(s.x)] = s.color;
    } else if (s.ny === -1) {
      net.D[toDescIdx(s.z)][toAscIdx(s.x)] = s.color;
    } else if (s.nz === 1) {
      net.F[toDescIdx(s.y)][toAscIdx(s.x)] = s.color;
    } else if (s.nz === -1) {
      net.B[toDescIdx(s.y)][toDescIdx(s.x)] = s.color;
    } else if (s.nx === -1) {
      net.L[toDescIdx(s.y)][toAscIdx(s.z)] = s.color;
    } else if (s.nx === 1) {
      net.R[toDescIdx(s.y)][toDescIdx(s.z)] = s.color;
    }
  }

  return net;
}
