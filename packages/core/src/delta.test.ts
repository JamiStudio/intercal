/**
 * Unit tests for the pure delta-digest assembler (`assembleDigest`).
 *
 * These cover the budget/citation/confidence/freshness logic that turns already-fetched, scoped,
 * window-filtered rows into a `DeltaResponse` — without a live database. The SQL-fetch path
 * (`buildDelta`: topic resolution, transaction-time windowing, scope) is exercised end-to-end by
 * the live Neon integration verification, not here.
 */
import { describe, expect, it } from 'vitest';
import type {
  ClaimsTable,
  EntitiesTable,
  FactVersionsTable,
  RelationshipsTable,
} from './db/types.js';
import { type AssembleInput, assembleDigest, type DocMeta } from './delta.js';

const DOC_RUST = 'aaaaaaaa-0000-0000-0000-000000000001';
const DOC_FV = 'aaaaaaaa-0000-0000-0000-000000000002';
const DOC_OTHER = 'aaaaaaaa-0000-0000-0000-000000000003';
const ENT_RUST = 'bbbbbbbb-0000-0000-0000-000000000001';
const ENT_OTHER = 'bbbbbbbb-0000-0000-0000-000000000002';

function factVersion(
  overrides: Partial<FactVersionsTable> & { id: string; recorded_at: Date },
): FactVersionsTable {
  return {
    fact_subject_type: 'entity',
    fact_subject_id: ENT_RUST,
    payload: { canonical_name: 'rust', type_id: 'product' },
    valid_from: overrides.recorded_at,
    valid_until: null,
    source_document_ids: [DOC_FV],
    claim_ids: [],
    confidence: '0.90',
    is_current: true,
    superseded_by_id: null,
    superseded_at: null,
    produced_by: 'pipeline',
    ...overrides,
  };
}

function claim(overrides: Partial<ClaimsTable> & { id: string; created_at: Date }): ClaimsTable {
  return {
    subject_entity_id: ENT_RUST,
    subject_text: 'rust',
    predicate: 'released',
    object_entity_id: null,
    object_text: 'version 1.96.0',
    qualifiers: {},
    normalized_text: 'Rust released version 1.96.0.',
    raw_quote: null,
    valid_from: null,
    valid_until: null,
    extraction_confidence: '0.90',
    source_document_ids: [DOC_RUST],
    contradiction_status: 'none',
    status: 'active',
    updated_at: overrides.created_at,
    ...overrides,
  };
}

const docMeta: DocMeta[] = [
  {
    id: DOC_RUST,
    url: 'https://github.com/rust-lang/rust/releases/tag/1.96.0',
    published_at: new Date('2026-05-28T17:50:42.000Z'),
  },
  {
    id: DOC_FV,
    url: 'https://blog.rust-lang.org/2026/06/05/state-change',
    published_at: new Date('2026-06-04T12:00:00.000Z'),
  },
  {
    id: DOC_OTHER,
    url: 'https://example.org/other',
    published_at: new Date('2026-06-03T00:00:00.000Z'),
  },
];

function input(overrides: Partial<AssembleInput> = {}): AssembleInput {
  const since = new Date('2026-06-01T00:00:00.000Z');
  return {
    params: { topic: 'rust', since_date: '2026-06-01T00:00:00.000Z' },
    since,
    until: undefined,
    budget: 1500,
    topicEntityIds: [ENT_RUST],
    claimRows: [],
    relRows: [],
    entityRows: [],
    docMeta,
    ...overrides,
  };
}

