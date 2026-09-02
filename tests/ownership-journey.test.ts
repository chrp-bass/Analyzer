import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The customer-journey regressions.
 *
 * These lock the two failures the real $19 purchase exposed: a waiting state
 * that rendered nothing, and a completed report with no way to take
 * possession of it. They are source-level assertions rather than DOM tests
 * because the repository has no DOM test harness and adding one is outside
 * this task — the rendered behaviour is validated separately by sampling a
 * real browser through a slow generation.
 */

const preview = readFileSync("src/components/scan/ScanPreview.tsx", "utf8");
const previewPage = readFileSync(
  "src/app/scan/[scanId]/preview/page.tsx",
  "utf8",
);
const report = readFileSync("src/components/ReportPage.tsx", "utf8");
const ownership = readFileSync(
  "src/components/report/ReportOwnership.tsx",
  "utf8",
);
const successPage = readFileSync(
  "src/app/scan/[scanId]/success/page.tsx",
  "utf8",
);
const identityState = readFileSync(
  "src/app/api/identity/state/route.ts",
  "utf8",
);
const reportEmail = readFileSync(
  "src/app/api/report/[id]/email/route.ts",
  "utf8",
);

describe("no customer-visible wait renders an empty viewport", () => {
  it("the entitlement wait renders the preparation screen, not a bare div", () => {
    expect(preview).toMatch(
      /status === "checking"\)?\s*\n?\s*return <ReportPreparing/,
    );
    // The empty holds this replaced must not come back under any name.
    expect(preview).not.toMatch(/rv-hold/);
    expect(preview).not.toMatch(/return <div [^>]*aria-hidden \/>;/);
  });

  it("the analysis wait on the preview route renders the same screen", () => {
    expect(previewPage).toMatch(/<ReportPreparing\s+report=\{null\}/);
    // and the paid flag survives this branch, because on a real scan it is
    // the frame a paying creator actually lands on.
    expect(previewPage).toContain('paid={search.get("paid") === "1"}');
    expect(previewPage).not.toMatch(/return null;/);
  });

  it("the preparation screen always carries explanatory content", () => {
    expect(preview).toContain("CHRP &nbsp;//&nbsp; Emotional Intelligence");
    expect(preview).toContain("Building your Song Intelligence report");
    expect(preview).toContain("Composing the CHRP reading");
  });

  it("the first status line is visible on the server-rendered frame", () => {
    // An opacity-0 initial state is what the server emits, which made the
    // line invisible on a direct load until hydration finished.
    expect(preview).toMatch(/initial=\{messageIndex === 0 \? false :/);
  });

  it("claims no progress it cannot measure", () => {
    expect(preview).not.toMatch(/\d+%|almost done|nearly there/i);
  });
});

describe("payment is acknowledged before the report exists", () => {
  it("the success route flags the paid return", () => {
    expect(successPage).toContain("/preview?paid=1");
  });

  it("the preparation screen shows the acknowledgement on that return", () => {
    expect(preview).toMatch(/paid\?: boolean/);
    expect(preview).toContain("Payment received");
    expect(preview).toContain('search.get("paid") === "1"');
  });
});

describe("ownership is offered on every completed report", () => {
  it("is rendered by the shared report body, so free and paid both get it", () => {
    expect(report).toContain("<ReportOwnership scanId={id}");
  });

  it("comes after the intelligence, never before it", () => {
    expect(report.indexOf("<ReportOwnership")).toBeGreaterThan(
      report.indexOf("report.consider"),
    );
  });

  it("asks for an email and nothing else", () => {
    expect(ownership).toMatch(/type="email"/);
    for (const field of ["password", "name", "phone", "username", "address"]) {
      expect(ownership).not.toMatch(new RegExp(`type="${field}"`));
    }
  });

  it("reconciles identity by upgrading the same user, never creating a second", () => {
    expect(ownership).toContain("linkEmail");
    expect(ownership).not.toMatch(/signInAnonymously|createUser/);
  });

  it("keeps the report intact when verification fails or is abandoned", () => {
    expect(ownership).toMatch(/Your report is safe/);
  });

  it("shows the owned state instead of asking again", () => {
    expect(ownership).toContain("Saved to My Songs");
    expect(ownership).toContain("Keep this report");
    expect(ownership).toContain("Email me this report");
    expect(ownership).toContain("View my songs");
  });
});

describe("Stripe email is a hint, never an authentication", () => {
  it("is returned only as a prefill", () => {
    expect(identityState).toMatch(/prefillEmail/);
    expect(ownership).toMatch(/if \(data\.prefillEmail\) setEmail\(/);
  });

  it("never sets ownership to verified from a Stripe address", () => {
    // "verified" is derived from the Supabase auth user alone.
    expect(identityState).toMatch(
      /const verified = Boolean\(email\) && user\?\.is_anonymous !== true;/,
    );
    // The Stripe lookup happens only after the verified branch has returned.
    expect(identityState.indexOf('ownership: "verified"')).toBeLessThan(
      identityState.indexOf("checkout.sessions.retrieve"),
    );
  });

  it("only reveals the hint to the session that owns the entitlement", () => {
    expect(identityState).toMatch(/\.eq\("user_id", userId\)/);
    expect(identityState).toMatch(/\.eq\("scan_id", scanId\)/);
  });

  it("never looks up a Stripe session for a free-first grant", () => {
    expect(identityState).toMatch(/sessionId\.startsWith\("cs_"\)/);
  });
});

describe("emailing a report is authorized like reading one", () => {
  it("requires entitlement to the scan", () => {
    expect(reportEmail).toContain("assertReportAccess(scanId)");
    expect(reportEmail).toMatch(/status: 403/);
  });

  it("resolves the recipient server-side, never from the request", () => {
    expect(reportEmail).toContain("currentUserId()");
    expect(reportEmail).not.toMatch(/req\.json\(\)|searchParams\.get\("email"\)/);
  });

  it("sends through the existing transactional sender", () => {
    expect(reportEmail).toContain("sendPurchaseEmail");
  });
});
