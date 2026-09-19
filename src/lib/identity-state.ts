/**
 * Who the SERVER says this browser is.
 *
 * The one client-side reader of GET /api/identity/state for surfaces that
 * only need to know whether there is a real identity and what its confirmed
 * email is — the header link and My Songs. The answer comes from the
 * Supabase session cookie; nothing in localStorage can influence it.
 *
 * Deliberately dependency-free (no Supabase client import), because the
 * header renders on almost every page.
 */

export type Ownership = "none" | "anonymous" | "verified";

export interface IdentityState {
  /**
   * none       no session at all
   * anonymous  a real session owns this browser's work, but no confirmed email
   * verified   a creator with a confirmed email
   */
  ownership: Ownership;
  /** The creator's own confirmed address. Null unless verified. */
  email: string | null;
}

const NONE: IdentityState = { ownership: "none", email: null };

/** Never throws. Anything unexpected reads as "no identity". */
export async function fetchIdentityState(): Promise<IdentityState> {
  try {
    const res = await fetch("/api/identity/state", { cache: "no-store" });
    if (!res.ok) return NONE;
    const body = (await res.json()) as {
      ownership?: unknown;
      email?: unknown;
    };
    const ownership: Ownership =
      body.ownership === "verified" || body.ownership === "anonymous"
        ? body.ownership
        : "none";
    return {
      ownership,
      email:
        ownership === "verified" && typeof body.email === "string"
          ? body.email
          : null,
    };
  } catch {
    return NONE;
  }
}
