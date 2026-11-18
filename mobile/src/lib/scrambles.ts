import type { PuzzleType } from "../types/cubing";

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
  const ops: string[] = [];
  for (let i = 0; i < 12; i++) {
    let top = 0;
    let bottom = 0;
    while (top === 0 && bottom === 0) {
      top = Math.floor(Math.random() * 12) - 5;
      bottom = Math.floor(Math.random() * 12) - 5;
    }
    ops.push(`(${top},${bottom})`);
    ops.push("/");
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

interface Sticker3D {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  color: FaceColor;
}

export function simulateCubeScramble(size: number, scramble: string): CubeNetState {
  const coords: number[] = [];
  for (let i = 0; i < size; i++) {
    coords.push(2 * i - (size - 1));
  }
  const bound = size - 1;
  const stickers: Sticker3D[] = [];

  for (const a of coords) {
    for (const b of coords) {
      stickers.push({ x: a, y: bound, z: b, nx: 0, ny: 1, nz: 0, color: "W" });
      stickers.push({ x: a, y: -bound, z: b, nx: 0, ny: -1, nz: 0, color: "Y" });
      stickers.push({ x: a, y: b, z: bound, nx: 0, ny: 0, nz: 1, color: "G" });
      stickers.push({ x: a, y: b, z: -bound, nx: 0, ny: 0, nz: -1, color: "B" });
      stickers.push({ x: bound, y: a, z: b, nx: 1, ny: 0, nz: 0, color: "R" });
      stickers.push({ x: -bound, y: a, z: b, nx: -1, ny: 0, nz: 0, color: "O" });
    }
  }

  const rotateStickerCW = (s: Sticker3D, face: string) => {
    const { x, y, z, nx, ny, nz } = s;
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

  const tokens = scramble.trim().split(/\s+/).filter(Boolean);
  const moveRegex = /^(\d+)?([UDLRFBudlrfbxyz])(w)?(['2])?$/;

  for (const token of tokens) {
    const match = token.match(moveRegex);
    if (!match) continue;
    const [, prefixNum, rawFace, wideFlag, suffix] = match;
    const quarterTurns = suffix === "2" ? 2 : suffix === "'" ? 3 : 1;

    if (rawFace === "x" || rawFace === "y" || rawFace === "z") {
      const rotFace = rawFace === "x" ? "R" : rawFace === "y" ? "U" : "F";
      for (let t = 0; t < quarterTurns; t++) {
        for (const s of stickers) rotateStickerCW(s, rotFace);
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
        if (inLayer(s)) rotateStickerCW(s, face);
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

  const toAscIdx = (c: number) => Math.round((c + (size - 1)) / 2);
  const toDescIdx = (c: number) => size - 1 - toAscIdx(c);

  for (const s of stickers) {
    if (s.ny === 1) net.U[toAscIdx(s.z)][toAscIdx(s.x)] = s.color;
    else if (s.ny === -1) net.D[toDescIdx(s.z)][toAscIdx(s.x)] = s.color;
    else if (s.nz === 1) net.F[toDescIdx(s.y)][toAscIdx(s.x)] = s.color;
    else if (s.nz === -1) net.B[toDescIdx(s.y)][toDescIdx(s.x)] = s.color;
    else if (s.nx === -1) net.L[toDescIdx(s.y)][toAscIdx(s.z)] = s.color;
    else if (s.nx === 1) net.R[toDescIdx(s.y)][toDescIdx(s.z)] = s.color;
  }

  return net;
}
