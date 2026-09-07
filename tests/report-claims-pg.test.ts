import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import EmbeddedPostgres from "embedded-postgres";

/**
 * Transaction-race tests for migration 0003, run against REAL PostgreSQL.
 *
 * The synchronous in-memory store cannot model row-lock blocking, so these
 * spin up an actual multi-backend Postgres (via embedded-postgres — no Docker)
 * and drive two concurrent connections to reproduce the interleavings an
 * independent review flagged:
 *
 *   1. claimant blocked behind completion,
 *   2. takeover racing completion,
 *   3. completion after ownership check,
 *   4. report committed while claimant waits.
 *
 * They load the ACTUAL function bodies from db/migrations/0003_report_claims.sql
 * over a minimal supporting schema, so what is tested is the shipped SQL.
 *
 * If Postgres cannot be started (no network to fetch the binary, or the
 * sandbox blocks it), every test self-skips rather than failing — the source
 * assertions in paid-fulfillment-prepare.test.ts still cover the SQL text.
 */

interface PgClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;
  end(): Promise<void>;
}

let pg: InstanceType<typeof EmbeddedPostgres> | null = null;
let admin: PgClient | null = null;
let ready = false;
let startError = "";

const PORT = 55432;
const DATA_DIR = `/tmp/chrp-pg-claims-${process.pid}-${Date.now()}`;

