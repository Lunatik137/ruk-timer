import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { isSupabaseConfigured } from "./client";

/**
 * Resolves the authenticated Supabase user from either:
 *  1. `Authorization: Bearer <access_token>` header (Expo mobile / API clients), or
 *  2. Next.js session cookies (Web / PWA).
 * Never trusts user IDs supplied in request bodies or query strings.
 */
export async function getAuthenticatedServerContext(
  request: Request
): Promise<{ user: User; supabase: SupabaseClient } | null> {
  if (!isSupabaseConfigured()) return null;

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return { user: data.user, supabase };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return { user: data.user, supabase };
}
