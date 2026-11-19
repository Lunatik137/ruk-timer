import type { PuzzleType, TrainingSubset } from "@/types/cubing";
import {
  countAlgMoves,
  tokenizeAlgorithm,
  invertAlgorithm,
  simulateCubeScramble,
  type CubeNetState,
  type FaceColor,
} from "./core/cubeSim";

export {
  countAlgMoves,
  tokenizeAlgorithm,
  invertAlgorithm,
  simulateCubeScramble,
};
export type { CubeNetState, FaceColor };


function randomItem<T>(arr: readonly T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}


/**
 * Generates WCA-style non-cancelling scrambles for NxN cubes (2x2 through 7x7).
 */
function generateNxNScramble(
  size: number,
  length: number,
  rng: () => number = Math.random
): string {
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
    const candidate = randomItem(moveBases, rng);
    const axis = axisOf[candidate.face];

    if (axis === lastAxis) {
      if (usedBasesOnAxis.has(candidate.base)) continue;
      usedBasesOnAxis.add(candidate.base);
    } else {
      lastAxis = axis;
      usedBasesOnAxis = new Set([candidate.base]);
    }

    moves.push(`${candidate.base}${randomItem(suffixes, rng)}`);
  }

  return moves.join(" ");
}

function generatePyraminxScramble(rng: () => number = Math.random): string {
  const faces = ["U", "L", "R", "B"];
  const tips = ["u", "l", "r", "b"];
  const suffixes = ["", "'"];
  const moves: string[] = [];
  let lastFace = "";

  for (let i = 0; i < 11; i++) {
    const valid = faces.filter((f) => f !== lastFace);
    const face = randomItem(valid, rng);
    lastFace = face;
    moves.push(`${face}${randomItem(suffixes, rng)}`);
  }

  for (const tip of tips) {
    const roll = Math.floor(rng() * 3);
    if (roll === 1) moves.push(tip);
    else if (roll === 2) moves.push(`${tip}'`);
  }

  return moves.join(" ");
}

function generateSkewbScramble(rng: () => number = Math.random): string {
  const faces = ["U", "L", "R", "B"];
  const suffixes = ["", "'"];
  const moves: string[] = [];
  let lastFace = "";

  for (let i = 0; i < 11; i++) {
    const face = randomItem(
      faces.filter((f) => f !== lastFace),
      rng
    );
    lastFace = face;
    moves.push(`${face}${randomItem(suffixes, rng)}`);
  }
  return moves.join(" ");
}

function generateMegaminxScramble(rng: () => number = Math.random): string {
  const lines: string[] = [];
  for (let row = 0; row < 7; row++) {
    const rowMoves: string[] = [];
    for (let i = 0; i < 10; i++) {
      const face = i % 2 === 0 ? "R" : "D";
      const dir = rng() < 0.5 ? "++" : "--";
      rowMoves.push(`${face}${dir}`);
    }
    rowMoves.push(rng() < 0.5 ? "U" : "U'");
    lines.push(rowMoves.join(" "));
  }
  return lines.join(" / ");
}

// ============================================================================
// Shape-Valid Square-1 Generator & Simulator
// ============================================================================
export interface Sq1Piece {
  width: 1 | 2; // 1 = 30° edge, 2 = 60° corner
  isTopOrigin: boolean;
  color: string;
}

function canSliceSq1Layer(layer: Sq1Piece[]): boolean {
  let sum = 0;
  for (const p of layer) {
    sum += p.width;
    if (sum === 6) return true;
    if (sum > 6) return false;
  }
  return false;
}

function rotateSq1Layer(layer: Sq1Piece[], steps30Deg: number): Sq1Piece[] | null {
  const n = ((steps30Deg % 12) + 12) % 12;
  if (n === 0) return [...layer];

  // Expand into 12 slots to verify we don't split a corner at the new index 0
  let total = 0;
  let splitIdx = -1;
  // Moving CW by n means taking the last n units to the front (target cut at 12 - n)
  const target = (12 - n) % 12;
  for (let i = 0; i < layer.length; i++) {
    if (total === target) {
      splitIdx = i;
      break;
    }
    total += layer[i].width;
  }
  if (splitIdx === -1) return null; // Cut would land inside a 60° corner
  const next = [...layer.slice(splitIdx), ...layer.slice(0, splitIdx)];
  return canSliceSq1Layer(next) ? next : null;
}

