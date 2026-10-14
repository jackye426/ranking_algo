-- Keep the exact immutable descriptor bytes alongside queryable JSONB.
alter table docmap_professional.releases add column manifest_json text not null;
alter table docmap_professional.releases add column binding_json text not null;
