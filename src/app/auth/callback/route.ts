import { NextResponse } from "next/server";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import {
  LINK_EXPIRED_PARAM,
  LINK_EXPIRED_PATH,
  LINK_EXPIRED_VALUE,
  isReturnLinkType,
  safeReturnPath,
} from "@/lib/auth/return-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/callback — where every email return link ends.
 *
 * A creator who saved their report clicks the link in their email. The auth
 * service confirms the address and sends them back here carrying proof:
 *
 *   ?code=…                 a PKCE auth code (Save My Report, sign-in link).
 *                           Exchanged for a session using the code verifier
 *                           the browser stored in a cookie when it asked.
 *   ?token_hash=…&type=…    a one-time token hash (the purchase email, and
 *                           any auth template pointed here). Verified on its
 *                           own, so it works from any browser or device.
 *
 * Either way the result is the same session cookie every entitlement check
 * already reads, and the creator lands on My Songs — or on the `next` path
 * the link named, which may only ever be a path on this site.
 *
 * Nothing here grants anything. It establishes WHO someone is; what they own
 * is still decided by the entitlement checks behind every paid surface.
 *
 * Failure is never a blank page:
 *   - the proof is dead, but this browser already holds a session → My Songs
 *     (a second click on a used link, or the same-browser save confirmation);
 *   - otherwise → the scan page, which says the link expired.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeReturnPath(url.searchParams.get("next"));

  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url.origin), 303);
    // The URL carried a credential. Never cache it, never leak it onward.
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };
  const expired = () =>
    go(`${LINK_EXPIRED_PATH}?${LINK_EXPIRED_PARAM}=${LINK_EXPIRED_VALUE}`);

  if (!supabaseConfigured()) {
    console.error("[auth callback] identity is not configured");
    return expired();
  }

  const supabase = createClient();

  // A proof, when present, is always tried first — even if this browser
  // already holds a session. The link may belong to a DIFFERENT identity
  // than the anonymous one sitting in this browser, and the creator clicked
  // it to become that identity.
  let failure: string | null = null;
  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return go(next);
      failure = `code: ${error.name}${error.status ? ` ${error.status}` : ""}`;
    } else if (tokenHash && isReturnLinkType(type)) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (!error) return go(next);
      failure = `token_hash(${type}): ${error.name}${error.status ? ` ${error.status}` : ""}`;
    } else {
      failure = "no usable proof in the link";
    }
  } catch (err) {
    failure = err instanceof Error ? err.name : "unexpected error";
  }

  // The proof did not work. If a VERIFIED creator is already signed in here,
  // they do not need it: take them to their songs rather than telling them a
  // link expired when nothing is actually wrong. (Clicking the save
  // confirmation twice in the same browser lands here — the first click
  // already confirmed the address, so the session is no longer anonymous.)
  //
  // An anonymous session is deliberately NOT enough. The link was meant to
  // make this browser a specific creator; dropping them on an anonymous
  // My Songs that lacks their reports would look like their songs were lost.
  // The anonymous session itself is left untouched.
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user && data.user.is_anonymous !== true && data.user.email) {
      console.warn(
        `[auth callback] link not usable (${failure}); existing session kept`,
      );
      return go(next);
    }
  } catch {
    // fall through to the expired notice
  }

  console.warn(`[auth callback] link not usable (${failure}); no session`);
  return expired();
}
