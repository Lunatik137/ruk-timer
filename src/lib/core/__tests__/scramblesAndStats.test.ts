import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  invertAlgorithm,
  simulateCubeScramble,
  type CubeNetState,
} from "../cubeSim";
import {
  computeMeanOfN,
  computeTrimmedAverage,
  getEffectiveMs,
} from "../solveMath";
import { generateScramble } from "../../scrambles";

function isSolvedNet(net: CubeNetState): boolean {
  const faces = [net.U, net.D, net.F, net.B, net.L, net.R];
  return faces.every((face) => {
    const first = face[0][0];
    return face.every((row) => row.every((cell) => cell === first));
  });
}

describe("shared Web & Expo scrambles, 2D cube net & WCA solve math", () => {
  it("verifies scramble + invertAlgorithm(scramble) returns exact solved 2D cube net for 2x2..7x7", () => {
    const cases: { puzzle: "2x2" | "3x3" | "4x4" | "5x5" | "6x6" | "7x7"; size: number }[] = [
      { puzzle: "2x2", size: 2 },
      { puzzle: "3x3", size: 3 },
      { puzzle: "4x4", size: 4 },
      { puzzle: "5x5", size: 5 },
      { puzzle: "6x6", size: 6 },
      { puzzle: "7x7", size: 7 },
    ];

    for (const { puzzle, size } of cases) {
      const scr = generateScramble(puzzle);
      const scrambled = simulateCubeScramble(size, scr);
      expect(isSolvedNet(scrambled)).toBe(false);

      const inv = invertAlgorithm(scr);
      const restored = simulateCubeScramble(size, `${scr} ${inv}`);
      expect(isSolvedNet(restored)).toBe(true);
    }
  });

  it("computes WCA Ao5, Mo3, +2 and DNF edge cases accurately", () => {
    expect(getEffectiveMs({ time_ms: 10000, penalty: "OK" })).toBe(10000);
    expect(getEffectiveMs({ time_ms: 10000, penalty: "+2" })).toBe(12000);
    expect(getEffectiveMs({ time_ms: 10000, penalty: "DNF" })).toBe("DNF");

    // Mo3: any DNF -> DNF
    expect(computeMeanOfN([10000, 11000, 12000])).toBe(11000);
    expect(computeMeanOfN([10000, "DNF", 12000])).toBe("DNF");

    // Ao5: drops 1 best & 1 worst; 1 DNF is dropped as worst; 2 DNFs -> DNF
    expect(computeTrimmedAverage([9000, 10000, 11000, 12000, 15000], 5)).toBe(
      11000
    );
    expect(computeTrimmedAverage([9000, 10000, 11000, 12000, "DNF"], 5)).toBe(
      11000
    );
    expect(computeTrimmedAverage([9000, 10000, 11000, "DNF", "DNF"], 5)).toBe(
      "DNF"
    );
    expect(computeTrimmedAverage([9000, 10000, 11000, 12000], 5)).toBeNull();
  });

  it("keeps mobile/src/lib/core byte-identical to src/lib/core", () => {
    const webDir = path.resolve(process.cwd(), "src/lib/core");
    const mobileDir = path.resolve(process.cwd(), "mobile/src/lib/core");
    const webFiles = fs
      .readdirSync(webDir)
      .filter((f) => f.endsWith(".ts"))
      .sort();

    for (const file of webFiles) {
      const a = fs.readFileSync(path.join(webDir, file), "utf8");
      const b = fs.readFileSync(path.join(mobileDir, file), "utf8");
      expect(b).toBe(a);
    }
  });
});
