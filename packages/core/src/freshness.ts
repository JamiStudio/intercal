/**
 * `getFreshness` body — "what does Intercal know about X, how fresh is it, and where is coverage
 * weak?" (Plan 03 W7 — Freshness and coverage).
 *
 * DESIGN: deterministic and honesty-first. Every number is read from real substrate state; an
 * absence of knowledge is reported as an explicit gap (coverage 0, a "no recorded knowledge"
 * staleness label), NEVER as invented coverage. This is the AGENTS.md provenance rule applied to
 * the freshness surface: coverage/freshness must reflect REAL substrate state.
 *
 * The contract's `FreshnessReport` is sufficient — it already carries the two dimensions W7 owns:
 *   - FRESHNESS: `lastUpdated` (entity transaction-time recency) / `lastIngestedAt` (corpus ingest
 *     recency) + a human `staleness` label.
 *   - COVERAGE: `coverage` ∈ [0,1] — "fraction of expected sources currently covered" — plus the
 *     gap/warning text folded into `staleness` (the contract's only free-text channel). No contract
 *     field is added; W7 is implemented entirely against the existing shape.
 *
 * TEMPORAL AXIS: freshness uses TRANSACTION time — when Intercal *recorded* what it knows. For an
 * entity that is the newer of the entity row's `last_updated_at` and the newest `fact_versions`
 * `recorded_at` for that subject (the authoritative append-only change record, written as the final
 * pipeline stage and therefore reliably ≥ `last_updated_at` — consistent with delta.ts).
 *
 * COVERAGE (entity) = EVIDENCE DEPTH: the fraction of the entity's active claims that are backed by
 * at least one source document. coverage = evidenced active claims / total active claims, in [0,1].
 *
 *   WHY THIS, NOT distinct-sources / corpus-size (the metric this audit replaced):
 *   The contract field is "fraction of expected sources currently covered". The previous
 *   implementation read that as (distinct docs backing the entity) / (TOTAL corpus docs). That is
 *   not an honest per-entity coverage signal:
 *     1. It DEGRADES WITH CORPUS GROWTH. At 10k docs with 1 about the entity, coverage → ~0.0001
 *        even if every one of the entity's claims is perfectly sourced. The number says "barely
 *        covered" while the entity is fully covered — actively misleading to an agent.
 *     2. It CARRIES NO PER-ENTITY SIGNAL at small scale. Verified on production Neon (3-doc corpus):
 *        ALL 52 claim-bearing entities scored an identical 0.333 (each drawn from 1 of 3 docs),
 *        regardless of how many well-evidenced claims they had. A 6-claim entity and a 2-claim
 *        entity read the same. It measured the corpus, not the entity.
 *   Evidence depth fixes both: it is bounded [0,1] by construction (evidenced ≤ total claims), it is
 *   INVARIANT to corpus growth (no corpus denominator), and it answers the question the agent is
 *   actually asking — "how much of what Intercal asserts about this target is source-backed?". A
 *   claim without evidence is the real coverage gap, and that is exactly what this measures. It can
 *   never over-state: you cannot have more evidenced claims than claims. This is the AGENTS.md
 *   provenance invariant ("every public fact must trace to evidence") made into a measurable ratio.
 *
 *   - An entity with NO active claims has no recorded knowledge → coverage 0 (explicit gap).
 *   - Otherwise coverage = evidenced active claims / total active claims.
 *
 * CORROBORATION BREADTH (the "thin" warning) is a SEPARATE, also-non-degrading signal: how many
 * DISTINCT source documents back the entity (a count, never a corpus ratio). A single-source entity
 * is flagged "thin" so an agent weights a one-source answer accordingly — this is independent of
 * evidence depth (an entity can be fully evidenced yet single-sourced, which is the common early
 * state) and, being a raw count, stays meaningful at any corpus scale.
 *
 * STALENESS / WARNINGS: a single human-readable label that distinguishes the states the plan's exit
 * criteria require — strong, stale, and thin coverage — and makes known gaps explicit:
 *   - unknown topic               → "no entity known; <corpus recency>"   (explicit no-data)
 *   - entity, 0 claims            → "no recorded knowledge"               (explicit gap)
 *   - entity, stale recording     → "<age>; stale" past the stale threshold
 *   - entity, unevidenced claims  → "<age>; N of M claims unsourced"      (evidence-depth gap)
 *   - entity, single-source       → "<age>; thin coverage (1 source)"     (breadth warning)
 *   - entity, fresh + corroborated→ "<age>"
 */
import type { components } from '@intercal/shared';

type S = components['schemas'];

export interface FreshnessParams {
  topic_or_entity: string;
}

const DAY_MS = 86_400_000;
// Recordings older than this (in transaction time) are flagged "stale" in the staleness label.
// Tied to the resource-budget ingestion cadence (`INGEST_CRON=0 */6 * * *`, every 6h): an actively
// tracked topic is re-touched on the order of hours, so 30 days without ANY new transaction-time
// write is ~120 missed ingestion windows — well past the point where an agent should treat the
// answer as aging. It is a deliberately conservative "no longer actively maintained" floor, not a
// per-source freshness SLA. The threshold is a named constant so it can track the cadence if the
// budget changes (see docs/operations/resource-budget.md).
const STALE_AFTER_DAYS = 30;
// Corroboration breadth at/below this DISTINCT-SOURCE COUNT is flagged "thin": the entity rests on a
// single source document, so an agent should weight a one-source answer accordingly. This is a raw
// count, NOT a corpus ratio — it stays meaningful at any corpus scale (unlike a fraction that would
// shrink as the corpus grows). 1 = single-sourced; ≥2 = corroborated.
const THIN_SOURCE_COUNT = 1;