function applySq1Slash(
  top: Sq1Piece[],
  bottom: Sq1Piece[]
): { top: Sq1Piece[]; bottom: Sq1Piece[] } {
  const splitHalf = (layer: Sq1Piece[]) => {
    let sum = 0;
    const rightHalf: Sq1Piece[] = [];
    const leftHalf: Sq1Piece[] = [];
    for (const p of layer) {
      if (sum < 6) {
        rightHalf.push(p);
        sum += p.width;
      } else {
        leftHalf.push(p);
      }
    }
    return { rightHalf, leftHalf };
  };

  const t = splitHalf(top);
  const b = splitHalf(bottom);
  return {
    top: [...b.rightHalf.slice().reverse(), ...t.leftHalf],
    bottom: [...t.rightHalf.slice().reverse(), ...b.leftHalf],
  };
}

function createInitialSq1State(): { top: Sq1Piece[]; bottom: Sq1Piece[] } {
  const topColors = ["#22c55e", "#22c55e", "#f97316", "#f97316", "#2563eb", "#2563eb", "#ef4444", "#ef4444"];
  const botColors = ["#16a34a", "#16a34a", "#dc2626", "#dc2626", "#1d4ed8", "#1d4ed8", "#ea580c", "#ea580c"];
  const top: Sq1Piece[] = [
    { width: 1, isTopOrigin: true, color: topColors[0] },
    { width: 2, isTopOrigin: true, color: topColors[1] },
    { width: 1, isTopOrigin: true, color: topColors[2] },
    { width: 2, isTopOrigin: true, color: topColors[3] },
    { width: 1, isTopOrigin: true, color: topColors[4] },
    { width: 2, isTopOrigin: true, color: topColors[5] },
    { width: 1, isTopOrigin: true, color: topColors[6] },
    { width: 2, isTopOrigin: true, color: topColors[7] },
  ];
  const bottom: Sq1Piece[] = [
    { width: 2, isTopOrigin: false, color: botColors[0] },
    { width: 1, isTopOrigin: false, color: botColors[1] },
    { width: 2, isTopOrigin: false, color: botColors[2] },
    { width: 1, isTopOrigin: false, color: botColors[3] },
    { width: 2, isTopOrigin: false, color: botColors[4] },
    { width: 1, isTopOrigin: false, color: botColors[5] },
    { width: 2, isTopOrigin: false, color: botColors[6] },
    { width: 1, isTopOrigin: false, color: botColors[7] },
  ];
  return { top, bottom };
}

/**
 * Generates a 100% shape-valid Square-1 scramble where every `/` is physically executable.
 */
function generateSquare1Scramble(rng: () => number = Math.random): string {
  let { top, bottom } = createInitialSq1State();
  const ops: string[] = [];
  const candidates = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

  for (let i = 0; i < 12; i++) {
    const validPairs: { t: number; b: number; nextTop: Sq1Piece[]; nextBot: Sq1Piece[] }[] = [];
    for (const t of candidates) {
      const nt = rotateSq1Layer(top, t);
      if (!nt) continue;
      for (const b of candidates) {
        if (t === 0 && b === 0) continue;
        const nb = rotateSq1Layer(bottom, b);
        if (!nb) continue;
        validPairs.push({ t, b, nextTop: nt, nextBot: nb });
      }
    }
    if (validPairs.length === 0) break;
    const pick = randomItem(validPairs, rng);
    ops.push(`(${pick.t},${pick.b})`);
    ops.push("/");
    const slashed = applySq1Slash(pick.nextTop, pick.nextBot);
    top = slashed.top;
    bottom = slashed.bottom;
  }

  return ops.join(" ");
}

function generateClockScramble(rng: () => number = Math.random): string {
  const dials1 = ["UR", "DR", "DL", "UL", "U", "R", "D", "L", "ALL"];
  const dials2 = ["U", "R", "D", "L", "ALL"];
  const pins = ["UR", "DR", "DL", "UL"];
  const fmtDial = (d: string) => {
    const val = Math.floor(rng() * 12) - 5; // -5..6
    return val >= 0 ? `${d}${val}+` : `${d}${Math.abs(val)}-`;
  };

  const part1 = dials1.map(fmtDial).join(" ");
  const part2 = dials2.map(fmtDial).join(" ");
  const activePins = pins.filter(() => rng() < 0.5).join(" ");

  return `${part1} y2 ${part2}${activePins ? " " + activePins : ""}`;
}

