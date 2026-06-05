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
 * COVERAGE (entity): corroboration breadth, grounded in the real corpus, not a fabricated target.
 *   - An entity with NO active claims has no recorded knowledge → coverage 0 (explicit thin/no-data).
 *   - Otherwise coverage = distinct backing source documents / total corpus source documents,
 *     clamped to [0,1]. This is literally the contract's definition ("fraction of expected sources
 *     currently covered"): the denominator is the corpus Intercal actually has, so the metric is
 *     self-calibrating — single-source entities read as thin, multi-source corroborated entities
 *     read as strong, and the value rises only as real corroborating sources arrive. Nothing here
 *     can over-state coverage: you cannot cite more distinct sources than exist.
 *
 * STALENESS / WARNINGS: a single human-readable label that distinguishes the states the plan's exit
 * criteria require — strong, stale, and thin coverage — and makes known gaps explicit:
 *   - unknown topic           → "no entity known; <corpus recency>"  (explicit no-data)
 *   - entity, 0 claims        → "no recorded knowledge"              (explicit gap)
 *   - entity, stale recording → "<age>; stale" past the stale threshold
 *   - entity, thin coverage   → "<age>; thin coverage (1 source)"   (single-source warning)
 *   - entity, fresh + covered → "<age>"
 */
import type { components } from '@intercal/shared';

type S = components['schemas'];

export interface FreshnessParams {
  topic_or_entity: string;
}

const DAY_MS = 86_400_000;
// Recordings older than this (in transaction time) are flagged "stale" in the staleness label.
// 30 days matches the resource-budget cadence assumption that an actively-tracked topic is
// re-ingested at least monthly; older than that and an agent should treat the answer as aging.
const STALE_AFTER_DAYS = 30;
// Coverage at/below this fraction is flagged "thin" — the substrate has corroboration from only a
// small share of the corpus for this target, so an agent should weight the answer accordingly.
const THIN_COVERAGE = 0.34;

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
  /** Distinct source documents backing those active claims (corroboration breadth). */
  distinctSourceCount: number;
  /** Total source documents in the corpus — the coverage denominator. */
  corpusSourceCount: number;
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
      ingestAge === 'today' ? 'corpus last ingested today' : `corpus last ingested ${ingestAge} ago`;
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

  // Coverage: corroboration breadth grounded in the real corpus. 0 claims ⇒ 0 (no recorded
  // knowledge — an explicit gap, not a fabricated number). Otherwise distinct backing sources over
  // the corpus size, clamped to [0,1]. Cannot over-state: distinct sources ≤ corpus size.
  const coverage =
    signals.activeClaimCount === 0 || signals.corpusSourceCount === 0
      ? 0
      : Math.min(1, signals.distinctSourceCount / signals.corpusSourceCount);

  // Staleness label distinguishes the states the plan's exit criteria require — strong / stale /
  // thin — and makes gaps explicit. Order: no-knowledge gap first, then stale, then thin, else fresh.
  let staleness: string;
  if (signals.activeClaimCount === 0) {
    staleness = updatedAge
      ? `${updatedAge}; no recorded knowledge (entity present but no claims yet)`
      : 'no recorded knowledge (entity present but no claims yet)';
  } else {
    const parts: string[] = [];
    if (updatedAge) parts.push(updatedAge);
    if (ageDays > STALE_AFTER_DAYS) parts.push('stale');
    if (coverage <= THIN_COVERAGE) {
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
