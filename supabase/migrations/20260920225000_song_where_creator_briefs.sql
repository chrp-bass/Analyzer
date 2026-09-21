-- Private creator briefs share the opportunity model but cannot enter public supply.
alter table opportunities
  add column if not exists access_class text not null default 'PUBLIC_VERIFIED'
    check (access_class in ('PUBLIC_VERIFIED', 'AUTHORIZED_SOURCE', 'PARTNER_LICENSED', 'PRIVATE_TO_CREATOR')),
  add column if not exists owner_creator_id uuid references creators(id) on delete cascade,
  add column if not exists submission_requirement text not null default 'unknown'
    check (submission_requirement in ('free', 'paid', 'membership', 'credits', 'unknown')),
  add column if not exists submission_cost text,
  add column if not exists explicit_criteria jsonb not null default '{}'::jsonb,
  add column if not exists source_snapshot_at timestamptz;

alter table opportunities add constraint opportunities_private_owner_check
  check ((access_class = 'PRIVATE_TO_CREATOR') = (owner_creator_id is not null));
create index if not exists opportunities_private_owner_idx
  on opportunities (owner_creator_id, status, deadline)
  where access_class = 'PRIVATE_TO_CREATOR';

alter table opportunity_sources drop constraint if exists opportunity_sources_kind_check;
alter table opportunity_sources add constraint opportunity_sources_kind_check
  check (kind in ('api', 'feed', 'newsletter', 'curated', 'page', 'creator'));

alter table opportunity_inbox_messages
  add column if not exists creator_id uuid references creators(id) on delete cascade;
create index if not exists opportunity_inbox_creator_idx
  on opportunity_inbox_messages (creator_id, received_at desc);

-- All tables remain service-role-only; no client Data API access to private briefs.
revoke all on opportunities, opportunity_inbox_messages from anon, authenticated;
