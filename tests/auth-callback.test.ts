/**
 * The email return link.
 *
 * A creator saved their report, clicked the link in the email, and landed on
 * the homepage at `/?code=…` with nothing to turn that code into a session.
 * These tests pin the fix:
 *
 *   - GET /auth/callback exchanges a PKCE code, or verifies a token hash,
 *     and lands the creator on My Songs (or a same-site `next`);
 *   - a dead link is never a blank page: a verified session goes to My Songs
 *     anyway, anyone else goes to /scan with the expired notice — and an
 *     ANONYMOUS session is not treated as "already signed in";
 *   - the middleware forwards a stray `?code=` from any page to the callback;
 *   - `next` can never leave the site;
 *   - both emails point at the callback.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const auth = {
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
};
let configured = true;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth }),
  supabaseConfigured: () => configured,
}));

import { GET } from "@/app/auth/callback/route";
import { middleware } from "@/middleware";
import {
  isPkceCode,
  safeReturnPath,
  tokenHashReturnUrl,
} from "@/lib/auth/return-link";

const CODE = "f32c3ad5-2ac7-42a9-9b7f-9c5eba67f6d4";
const ORIGIN = "https://scan.chrp.ai";
const EXPIRED = `${ORIGIN}/scan?auth=link_expired`;

const call = (query: string) => GET(new Request(`${ORIGIN}/auth/callback${query}`));
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  configured = true;
  auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  auth.getUser.mockReset().mockResolvedValue({ data: { user: null } });
  for (const m of ["warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation(() => {});
  }
});
afterEach(() => vi.restoreAllMocks());

describe("GET /auth/callback", () => {
  it("exchanges a PKCE code and lands on My Songs", async () => {
    const res = await call(`?code=${CODE}`);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith(CODE);
    expect(res.status).toBe(303);
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("verifies a token hash and honours a same-site next", async () => {
    const res = await call(
      `?token_hash=abc123&type=magiclink&next=${encodeURIComponent("/scan/scn_x_abc123/preview")}`,
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "abc123",
      type: "magiclink",
    });
    expect(location(res)).toBe(`${ORIGIN}/scan/scn_x_abc123/preview`);
  });

  it("tries the proof even when a session already exists (the link may be another identity)", async () => {
    auth.getUser.mockResolvedValue({
      data: { user: { id: "u", is_anonymous: true } },
    });
    await call(`?code=${CODE}`);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it("expired or invalid code, nobody signed in → /scan with the notice", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      error: { name: "AuthApiError", status: 400, message: "expired" },
    });
    expect(location(await call(`?code=${CODE}`))).toBe(EXPIRED);
  });

  it("dead link but a VERIFIED creator is already signed in → My Songs", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      error: { name: "AuthApiError", status: 400, message: "used" },
    });
    auth.getUser.mockResolvedValue({
      data: { user: { id: "u", is_anonymous: false, email: "a@b.co" } },
    });
    expect(location(await call(`?code=${CODE}`))).toBe(`${ORIGIN}/dashboard`);
  });

  it("dead link and only an ANONYMOUS session → the notice, not an empty My Songs", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      error: { name: "AuthApiError", status: 400, message: "no verifier" },
    });
    auth.getUser.mockResolvedValue({
      data: { user: { id: "u", is_anonymous: true, email: null } },
    });
    expect(location(await call(`?code=${CODE}`))).toBe(EXPIRED);
  });

  it("no proof at all, already verified → My Songs; otherwise the notice", async () => {
    expect(location(await call(""))).toBe(EXPIRED);
    auth.getUser.mockResolvedValue({
      data: { user: { id: "u", is_anonymous: false, email: "a@b.co" } },
    });
    expect(location(await call(""))).toBe(`${ORIGIN}/dashboard`);
  });

  it("rejects an unknown link type without calling the auth service", async () => {
    const res = await call("?token_hash=abc&type=sms");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe(EXPIRED);
  });

  it("a throwing auth client is still a redirect, never a 500", async () => {
    auth.exchangeCodeForSession.mockRejectedValue(new Error("network"));
    auth.getUser.mockRejectedValue(new Error("network"));
    const res = await call(`?code=${CODE}`);
    expect(res.status).toBe(303);
    expect(location(res)).toBe(EXPIRED);
  });

  it("unconfigured identity → the notice", async () => {
    configured = false;
    expect(location(await call(`?code=${CODE}`))).toBe(EXPIRED);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("never redirects off-site", async () => {
    for (const next of [
      "https://evil.example/x",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/auth/callback?code=loop",
    ]) {
      const res = await call(`?code=${CODE}&next=${encodeURIComponent(next)}`);
      expect(location(res)).toBe(`${ORIGIN}/dashboard`);
    }
  });

  it("never logs the code or the token hash", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...a) => {
      lines.push(a.map(String).join(" "));
    });
    auth.exchangeCodeForSession.mockResolvedValue({
      error: { name: "AuthApiError", status: 400, message: `bad ${CODE}` },
    });
    await call(`?code=${CODE}`);
    auth.verifyOtp.mockResolvedValue({
      error: { name: "AuthApiError", status: 403, message: "bad secret-hash" },
    });
    await call("?token_hash=secret-hash&type=magiclink");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).not.toContain(CODE);
    expect(lines.join("\n")).not.toContain("secret-hash");
  });
});

describe("middleware: a stray ?code= reaches the callback", () => {
  const run = (path: string, init?: { method?: string }) =>
    middleware(new NextRequest(`${ORIGIN}${path}`, init));

  beforeEach(() => {
    // No Supabase env → the session-refresh half is a pass-through.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("forwards /?code=… — the exact URL the broken link produced", async () => {
    const res = await run(`/?code=${CODE}`);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `${ORIGIN}/auth/callback?code=${CODE}`,
    );
  });

  it("forwards from any page, carries next, drops everything else", async () => {
    const res = await run(`/scan?code=${CODE}&next=%2Fdashboard&utm=x`);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/auth/callback");
    expect(Array.from(loc.searchParams.keys()).sort()).toEqual(["code", "next"]);
  });

  it("leaves the callback itself, API routes, non-GET and non-UUID codes alone", async () => {
    for (const res of [
      await run(`/auth/callback?code=${CODE}`),
      await run(`/api/catalog?code=${CODE}`),
      await run(`/?code=${CODE}`, { method: "POST" }),
      await run(`/?code=EARLYACCESS`),
      await run(`/`),
    ]) {
      expect(res.headers.get("location")).toBeNull();
    }
  });
});

describe("return-link rules", () => {
  it("recognises only UUID-shaped codes", () => {
    expect(isPkceCode(CODE)).toBe(true);
    expect(isPkceCode("EARLYACCESS")).toBe(false);
    expect(isPkceCode("")).toBe(false);
    expect(isPkceCode(null)).toBe(false);
  });

  it("defaults to My Songs", () => {
    expect(safeReturnPath(null)).toBe("/dashboard");
    expect(safeReturnPath("")).toBe("/dashboard");
    expect(safeReturnPath("/scan/scn_a_b/preview")).toBe("/scan/scn_a_b/preview");
  });

  it("builds a token-hash link on our own callback", () => {
    const url = new URL(
      tokenHashReturnUrl({
        site: "https://scan.chrp.ai/",
        tokenHash: "h4sh",
        type: "magiclink",
        next: "/scan/scn_a_b/preview",
      }),
    );
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/auth/callback`);
    expect(url.searchParams.get("token_hash")).toBe("h4sh");
    expect(url.searchParams.get("type")).toBe("magiclink");
    expect(url.searchParams.get("next")).toBe("/scan/scn_a_b/preview");
  });
});

describe("both emails point at the callback", () => {
  it("Save My Report and the sign-in link pass emailRedirectTo", () => {
    const src = readFileSync("src/lib/identity.ts", "utf8");
    expect(src).toContain("AUTH_CALLBACK_PATH");
    expect(src).toMatch(/updateUser\(\s*\{ email \},\s*\{ emailRedirectTo \}/);
    expect(src).toMatch(/signInWithOtp\(\{\s*email,\s*options: \{ emailRedirectTo \}/);
  });

  it("the purchase email uses the token hash, never the fragment-based action_link", () => {
    const src = readFileSync("src/lib/email/purchase.server.ts", "utf8");
    expect(src).toContain("tokenHashReturnUrl");
    expect(src).toContain("hashed_token");
    expect(src).not.toMatch(/properties\?\.action_link/);
  });
});
