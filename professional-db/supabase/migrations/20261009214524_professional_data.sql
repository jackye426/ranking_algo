-- New private schema only. No public/patient/consultant-table mutations.
create schema docmap_professional;
revoke all on schema docmap_professional from public;
do $$ begin
  if not exists(select from pg_roles where rolname='docmap_professional_reader') then create role docmap_professional_reader nologin; end if;
  if not exists(select from pg_roles where rolname='docmap_professional_importer') then create role docmap_professional_importer nologin; end if;
  if not exists(select from pg_roles where rolname='docmap_professional_publisher') then create role docmap_professional_publisher nologin; end if;
end $$;
create table docmap_professional.releases (
  release_id text primary key, manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  binding_sha256 text not null, schema_version integer not null, projection_version text not null,
  corpus_version text not null, corpus_sha256 text not null, safety_sha256 text not null,
  manifest jsonb not null, binding jsonb not null, counts jsonb not null,
  reconciliation_sha256 text not null, imported_at timestamptz not null default now()
);
-- Approval lives outside the immutable package. Only the publisher may append it.
create table docmap_professional.publication_events (
  event_id text primary key, release_id text not null references docmap_professional.releases,
  decision text not null check(decision in ('approved','revoked')), receipt_sha256 text not null unique,
  receipt jsonb not null, created_at timestamptz not null default now()
);
create table docmap_professional.identities (
  professional_id text primary key, origin text not null, created_at timestamptz not null default now()
);
create table docmap_professional.records (
  release_id text not null references docmap_professional.releases deferrable initially deferred,
  ordinal integer not null, record_id text not null, original_sha256 text not null,
  projected_sha256 text not null, original jsonb not null, projected jsonb not null, projected_json text not null,
  primary key(release_id,record_id), unique(release_id,ordinal)
);
create table docmap_professional.members (
  release_id text not null references docmap_professional.releases deferrable initially deferred,
  ordinal integer not null, professional_id text not null references docmap_professional.identities,
  held boolean not null, payload_sha256 text not null, payload jsonb not null, payload_json text not null,
  primary key(release_id,professional_id), unique(release_id,ordinal)
);
create table docmap_professional.identity_decisions (
  release_id text not null references docmap_professional.releases deferrable initially deferred,
  ordinal integer not null, record_id text not null, professional_id text,
  decision text not null, payload_sha256 text not null, payload jsonb not null, payload_json text not null,
  primary key(release_id,record_id), unique(release_id,ordinal),
  foreign key(release_id,record_id) references docmap_professional.records deferrable initially deferred,
  foreign key(release_id,professional_id) references docmap_professional.members deferrable initially deferred
);
-- Every field stays tied to its exact input record; alternatives remain alternatives.
create table docmap_professional.fields (
  release_id text not null, record_id text not null, field text not null,
  value_sha256 text not null, value jsonb not null,
  primary key(release_id,record_id,field),
  foreign key(release_id,record_id) references docmap_professional.records deferrable initially deferred
);
create table docmap_professional.source_versions (
  release_id text not null references docmap_professional.releases deferrable initially deferred,
  source_version_id text not null, record_id text not null, provider text not null,
  source_key text not null, content_sha256 text not null,
  hash_semantics text not null check(hash_semantics in ('canonical-integrated-record','asserted-source-snapshot')),
  source_url text, source_date text, observed_at text,
  archive_ref jsonb, archive_status text not null check(archive_status in ('not-supplied','verified-private-object','unavailable')),
  primary key(release_id,source_version_id)
);
create table docmap_professional.evidence (
  release_id text not null, ordinal integer not null, evidence_id text not null, professional_id text not null,
  type text not null, text text not null, qualifiers jsonb not null, dates jsonb not null,
  payload_sha256 text not null, payload jsonb not null, payload_json text not null,
  primary key(release_id,evidence_id), unique(release_id,ordinal),
  foreign key(release_id,professional_id) references docmap_professional.members deferrable initially deferred
);
create index on docmap_professional.evidence(release_id,professional_id,ordinal);
create table docmap_professional.evidence_sources (
  release_id text not null, evidence_id text not null, ordinal integer not null,
  source_version_id text not null, original_field text not null, payload_sha256 text not null, payload jsonb not null,
  primary key(release_id,evidence_id,ordinal),
  foreign key(release_id,evidence_id) references docmap_professional.evidence deferrable initially deferred,
  foreign key(release_id,source_version_id) references docmap_professional.source_versions deferrable initially deferred
);
create table docmap_professional.dispositions (
  release_id text not null references docmap_professional.releases deferrable initially deferred,
  ordinal integer not null, kind text not null check(kind in ('correction','field-exclusion','identity-hold','privacy-filter')),
  record_id text not null, field text, payload_sha256 text not null, payload jsonb not null,
  primary key(release_id,ordinal)
);
-- Pipeline inputs are private proposals, never read as published evidence.
create table docmap_professional.proposals (
  proposal_id text primary key, base_release_id text not null references docmap_professional.releases,
  source_key text not null, source_version_sha256 text not null, proposal_sha256 text not null,
  payload jsonb not null, created_at timestamptz not null default now()
);
create table docmap_professional.derived_artifacts (
  release_id text not null references docmap_professional.releases, kind text not null,
  artifact_sha256 text not null, descriptor jsonb not null,
  primary key(release_id,kind,artifact_sha256)
);
create function docmap_professional.immutable_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if TG_OP <> 'INSERT' then raise exception 'professional history is immutable'; end if;
  if TG_TABLE_NAME in ('records','members','identity_decisions','fields','source_versions','evidence','evidence_sources','dispositions')
     and exists(select 1 from docmap_professional.releases where release_id=NEW.release_id) then
     raise exception 'release is already sealed';
  end if;
  return NEW;
