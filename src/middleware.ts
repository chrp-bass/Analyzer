import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_CALLBACK_PATH, isPkceCode } from "@/lib/auth/return-link";

/**
 * Refreshes the Supabase session cookie on navigation so a server-verified
 * identity is available to the entitlement checks. Mirrors the established
 * chrp-athlete-engine middleware.
 *
 * No route is gated here — the front door stays open and scanning never
 * requires a session. Entitlement is enforced at the API boundary, not by
 * redirecting people away from pages.
 */
export async function middleware(request: NextRequest) {
  // An email return link that landed on the wrong page. When the auth
  // service is not told where to send someone — or the address it was given
  // is not on its allow-list — it falls back to the site root, so the
  // creator arrives at `/?code=…` and the homepage ignores it. Hand the code
  // to the one route that knows what to do with it. Everything else about
  // the URL is dropped: only the code and an explicit `next` travel.
  const { pathname, searchParams } = request.nextUrl;
  const strayCode = searchParams.get("code");
  if (
    request.method === "GET" &&
    isPkceCode(strayCode) &&
    pathname !== AUTH_CALLBACK_PATH &&
    !pathname.startsWith("/api/")
  ) {
    const target = request.nextUrl.clone();
    target.pathname = AUTH_CALLBACK_PATH;
    target.search = "";
    target.searchParams.set("code", strayCode);
    const next = searchParams.get("next");
    if (next) target.searchParams.set("next", next);
    return NextResponse.redirect(target, 307);
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|brand/|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf)$).*)",
  ],
};
