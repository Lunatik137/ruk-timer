import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FaceColor, simulateCubeScramble } from "../lib/scrambles";
import { PUZZLES, PuzzleType } from "../types/cubing";

const COLOR_HEX: Record<FaceColor, string> = {
  W: "#f8fafc",
  Y: "#facc15",
  G: "#22c55e",
  B: "#2563eb",
  O: "#f97316",
  R: "#ef4444",
};

interface Props {
  puzzle: PuzzleType;
  scramble: string;
  compact?: boolean;
}

function FaceView({
  grid,
  cellSize,
}: {
  grid: FaceColor[][];
  cellSize: number;
}) {
  return (
    <View style={styles.faceBox}>
      {grid.map((row, rIdx) => (
        <View key={rIdx} style={styles.faceRow}>
          {row.map((color, cIdx) => (
            <View
              key={`${rIdx}-${cIdx}`}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: COLOR_HEX[color],
                borderRadius: 2,
                margin: 1,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function CubeNetNative({
  puzzle,
  scramble,
  compact = false,
}: Props) {
  const meta = useMemo(() => PUZZLES.find((p) => p.id === puzzle), [puzzle]);
  const cubeSize = meta?.cubeSize;

  const net = useMemo(() => {
    if (!cubeSize) return null;
    return simulateCubeScramble(cubeSize, scramble);
  }, [cubeSize, scramble]);

  if (!net || !cubeSize) {
    return (
      <View style={styles.unsupportedBox}>
        <Text style={styles.unsupportedTitle}>{meta?.label || puzzle}</Text>
        <Text style={styles.unsupportedSub}>
          2D Net hỗ trợ 2x2 – 7x7, OH & BLD
        </Text>
      </View>
    );
  }

  const baseFacePixels = compact ? 54 : 76;
  const cellSize = Math.max(6, Math.floor(baseFacePixels / cubeSize) - 2);
  const faceTotalWidth = cubeSize * (cellSize + 2) + 4;

  return (
    <View style={styles.netContainer}>
      {/* Row 1: [ _, U, _, _ ] */}
      <View style={styles.netRow}>
        <View style={{ width: faceTotalWidth, margin: 3 }} />
        <FaceView grid={net.U} cellSize={cellSize} />
        <View style={{ width: faceTotalWidth, margin: 3 }} />
        <View style={{ width: faceTotalWidth, margin: 3 }} />
      </View>

      {/* Row 2: [ L, F, R, B ] */}
      <View style={styles.netRow}>
        <FaceView grid={net.L} cellSize={cellSize} />
        <FaceView grid={net.F} cellSize={cellSize} />
        <FaceView grid={net.R} cellSize={cellSize} />
        <FaceView grid={net.B} cellSize={cellSize} />
      </View>

      {/* Row 3: [ _, D, _, _ ] */}
      <View style={styles.netRow}>
        <View style={{ width: faceTotalWidth, margin: 3 }} />
        <FaceView grid={net.D} cellSize={cellSize} />
        <View style={{ width: faceTotalWidth, margin: 3 }} />
        <View style={{ width: faceTotalWidth, margin: 3 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  netContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  faceBox: {
    backgroundColor: "#020617",
    padding: 2,
    borderRadius: 4,
    margin: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  faceRow: {
    flexDirection: "row",
  },
  unsupportedBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
  },
  unsupportedTitle: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 13,
  },
  unsupportedSub: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 4,
  },
});
