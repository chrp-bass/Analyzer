"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { MODE_COLORS, type FreeReport, type ReportPayload } from "@/lib/fixtures/tracks";
import { PolygonRadar } from "@/components/PolygonRadar";
import { polygonFromChrpScores } from "@/lib/polygon";
import { ReportBody } from "@/components/ReportPage";
import { fetchEntitledReport, claimFirstReport } from "@/lib/data-source";
import { startCheckout } from "@/lib/payments";
import { ensureIdentity, linkEmail } from "@/lib/identity";

type Status = "checking" | "reveal" | "unlocked" | "unavailable";

/** Canonical EPI axis order. The payload stores them unordered. */
const AXIS_ORDER = ["Focus", "Calm", "Motivation", "Balance"] as const;

const AXIS_COLOR: Record<string, string> = {
  Focus: "#7A9FE8",
  Calm: "#A8D990",
  Motivation: "#E6D74F",
  Balance: "#C990B8",
};

/**
 * The paid movements, named — never rendered — before entitlement.
 *
 * This list must stay in lockstep with what ReportBody actually ships: the
 * boundary is only honest if every line here is a section the customer
 * receives. "Positioning language" from the approved hierarchy has no backing
 * output in the engine yet, so it is not promised here.
 */
const PAID_HIERARCHY = [
  { n: "01", title: "Emotional signature, in full" },
  { n: "—", title: "The CHRP reading" },
  { n: "02", title: "EPI profile" },
  { n: "03", title: "What it’s built for" },
  { n: "04", title: "Pitch throughline" },
  { n: "05", title: "Comparable context" },
];

const FREE_ITEMS = [
  "EPI Score",
  "Primary mode",
  "Focus, Calm, Motivation, Balance",
  "Your four-dimension performance profile",
  "One emotional-signature statement",
];


/**
 * Begin a real purchase. Identity is established first so the webhook has
 * someone to grant to; the offer key is all the client sends — the price is
 * resolved server-side from Stripe.
 */
async function beginPurchase(
  offer: "song_intelligence" | "creator_intelligence",
  scanId: string,
  onError: (msg: string) => void,
) {
  try {
    await ensureIdentity();
    const { url } = await startCheckout(offer, scanId);
    window.location.assign(url);
  } catch (err) {
    console.error("[checkout] could not start:", err);
    // The server may have refused for a reason worth stating plainly — a
    // song whose report cannot be produced, for instance. Nothing was
    // charged either way.
    onError(
      err instanceof Error && err.message
        ? err.message
        : "Checkout is unavailable right now. Nothing has been charged — please try again shortly.",
    );
  }
}

