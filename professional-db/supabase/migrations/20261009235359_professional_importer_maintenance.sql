-- PostgreSQL 17+ supports table-scoped maintenance privileges. Importers need
-- ANALYZE before reconciliation/final FK checks, without owning schema tables
-- or receiving UPDATE, DELETE, TRUNCATE or approval rights.
grant maintain on docmap_professional.records, docmap_professional.members,
  docmap_professional.evidence, docmap_professional.source_versions,
  docmap_professional.releases to docmap_professional_importer;