describe('assembleDigest — citations & provenance', () => {
  it('every included claim is cited, and the digest-level citations carry url + publishedAt', () => {
    const rows = [
      claim({ id: 'c1', created_at: new Date('2026-06-05T18:55:19.000Z') }),
      claim({ id: 'c2', created_at: new Date('2026-06-05T18:55:18.000Z') }),
    ];
    const res = assembleDigest(input({ claimRows: rows }));

    expect(res.changedClaims).toHaveLength(2);
    for (const c of res.changedClaims) {
      expect(c.evidence.length).toBeGreaterThan(0);
      expect(c.evidence[0]?.sourceDocumentId).toBe(DOC_RUST);
    }
    expect(res.summary.citations).toHaveLength(1);
    expect(res.summary.citations[0]).toMatchObject({
      sourceDocumentId: DOC_RUST,
      url: 'https://github.com/rust-lang/rust/releases/tag/1.96.0',
      publishedAt: '2026-05-28T17:50:42.000Z',
    });
  });

  it('does not fabricate: empty change set yields no claims, no citations, zero confidence', () => {
    const res = assembleDigest(input({ claimRows: [] }));
    expect(res.changedClaims).toEqual([]);
    expect(res.summary.citations).toEqual([]);
    expect(res.confidence.score).toBe(0);
    expect(res.summary.content).toMatch(/No recorded changes/);
  });
});

describe('assembleDigest — token budget', () => {
  it('bounds the digest content to the budget and reports what was omitted', () => {
    // 40 claims with long text; a tiny budget must trim and the content must fit.
    const rows = Array.from({ length: 40 }, (_, i) =>
      claim({
        id: `c${i}`,
        created_at: new Date(2026, 5, 5, 18, 55, 40 - i),
        normalized_text: `Rust change number ${i} with a deliberately long descriptive sentence about the release.`,
      }),
    );
    const budget = 300;
    const res = assembleDigest(input({ claimRows: rows, budget }));

    // The rendered digest content fits the budget (4 chars/token heuristic, matching the impl).
    const estTokens = Math.ceil(res.summary.content.length / 4);
    expect(estTokens).toBeLessThanOrEqual(budget);

    // It included fewer than all 40 and reported the omission honestly.
    expect(res.changedClaims.length).toBeLessThan(40);
    expect(res.changedClaims.length).toBeGreaterThan(0);
    expect(res.summary.content).toMatch(/omitted/);
    expect(res.summary.tokenBudget).toBe(budget);

    // Coverage = fraction included; < 1 when trimmed.
    expect(res.freshness.coverage).toBeLessThan(1);
    expect(res.freshness.coverage).toBeGreaterThan(0);
  });

  it('reports full coverage when everything fits', () => {
    const rows = [claim({ id: 'c1', created_at: new Date('2026-06-05T18:55:19.000Z') })];
    const res = assembleDigest(input({ claimRows: rows, budget: 1500 }));
    expect(res.freshness.coverage).toBe(1);
    expect(res.summary.content).toMatch(/fit within/);
  });
});

describe('assembleDigest — ranking', () => {
  it('orders included changes newest-first regardless of input order', () => {
    const older = claim({ id: 'old', created_at: new Date('2026-06-02T00:00:00.000Z') });
    const newer = claim({ id: 'new', created_at: new Date('2026-06-05T00:00:00.000Z') });
    // Pass in reverse (oldest first) — assembler must sort.
    const res = assembleDigest(input({ claimRows: [older, newer] }));
    expect(res.changedClaims[0]?.recordedAt).toBe(newer.created_at.toISOString());
    expect(res.changedClaims[1]?.recordedAt).toBe(older.created_at.toISOString());
  });

  it('breaks recency ties by confidence (higher first)', () => {
    const t = new Date('2026-06-05T00:00:00.000Z');
    const lowConf = claim({ id: 'lo', created_at: t, extraction_confidence: '0.50' });
    const hiConf = claim({ id: 'hi', created_at: t, extraction_confidence: '0.99' });
    const res = assembleDigest(input({ claimRows: [lowConf, hiConf] }));
    expect(res.changedClaims[0]?.confidence.score).toBeCloseTo(0.99);
  });
});

