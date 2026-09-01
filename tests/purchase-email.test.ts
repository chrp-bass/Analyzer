import { describe, expect, it, vi, afterEach } from "vitest";
import { renderEmail, sendEmail } from "@/lib/email/send.server";
import { PURCHASE_COPY } from "@/lib/email/purchase.server";

/**
 * The confirmation emails, verified without moving money.
 *
 * What matters here is that the copy is exactly what was specified, that the
 * shell leaks no infrastructure, and — most importantly — that a broken
 * mailer reports failure instead of throwing, because the caller runs
 * downstream of a completed purchase.
 */

afterEach(() => vi.unstubAllEnvs());

describe("purchase email copy", () => {
  it("says what the $19 buyer was promised", () => {
    const c = PURCHASE_COPY.song_intelligence;
    expect(c.subject).toBe("Your Song Intelligence is ready");
    expect(c.cta).toBe("View my report");
    expect(c.support).toContain("saved in My Songs");
  });

  it("says what the $149 buyer was promised", () => {
    const c = PURCHASE_COPY.creator_intelligence;
    expect(c.subject).toBe("Your Creator Intelligence is ready");
    expect(c.cta).toBe("Analyze my next song");
    expect(c.support).toContain("stay in My Songs");
  });
});

describe("branded shell", () => {
  const html = renderEmail({
    heading: "Your Song Intelligence is ready.",
    body: "Your complete report is waiting for you.",
    cta: "View my report",
    ctaUrl: "https://scan.chrp.ai/secure-return",
    support: "Your report is saved in My Songs, so you can come back anytime.",
  });

  it("carries the CHRP palette and a single action", () => {
    expect(html).toContain("#0F0E0E");
    expect(html).toContain("#FBFBF4");
    expect(html).toContain("#E6D74F");
    expect(html).toContain("CHRP Intelligence");
    expect(html).toContain("Know what your song does. Know where it belongs.");
    expect(html.match(/<a /g) ?? []).toHaveLength(1);
  });

  it("names no vendor and attaches nothing", () => {
    for (const term of [
      "supabase",
      "resend",
      "stripe",
      "magic link",
      "anthropic",
      "spotify",
      "soundcharts",
      "smtp",
    ]) {
      expect(html.toLowerCase()).not.toContain(term);
    }
    expect(html).not.toContain("<img");
    expect(html.toLowerCase()).not.toContain("attach");
  });

  it("points the action at the secure return it was given", () => {
    expect(html).toContain('href="https://scan.chrp.ai/secure-return"');
  });
});

describe("a broken mailer cannot break a purchase", () => {
  it("reports missing configuration instead of throwing", async () => {
    vi.stubEnv("CHRP_SMTP_HOST", "");
    vi.stubEnv("CHRP_SMTP_USER", "");
    vi.stubEnv("CHRP_SMTP_PASS", "");
    vi.stubEnv("CHRP_SMTP_FROM", "");
    const result = await sendEmail({
      to: "creator@example.com",
      subject: "x",
      html: "<p>x</p>",
    });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("reports a send failure instead of throwing", async () => {
    vi.stubEnv("CHRP_SMTP_HOST", "127.0.0.1");
    vi.stubEnv("CHRP_SMTP_PORT", "1");
    vi.stubEnv("CHRP_SMTP_USER", "u");
    vi.stubEnv("CHRP_SMTP_PASS", "p");
    vi.stubEnv("CHRP_SMTP_FROM", "scan@chrp.ai");
    const result = await sendEmail({
      to: "creator@example.com",
      subject: "x",
      html: "<p>x</p>",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("send_failed");
  }, 30_000);
});
