create or replace function docmap_professional.immutable_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if TG_OP <> 'INSERT' then raise exception 'professional history is immutable'; end if;
  if TG_TABLE_NAME in ('records','members','identity_decisions','fields','source_versions','evidence','evidence_sources','dispositions') then
    if exists(select 1 from docmap_professional.releases where release_id=(to_jsonb(NEW)->>'release_id')) then
      raise exception 'release is already sealed';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function docmap_professional.immutable_guard() from public;
