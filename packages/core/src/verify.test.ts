/**
 * Unit tests for the pure claim-verification logic (`classify` + `assembleVerification`).
 *
 * These cover the verdict / confidence / evidence-classification / token-budget logic that turns
 * already-retrieved, classified candidate claims into a `ClaimVerificationResponse` — without a live
 * database. The SQL retrieval path (`buildVerification`: FTS retrieval, point-in-time bitemporal
 * filtering, substrate-contradiction join) is exercised end-to-end by the live Neon integration
 * verification, not here — the same split delta.test.ts uses.
 */
import { describe, expect, it } from 'vitest';
import type { ClaimsTable } from './db/types.js';
import {
  type AssembleVerifyInput,
  assembleVerification,
  type Candidate,
  classify,
  type RankedClaim,
  type VerifyDocMeta,
} from './verify.js';

const DOC_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const DOC_B = 'aaaaaaaa-0000-0000-0000-000000000002';

function claim(overrides: Partial<ClaimsTable> & { id: string }): ClaimsTable {
  return {
    subject_entity_id: null,
    subject_text: 'Rust 1.96.0',
    predicate: 'released_on',
    object_text: '2026-05-28',
    object_entity_id: null,
    qualifiers: {},
    normalized_text: 'Rust 1.96.0 was released on 2026-05-28.',
    raw_quote: null,
    valid_from: null,
    valid_until: null,
    extraction_confidence: '0.90',
    source_document_ids: [DOC_A],
    contradiction_status: 'none',
    status: 'active',
    created_at: new Date('2026-05-28T00:00:00.000Z'),
    updated_at: new Date('2026-05-28T00:00:00.000Z'),
    ...overrides,
  };
}

const docMeta: VerifyDocMeta[] = [
  {
    id: DOC_A,
    url: 'https://blog.rust-lang.org/1.96.0',
    published_at: new Date('2026-05-28T00:00:00.000Z'),
  },
  {
    id: DOC_B,
    url: 'https://example.org/other',
    published_at: new Date('2026-05-20T00:00:00.000Z'),
  },
];

function input(overrides: Partial<AssembleVerifyInput> = {}): AssembleVerifyInput {
  return {
    claimText: 'Rust 1.96.0 was released',
    asOf: undefined,
    budget: 1500,
    candidates: [],
    docMeta,
    ...overrides,
  };
}

function candidate(overrides: Partial<Candidate> & { claim: ClaimsTable }): Candidate {
  return {
    relevance: 0.5,
    overlap: 0.5,
    stance: 'support',
    weight: 0.45,
    ...overrides,
  };
}

// ── classify ──────────────────────────────────────────────────────────────────────────────────
describe('classify — deterministic stance', () => {
  const userTokens = new Set(['rust', '1.96.0', 'released']);

  it('an overlapping, same-polarity claim SUPPORTS', () => {
    const ranked: RankedClaim = { claim: claim({ id: 'c1' }), relevance: 0.4 };
    const c = classify(userTokens, false, ranked, false);
    expect(c.stance).toBe('support');
    expect(c.weight).toBeCloseTo(0.4 * 0.9);
  });

  it('a polarity flip over overlapping content CONTRADICTS', () => {
    const ranked: RankedClaim = {
      claim: claim({ id: 'c2', normalized_text: 'Rust 1.96.0 was not released.' }),
      relevance: 0.4,
    };
    const c = classify(userTokens, false, ranked, false);
    expect(c.stance).toBe('contradict');
  });

  it('a substrate-recorded contradiction CONTRADICTS regardless of polarity', () => {
    const ranked: RankedClaim = { claim: claim({ id: 'c3' }), relevance: 0.4 };
    const c = classify(userTokens, false, ranked, true);
    expect(c.stance).toBe('contradict');
  });

  it('a negated sentence with no real content overlap does NOT flip to contradict', () => {
    const ranked: RankedClaim = {
      claim: claim({ id: 'c4', normalized_text: 'Cargo cannot fetch unrelated dependencies.' }),
      relevance: 0.4,
    };
    const c = classify(userTokens, false, ranked, false);
    expect(c.stance).toBe('support');
  });
});

