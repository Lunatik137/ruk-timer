// Pure, dependency-free cube simulation shared by web and Expo.
// SOURCE OF TRUTH: src/lib/core (copied to mobile/src/lib/core by scripts/sync-core.mjs)

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

/**
 * Cleans grouping parentheses/brackets from human-readable CFOP formulas
 * and returns individual move tokens.
 */
export function tokenizeAlgorithm(alg: string): string[] {
  return alg
    .replace(/[’‘`´]/g, "'")
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
    const x = s.x,
      y = s.y,
      z = s.z;
    const nx = s.nx,
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

    if (rawFace === "x" || rawFace === "y" || rawFace === "z") {
      const rotFace = rawFace === "x" ? "R" : rawFace === "y" ? "U" : "F";
      for (let t = 0; t < quarterTurns; t++) {
        for (const s of stickers) rotateStickerCW(s, rotFace);
      }
      continue;
    }

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
