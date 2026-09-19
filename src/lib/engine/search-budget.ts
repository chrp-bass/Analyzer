/**
 * Daily budget for Soundcharts calls made by the search fallback.
 *
 * Soundcharts is metered. Analysis already spends quota on every scan; the
 * search fallback is ADDITIONAL quota that is only ever spent while Spotify
 * search is failing. This caps it per UTC day so an outage — or someone
 * hammering the search box during one — cannot drain the account.
 *
 * Two buckets, because they are different acts with different prices:
 *   search  a name search: one search call plus one metadata lookup per
 *           result shown (the search response carries no ISRC).
 *   link    a pasted Spotify link: a single platform-id lookup. Kept
 *           separate so that when name search is capped, "paste a Spotify
 *           link" — which is what the capped message tells people to do —
 *           still works.
 *
 * LIMITATION, stated plainly: the counter lives in this serverless
 * instance's memory. Vercel may run several instances, each with its own
 * counter, and a cold start resets it. So this is a per-instance ceiling
 * that bounds the worst case; it is not an exact global count. An exact cap
 * needs a shared counter (a database row), which is a deliberate follow-up
 * rather than something to bolt on mid-outage.
 *
 * Pure module with an injectable clock so the rollover is testable.
 */

export type BudgetBucket = "search" | "link";

export const DAILY_LIMITS: Record<BudgetBucket, number> = {
  search: 200,
  link: 500,
};

export interface SearchBudget {
  /** Spend one unit if any remain. False means the cap is hit. */
  tryConsume(bucket: BudgetBucket): boolean;
  /** Units spent today, for logging. */
  used(bucket: BudgetBucket): number;
  limit(bucket: BudgetBucket): number;
}

export function createSearchBudget(
  limits: Record<BudgetBucket, number> = DAILY_LIMITS,
  now: () => number = Date.now,
): SearchBudget {
  let day = "";
  let counts: Record<BudgetBucket, number> = { search: 0, link: 0 };

  const roll = () => {
    const today = new Date(now()).toISOString().slice(0, 10); // UTC day
    if (today !== day) {
      day = today;
      counts = { search: 0, link: 0 };
    }
  };

  return {
    tryConsume(bucket) {
      roll();
      if (counts[bucket] >= limits[bucket]) return false;
      counts[bucket] += 1;
      return true;
    },
    used(bucket) {
      roll();
      return counts[bucket];
    },
    limit(bucket) {
      return limits[bucket];
    },
  };
}
