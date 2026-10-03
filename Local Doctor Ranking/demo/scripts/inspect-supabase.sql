-- DocMap / Spire discovery only. NOT EXECUTED as part of the local demo build.
-- Run against the intended project using an authorized read-only session.
-- This reads catalogue metadata and estimates only. It creates/changes nothing.
-- Exact row counts, profile samples and relationship joins should be designed
-- after this inventory identifies the relevant tables and access policy.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

-- 1. Accessible user schemas and relation inventory, including row estimates.
-- Estimates can be stale, and a view has no independent stored row count.
SELECT
    n.nspname AS schema_name,
    c.relname AS relation_name,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'f' THEN 'foreign_table'
    END AS relation_type,
    CASE WHEN c.relkind IN ('r', 'p', 'm') AND c.reltuples >= 0
         THEN c.reltuples::bigint ELSE NULL END AS estimated_rows,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    has_table_privilege(c.oid, 'SELECT') AS current_role_can_select,
    obj_description(c.oid, 'pg_class') AS relation_comment
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND n.nspname NOT LIKE 'pg_temp_%'
ORDER BY n.nspname, c.relname;

-- 2. Column names/types/nullability/defaults to identify consultant, practice,
-- organisation, hospital, insurer, source, GMC, postcode and embedding fields.
SELECT table_schema, table_name, ordinal_position, column_name,
       data_type, udt_schema, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_schema NOT LIKE 'pg_toast%'
ORDER BY table_schema, table_name, ordinal_position;

-- 3. Key and relationship definitions. pg_get_constraintdef preserves composite
-- key ordering without the cross-products that simple information_schema joins
-- can introduce for multi-column foreign keys.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       con.conname AS constraint_name,
       CASE con.contype WHEN 'p' THEN 'primary_key' WHEN 'u' THEN 'unique'
            WHEN 'f' THEN 'foreign_key' WHEN 'c' THEN 'check' END AS constraint_type,
       pg_get_constraintdef(con.oid, true) AS definition,
       rn.nspname AS referenced_schema, rc.relname AS referenced_relation,
       con.convalidated AS validated
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_class AS rc ON rc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace AS rn ON rn.oid = rc.relnamespace
WHERE con.contype IN ('p', 'u', 'f', 'c')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, c.relname, con.contype, con.conname;

-- 4. RLS policies are metadata, not a proof that a given API role can read rows.
SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual AS using_expression, with_check AS check_expression
FROM pg_catalog.pg_policies
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename, policyname;

-- 5. Grants for exposed API roles. Missing rows may also reflect the current
-- auditing role's visibility; compare with RLS and actual safe SELECT probes.
SELECT table_schema, table_name, grantee, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC', current_user)
ORDER BY table_schema, table_name, grantee, privilege_type;

-- 6. View ownership and options (including security_invoker where configured).
-- No view definition or view contents are executed by this query.
SELECT n.nspname AS schema_name, c.relname AS view_name,
       pg_get_userbyid(c.relowner) AS view_owner, c.reloptions AS view_options
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relkind IN ('v', 'm')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname;

-- 7. Existing indexes and extensions inform retrieval choices without creating
-- indexes, installing extensions or touching source data.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND schemaname NOT LIKE 'pg_toast%'
ORDER BY schemaname, tablename, indexname;

SELECT extname, extversion, n.nspname AS extension_schema
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY extname;

ROLLBACK;
