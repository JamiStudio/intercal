-- 0027_audit_events_forbid_truncate.sql
-- Plan 04 W3 (audit-2) — close the TRUNCATE gap in the append-only trust ledger.
--
-- Migration 0026 added BEFORE UPDATE/DELETE row triggers, but those do NOT fire for TRUNCATE:
-- TRUNCATE bypasses row-level triggers entirely and would silently erase the whole ledger. On a
-- managed Postgres where the application role owns its tables (e.g. Neon's neondb_owner), TRUNCATE
-- is reachable through the normal data path, so "no silent row mutation" is incomplete without it.
-- A statement-level BEFORE TRUNCATE trigger closes that vector at zero cost to the INSERT hot path.
-- (Dropping the table/trigger via DDL remains a privileged operator action and is intentionally not
-- gated here — that is a deliberate, visible operator decision, not a silent data-path erasure.)
--
-- Reuses audit_events_forbid_mutation() from 0026, which raises using TG_OP (here 'TRUNCATE').

DROP TRIGGER IF EXISTS trg_audit_events_no_truncate ON audit_events;
CREATE TRIGGER trg_audit_events_no_truncate
    BEFORE TRUNCATE ON audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION audit_events_forbid_mutation();
