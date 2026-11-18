import {
  countAlgMoves,
  type CubeNetState,
  invertAlgorithm,
  simulateCubeScramble,
} from "@/lib/scrambles";
import type { CfopMasteryStatus, CfopProgressItem, StatSummary } from "@/types/cubing";

export type CfopStage = "CROSS" | "F2L" | "OLL" | "PLL";

export type CfopLearningTier = 1 | 2 | 3 | 4;

export interface CfopAlgorithm {
  id: string;
  stage: CfopStage;
  code: string;
  name: string;
  group: string;
  formula: string;
  altFormula?: string;
  isTwoLook?: boolean;
  recognition: string;
}

export interface AlgorithmVariantComparison {
  label: string;
  formula: string;
  stmMoves: number;
  styleTag: string;
  ergonomics: string;
}


/**
 * Canonical session name used to store each CFOP algorithm's dedicated timer history.
 */
export function getCfopSessionName(alg: CfopAlgorithm): string {
  return `CFOP • ${alg.code}: ${alg.name}`;
}

/**
 * Simulates the pre-algorithm cube state with Yellow on Top (`z2` from WCA White-Top Green-Front).
 * Executing `alg.formula` from this state solves the target CFOP step!
 */
export function simulateCfopCaseState(formula: string): {
  setupMoves: string;
  moveCount: number;
  net: CubeNetState;
} {
  const setupMoves = invertAlgorithm(formula);
  const moveCount = countAlgMoves(formula);
  const net = simulateCubeScramble(3, `z2 ${setupMoves}`);
  return { setupMoves, moveCount, net };
}

export const CFOP_STAGE_META: Record<
  CfopStage,
  { title: string; subtitle: string; badgeColor: string }
> = {
  CROSS: {
    title: "Cross & Trigger",
    subtitle: "Nền tảng dấu cộng trắng & chuỗi Fingertrick tốc độ cao",
    badgeColor: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  },
  F2L: {
    title: "F2L (2 Tầng Đầu)",
    subtitle: "Ghép đồng thời góc và cạnh vào 4 khe (First Two Layers)",
    badgeColor: "text-cyan-300 bg-cyan-500/15 border-cyan-500/30",
  },
  OLL: {
    title: "OLL (Định Hướng Tầng Cuối)",
    subtitle: "Lật toàn bộ 9 viên mặt vàng hướng lên trên (2-Look & Full OLL)",
    badgeColor: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  },
  PLL: {
    title: "PLL (Hoán Vị Tầng Cuối)",
    subtitle: "Đầy đủ 21/21 công thức hoán vị hoàn thiện khối Rubik (2-Look & Full PLL)",
    badgeColor: "text-indigo-300 bg-indigo-500/15 border-indigo-500/30",
  },
};

