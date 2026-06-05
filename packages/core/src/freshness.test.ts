/**
 * Unit tests for the pure freshness/coverage logic (`assembleFreshness`).
 *
 * These cover the coverage computation and the staleness/gap label that turn already-fetched
 * substrate signals into a `FreshnessReport` — without a live database. The SQL fetch path
 * (`getFreshness` in queries.ts: entity resolution, claim/fact-version/corpus counts) is exercised
 * end-to-end by the live Neon integration verification, not here — the same fetch/pure split
 * delta.test.ts and verify.test.ts use.
 *
 * Honesty-first invariants asserted: an unknown topic and a claim-less entity both report coverage
 * 0 with an explicit gap label (never invented coverage), and coverage can never exceed 1.
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
    distinctSourceCount: 1,
    corpusSourceCount: 3,
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

describe('assembleFreshness — entity coverage', () => {
  it('claim-less entity → coverage 0 with an explicit "no recorded knowledge" gap', () => {
    const r = assembleFreshness(entitySignals({ activeClaimCount: 0, distinctSourceCount: 0 }));
    expect(r.coverage).toBe(0);
    expect(r.staleness).toContain('no recorded knowledge');
  });

  it('coverage = distinct backing sources / corpus size', () => {
    const r = assembleFreshness(
      entitySignals({ activeClaimCount: 4, distinctSourceCount: 2, corpusSourceCount: 4 }),
    );
    expect(r.coverage).toBe(0.5);
  });

  it('coverage is clamped to 1 and never over-states (distinct ≤ corpus by construction)', () => {
    const r = assembleFreshness(
      entitySignals({ activeClaimCount: 9, distinctSourceCount: 9, corpusSourceCount: 9 }),
    );
    expect(r.coverage).toBe(1);
  });

  it('zero corpus size → coverage 0, not a divide-by-zero', () => {
    const r = assembleFreshness(
      entitySignals({ activeClaimCount: 1, distinctSourceCount: 0, corpusSourceCount: 0 }),
    );
    expect(r.coverage).toBe(0);
  });
});

describe('assembleFreshness — staleness / warning labels', () => {
  it('fresh, well-covered entity → just the age, no warnings', () => {
    const r = assembleFreshness(
      entitySignals({
        lastUpdatedAt: new Date(),
        activeClaimCount: 5,
        distinctSourceCount: 3,
        corpusSourceCount: 3,
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
        distinctSourceCount: 3,
        corpusSourceCount: 3,
      }),
    );
    expect(r.staleness).toContain('stale');
  });

  it('single-source entity → "thin coverage (1 source)" warning', () => {
    const r = assembleFreshness(
      entitySignals({
        lastUpdatedAt: new Date(),
        activeClaimCount: 2,
        distinctSourceCount: 1,
        corpusSourceCount: 3,
      }),
    );
    expect(r.coverage).toBeCloseTo(1 / 3, 5);
    expect(r.staleness).toContain('thin coverage (1 source)');
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
