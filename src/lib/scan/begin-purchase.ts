import type { PrepareOutcome } from "@/lib/data-source";

/**
 * Checkout gating for the unpaid flow.
 *
 * For Song Intelligence the complete report is prepared and persisted on the
 * server FIRST — analysis, enrichments, Christian context, the governed
 * Rhodes text — and checkout is bound to that exact report. If it cannot be
 * prepared, checkout never opens and nothing is charged. The browser is told
 * only that the report is ready, never what it says.
 *
 * This is the ONLY place on the client that invokes the preparer. The paid
 * read path (`read-path.ts`) never does.
 */
export type OfferKey = "song_intelligence" | "creator_intelligence";

export interface PurchaseDeps {
  ensureIdentity(): Promise<string | null>;
  prepareReport(scanId: string): Promise<PrepareOutcome>;
  startCheckout(
    offer: OfferKey,
    scanId: string,
    readiness?: { reportId: string; reportVersion: string },
  ): Promise<{ url: string }>;
  navigate(url: string): void;
}

export async function beginPurchaseWith(
  deps: PurchaseDeps,
  offer: OfferKey,
  scanId: string,
  onError: (msg: string) => void,
  onPhase?: (phase: "preparing" | "checkout") => void,
): Promise<void> {
  try {
    await deps.ensureIdentity();
    let readiness: { reportId: string; reportVersion: string } | undefined;
    if (offer === "song_intelligence") {
      onPhase?.("preparing");
      const prepared = await deps.prepareReport(scanId);
      if (prepared.status !== "ready") {
        onError(prepared.message);
        return;
      }
      readiness = prepared.readiness;
    }
    onPhase?.("checkout");
    const { url } = await deps.startCheckout(offer, scanId, readiness);
    deps.navigate(url);
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