describe('assembleDigest — confidence & freshness', () => {
  it('confidence is the mean of included extraction confidences, labelled as an aggregate', () => {
    const t = new Date('2026-06-05T00:00:00.000Z');
    const rows = [
      claim({ id: 'a', created_at: t, extraction_confidence: '0.80' }),
      claim({ id: 'b', created_at: t, extraction_confidence: '0.60' }),
    ];
    const res = assembleDigest(input({ claimRows: rows, budget: 1500 }));
    expect(res.confidence.score).toBeCloseTo(0.7);
    expect(res.confidence.method).toBe('aggregate_extraction');
  });

  it('freshness.lastUpdated is the newest transaction time in the change set', () => {
    const rows = [
      claim({ id: 'a', created_at: new Date('2026-06-03T00:00:00.000Z') }),
      claim({ id: 'b', created_at: new Date('2026-06-05T12:00:00.000Z') }),
    ];
    const res = assembleDigest(input({ claimRows: rows, budget: 1500 }));
    expect(res.freshness.lastUpdated).toBe('2026-06-05T12:00:00.000Z');
    expect(res.summary.freshness.lastUpdated).toBe('2026-06-05T12:00:00.000Z');
  });
});

describe('assembleDigest — changed entities & relationships', () => {
  it('summarizes changed entities compactly (id/type/displayName only)', () => {
    const ent: EntitiesTable = {
      id: ENT_RUST,
      type_id: 'product',
      canonical_name: 'rust',
      description: null,
      current_state: {},
      importance_score: '0.0',
      first_seen_at: new Date('2026-06-05T18:55:00.000Z'),
      last_updated_at: new Date('2026-06-05T18:55:39.000Z'),
      is_deprecated: false,
      merged_into_id: null,
      deprecated_at: null,
      deprecation_reason: null,
    };
    const res = assembleDigest(input({ entityRows: [ent] }));
    expect(res.changedEntities).toEqual([{ id: ENT_RUST, type: 'product', displayName: 'rust' }]);
  });

  it('notes relationship changes in the prose lede', () => {
    const rel: RelationshipsTable = {
      id: 'rel1',
      type_id: 'depends_on',
      subject_entity_id: ENT_RUST,
      object_entity_id: 'cccccccc-0000-0000-0000-000000000001',
      valid_from: null,
      valid_until: null,
      recorded_at: new Date('2026-06-05T18:58:38.000Z'),
      confidence: '0.90',
      source_document_ids: [DOC_RUST],
      claim_ids: [],
      is_active: true,
      is_deprecated: false,
    };
    const rows = [claim({ id: 'c1', created_at: new Date('2026-06-05T18:55:19.000Z') })];
    const res = assembleDigest(input({ claimRows: rows, relRows: [rel] }));
    expect(res.summary.content).toMatch(/relationship change/);
    // The relationship's source doc is rolled into the digest citations.
    expect(res.summary.citations.some((c) => c.sourceDocumentId === DOC_RUST)).toBe(true);
  });
});

