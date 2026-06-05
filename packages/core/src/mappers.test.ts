import { describe, expect, it } from 'vitest';
import type {
  ClaimsTable,
  EntitiesTable,
  EntityAliasesTable,
  EntityExternalIdsTable,
  RelationshipsTable,
} from './db/types.js';
import { mapClaim, mapEntity, mapRelationship } from './mappers.js';

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

/**
 * Regression guard for the mapRelationship status logic.
 *
 * `row.valid_until` is a JS `Date` object when present — truthy even for dates far
 * in the future. The status must be derived with `!== null`, not bare truthiness,
 * or any relationship with a future valid_until would be wrongly marked 'ended'.
 */
describe('mapRelationship', () => {
  const base: RelationshipsTable = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    type_id: 'person_holds_role',
    subject_entity_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    object_entity_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    valid_from: new Date('2024-01-01T00:00:00.000Z'),
    valid_until: null,
    recorded_at: new Date('2026-06-01T00:00:00.000Z'),
    confidence: '0.95',
    source_document_ids: ['dddddddd-dddd-dddd-dddd-dddddddddddd'],
    claim_ids: [],
    is_active: true,
    is_deprecated: false,
  };

  it('marks an open-interval active relationship as active', () => {
    const rel = mapRelationship({ ...base, valid_until: null, is_active: true });
    expect(rel.status).toBe('active');
  });

  it('marks a relationship with a future valid_until as ended (closed interval)', () => {
    // valid_until is a real Date — truthy. Status must be ended because the
    // interval is closed, regardless of whether the date is in the past or future.
    const futureDate = new Date('2099-01-01T00:00:00.000Z');
    const rel = mapRelationship({ ...base, valid_until: futureDate, is_active: true });
    expect(rel.status).toBe('ended');
  });

  it('marks a relationship with a past valid_until as ended', () => {
    const pastDate = new Date('2025-01-01T00:00:00.000Z');
    const rel = mapRelationship({ ...base, valid_until: pastDate, is_active: true });
    expect(rel.status).toBe('ended');
  });

  it('marks a deactivated relationship (is_active=false, no valid_until) as ended', () => {
    const rel = mapRelationship({ ...base, valid_until: null, is_active: false });
    expect(rel.status).toBe('ended');
  });

  it('maps confidence as a float from the numeric string', () => {
    const rel = mapRelationship(base);
    expect(rel.confidence.score).toBeCloseTo(0.95);
  });

  it('preserves source document IDs', () => {
    const rel = mapRelationship(base);
    expect(rel.sourceDocumentIds).toEqual(['dddddddd-dddd-dddd-dddd-dddddddddddd']);
  });

  it('maps recordedAt from recorded_at', () => {
    const rel = mapRelationship(base);
    expect(rel.recordedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

/**
 * Contract-alignment guard for mapEntity.externalIds.
 *
 * The TypeSpec contract's ExternalId is exactly { system, id }. The DB table
 * entity_external_ids also carries a `url`, but it is NOT part of the public
 * contract. The mapper must not emit `url` (or any other off-contract field),
 * or REST/MCP responses would diverge from the generated OpenAPI/JSON-Schema.
 */
describe('mapEntity', () => {
  const entityRow: EntitiesTable = {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    type_id: 'organization',
    canonical_name: 'OpenAI',
    description: null,
    current_state: {},
    importance_score: '0.75',
    first_seen_at: new Date('2026-05-01T00:00:00.000Z'),
    last_updated_at: new Date('2026-06-01T00:00:00.000Z'),
    is_deprecated: false,
    merged_into_id: null,
    deprecated_at: null,
    deprecation_reason: null,
  };

  const aliases: EntityAliasesTable[] = [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      entity_id: entityRow.id,
      alias: 'Open AI',
      alias_type: 'name',
      language: 'en',
      is_primary: false,
    },
  ];

  const externalIds: EntityExternalIdsTable[] = [
    {
      id: 'x0000000-0000-0000-0000-000000000001',
      entity_id: entityRow.id,
      namespace: 'wikidata',
      external_id: 'Q21708200',
      // Present in the DB row but must NOT appear in the contract output.
      url: 'https://www.wikidata.org/wiki/Q21708200',
    },
  ];

  it('emits externalIds as exactly { system, id } — no off-contract url', () => {
    const entity = mapEntity(entityRow, aliases, externalIds);
    expect(entity.externalIds).toEqual([{ system: 'wikidata', id: 'Q21708200' }]);
    expect(Object.keys(entity.externalIds?.[0] ?? {})).toEqual(['system', 'id']);
  });

  it('maps core fields and aliases', () => {
    const entity = mapEntity(entityRow, aliases, externalIds);
    expect(entity.id).toBe(entityRow.id);
    expect(entity.displayName).toBe('OpenAI');
    expect(entity.aliases).toEqual(['Open AI']);
    expect(entity.importance).toBeCloseTo(0.75);
  });
});
