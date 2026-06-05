import { describe, expect, it } from 'vitest';
import type { ClaimsTable } from './db/types.js';
import { mapClaim } from './mappers.js';

/**
 * Regression guard for the Plan-00 scaffold bug: the claims SQL schema
 * (db/migrations/0013_claims.sql) has no `recorded_at` column — it carries
 * `created_at` (transaction time) and `updated_at`. The contract's required
 * `Claim.recordedAt` is therefore sourced from `created_at`. If anyone reintroduces
 * a phantom `recorded_at` on ClaimsTable or in the mapper, this test fails to compile
 * or fails at runtime.
 */
describe('mapClaim', () => {
  const created = new Date('2026-06-01T12:00:00.000Z');
  const updated = new Date('2026-06-02T12:00:00.000Z');

  const row: ClaimsTable = {
    id: '11111111-1111-1111-1111-111111111111',
    subject_entity_id: '22222222-2222-2222-2222-222222222222',
    subject_text: 'Sam Altman',
    predicate: 'holds_role',
    object_entity_id: null,
    object_text: 'CEO at OpenAI',
    qualifiers: {},
    normalized_text: 'Sam Altman holds the role of CEO at OpenAI.',
    raw_quote: null,
    valid_from: new Date('2026-05-21T00:00:00.000Z'),
    valid_until: null,
    extraction_confidence: '0.90',
    source_document_ids: ['33333333-3333-3333-3333-333333333333'],
    contradiction_status: 'none',
    status: 'active',
    created_at: created,
    updated_at: updated,
  };

  it('maps the contract recordedAt from the claim row created_at (transaction time)', () => {
    const claim = mapClaim(row);
    expect(claim.recordedAt).toBe(created.toISOString());
  });

  it('maps world (valid) time independently of transaction time', () => {
    const claim = mapClaim(row);
    expect(claim.validFrom).toBe('2026-05-21T00:00:00.000Z');
    expect(claim.validUntil).toBeUndefined();
  });

  it('carries provenance and lifecycle through the mapping', () => {
    const claim = mapClaim(row);
    expect(claim.status).toBe('active');
    expect(claim.contradiction).toBe('none');
    expect(claim.confidence.score).toBeCloseTo(0.9);
    expect(claim.evidence).toEqual([{ sourceDocumentId: '33333333-3333-3333-3333-333333333333' }]);
  });
});