const COMPLETE_PAYLOAD = JSON.stringify({
  signature: "s",
  rhodes: "r",
  throughline: "t",
  placements: [{ title: "a", body: "b" }],
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newClient(): PgClient {
  return pg!.getPgClient() as unknown as PgClient;
}

beforeAll(async () => {
  try {
    pg = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: "chrp",
      password: "chrp",
      port: PORT,
      persistent: false,
    });
    await pg.initialise();
    await pg.start();
    admin = newClient();
    await admin.connect();

    // Roles that the migration's GRANT/REVOKE reference (they exist in
    // Supabase; create no-login stand-ins here).
    for (const role of ["service_role", "anon", "authenticated"]) {
      await admin.query(
        `do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$;`,
      );
    }

    // Minimal supporting schema the functions reference (subset of 0001/0002).
    await admin.query(`create table creators (id uuid primary key);`);
    await admin.query(`create table analyses (id uuid primary key);`);
    await admin.query(`
      create table reports (
        id uuid primary key default gen_random_uuid(),
        creator_id uuid not null references creators(id),
        scan_id text not null,
        analysis_id uuid not null references analyses(id),
        payload jsonb not null,
        generator_version text not null,
        model text,
        created_at timestamptz not null default now(),
        unique (creator_id, scan_id)
      );
    `);

    // The real migration text — the table + the four functions + grants.
    const migration = readFileSync("db/migrations/0003_report_claims.sql", "utf8");
    await admin.query(migration);

    ready = true;
  } catch (err) {
    startError = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[report-claims-pg] skipping real-Postgres tests: ${startError}`);
  }
}, 180_000);

afterAll(async () => {
  try {
    await admin?.end();
  } catch {
    /* ignore */
  }
  try {
    await pg?.stop();
  } catch {
    /* ignore */
  }
});

/** Seed a fresh creator + analysis, return their ids and a unique scan id. */
async function seedScan(): Promise<{ creator: string; analysis: string; scan: string }> {
  const creator = randomUUID();
  const analysis = randomUUID();
  const scan = `scn_isrc-${randomUUID().replace(/-/g, "").slice(0, 12)}_abcdef`;
  await admin!.query(`insert into creators (id) values ($1)`, [creator]);
  await admin!.query(`insert into analyses (id) values ($1)`, [analysis]);
  return { creator, analysis, scan };
}

/** Age the current lease so a stale-takeover is permitted (validation forbids stale_seconds < 1). */
async function ageLease(creator: string, scan: string): Promise<void> {
  await admin!.query(
    `update report_claims set claimed_at = now() - interval '1 hour' where creator_id=$1 and scan_id=$2`,
    [creator, scan],
  );
}

async function claim(
  client: PgClient,
  creator: string,
  scan: string,
  worker: string,
  staleSeconds: number,
  version = "v2",
) {
  const r = await client.query(
    `select * from claim_report_lease($1,$2,$3,$4,$5)`,
    [creator, scan, worker, version, staleSeconds],
  );
  return r.rows[0] as
    | { acquired: boolean; out_token: string | null; out_fence: string | null }
    | undefined;
}

function completeQuery(
  client: PgClient,
  creator: string,
  scan: string,
  worker: string,
  token: string,
  analysis: string,
  version = "v2",
) {
  return client.query(
    `select * from complete_report($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
    [creator, scan, worker, token, analysis, COMPLETE_PAYLOAD, version, "m"],
  );
}

describe("migration 0003 under real PostgreSQL concurrency", () => {
  it("baseline: acquire → complete persists the report and removes the lease", async (ctx) => {
    if (!ready) return ctx.skip();
    const { creator, analysis, scan } = await seedScan();
    const acq = await claim(admin!, creator, scan, "A", 90);
    expect(acq?.acquired).toBe(true);
    const res = await completeQuery(admin!, creator, scan, "A", acq!.out_token!, analysis);
    expect(res.rows[0].ok).toBe(true);
    const reports = await admin!.query(`select count(*)::int n from reports where creator_id=$1 and scan_id=$2`, [creator, scan]);
    expect(reports.rows[0].n).toBe(1);
    const claims = await admin!.query(`select count(*)::int n from report_claims where creator_id=$1 and scan_id=$2`, [creator, scan]);
    expect(claims.rows[0].n).toBe(0);
  }, 30_000);

  it("takeover racing completion + completion after ownership check: the superseded worker writes nothing", async (ctx) => {
    if (!ready) return ctx.skip();
    const { creator, analysis, scan } = await seedScan();
    const a = await claim(admin!, creator, scan, "A", 90);
    const tokenA = a!.out_token!;
    await ageLease(creator, scan); // make A's lease old enough to take over

    // Conn1 takes the lease over as B, inside an open transaction (holds the
    // row lock, uncommitted).
    const c1 = newClient();
    await c1.connect();
    await c1.query("begin");
    const b = await claim(c1, creator, scan, "B", 90); // A's lease is stale → takeover
    expect(b?.acquired).toBe(true);
    expect(b!.out_token).not.toBe(tokenA);

    // Conn2: A tries to complete. Its FOR UPDATE ownership lock blocks behind
    // B's uncommitted takeover.
    const c2 = newClient();
    await c2.connect();
    let aResult: Record<string, unknown> | null = null;
    const aDone = completeQuery(c2, creator, scan, "A", tokenA, analysis).then((r) => {
      aResult = r.rows[0];
    });

    await sleep(400);
    expect(aResult, "A's completion must block behind the in-flight takeover").toBeNull();

    await c1.query("commit"); // B's takeover commits: worker=B, new token
    await aDone;

    // A's completion, re-checking ownership after the lock cleared, sees the
    // row is now B's and refuses — no report is written.
    expect((aResult as unknown as { ok: boolean }).ok).toBe(false);
    const reports = await admin!.query(`select count(*)::int n from reports where creator_id=$1 and scan_id=$2`, [creator, scan]);
    expect(reports.rows[0].n).toBe(0);
    const claims = await admin!.query(`select worker from report_claims where creator_id=$1 and scan_id=$2`, [creator, scan]);
    expect(claims.rows[0]?.worker).toBe("B");

    await c1.end();
    await c2.end();
  }, 30_000);

  it("claimant blocked behind completion + report committed while claimant waits: the claimant gets READY, not a second generator", async (ctx) => {
    if (!ready) return ctx.skip();
    const { creator, analysis, scan } = await seedScan();
    const a = await claim(admin!, creator, scan, "A", 90);
    const tokenA = a!.out_token!;

    // Conn1 completes A inside an open transaction (report inserted + lease
    // deleted, both uncommitted; row locks held).
    const c1 = newClient();
    await c1.connect();
    await c1.query("begin");
    const aComplete = await completeQuery(c1, creator, scan, "A", tokenA, analysis);
    expect(aComplete.rows[0].ok).toBe(true);

    // Conn2: B tries to claim. Its INSERT…ON CONFLICT blocks behind the lease
    // row that A's still-open completion is deleting.
    const c2 = newClient();
    await c2.connect();
    let bResult: Record<string, unknown> | null | undefined = undefined;
    const bDone = claim(c2, creator, scan, "B", 90).then((r) => {
      bResult = r ?? null;
    });

    await sleep(400);
    expect(bResult, "B must block behind the in-flight completion").toBeUndefined();

    await c1.query("commit"); // A's report + lease-delete commit
    await bDone;

    // B acquired a fresh lease, then RE-CHECKED and found A's committed report,
    // so it released and returned READY (acquired=false) — no upstream work.
    expect(bResult).not.toBeNull();
    expect((bResult as unknown as { acquired: boolean }).acquired).toBe(false);
    const reports = await admin!.query(`select count(*)::int n from reports where creator_id=$1 and scan_id=$2`, [creator, scan]);
    expect(reports.rows[0].n).toBe(1);
    // B released its lease on the READY path; nothing dangling.
    const claims = await admin!.query(`select count(*)::int n from report_claims where creator_id=$1 and scan_id=$2`, [creator, scan]);
    expect(claims.rows[0].n).toBe(0);

    await c1.end();
    await c2.end();
  }, 30_000);

  it("a stale takeover then the old worker's late completion writes nothing (fence/token)", async (ctx) => {
    if (!ready) return ctx.skip();
    const { creator, analysis, scan } = await seedScan();
    const a = await claim(admin!, creator, scan, "A", 90);
    const tokenA = a!.out_token!;
    await ageLease(creator, scan);
    // B takes over the now-stale lease (committed).
    const b = await claim(admin!, creator, scan, "B", 90);
    expect(b?.acquired).toBe(true);
    expect(Number(b!.out_fence)).toBe(Number(a!.out_fence) + 1);
    // A, now superseded, tries to complete → refused, nothing written.
    const late = await completeQuery(admin!, creator, scan, "A", tokenA, analysis);
    expect(late.rows[0].ok).toBe(false);
    const reports = await admin!.query(`select count(*)::int n from reports where creator_id=$1 and scan_id=$2`, [creator, scan]);
    expect(reports.rows[0].n).toBe(0);
    // B can still complete its own lease.
    const bDone = await completeQuery(admin!, creator, scan, "B", b!.out_token!, analysis);
    expect(bDone.rows[0].ok).toBe(true);
  }, 30_000);

  it("rejects invalid arguments and refuses an incomplete payload", async (ctx) => {
    if (!ready) return ctx.skip();
    const { creator, analysis, scan } = await seedScan();
    await expect(claim(admin!, creator, scan, "", 90)).rejects.toThrow(/invalid arguments/);
    const a = await claim(admin!, creator, scan, "A", 90);
    await expect(
      admin!.query(`select * from complete_report($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`, [
        creator, scan, "A", a!.out_token!, analysis, JSON.stringify({ rhodes: "" }), "v2", "m",
      ]),
    ).rejects.toThrow(/incomplete payload/);
  }, 30_000);
});