/** Human age label for a transaction-time instant, or undefined when there is none. */
function age(from: Date | null): string | undefined {
  if (!from) return undefined;
  const days = Math.floor((Date.now() - from.getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/**
 * The raw substrate signals a freshness report is assembled from. Fetched by `buildFreshness`;
 * fed to the pure `assembleFreshness` so the coverage/staleness logic is unit-testable without a DB.
 */
export interface EntityFreshnessSignals {
  kind: 'entity';
  canonicalName: string;
  /** Entity row transaction-time recency. */
  lastUpdatedAt: Date;
  /** Newest fact-version transaction time for this subject, if any (authoritative change axis). */
  latestFactVersionAt: Date | null;
  /** Count of active claims about the entity (subject or object). 0 ⇒ no recorded knowledge. */
  activeClaimCount: number;
  /**
   * Active claims about the entity that are backed by ≥1 source document. The coverage numerator;
   * `evidencedClaimCount / activeClaimCount` is the entity's evidence depth. By construction
   * `evidencedClaimCount ≤ activeClaimCount`, so coverage can never exceed 1.
   */
  evidencedClaimCount: number;
  /**
   * Distinct source documents backing the entity's active claims (corroboration breadth, a raw
   * count). Drives the single-source "thin" warning; independent of evidence depth and corpus size.
   */
  distinctSourceCount: number;
}

export interface UnknownFreshnessSignals {
  kind: 'unknown';
  /** Echoed back as the report target. */
  topic: string;
  /** Newest corpus ingest time, if the corpus is non-empty. */
  lastIngestedAt: Date | null;
}

export type FreshnessSignals = EntityFreshnessSignals | UnknownFreshnessSignals;

/**
 * Pure assembly of a `FreshnessReport` from already-fetched signals. Separated from the DB fetch so
 * the coverage and staleness/gap logic is deterministic and unit-testable. Honesty-first: an absent
 * signal becomes an explicit gap, never an invented value.
 */
export function assembleFreshness(signals: FreshnessSignals): S['FreshnessReport'] {
  if (signals.kind === 'unknown') {
    // Topic is not a known entity: explicit no-data. We still report the corpus's ingest recency so
    // the agent knows how current Intercal's overall knowledge is, but coverage for THIS target is
    // unambiguously 0 — Intercal knows nothing specific about it.
    const ingestAge = age(signals.lastIngestedAt);
    // `age` returns "today" for same-day ingest, which doesn't compose with "… ago" — phrase it
    // separately so the label always reads naturally ("… ingested today" vs "… ingested 3 days ago").
    const ingestPhrase =
      ingestAge === 'today'
        ? 'corpus last ingested today'
        : `corpus last ingested ${ingestAge} ago`;
    const staleness =
      ingestAge !== undefined
        ? `no entity known; ${ingestPhrase}`
        : 'no entity known; no sources ingested';
    return {
      target: signals.topic,
      ...(signals.lastIngestedAt ? { lastIngestedAt: signals.lastIngestedAt.toISOString() } : {}),
      coverage: 0,
      staleness,
    };
  }

  // Authoritative transaction-time recency = newer of the entity row and its newest fact version.
  const lastUpdated =
    signals.latestFactVersionAt && signals.latestFactVersionAt > signals.lastUpdatedAt
      ? signals.latestFactVersionAt
      : signals.lastUpdatedAt;
  const updatedAge = age(lastUpdated);
  const ageDays = Math.floor((Date.now() - lastUpdated.getTime()) / DAY_MS);

  // Coverage = EVIDENCE DEPTH: fraction of the entity's active claims that are source-backed. 0
  // claims ⇒ 0 (no recorded knowledge — an explicit gap, not a fabricated number). Otherwise
  // evidenced / total active claims. Corpus-growth invariant and cannot over-state: evidenced ≤
  // total by construction. (See file header for why this replaced the old distinct/corpus ratio.)
  const coverage =
    signals.activeClaimCount === 0
      ? 0
      : Math.min(1, signals.evidencedClaimCount / signals.activeClaimCount);

  // Staleness label distinguishes the states the plan's exit criteria require — strong / stale /
  // thin — and makes gaps explicit. Order: no-knowledge gap first, then stale, then an
  // evidence-depth gap (unsourced claims), then a single-source breadth warning, else fresh.
  let staleness: string;
  if (signals.activeClaimCount === 0) {
    staleness = updatedAge
      ? `${updatedAge}; no recorded knowledge (entity present but no claims yet)`
      : 'no recorded knowledge (entity present but no claims yet)';
  } else {
    const parts: string[] = [];
    if (updatedAge) parts.push(updatedAge);
    if (ageDays > STALE_AFTER_DAYS) parts.push('stale');
    const unsourced = signals.activeClaimCount - signals.evidencedClaimCount;
    if (unsourced > 0) {
      // Evidence-depth gap: some of what Intercal asserts about this entity is not source-backed.
      // This is the real "where is coverage weak" signal — surfaced explicitly, never hidden.
      parts.push(`${unsourced} of ${signals.activeClaimCount} claims unsourced`);
    } else if (signals.distinctSourceCount <= THIN_SOURCE_COUNT) {
      // Fully evidenced but resting on a single document: corroboration is thin. Distinct from the
      // evidence-depth gap above (which is the stronger warning), so only shown when depth is full.
      const n = signals.distinctSourceCount;
      parts.push(`thin coverage (${n} source${n === 1 ? '' : 's'})`);
    }
    staleness = parts.join('; ');
  }

  return {
    target: signals.canonicalName,
    lastUpdated: lastUpdated.toISOString(),
    coverage,
    staleness,
  };
}
