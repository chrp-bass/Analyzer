import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import EmbeddedPostgres from "embedded-postgres";

/**
 * The outreach_batch_items migration against real PostgreSQL: service-role
 * only, and the status vocabulary the route writes is the one the table
 * accepts.
 */
let pg: InstanceType<typeof EmbeddedPostgres>;
let client: { connect(): Promise<void>; query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>; end(): Promise<void> };

beforeAll(async () => {
  pg = new EmbeddedPostgres({ databaseDir: `/tmp/chrp-outreach-pg-${process.pid}-${Date.now()}`,
    user: "chrp", password: "chrp", port: 55435, persistent: false });
  await pg.initialise();
  await pg.start();
  client = pg.getPgClient() as unknown as typeof client;
  await client.connect();
  await client.query("create role anon nologin; create role authenticated nologin; create role service_role nologin;");
  await client.query("create table creators (id uuid primary key); create table analyses (id uuid primary key);");
  await client.query(readFileSync("supabase/migrations/20260926160000_outreach_batch_items.sql", "utf8"));
}, 180_000);

afterAll(async () => { await client?.end(); await pg?.stop(); });

describe("outreach_batch_items", () => {
  it("is a new service-only table with RLS on and no client privileges", async () => {
    const { rows } = await client.query(`select relrowsecurity from pg_class where relname = 'outreach_batch_items'`);
    expect(rows[0].relrowsecurity).toBe(true);
    const grants = await client.query(`select
      has_table_privilege('anon', 'outreach_batch_items', 'select') as anon_read,
      has_table_privilege('authenticated', 'outreach_batch_items', 'select') as auth_read,
      has_table_privilege('authenticated', 'outreach_batch_items', 'insert') as auth_write,
      has_table_privilege('service_role', 'outreach_batch_items', 'insert') as service_write`);
    expect(grants.rows[0]).toMatchObject({ anon_read: false, auth_read: false, auth_write: false, service_write: true });
    const policies = await client.query(`select count(*)::int as n from pg_policies where tablename = 'outreach_batch_items'`);
    expect(Number(policies.rows[0].n)).toBe(0);
  });

  it("accepts every status the route writes and nothing else", async () => {
    for (const status of ["scored", "not_found", "identity_mismatch", "deferred", "no_quotable_finding", "error"]) {
      await client.query(`insert into outreach_batch_items (batch_id, requested_artist, requested_title, status)
        values ('b', 'a', 't', '${status}')`);
    }
    await expect(client.query(`insert into outreach_batch_items (batch_id, requested_artist, requested_title, status)
      values ('b', 'a', 't', 'resolved')`)).rejects.toThrow();
    const { rows } = await client.query(`select count(*)::int as n from outreach_batch_items`);
    expect(Number(rows[0].n)).toBe(6);
  });

  it("points at the analysis without copying it, and survives the analysis going away", async () => {
    await client.query(`insert into analyses (id) values ('11111111-1111-1111-1111-111111111111')`);
    await client.query(`insert into outreach_batch_items (batch_id, requested_artist, requested_title, status, analysis_id)
      values ('b', 'a', 't', 'scored', '11111111-1111-1111-1111-111111111111')`);
    await client.query(`delete from analyses where id = '11111111-1111-1111-1111-111111111111'`);
    const { rows } = await client.query(`select analysis_id from outreach_batch_items where batch_id = 'b' and analysis_id is not null`);
    expect(rows).toHaveLength(0);
  });
});
