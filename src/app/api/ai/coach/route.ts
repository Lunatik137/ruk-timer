import { NextResponse } from "next/server";

const GEMINI_MODEL_FALLBACK_CHAIN = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
] as const;

/**
 * Hybrid AI Coach & CFOP Tutor API Endpoint (`/api/ai/coach`).
 * - Protects API keys strictly on the server via `x-goog-api-key` header (never exposed to browser bundle or URL logs).
 * - Uses verified fast Gemini Flash Lite / Flash models with automatic fallback chain.
 * - Grounded on 100% deterministic math metrics computed by `src/lib/analytics/coach.ts`.
 * - Gracefully falls back to the Deterministic Speedcubing Engine if API key is missing or unreachable.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode, deterministicReport, algContext, userQuestion } = body ?? {};

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      "";

    if (!apiKey) {
      return NextResponse.json({
        source: "deterministic-engine",
        aiEnhancedText: null,
        message:
          "Đang sử dụng Động cơ Chẩn đoán Toán học Xác định (Deterministic Speedcubing Engine).",
      });
    }

    const systemPrompt =
      mode === "tutor"
        ? "Bạn là Huấn luyện viên Speedcubing WCA & Gia sư CFOP chuyên nghiệp của RukTimer. Hãy giải thích ngắn gọn bằng tiếng Việt tự nhiên, giữ nguyên các thuật ngữ quốc tế (CFOP, F2L, OLL, PLL, Trigger, Sexy Move, Sledgehammer, AUF, TPS, Lookahead, Fingertrick, Regrip). Tuyệt đối không bịa công thức ngoài công thức đã cung cấp."
        : "Bạn là AI Practice Coach của RukTimer. Dưới đây là số liệu thống kê WCA đã được tính toán chính xác 100% bằng thuật toán toán học. Tuyệt đối KHÔNG tự tính lại các con số. Hãy dựa vào số liệu này để đưa ra lời khuyên chuyên môn ngắn gọn, súc tích (tối đa 4 gạch đầu dòng) bằng tiếng Việt giúp người chơi cải thiện thành tích.";

    const userContent =
      mode === "tutor"
        ? `Công thức CFOP: ${JSON.stringify(algContext)}\nCâu hỏi của người học: ${
            userQuestion ||
            "Hướng dẫn cách nhớ nhanh qua các Trigger, cách đặt ngón tay Fingertrick mượt nhất và mẹo nhận diện nhanh."
          }`
        : `Số liệu thống kê của người chơi: ${JSON.stringify(
            deterministicReport
          )}\nCâu hỏi thêm: ${
            userQuestion ||
            "Phân tích điểm nghẽn lớn nhất của tôi và lời khuyên luyện tập trọng tâm hôm nay."
          }`;

    const requestBody = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userContent }],
        },
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 700,
      },
    });

    for (const model of GEMINI_MODEL_FALLBACK_CHAIN) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: requestBody,
        });

        if (!res.ok) continue;

        const data = await res.json();
        const text =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;

        if (text) {
          return NextResponse.json({
            source: model,
            aiEnhancedText: text,
          });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({
      source: "deterministic-fallback",
      aiEnhancedText: null,
    });
  } catch {
    return NextResponse.json({
      source: "deterministic-fallback",
      aiEnhancedText: null,
    });
  }
}
