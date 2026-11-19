import {
  CFOP_ALGORITHMS,
  CfopAlgorithm,
  getAlgLearningTier,
  getAlgorithmVariants,
  getCfopSessionName,
  isCfopDueForReview,
} from "@/lib/cfop";
import { MIN_SPLIT_DIAGNOSTIC_SAMPLES } from "@/lib/core/workout";
import { countAlgMoves, extractAlgorithmTriggers } from "@/lib/scrambles";
import {
  calculateSessionStats,
  computeConsistencyAndSubX,
  computeSplitBreakdown,
  computeStreakAndHeatmap,
  computeWeeklyComparison,
  formatTimeMs,
} from "@/lib/stats";
import {
  CfopProgressItem,
  CubeSession,
  Solve,
  SplitStageBreakdown,
} from "@/types/cubing";

export interface WeakAlgorithmDiagnostic {
  alg: CfopAlgorithm;
  solveCount: number;
  bestMs: number | null;
  ao5Ms: number | null;
  meanMs: number;
  estimatedTps: number;
  issueSummary: string;
}

export interface PracticeRecommendation {
  id: string;
  title: string;
  durationMinutes: number;
  reason: string;
  actionType:
    | "DRILL_ALG"
    | "ADAPTIVE_CFOP"
    | "SPLIT_TIMER"
    | "CROSS_TRAINER"
    | "COMPETITION_SIM"
    | "GUIDED_F2L_WORKOUT";
  targetAlg?: CfopAlgorithm;
  badgeText: string;
}

export interface DeterministicCoachReport {
  generatedAt: string;
  cuberTierLabel: string;
  nextMilestoneMs: number;
  active3x3Summary: {
    totalSolves: number;
    meanMs: number | null;
    bestSingleMs: number | null;
    currentAo5Ms: number | "DNF" | null;
    currentAo12Ms: number | "DNF" | null;
    stdDevMs: number | null;
    consistencyScore: number | null;
    cleanRatePct: number | null;
    plusTwoRatePct: number;
    dnfRatePct: number;
  };
  splitSampleCount: number;
  minSplitDiagnosticSamples: number;
  hasEnoughSplitSamples: boolean;
  splitBreakdown: SplitStageBreakdown | null;
  weakestAlgorithms: WeakAlgorithmDiagnostic[];
  dueReviewAlgorithms: CfopAlgorithm[];
  recommendedNextToLearn: CfopAlgorithm[];
  weeklyComparison: ReturnType<typeof computeWeeklyComparison>;
  streakInfo: {
    currentStreak: number;
    longestStreak: number;
    todayCount: number;
  };
  headlineDiagnosis: string;
  keyFindings: string[];
  practicePlan: PracticeRecommendation[];
}

/**
 * Runs 100% deterministic mathematical analysis over the user's solve history,
 * CFOP algorithm sessions, 4-stage splits, and SRS progress.
 */