export function ScanPreview({
  report,
  scanId,
}: {
  /** Free-tier data only. The paid report is fetched, never bundled. */
  report: FreeReport;
  scanId: string;
  trackSlug?: string;
}) {
  const search = useSearchParams();
  const welcomeEmail = search.get("email");

  const [status, setStatus] = useState<Status>("checking");
  const [paid, setPaid] = useState<ReportPayload | null>(null);
  const [showBanner, setShowBanner] = useState(search.get("welcome") === "1");
  const [unavailableNote, setUnavailableNote] = useState<string | null>(null);
  // True only when THIS view is the moment the included report was applied.
  const [includedFirst, setIncludedFirst] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The SERVER decides. There is no client-readable entitlement flag to
      // consult and nothing in localStorage that can change this answer.
      let result = await fetchEntitledReport(scanId);

      // Not entitled yet. A creator's FIRST complete report is included, so
      // ask the server whether this song qualifies before showing a price.
      // Identity is established silently here — no sign-in, no interruption
      // — because the included report has to belong to someone to survive
      // the creator leaving and coming back.
      if (!cancelled && result.status === "forbidden") {
        await ensureIdentity();
        const outcome = await claimFirstReport(scanId);
        if (cancelled) return;
        if (outcome === "granted" || outcome === "already_entitled") {
          if (outcome === "granted") setIncludedFirst(true);
          result = await fetchEntitledReport(scanId);
        }
      }
      if (cancelled) return;

      if (result.status === "ok") {
        setPaid(result.data.report);
        setStatus("unlocked");
      } else if (result.status === "unavailable" && result.entitled) {
        // Paid, but the report cannot honestly be produced right now. Say so
        // — the purchase stands and nothing is fabricated to fill the gap.
        setUnavailableNote(result.detail ?? null);
        setStatus("unavailable");
      } else {
        setStatus("reveal");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  // No PAID text renders until entitlement is known — the reveal and the
  // report stay separate screens, so paid prose never reaches the DOM before
  // unlock. That restriction has nothing to do with the free reveal data,
  // which this session already has and already showed on the processing
  // screen. Withholding that too is what turned a thirty-second wait into a
  // dead screen.
  if (status === "checking")
    return <ReportPreparing report={report} paid={search.get("paid") === "1"} />;

  if (status === "reveal") {
    return (
      <>
        <FreeReveal report={report} scanId={scanId} />
        <Boundary scanId={scanId} />
      </>
    );
  }

  if (status === "unavailable" || !paid) {
    return <ReportUnavailable note={unavailableNote} />;
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {showBanner && status === "unlocked" && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="sticky top-0 z-30 px-5 py-3 flex items-center justify-between gap-4"
            style={{
              backgroundColor: "var(--chrp-yellow)",
              color: "var(--chrp-black)",
            }}
          >
            <div className="font-sans text-[12px] md:text-[13px] leading-snug">
              <span className="font-bold">Magic link sent</span>
              {welcomeEmail ? ` to ${welcomeEmail}` : ""} &mdash; save it to
              sign in from any browser later. &nbsp;
              <Link
                href="/dashboard"
                className="underline hover:no-underline font-bold"
              >
                Go to dashboard &rarr;
              </Link>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="font-sans text-[11px] tracking-wider uppercase opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ReportBody report={paid} id={scanId} />
      <CatalogClose scanId={scanId} includedFirst={includedFirst} />
    </div>
  );
}

// ─── The free reveal ─────────────────────────────────────────────────────────
/**
 * Deliverable 07. The reveal is a place: it has its own URL, a save action
 * and no timer. Nothing auto-advances off it, and nothing here asked the
 * visitor to sign in to get this far.
 */
function FreeReveal({
  report,
  scanId,
}: {
  report: FreeReport;
  scanId: string;
}) {
  const byName = new Map(report.chrp_scores.map((r) => [r.name, r]));
  const axes = AXIS_ORDER.map((name) => ({
    name,
    score: byName.get(name)?.score ?? 0,
  }));

  return (
    <section className="rv">
      <div className="rv-inner">
        <div className="rv-grid">
          <div className="rv-instrument">
            {/* Settled, not re-animating. The ten-second draw-in belongs to the
                processing screen; by the time the reveal lands the shape is
                the artifact, and it holds. */}
            <PolygonRadar
              vertices={polygonFromChrpScores(report.chrp_scores)}
              mode={report.epi.mode}
              epiScore={report.epi.score}
              size={300}
            />
            <div className="rv-mode">
              <p style={{ margin: 0 }}>{report.epi.mode} mode</p>
            </div>
          </div>

          <div>
            <p className="rv-kicker">Your song&rsquo;s emotional signature</p>
            <div className="rv-idrow">
              {/* The engine resolves cover art with the song, so the reveal
                  shows the actual record. When a song genuinely has none the
                  dashed frame stands empty — nothing is substituted, and a
                  fixture's artwork is never shown for a real song. */}
              <div className="rv-artwork" aria-hidden={!report.track.artworkUrl}>
                {report.track.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={report.track.artworkUrl}
                    alt={`${report.track.title} by ${report.track.artist}`}
                  />
                ) : null}
              </div>
              <div>
                <p className="rv-title">{report.track.title}</p>
                <p className="rv-artist">by {report.track.artist}</p>
              </div>
            </div>

            <div className="rv-axes">
              {axes.map((a) => (
                <div key={a.name} className="rv-axis">
                  <p
                    className="rv-axis-name"
                    style={{ color: AXIS_COLOR[a.name] }}
                  >
                    {a.name}
                  </p>
                  <span className="rv-axis-track">
                    <span
                      className="rv-axis-fill"
                      style={{
                        width: `${a.score}%`,
                        background: AXIS_COLOR[a.name],
                      }}
                    />
                  </span>
                  <p className="rv-axis-score">{a.score}</p>
                </div>
              ))}
            </div>

            <p className="rv-signature">{report.free_statement}</p>

            <RevealActions scanId={scanId} />
          </div>
        </div>

        <p className="rv-transition">
          That tells you what the song is doing. The full report tells you what
          to do with it.
        </p>
      </div>
    </section>
  );
}

/**
 * Primary unlock plus the quiet save path. Saving uses the existing
 * magic-link infrastructure — an email address and a link, no password and
 * no account setup step.
 */
function RevealActions({ scanId }: { scanId: string }) {
  const [buying, setBuying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (!trimmed.includes("@") || trimmed.length < 5) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // Attaches the address to the SAME identity that already owns this
      // report, so nothing about the creator's history changes. "Saved" is
      // claimed ONLY when the send was accepted — the report and the
      // identity survive a failure untouched, so retrying is safe.
      const result = await linkEmail(trimmed);
      if (result.ok) {
        setSent(true);
      } else {
        setError(
          result.reason === "not_configured"
            ? "Saving isn't available right now. Your report is safe — this page stays yours."
            : "We couldn't send your link just now. Your report is safe — try again in a moment.",
        );
      }
    } catch (err) {
      console.error(err);
      setError(
        "We couldn't send your link just now. Your report is safe — try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rv-actions">
        <button
          type="button"
          className="rv-cta"
          disabled={buying}
          onClick={() => {
            setBuying(true);
            beginPurchase("song_intelligence", scanId, (m) => {
              setError(m);
              setBuying(false);
            });
          }}
        >
          {buying ? "Opening checkout…" : "Unlock the full Song Intelligence"}
        </button>
        {!saving && !sent && (
          <button
            type="button"
            className="rv-save"
            onClick={() => setSaving(true)}
          >
            Save my report
          </button>
        )}
      </div>

      {saving && !sent && (
        <form className="rv-saveform" onSubmit={save}>
          <label htmlFor="rv-email" className="sr-only">
            Email address
          </label>
          <p className="rv-note" style={{ gridColumn: "1 / -1", margin: 0 }}>
            Enter your email to save your Song Intelligence and access My
            Songs anytime.
          </p>
          <input
            id="rv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
            autoComplete="email"
            autoFocus
          />
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      {error && (
        <p className="rv-note" style={{ color: "#E58BB4" }} role="alert">
          {error}
        </p>
      )}
      {sent && (
        <p className="rv-note" style={{ color: "var(--yellow)" }}>
          Saved. Check your email — the link brings you back to your songs.
        </p>
      )}

      <p className="rv-keep">
        This screen is yours to keep. Nothing moves until you move it, and
        nothing asked you to sign in to get here. Saving takes an email
        address &mdash; no password, no account setup.
      </p>
    </>
  );
}

/**
 * The screen the creator actually waits on.
 *
 * This replaces an empty full-viewport div. That div was itself a fix for a
 * cream empty div, and recolouring emptiness fixed nothing: the wait here is
 * not a frame, it is up to four sequential operations — entitlement check,
 * identity, the free-first claim, then a second entitlement check that
 * generates the whole Rhodes report. Twenty to thirty seconds of blank
 * viewport reads as a crashed page, and it was.
 *
 * So this continues the processing screen instead of interrupting it: same
 * ground, same eyebrow, same italic status line, same instrument. The song's
 * shape, EPI and mode were on screen a moment ago and stay on screen, which
 * is what makes the wait feel like work continuing rather than a dead end.
 *
 * Everything shown here is free-tier data this component was already handed.
 * No paid text, no invented progress, no percentage.
 */
const PREPARING_MESSAGES = [
  "Building your Song Intelligence report\u2026",
  "Composing the CHRP reading\u2026",
  "Placing it in context\u2026",
];

export function ReportPreparing({
  report,
  paid = false,
}: {
  report: FreeReport | null;
  /**
   * True on the return from a successful Stripe checkout. The creator has
   * just given CHRP money and then, previously, watched an empty viewport
   * for thirty-four seconds. Acknowledging the payment is the first thing
   * this screen owes them.
   */
  paid?: boolean;
}) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setMessageIndex((i) => (i + 1) % PREPARING_MESSAGES.length),
      3600,
    );
    return () => clearInterval(id);
  }, []);

  const chip = report ? MODE_COLORS[report.epi.mode] : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      {/* The aura sits behind the instrument, not behind the page. Scoped to
          the full viewport it stops being atmosphere and becomes wallpaper. */}
      <div className="chrp-aura w-full max-w-md flex flex-col items-center">
        {paid && (
          <div className="rp-paid-ack" role="status">
            <span aria-hidden>&#10003;</span> Payment received
          </div>
        )}
        <div className="font-sans text-[11px] tracking-wider uppercase text-ink-soft mb-3">
          CHRP &nbsp;//&nbsp; Emotional Intelligence
        </div>

        <div
          className="font-display italic text-[18px] md:text-[20px] text-chrp-black text-center mb-10 min-h-[3rem]"
          role="status"
          aria-live="polite"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={messageIndex}
              // The first message must not animate in: an opacity-0 initial
              // state is what the server renders, so on a direct load the
              // line would be invisible until hydration finished.
              initial={messageIndex === 0 ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4 }}
            >
              {PREPARING_MESSAGES[messageIndex]}
            </motion.div>
          </AnimatePresence>
        </div>

        <div style={{ minHeight: 280 }}>
          {report ? (
            <PolygonRadar
              vertices={polygonFromChrpScores(report.chrp_scores)}
              mode={report.epi.mode}
              epiScore={report.epi.score}
              size={280}
            />
          ) : (
            <div style={{ width: 280, height: 280 }} aria-hidden />
          )}
        </div>

        {report && chip && (
          <div
            className="mode-pill mt-4"
            style={{ backgroundColor: chip.chipBg, color: chip.chipText }}
          >
            <span className="font-sans font-bold text-[13px]">
              {report.epi.mode} mode
            </span>
          </div>
        )}

        {report && (
          <div className="mt-10 font-sans text-[10px] tracking-wider uppercase text-ink-light text-center">
            {report.track.title} &nbsp;//&nbsp; {report.track.artist}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── The boundary ────────────────────────────────────────────────────────────
/**
 * The paywall. Nothing paid is rendered behind
 * a filter. The boundary is stated as a list: here is what you have, here is
 * what you do not. Paid section contents are not present in this tree.
 */
function Boundary({ scanId }: { scanId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="rv-boundary">
      <div className="rv-inner">
        <h2>The full report tells you what to do with it.</h2>

        <div className="rv-cols">
          <div className="rv-have">
            <p className="rv-have-head">You already have this</p>
            {FREE_ITEMS.map((i) => (
              <p key={i}>{i}</p>
            ))}
            <p className="rv-have-foot">
              Yours to keep, with your songs.
            </p>
          </div>

          <div className="rv-adds">
            <p className="rv-adds-head">The full report adds</p>
            {PAID_HIERARCHY.map((h) => (
              <div key={h.n} className="rv-add">
                <p className="rv-add-n">{h.n}</p>
                <p className="rv-add-title">{h.title}</p>
              </div>
            ))}

            <div className="rv-price">
              <p>$19</p>
              <p>this song</p>
            </div>
            <button
              type="button"
              className="rv-buy"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                beginPurchase("song_intelligence", scanId, (m) => {
                  setErr(m);
                  setBusy(false);
                });
              }}
            >
              {busy ? "Opening checkout…" : "Unlock this song"}
            </button>
            <button
              type="button"
              className="rv-buy-alt"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                beginPurchase("creator_intelligence", scanId, (m) => {
                  setErr(m);
                  setBusy(false);
                });
              }}
            >
              Understand your catalog &middot; $149
            </button>
            {err && (
              <p className="rv-terms" style={{ color: "#8A2B4F" }} role="alert">
                {err}
              </p>
            )}
            <p className="rv-terms">
              Report access runs 60 days on a single song, 12 months on a
              catalog.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Catalog close ───────────────────────────────────────────────────────────
