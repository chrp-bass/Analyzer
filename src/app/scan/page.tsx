import { ScanInput } from "@/components/ScanInput";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { trackOptions } from "@/lib/fixtures/tracks";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <div className="product-shell">
      <SiteHeader showCta={false} />
      <main>
        <section className="page-hero">
          <div className="wrap">
            <span className="eyebrow">Step 1 of 3</span>
            <h1>Paste a Spotify link.</h1>
            <p className="sub">
              We&rsquo;ll resolve the track, read its emotional fingerprint, and
              place it on the CHRP grid in about ten seconds.
            </p>
          </div>
        </section>

        <section className="page-band">
          <div className="wrap" style={{ maxWidth: 680 }}>
            <ScanInput />

            <div style={{ marginTop: 64 }}>
              <span
                className="eyebrow"
                style={{ display: "block", marginBottom: 18 }}
              >
                Try one of ours
              </span>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {trackOptions.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "baseline",
                      gap: 16,
                      padding: "14px 0",
                      borderBottom: "1px solid var(--line-light)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--d)",
                        fontWeight: 300,
                        fontSize: 22,
                        color: "var(--on-light)",
                      }}
                    >
                      {t.label}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--s)",
                        fontSize: 12,
                        color: "var(--on-light-2)",
                      }}
                    >
                      {t.hint}
                    </span>
                  </li>
                ))}
              </ul>
              <p
                style={{
                  marginTop: 18,
                  fontSize: 12.5,
                  color: "var(--on-light-2)",
                  lineHeight: 1.55,
                }}
              >
                Type any of the names above in the field, paste a Spotify URL,
                or paste any text &mdash; the demo will route to one of the six
                sample tracks.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
