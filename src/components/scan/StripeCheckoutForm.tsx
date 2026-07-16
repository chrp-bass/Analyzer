"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createCheckoutSession,
  getCheckoutSessionMeta,
  simulatePaymentSuccess,
  TIERS,
} from "@/lib/payments";
import { ProductId } from "@/lib/accounts";
import { sendMagicLink, sendReceipt } from "@/lib/email";

// Beta-mode gate. Defaults to ON; flipped off by setting NEXT_PUBLIC_BETA_MODE
// to "false" once real Stripe checkout takes over. All card-form code below
// stays intact and is only suppressed via {!BETA_MODE && ...} so flipping the
// env var brings it back without a code change.
const BETA_MODE = process.env.NEXT_PUBLIC_BETA_MODE !== "false";
const PROMO_CODE = (
  process.env.NEXT_PUBLIC_PROMO_CODE ?? "EARLYACCESS"
).toUpperCase();

type Mode = "single" | "tier";

export function StripeCheckoutForm({
  scanId,
  mode,
  productSlug,
  trackTitle,
  trackArtist,
}: {
  scanId: string;
  mode: Mode;
  productSlug: ProductId;
  trackTitle: string;
  trackArtist: string;
}) {
  const router = useRouter();
  const search = useSearchParams();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [productId, setProductId] = useState<ProductId>(productSlug);
  const [email, setEmail] = useState(search.get("email") ?? "");
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [zip, setZip] = useState("");
  const [promo, setPromo] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessionParam = search.get("session");
      if (sessionParam) {
        const meta = await getCheckoutSessionMeta(sessionParam);
        if (meta && !cancelled) {
          setSessionId(sessionParam);
          setProductId(meta.productId);
          return;
        }
      }
      const session = await createCheckoutSession(productSlug, scanId);
      if (!cancelled) {
        setSessionId(session.sessionId);
        setProductId(session.productId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productSlug, scanId, search]);

  const tier = TIERS[productId];
  const priceCents = tier.priceUsd * 100;
  const priceDisplay = `$${tier.priceUsd.toFixed(2)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (processing || !sessionId) return;
    if (!email.includes("@")) {
      setError("Enter an email address to receive your receipt.");
      return;
    }
    if (BETA_MODE && promo.trim().toUpperCase() !== PROMO_CODE) {
      setError(
        `That code isn't valid. Early access code is ${PROMO_CODE}.`,
      );
      return;
    }
    setError(null);
    setProcessing(true);
    try {
      // Visual: 2-second Processing state, then unlock.
      await new Promise((r) => setTimeout(r, 2000));
      const result = await simulatePaymentSuccess(sessionId, email);
      await sendMagicLink(email);
      await sendReceipt("demo", result.scanId);
      // Unblur-in-place: route back to the preview, which detects paid
      // status and animates the gated sections from blurred to unblurred.
      router.push(
        `/scan/${result.scanId}/preview?welcome=1&email=${encodeURIComponent(email)}`,
      );
    } catch (err) {
      console.error(err);
      setError("Payment simulation failed. Refresh and try again.");
      setProcessing(false);
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#f7f7f9" }}
    >
      <div className="max-w-[440px] mx-auto px-5 py-10">
        <div className="flex items-center gap-2 mb-5">
          <div className="font-sans font-black text-[14px] tracking-wider text-chrp-black">
            CHRP
          </div>
          <div className="font-sans text-[11px] text-ink-light">
            Powered by Demo Checkout
          </div>
        </div>

        <div className="bg-white border border-[#e6e6e6] p-6 rounded-md">
          <div className="font-sans text-[12px] text-[#6b7280]">
            Pay CHRP, Inc.
          </div>
          <div className="font-sans font-bold text-[28px] text-[#1f2937] leading-none mt-1">
            {priceDisplay}
          </div>
          <div className="font-sans text-[12px] text-[#6b7280] mt-1">
            {tier.label} &nbsp;·&nbsp; {tier.blurb}
          </div>
          {mode === "single" && (
            <div className="font-sans text-[11px] text-[#9ca3af] mt-2">
              {trackTitle} &mdash; {trackArtist}
            </div>
          )}

          <hr className="border-[#e6e6e6] my-4" />

          <form onSubmit={submit} className="flex flex-col gap-2.5">
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@studio.com"
              autoComplete="email"
            />

            {BETA_MODE ? (
              <Field
                label="Promo code"
                value={promo}
                onChange={(v) => setPromo(v.toUpperCase())}
                placeholder="EARLYACCESS"
                autoComplete="off"
              />
            ) : (
              <>
                <Field
                  label="Card number"
                  value={card}
                  onChange={setCard}
                  placeholder="1234 1234 1234 1234"
                  inputMode="numeric"
                  autoComplete="cc-number"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Expiry"
                    value={exp}
                    onChange={setExp}
                    placeholder="MM / YY"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                  />
                  <Field
                    label="CVC"
                    value={cvc}
                    onChange={setCvc}
                    placeholder="CVC"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                  />
                </div>
                <Field
                  label="Billing ZIP"
                  value={zip}
                  onChange={setZip}
                  placeholder="ZIP"
                  inputMode="numeric"
                  autoComplete="postal-code"
                />
              </>
            )}

            {error && (
              <div className="font-sans text-[12px] text-plum mt-1">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={processing}
              className="mt-3 inline-flex items-center justify-center gap-2 font-sans font-bold text-[14px] bg-chrp-black text-chrp-white px-6 py-3 rounded-md disabled:opacity-70"
            >
              {processing ? (
                <>
                  <Spinner />
                  Processing…
                </>
              ) : BETA_MODE ? (
                <>Unlock with early access</>
              ) : (
                <>Pay {priceDisplay}</>
              )}
            </button>

            {BETA_MODE ? (
              <div className="font-sans text-[11px] text-ink-light text-center mt-3">
                Early access: $19 a song, $149 for 10. No card required while
                the code is active.
              </div>
            ) : (
              <div className="font-sans text-[11px] text-[#9ca3af] text-center mt-3">
                Demo checkout · no card data is captured · {priceCents}¢
                simulated charge
              </div>
            )}
          </form>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => router.back()}
            className="font-sans text-[12px] text-[#6b7280] hover:text-[#1f2937]"
          >
            ← Cancel and go back
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "email";
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-sans text-[12px] text-[#374151]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className="font-sans text-[14px] text-[#1f2937] bg-white border border-[#e6e6e6] px-3 py-2.5 rounded-md focus:outline-none focus:border-[#1f2937]"
      />
    </label>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block w-4 h-4 border-2 border-chrp-white border-t-transparent rounded-full animate-spin"
    />
  );
}