/**
 * The catalog argument becomes the closing movement of the paid report
 * rather than a thin band in the footer — by this point the artist has just
 * read something useful and the argument writes itself.
 */
function CatalogClose({
  scanId,
  includedFirst = false,
}: {
  scanId: string;
  includedFirst?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="bg-oat px-6 md:px-10 py-12 md:py-16 border-t border-rule">
      <div className="max-w-[720px] mx-auto text-center">
        <div className="font-sans font-black text-[10px] tracking-wider uppercase text-ink-soft">
          {includedFirst ? "Your first complete report is on us" : "Understand the work"}
        </div>
        <h2 className="mt-3 font-display text-[30px] md:text-[42px] leading-[1.05] text-chrp-black display-tight">
          {includedFirst
            ? "Want to understand another song?"
            : "One song tells you something. A catalog tells you who you are."}
        </h2>
        <p className="mt-4 font-sans text-[14px] leading-[1.6] text-ink-soft max-w-[52ch] mx-auto">
          {includedFirst
            ? "Your first complete report is on us. Understanding another song is $19, or $149 for your catalog."
            : "Each song you add changes what the others mean. Creator profile unlocks at eight songs."}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
          <Link
            href="/scan"
            className="font-sans font-bold text-[12.5px] tracking-wider uppercase bg-chrp-black text-chrp-white px-6 py-3.5 text-center"
          >
            {includedFirst ? "Understand another song — $19" : "Scan another song"}
          </Link>
          {/* Goes through the SAME real Stripe path as the paywall button
              above. It previously linked to /scan/[id]/checkout-tier, the
              demo checkout page — which resolves its song through the
              fixture catalogue, so a real song 404'd there, and which is
              hard-disabled in production anyway. One offer, one price, one
              route. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              beginPurchase("creator_intelligence", scanId, (m) => {
                setErr(m);
                setBusy(false);
              });
            }}
            className="font-sans font-bold text-[12.5px] tracking-wider uppercase px-6 py-3.5 text-center"
            style={{
              backgroundColor: "var(--chrp-yellow)",
              color: "var(--chrp-black)",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy
              ? "Opening checkout…"
              : "Understand your catalog — $149"}
          </button>
        </div>
        {err && (
          <p
            className="mt-4 font-sans text-[12.5px]"
            style={{ color: "#C990B8" }}
            role="alert"
          >
            {err}
          </p>
        )}
      </div>
    </section>
  );
}

// ─── Entitled, but no report can honestly be produced ────────────────────────
/**
 * Production-safe failure. If generation is unavailable after a legitimate
 * payment we say so plainly: the entitlement is preserved server-side, the
 * page is recoverable by reloading, and nothing is fabricated to fill the
 * space. A fixture must never be passed off as freshly generated output.
 */
function ReportUnavailable({ note }: { note: string | null }) {
  return (
    <section className="rv">
      <div className="rv-inner" style={{ maxWidth: 620 }}>
        <p className="rv-kicker">Your purchase is safe</p>
        <h2 style={{ margin: 0 }} className="rv-title">
          Your report is still being prepared.
        </h2>
        <p className="rv-keep" style={{ maxWidth: "52ch", marginTop: 16 }}>
          {note ??
            "We could not generate your Song Intelligence just now. Your access is recorded and nothing has been lost."}
        </p>
        <p className="rv-note" style={{ marginTop: 14 }}>
          Reload this page in a moment. If it keeps happening, contact us and
          quote this scan — your entitlement is on file.
        </p>
        <div className="rv-actions">
          <Link href="/dashboard" className="rv-save">
            Go to my songs
          </Link>
        </div>
      </div>
    </section>
  );
}