export function generateScramble(
  puzzle: PuzzleType,
  rng: () => number = Math.random
): string {
  switch (puzzle) {
    case "2x2":
      return generateNxNScramble(2, 9, rng);
    case "3x3":
    case "3x3oh":
      return generateNxNScramble(3, 20, rng);
    case "3x3bld": {
      const base = generateNxNScramble(3, 20, rng);
      const wideSuffix = randomItem(["", " Rw", " Rw'", " Rw2", " Fw", " Fw'"], rng);
      const secondWide = randomItem(["", " Uw", " Uw'", " Uw2"], rng);
      return `${base}${wideSuffix}${secondWide}`;
    }
    case "4x4":
      return generateNxNScramble(4, 42, rng);
    case "5x5":
      return generateNxNScramble(5, 60, rng);
    case "6x6":
      return generateNxNScramble(6, 80, rng);
    case "7x7":
      return generateNxNScramble(7, 100, rng);
    case "pyraminx":
      return generatePyraminxScramble(rng);
    case "megaminx":
      return generateMegaminxScramble(rng);
    case "skewb":
      return generateSkewbScramble(rng);
    case "sq1":
      return generateSquare1Scramble(rng);
    case "clock":
      return generateClockScramble(rng);
    default:
      return generateNxNScramble(3, 20, rng);
  }
}


/**
 * Generates specialized 3x3 training subset scrambles (Cross Easy/Hard, F2L Only, Last Layer Only).
 */
export function generateTrainingSubsetScramble(subset: TrainingSubset): string {
  if (subset === "wca") return generateScramble("3x3");

  // White on D (`z2`): scramble Cross to exact depth
  if (subset === "cross_easy" || subset === "cross_hard") {
    const targetMoves = subset === "cross_easy" ? 4 : 7;
    const crossDisruptMoves = ["D", "D'", "D2", "R2", "L2", "F2", "B2", "R U R'", "F' U' F", "L' U L"];
    const picked: string[] = ["z2"];
    let last = "";
    for (let i = 0; i < targetMoves; i++) {
      const cand = randomItem(crossDisruptMoves.filter((m) => m[0] !== last[0]));
      last = cand;
      picked.push(cand);
    }
    // Add U moves to mix top layer without altering D cross depth much
    picked.push(randomItem(["U", "U'", "U2"]));
    return picked.join(" ");
  }

  // F2L Only: Cross on D is pre-solved (`z2`), only 4 F2L slots + U layer are scrambled
  if (subset === "f2l_only") {
    const slotTriggers = [
      "R U R'",
      "R U' R'",
      "R U2 R'",
      "L' U' L",
      "L' U L",
      "L' U2 L",
      "F' U' F",
      "F U F'",
      "R' U' R",
      "L U L'",
    ];
    const uMoves = ["U", "U'", "U2"];
    const seq: string[] = ["z2"];
    for (let i = 0; i < 6; i++) {
      seq.push(randomItem(slotTriggers));
      seq.push(randomItem(uMoves));
    }
    return seq.join(" ");
  }

  // Last Layer Only: Cross + F2L solved (`z2`), only OLL + PLL scrambled
  const llAlgs = [
    "R U R' U R U2 R'",
    "R U2 R' U' R U' R'",
    "F R U R' U' F'",
    "R U R' U' R' F R F'",
    "R U R' U' R' F R2 U' R' U' R U R' F'",
    "R2 U R U R' U' R' U' R' U R'",
  ];
  const uMoves = ["", "U", "U'", "U2"];
  const p1 = randomItem(llAlgs);
  const p2 = randomItem(llAlgs);
  const auf = randomItem(uMoves);
  return ["z2", p1, auf, p2].filter(Boolean).join(" ");
}

/**
 * Validates whether a scramble string uses legal tokens for the selected WCA puzzle.
 */
