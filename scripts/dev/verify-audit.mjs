#!/usr/bin/env node

// Live audit-event verification (Plan 04 W3).
//
// Against a REAL database (a throwaway Neon branch), exercises the audited key lifecycle and the
// append-only ledger:
//   - issueApiKey  → one `api_key.issue`  audit_events row (actor/action/target correct)
//   - revokeApiKey → one `api_key.revoke` audit_events row (before/after + rationale)
//   - NO secret material (raw key / hash) appears in ANY audit row
//   - the table is append-only: a direct UPDATE and a direct DELETE both RAISE (migration 0026)
//
// NEVER prints the raw key or the DATABASE_URL.
//
// Usage: DATABASE_URL=<neon-branch-url> node scripts/dev/verify-audit.mjs
// (Run against a disposable branch; it issues + revokes test keys and writes audit_events rows.)

import { createDb, issueApiKey, queryAuditEvents, revokeApiKey } from '@intercal/core';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[verify-audit] DATABASE_URL is required (point at a throwaway Neon branch).');
  process.exit(2);
}

const db = createDb(databaseUrl);

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function main() {
  console.log('[verify-audit] live append-only audit-ledger verification\n');

  // --- Issue: expect an api_key.issue audit row ---
  const issued = await issueApiKey(db, {
    name: 'verify audit issue',
    scopes: ['read'],
    actor: { type: 'admin', id: 'verify-audit' },
  });
  // Raw key held in memory only; never logged.

  const issueRows = await queryAuditEvents(db, {
    action: 'api_key.issue',
    targetType: 'api_key',
    targetId: issued.id,
  });
  check('issue wrote exactly one api_key.issue audit row', issueRows.length === 1);
  const issueRow = issueRows[0] ?? {};
  check(
    'issue audit actor recorded',
    issueRow.actorType === 'admin' && issueRow.actorId === 'verify-audit',
  );
  check('issue audit target is the new key id', issueRow.targetId === issued.id);
  check('issue audit severity is medium', issueRow.severity === 'medium');
  check(
    'issue after_state has safe metadata (name/scopes/keyPrefix)',
    !!issueRow.afterState &&
      issueRow.afterState.name === 'verify audit issue' &&
      Array.isArray(issueRow.afterState.scopes) &&
      issueRow.afterState.scopes.includes('read'),
  );

  // --- Revoke: expect an api_key.revoke audit row ---
  await revokeApiKey(db, issued.id, {
    revokedBy: 'verify-audit',
    reason: 'verification run',
    actor: { type: 'admin', id: 'verify-audit' },
  });
  const revokeRows = await queryAuditEvents(db, {
    action: 'api_key.revoke',
    targetType: 'api_key',
    targetId: issued.id,
  });
  check('revoke wrote exactly one api_key.revoke audit row', revokeRows.length === 1);
  const revokeRow = revokeRows[0] ?? {};
  check('revoke audit severity is high', revokeRow.severity === 'high');
  check('revoke audit rationale carries the reason', revokeRow.rationale === 'verification run');
  check(
    'revoke before/after capture the active→revoked transition',
    !!revokeRow.beforeState &&
      !!revokeRow.afterState &&
      revokeRow.beforeState.isActive === true &&
      revokeRow.afterState.isActive === false &&
      typeof revokeRow.afterState.revokedAt === 'string',
  );

  // --- No secret material anywhere in the audit rows for this key ---
  const allForKey = await queryAuditEvents(db, { targetType: 'api_key', targetId: issued.id });
  const serialized = JSON.stringify(allForKey);
  check('no raw key value in any audit row', !serialized.includes(issued.raw));
  check(
    'no 64-hex hash-shaped token in any audit row',
    !/[0-9a-f]{64}/i.test(serialized.replace(/[0-9a-f-]{36}/gi, '')), // strip uuids first
  );

  // --- Append-only enforcement (migration 0026): UPDATE and DELETE must RAISE ---
  let updateBlocked = false;
  try {
    await db
      .updateTable('audit_events')
      .set({ rationale: 'tamper' })
      .where('id', '=', issueRow.id)
      .execute();
  } catch (err) {
    updateBlocked = /append-only/i.test(err.message);
  }
  check('UPDATE on audit_events is rejected (append-only)', updateBlocked);

  let deleteBlocked = false;
  try {
    await db.deleteFrom('audit_events').where('id', '=', issueRow.id).execute();
  } catch (err) {
    deleteBlocked = /append-only/i.test(err.message);
  }
  check('DELETE on audit_events is rejected (append-only)', deleteBlocked);

  // Confirm the row survived the rejected mutation attempts.
  const survived = await queryAuditEvents(db, { targetType: 'api_key', targetId: issued.id });
  check('audit rows survive rejected mutations', survived.length === allForKey.length);

  console.log(`\n[verify-audit] ${pass} passed, ${fail} failed`);
  await db.destroy();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(`[verify-audit] error: ${err.message}`);
  await db.destroy().catch(() => {});
  process.exit(1);
});