export function buildDeterministicCoachReport(
  sessions: CubeSession[],
  solves: Solve[],
  cfopProgress: Record<string, CfopProgressItem>
): DeterministicCoachReport {
  // 1. Separate main 3x3 solves from dedicated CFOP Drill sessions
  const cfopSessionNames = new Set(
    CFOP_ALGORITHMS.map((a) => getCfopSessionName(a))
  );
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const main3x3Solves = solves
    .filter((sv) => {
      const sess = sessionById.get(sv.session_id);
      return (
        sv.puzzle === "3x3" && (!sess || !cfopSessionNames.has(sess.name))
      );
    })
    .sort(
      (a, b) =>
        new Date(a.solved_at).getTime() - new Date(b.solved_at).getTime()
    );

  const mainStats = calculateSessionStats(main3x3Solves).summary;
  const refMs =
    typeof mainStats.currentAo12 === "number"
      ? mainStats.currentAo12
      : mainStats.mean ?? 25000;

  // Determine Cuber Tier & Next Milestone
  let cuberTierLabel = "Beginner (Sub-45)";
  let nextMilestoneMs = 30000;
  let recommendedTier: 1 | 2 | 3 | 4 = 1;

  if (refMs < 10000) {
    cuberTierLabel = "Master Class (Sub-10)";
    nextMilestoneMs = 8500;
    recommendedTier = 4;
  } else if (refMs < 12000) {
    cuberTierLabel = "Advanced Speedcuber (Sub-12)";
    nextMilestoneMs = 10000;
    recommendedTier = 4;
  } else if (refMs < 15000) {
    cuberTierLabel = "Competitive Cuber (Sub-15)";
    nextMilestoneMs = 12000;
    recommendedTier = 4;
  } else if (refMs < 20000) {
    cuberTierLabel = "Intermediate CFOP (Sub-20)";
    nextMilestoneMs = 15000;
    recommendedTier = 3;
  } else if (refMs < 30000) {
    cuberTierLabel = "Developing Cuber (Sub-30)";
    nextMilestoneMs = 20000;
    recommendedTier = 2;
  }

  const consistency = computeConsistencyAndSubX(main3x3Solves, nextMilestoneMs);
  const plusTwoCount = main3x3Solves.filter((s) => s.penalty === "+2").length;
  const plusTwoRatePct =
    main3x3Solves.length > 0
      ? Math.round((plusTwoCount / main3x3Solves.length) * 100)
      : 0;
  const dnfRatePct =
    main3x3Solves.length > 0
      ? Math.round((mainStats.dnfCount / main3x3Solves.length) * 100)
      : 0;

  // 2. Analyze 4-stage CFOP Splits if present
  const splitBreakdown = computeSplitBreakdown(main3x3Solves);
  const splitSampleCount = splitBreakdown?.sampleCount ?? 0;
  const hasEnoughSplitSamples = splitSampleCount >= MIN_SPLIT_DIAGNOSTIC_SAMPLES;

  const drillSessionIds = new Set(
    sessions.filter((s) => cfopSessionNames.has(s.name)).map((s) => s.id)
  );

  // 3. Analyze dedicated CFOP Algorithm Drill Sessions to find weakest algorithms
  const sessionByName = new Map(sessions.map((s) => [s.name, s]));
  const weakestAlgorithms: WeakAlgorithmDiagnostic[] = [];

  for (const alg of CFOP_ALGORITHMS) {
    const sName = getCfopSessionName(alg);
    const sess = sessionByName.get(sName);
    if (!sess) continue;
    const algSolves = solves
      .filter((sv) => sv.session_id === sess.id)
      .sort(
        (a, b) =>
          new Date(a.solved_at).getTime() - new Date(b.solved_at).getTime()
      );
    if (algSolves.length === 0) continue;

    const st = calculateSessionStats(algSolves).summary;
    if (!st.mean) continue;

    const formula = cfopProgress[alg.id]?.preferred_formula || alg.formula;
    const moves = Math.max(4, countAlgMoves(formula));
    const refAlgMs =
      typeof st.currentAo5 === "number" ? st.currentAo5 : st.mean;
    const tps = Number((moves / (refAlgMs / 1000)).toFixed(2));

    let issueSummary = "Tốc độ ổn định";
    if (tps < 4.2) {
      issueSummary = `TPS thấp (${tps} TPS cho ${moves} nước) — cần tối ưu Fingertrick không đổi thế cầm`;
    } else if (st.dnfCount > 0) {
      issueSummary = `Có ${st.dnfCount} lượt DNF — trí nhớ cơ bắp chưa vững khi tăng tốc`;
    } else if (st.stdDev && st.stdDev > 450) {
      issueSummary = `Độ lệch lớn (σ = ${formatTimeMs(st.stdDev)}) — đôi khi bị khựng ở nhịp chuyển Trigger`;
    }

    weakestAlgorithms.push({
      alg,
      solveCount: st.totalCount,
      bestMs: st.bestSingle,
      ao5Ms: typeof st.currentAo5 === "number" ? st.currentAo5 : null,
      meanMs: st.mean,
      estimatedTps: tps,
      issueSummary,
    });
  }

  // Sort weakest first (lowest TPS or highest meanMs)
  weakestAlgorithms.sort((a, b) => a.estimatedTps - b.estimatedTps);
  const topWeakAlgs = weakestAlgorithms.slice(0, 5);

  // 4. Identify due SRS reviews & next high-impact unlearned algorithms
  const dueReviewAlgorithms = CFOP_ALGORITHMS.filter((a) =>
    isCfopDueForReview(cfopProgress[a.id])
  );

  const recommendedNextToLearn = CFOP_ALGORITHMS.filter((a) => {
    const p = cfopProgress[a.id];
    const isLearned = p && (p.status === "learned" || p.status === "mastered");
    if (isLearned) return false;
    return getAlgLearningTier(a) <= recommendedTier;
  }).slice(0, 4);

  // 5. Weekly & Streak metrics (Monday-start week, device timezone; drill sessions excluded from weekly speed stats)
  const weeklyComparison = computeWeeklyComparison(solves, { drillSessionIds });
  const streakFull = computeStreakAndHeatmap(solves);

  // 6. Build deterministic headline & key findings
  const keyFindings: string[] = [];

  if (main3x3Solves.length === 0) {
    keyFindings.push(
      "Chưa có dữ liệu giải 3x3 trên Bàn Timer chính. Hãy giải ít nhất 5–12 lượt để hệ thống đo chính xác Ao5, Ao12 và độ ổn định (σ)."
    );
  } else {
    keyFindings.push(
      `Trình độ hiện tại: ${cuberTierLabel} với trung bình ${formatTimeMs(
        refMs
      )} và kỷ lục PB ${formatTimeMs(mainStats.bestSingle)}. Mục tiêu kế tiếp là chinh phục mốc Sub-${
        nextMilestoneMs / 1000
      }s.`
    );
  }

  if (splitBreakdown && hasEnoughSplitSamples) {
    const worstStage = [...splitBreakdown.stages].sort(
      (a, b) => b.deltaPct - a.deltaPct
    )[0];
    if (worstStage && worstStage.deltaPct >= 3) {
      keyFindings.push(
        `Phân tích Split Timer (${splitSampleCount} lượt): Giai đoạn "${worstStage.label}" đang chiếm ${worstStage.actualPct}% tổng thời gian (${formatTimeMs(
          worstStage.avgMs
        )}), cao hơn mức chuẩn lý tưởng (${worstStage.idealPct}%) là +${
          worstStage.deltaPct
        }%. Đây là điểm nghẽn đáng ưu tiên cải thiện.`
      );
    } else {
      keyFindings.push(
        `Tỷ lệ 4 giai đoạn CFOP (${splitSampleCount} lượt) khá cân đối so với chuẩn WCA (Cross ${splitBreakdown.stages[0].actualPct}% • F2L ${splitBreakdown.stages[1].actualPct}% • OLL ${splitBreakdown.stages[2].actualPct}% • PLL ${splitBreakdown.stages[3].actualPct}%).`
      );
    }
  } else if (splitSampleCount > 0) {
    keyFindings.push(
      `Mới có ${splitSampleCount}/${MIN_SPLIT_DIAGNOSTIC_SAMPLES} lượt có Split Timer — chưa đủ mẫu để kết luận chắc chắn điểm nghẽn giai đoạn. Hãy bấm thêm ${
        MIN_SPLIT_DIAGNOSTIC_SAMPLES - splitSampleCount
      } lượt bật Split Timer để Coach phân tích chính xác.`
    );
  } else {
    keyFindings.push(
      `Chưa có lượt nào ghi Split Timer (0/${MIN_SPLIT_DIAGNOSTIC_SAMPLES}). Hãy bật 'Split Timer (4 pha CFOP)' trong Cài đặt và giải đủ ${MIN_SPLIT_DIAGNOSTIC_SAMPLES} lượt để đo chính xác tỷ lệ Cross / F2L / OLL / PLL.`
    );
  }

  if (topWeakAlgs.length > 0) {
    const w0 = topWeakAlgs[0];
    keyFindings.push(
      `Trong các công thức đã luyện bấm giờ, "${w0.alg.code} (${w0.alg.name})" đang có tốc độ thấp nhất (${formatTimeMs(
        w0.meanMs
      )} • ${w0.estimatedTps} TPS). Cải thiện bài này lên >6.0 TPS sẽ giúp bạn tiết kiệm ngay ~0.8s mỗi khi gặp.`
    );
  }

  if (plusTwoRatePct >= 8 || dnfRatePct >= 5) {
    keyFindings.push(
      `Tỷ lệ bị phạt của bạn đang ở mức chú ý (+2: ${plusTwoRatePct}%, DNF: ${dnfRatePct}%). Cần kiểm soát tốt hơn nhịp dừng đồng hồ và bước căn chỉnh tầng cuối (AUF).`
    );
  }

  // 7. Build Actionable Practice Plan (3 concrete drills)
  const practicePlan: PracticeRecommendation[] = [];

  if (dueReviewAlgorithms.length > 0) {
    practicePlan.push({
      id: "plan-srs-due",
      title: `Ôn tập ngắt quãng ${dueReviewAlgorithms.length} công thức đến hạn (SRS)`,
      durationMinutes: 8,
      reason: `Các bài như ${dueReviewAlgorithms
        .slice(0, 3)
        .map((a) => a.code)
        .join(", ")} đã đến chu kỳ ôn tập SM-2 để chống quên.`,
      actionType: "ADAPTIVE_CFOP",
      targetAlg: dueReviewAlgorithms[0],
      badgeText: "Ưu tiên #1 • SRS Due",
    });
  } else if (topWeakAlgs.length > 0) {
    practicePlan.push({
      id: "plan-weak-alg",
      title: `Cải thiện tốc độ TPS cho ${topWeakAlgs[0].alg.code}: ${topWeakAlgs[0].alg.name}`,
      durationMinutes: 10,
      reason: topWeakAlgs[0].issueSummary,
      actionType: "DRILL_ALG",
      targetAlg: topWeakAlgs[0].alg,
      badgeText: `${topWeakAlgs[0].estimatedTps} TPS → Mục tiêu 6.0+ TPS`,
    });
  } else if (recommendedNextToLearn[0]) {
    practicePlan.push({
      id: "plan-learn-new",
      title: `Học công thức mới: ${recommendedNextToLearn[0].code} (${recommendedNextToLearn[0].name})`,
      durationMinutes: 10,
      reason: `Thuộc lộ trình Chặng ${recommendedTier} giúp giảm số bước nhìn tầng cuối.`,
      actionType: "DRILL_ALG",
      targetAlg: recommendedNextToLearn[0],
      badgeText: "Mở rộng vốn CFOP",
    });
  }

  practicePlan.push({
    id: "plan-cross-f2l",
    title: "Luyện lập kế hoạch Cross ≤ 7 nước & nối F2L #1",
    durationMinutes: 10,
    reason:
      splitBreakdown && splitBreakdown.stages[0].deltaPct > 2
        ? `Cross đang chiếm ${splitBreakdown.stages[0].actualPct}% tổng thời gian (mức chuẩn là 12%).`
        : "Rèn thói quen nhìn trọn vẹn 4 cạnh Cross trong 15s Inspection để dành 100% thị giác cho F2L.",
    actionType: "CROSS_TRAINER",
    badgeText: "Nền tảng Lookahead",
  });

  practicePlan.push({
    id: "plan-guided-f2l",
    title: "Bài tập đo kiểm F2L: 10 lượt F2L Only + 5 lượt Split đo lại",
    durationMinutes: 12,
    reason: hasEnoughSplitSamples && splitBreakdown
      ? `Dựa trên ${splitSampleCount} lượt có split gần đây (F2L đang ở ${splitBreakdown.stages[1].actualPct}%), bài tập này giúp luyện F2L tập trung rồi so sánh lại ngay với mốc ban đầu.`
      : `Chu trình chọn bài → luyện 10 lượt F2L Only → đo lại 5 lượt có Split để xây dựng mốc F2L chuẩn xác (hiện có ${splitSampleCount}/${MIN_SPLIT_DIAGNOSTIC_SAMPLES} lượt split).`,
    actionType: "GUIDED_F2L_WORKOUT",
    badgeText: "Đo trước & sau • MVP F2L",
  });

  practicePlan.push({
    id: "plan-split-or-comp",
    title: hasEnoughSplitSamples
      ? "Thi đấu mô phỏng 1 vòng WCA Ao5 (Kiểm tra tâm lý BPA/WPA)"
      : `Giải thêm ${Math.max(1, MIN_SPLIT_DIAGNOSTIC_SAMPLES - splitSampleCount)} lượt với Split Timer (${splitSampleCount}/${MIN_SPLIT_DIAGNOSTIC_SAMPLES})`,
    durationMinutes: 7,
    reason: hasEnoughSplitSamples
      ? `Vào thẳng vòng mô phỏng WCA Ao5 với scramble 3x3 chuẩn random-state để kiểm chứng phong độ dưới áp lực 15s Inspection.`
      : `Thu thập tối thiểu ${MIN_SPLIT_DIAGNOSTIC_SAMPLES} lượt có Split 4 pha CFOP giúp Coach nhận định điểm nghẽn đủ độ tin cậy.`,
    actionType: hasEnoughSplitSamples ? "COMPETITION_SIM" : "SPLIT_TIMER",
    badgeText: hasEnoughSplitSamples ? "Thực chiến WCA Ao5" : `Chẩn đoán 4 pha (${splitSampleCount}/${MIN_SPLIT_DIAGNOSTIC_SAMPLES})`,
  });

  const headlineDiagnosis =
    main3x3Solves.length === 0
      ? "Sẵn sàng chẩn đoán! Hãy thực hiện vài lượt giải hoặc bấm vào các bài tập CFOP bên dưới để bắt đầu."
      : splitBreakdown && hasEnoughSplitSamples
      ? `Phong độ ${cuberTierLabel} • Độ ổn định ${
          consistency.consistencyScore ?? 80
        }/100 (dựa trên ${splitSampleCount} lượt có split). Trọng tâm cải thiện: giai đoạn ${
          [...splitBreakdown.stages].sort((a, b) => b.deltaPct - a.deltaPct)[0]
            .label
        } và nâng TPS các bài ${
          topWeakAlgs[0]?.alg.code || "PLL"
        }.`
      : `Phong độ ${cuberTierLabel} (Mean: ${formatTimeMs(
          mainStats.mean
        )}, PB: ${formatTimeMs(
          mainStats.bestSingle
        )}). Đã có ${splitSampleCount}/${MIN_SPLIT_DIAGNOSTIC_SAMPLES} lượt Split Timer — hãy hoàn thành đủ mẫu để mở khóa chẩn đoán điểm nghẽn 4 pha!`;

  return {
    generatedAt: new Date().toISOString(),
    cuberTierLabel,
    nextMilestoneMs,
    active3x3Summary: {
      totalSolves: main3x3Solves.length,
      meanMs: mainStats.mean,
      bestSingleMs: mainStats.bestSingle,
      currentAo5Ms: mainStats.currentAo5,
      currentAo12Ms: mainStats.currentAo12,
      stdDevMs: mainStats.stdDev,
      consistencyScore: consistency.consistencyScore,
      cleanRatePct: consistency.cleanRatePct,
      plusTwoRatePct,
      dnfRatePct,
    },
    splitSampleCount,
    minSplitDiagnosticSamples: MIN_SPLIT_DIAGNOSTIC_SAMPLES,
    hasEnoughSplitSamples,
    splitBreakdown,
    weakestAlgorithms: topWeakAlgs,
    dueReviewAlgorithms,
    recommendedNextToLearn,
    weeklyComparison,
    streakInfo: {
      currentStreak: streakFull.currentStreak,
      longestStreak: streakFull.longestStreak,
      todayCount: streakFull.todayCount,
    },
    headlineDiagnosis,
    keyFindings,
    practicePlan,
  };
}