export function validateScramble(
  puzzle: PuzzleType,
  scramble: string
): { valid: boolean; moveCount: number; message: string } {
  const trimmed = scramble.trim();
  if (!trimmed) {
    return { valid: false, moveCount: 0, message: "Scramble đang trống" };
  }
  const tokens = tokenizeAlgorithm(trimmed);
  if (puzzle === "sq1") {
    const sq1Valid = /\(-?\d+,-?\d+\)/.test(trimmed);
    return {
      valid: sq1Valid,
      moveCount: (trimmed.match(/\//g) || []).length,
      message: sq1Valid ? "Chuẩn WCA Square-1 (Hợp lệ)" : "Sai cú pháp (top,bottom) /",
    };
  }
  if (puzzle === "clock") {
    const hasY2 = trimmed.includes("y2");
    return {
      valid: hasY2,
      moveCount: tokens.length,
      message: hasY2 ? "Chuẩn WCA Clock (Hợp lệ)" : "Thiếu mốc lật y2 của Clock",
    };
  }
  if (puzzle === "megaminx") {
    const hasPochmann = trimmed.includes("++") || trimmed.includes("--");
    return {
      valid: hasPochmann,
      moveCount: tokens.length,
      message: hasPochmann ? "Chuẩn WCA Pochmann Megaminx" : "Scramble tùy chỉnh",
    };
  }
  const moveRegex = /^(\d+)?([UDLRFBudlrfbMESxyz])(w)?(['2]+)?$/;
  const invalidTokens = tokens.filter((t) => !moveRegex.test(t));
  if (invalidTokens.length > 0) {
    return {
      valid: false,
      moveCount: tokens.length,
      message: `Ký hiệu không hợp lệ: ${invalidTokens.slice(0, 3).join(", ")}`,
    };
  }
  return {
    valid: true,
    moveCount: countAlgMoves(trimmed),
    message: `Chuẩn WCA ${puzzle.toUpperCase()} (${countAlgMoves(trimmed)} STM)`,
  };
}


/**
 * Extracts grouped triggers (e.g. "(R U R' U')") from a formula for step-by-step CFOP teaching.
 */
export function extractAlgorithmTriggers(formula: string): {
  label: string;
  moves: string;
  explanation: string;
}[] {
  const regex = /\(([^)]+)\)|([^\s()]+)/g;
  const rawChunks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(formula)) !== null) {
    rawChunks.push((match[1] || match[2]).trim());
  }

  const triggerDict: Record<string, { name: string; tip: string }> = {
    "R U R' U'": {
      name: "Sexy Move",
      tip: "Cổ tay phải xoay R, ngón trỏ phải gẩy U, trả R' rồi ngón trỏ trái gẩy U' liên hoàn.",
    },
    "R' F R F'": {
      name: "Sledgehammer",
      tip: "Hạ R', dùng ngón trỏ phải kéo F xuống, nâng R rồi dùng ngón cái/trỏ đẩy F'.",
    },
    "R U R'": {
      name: "Right Insert / Takeout",
      tip: "Mở khe phải R, gẩy U bằng trỏ phải rồi đóng khe R' không đổi thế cầm.",
    },
    "R U' R'": {
      name: "Right Slot Insert",
      tip: "Đưa cặp F2L vào khe Trước-Phải trong 3 nhịp mượt mà.",
    },
    "R U2 R'": {
      name: "Double-U Trigger",
      tip: "Dùng Double-Flick (trỏ + giữa tay phải hoặc trái) cho nước U2 để không bị khựng.",
    },
    "F' U' F": {
      name: "Front Slot Insert",
      tip: "Chèn cặp F2L từ hướng mặt Trước không cần xoay khối y'.",
    },
    "r U R' U'": {
      name: "Wide Sexy Move",
      tip: "Xoay đồng thời 2 tầng phải (r) giúp định hướng luôn viên cạnh tầng giữa.",
    },
  };

  return rawChunks.map((chunk, idx) => {
    const known = triggerDict[chunk];
    return {
      label: known ? `Bước ${idx + 1}: ${known.name}` : `Bước ${idx + 1}`,
      moves: chunk,
      explanation:
        known?.tip ||
        (chunk.includes("M")
          ? "Dùng ngón áp út tiếp nối ngón giữa gẩy tầng giữa M từ dưới đáy lên."
          : chunk.includes("2")
          ? "Ưu tiên kỹ thuật Double-Flick (2 ngón liên tiếp) cho các nước xoay 180°."
          : "Giữ ngón cái ở tâm Trước, hạn chế đổi thế cầm (regrip) khi chuyển nhịp."),
    };
  });
}


// ============================================================================
// Deterministic White Cross & First F2L Pair Coach Solver (Hybrid AI Engine)
// ============================================================================

export interface CrossCoachSolution {
  orientation: string;
  moves: string;
  moveCount: number;
  solvedEdgesCount: number;
  firstPairAdvice: string;
  stepExplanation: string[];
}

function countSolvedWhiteCrossEdgesOnD(net: CubeNetState): number {
  let solved = 0;
  // After z2 (White on D, Green on F, Red on L, Blue on B, Orange on R):
  // D center is net.D[1][1], surrounding centers are F[1][1], R[1][1], B[1][1], L[1][1]
  const dCenter = net.D[1][1];
  if (net.D[0][1] === dCenter && net.F[2][1] === net.F[1][1]) solved++;
  if (net.D[1][2] === dCenter && net.R[2][1] === net.R[1][1]) solved++;
  if (net.D[2][1] === dCenter && net.B[2][1] === net.B[1][1]) solved++;
  if (net.D[1][0] === dCenter && net.L[2][1] === net.L[1][1]) solved++;
  return solved;
}

/**
 * Deterministic Heuristic Search (Beam Search over 3x3 state space) to construct
 * verified White Cross solutions and inspect the resulting F2L first pair.
 */
export function solveOptimalCross(scramble: string): CrossCoachSolution[] {
  const baseScramble = scramble.includes("z2") ? scramble : `${scramble} z2`;
  const candidateMoves = [
    "F", "F'", "F2",
    "R", "R'", "R2",
    "L", "L'", "L2",
    "B", "B'", "B2",
    "D", "D'", "D2",
    "U", "U'", "U2",
  ];

  // Score function: number of D edges with White + number aligned with side center
  const scoreState = (net: CubeNetState): number => {
    const dColor = net.D[1][1];
    let score = 0;
    const checks: [FaceColor, FaceColor, FaceColor][] = [
      [net.D[0][1], net.F[2][1], net.F[1][1]],
      [net.D[1][2], net.R[2][1], net.R[1][1]],
      [net.D[2][1], net.B[2][1], net.B[1][1]],
      [net.D[1][0], net.L[2][1], net.L[1][1]],
    ];
    for (const [dSticker, sideSticker, sideCenter] of checks) {
      if (dSticker === dColor && sideSticker === sideCenter) {
        score += 10;
      } else if (dSticker === dColor) {
        score += 4;
      }
    }
    return score;
  };

  interface BeamNode {
    seq: string[];
    net: CubeNetState;
    score: number;
  }

  let beam: BeamNode[] = [
    {
      seq: [],
      net: simulateCubeScramble(3, baseScramble),
      score: scoreState(simulateCubeScramble(3, baseScramble)),
    },
  ];

  const foundSolutions: BeamNode[] = [];
  if (beam[0].score === 40) {
    foundSolutions.push(beam[0]);
  }

  for (let depth = 1; depth <= 7 && foundSolutions.length < 3; depth++) {
    const nextBeam: BeamNode[] = [];
    for (const node of beam) {
      const lastFace = node.seq.length > 0 ? node.seq[node.seq.length - 1][0] : "";
      for (const mv of candidateMoves) {
        if (mv[0] === lastFace) continue;
        const nextSeq = [...node.seq, mv];
        const nextNet = simulateCubeScramble(
          3,
          `${baseScramble} ${nextSeq.join(" ")}`
        );
        const sc = scoreState(nextNet);
        const child: BeamNode = { seq: nextSeq, net: nextNet, score: sc };
        if (sc === 40) {
          foundSolutions.push(child);
          if (foundSolutions.length >= 3) break;
        } else {
          nextBeam.push(child);
        }
      }
      if (foundSolutions.length >= 3) break;
    }
    nextBeam.sort((a, b) => b.score - a.score);
    beam = nextBeam.slice(0, 28);
  }

  const finalNodes =
    foundSolutions.length > 0 ? foundSolutions : beam.slice(0, 2);

  return finalNodes.map((node, idx) => {
    const movesStr = node.seq.length > 0 ? node.seq.join(" ") : "(Cross đã giải sẵn)";
    const solvedEdges = countSolvedWhiteCrossEdgesOnD(node.net);
    const hasTopWhiteCorner =
      node.net.U.some((row) => row.includes("W")) ||
      node.net.F[0].includes("W") ||
      node.net.R[0].includes("W");

    return {
      orientation: "z2 (Đặt tâm Trắng ở đáy D, Xanh lá ở Trước F)",
      moves: movesStr,
      moveCount: node.seq.length,
      solvedEdgesCount: solvedEdges,
      firstPairAdvice: hasTopWhiteCorner
        ? "Sau bước cuối của Cross, có sẵn góc Trắng ở tầng trên (U): giữ ánh mắt (lookahead) vào khe Trước-Phải (FR) để nối thẳng vào F2L #1 không dừng tay."
        : "Sau khi hoàn tất Cross, ưu tiên đẩy nhanh 1 góc Trắng đang kẹt dưới khe lên tầng U bằng (R U R') để mở cặp F2L #1.",
      stepExplanation: [
        `Phương án #${idx + 1} (${node.seq.length} nước STM): Cầm khối Rubik để mặt Trắng ở dưới đáy (z2 sau khi tráo).`,
        node.seq.length <= 5
          ? "Cross ngắn thuận lợi: Hãy nhắm mắt hình dung toàn bộ chuỗi nước đi này trong 15s Inspection và dành thời gian còn lại tìm cặp F2L đầu tiên."
          : "Cross trung bình-khó: Tận dụng các nước xoay mặt D để gom nhiều cạnh Trắng xuống đáy trước, sau đó mới căn chỉnh D/D'/D2 khớp với 4 tâm ở bước cuối.",
      ],
    };
  });
}

// ============================================================================
// 2D State Simulators for Non-Cubic WCA Events (Clock, Sq-1, Pyraminx, Skewb)
// ============================================================================

export function simulateClockState(scramble: string): {
  frontDials: number[];
  backDials: number[];
  pins: [boolean, boolean, boolean, boolean];
} {
  // 9 dials on front and 9 on back (0..11 hours)
  const front = Array(9).fill(0);
  const back = Array(9).fill(0);
  const parts = scramble.split(/\s+y2\s+/);
  const part1 = (parts[0] || "").trim().split(/\s+/);
  const part2 = (parts[1] || "").trim().split(/\s+/);

  const dialIndices: Record<string, number[]> = {
    UR: [1, 2, 4, 5],
    DR: [4, 5, 7, 8],
    DL: [3, 4, 6, 7],
    UL: [0, 1, 3, 4],
    U: [0, 1, 2, 3, 4, 5],
    R: [1, 2, 4, 5, 7, 8],
    D: [3, 4, 5, 6, 7, 8],
    L: [0, 1, 3, 4, 6, 7],
    ALL: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  };

  const applyTokens = (tokens: string[], target: number[], mirrorBack: number[]) => {
    for (const tok of tokens) {
      const m = tok.match(/^(UR|DR|DL|UL|ALL|U|R|D|L)(\d+)([+-])$/);
      if (!m) continue;
      const [, code, numStr, sign] = m;
      const delta = (sign === "+" ? 1 : -1) * parseInt(numStr, 10);
      for (const idx of dialIndices[code] || []) {
        target[idx] = (((target[idx] + delta) % 12) + 12) % 12;
      }
      // Corner clocks sync negatively to the opposite face
      const cornerSync: Record<number, number> = { 0: 2, 2: 0, 6: 8, 8: 6 };
      for (const idx of dialIndices[code] || []) {
        if (idx in cornerSync) {
          const bIdx = cornerSync[idx];
          mirrorBack[bIdx] = (((mirrorBack[bIdx] - delta) % 12) + 12) % 12;
        }
      }
    }
  };

  applyTokens(part1, front, back);
  applyTokens(part2, back, front);

  const pinSet = new Set(part2.filter((t) => ["UR", "DR", "DL", "UL"].includes(t)));
  return {
    frontDials: front,
    backDials: back,
    pins: [
      pinSet.has("UL"),
      pinSet.has("UR"),
      pinSet.has("DL"),
      pinSet.has("DR"),
    ],
  };
}

export function simulateSquare1State(scramble: string): {
  top: Sq1Piece[];
  bottom: Sq1Piece[];
  middleFlipped: boolean;
} {
  let { top, bottom } = createInitialSq1State();
  let middleFlipped = false;
  const tokens = scramble.trim().split(/\s+/);

  for (const tok of tokens) {
    if (tok === "/") {
      if (canSliceSq1Layer(top) && canSliceSq1Layer(bottom)) {
        const res = applySq1Slash(top, bottom);
        top = res.top;
        bottom = res.bottom;
        middleFlipped = !middleFlipped;
      }
    } else {
      const m = tok.match(/^\((-?\d+),(-?\d+)\)$/);
      if (m) {
        const t = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        const nt = rotateSq1Layer(top, t);
        const nb = rotateSq1Layer(bottom, b);
        if (nt) top = nt;
        if (nb) bottom = nb;
      }
    }
  }

  return { top, bottom, middleFlipped };
}
