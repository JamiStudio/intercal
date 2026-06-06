/**
 * Audit-emit tests — the DB-free row-shaping + redaction surface.
 *
 * `recordAuditEvent`/`recordAuditEventStrict` build a row and INSERT it; these tests use a minimal
 * capturing fake `Db` that records the values passed to `insertInto('audit_events').values(...)`.
 * The real append-only ledger write and the wired issue/revoke emission are covered end-to-end by
 * the live Neon verification (scripts/dev/verify-audit.mjs), mirroring how the key lifecycle is
 * proven against a real DB rather than a fake transaction.
 */
import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client.js';
import {
  AUDIT_ACTIONS,
  type AuditEventInput,
  recordAuditEvent,
  recordAuditEventStrict,
} from './audit.js';

/** Return the captured row, asserting exactly one was inserted. */
function only(rows: Record<string, unknown>[]): Record<string, unknown> {
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (!row) throw new Error('no row captured');
  return row;
}

/** Capture the single row inserted into audit_events; reject any other table. */
function makeCapturingDb(): { db: Db; rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  const db = {
    insertInto(table: string) {
      if (table !== 'audit_events') throw new Error(`unexpected insertInto(${table})`);
      return {
        values(row: Record<string, unknown>) {
          return {
            async execute() {
              rows.push(row);
              return [];
            },
          };
        },
      };
    },
  } as unknown as Db;
  return { db, rows };
}

/** A fake Db whose insert always throws — to prove best-effort vs strict behavior. */
function makeThrowingDb(): Db {
  return {
    insertInto() {
      return {
        values() {
          return {
            async execute() {
              throw new Error('db down');
            },
          };
        },
      };
    },
  } as unknown as Db;
}

const baseEvent: AuditEventInput = {
  actor: { type: 'admin', id: 'ops-cli' },
  action: AUDIT_ACTIONS.API_KEY_ISSUE,
  targetType: 'api_key',
  targetId: 'key-123',
};

describe('recordAuditEvent row shaping', () => {
  it('maps the event to snake_case columns with safe defaults', async () => {
    const { db, rows } = makeCapturingDb();
    await recordAuditEvent(db, baseEvent);
    const row = only(rows);
    expect(row.actor_type).toBe('admin');
    expect(row.actor_id).toBe('ops-cli');
    expect(row.actor_ip).toBeNull();
    expect(row.action).toBe('api_key.issue');
    expect(row.target_type).toBe('api_key');
    expect(row.target_id).toBe('key-123');
    expect(row.before_state).toBeNull();
    expect(row.after_state).toBeNull();
    expect(row.rationale).toBeNull();
    expect(row.severity).toBe('info');
    expect(row.metadata).toBe('{}');
  });

  it('serializes before/after/metadata as JSON strings and honors severity', async () => {
    const { db, rows } = makeCapturingDb();
    await recordAuditEvent(db, {
      ...baseEvent,
      action: AUDIT_ACTIONS.API_KEY_REVOKE,
      beforeState: { isActive: true },
      afterState: { isActive: false },
      rationale: 'compromised',
      requestId: 'req-1',
      severity: 'high',
      metadata: { source: 'cli' },
    });
    const row = only(rows);
    expect(JSON.parse(row.before_state as string)).toEqual({ isActive: true });
    expect(JSON.parse(row.after_state as string)).toEqual({ isActive: false });
    expect(JSON.parse(row.metadata as string)).toEqual({ source: 'cli' });
    expect(row.rationale).toBe('compromised');
    expect(row.request_id).toBe('req-1');
    expect(row.severity).toBe('high');
  });
});

describe('recordAuditEvent secret redaction', () => {
  it('drops secret-bearing keys from state and metadata (nested + arrays)', async () => {
    const { db, rows } = makeCapturingDb();
    await recordAuditEvent(db, {
      ...baseEvent,
      afterState: {
        name: 'safe',
        raw: 'ical_sk_should_never_persist',
        key_hash: 'deadbeef',
        token: 'abc',
        nested: { password: 'p', ok: 1 },
        list: [{ apiKey: 'x' }, { fine: 2 }],
      },
      metadata: { Authorization: 'Bearer y', label: 'z' },
    });
    const row = only(rows);
    const after = JSON.parse(row.after_state as string);
    expect(after.name).toBe('safe');
    expect(after.raw).toBe('[redacted]');
    expect(after.key_hash).toBe('[redacted]');
    expect(after.token).toBe('[redacted]');
    expect(after.nested).toEqual({ password: '[redacted]', ok: 1 });
    expect(after.list).toEqual([{ apiKey: '[redacted]' }, { fine: 2 }]);
    const meta = JSON.parse(row.metadata as string);
    expect(meta).toEqual({ Authorization: '[redacted]', label: 'z' });
    // The raw secret value never appears anywhere in the serialized row.
    expect(JSON.stringify(row)).not.toContain('ical_sk_should_never_persist');
  });

  it('catches renamed/nested secret carriers (dsn, connection string, bearer, credentials)', async () => {
    const { db, rows } = makeCapturingDb();
    const POISON = 'POISON_SECRET_VALUE';
    await recordAuditEvent(db, {
      ...baseEvent,
      beforeState: {
        // Renamed / cased variants that must still be redacted.
        DATABASE_DSN: `postgres://u:${POISON}@h/db`,
        connectionString: `postgres://u:${POISON}@h/db`,
        conn_str: POISON,
        refreshToken: POISON,
        db_password: POISON,
        xApiKey: POISON,
        accessKey: POISON,
        privateKey: POISON,
        sessionId: POISON,
        credentials: { bearer: POISON },
        deep: [{ secretSauce: POISON }, { keyHash: POISON }],
        // Benign fields must survive untouched.
        ownerId: 'user-1',
        count: 3,
      },
      metadata: { CredentialSet: POISON, label: 'ok' },
    });
    const row = only(rows);
    const before = JSON.parse(row.before_state as string);
    expect(before.DATABASE_DSN).toBe('[redacted]');
    expect(before.connectionString).toBe('[redacted]');
    expect(before.conn_str).toBe('[redacted]');
    expect(before.refreshToken).toBe('[redacted]');
    expect(before.db_password).toBe('[redacted]');
    expect(before.xApiKey).toBe('[redacted]');
    expect(before.accessKey).toBe('[redacted]');
    expect(before.privateKey).toBe('[redacted]');
    expect(before.sessionId).toBe('[redacted]');
    expect(before.credentials).toBe('[redacted]');
    expect(before.deep).toEqual([{ secretSauce: '[redacted]' }, { keyHash: '[redacted]' }]);
    // Benign fields preserved.
    expect(before.ownerId).toBe('user-1');
    expect(before.count).toBe(3);
    const meta = JSON.parse(row.metadata as string);
    expect(meta).toEqual({ CredentialSet: '[redacted]', label: 'ok' });
    // The poison value appears nowhere in the fully serialized row.
    expect(JSON.stringify(row)).not.toContain(POISON);
  });
});

describe('best-effort vs strict', () => {
  it('recordAuditEvent swallows insert failures', async () => {
    await expect(recordAuditEvent(makeThrowingDb(), baseEvent)).resolves.toBeUndefined();
  });
  it('recordAuditEventStrict propagates insert failures', async () => {
    await expect(recordAuditEventStrict(makeThrowingDb(), baseEvent)).rejects.toThrow('db down');
  });
});