export const CFOP_ALGORITHMS: CfopAlgorithm[] = [
  // ============================================================================
  // 1. CROSS & CORE TRIGGERS (6)
  // ============================================================================
  {
    id: "cross-sexy",
    stage: "CROSS",
    code: "Trigger 01",
    name: "Sexy Move x6 (Luyện tốc độ tay)",
    group: "Fingertrick nền tảng",
    formula: "(R U R' U') (R U R' U') (R U R' U') (R U R' U') (R U R' U') (R U R' U')",
    altFormula: "(R U R' U')",
    isTwoLook: true,
    recognition:
      "Bài bấm giờ kinh điển của mọi Cuber: lặp chuỗi (R U R' U') đúng 6 lần liên tiếp từ khối đã giải về lại nguyên trạng để đo tốc độ ngón tay (mục tiêu dưới 2.5s)!",
  },
  {
    id: "cross-sledge",
    stage: "CROSS",
    code: "Trigger 02",
    name: "Sledgehammer x6",
    group: "Fingertrick nền tảng",
    formula: "(R' F R F') (R' F R F') (R' F R F') (R' F R F') (R' F R F') (R' F R F')",
    altFormula: "(R' F R F')",
    isTwoLook: true,
    recognition:
      "Chuỗi 4 nước quan trọng thứ hai sau Sexy Move: dùng ngón trỏ phải gẩy F và ngón cái/trỏ trái hoặc phải trả F'. Lặp 6 lần trở về nguyên trạng.",
  },
  {
    id: "cross-bad-edge",
    stage: "CROSS",
    code: "Cross 01",
    name: "Lật cạnh Cross bị ngược",
    group: "Kỹ thuật Cross đáy",
    formula: "R' F R D'",
    altFormula: "F' D R' D'",
    isTwoLook: true,
    recognition:
      "Khi cạnh dấu cộng trắng ở tầng giữa/trước bị lật ngược màu: dùng R' F R D' để đưa xuống đáy nhanh không cần xoay khối.",
  },
  {
    id: "cross-adj-swap",
    stage: "CROSS",
    code: "Cross 02",
    name: "Đổi 2 cạnh Cross kề nhau",
    group: "Kỹ thuật Cross đáy",
    formula: "R2 U R2 U' R2",
    altFormula: "R' D' R D R'",
    isTwoLook: true,
    recognition:
      "Sửa lỗi nhanh khi xếp xong dấu cộng trắng nhưng 2 cạnh kề nhau bị tráo vị trí so với tâm.",
  },
  {
    id: "cross-opp-swap",
    stage: "CROSS",
    code: "Cross 03",
    name: "Đổi 2 cạnh Cross đối diện",
    group: "Kỹ thuật Cross đáy",
    formula: "M2 U2 M2",
    altFormula: "R2 L2 U2 R2 L2",
    isTwoLook: true,
    recognition:
      "Đổi chỗ 2 viên cạnh đối diện bằng 3 nhịp gẩy tầng giữa M2 cực gọn.",
  },
  {
    id: "cross-m-slice",
    stage: "CROSS",
    code: "Trigger 03",
    name: "M-Slice Fingertrick (M' U) x4",
    group: "Fingertrick nền tảng",
    formula: "(M' U M' U M' U M' U) (M' U M' U M' U M' U)",
    recognition:
      "Luyện ngón áp út + ngón giữa gẩy kép M' phối hợp ngón trỏ gẩy U — nền tảng để làm H Perm, Z Perm, U Perm cực nhanh.",
  },

  // ============================================================================
  // 2. F2L - FIRST TWO LAYERS (18 Essential & Advanced Slot FR Cases)
  // ============================================================================
  {
    id: "f2l-01",
    stage: "F2L",
    code: "F2L 01",
    name: "Chèn cơ bản khe Phải",
    group: "Cơ bản (Tầng trên)",
    formula: "U (R U' R')",
    isTwoLook: true,
    recognition:
      "Góc có mặt trắng hướng sang phải, mặt trên của góc và cạnh khác màu, cạnh nằm chờ đối diện.",
  },
  {
    id: "f2l-02",
    stage: "F2L",
    code: "F2L 02",
    name: "Chèn cơ bản mặt Trước",
    group: "Cơ bản (Tầng trên)",
    formula: "U' (F' U F)",
    altFormula: "y' U' (R' U R)",
    isTwoLook: true,
    recognition:
      "Đối xứng của F2L 01: mặt trắng của góc hướng về phía trước, cạnh nằm bên trái.",
  },
  {
    id: "f2l-03",
    stage: "F2L",
    code: "F2L 03",
    name: "Bắt cặp 3 nước (Phải)",
    group: "Cơ bản (Tầng trên)",
    formula: "(R U R')",
    isTwoLook: true,
    recognition:
      "Trắng hướng về phía trước, cạnh ở UB khác màu mặt trên: đưa góc lên bắt cạnh trong đúng 3 nước.",
  },
  {
    id: "f2l-04",
    stage: "F2L",
    code: "F2L 04",
    name: "Bắt cặp 3 nước (Trước)",
    group: "Cơ bản (Tầng trên)",
    formula: "(F' U' F)",
    altFormula: "y' (R' U' R)",
    isTwoLook: true,
    recognition:
      "Trắng hướng sang phải, cạnh ở UL khác màu mặt trên: bắt cặp trực tiếp từ mặt trước.",
  },
  {
    id: "f2l-05",
    stage: "F2L",
    code: "F2L 05",
    name: "Cùng màu mặt trên (Gần)",
    group: "Tách & Ghép tầng trên",
    formula: "U' (R U R') U2 (R U' R')",
    isTwoLook: true,
    recognition:
      "Góc ở FRU (trắng sang phải) và cạnh ở UB có CÙNG màu mặt trên: giấu góc xuống để dời cạnh rồi chèn.",
  },
  {
    id: "f2l-06",
    stage: "F2L",
    code: "F2L 06",
    name: "Cùng màu mặt trên (Xa)",
    group: "Tách & Ghép tầng trên",
    formula: "U' (R U2 R') U2 (R U' R')",
    recognition:
      "Góc trắng sang phải, cạnh cùng màu nằm ở UL: giấu góc rồi xoay U2 đưa cạnh về đúng tầm ghép.",
  },
  {
    id: "f2l-07",
    stage: "F2L",
    code: "F2L 07",
    name: "Cùng màu — Trắng hướng Trước",
    group: "Tách & Ghép tầng trên",
    formula: "U (F' U' F) U2 (F' U F)",
    altFormula: "y' U (R' U' R) U2 (R' U R)",
    isTwoLook: true,
    recognition:
      "Đối xứng với F2L 05 khi mặt trắng của góc hướng ra phía trước.",
  },
  {
    id: "f2l-08",
    stage: "F2L",
    code: "F2L 08",
    name: "Góc ngửa trắng — Cạnh khớp tâm Phải",
    group: "Góc ngửa mặt trắng",
    formula: "(R U2 R') U' (R U R')",
    isTwoLook: true,
    recognition:
      "Mặt trắng ngửa lên U, cạnh nằm bên phải khớp màu tâm R: úp góc chồng lên cạnh bằng R U2 R' rồi chèn.",
  },
  {
    id: "f2l-09",
    stage: "F2L",
    code: "F2L 09",
    name: "Góc ngửa trắng — Cạnh ở mặt Trước",
    group: "Góc ngửa mặt trắng",
    formula: "U (R U2 R') U (R U' R')",
    recognition:
      "Góc ngửa trắng, cạnh khớp tâm R đang nằm ở UF: đẩy sang phải rồi úp góc ghép thành khối.",
  },
  {
    id: "f2l-10",
    stage: "F2L",
    code: "F2L 10",
    name: "Góc ngửa trắng — Cạnh khớp tâm Trước",
    group: "Góc ngửa mặt trắng",
    formula: "(F' U2 F) U (F' U' F)",
    altFormula: "y' (R' U2 R) U (R' U' R)",
    isTwoLook: true,
    recognition:
      "Mặt trắng ngửa lên U, cạnh ở UF khớp màu với tâm Trước: úp góc từ hướng trước.",
  },
  {
    id: "f2l-11",
    stage: "F2L",
    code: "F2L 11",
    name: "Dính sát nhau nhưng ngược màu",
    group: "Cặp dính sai tầng trên",
    formula: "U' (R U' R') U (R U R')",
    isTwoLook: true,
    recognition:
      "Góc (trắng sang phải) và cạnh dính nhau ở FRU–UB nhưng khác màu mặt trên: tách nhanh không xoay khối.",
  },
  {
    id: "f2l-12",
    stage: "F2L",
    code: "F2L 12",
    name: "Dính sát nhau cùng màu mặt trên",
    group: "Cặp dính sai tầng trên",
    formula: "(R U' R' U) (R U2 R') U (R U' R')",
    recognition:
      "Góc và cạnh dính nhau ở FRU–UF có mặt trên trùng màu, trắng hướng sang phải.",
  },
  {
    id: "f2l-13",
    stage: "F2L",
    code: "F2L 13",
    name: "Triple Sexy (Cạnh đúng khe, Góc ngửa trắng)",
    group: "Viên nằm sẵn trong khe",
    formula: "(R U R' U') (R U R' U') (R U R' U')",
    isTwoLook: true,
    recognition:
      "Cạnh đã nằm đúng chiều trong khe FR, góc ở ngay phía trên ngửa màu trắng lên trời: làm 3 lần Sexy Move siêu tốc!",
  },
  {
    id: "f2l-14",
    stage: "F2L",
    code: "F2L 14",
    name: "Góc đúng khe, Cạnh ở tầng trên",
    group: "Viên nằm sẵn trong khe",
    formula: "U' (R' F R F') (R U' R')",
    altFormula: "U (R U' R') U' (F' U F)",
    isTwoLook: true,
    recognition:
      "Góc đã yên vị đúng dưới đáy khe FR, chỉ còn viên cạnh ở tầng trên cần đưa vào bằng Sledgehammer + Insert.",
  },
  {
    id: "f2l-15",
    stage: "F2L",
    code: "F2L 15",
    name: "Góc lệch trong khe (Trắng hướng Phải)",
    group: "Viên nằm sẵn trong khe",
    formula: "(R U' R') U (R U' R')",
    recognition:
      "Góc ở dưới khe FR nhưng trắng hướng sang phải, cạnh khớp sẵn ở tầng trên.",
  },
  {
    id: "f2l-16",
    stage: "F2L",
    code: "F2L 16",
    name: "Góc lệch trong khe (Trắng hướng Trước)",
    group: "Viên nằm sẵn trong khe",
    formula: "(R U R') U' (R U R')",
    recognition:
      "Góc ở dưới khe FR có trắng hướng ra trước, cạnh nằm sẵn vị trí bắt cặp.",
  },
  {
    id: "f2l-17",
    stage: "F2L",
    code: "F2L 17",
    name: "Đúng góc nhưng Cạnh bị ngược trong khe",
    group: "Cả hai nằm trong khe",
    formula: "(R U' R') U' (R U R') U2 (R U' R')",
    altFormula: "(R U' R') d (R' U2 R) U2 (R' U R)",
    isTwoLook: true,
    recognition:
      "Trường hợp kinh điển hay gặp nhất cuối F2L: cả góc và cạnh đều nằm trong khe FR nhưng viên cạnh bị lật ngược màu!",
  },
  {
    id: "f2l-18",
    stage: "F2L",
    code: "F2L 18",
    name: "Cạnh đúng khe, Góc bị xoắn (Trắng sang Phải)",
    group: "Cả hai nằm trong khe",
    formula: "(R U R' U') (R U2 R') U' (R U R')",
    recognition:
      "Cạnh nằm đúng chiều trong khe FR nhưng viên góc bên dưới bị xoay mặt trắng hướng sang phải.",
  },

  // ============================================================================
  // 3. OLL - ORIENTATION OF THE LAST LAYER (24 Cases: Full 10 2-Look + 14 Top 1-Look)
  // ============================================================================
  // --- Step 1 of 2-Look OLL: Edge Orientation (3 cases) ---
  {
    id: "oll-45",
    stage: "OLL",
    code: "OLL 45",
    name: "Chữ I ngang (Tạo dấu cộng vàng)",
    group: "2-Look OLL • Tạo dấu cộng",
    formula: "F (R U R' U') F'",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 1] Trên mặt U có vạch ngang 3 ô màu vàng (đặt nằm ngang trái-phải) + thanh vàng bên trái.",
  },
  {
    id: "oll-44",
    stage: "OLL",
    code: "OLL 44",
    name: "Góc chữ L nhỏ (Tạo dấu cộng vàng)",
    group: "2-Look OLL • Tạo dấu cộng",
    formula: "f (R U R' U') f'",
    altFormula: "F (U R U' R') F'",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 1] Mặt trên có hình góc vuông vàng nhỏ: dùng f (2 tầng trước) với đặt góc ở Trước-Phải, hoặc F (U R U' R') F' khi đặt ở Trái-Sau.",
  },
  {
    id: "oll-02",
    stage: "OLL",
    code: "OLL 02",
    name: "Chấm tròn Dot (Không cạnh vàng nào ngửa)",
    group: "2-Look OLL • Tạo dấu cộng",
    formula: "F (R U R' U') F' f (R U R' U') f'",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 1] Không có viên cạnh vàng nào ngửa lên (chỉ có tâm vàng ở giữa): nối trực tiếp OLL 45 + OLL 44!",
  },

  // --- Step 2 of 2-Look OLL: All 7 OCLL Cases (Edges Already Oriented) ---
  {
    id: "oll-27",
    stage: "OLL",
    code: "OLL 27",
    name: "Sune (Con cá bơi sang trái)",
    group: "2-Look OLL • Dấu cộng sẵn (OCLL)",
    formula: "(R U R' U) (R U2 R')",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Hình con cá có 1 góc vàng ở Trước-Trái (ULF) và chấm vàng hướng về phía bạn ở góc Trước-Phải.",
  },
  {
    id: "oll-26",
    stage: "OLL",
    code: "OLL 26",
    name: "Anti-Sune (Con cá ngược)",
    group: "2-Look OLL • Dấu cộng sẵn (OCLL)",
    formula: "(R U2 R') (U' R U' R')",
    altFormula: "(L' U' L U') (L' U2 L)",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Hình con cá đặt góc vàng đã lật ở Sau-Phải (URB), mặt vàng phụ nhìn sang bên Phải.",
  },
  {
    id: "oll-21",
    stage: "OLL",
    code: "OLL 21",
    name: "H-OLL (Double Headlights)",
    group: "2-Look OLL • Dấu cộng sẵn (OCLL)",
    formula: "F (R U R' U') (R U R' U') (R U R' U') F'",
    altFormula: "(R U2 R' U') (R U R' U') (R U' R')",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Dấu cộng vàng trên đỉnh, 2 cặp đèn pha vàng hướng ra Trước và Sau (F + Triple Sexy + F').",
  },
  {
    id: "oll-22",
    stage: "OLL",
    code: "OLL 22",
    name: "Pi / Bruno (Đèn pha 1 bên, 2 tai 1 bên)",
    group: "2-Look OLL • Dấu cộng sẵn (OCLL)",
    formula: "R U2 (R2 U' R2 U' R2) U2 R",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Dấu cộng vàng: bên Trái có cặp đèn pha cùng hướng, bên Phải có 2 góc quay lưng ngược chiều nhau.",
  },
  {
    id: "oll-23",
    stage: "OLL",
    code: "OLL 23",
    name: "U-OLL / Headlights (Đèn pha trước mặt)",
    group: "2-Look OLL • Dấu cộng sẵn (OCLL)",
    formula: "R2 D (R' U2 R) D' (R' U2 R')",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Hai góc Sau đã lật vàng đúng, 2 góc Trước chiếu thẳng đèn pha vàng về phía mặt bạn.",
  },
  {
    id: "oll-24",
    stage: "OLL",
    code: "OLL 24",
    name: "T-OLL / Chameleon (Tắc kè hoa)",
    group: "2-Look OLL • Dấu cộng sẵn (OCLL)",
    formula: "(r U R' U') (r' F R F')",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Hai góc Phải đã vàng, hai góc Trái quay lưng ngược nhau ra Trước và Sau. Cực nhanh với wide move r!",
  },
  {
    id: "oll-25",
    stage: "OLL",
    code: "OLL 25",
    name: "L-OLL / Bowtie (Hình chiếc nơ)",
    group: "2-Look OLL • Dấu cộng sẵn (OCLL)",
    formula: "F' (r U R' U') (r' F R)",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Hai góc chéo nhau đã lật vàng, 2 góc còn lại tạo hình nơ (đặt 1 viên vàng nhìn về mặt Trước ở góc Trước-Trái).",
  },

  // --- High-Frequency 1-Look Full OLL Cases (14 popular fast cases) ---
  {
    id: "oll-33",
    stage: "OLL",
    code: "OLL 33",
    name: "T-Shape (Sexy + Sledge)",
    group: "Full OLL • Chữ T & Ô vuông",
    formula: "(R U R' U') (R' F R F')",
    recognition:
      "Hình chữ T nằm ngang trên mặt U với 2 góc bên trái quay lưng ra Trước & Sau: tổ hợp 8 nước nhanh nhất trong Full OLL!",
  },
  {
    id: "oll-37",
    stage: "OLL",
    code: "OLL 37",
    name: "Mounted Fish (Sledge + Sexy)",
    group: "Full OLL • Cá & Tia chớp",
    formula: "F (R U' R' U') (R U R' F')",
    altFormula: "F (R' F' R) (U R U' R')",
    recognition:
      "Hai khối 2x2 chạm góc nhau tạo hình con cá nghiêng (nửa đầu của Y Perm!).",
  },
  {
    id: "oll-28",
    stage: "OLL",
    code: "OLL 28",
    name: "Stealth / Arrow (4 góc đã vàng, thiếu 2 cạnh)",
    group: "Full OLL • 4 Góc đã lật",
    formula: "(r U R' U') (r' R U) (R U' R')",
    recognition:
      "Cả 4 góc đều đã màu vàng, chỉ bị lật 2 cạnh kề nhau ở UF và UR.",
  },
  {
    id: "oll-57",
    stage: "OLL",
    code: "OLL 57",
    name: "H-Line (4 góc đã vàng, thiếu 2 cạnh đối)",
    group: "Full OLL • 4 Góc đã lật",
    formula: "(R U R' U') M' (U R U' r')",
    recognition:
      "Cả 4 góc đều đã vàng tạo hình chữ H, thiếu 2 cạnh đối diện UF và UB.",
  },
  {
    id: "oll-20",
    stage: "OLL",
    code: "OLL 20",
    name: "X-Shape / Checkers (4 góc vàng, 4 cạnh ngược)",
    group: "Full OLL • 4 Góc đã lật",
    formula: "(r U R' U') M2 (U R U' R') U' M'",
    recognition:
      "Hình dấu nhân X màu vàng (4 góc đã lật, toàn bộ 4 cạnh bị ngược).",
  },
  {
    id: "oll-05",
    stage: "OLL",
    code: "OLL 05",
    name: "Left Wide Anti-Sune (Ô vuông 2x2)",
    group: "Full OLL • Chữ T & Ô vuông",
    formula: "(r' U2 R U R' U r)",
    recognition:
      "Khối ô vuông vàng 2x2 ở góc Sau-Trái: chỉ dùng 6 nước wide move cực kỳ mượt.",
  },
  {
    id: "oll-06",
    stage: "OLL",
    code: "OLL 06",
    name: "Right Wide Anti-Sune (Ô vuông 2x2)",
    group: "Full OLL • Chữ T & Ô vuông",
    formula: "(r U2 R' U' R U' r')",
    recognition:
      "Khối ô vuông vàng 2x2 ở góc Trước-Trái: làm Anti-Sune 2 tầng phải (r).",
  },
  {
    id: "oll-07",
    stage: "OLL",
    code: "OLL 07",
    name: "Wide Sune (Tia chớp nhỏ phải)",
    group: "Full OLL • Cá & Tia chớp",
    formula: "(r U R' U) (R U2 r')",
    recognition:
      "Hình tia chớp nhỏ: y hệt công thức Sune nhưng thay R đầu và R' cuối bằng 2 tầng r và r'!",
  },
  {
    id: "oll-08",
    stage: "OLL",
    code: "OLL 08",
    name: "Left Wide Sune (Tia chớp nhỏ trái)",
    group: "Full OLL • Cá & Tia chớp",
    formula: "(l' U' L U') (L' U2 l)",
    altFormula: "R U2 R' U2 R' F R F'",
    recognition:
      "Đối xứng của OLL 07 (tia chớp bên trái).",
  },
  {
    id: "oll-31",
    stage: "OLL",
    code: "OLL 31",
    name: "P-Shape (Chữ P phải)",
    group: "Full OLL • Chữ P & Chữ W",
    formula: "(R' U') F (U R U' R') F' R",
    recognition:
      "Hình chữ P trên mặt U với vạch dọc vàng ở bên phải.",
  },
  {
    id: "oll-32",
    stage: "OLL",
    code: "OLL 32",
    name: "P-Shape (Chữ P trái)",
    group: "Full OLL • Chữ P & Chữ W",
    formula: "S (R U R' U') (R' F R f')",
    altFormula: "L U F' U' L' U L F L'",
    recognition:
      "Hình chữ P với vạch dọc vàng bên trái: fingertrick S-slice siêu nhanh của cao thủ.",
  },
  {
    id: "oll-36",
    stage: "OLL",
    code: "OLL 36",
    name: "W-Shape (Chữ W trái)",
    group: "Full OLL • Chữ P & Chữ W",
    formula: "(L' U' L U') (L' U L U) (L F' L' F)",
    altFormula: "(R' U' R U') (R' U R U) (l U' R' U x)",
    recognition:
      "Hình bậc thang chữ W bậc về bên trái.",
  },
  {
    id: "oll-38",
    stage: "OLL",
    code: "OLL 38",
    name: "W-Shape (Chữ W phải)",
    group: "Full OLL • Chữ P & Chữ W",
    formula: "(R U R' U) (R U' R' U') (R' F R F')",
    recognition:
      "Hình bậc thang chữ W phải — chảy ngón cực êm bằng R-U kết thúc Sledgehammer.",
  },
  {
    id: "oll-01",
    stage: "OLL",
    code: "OLL 01",
    name: "Runway Dot (Chấm đơn 2 thanh vàng 2 bên)",
    group: "Full OLL • Nhóm Dot nâng cao",
    formula: "(R U2) (R2 F R F') U2 (R' F R F')",
    recognition:
      "Chỉ 1 chấm tâm vàng trên U và hai bên Trái–Phải có nguyên dải 3 ô vàng.",
  },

  // ============================================================================
  // 4. PLL - PERMUTATION OF THE LAST LAYER (ALL 21/21 OFFICIAL CASES!)
  // ============================================================================
  // --- Edges Only (4/4) ---
  {
    id: "pll-ua",
    stage: "PLL",
    code: "PLL - Ua",
    name: "Ua Perm (Đổi 3 cạnh ngược chiều KĐH)",
    group: "Hoán vị Cạnh (EPLL)",
    formula: "(R U' R U) (R U) (R U' R' U') R2",
    altFormula: "M2 U M U2 M' U M2",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Mặt Sau đã hoàn thiện nguyên thanh màu, 3 cạnh còn lại xoay vòng ngược chiều kim đồng hồ.",
  },
  {
    id: "pll-ub",
    stage: "PLL",
    code: "PLL - Ub",
    name: "Ub Perm (Đổi 3 cạnh cùng chiều KĐH)",
    group: "Hoán vị Cạnh (EPLL)",
    formula: "R2 U (R U R' U') R' U' (R' U R')",
    altFormula: "M2 U' M U2 M' U' M2",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Mặt Sau đã hoàn thiện nguyên thanh màu, 3 cạnh còn lại xoay vòng cùng chiều kim đồng hồ.",
  },
  {
    id: "pll-h",
    stage: "PLL",
    code: "PLL - H",
    name: "H Perm (Đổi chéo 2 cặp cạnh đối diện)",
    group: "Hoán vị Cạnh (EPLL)",
    formula: "M2 U M2 U2 M2 U M2",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Cả 4 mặt xung quanh đều có đèn pha cùng màu, viên cạnh ở giữa mang màu đối diện của mặt đó.",
  },
  {
    id: "pll-z",
    stage: "PLL",
    code: "PLL - Z",
    name: "Z Perm (Đổi 2 cặp cạnh kề nhau)",
    group: "Hoán vị Cạnh (EPLL)",
    formula: "M' U (M2 U M2 U) M' U2 M2",
    altFormula: "M2 U M2 U M' U2 M2 U2 M'",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 2] Cả 4 góc đã đúng, đổi chỗ cặp cạnh Trước–Phải và Sau–Trái (tạo họa tiết xen kẽ caro 2 màu).",
  },

  // --- Adjacent Corner Swaps (12/12) ---
  {
    id: "pll-t",
    stage: "PLL",
    code: "PLL - T",
    name: "T Perm (Hoán vị hình chữ T)",
    group: "Hoán vị Góc kề",
    formula: "(R U R' U') R' F R2 U' R' U' (R U R' F')",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 1 - Góc kề] Công thức PLL nổi tiếng và sướng tay nhất! Đặt cặp đèn pha (Headlights) sang bên Trái: đổi 2 góc bên Phải và 2 cạnh Trái–Phải.",
  },
  {
    id: "pll-jb",
    stage: "PLL",
    code: "PLL - Jb",
    name: "Jb Perm (Chữ J phải siêu tốc)",
    group: "Hoán vị Góc kề",
    formula: "(R U R' F') (R U R' U') R' F R2 U' R'",
    recognition:
      "Có nguyên thanh 3 ô đã giải ở bên Trái: một trong những PLL nhanh nhất thế giới (thường dưới 0.9s)!",
  },
  {
    id: "pll-ja",
    stage: "PLL",
    code: "PLL - Ja",
    name: "Ja Perm (Chữ J trái)",
    group: "Hoán vị Góc kề",
    formula: "(x R2 F R F' R U2 r' U r U2 x')",
    altFormula: "(L' U' L F) (L' U' L U) L F' L2 U L",
    recognition:
      "Có nguyên thanh 3 ô đã giải ở mặt Sau (với công thức x R2...) hoặc bên Phải (với công thức L').",
  },
  {
    id: "pll-aa",
    stage: "PLL",
    code: "PLL - Aa",
    name: "Aa Perm (Xoay 3 góc cùng chiều KĐH)",
    group: "Hoán vị 3 Góc (A-Perm)",
    formula: "x (R' U R') D2 (R U' R') D2 R2 x'",
    recognition:
      "Tất cả cạnh đã đúng, khối 2x2 đã giải đặt ở Sau-Trái, đèn pha chiếu về mặt Trước.",
  },
  {
    id: "pll-ab",
    stage: "PLL",
    code: "PLL - Ab",
    name: "Ab Perm (Xoay 3 góc ngược chiều KĐH)",
    group: "Hoán vị 3 Góc (A-Perm)",
    formula: "x R2 D2 (R U R') D2 (R U' R) x'",
    recognition:
      "Khối 2x2 đã giải ở Sau-Trái, đèn pha chiếu sang bên Phải.",
  },
  {
    id: "pll-f",
    stage: "PLL",
    code: "PLL - F",
    name: "F Perm (Thanh dài 3 ô bên Trái)",
    group: "Hoán vị Góc kề",
    formula: "(R' U' F') (R U R' U') R' F R2 U' R' U' (R U R' U) R",
    recognition:
      "Một thanh 3 ô hoàn chỉnh đặt bên Trái, 3 mặt còn lại không có đèn pha (chính là R' U' F' + T Perm + U R!).",
  },
  {
    id: "pll-ra",
    stage: "PLL",
    code: "PLL - Ra",
    name: "Ra Perm (Đèn pha trái + Block trước)",
    group: "Hoán vị Góc kề",
    formula: "(R U' R' U') (R U R D) (R' U' R D') (R' U2 R')",
    recognition:
      "Đèn pha nằm bên Trái kèm khối 2 ô liền nhau ở mặt Trước-Trái.",
  },
  {
    id: "pll-rb",
    stage: "PLL",
    code: "PLL - Rb",
    name: "Rb Perm (Đèn pha trước + Block phải)",
    group: "Hoán vị Góc kề",
    formula: "(R' U2 R U2) R' F (R U R' U') R' F' R2",
    recognition:
      "Đèn pha hướng ra mặt Trước kèm khối 2 ô ở Trước-Phải.",
  },
  {
    id: "pll-ga",
    stage: "PLL",
    code: "PLL - Ga",
    name: "Ga Perm (Nhóm G-Perm 1)",
    group: "Nhóm G-Perm (Góc + Cạnh)",
    formula: "R2 U (R' U R' U') (R U' R2) D U' (R' U R D')",
    recognition:
      "Đèn pha đặt bên Trái, khối 2 ô nằm ở mặt Trước-Phải.",
  },
  {
    id: "pll-gb",
    stage: "PLL",
    code: "PLL - Gb",
    name: "Gb Perm (Nhóm G-Perm 2)",
    group: "Nhóm G-Perm (Góc + Cạnh)",
    formula: "(R' U' R) U D' (R2 U R' U) (R U' R U') R2 D",
    recognition:
      "Đèn pha đặt bên Trái, khối 2 ô nằm ở mặt Sau-Phải.",
  },
  {
    id: "pll-gc",
    stage: "PLL",
    code: "PLL - Gc",
    name: "Gc Perm (Nhóm G-Perm 3)",
    group: "Nhóm G-Perm (Góc + Cạnh)",
    formula: "R2 U' (R U' R U) (R' U R2) D' U (R U' R' D)",
    recognition:
      "Đèn pha đặt bên Trái, khối 2 ô nằm ở mặt Sau-Trái.",
  },
  {
    id: "pll-gd",
    stage: "PLL",
    code: "PLL - Gd",
    name: "Gd Perm (Nhóm G-Perm 4)",
    group: "Nhóm G-Perm (Góc + Cạnh)",
    formula: "(R U R') U' D (R2 U' R U') (R' U R' U) R2 D'",
    recognition:
      "Đèn pha đặt bên Trái, khối 2 ô nằm ở mặt Trước-Trái (ngoài vùng đèn pha).",
  },

  // --- Diagonal Corner Swaps (5/5) ---
  {
    id: "pll-y",
    stage: "PLL",
    code: "PLL - Y",
    name: "Y Perm (Đổi 2 góc chéo nhau)",
    group: "Hoán vị Góc chéo",
    formula: "F (R U' R' U') (R U R' F') (R U R' U') (R' F R F')",
    isTwoLook: true,
    recognition:
      "[2-Look Bước 1 - Góc chéo] Không có bất kỳ cặp đèn pha nào ở cả 4 mặt! Có 2 khối 2 ô chạm nhau ở góc Trước-Trái (ghép từ OLL 37 + OLL 33).",
  },
  {
    id: "pll-v",
    stage: "PLL",
    code: "PLL - V",
    name: "V Perm (Khối 2x2 góc Trước-Trái)",
    group: "Hoán vị Góc chéo",
    formula: "(R' U R' U') y (R' F' R2 U') (R' U R' F) R F",
    recognition:
      "Không có đèn pha, có nguyên khối 2x2 hoàn chỉnh đặt ở góc Trước-Trái.",
  },
  {
    id: "pll-e",
    stage: "PLL",
    code: "PLL - E",
    name: "E Perm (Đổi 2 cặp góc, không khối liền)",
    group: "Hoán vị Góc chéo",
    formula: "x' (R U' R' D) (R U R' D') (R U R' D) (R U' R' D') x",
    recognition:
      "Cả 4 cạnh đã đúng tâm nhưng không có đèn pha cũng không có khối 2 ô nào: đặt màu mặt Trước của góc Trước-Phải trùng màu tâm Phải.",
  },
  {
    id: "pll-na",
    stage: "PLL",
    code: "PLL - Na",
    name: "Na Perm (Khối 2 ô bên trái mỗi mặt)",
    group: "Hoán vị Góc chéo",
    formula: "(R U R' U) (R U R' F') (R U R' U') R' F R2 U' R' U2 (R U' R')",
    recognition:
      "Bốn mặt đều có khối 2 ô nằm lệch về bên phải khi nhìn đối diện (R U R' U + Jb Perm + U2 R U' R'!).",
  },
  {
    id: "pll-nb",
    stage: "PLL",
    code: "PLL - Nb",
    name: "Nb Perm (Đối xứng của Na Perm)",
    group: "Hoán vị Góc chéo",
    formula: "(R' U R U') (R' F' U' F) (R U R' F) R' F' (R U' R)",
    altFormula: "(r' D' F r U' r' F' D r2 U r' U' r' F r F')",
    recognition:
      "Bốn mặt đều có khối 2 ô nằm lệch về bên trái khi nhìn đối diện.",
  },
  // --- Additional Advanced F2L & OLL Cases for Full Mastery ---
  {
    id: "f2l-19",
    stage: "F2L",
    code: "F2L 19",
    name: "Keyhole / Chèn khe Sau-Phải (BR) không xoay khối",
    group: "F2L Không xoay khối (Back Slot)",
    formula: "U' (R' U R)",
    altFormula: "R' U2 R U R' U' R",
    recognition:
      "Tận dụng khe Sau-Phải (BR) để đẩy các cặp đã ghép về phía sau, nhường 2 khe mặt Trước cho khả năng nhìn Lookahead tối đa.",
  },
  {
    id: "f2l-20",
    stage: "F2L",
    code: "F2L 20",
    name: "Góc ngửa trắng, Cạnh nằm ngược trong khe FR",
    group: "Viên nằm sẵn trong khe",
    formula: "(R U' R' U') (R U R' U2) (R U' R')",
    altFormula: "F' L' U2 L F (R U R')",
    recognition:
      "Góc ở FRU ngửa mặt trắng lên trời, viên cạnh đã nằm trong khe FR nhưng bị ngược màu mặt trước-phải.",
  },
  {
    id: "f2l-21",
    stage: "F2L",
    code: "F2L 21",
    name: "Cả Góc và Cạnh nằm đúng chiều nhưng lệch pha",
    group: "Cả hai nằm trong khe",
    formula: "(R U' R' U) (R U2 R' U) (R U' R')",
    recognition:
      "Góc ở dưới đáy khe FR (trắng sang phải), cạnh nằm đúng chiều bên trên: nhấc ra tách cặp rồi ghép lại trong 1 chuỗi R-U duy nhất.",
  },
  {
    id: "oll-09",
    stage: "OLL",
    code: "OLL 09",
    name: "Kite / Con diều (Cá nhỏ kèm góc đối)",
    group: "Full OLL • Cá & Tia chớp",
    formula: "(R U R' U') R' F (R2 U R' U') F'",
    recognition:
      "Hình con cá nhỏ trên mặt U nhưng các mặt bên có thanh đèn pha không đối xứng: cực kỳ phổ biến và chảy tay mượt với R2 U R' U' F'.",
  },
  {
    id: "oll-10",
    stage: "OLL",
    code: "OLL 10",
    name: "Anti-Kite (Con diều trái)",
    group: "Full OLL • Cá & Tia chớp",
    formula: "(R U R' U) (R' F R F') (R U2 R')",
    recognition:
      "Ghép trực tiếp 3 nhịp: Mở R U R' U + Sledgehammer + Đóng R U2 R'!",
  },
  {
    id: "oll-13",
    stage: "OLL",
    code: "OLL 13",
    name: "Knight Move (Nước đi Quân Mã phải)",
    group: "Full OLL • Chữ L & Quân Mã",
    formula: "F (U R U' R2) F' (R U R U' R')",
    altFormula: "(r U' r' U' r U r') (F' U F)",
    recognition:
      "Vạch ngang 3 ô vàng nối thêm 1 ô góc tạo hình chữ L dài (nước nhảy quân mã cờ vua).",
  },
  {
    id: "oll-14",
    stage: "OLL",
    code: "OLL 14",
    name: "Knight Move (Nước đi Quân Mã trái)",
    group: "Full OLL • Chữ L & Quân Mã",
    formula: "(R' F R) (U R' F' R) (F U' F')",
    recognition:
      "Đối xứng của OLL 13: vạch chữ L quân mã quay về bên trái.",
  },
  {
    id: "oll-35",
    stage: "OLL",
    code: "OLL 35",
    name: "Fish Salad (Con cá chéo góc)",
    group: "Full OLL • Cá & Tia chớp",
    formula: "(R U2) (R2 F R F') (R U2 R')",
    recognition:
      "Hai góc chéo nhau và hai cạnh kề nhau đã lật vàng: chèn Sledgehammer ngay giữa hai nhịp R U2!",
  },
  {
    id: "oll-43",
    stage: "OLL",
    code: "OLL 43",
    name: "Anti-P (Chữ P ngược siêu tốc)",
    group: "Full OLL • Chữ P & Chữ W",
    formula: "f' (L' U' L U) f",
    altFormula: "R' U' F' U F R",
    recognition:
      "Hình chữ P với khối vàng nằm bên phải: dùng R' U' F' U F R không cần đổi tay cầm!",
  },
  {
    id: "oll-48",
    stage: "OLL",
    code: "OLL 48",
    name: "Breakneck L-Shape (Góc L nhỏ x2 Sexy)",
    group: "Full OLL • Chữ L & Quân Mã",
    formula: "F (R U R' U') (R U R' U') F'",
    recognition:
      "Y hệt công thức OLL 45 tạo dấu cộng nhưng lặp 2 lần Sexy Move ở giữa (F + Double Sexy + F')!",
  },
];