/**
 * Deterministic AI CFOP Tutor generator: produces structured trigger breakdown,
 * fingertrick execution coaching, and answers user questions about an algorithm.
 */
export function buildCfopTutorGuidance(
  alg: CfopAlgorithm,
  activeFormula?: string,
  userQuestion?: string
): {
  summary: string;
  triggers: ReturnType<typeof extractAlgorithmTriggers>;
  variants: ReturnType<typeof getAlgorithmVariants>;
  fingertrickCoach: string;
  recognitionTip: string;
  questionAnswer?: string;
} {
  const formula = activeFormula || alg.formula;
  const triggers = extractAlgorithmTriggers(formula);
  const variants = getAlgorithmVariants(alg, activeFormula);
  const stm = countAlgMoves(formula);

  const fingertrickCoach =
    formula.includes("M2") || formula.includes("M'")
      ? `Công thức này (${stm} STM) sử dụng trục giữa M-Slice: đặt ngón cái và 3 ngón tay ở hai mặt bên R/L giữ chắc khối, dùng ngón áp út tiếp nối ngón giữa gẩy kép M2 từ dưới đáy lên trên, kết hợp ngón trỏ gẩy U.`
      : formula.includes("D2") || formula.includes("D'")
      ? `Công thức (${stm} STM) có nhịp xoay đáy D: dùng ngón áp út tay trái đẩy D2 (double-flick áp út + út trái) trong khi tay phải giữ nhịp xoay R để không bị khựng.`
      : `Công thức gồm ${triggers.length} cụm Trigger (${stm} nước STM): Bắt đầu từ tư thế Home Grip (ngón cái đặt ở mặt Trước), tận dụng cổ tay phải kết hợp hai ngón trỏ gẩy U/U' hai chiều để nối liền các cụm mà không cần nhấc tay đổi thế cầm (zero-regrip).`;

  let questionAnswer: string | undefined;
  if (userQuestion && userQuestion.trim()) {
    const q = userQuestion.toLowerCase();
    if (q.includes("nhớ") || q.includes("học") || q.includes("thuộc")) {
      questionAnswer = `Mẹo thuộc nhanh ${alg.code}: Đừng nhẩm từng chữ cái rời rạc! Hãy chia thành ${triggers.length} cụm chuyển động cơ bắp: ${triggers
        .map((t) => `[${t.moves}]`)
        .join(" → ")}. Tập riêng từng cụm 5 lần rồi ghép lại và bật nút "Ẩn để tự nhớ".`;
    } else if (
      q.includes("nhận diện") ||
      q.includes("nhìn") ||
      q.includes("phân biệt")
    ) {
      questionAnswer = `Mẹo nhận diện 2 mặt cho ${alg.code} (${alg.name}): ${alg.recognition} Hãy chú ý vị trí cặp đèn pha (headlights) hoặc khối 2x2 liền màu trước khi xoay AUF.`;
    } else {
      questionAnswer = `Với ${alg.code} (${formula}): Để đạt tốc độ trên 6.5 TPS (${formatTimeMs(
        Math.round((stm / 6.5) * 1000)
      )}), hãy chú ý làm mượt điểm nối giữa cụm "${
        triggers[0]?.moves || formula
      }" và nhịp kế tiếp, tránh dừng tay kiểm tra giữa chừng.`;
    }
  }

  return {
    summary: `${alg.code} • ${alg.name} (${stm} nước STM, gồm ${triggers.length} cụm Trigger).`,
    triggers,
    variants,
    fingertrickCoach,
    recognitionTip: alg.recognition,
    questionAnswer,
  };
}
