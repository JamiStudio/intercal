import { describe, expect, it } from 'vitest';
import {
  type CorpusQualityReport,
  evaluateCorpusQualityReport,
  FIRST_PROOF_CORPUS_QUALITY_CONFIG,
} from './corpus-quality.js';

function passingReport(): CorpusQualityReport {
  return {
    generatedAt: '2026-06-06T00:00:00.000Z',
    sourceClasses: [
      { key: 'research', count: 1 },
      { key: 'model_provider', count: 1 },
      { key: 'protocol', count: 1 },
      { key: 'registry', count: 1 },
      { key: 'release_notes', count: 1 },
    ],
    topicClusters: [
      { key: 'frontier_llms', count: 5 },
      { key: 'model_context_protocol', count: 1 },
      { key: 'open_weight_models', count: 1 },
    ],
    dateRanges: [
      {
        key: 'gpt-era-start',
        from: '2022-11-01T00:00:00Z',
        to: '2023-12-31T23:59:59Z',
        documentCount: 2,
      },
      {
        key: 'current-frontier',
        from: '2024-01-01T00:00:00Z',
        to: '2026-06-06T23:59:59Z',
        documentCount: 3,
      },
    ],
    entities: ['ChatGPT', 'Claude', 'Gemini', 'Llama', 'MCP protocol'].map((name) => ({
      name,
      activeClaimCount: 1,
      citationCount: 1,
      documentCount: 1,
      latestClaimRecordedAt: '2024-01-01T00:00:00.000Z',
    })),
    activeClaimCount: 6,
    evidencedActiveClaimCount: 6,
    citationCount: 6,
    unsourcedActiveClaimRate: 0,
    averageCitationsPerActiveClaim: 1,
    openContradictionCount: 1,
    openReviewRecordCount: 1,
    reviewNeededRate: 1 / 6,
  };
}

describe('evaluateCorpusQualityReport', () => {
  it('passes when every configured gate is met', () => {
    const evaluation = evaluateCorpusQualityReport(
      passingReport(),
      FIRST_PROOF_CORPUS_QUALITY_CONFIG,
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.checks.every((check) => check.passed)).toBe(true);
  });

  it('fails explicitly on missing coverage and over-limit review debt', () => {
    const report = passingReport();
    report.sourceClasses = report.sourceClasses.filter((item) => item.key !== 'protocol');
    report.entities = report.entities.map((entity) =>
      entity.name === 'MCP protocol' ? { ...entity, citationCount: 0 } : entity,
    );
    report.openReviewRecordCount = 3;
    report.reviewNeededRate = 0.5;

    const evaluation = evaluateCorpusQualityReport(report, FIRST_PROOF_CORPUS_QUALITY_CONFIG);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.checks.find((check) => check.key === 'source-class:protocol')?.passed).toBe(
      false,
    );
    expect(
      evaluation.checks.find((check) => check.key === 'entity-citations:MCP protocol')?.passed,
    ).toBe(false);
    expect(evaluation.checks.find((check) => check.key === 'review-needed:rate')?.passed).toBe(
      false,
    );
  });
});
