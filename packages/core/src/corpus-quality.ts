import { sql } from 'kysely';
import type { Db } from './db/client.js';

export interface CountMetric {
  key: string;
  count: number;
}

export interface DateRangeCoverageMetric {
  key: string;
  from: string;
  to: string;
  documentCount: number;
}

export interface EntityCoverageMetric {
  name: string;
  activeClaimCount: number;
  citationCount: number;
  documentCount: number;
  latestClaimRecordedAt?: string;
}

export interface CorpusQualityReport {
  generatedAt: string;
  sourceClasses: CountMetric[];
  topicClusters: CountMetric[];
  dateRanges: DateRangeCoverageMetric[];
  entities: EntityCoverageMetric[];
  activeClaimCount: number;
  evidencedActiveClaimCount: number;
  citationCount: number;
  unsourcedActiveClaimRate: number;
  averageCitationsPerActiveClaim: number;
  openContradictionCount: number;
  openReviewRecordCount: number;
  reviewNeededRate: number;
}

export interface CorpusDateRangeGate {
  key: string;
  from: string;
  to: string;
  minDocuments: number;
}

export interface CorpusEntityGate {
  name: string;
  minActiveClaims: number;
  minCitations: number;
}

export interface CorpusQualityGateConfig {
  requiredSourceClasses: Record<string, number>;
  requiredTopicClusters: Record<string, number>;
  dateRanges: CorpusDateRangeGate[];
  requiredEntities: CorpusEntityGate[];
  minAverageCitationsPerActiveClaim: number;
  maxUnsourcedActiveClaimRate: number;
  minOpenContradictions: number;
  maxReviewNeededRate: number;
}

