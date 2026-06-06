/**
 * Operator-only key lifecycle: issue, revoke, and list API keys. Used by the `scripts/ops` admin
 * CLI. No auth-bypass backdoors and no hardcoded keys — every key is CSPRNG-generated, its raw form
 * returned to the caller exactly once, and only the hash persisted.
 */
import type { Db } from '../db/client.js';
import { NotFoundError } from '../errors.js';
import { AUDIT_ACTIONS, type AuditActor, recordAuditEventStrict } from './audit.js';
import { generateApiKey } from './keys.js';

/**
 * Who is performing a key-lifecycle action, for the audit ledger. Defaults to an operator running
 * the ops CLI when not supplied. NEVER carries secret material.
 */
const DEFAULT_ACTOR: AuditActor = { type: 'admin', id: 'ops-cli' };

export interface IssueKeyInput {
  name: string;
  scopes: string[];
  ownerType?: 'user' | 'service' | 'system';
  ownerId?: string | null;
  requestsPerMinute?: number | null;
  requestsPerDay?: number | null;
  /** Absolute expiry; omit for a non-expiring key. */
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
  /** Audit actor performing the issuance (defaults to the ops operator). */
  actor?: AuditActor;
}

export interface IssuedKey {
  id: string;
  name: string;
  /** The raw key — show ONCE, never logged or stored. */
  raw: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
}

/**
 * Issue a new key. Returns the raw key (display once) plus the persisted metadata. The key row and
 * its `api_key.issue` audit row are written in one transaction, so the trust ledger and the key
 * lifecycle never diverge. The audit row records only safe identity/metadata (id, name, scopes,
 * owner, expiry) — never the raw key or its hash.
 */
export async function issueApiKey(db: Db, input: IssueKeyInput): Promise<IssuedKey> {
  const { raw, hash, prefix } = generateApiKey();
  const ownerType = input.ownerType ?? 'user';

  const row = await db.transaction().execute(async (tx) => {
    const inserted = await tx
      .insertInto('api_keys')
      .values({
        name: input.name,
        key_prefix: prefix,
        key_hash: hash,
        scopes: JSON.stringify(input.scopes),
        owner_type: ownerType,
        owner_id: input.ownerId ?? null,
        requests_per_minute: input.requestsPerMinute ?? null,
        requests_per_day: input.requestsPerDay ?? null,
        expires_at: input.expiresAt ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      })
      .returning(['id', 'name', 'key_prefix', 'expires_at'])
      .executeTakeFirstOrThrow();

    await recordAuditEventStrict(tx, {
      actor: input.actor ?? DEFAULT_ACTOR,
      action: AUDIT_ACTIONS.API_KEY_ISSUE,
      targetType: 'api_key',
      targetId: inserted.id,
      // Post-state snapshot — no raw key, no hash (redaction also drops them defensively).
      afterState: {
        name: inserted.name,
        keyPrefix: inserted.key_prefix,
        scopes: input.scopes,
        ownerType,
        ownerId: input.ownerId ?? null,
        expiresAt: inserted.expires_at ? inserted.expires_at.toISOString() : null,
      },
      severity: 'medium',
    });

    return inserted;
  });

  return {
    id: row.id,
    name: row.name,
    raw,
    prefix: row.key_prefix,
    scopes: input.scopes,
    expiresAt: row.expires_at,
  };
}

/**
 * Revoke a key by id. Sets the authoritative `revoked_at` and deactivates, and writes an
 * `api_key.revoke` audit row in the same transaction (high severity). The before/after snapshots
 * record the active→revoked transition and the reason — never the raw key or its hash.
 */
export async function revokeApiKey(
  db: Db,
  id: string,
  opts: { revokedBy?: string; reason?: string; actor?: AuditActor } = {},
): Promise<void> {
  const revokedAt = new Date();
  const revokedBy = opts.revokedBy ?? null;

  await db.transaction().execute(async (tx) => {
    const prior = await tx
      .selectFrom('api_keys')
      .select(['id', 'name', 'key_prefix', 'is_active', 'revoked_at'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!prior) {
      throw new NotFoundError(`No API key with id ${id}.`);
    }

    await tx
      .updateTable('api_keys')
      .set({
        revoked_at: revokedAt,
        is_active: false,
        revoked_by: revokedBy,
        revocation_reason: opts.reason ?? null,
        updated_at: revokedAt,
      })
      .where('id', '=', id)
      .execute();

    await recordAuditEventStrict(tx, {
      actor: opts.actor ?? { type: 'admin', id: revokedBy ?? DEFAULT_ACTOR.id },
      action: AUDIT_ACTIONS.API_KEY_REVOKE,
      targetType: 'api_key',
      targetId: id,
      beforeState: {
        name: prior.name,
        keyPrefix: prior.key_prefix,
        isActive: prior.is_active,
        revokedAt: prior.revoked_at ? prior.revoked_at.toISOString() : null,
      },
      afterState: {
        isActive: false,
        revokedAt: revokedAt.toISOString(),
        revokedBy,
      },
      rationale: opts.reason ?? null,
      severity: 'high',
    });
  });
}

export interface KeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  ownerType: string;
  ownerId: string | null;
  isActive: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** List keys (metadata only — never any hash or raw material). Newest first. */
export async function listApiKeys(db: Db): Promise<KeySummary[]> {
  const rows = await db
    .selectFrom('api_keys')
    .select([
      'id',
      'name',
      'key_prefix',
      'scopes',
      'owner_type',
      'owner_id',
      'is_active',
      'expires_at',
      'last_used_at',
      'revoked_at',
      'created_at',
    ])
    .orderBy('created_at', 'desc')
    .execute();

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.key_prefix,
    scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
    ownerType: r.owner_type,
    ownerId: r.owner_id,
    isActive: r.is_active,
    expiresAt: r.expires_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  }));
}