// ============================================================================
// CFOP Learning Path Tiers, Variant Comparison, SM-2 SRS & Adaptive Selector
// ============================================================================

export const CFOP_LEARNING_PATH_TIERS: {
  tier: CfopLearningTier;
  title: string;
  targetBadge: string;
  description: string;
}[] = [
  {
    tier: 1,
    title: "Chặng 1: Nền tảng & 2-Look CFOP",
    targetBadge: "Mục tiêu: Sub-35s",
    description:
      "Làm chủ các Trigger nền tảng, F2L cơ bản tầng trên, 10 bài 2-Look OLL và 6 bài 2-Look PLL để giải hoàn chỉnh không bao giờ bị tắc.",
  },
  {
    tier: 2,
    title: "Chặng 2: F2L Toàn diện & Tách cặp trong khe",
    targetBadge: "Mục tiêu: Sub-22s",
    description:
      "Xử lý mượt mọi tình huống góc/cạnh dính sai hoặc kẹt sẵn dưới khe F2L mà không cần xoay khối Rubik liên tục.",
  },
  {
    tier: 3,
    title: "Chặng 3: Chinh phục Full PLL (21/21)",
    targetBadge: "Mục tiêu: Sub-16s",
    description:
      "Học thuộc toàn bộ 21 trường hợp hoán vị tầng cuối (T, J, A, F, R, V, E, N và bộ tứ G-Perm) để hoàn thiện khối Rubik trong 1 bước nhìn.",
  },
  {
    tier: 4,
    title: "Chặng 4: Full OLL 1-Look Tốc độ cao",
    targetBadge: "Mục tiêu: Sub-12s",
    description:
      "Định hướng mặt vàng chỉ trong 1 công thức duy nhất với các nhóm Chữ T, Ô vuông, Tia chớp, Chữ P/W, Quân Mã và Dot.",
  },
];

