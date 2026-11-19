import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ai/coach/route";
import { getAuthenticatedServerContext } from "@/lib/supabase/authServer";

vi.mock("@/lib/supabase/authServer", () => ({
  getAuthenticatedServerContext: vi.fn(),
}));

const auth = vi.mocked(getAuthenticatedServerContext);

function request(mode: "coach" | "tutor") {
  return new Request("http://localhost/api/ai/coach", {
    method: "POST",
    body: JSON.stringify({ mode, userQuestion: "Nên luyện gì?" }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("AI Coach and CFOP Tutor usage", () => {
  it("passes repeated requests to Gemini without a local burst limit or daily quota RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, used_count: 30, remaining: 0 }],
    });
    auth.mockResolvedValue({
      user: { id: "test-user" },
      supabase: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof getAuthenticatedServerContext>>>);
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const gemini = vi.fn(async () => Response.json({
      candidates: [{ content: { parts: [{ text: "Luyện Cross." }] } }],
    }));
    vi.stubGlobal("fetch", gemini);

    for (let count = 0; count < 35; count++) {
      const response = await POST(request(count % 2 === 0 ? "coach" : "tutor"));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ code: "ok", aiEnhancedText: "Luyện Cross." });
    }

    expect(rpc).not.toHaveBeenCalled();
    expect(gemini).toHaveBeenCalledTimes(35);
  });

  it("continues to require sign-in before using Gemini", async () => {
    auth.mockResolvedValue(null);
    const gemini = vi.fn();
    vi.stubGlobal("fetch", gemini);

    expect((await POST(request("coach"))).status).toBe(401);
    expect(gemini).not.toHaveBeenCalled();
  });
});
