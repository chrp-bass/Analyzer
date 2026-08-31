import { describe, expect, it } from "vitest";
import {
  consumeCreditForCompletedAnalysis,
  creditSummary,
  resolveAccess,
} from "@/lib/commerce/credit-service";
import {
  InMemoryEntitlementStore,
  creatorEntitlement,
  songEntitlement,
} from "./support/memory-store";

/**
 * The commerce contract, asserted against the same rule functions production
 * calls. Each test names a way real money could be mishandled.
 */

const ALICE = "user_alice";
const BOB = "user_bob";

const DAY = 86_400_000;

describe("$19 Song Intelligence", () => {
  it("grants exactly the song it was purchased against", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(songEntitlement(ALICE, "scn_redline_aaa111"));

    const bought = await resolveAccess(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );
    expect(bought.ok).toBe(true);

    // A different scan — even one the same person ran — is not covered.
    const other = await resolveAccess(
      store,
      ALICE,
      "scn_sea-glass_bbb222",
      "sea-glass",
    );
    expect(other).toEqual({ ok: false, reason: "no_entitlement" });
  });

  it("denies after its 60-day window closes", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(
      songEntitlement(ALICE, "scn_redline_aaa111", {
        expires_at: new Date(Date.now() - DAY).toISOString(),
      }),
    );

    const result = await resolveAccess(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("denies once refunded", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(
      songEntitlement(ALICE, "scn_redline_aaa111", { status: "refunded" }),
    );

    const result = await resolveAccess(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("$149 Creator Intelligence — credit ledger", () => {
  it("starts at 10 available and spends one per distinct completed song", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(creatorEntitlement(ALICE));

    // Purchase alone spends nothing — paying is not analysing.
    expect(await creditSummary(store, ALICE)).toMatchObject({
      limit: 10,
      used: 0,
      remaining: 10,
    });

    const first = await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );
    expect(first).toMatchObject({ ok: true, consumed: true, remaining: 9 });

    const second = await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_sea-glass_bbb222",
      "sea-glass",
    );
    expect(second).toMatchObject({ ok: true, consumed: true, remaining: 8 });

    expect(await creditSummary(store, ALICE)).toMatchObject({
      used: 2,
      remaining: 8,
    });
  });

  it("retains the balance across a later session", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(creatorEntitlement(ALICE));
    await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );

    // A new session asks the server again and gets the same truth. Nothing
    // about the balance lived in the previous browser.
    const later = await creditSummary(store, ALICE, new Date(Date.now() + 30 * DAY));
    expect(later).toMatchObject({ used: 1, remaining: 9 });
  });

  it("charges nothing to re-open, refresh, or replay the same song", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(creatorEntitlement(ALICE));

    await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );
    expect(store.insertCount).toBe(1);

    // Re-open, refresh, and a webhook replay all resolve to a key that is
    // already attached.
    for (const scanId of [
      "scn_redline_aaa111",
      "scn_redline_aaa111",
      "scn_redline_ccc333", // a second scan of the SAME song
    ]) {
      const again = await consumeCreditForCompletedAnalysis(
        store,
        ALICE,
        scanId,
        "redline",
      );
      expect(again).toMatchObject({ ok: true, consumed: false, remaining: 9 });
    }

    expect(store.insertCount).toBe(1);
    expect(await creditSummary(store, ALICE)).toMatchObject({ remaining: 9 });
  });

  it("charges nothing when an analysis never completes", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(creatorEntitlement(ALICE));

    // A failed or pending analysis simply never calls consume — which is why
    // consumption is a separate step. The balance is untouched, and the
    // unfinished song grants no access.
    expect(await creditSummary(store, ALICE)).toMatchObject({ remaining: 10 });
    expect(store.insertCount).toBe(0);

    const access = await resolveAccess(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );
    expect(access).toEqual({ ok: false, reason: "no_entitlement" });
  });

  it("blocks the 11th distinct song and spends nothing", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(creatorEntitlement(ALICE));

    for (let i = 0; i < 10; i++) {
      const result = await consumeCreditForCompletedAnalysis(
        store,
        ALICE,
        `scn_track${i}_zzz${i}`,
        `track-${i}`,
      );
      expect(result).toMatchObject({ ok: true, consumed: true });
    }
    expect(await creditSummary(store, ALICE)).toMatchObject({
      used: 10,
      remaining: 0,
    });

    const eleventh = await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_track10_zzz10",
      "track-10",
    );
    expect(eleventh).toEqual({ ok: false, reason: "limit_reached" });
    expect(store.insertCount).toBe(10);

    // The 10 already paid for still open.
    const stillOpen = await resolveAccess(
      store,
      ALICE,
      "scn_track0_zzz0",
      "track-0",
    );
    expect(stillOpen.ok).toBe(true);
  });

  it("stops granting and stops spending once the 12-month window closes", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(
      creatorEntitlement(ALICE, {
        expires_at: new Date(Date.now() - DAY).toISOString(),
      }),
    );

    expect(
      await consumeCreditForCompletedAnalysis(
        store,
        ALICE,
        "scn_redline_aaa111",
        "redline",
      ),
    ).toEqual({ ok: false, reason: "expired" });
    expect(store.insertCount).toBe(0);
  });

  it("keeps access to already-attached songs for the full 12 months", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(creatorEntitlement(ALICE));
    await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );

    const day300 = new Date(Date.now() + 300 * DAY);
    expect(
      (await resolveAccess(store, ALICE, "scn_redline_aaa111", "redline", day300))
        .ok,
    ).toBe(true);

    const day400 = new Date(Date.now() + 400 * DAY);
    expect(
      await resolveAccess(store, ALICE, "scn_redline_aaa111", "redline", day400),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("revokes access on refund without deleting history", async () => {
    const store = new InMemoryEntitlementStore();
    const ent = store.addEntitlement(creatorEntitlement(ALICE));
    await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );

    ent.status = "refunded";
    expect(
      await resolveAccess(store, ALICE, "scn_redline_aaa111", "redline"),
    ).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("cross-creator isolation", () => {
  it("never exposes one creator's songs or balance to another", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(creatorEntitlement(ALICE));
    store.addEntitlement(songEntitlement(ALICE, "scn_redline_aaa111"));
    await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_sea-glass_bbb222",
      "sea-glass",
    );

    // Bob holds nothing. Alice's scans are not readable by him, and he has
    // no balance to spend — even though he names her exact scan ids.
    expect(
      await resolveAccess(store, BOB, "scn_redline_aaa111", "redline"),
    ).toEqual({ ok: false, reason: "no_entitlement" });
    expect(
      await resolveAccess(store, BOB, "scn_sea-glass_bbb222", "sea-glass"),
    ).toEqual({ ok: false, reason: "no_entitlement" });
    expect(await creditSummary(store, BOB)).toBeNull();
    expect(
      await consumeCreditForCompletedAnalysis(
        store,
        BOB,
        "scn_redline_aaa111",
        "redline",
      ),
    ).toEqual({ ok: false, reason: "no_entitlement" });
  });

  it("resolves the same catalog for the same identity on a different device", async () => {
    const store = new InMemoryEntitlementStore();
    store.addEntitlement(creatorEntitlement(ALICE));
    await consumeCreditForCompletedAnalysis(
      store,
      ALICE,
      "scn_redline_aaa111",
      "redline",
    );

    // A magic link on a new browser resolves to the same user id. Nothing is
    // carried across in the browser; the identity alone restores everything.
    const freshBrowser = new InMemoryEntitlementStore();
    freshBrowser.entitlements = store.entitlements;
    freshBrowser.tracks = store.tracks;

    expect(await creditSummary(freshBrowser, ALICE)).toMatchObject({
      used: 1,
      remaining: 9,
    });
    expect(
      (await resolveAccess(freshBrowser, ALICE, "scn_redline_aaa111", "redline"))
        .ok,
    ).toBe(true);
  });
});