export function getAlgLearningTier(alg: CfopAlgorithm): CfopLearningTier {
  if (alg.isTwoLook || alg.stage === "CROSS") return 1;
  if (alg.stage === "F2L") return 2;
  if (alg.stage === "PLL") return 3;
  return 4;
}

/**
 * Compares primary, alternative, and custom formulas for an algorithm (STM move count, fingertrick family).
 */
export function getAlgorithmVariants(
  alg: CfopAlgorithm,
  customFormula?: string
): AlgorithmVariantComparison[] {
  const classifyStyle = (f: string): { tag: string; ergo: string } => {
    if (/\bM['2]?/.test(f)) {
      return {
        tag: "M-Slice (<M, U>)",
        ergo: "Tốc độ TPS cực cao với ngón áp út + ngón giữa gẩy M; rất ít xoay cổ tay.",
      };
    }
    if (/\b[rlfb]['2]?/.test(f)) {
      return {
        tag: "Wide-Turn (<r, U, R>)",
        ergo: "Xoay 2 tầng mượt mà, thay thế các nước F/B khó gẩy bằng chuyển động cổ tay R-U.",
      };
    }
    if (!/\b[FBxyzD]['2]?/.test(f)) {
      return {
        tag: "2-Gen (<R, U>)",
        ergo: "Thuần 2 mặt Phải-Trên (2-Gen): không bao giờ cần đổi thế cầm (zero regrip), tối ưu cho cả giải 1 tay (OH).",
      };
    }
    return {
      tag: "Standard WCA",
      ergo: "Kết hợp Trigger R-U với Sledgehammer/D-move cân bằng cho hai tay.",
    };
  };

  const list: AlgorithmVariantComparison[] = [];
  const s1 = classifyStyle(alg.formula);
  list.push({
    label: "Công thức chuẩn #1",
    formula: alg.formula,
    stmMoves: countAlgMoves(alg.formula),
    styleTag: s1.tag,
    ergonomics: s1.ergo,
  });

  if (alg.altFormula) {
    const s2 = classifyStyle(alg.altFormula);
    list.push({
      label: "Biến thể #2 (Alt)",
      formula: alg.altFormula,
      stmMoves: countAlgMoves(alg.altFormula),
      styleTag: s2.tag,
      ergonomics: s2.ergo,
    });
  }

  if (
    customFormula &&
    customFormula.trim() &&
    customFormula.trim() !== alg.formula &&
    customFormula.trim() !== alg.altFormula
  ) {
    const sc = classifyStyle(customFormula);
    list.push({
      label: "Công thức cá nhân",
      formula: customFormula.trim(),
      stmMoves: countAlgMoves(customFormula),
      styleTag: sc.tag,
      ergonomics: sc.ergo,
    });
  }

  return list;
}

/**
 * SuperMemo SM-2 Spaced Repetition Scheduler for CFOP Algorithms.
 * qualityGrade: 1 (Quên / DNF), 2 (Khó / Chậm), 4 (Tốt / Chuẩn), 5 (Hoàn hảo / Nhớ phản xạ)
 */
export function computeNextSm2Progress(
  algId: string,
  current: CfopProgressItem | undefined,
  qualityGrade: 1 | 2 | 4 | 5,
  preferredFormula?: string
): CfopProgressItem {
  const now = new Date();
  let ease = current?.ease_factor ?? 2.5;
  let reps = current?.repetitions ?? 0;
  let interval = current?.interval_days ?? 0;

  if (qualityGrade < 3) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 3;
    } else {
      interval = Math.min(60, Math.round(interval * ease));
    }
    reps += 1;
  }

  ease = Math.max(
    1.3,
    Number(
      (
        ease +
        (0.1 - (5 - qualityGrade) * (0.08 + (5 - qualityGrade) * 0.02))
      ).toFixed(2)
    )
  );

  const status: CfopMasteryStatus =
    qualityGrade === 1
      ? "learning"
      : reps >= 4 && qualityGrade >= 4
      ? "mastered"
      : reps >= 1
      ? "learned"
      : "learning";

  const nextDate = new Date(now.getTime() + interval * 86400 * 1000);

  return {
    alg_id: algId,
    status,
    preferred_formula: preferredFormula ?? current?.preferred_formula,
    ease_factor: ease,
    interval_days: interval,
    repetitions: reps,
    next_review_at: nextDate.toISOString(),
    last_drilled_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

export function isCfopDueForReview(item?: CfopProgressItem): boolean {
  if (!item || item.status === "unlearned") return false;
  const dueMs = new Date(item.next_review_at).getTime();
  return !Number.isNaN(dueMs) && dueMs <= Date.now();
}

/**
 * Adaptive Case Selector: Picks the next CFOP case to drill based on SRS due date,
 * weakness score (high Ao5 relative to STM move count), and low repetition count.
 */
export function selectAdaptiveCfopCase(
  candidates: CfopAlgorithm[],
  statsMap: Map<string, { summary: StatSummary }>,
  progressMap: Record<string, CfopProgressItem>,
  lastPickedId?: string
): {
  alg: CfopAlgorithm;
  reason: string;
  randomAuf: "" | "U" | "U'" | "U2";
} {
  const pool =
    candidates.length > 1
      ? candidates.filter((c) => c.id !== lastPickedId)
      : candidates;

  const scored = pool.map((alg) => {
    const sName = getCfopSessionName(alg);
    const st = statsMap.get(sName)?.summary;
    const prog = progressMap[alg.id];
    const formula = prog?.preferred_formula || alg.formula;
    const moves = Math.max(4, countAlgMoves(formula));
    const targetMs = moves * 170; // ~5.8 TPS benchmark

    let weight = 10;
    let reason = "Ôn tập ngẫu nhiên củng cố phản xạ";

    if (isCfopDueForReview(prog)) {
      weight += 45;
      reason = "Đến hạn ôn tập ngắt quãng (SRS Due)";
    } else if (!st || st.totalCount < 3) {
      weight += 30;
      reason = "Cần thêm dữ liệu bấm giờ (< 3 lượt)";
    } else {
      const refTime =
        typeof st.currentAo5 === "number"
          ? st.currentAo5
          : st.mean ?? targetMs;
      if (refTime > targetMs * 1.25) {
        weight += 35;
        reason = "Tốc độ thực hiện còn chậm so với số nước STM";
      }
      if (st.dnfCount > 0) {
        weight += 20;
        reason = "Từng gặp lỗi DNF / quên công thức";
      }
    }

    // Add controlled randomness so user doesn't get the exact same card deterministically
    const jitter = Math.random() * 18;
    return { alg, score: weight + jitter, reason };
  });

  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0] || {
    alg: CFOP_ALGORITHMS[0],
    reason: "Luyện tập chuẩn",
  };
  const aufs: ("" | "U" | "U'" | "U2")[] = ["", "U", "U'", "U2"];
  const randomAuf = aufs[Math.floor(Math.random() * aufs.length)];

  return {
    alg: chosen.alg,
    reason: chosen.reason,
    randomAuf,
  };
}

