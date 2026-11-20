import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        try {
          const destination = new URL(next, origin);
          return NextResponse.redirect(destination.origin === origin ? destination : `${origin}/`);
        } catch {
          return NextResponse.redirect(`${origin}/`);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=callback_failed`);
}
