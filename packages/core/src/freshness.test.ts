/**
 * Unit tests for the pure freshness/coverage logic (`assembleFreshness`).
 *
 * These cover the coverage computation and the staleness/gap label that turn already-fetched
 * substrate signals into a `FreshnessReport` — without a live database. The SQL fetch path
 * (`getFreshness` in queries.ts: entity resolution, claim/fact-version/corpus counts) is exercised
 * end-to-end by the live Neon integration verification, not here — the same fetch/pure split
 * delta.test.ts and verify.test.ts use.
 *
 * Coverage semantic under test = EVIDENCE DEPTH (evidenced active claims / total active claims),
 * which is corpus-growth invariant — NOT the old distinct-sources / corpus-size ratio (replaced in
 * the W7 audit because it degraded to ~0 as the corpus grew and carried no per-entity signal at
 * small scale; see freshness.ts header). Honesty-first invariants asserted: an unknown topic and a
 * claim-less entity both report coverage 0 with an explicit gap label (never invented coverage),
 * coverage can never exceed 1, and an unsourced claim is surfaced as an explicit evidence-depth gap.
 */
import { describe, expect, it } from 'vitest';
import { assembleFreshness, type EntityFreshnessSignals } from './freshness.js';

function entitySignals(overrides: Partial<EntityFreshnessSignals> = {}): EntityFreshnessSignals {
  return {
    kind: 'entity',
    canonicalName: 'rust',
    lastUpdatedAt: new Date(),
    latestFactVersionAt: null,
    activeClaimCount: 2,
    evidencedClaimCount: 2,
    distinctSourceCount: 1,
    ...overrides,
  };
}

describe('assembleFreshness — unknown topic', () => {
  it('reports explicit no-data: coverage 0 and a "no entity known" label', () => {
    const r = assembleFreshness({
      kind: 'unknown',
      topic: 'nonexistent-topic',
      lastIngestedAt: new Date(Date.now() - 2 * 86_400_000),
    });
    expect(r.target).toBe('nonexistent-topic');
    expect(r.coverage).toBe(0);
    expect(r.lastUpdated).toBeUndefined();
    expect(r.lastIngestedAt).toBeDefined();
    expect(r.staleness).toContain('no entity known');
  });

  it('phrases a same-day corpus ingest naturally ("ingested today", not "today ago")', () => {
    const r = assembleFreshness({ kind: 'unknown', topic: 'x', lastIngestedAt: new Date() });
    expect(r.staleness).toBe('no entity known; corpus last ingested today');
  });

  it('reports an empty corpus honestly when nothing has been ingested', () => {
    const r = assembleFreshness({ kind: 'unknown', topic: 'x', lastIngestedAt: null });
    expect(r.coverage).toBe(0);
    expect(r.lastIngestedAt).toBeUndefined();
    expect(r.staleness).toBe('no entity known; no sources ingested');
  });
});

describe('assembleFreshness — entity coverage (evidence depth)', () => {
  it('claim-less entity → coverage 0 with an explicit "no recorded knowledge" gap', () => {
    const r = assembleFreshness(
      entitySignals({ activeClaimCount: 0, evidencedClaimCount: 0, distinctSourceCount: 0 }),
    );
    expect(r.coverage).toBe(0);
    expect(r.staleness).toContain('no recorded knowledge');
  });

  it('coverage = evidenced active claims / total active claims', () => {
    const r = assembleFreshness(
      entitySignals({ activeClaimCount: 4, evidencedClaimCount: 2, distinctSourceCount: 2 }),
    );
    expect(r.coverage).toBe(0.5);
  });

  it('fully-evidenced entity → coverage 1 (cannot over-state: evidenced ≤ total)', () => {
    const r = assembleFreshness(
      entitySignals({ activeClaimCount: 9, evidencedClaimCount: 9, distinctSourceCount: 3 }),
    );
    expect(r.coverage).toBe(1);
  });

  it('is invariant to corpus growth — same depth gives same coverage regardless of corpus size', () => {
    // The defect this metric fixed: the old distinct/corpus ratio would change here; evidence depth
    // does not. A 5-of-5 evidenced entity reads 1.0 whether the corpus has 5 docs or 50,000.
    const r = assembleFreshness(
      entitySignals({ activeClaimCount: 5, evidencedClaimCount: 5, distinctSourceCount: 1 }),
    );
    expect(r.coverage).toBe(1);
  });

  it('unsourced claims → surfaced as an explicit evidence-depth gap', () => {
    const r = assembleFreshness(
      entitySignals({ activeClaimCount: 4, evidencedClaimCount: 3, distinctSourceCount: 2 }),
    );
    expect(r.coverage).toBe(0.75);
    expect(r.staleness).toContain('1 of 4 claims unsourced');
  });
});

describe('assembleFreshness — staleness / warning labels', () => {
  it('fresh, fully-evidenced, corroborated entity → just the age, no warnings', () => {
    const r = assembleFreshness(
      entitySignals({
        lastUpdatedAt: new Date(),
        activeClaimCount: 5,
        evidencedClaimCount: 5,
        distinctSourceCount: 3,
      }),
    );
    expect(r.coverage).toBe(1);
    expect(r.staleness).toBe('today');
  });

  it('recording older than the stale threshold → "stale"', () => {
    const old = new Date(Date.now() - 45 * 86_400_000);
    const r = assembleFreshness(
      entitySignals({
        lastUpdatedAt: old,
        activeClaimCount: 5,
        evidencedClaimCount: 5,
        distinctSourceCount: 3,
      }),
    );
    expect(r.staleness).toContain('stale');
  });

  it('fully evidenced but single-source → "thin coverage (1 source)" breadth warning', () => {
    const r = assembleFreshness(
      entitySignals({
        lastUpdatedAt: new Date(),
        activeClaimCount: 2,
        evidencedClaimCount: 2,
        distinctSourceCount: 1,
      }),
    );
    expect(r.coverage).toBe(1); // depth is full…
    expect(r.staleness).toContain('thin coverage (1 source)'); // …but breadth is thin
  });

  it('evidence-depth gap takes precedence over the single-source breadth warning', () => {
    // When claims are unsourced, the stronger (depth) warning is shown and the breadth one is not —
    // they would otherwise be redundant for a thin, partially-sourced entity.
    const r = assembleFreshness(
      entitySignals({
        lastUpdatedAt: new Date(),
        activeClaimCount: 3,
        evidencedClaimCount: 1,
        distinctSourceCount: 1,
      }),
    );
    expect(r.staleness).toContain('2 of 3 claims unsourced');
    expect(r.staleness).not.toContain('thin coverage');
  });
});

describe('assembleFreshness — transaction-time recency', () => {
  it('uses the newer of last_updated_at and the newest fact version', () => {
    const older = new Date('2026-06-01T00:00:00.000Z');
    const newer = new Date('2026-06-05T00:00:00.000Z');
    const r = assembleFreshness(
      entitySignals({ lastUpdatedAt: older, latestFactVersionAt: newer }),
    );
    expect(r.lastUpdated).toBe(newer.toISOString());
  });

  it('falls back to last_updated_at when there is no newer fact version', () => {
    const updated = new Date('2026-06-05T00:00:00.000Z');
    const olderFv = new Date('2026-06-02T00:00:00.000Z');
    const r = assembleFreshness(
      entitySignals({ lastUpdatedAt: updated, latestFactVersionAt: olderFv }),
    );
    expect(r.lastUpdated).toBe(updated.toISOString());
  });
});