describe('assembleDigest — fact-version changes (the canonical change unit)', () => {
  it('surfaces a new fact version recorded in the window even when no claim/relationship changed', () => {
    // The bitemporal core case: an entity had a fact version recorded since the cutoff, but no
    // claim row moved. The delta MUST still report a change and cite its provenance.
    const fv = factVersion({ id: 'fv1', recorded_at: new Date('2026-06-05T18:59:11.000Z') });
    const res = assembleDigest(input({ claimRows: [], factVersionRows: [fv] }));

    expect(res.summary.content).not.toMatch(/No recorded changes/);
    expect(res.summary.content).toMatch(/new fact version/);
    // Its backing source document is cited at the digest level.
    expect(res.summary.citations.some((c) => c.sourceDocumentId === DOC_FV)).toBe(true);
    expect(res.summary.citations.find((c) => c.sourceDocumentId === DOC_FV)?.url).toBe(
      'https://blog.rust-lang.org/2026/06/05/state-change',
    );
    // Freshness reflects the fact-version recorded_at (the newest transaction time).
    expect(res.freshness.lastUpdated).toBe('2026-06-05T18:59:11.000Z');
  });

  it('reports a supersession when an in-window version was closed (is_current=false)', () => {
    // write_fact_versions closes the old row (is_current=false, superseded_by_id=new) and inserts a
    // new current row. Both land in the window; we count the closing as one supersession event.
    const oldRow = factVersion({
      id: 'fv_old',
      recorded_at: new Date('2026-06-02T00:00:00.000Z'),
      is_current: false,
      superseded_by_id: 'fv_new',
      superseded_at: new Date('2026-06-05T00:00:00.000Z'),
    });
    const newRow = factVersion({ id: 'fv_new', recorded_at: new Date('2026-06-05T00:00:00.000Z') });
    const res = assembleDigest(input({ claimRows: [], factVersionRows: [oldRow, newRow] }));

    expect(res.summary.content).toMatch(/superseded/);
    // The same subject is not also double-counted as a new assertion.
    expect(res.summary.content).not.toMatch(/new fact version/);
  });

  it('classifies a supersession-across-the-cutoff (only the new current row in-window) via priorVersionSubjectIds', () => {
    // The canonical cross-cutoff case. The real pipeline (write_fact_versions) inserts the new
    // current row at `now` and closes the OLD row in place WITHOUT changing its recorded_at — so the
    // closed predecessor's recorded_at predates the cutoff and is filtered out of the window. Only
    // the new current row (is_current=true, superseded_by_id=null) is visible. Classifying from the
    // in-window row alone would mislabel this a "new fact version"; the structural signal that the
    // subject already had a pre-cutoff version (priorVersionSubjectIds) correctly marks it superseded.
    const newCurrent = factVersion({
      id: 'fv_new',
      recorded_at: new Date('2026-06-05T20:00:00.000Z'),
      is_current: true,
      superseded_by_id: null,
    });
    const res = assembleDigest(
      input({
        claimRows: [],
        factVersionRows: [newCurrent],
        priorVersionSubjectIds: [ENT_RUST],
      }),
    );
    expect(res.summary.content).toMatch(/superseded/);
    // It must NOT be double-reported as a new assertion.
    expect(res.summary.content).not.toMatch(/new fact version/);
    expect(res.freshness.lastUpdated).toBe('2026-06-05T20:00:00.000Z');
  });

  it('a genuinely-new subject (no prior version) is a new assertion, not a supersession', () => {
    const newCurrent = factVersion({
      id: 'fv_new',
      recorded_at: new Date('2026-06-05T20:00:00.000Z'),
      is_current: true,
      superseded_by_id: null,
    });
    // priorVersionSubjectIds empty → the subject is brand new in this window.
    const res = assembleDigest(
      input({ claimRows: [], factVersionRows: [newCurrent], priorVersionSubjectIds: [] }),
    );
    expect(res.summary.content).toMatch(/new fact version/);
    expect(res.summary.content).not.toMatch(/superseded/);
  });

  it('fact-version subject entity appears in changedEntities even when last_updated_at is older', () => {
    // buildDelta unions fact-version subjects into the entity fetch; here we model that the entity
    // row is provided (its last_updated_at predates the cutoff) alongside its in-window fact version.
    const ent: EntitiesTable = {
      id: ENT_RUST,
      type_id: 'product',
      canonical_name: 'rust',
      description: null,
      current_state: {},
      importance_score: '0.0',
      first_seen_at: new Date('2026-05-01T00:00:00.000Z'),
      last_updated_at: new Date('2026-05-30T00:00:00.000Z'), // BEFORE the 2026-06-01 cutoff
      is_deprecated: false,
      merged_into_id: null,
      deprecated_at: null,
      deprecation_reason: null,
    };
    const fv = factVersion({ id: 'fv1', recorded_at: new Date('2026-06-05T18:59:11.000Z') });
    const res = assembleDigest(input({ entityRows: [ent], factVersionRows: [fv] }));

    expect(res.changedEntities).toEqual([{ id: ENT_RUST, type: 'product', displayName: 'rust' }]);
  });

  it('empty window with no fact versions still reports no changes (no fabrication)', () => {
    const res = assembleDigest(input({ claimRows: [], factVersionRows: [] }));
    expect(res.summary.content).toMatch(/No recorded changes/);
    expect(res.summary.citations).toEqual([]);
  });
});