// ── assembleVerification — verdicts ─────────────────────────────────────────────────────────────
describe('assembleVerification — verdict', () => {
  it('no evidence → unverified, zero confidence, no fabricated citations', () => {
    const res = assembleVerification(input({ candidates: [] }));
    expect(res.verdict).toBe('unverified');
    expect(res.confidence.score).toBe(0);
    expect(res.supportingEvidence).toEqual([]);
    expect(res.contradictingEvidence).toEqual([]);
    expect(res.confidence.method).toBe('evidence_match');
  });

  it('support only → supported, cited', () => {
    const res = assembleVerification(
      input({ candidates: [candidate({ claim: claim({ id: 'c1' }), weight: 0.8 })] }),
    );
    expect(res.verdict).toBe('supported');
    expect(res.confidence.score).toBeCloseTo(0.8);
    expect(res.supportingEvidence[0]?.sourceDocumentId).toBe(DOC_A);
    expect(res.supportingEvidence[0]?.url).toBe('https://blog.rust-lang.org/1.96.0');
    expect(res.contradictingEvidence).toEqual([]);
  });

  it('contradiction only → contradicted, cited on the contradicting side', () => {
    const res = assembleVerification(
      input({
        candidates: [
          candidate({
            claim: claim({ id: 'c1', source_document_ids: [DOC_B] }),
            stance: 'contradict',
            weight: 0.7,
          }),
        ],
      }),
    );
    expect(res.verdict).toBe('contradicted');
    expect(res.contradictingEvidence[0]?.sourceDocumentId).toBe(DOC_B);
    expect(res.supportingEvidence).toEqual([]);
  });

  it('contested but net-supported (>=60% support mass) → partially_supported', () => {
    const res = assembleVerification(
      input({
        candidates: [
          candidate({ claim: claim({ id: 's1' }), stance: 'support', weight: 0.8 }),
          candidate({ claim: claim({ id: 's2' }), stance: 'support', weight: 0.7 }),
          candidate({
            claim: claim({ id: 'x1', source_document_ids: [DOC_B] }),
            stance: 'contradict',
            weight: 0.3,
          }),
        ],
      }),
    );
    expect(res.verdict).toBe('partially_supported');
    expect(res.supportingEvidence.length).toBeGreaterThan(0);
    expect(res.contradictingEvidence.length).toBeGreaterThan(0);
  });

  it('contested and contradiction-dominant (<60% support mass) → contradicted', () => {
    const res = assembleVerification(
      input({
        candidates: [
          candidate({ claim: claim({ id: 's1' }), stance: 'support', weight: 0.2 }),
          candidate({
            claim: claim({ id: 'x1', source_document_ids: [DOC_B] }),
            stance: 'contradict',
            weight: 0.9,
          }),
        ],
      }),
    );
    expect(res.verdict).toBe('contradicted');
  });
});

// ── assembleVerification — point-in-time + budget ───────────────────────────────────────────────
describe('assembleVerification — as_of passthrough', () => {
  it('emits asOf when supplied', () => {
    const asOf = new Date('2026-05-01T00:00:00.000Z');
    const res = assembleVerification(
      input({ asOf, candidates: [candidate({ claim: claim({ id: 'c1' }) })] }),
    );
    expect(res.asOf).toBe('2026-05-01T00:00:00.000Z');
  });

  it('omits asOf when not supplied', () => {
    const res = assembleVerification(
      input({ candidates: [candidate({ claim: claim({ id: 'c1' }) })] }),
    );
    expect(res.asOf).toBeUndefined();
  });
});

describe('assembleVerification — token budget', () => {
  it('bounds the cited evidence to the budget without changing the verdict', () => {
    // Many distinct supporting docs, tiny budget: must trim citations but stay "supported".
    const candidates = Array.from({ length: 40 }, (_, i) =>
      candidate({
        claim: claim({
          id: `c${i}`,
          source_document_ids: [`dddddddd-0000-0000-0000-${String(i).padStart(12, '0')}`],
        }),
        weight: 0.9 - i * 0.01,
      }),
    );
    const res = assembleVerification(input({ candidates, budget: 200 }));
    expect(res.verdict).toBe('supported'); // verdict computed over the FULL set, unaffected by trim
    expect(res.supportingEvidence.length).toBeLessThan(40);
    expect(res.supportingEvidence.length).toBeGreaterThan(0);
    // Most-decisive citation (highest weight, c0) survives the trim.
    expect(res.supportingEvidence[0]?.sourceDocumentId).toBe(
      'dddddddd-0000-0000-0000-000000000000',
    );
  });

  it('deduplicates a source document cited by multiple claims on the same side', () => {
    const res = assembleVerification(
      input({
        candidates: [
          candidate({ claim: claim({ id: 'c1', source_document_ids: [DOC_A] }), weight: 0.8 }),
          candidate({ claim: claim({ id: 'c2', source_document_ids: [DOC_A] }), weight: 0.7 }),
        ],
      }),
    );
    expect(res.supportingEvidence).toHaveLength(1);
    expect(res.supportingEvidence[0]?.sourceDocumentId).toBe(DOC_A);
  });
});
