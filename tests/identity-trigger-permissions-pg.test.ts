import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import EmbeddedPostgres from "embedded-postgres";

interface PgClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

let pg: InstanceType<typeof EmbeddedPostgres>;
let client: PgClient;

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: `/tmp/chrp-identity-permissions-${process.pid}-${Date.now()}`,
    user: "chrp",
    password: "chrp",
    port: 55434,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  client = pg.getPgClient() as unknown as PgClient;
  await client.connect();
  await client.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role supabase_auth_admin nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create table public.creators (id uuid primary key, email text);

    create function public.handle_new_auth_user()
    returns trigger language plpgsql security definer set search_path = public as $$
    begin
      insert into creators (id, email)
      values (new.id, new.email)
      on conflict (id) do update set email = coalesce(excluded.email, creators.email);
      return new;
    end $$;

    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_auth_user();
    create trigger on_auth_user_updated
      after update of email on auth.users
      for each row execute function public.handle_new_auth_user();

    grant usage on schema auth to supabase_auth_admin;
    grant select, insert, update on auth.users to supabase_auth_admin;
  `);
  await client.query(
    readFileSync(
      "supabase/migrations/20260921135412_restrict_handle_new_auth_user.sql",
      "utf8",
    ),
  );
}, 180_000);

afterAll(async () => {
  await client?.end();
  await pg?.stop();
});

describe("identity trigger execution boundary", () => {
  it("revokes direct execution from every API-facing role", async () => {
    const { rows } = await client.query(`
      select
        has_function_privilege('public', 'public.handle_new_auth_user()', 'execute') as public_execute,
        has_function_privilege('anon', 'public.handle_new_auth_user()', 'execute') as anon_execute,
        has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'execute') as authenticated_execute
    `);
    expect(rows[0]).toEqual({
      public_execute: false,
      anon_execute: false,
      authenticated_execute: false,
    });
  });

  it("pins the SECURITY DEFINER function to the trusted catalogs", async () => {
    const { rows } = await client.query(`
      select prosecdef as security_definer, proconfig as config
      from pg_proc
      where oid = 'public.handle_new_auth_user()'::regprocedure
    `);
    expect(rows[0]).toEqual({
      security_definer: true,
      config: ["search_path=pg_catalog, public"],
    });
  });

  it("still provisions and updates the same creator through auth.users triggers", async () => {
    const id = randomUUID();
    await client.query("set role supabase_auth_admin");
    await client.query("insert into auth.users(id, email) values ($1, null)", [id]);
    await client.query("update auth.users set email=$2 where id=$1", [id, "creator@example.com"]);
    await client.query("reset role");

    const { rows } = await client.query(
      "select id::text, email from public.creators where id=$1",
      [id],
    );
    expect(rows).toEqual([{ id, email: "creator@example.com" }]);
  });

  it("rejects direct calls from anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      await client.query(`set role ${role}`);
      await expect(
        client.query("select public.handle_new_auth_user()"),
      ).rejects.toThrow(/permission denied for function handle_new_auth_user/);
      await client.query("reset role");
    }
  });
});