// ── Matrix hardening (audit pass 5): explicit coverage for the bitemporal edges the four prior
// passes touched and the cross-subject / cross-axis interactions, so no future regression in the
// classification, double-count, citation-integrity, freshness-across-axes, or budget invariants can
// slip through silently. assembleDigest is the pure surface that owns all of these. ───────────────
describe('assembleDigest — multi-supersession & mixed change sets', () => {
  it('counts a subject superseded MULTIPLE times in the window exactly once (per-subject, not per-row)', () => {
    // Two closings of the SAME subject landed in-window (A→B then B→C). The classifier counts the
    // subject once as superseded and never also as a new assertion. Per-row counting would say "2
    // superseded" and double-report; per-subject is the contract.
    const closedA = factVersion({
      id: 'fv_a',
      recorded_at: new Date('2026-06-02T00:00:00.000Z'),
      is_current: false,
      superseded_by_id: 'fv_b',
      superseded_at: new Date('2026-06-03T00:00:00.000Z'),
    });
    const closedB = factVersion({
      id: 'fv_b',
      recorded_at: new Date('2026-06-03T00:00:00.000Z'),
      is_current: false,
      superseded_by_id: 'fv_c',
      superseded_at: new Date('2026-06-04T00:00:00.000Z'),
    });
    const currentC = factVersion({ id: 'fv_c', recorded_at: new Date('2026-06-04T00:00:00.000Z') });
    const res = assembleDigest(
      input({ claimRows: [], factVersionRows: [closedA, closedB, currentC] }),
    );
    expect(res.summary.content).toMatch(/1 fact superseded/);
    expect(res.summary.content).not.toMatch(/new fact version/);
  });

  it('classifies a mixed batch: one subject superseded (cross-cutoff) + one brand-new, each counted once', () => {
    // Two different subjects in the same window: ENT_RUST is a cross-cutoff supersession (only its new
    // current row is in-window, but it has a prior version), ENT_OTHER is genuinely new. The lede must
    // report exactly "1 fact superseded" AND "1 new fact version", proving per-subject classification
    // does not bleed across subjects.
    const rustNew = factVersion({
      id: 'fv_rust',
      fact_subject_id: ENT_RUST,
      recorded_at: new Date('2026-06-05T20:00:00.000Z'),
    });
    const otherNew = factVersion({
      id: 'fv_other',
      fact_subject_id: ENT_OTHER,
      recorded_at: new Date('2026-06-05T19:00:00.000Z'),
    });
    const res = assembleDigest(
      input({
        claimRows: [],
        factVersionRows: [rustNew, otherNew],
        priorVersionSubjectIds: [ENT_RUST],
      }),
    );
    expect(res.summary.content).toMatch(/1 fact superseded/);
    expect(res.summary.content).toMatch(/1 new fact version/);
  });

  it('a subject hit by BOTH supersession signals (in-window closed row AND a prior version) counts once', () => {
    // Belt-and-suspenders: the subject has an in-window closed predecessor (signal a) AND is listed in
    // priorVersionSubjectIds (signal b). It must still be a single supersession, never doubled.
    const closed = factVersion({
      id: 'fv_old',
      recorded_at: new Date('2026-06-02T00:00:00.000Z'),
      is_current: false,
      superseded_by_id: 'fv_new',
      superseded_at: new Date('2026-06-05T00:00:00.000Z'),
    });
    const current = factVersion({
      id: 'fv_new',
      recorded_at: new Date('2026-06-05T00:00:00.000Z'),
    });
    const res = assembleDigest(
      input({
        claimRows: [],
        factVersionRows: [closed, current],
        priorVersionSubjectIds: [ENT_RUST],
      }),
    );
    expect(res.summary.content).toMatch(/1 fact superseded/);
    expect(res.summary.content).not.toMatch(/new fact version/);
  });
});