export interface CorpusQualityCheck {
  key: string;
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface CorpusQualityEvaluation {
  passed: boolean;
  checks: CorpusQualityCheck[];
}

export const FIRST_PROOF_CORPUS_QUALITY_CONFIG: CorpusQualityGateConfig = {
  requiredSourceClasses: {
    research: 1,
    model_provider: 1,
    protocol: 1,
    registry: 1,
    release_notes: 1,
  },
  requiredTopicClusters: {
    frontier_llms: 5,
    model_context_protocol: 1,
    open_weight_models: 1,
  },
  dateRanges: [
    {
      key: 'gpt-era-start',
      from: '2022-11-01T00:00:00Z',
      to: '2023-12-31T23:59:59Z',
      minDocuments: 2,
    },
    {
      key: 'current-frontier',
      from: '2024-01-01T00:00:00Z',
      to: '2026-06-06T23:59:59Z',
      minDocuments: 3,
    },
  ],
  requiredEntities: [
    { name: 'ChatGPT', minActiveClaims: 1, minCitations: 1 },
    { name: 'Claude', minActiveClaims: 1, minCitations: 1 },
    { name: 'Gemini', minActiveClaims: 1, minCitations: 1 },
    { name: 'Llama', minActiveClaims: 1, minCitations: 1 },
    { name: 'MCP protocol', minActiveClaims: 1, minCitations: 1 },
  ],
  minAverageCitationsPerActiveClaim: 1,
  maxUnsourcedActiveClaimRate: 0,
  minOpenContradictions: 1,
  maxReviewNeededRate: 0.2,
};

export const FULL_AI_HISTORY_CORPUS_QUALITY_CONFIG: CorpusQualityGateConfig = {
  requiredSourceClasses: {
    benchmark: 5,
    developer_ecosystem: 5,
    infrastructure: 5,
    model_provider: 10,
    policy_regulatory: 5,
    protocol: 3,
    registry: 5,
    release_notes: 10,
    research: 10,
  },
  requiredTopicClusters: {
    agent_tooling: 5,
    benchmarks: 5,
    deployment_infrastructure: 5,
    development_cycles: 5,
    frontier_llms: 10,
    ml_research: 10,
    model_architecture: 5,
    model_context_protocol: 3,
    open_weight_models: 5,
    regulation: 5,
  },
  dateRanges: [
    {
      key: '2022-2023',
      from: '2022-11-01T00:00:00Z',
      to: '2023-12-31T23:59:59Z',
      minDocuments: 10,
    },
    { key: '2024', from: '2024-01-01T00:00:00Z', to: '2024-12-31T23:59:59Z', minDocuments: 10 },
    {
      key: '2025-2026',
      from: '2025-01-01T00:00:00Z',
      to: '2026-06-06T23:59:59Z',
      minDocuments: 10,
    },
  ],
  requiredEntities: [
    { name: 'ChatGPT', minActiveClaims: 3, minCitations: 3 },
    { name: 'Claude', minActiveClaims: 3, minCitations: 3 },
    { name: 'Gemini', minActiveClaims: 3, minCitations: 3 },
    { name: 'Llama', minActiveClaims: 3, minCitations: 3 },
    { name: 'MCP protocol', minActiveClaims: 3, minCitations: 3 },
  ],
  minAverageCitationsPerActiveClaim: 1,
  maxUnsourcedActiveClaimRate: 0.05,
  minOpenContradictions: 1,
  maxReviewNeededRate: 0.15,
};

function countByKey(rows: CountMetric[]): Map<string, number> {
  return new Map(rows.map((row) => [row.key, row.count]));
}

function check(
  checks: CorpusQualityCheck[],
  key: string,
  label: string,
  passed: boolean,
  expected: string,
  actual: string,
) {
  checks.push({ key, label, passed, expected, actual });
}

export function evaluateCorpusQualityReport(
  report: CorpusQualityReport,
  config: CorpusQualityGateConfig,
): CorpusQualityEvaluation {
  const checks: CorpusQualityCheck[] = [];
  const sourceClasses = countByKey(report.sourceClasses);
  const topicClusters = countByKey(report.topicClusters);
  const dateRanges = new Map(report.dateRanges.map((range) => [range.key, range]));
  const entities = new Map(report.entities.map((entity) => [entity.name.toLowerCase(), entity]));

  for (const [sourceClass, minCount] of Object.entries(config.requiredSourceClasses)) {
    const actual = sourceClasses.get(sourceClass) ?? 0;
    check(
      checks,
      `source-class:${sourceClass}`,
      `source class ${sourceClass}`,
      actual >= minCount,
      `>= ${minCount} documents`,
      `${actual} documents`,
    );
  }

  for (const [topicCluster, minCount] of Object.entries(config.requiredTopicClusters)) {
    const actual = topicClusters.get(topicCluster) ?? 0;
    check(
      checks,
      `topic-cluster:${topicCluster}`,
      `topic cluster ${topicCluster}`,
      actual >= minCount,
      `>= ${minCount} claims`,
      `${actual} claims`,
    );
  }

  for (const requiredRange of config.dateRanges) {
    const actual = dateRanges.get(requiredRange.key)?.documentCount ?? 0;
    check(
      checks,
      `date-range:${requiredRange.key}`,
      `date range ${requiredRange.key}`,
      actual >= requiredRange.minDocuments,
      `>= ${requiredRange.minDocuments} documents`,
      `${actual} documents`,
    );
  }

  for (const requiredEntity of config.requiredEntities) {
    const actual = entities.get(requiredEntity.name.toLowerCase());
    check(
      checks,
      `entity-claims:${requiredEntity.name}`,
      `entity ${requiredEntity.name} active claims`,
      (actual?.activeClaimCount ?? 0) >= requiredEntity.minActiveClaims,
      `>= ${requiredEntity.minActiveClaims} active claims`,
      `${actual?.activeClaimCount ?? 0} active claims`,
    );
    check(
      checks,
      `entity-citations:${requiredEntity.name}`,
      `entity ${requiredEntity.name} citations`,
      (actual?.citationCount ?? 0) >= requiredEntity.minCitations,
      `>= ${requiredEntity.minCitations} citations`,
      `${actual?.citationCount ?? 0} citations`,
    );
  }

  check(
    checks,
    'citation-depth:average',
    'average citations per active claim',
    report.averageCitationsPerActiveClaim >= config.minAverageCitationsPerActiveClaim,
    `>= ${config.minAverageCitationsPerActiveClaim}`,
    report.averageCitationsPerActiveClaim.toFixed(2),
  );
  check(
    checks,
    'citation-depth:unsourced-rate',
    'unsourced active claim rate',
    report.unsourcedActiveClaimRate <= config.maxUnsourcedActiveClaimRate,
    `<= ${config.maxUnsourcedActiveClaimRate}`,
    report.unsourcedActiveClaimRate.toFixed(3),
  );
  check(
    checks,
    'contradictions:open',
    'open contradiction coverage',
    report.openContradictionCount >= config.minOpenContradictions,
    `>= ${config.minOpenContradictions} open contradictions`,
    `${report.openContradictionCount} open contradictions`,
  );
  check(
    checks,
    'review-needed:rate',
    'review-needed rate',
    report.reviewNeededRate <= config.maxReviewNeededRate,
    `<= ${config.maxReviewNeededRate}`,
    report.reviewNeededRate.toFixed(3),
  );

  return { passed: checks.every((item) => item.passed), checks };
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export async function queryCorpusQualityReport(
  db: Db,
  config: CorpusQualityGateConfig,
): Promise<CorpusQualityReport> {
  const [
    sourceClassRows,
    topicClusterRows,
    activeClaimRow,
    evidencedClaimRow,
    citationRow,
    contradictionRow,
    reviewRow,
  ] = await Promise.all([
    db
      .selectFrom('source_documents')
      .innerJoin('sources', 'sources.id', 'source_documents.source_id')
      .select((eb) => [
        sql<string>`coalesce(${eb.ref('sources.metadata')}->>'source_class', ${eb.ref('source_documents.metadata')}->>'source_class', ${eb.ref('sources.source_type')})`.as(
          'key',
        ),
        eb.fn.count<string>('source_documents.id').as('count'),
      ])
      .groupBy('key')
      .orderBy('key')
      .execute(),
    db
      .selectFrom('claims')
      .select((eb) => [
        sql<string>`coalesce(${eb.ref('claims.metadata')}->>'topic_cluster', 'unclassified')`.as(
          'key',
        ),
        eb.fn.count<string>('claims.id').as('count'),
      ])
      .where('claims.status', '=', 'active')
      .groupBy('key')
      .orderBy('key')
      .execute(),
    db
      .selectFrom('claims')
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .where('status', '=', 'active')
      .executeTakeFirst(),
    db
      .selectFrom('claims')
      .innerJoin('claim_evidence', 'claim_evidence.claim_id', 'claims.id')
      .select((eb) => eb.fn.count<string>(sql`distinct ${eb.ref('claims.id')}`).as('count'))
      .where('claims.status', '=', 'active')
      .executeTakeFirst(),
    db
      .selectFrom('claims')
      .innerJoin('claim_evidence', 'claim_evidence.claim_id', 'claims.id')
      .select((eb) => eb.fn.count<string>('claim_evidence.id').as('count'))
      .where('claims.status', '=', 'active')
      .executeTakeFirst(),
    db
      .selectFrom('claim_contradictions')
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .where('resolution_status', '=', 'open')
      .executeTakeFirst(),
    db
      .selectFrom('review_records')
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .where('status', 'in', ['received', 'reviewing'])
      .executeTakeFirst(),
  ]);

  const dateRanges = await Promise.all(
    config.dateRanges.map(async (range) => {
      const row = await db
        .selectFrom('source_documents')
        .select((eb) => eb.fn.count<string>('id').as('count'))
        .where('published_at', '>=', new Date(range.from))
        .where('published_at', '<=', new Date(range.to))
        .executeTakeFirst();
      return {
        key: range.key,
        from: range.from,
        to: range.to,
        documentCount: asNumber(row?.count),
      };
    }),
  );

  const entities = await Promise.all(
    config.requiredEntities.map(async (requiredEntity) => {
      const pattern = `%${requiredEntity.name}%`;
      const rows = await db
        .selectFrom('claims')
        .leftJoin('claim_evidence', 'claim_evidence.claim_id', 'claims.id')
        .leftJoin('source_documents', 'source_documents.id', 'claim_evidence.document_id')
        .select((eb) => [
          eb.fn.count<string>(sql`distinct ${eb.ref('claims.id')}`).as('activeClaimCount'),
          eb.fn.count<string>('claim_evidence.id').as('citationCount'),
          eb.fn.count<string>(sql`distinct ${eb.ref('source_documents.id')}`).as('documentCount'),
          eb.fn.max<Date>('claims.created_at').as('latestClaimRecordedAt'),
        ])
        .where('claims.status', '=', 'active')
        .where((eb) =>
          eb.or([
            eb('claims.subject_text', 'ilike', pattern),
            eb('claims.object_text', 'ilike', pattern),
            eb('claims.normalized_text', 'ilike', pattern),
          ]),
        )
        .executeTakeFirst();

      const latest = rows?.latestClaimRecordedAt as Date | null | undefined;
      return {
        name: requiredEntity.name,
        activeClaimCount: asNumber(rows?.activeClaimCount),
        citationCount: asNumber(rows?.citationCount),
        documentCount: asNumber(rows?.documentCount),
        ...(latest ? { latestClaimRecordedAt: latest.toISOString() } : {}),
      };
    }),
  );

  const activeClaimCount = asNumber(activeClaimRow?.count);
  const evidencedActiveClaimCount = asNumber(evidencedClaimRow?.count);
  const citationCount = asNumber(citationRow?.count);
  const openReviewRecordCount = asNumber(reviewRow?.count);

  return {
    generatedAt: new Date().toISOString(),
    sourceClasses: sourceClassRows.map((row) => ({ key: row.key, count: asNumber(row.count) })),
    topicClusters: topicClusterRows.map((row) => ({ key: row.key, count: asNumber(row.count) })),
    dateRanges,
    entities,
    activeClaimCount,
    evidencedActiveClaimCount,
    citationCount,
    unsourcedActiveClaimRate:
      activeClaimCount === 0
        ? 1
        : (activeClaimCount - evidencedActiveClaimCount) / activeClaimCount,
    averageCitationsPerActiveClaim: activeClaimCount === 0 ? 0 : citationCount / activeClaimCount,
    openContradictionCount: asNumber(contradictionRow?.count),
    openReviewRecordCount,
    reviewNeededRate: activeClaimCount === 0 ? 1 : openReviewRecordCount / activeClaimCount,
  };
}
