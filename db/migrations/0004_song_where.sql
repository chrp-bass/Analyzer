-- Song Where is an independent, service-role-only post-report layer.
create table if not exists opportunity_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('api', 'curated')),
  trust_level text not null check (trust_level in ('verified', 'curated', 'scraped')),
  base_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references opportunity_sources(id),
  external_ref text not null,
  title text not null,
  raw_text text,
  status text not null default 'open' check (status in ('open', 'closed', 'expired')),
  submission_url text not null check (submission_url ~* '^https?://'),
  deadline timestamptz,
  target jsonb not null default '{}'::jsonb,
  normalizer_version text not null,
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_id, external_ref)
);
create index if not exists opportunities_open_idx on opportunities (status, deadline);

create table if not exists song_opportunity_matches (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  match_score numeric(6,3) not null,
  fit_band text not null check (fit_band in ('strong', 'moderate', 'worth_exploring')),
  trust_rank smallint not null check (trust_rank between 1 and 3),
  matcher_version text not null,
  matched_at timestamptz not null default now(),
  unique (analysis_id, opportunity_id)
);
create index if not exists song_opportunity_matches_analysis_idx on song_opportunity_matches (analysis_id);

create table if not exists song_opportunity_match_history (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  match_score numeric(6,3),
  fit_band text,
  matcher_version text not null,
  event text not null check (event in ('created', 'rescored', 'dropped')),
  at timestamptz not null default now()
);

create table if not exists song_where_prefs (
  creator_id uuid primary key references creators(id) on delete cascade,
  alerts_enabled boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  updated_at timestamptz not null default now()
);

create table if not exists opportunity_alerts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references song_opportunity_matches(id) on delete cascade,
  channel text not null default 'email',
  status text not null check (status in ('queued', 'sent', 'failed', 'suppressed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists submission_clicks (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references song_opportunity_matches(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  status text not null default 'clicked' check (status in ('clicked', 'submitted', 'placed', 'passed')),
  status_updated_at timestamptz
);

create table if not exists song_where_job_state (
  stage text primary key check (stage in ('ingest', 'match', 'alert')),
  cursor text,
  updated_at timestamptz not null default now()
);

alter table opportunity_sources enable row level security;
alter table opportunities enable row level security;
alter table song_opportunity_matches enable row level security;
alter table song_opportunity_match_history enable row level security;
alter table song_where_prefs enable row level security;
alter table opportunity_alerts enable row level security;
alter table submission_clicks enable row level security;
alter table song_where_job_state enable row level security;

revoke all on opportunity_sources, opportunities, song_opportunity_matches,
  song_opportunity_match_history, song_where_prefs, opportunity_alerts,
  submission_clicks, song_where_job_state from anon, authenticated;
