create table docmap_professional.archive_links (
  content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
  catalog_sha256 text not null check(catalog_sha256 ~ '^[a-f0-9]{64}$'),
  object_key text not null, byte_count bigint not null, descriptor jsonb not null,
  verified_at timestamptz not null default now(), primary key(content_sha256,catalog_sha256,object_key)
);
alter table docmap_professional.archive_links enable row level security;
revoke all on docmap_professional.archive_links from public;
grant select,insert on docmap_professional.archive_links to docmap_professional_importer;
create policy archive_import on docmap_professional.archive_links to docmap_professional_importer using(true) with check(true);
create trigger immutable_archive before insert or update or delete on docmap_professional.archive_links for each row execute function docmap_professional.immutable_guard();
