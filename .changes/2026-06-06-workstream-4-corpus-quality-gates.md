feat(core): add corpus quality gates

Adds executable Workstream 4 corpus quality gates over canonical source, claim, evidence,
contradiction, and review tables, plus a dev verifier with rollback-only first-proof seeded data.
The gates measure source-class, topic-cluster, date-range, entity, citation-depth,
contradiction-state, and review-needed coverage before public corpus claims can broaden.