describe('assembleDigest — freshness across both bitemporal axes', () => {
  it('lastUpdated is the fact-version recorded_at when it is newer than every changed claim', () => {
    const oldClaim = claim({ id: 'c1', created_at: new Date('2026-06-03T00:00:00.000Z') });
    const newerFv = factVersion({ id: 'fv1', recorded_at: new Date('2026-06-05T23:00:00.000Z') });
    const res = assembleDigest(input({ claimRows: [oldClaim], factVersionRows: [newerFv] }));
    expect(res.freshness.lastUpdated).toBe('2026-06-05T23:00:00.000Z');
  });

  it('lastUpdated is the claim created_at when it is newer than every fact version', () => {
    const newerClaim = claim({ id: 'c1', created_at: new Date('2026-06-06T00:00:00.000Z') });
    const olderFv = factVersion({ id: 'fv1', recorded_at: new Date('2026-06-05T00:00:00.000Z') });
    const res = assembleDigest(input({ claimRows: [newerClaim], factVersionRows: [olderFv] }));
    expect(res.freshness.lastUpdated).toBe('2026-06-06T00:00:00.000Z');
  });
});

describe('assembleDigest — citation integrity under trimming', () => {
  it('a budget-trimmed claim does NOT contribute its source doc to the digest citations', () => {
    // Citations roll up only INCLUDED items. A claim trimmed out by the budget whose ONLY backing doc
    // is unique to it must be absent from the digest citations — otherwise the lede would cite
    // provenance for a change it does not actually show.
    const kept = claim({
      id: 'kept',
      created_at: new Date('2026-06-05T20:00:00.000Z'),
      source_document_ids: [DOC_RUST],
      normalized_text: 'Kept short.',
    });
    const trimmed = claim({
      id: 'trimmed',
      created_at: new Date('2026-06-05T19:00:00.000Z'),
      source_document_ids: [DOC_OTHER],
      normalized_text: `This trimmed change is intentionally very long ${'x'.repeat(400)} so the budget cannot fit it after the kept one.`,
    });
    // Budget large enough for lede + the first (kept) line, too small for the long second one.
    const res = assembleDigest(input({ claimRows: [kept, trimmed], budget: 200 }));
    expect(res.changedClaims).toHaveLength(1);
    expect(res.changedClaims[0]?.id).toBe('kept');
    const cited = res.summary.citations.map((c) => c.sourceDocumentId);
    expect(cited).toContain(DOC_RUST);
    expect(cited).not.toContain(DOC_OTHER);
  });
});

describe('assembleDigest — token budget invariant under a dominant lede', () => {
  it('never emits a claim line when the lede + footer reserve already consumes a tiny budget, and stays bounded', () => {
    // The lede cost is reserved BEFORE trimming (audit pass 2 fix). With the minimum budget and a
    // large change set, the rendered content must still not exceed the budget, and the omission must
    // be reported honestly rather than overshooting.
    const rows = Array.from({ length: 30 }, (_, i) =>
      claim({
        id: `c${i}`,
        created_at: new Date(2026, 5, 5, 18, 55, 40 - i),
        normalized_text: `Change ${i} with enough text to matter for the per-line token cost here.`,
      }),
    );
    const budget = 200; // MIN_TOKEN_BUDGET
    const res = assembleDigest(input({ claimRows: rows, budget }));
    const estTokens = Math.ceil(res.summary.content.length / 4);
    expect(estTokens).toBeLessThanOrEqual(budget);
    expect(res.changedClaims.length).toBeLessThan(rows.length);
    expect(res.summary.content).toMatch(/omitted/);
  });
});

describe('assembleDigest — until passthrough (bounded vs unbounded window)', () => {
  it('emits the until field when the window is bounded', () => {
    const until = new Date('2026-06-04T00:00:00.000Z');
    const res = assembleDigest(
      input({
        until,
        claimRows: [claim({ id: 'c1', created_at: new Date('2026-06-03T00:00:00.000Z') })],
      }),
    );
    expect(res.until).toBe('2026-06-04T00:00:00.000Z');
  });

  it('omits the until field when the window is unbounded', () => {
    const res = assembleDigest(
      input({
        until: undefined,
        claimRows: [claim({ id: 'c1', created_at: new Date('2026-06-03T00:00:00.000Z') })],
      }),
    );
    expect(res.until).toBeUndefined();
  });
});
