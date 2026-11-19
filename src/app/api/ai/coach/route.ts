import { NextResponse } from "next/server";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";

const GEMINI_MODEL_FALLBACK_CHAIN = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
] as const;

const MAX_BODY_BYTES = 32_768;
const MAX_QUESTION_CHARS = 500;
const MODEL_TIMEOUT_MS = 6_000;

/**
 * Authenticated Hybrid AI Coach & CFOP Tutor API (`/api/ai/coach`).
 * - Requires a valid Supabase session (cookie or Bearer token); returns 401 for Guest.
 * - Protects `GEMINI_API_KEY` strictly on server via `x-goog-api-key` header.
 * - Never blocks Timer or CFOP Trainer if Gemini is unavailable.
 */
export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        {
          code: "payload_too_large",
          error: "Dữ liệu gửi lên vượt quá giới hạn cho phép.",
        },
        { status: 413 }
      );
    }

    const auth = await getAuthenticatedServerContext(request);
    if (!auth) {
      return NextResponse.json(
        {
          code: "guest",
          source: "deterministic-engine",
          aiEnhancedText: null,
          error:
            "Đăng nhập để dùng tư vấn Gemini AI. Ở chế độ Guest bạn vẫn xem được đầy đủ báo cáo Coach tính từ dữ liệu lượt giải.",
        },
        { status: 401 }
      );
    }

    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { code: "payload_too_large", error: "Nội dung yêu cầu quá lớn." },
        { status: 413 }
      );
    }

    const body = JSON.parse(rawText || "{}");
    const { mode, deterministicReport, algContext } = body ?? {};
    const userQuestion =
      typeof body?.userQuestion === "string"
        ? body.userQuestion.trim().slice(0, MAX_QUESTION_CHARS)
        : "";

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      "";

    if (!apiKey) {
      return NextResponse.json({
        code: "no_key",
        source: "deterministic-engine",
        aiEnhancedText: null,
        message:
          "Đang sử dụng Động cơ Chẩn đoán Toán học Xác định (Deterministic Speedcubing Engine).",
      });
    }

    const systemPrompt =
      mode === "tutor"
        ? "Bạn là Huấn luyện viên Speedcubing WCA & Gia sư CFOP chuyên nghiệp của RukTimer. Hãy giải thích ngắn gọn bằng tiếng Việt tự nhiên, giữ nguyên các thuật ngữ quốc tế (CFOP, F2L, OLL, PLL, Trigger, Sexy Move, Sledgehammer, AUF, TPS, Lookahead, Fingertrick, Regrip). Tuyệt đối không bịa công thức ngoài công thức đã cung cấp."
        : "Bạn là AI Practice Coach của RukTimer. Dưới đây là số liệu thống kê WCA đã được tính toán chính xác 100% bằng thuật toán toán học. Tuyệt đối KHÔNG tự tính lại các con số và KHÔNG đưa kết luận mạnh nếu số mẫu ít. Hãy dựa vào số liệu này để đưa ra lời khuyên chuyên môn ngắn gọn, súc tích (tối đa 4 gạch đầu dòng) bằng tiếng Việt.";

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
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        });

        if (!res.ok) continue;

        const data = await res.json();
        const text =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;

        if (text) {
          return NextResponse.json({
            code: "ok",
            source: model,
            aiEnhancedText: text,
          });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({
      code: "upstream_unavailable",
      source: "deterministic-fallback",
      aiEnhancedText: null,
      message:
        "Dịch vụ Gemini tạm thời bận, đã tự động chuyển về báo cáo Coach từ dữ liệu lượt giải.",
    });
  } catch {
    return NextResponse.json({
      code: "error",
      source: "deterministic-fallback",
      aiEnhancedText: null,
    });
  }
}