end $$;
revoke all on function docmap_professional.immutable_guard() from public;
do $$ declare t text; begin
  foreach t in array array['releases','publication_events','identities','records','members','identity_decisions','fields','source_versions','evidence','evidence_sources','dispositions','proposals','derived_artifacts'] loop
    execute format('create trigger immutable_history before insert or update or delete on docmap_professional.%I for each row execute function docmap_professional.immutable_guard()',t);
    execute format('alter table docmap_professional.%I enable row level security',t);
    execute format('revoke all on docmap_professional.%I from public',t);
    execute format('create policy importer_read on docmap_professional.%I for select to docmap_professional_importer using (true)',t);
  end loop;
end $$;
grant usage on schema docmap_professional to docmap_professional_reader,docmap_professional_importer,docmap_professional_publisher;
grant select on all tables in schema docmap_professional to docmap_professional_importer;
do $$ declare t text; begin
  foreach t in array array['releases','identities','records','members','identity_decisions','fields','source_versions','evidence','evidence_sources','dispositions','proposals','derived_artifacts'] loop
    execute format('grant insert on docmap_professional.%I to docmap_professional_importer',t);
    execute format('create policy importer_insert on docmap_professional.%I for insert to docmap_professional_importer with check(true)',t);
  end loop;
end $$;
grant select,insert on docmap_professional.publication_events to docmap_professional_publisher;
grant select on docmap_professional.releases to docmap_professional_publisher;
create policy publisher_events on docmap_professional.publication_events to docmap_professional_publisher using(true) with check(true);
create policy publisher_releases on docmap_professional.releases for select to docmap_professional_publisher using(true);
-- Publication metadata is restricted to server roles, never anon/authenticated.
grant select on docmap_professional.releases,docmap_professional.publication_events to docmap_professional_reader;
create policy reader_releases on docmap_professional.releases for select to docmap_professional_reader using(true);
create policy reader_events on docmap_professional.publication_events for select to docmap_professional_reader using(true);
do $$ declare t text; begin
  foreach t in array array['members','evidence','evidence_sources','derived_artifacts'] loop
    execute format('grant select on docmap_professional.%I to docmap_professional_reader',t);
    execute format('create policy approved_read on docmap_professional.%I for select to docmap_professional_reader using ((select decision from docmap_professional.publication_events e where e.release_id=%I.release_id order by created_at desc,event_id desc limit 1)=''approved'')',t,t);
  end loop;
end $$;
