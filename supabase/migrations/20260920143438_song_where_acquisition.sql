-- Service-role-only acquisition state. The customer feature remains separately gated.
alter table opportunity_sources drop constraint if exists opportunity_sources_kind_check;
alter table opportunity_sources add constraint opportunity_sources_kind_check
  check (kind in ('api', 'feed', 'newsletter', 'curated'));
alter table opportunity_sources
  add column if not exists source_url text,
  add column if not exists access_type text not null default 'unknown',
  add column if not exists terms_url text,
  add column if not exists terms_status text not null default 'unverified',
  add column if not exists robots_status text not null default 'unverified',
  add column if not exists auth_scope text not null default 'none',
  add column if not exists update_cadence_minutes integer,
  add column if not exists last_successful_ingest_at timestamptz,
  add column if not exists failure_count integer not null default 0,
  add column if not exists quarantine_reason text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists opportunity_source_candidates (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  discovered_from text not null,
  access_type text not null default 'unknown',
  terms_status text not null default 'unverified',
  robots_status text not null default 'unverified',
  status text not null default 'quarantined' check (status in ('quarantined', 'admitted', 'rejected')),
  reason text,
  discovered_at timestamptz not null default now(),
  checked_at timestamptz
);

alter table opportunities
  add column if not exists provenance_url text,
  add column if not exists budget_text text,
  add column if not exists use_text text,
  add column if not exists territory_text text,
  add column if not exists mood_context text,
  add column if not exists synthetic boolean not null default false;
create index if not exists opportunities_content_hash_idx on opportunities (source_id, content_hash);

create table if not exists opportunity_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  sender text not null,
  subject text not null,
  received_at timestamptz not null,
  status text not null check (status in ('quarantined', 'normalized', 'rejected')),
  reason text,
  opportunity_id uuid references opportunities(id),
  created_at timestamptz not null default now()
);

alter table opportunity_source_candidates enable row level security;
alter table opportunity_inbox_messages enable row level security;
revoke all on opportunity_source_candidates, opportunity_inbox_messages from anon, authenticated;
