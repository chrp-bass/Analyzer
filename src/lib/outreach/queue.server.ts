import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { runBatch } from "@/lib/outreach/batch-scan";
import {
  depsFor,
  ensureOutreachCreator,
  insertBatchItem,
  type Db,
} from "@/lib/outreach/batch-scan.server";
import { claimSite } from "@/lib/outreach/claim";
import {
  runQueue,
  type QueueDeps,
  type QueueRow,
  type QueueRunSummary,
} from "@/lib/outreach/queue";

/**
 * Production wiring for the outreach queue worker. Each row goes through
 * `runBatch` with the admin batch scan's own production dependencies
 * (`depsFor`) — only `record` is extended, to carry the queue's segment and
 * a fresh claim link onto the outreach_batch_items row and hand back its id.
 */

/** 192 bits, URL-safe. The only thing a claim link carries. */
export function newClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

export function queueDeps(db: Db, creatorId: string): QueueDeps {
  return {
    async lease(limit, leaseSeconds, maxAttempts) {
      const { data, error } = await db.rpc("claim_outreach_queue", {
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
        p_max_attempts: maxAttempts,
      });
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },

    async scan(row, deadlineMs) {
      let itemId: string | null = null;
      const base = depsFor(db, creatorId, false);
      const run = await runBatch(
        {
          ...base,
          deadlineMs,
          async record(result) {
            const recordable = result.status === "scored" || result.status === "no_quotable_finding";
            const token = recordable ? newClaimToken() : null;
            const id = await insertBatchItem(db, result, {
              segment: row.segment,
              claim_token: token,
              claim_url: token ? `${claimSite()}/claim/${token}` : null,
            });
            if (recordable) itemId = id;
          },
        },
        {
          batch_id: row.batch_id,
          dry_run: false,
          items: [{ artist: row.artist, title: row.track, instagram: row.instagram }],
        },
      );
      return { run, itemId };
    },

    async finish(row, outcome) {
      const patch =
        outcome.status === "done"
          ? { status: "done", outreach_item_id: outcome.outreach_item_id, error: outcome.error, lease_until: null }
          : { status: outcome.status, error: outcome.error, lease_until: null };
      const { error } = await db
        .from("outreach_queue")
        .update(patch)
        .eq("id", row.id)
        .eq("status", "processing")
        .eq("attempts", row.attempts);
      if (error) throw error;
    },

    async release(row) {
      const { error } = await db
        .from("outreach_queue")
        .update({ status: "pending", attempts: Math.max(0, row.attempts - 1), lease_until: null })
        .eq("id", row.id)
        .eq("status", "processing")
        .eq("attempts", row.attempts);
      if (error) throw error;
    },

    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => console.log(line),
  };
}

export async function runOutreachQueue(): Promise<QueueRunSummary> {
  if (!adminConfigured()) throw new Error("Supabase admin client is not configured");
  const db = createAdminClient();
  const creatorId = await ensureOutreachCreator(db);
  return runQueue(queueDeps(db, creatorId));
}
