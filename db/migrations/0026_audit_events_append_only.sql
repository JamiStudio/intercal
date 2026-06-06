-- 0026_audit_events_append_only.sql
-- Plan 04 W3 — make the audit_events ledger tamper-evident at the schema boundary.
--
-- audit_events (migration 0022) is the trust ledger: who did what to trust-sensitive state.
-- 0022 declared append-only "by policy"; this migration enforces it in the database so that
-- neither the application role nor a stray query can rewrite or erase history. Audit rows are
-- INSERT-only: any UPDATE or DELETE raises, regardless of caller. A privileged operator can still
-- TRUNCATE/DROP at the table level (DDL is not gated here) — the guarantee is "no silent row-level
-- mutation through the normal data path", which is the property an audit trail needs.

CREATE OR REPLACE FUNCTION audit_events_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_no_update ON audit_events;
CREATE TRIGGER trg_audit_events_no_update
    BEFORE UPDATE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_events_forbid_mutation();

DROP TRIGGER IF EXISTS trg_audit_events_no_delete ON audit_events;
CREATE TRIGGER trg_audit_events_no_delete
    BEFORE DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_events_forbid_mutation();

COMMENT ON FUNCTION audit_events_forbid_mutation() IS
    'Plan 04 W3: enforces the append-only invariant on audit_events. Raises on any row UPDATE/DELETE.';
