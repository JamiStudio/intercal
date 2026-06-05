/** Map database rows onto the generated contract types. Output dates as ISO strings. */
import type { components } from '@intercal/shared';
import type {
  ClaimsTable,
  EntitiesTable,
  EntityAliasesTable,
  EntityExternalIdsTable,
  RelationshipsTable,
  SourceDocumentsTable,
} from './db/types.js';

type S = components['schemas'];
export type Entity = S['Entity'];
export type Claim = S['Claim'];
export type Relationship = S['Relationship'];
export type SourceDocument = S['SourceDocument'];
export type Citation = S['Citation'];

function iso(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString() : undefined;
}

export function mapEntity(
  row: EntitiesTable,
  aliases: EntityAliasesTable[],
  externalIds: EntityExternalIdsTable[],
): Entity {
  return {
    id: row.id,
    type: row.type_id as Entity['type'],
    displayName: row.canonical_name,
    aliases: aliases.map((a) => a.alias),
    // The contract's ExternalId is { system, id } only — entity_external_ids.url is real
    // provenance but is NOT part of the public contract, so it is deliberately not emitted.
    // Adding it here would be hand-massaged divergence from the TypeSpec source of truth.
    externalIds: externalIds.map((e) => ({
      system: e.namespace,
      id: e.external_id,
    })),
    importance: Number(row.importance_score),
    firstSeen: iso(row.first_seen_at),
    lastUpdated: iso(row.last_updated_at),
    state: (row.current_state ?? {}) as Record<string, unknown>,
  };
}

const CLAIM_STATUS: Record<string, Claim['status']> = {
  active: 'active',
  superseded: 'superseded',
  retracted: 'retracted',
  draft: 'proposed',
};

const CONTRADICTION: Record<string, Claim['contradiction']> = {
  none: 'none',
  has_contradiction: 'contradicted',
  resolved: 'none',
};

export function mapClaim(row: ClaimsTable): Claim {
  return {
    id: row.id,
    subject: row.subject_text,
    predicate: row.predicate,
    object: row.object_text,
    qualifiers: (row.qualifiers ?? {}) as Record<string, unknown>,
    normalizedText: row.normalized_text,
    validFrom: iso(row.valid_from),
    validUntil: iso(row.valid_until),
    // claims has no recorded_at column; created_at is the claim's transaction time.
    recordedAt: row.created_at.toISOString(),
    confidence: { score: Number(row.extraction_confidence), method: 'extraction' },
    status: CLAIM_STATUS[row.status] ?? 'proposed',
    contradiction: CONTRADICTION[row.contradiction_status] ?? 'none',
    evidence: row.source_document_ids.map((id) => ({ sourceDocumentId: id })),
  };
}

export function mapRelationship(row: RelationshipsTable): Relationship {
  // `row.valid_until` is a Date object when present — truthy even for far-future dates.
  // Check !== null, not bare truthiness, to detect a closed interval correctly.
  const status: Relationship['status'] =
    !row.is_active || row.valid_until !== null ? 'ended' : 'active';
  return {
    id: row.id,
    type: row.type_id,
    fromEntityId: row.subject_entity_id,
    toEntityId: row.object_entity_id,
    validFrom: iso(row.valid_from),
    validUntil: iso(row.valid_until),
    recordedAt: row.recorded_at.toISOString(),
    confidence: { score: Number(row.confidence) },
    status,
    sourceDocumentIds: row.source_document_ids,
  };
}

export function mapSourceDocument(row: SourceDocumentsTable): SourceDocument {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title ?? undefined,
    url: row.url ?? undefined,
    publishedAt: iso(row.published_at),
    ingestedAt: row.ingested_at.toISOString(),
    language: row.language,
    contentHash: row.content_hash,
  };
}
